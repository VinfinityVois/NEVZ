"""
Anomaly Detector — обнаружение срывов, отклонений и критических ситуаций.
Работает быстро и без тяжёлых моделей.
"""

from typing import Dict, List, Optional, Any, Set
from datetime import datetime, timedelta
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)


class AnomalyDetector:
    """
    Обнаруживает проблемы в выполнении плана:
    - Срывы сроков
    - Отставание от критического пути
    - Перегрузка бригад
    - Простой / отсутствие прогресса
    - Выход оборудования/людей из строя (по данным actual)
    """

    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {}
        
        # Пороги (можно вынести в конфиг)
        self.delay_threshold_days = self.config.get("delay_threshold_days", 2.0)
        self.critical_delay_days = self.config.get("critical_delay_days", 5.0)
        self.progress_stall_days = self.config.get("progress_stall_days", 3.0)
        self.overload_ratio = self.config.get("overload_ratio", 1.15)

    def detect(
        self,
        plan: Dict[str, Any],
        actual: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Главный метод обнаружения аномалий.
        
        plan   — текущий план (результат scheduler.build_schedule)
        actual — фактические данные:
            {
                "tasks": [
                    {
                        "id": "T1",
                        "status": "in_progress" | "completed" | "delayed" | "blocked",
                        "progress": 0.65,          # 0..1
                        "actual_start": "2026-...",
                        "actual_end": null,
                        "reported_at": "2026-...",
                        "delay_reason": "поломка оборудования",
                        "blocked_by": null
                    },
                    ...
                ],
                "brigades": [...],          # опционально
                "resources": [...],         # опционально
                "timestamp": "2026-..."
            }
        """
        plan_tasks = {t["id"]: t for t in plan.get("tasks", [])}
        actual_tasks = {t["id"]: t for t in actual.get("tasks", [])}
        
        now = datetime.fromisoformat(actual["timestamp"]) if actual.get("timestamp") else datetime.now()
        
        anomalies = {
            "has_critical": False,
            "has_warning": False,
            "affected_tasks": [],
            "delays": {},                    # task_id → extra_days
            "reasons": [],
            "details": [],
            "summary": {
                "delayed": 0,
                "blocked": 0,
                "stalled": 0,
                "overdue_critical": 0,
                "completed_on_time": 0
            }
        }

        critical_ids = set(plan.get("critical_path_ids", []))

        for task_id, plan_task in plan_tasks.items():
            actual_task = actual_tasks.get(task_id)
            
            if not actual_task:
                # Нет фактических данных — пропускаем или считаем риском
                continue

            result = self._analyze_single_task(
                plan_task=plan_task,
                actual_task=actual_task,
                now=now,
                is_critical=task_id in critical_ids
            )

            if result["severity"] == "critical":
                anomalies["has_critical"] = True
                anomalies["affected_tasks"].append(task_id)
                anomalies["delays"][task_id] = result.get("extra_days", 3)
                anomalies["reasons"].append(result["reason"])
                anomalies["details"].append(result)
                
                if result["type"] == "overdue" and task_id in critical_ids:
                    anomalies["summary"]["overdue_critical"] += 1
                elif result["type"] == "blocked":
                    anomalies["summary"]["blocked"] += 1
                elif result["type"] == "stalled":
                    anomalies["summary"]["stalled"] += 1
                else:
                    anomalies["summary"]["delayed"] += 1

            elif result["severity"] == "warning":
                anomalies["has_warning"] = True
                anomalies["details"].append(result)
                anomalies["summary"]["delayed"] += 1

            elif result["type"] == "completed_on_time":
                anomalies["summary"]["completed_on_time"] += 1

        # Дополнительно: проверка перегрузки бригад по факту
        brigade_anomalies = self._check_brigade_overload(plan, actual)
        if brigade_anomalies:
            anomalies["details"].extend(brigade_anomalies)
            if any(a["severity"] == "critical" for a in brigade_anomalies):
                anomalies["has_critical"] = True

        # Итоговый статус
        if anomalies["has_critical"]:
            anomalies["status"] = "critical"
            anomalies["message"] = f"Обнаружены критические отклонения ({len(anomalies['affected_tasks'])} задач)"
        elif anomalies["has_warning"]:
            anomalies["status"] = "warning"
            anomalies["message"] = "Есть отклонения, требуется внимание"
        else:
            anomalies["status"] = "ok"
            anomalies["message"] = "Критических отклонений не обнаружено"

        anomalies["detected_at"] = now.isoformat()
        return anomalies

    def _analyze_single_task(
        self,
        plan_task: Dict,
        actual_task: Dict,
        now: datetime,
        is_critical: bool
    ) -> Dict[str, Any]:
        """Анализ одной задачи"""
        status = actual_task.get("status", "unknown")
        progress = float(actual_task.get("progress", 0.0))
        
        plan_start = self._parse_date(plan_task.get("start"))
        plan_end = self._parse_date(plan_task.get("end"))
        actual_start = self._parse_date(actual_task.get("actual_start"))
        reported_at = self._parse_date(actual_task.get("reported_at")) or now

        base = {
            "task_id": plan_task["id"],
            "task_name": plan_task.get("name"),
            "is_critical": is_critical,
            "plan_end": plan_task.get("end"),
            "status": status,
            "progress": progress
        }

        # 1. Задача заблокирована
        if status == "blocked":
            return {
                **base,
                "type": "blocked",
                "severity": "critical",
                "reason": actual_task.get("delay_reason") or actual_task.get("blocked_by") or "Задача заблокирована",
                "extra_days": self.critical_delay_days,
                "suggestion": "Снять блокировку или переназначить ресурсы"
            }

        # 2. Задача завершена
        if status == "completed":
            actual_end = self._parse_date(actual_task.get("actual_end")) or reported_at
            if actual_end and plan_end and actual_end > plan_end + timedelta(days=self.delay_threshold_days):
                delay = (actual_end - plan_end).days
                return {
                    **base,
                    "type": "completed_late",
                    "severity": "warning" if not is_critical else "critical",
                    "reason": f"Завершена с опозданием на {delay} дн.",
                    "extra_days": delay,
                    "suggestion": "Учесть опоздание в последующих работах"
                }
            return {
                **base,
                "type": "completed_on_time",
                "severity": "ok",
                "reason": "Завершена вовремя"
            }

        # 3. Задача в работе — проверяем отставание
        if status in ("in_progress", "started"):
            # Ожидаемый прогресс
            if plan_start and plan_end and plan_end > plan_start:
                total_days = (plan_end - plan_start).days or 1
                elapsed = max(0, (now - plan_start).days)
                expected_progress = min(1.0, elapsed / total_days)
            else:
                expected_progress = 0.5

            lag = expected_progress - progress

            # Сильное отставание
            if lag > 0.25 or (plan_end and now > plan_end):
                extra = max(
                    self.delay_threshold_days,
                    int(lag * (plan_task.get("duration", 5)))
                )
                severity = "critical" if (is_critical or lag > 0.4 or (plan_end and now > plan_end + timedelta(days=2))) else "warning"
                
                return {
                    **base,
                    "type": "delayed",
                    "severity": severity,
                    "reason": actual_task.get("delay_reason") or f"Отставание прогресса ({progress:.0%} вместо {expected_progress:.0%})",
                    "extra_days": extra,
                    "expected_progress": round(expected_progress, 2),
                    "suggestion": "Ускорить работу или перераспределить ресурсы"
                }

            # Застой (нет прогресса несколько дней)
            last_update = reported_at
            if (now - last_update).days >= self.progress_stall_days and progress < 0.95:
                return {
                    **base,
                    "type": "stalled",
                    "severity": "critical" if is_critical else "warning",
                    "reason": f"Нет прогресса более {self.progress_stall_days} дней",
                    "extra_days": self.delay_threshold_days,
                    "suggestion": "Проверить статус бригады / оборудования"
                }

        # 4. Задача ещё не начата, но срок старта прошёл
        if status in ("planned", "not_started", "pending"):
            if plan_start and now > plan_start + timedelta(days=self.delay_threshold_days):
                return {
                    **base,
                    "type": "not_started_late",
                    "severity": "critical" if is_critical else "warning",
                    "reason": "Не начата вовремя",
                    "extra_days": (now - plan_start).days,
                    "suggestion": "Срочно запустить или переназначить"
                }

        # Всё в порядке
        return {
            **base,
            "type": "ok",
            "severity": "ok",
            "reason": "В пределах нормы"
        }

    def _check_brigade_overload(
        self,
        plan: Dict,
        actual: Dict
    ) -> List[Dict]:
        """Простая проверка перегрузки бригад по фактическим данным"""
        results = []
        # Можно расширить, если в actual приходят данные по загрузке
        return results

    def _parse_date(self, value) -> Optional[datetime]:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            return None


# Удобная функция
def detect_anomalies(plan: Dict, actual: Dict, config: Optional[Dict] = None) -> Dict:
    detector = AnomalyDetector(config)
    return detector.detect(plan, actual)