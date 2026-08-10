"""
Scheduler — построение и перестроение планов.
Использует Critical Path Method + Resource Leveling.
Фокус: минимальные изменения при сбоях.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from copy import deepcopy
import logging

logger = logging.getLogger(__name__)

# Импорты из cpm (настоящий CPM)
try:
    from cpm.critical_path import CriticalPathCalculator, calculate_critical_path
    from cpm.resource_leveling import ResourceLeveler
    from cpm.graph_builder import GraphBuilder
    HAS_CPM = True
except ImportError:
    HAS_CPM = False
    logger.warning("Модуль cpm не найден. Используется упрощённый планировщик.")


class Scheduler:
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {}
        self.cpm_calculator = CriticalPathCalculator() if HAS_CPM else None
        self.leveler = ResourceLeveler(
            max_extension_days=self.config.get("max_extension_days", 7.0)
        ) if HAS_CPM else None

    def build_schedule(
        self,
        tasks: List[Dict],
        allocation: Dict,
        horizon: str = "year",
        start_date: Optional[str] = None,
        constraints: Optional[Dict] = None,
        brigades: Optional[List[Dict]] = None,
        do_leveling: bool = True
    ) -> Dict[str, Any]:
        """
        Строит расписание с использованием Critical Path Method.
        
        1. Назначает бригады из allocation
        2. Считает критический путь (ES/EF/LS/LF/Float)
        3. (Опционально) выравнивает загрузку бригад
        4. Переводит относительные дни в реальные даты
        """
        start = datetime.fromisoformat(start_date) if start_date else datetime.now().replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        constraints = constraints or {}
        brigades = brigades or []

        # 1. Проставляем brigade_id из allocation
        tasks_with_brigades = self._apply_allocation(tasks, allocation)

        if not HAS_CPM:
            return self._fallback_schedule(tasks_with_brigades, start, horizon)

        # 2. Расчёт критического пути
        cpm_result = self.cpm_calculator.calculate(tasks_with_brigades)

        # 3. Resource Leveling (если нужно)
        if do_leveling and brigades:
            leveled = self.leveler.level(
                cpm_result=cpm_result,
                brigades=brigades,
                capacity_per_brigade=self._get_capacities(brigades)
            )
            final_tasks = leveled["tasks"]
            leveling_info = {
                "leveled": leveled["leveled"],
                "moved_tasks": leveled.get("moved_tasks", []),
                "extension_days": leveled.get("extension_days", 0),
                "message": leveled.get("message")
            }
        else:
            final_tasks = cpm_result["tasks"]
            leveling_info = {"leveled": False, "message": "Leveling отключён"}

        # 4. Переводим относительные дни → реальные даты
        scheduled_tasks = self._to_real_dates(final_tasks, start)

        # 5. Критический путь в реальных датах
        critical_path = []
        for t in scheduled_tasks:
            if t.get("is_critical"):
                critical_path.append({
                    "id": t["id"],
                    "name": t.get("name"),
                    "start": t["start"],
                    "end": t["end"],
                    "duration": t["duration"],
                    "brigade_id": t.get("brigade_id")
                })

        project_end = max(t["end"] for t in scheduled_tasks) if scheduled_tasks else start.isoformat()

        return {
            "tasks": scheduled_tasks,
            "critical_path": critical_path,
            "critical_path_ids": [t["id"] for t in critical_path],
            "start_date": start.isoformat(),
            "end_date": project_end if isinstance(project_end, str) else project_end,
            "horizon": horizon,
            "total_duration_days": cpm_result["project_duration_days"],
            "leveling": leveling_info,
            "cpm_stats": {
                "total_tasks": cpm_result["total_tasks"],
                "critical_tasks_count": cpm_result["critical_tasks_count"]
            },
            "generated_at": datetime.now().isoformat()
        }

    def replan_minimal(
        self,
        original_plan: Dict,
        anomalies: Dict,
        resources: List[Dict],
        brigades: List[Dict]
    ) -> Dict[str, Any]:
        """
        Перестраивает план с МИНИМАЛЬНЫМИ изменениями.
        
        Стратегия:
        1. Берём исходные задачи
        2. Увеличиваем duration или сдвигаем только затронутые работы
        3. Полностью пересчитываем CPM только на изменённом наборе
        4. Стараемся сохранить назначения бригад
        """
        plan = deepcopy(original_plan)
        tasks = deepcopy(plan.get("tasks", []))
        task_map = {t["id"]: t for t in tasks}

        affected_ids = set(anomalies.get("affected_tasks", []))
        delays = anomalies.get("delays", {})  # {task_id: extra_days}

        changes = {
            "moved_tasks": [],
            "duration_increased": [],
            "reassigned_brigades": [],
            "reason": anomalies.get("reasons", [])
        }

        # 1. Применяем задержки к затронутым задачам
        for task_id in affected_ids:
            task = task_map.get(task_id)
            if not task:
                continue

            extra_days = delays.get(task_id, anomalies.get("default_delay_days", 3))

            # Вариант A: увеличиваем длительность (если работа уже идёт)
            if task.get("status") in ("in_progress", "started"):
                old_duration = task.get("duration", task.get("duration_days", 1))
                task["duration"] = old_duration + extra_days
                task["duration_days"] = task["duration"]
                changes["duration_increased"].append({
                    "task_id": task_id,
                    "old_duration": old_duration,
                    "new_duration": task["duration"]
                })
            else:
                # Вариант B: просто сдвигаем (будет пересчитано через CPM)
                changes["moved_tasks"].append({
                    "task_id": task_id,
                    "extra_days": extra_days
                })

            task["status"] = "rescheduled"
            task["replan_reason"] = "anomaly"

        # 2. Полный пересчёт критического пути на обновлённых задачах
        # Убираем старые es/ef/ls/lf, оставляем только duration и dependencies
        clean_tasks = []
        for t in tasks:
            clean = {
                "id": t["id"],
                "name": t.get("name"),
                "duration_days": t.get("duration", t.get("duration_days", 1)),
                "dependencies": t.get("dependencies", []),
                "brigade_id": t.get("brigade_id"),
                "priority": t.get("priority", 1),
                "status": t.get("status", "planned")
            }
            clean_tasks.append(clean)

        # 3. Строим новый план через CPM
        allocation = plan.get("allocation", {"task_to_brigade": {}})
        # Сохраняем старые назначения
        for t in clean_tasks:
            if t["id"] not in allocation.get("task_to_brigade", {}):
                allocation.setdefault("task_to_brigade", {})[t["id"]] = t.get("brigade_id")

        new_plan = self.build_schedule(
            tasks=clean_tasks,
            allocation=allocation,
            horizon=plan.get("horizon", "year"),
            start_date=plan.get("start_date"),
            brigades=brigades,
            do_leveling=True
        )

        new_plan["changes_summary"] = changes
        new_plan["replanned_at"] = datetime.now().isoformat()
        new_plan["replan_reason"] = anomalies.get("reasons", ["Критическое отклонение"])
        new_plan["original_end_date"] = plan.get("end_date")
        new_plan["status"] = "replanned"

        return new_plan

    # ==================== Вспомогательные методы ====================

    def _apply_allocation(self, tasks: List[Dict], allocation: Dict) -> List[Dict]:
        """Проставляет brigade_id из результата Optimizer"""
        task_to_brigade = allocation.get("task_to_brigade", {})
        result = []
        for t in tasks:
            t = deepcopy(t)
            if t["id"] in task_to_brigade:
                t["brigade_id"] = task_to_brigade[t["id"]]
            result.append(t)
        return result

    def _to_real_dates(self, tasks: List[Dict], start: datetime) -> List[Dict]:
        """Переводит относительные дни (es/ef) в ISO-даты"""
        result = []
        for t in tasks:
            t = deepcopy(t)
            es = t.get("es", 0)
            ef = t.get("ef", es + t.get("duration", 1))

            t["start"] = (start + timedelta(days=es)).isoformat()
            t["end"] = (start + timedelta(days=ef)).isoformat()
            t["start_day"] = es
            t["end_day"] = ef
            result.append(t)
        return result

    def _get_capacities(self, brigades: List[Dict]) -> Dict[str, float]:
        """Извлекает ёмкость бригад"""
        return {
            str(b["id"]): float(b.get("capacity", b.get("max_load", 12.0)))
            for b in brigades
        }

    def _fallback_schedule(
        self,
        tasks: List[Dict],
        start: datetime,
        horizon: str
    ) -> Dict[str, Any]:
        """Упрощённый планировщик, если cpm не доступен"""
        scheduled = []
        current = start
        for task in tasks:
            duration = task.get("duration_days", task.get("duration", 5))
            task_start = current
            task_end = current + timedelta(days=duration)
            scheduled.append({
                **task,
                "start": task_start.isoformat(),
                "end": task_end.isoformat(),
                "es": 0,
                "ef": duration,
                "is_critical": True,
                "status": "planned"
            })
            current = task_end

        return {
            "tasks": scheduled,
            "critical_path": scheduled,
            "critical_path_ids": [t["id"] for t in scheduled],
            "start_date": start.isoformat(),
            "end_date": current.isoformat(),
            "horizon": horizon,
            "total_duration_days": (current - start).days,
            "leveling": {"leveled": False, "message": "Fallback mode"},
            "generated_at": datetime.now().isoformat()
        }