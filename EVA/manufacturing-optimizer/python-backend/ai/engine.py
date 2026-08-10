"""
AI Engine — главный оркестратор системы планирования НЭВЗ.
Лёгкий, быстрый, без тяжёлых нейросетей в реальном времени.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Импорты модулей ИИ
from .scheduler import Scheduler
from .optimizer import Optimizer
from .anomaly_detector import AnomalyDetector
from .bottleneck_analyzer import BottleneckAnalyzer

# Predictor пока опциональный
try:
    from .predictor import Predictor
    HAS_PREDICTOR = True
except ImportError:
    HAS_PREDICTOR = False


class AIEngine:
    """
    Главный ИИ-движок для НЭВЗ.
    
    Возможности:
    - Построение планов (год / полгода / месяц)
    - Автоматическое распределение бригад и сотрудников
    - Обнаружение сбоев и критических ситуаций
    - Перестроение плана с минимальными изменениями
    - Поиск узких мест и оптимизация загрузки
    """

    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {}
        
        self.scheduler = Scheduler(self.config)
        self.optimizer = Optimizer(self.config)
        self.anomaly_detector = AnomalyDetector(self.config)
        self.bottleneck_analyzer = BottleneckAnalyzer(self.config)
        
        self.predictor = Predictor(self.config) if HAS_PREDICTOR else None
        
        self.last_plan: Optional[Dict] = None
        self.last_analysis: Optional[Dict] = None
        self.last_anomalies: Optional[Dict] = None

    def build_plan(
        self,
        tasks: List[Dict],
        resources: List[Dict],
        brigades: List[Dict],
        horizon: str = "year",          # year | half_year | month
        start_date: Optional[str] = None,
        constraints: Optional[Dict] = None,
        do_leveling: bool = True
    ) -> Dict[str, Any]:
        """
        Строит оптимальный план на заданный горизонт.
        
        Шаги:
        1. Распределение задач по бригадам (Optimizer)
        2. Построение расписания + Critical Path (Scheduler)
        3. Анализ узких мест (BottleneckAnalyzer)
        """
        logger.info(f"Building plan | horizon={horizon} | tasks={len(tasks)} | brigades={len(brigades)}")
        
        constraints = constraints or {}

        # 1. Оптимизация распределения ресурсов и бригад
        allocation = self.optimizer.allocate(
            tasks=tasks,
            resources=resources,
            brigades=brigades,
            constraints=constraints
        )

        # 2. Построение расписания + критический путь + leveling
        plan = self.scheduler.build_schedule(
            tasks=tasks,
            allocation=allocation,
            horizon=horizon,
            start_date=start_date,
            constraints=constraints,
            brigades=brigades,
            do_leveling=do_leveling
        )

        # 3. Анализ узких мест
        bottlenecks = self.bottleneck_analyzer.analyze(
            plan=plan,
            resources=resources,
            brigades=brigades
        )

        # Собираем итоговый результат
        plan["allocation"] = allocation
        plan["bottlenecks"] = bottlenecks
        plan["horizon"] = horizon
        plan["generated_at"] = datetime.now().isoformat()
        plan["stats"] = {
            "total_tasks": len(tasks),
            "critical_tasks": plan.get("cpm_stats", {}).get("critical_tasks_count", 0),
            "bottlenecks_count": len(bottlenecks),
            "critical_bottlenecks": len([b for b in bottlenecks if b["severity"] == "critical"]),
            "leveling_applied": plan.get("leveling", {}).get("leveled", False)
        }

        self.last_plan = plan
        self.last_analysis = {
            "bottlenecks": bottlenecks,
            "allocation": allocation
        }

        logger.info(
            f"Plan built | duration={plan.get('total_duration_days')}d | "
            f"critical={plan['stats']['critical_tasks']} | "
            f"bottlenecks={plan['stats']['bottlenecks_count']}"
        )
        return plan

    def detect_and_replan(
        self,
        current_plan: Dict,
        actual_data: Dict,
        resources: List[Dict],
        brigades: List[Dict]
    ) -> Dict[str, Any]:
        """
        Главный метод реагирования на критические ситуации.
        
        1. Обнаруживает отклонения и сбои (AnomalyDetector)
        2. Если критично — перестраивает план с минимальными изменениями
        3. Повторно анализирует узкие места
        """
        logger.info("Running anomaly detection + replan check...")

        # 1. Поиск аномалий / срывов
        anomalies = self.anomaly_detector.detect(
            plan=current_plan,
            actual=actual_data
        )
        self.last_anomalies = anomalies

        if not anomalies.get("has_critical"):
            return {
                "status": "ok",
                "message": anomalies.get("message", "Критических отклонений не обнаружено"),
                "anomalies": anomalies,
                "new_plan": None,
                "recommendations": self.get_recommendations(current_plan)
            }

        # 2. Перестроение с минимальными изменениями
        logger.warning(
            f"Critical anomalies detected: {len(anomalies.get('affected_tasks', []))} tasks. Replanning..."
        )

        new_plan = self.scheduler.replan_minimal(
            original_plan=current_plan,
            anomalies=anomalies,
            resources=resources,
            brigades=brigades
        )

        # 3. Повторная оптимизация только затронутых частей (если нужно)
        new_plan = self.optimizer.reoptimize_affected(
            plan=new_plan,
            affected_tasks=anomalies.get("affected_tasks", []),
            resources=resources,
            brigades=brigades
        )

        # 4. Новый анализ узких мест
        new_bottlenecks = self.bottleneck_analyzer.analyze(
            plan=new_plan,
            resources=resources,
            brigades=brigades
        )
        new_plan["bottlenecks"] = new_bottlenecks

        self.last_plan = new_plan

        return {
            "status": "replanned",
            "message": "План перестроен с минимальными изменениями",
            "anomalies": anomalies,
            "changes_summary": new_plan.get("changes_summary", {}),
            "new_plan": new_plan,
            "recommendations": self.get_recommendations(new_plan)
        }

    def get_recommendations(self, plan: Optional[Dict] = None) -> List[Dict]:
        """
        Возвращает рекомендации по улучшению текущего плана.
        Берёт данные из bottleneck-ов + перегрузки.
        """
        plan = plan or self.last_plan
        if not plan:
            return []

        recommendations = []

        # Из узких мест
        for bn in plan.get("bottlenecks", []):
            recommendations.append({
                "type": bn.get("type", "bottleneck"),
                "severity": bn.get("severity", "medium"),
                "message": bn.get("message"),
                "suggestion": bn.get("suggestion"),
                "task_id": bn.get("task_id"),
                "brigade_id": bn.get("brigade_id"),
                "source": "bottleneck_analyzer"
            })

        # Перегрузка бригад (дополнительно)
        try:
            overloaded = self.optimizer.find_overloaded(plan)
            for item in overloaded:
                recommendations.append({
                    "type": "overload",
                    "severity": "high",
                    "message": f"Бригада {item.get('brigade_name', item.get('brigade_id'))} "
                               f"перегружена на {item.get('overload_percent', '?')}%",
                    "suggestion": "Перераспределить задачи или добавить людей",
                    "brigade_id": item.get("brigade_id"),
                    "source": "optimizer"
                })
        except Exception as e:
            logger.debug(f"find_overloaded failed: {e}")

        # Сортируем по важности
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        recommendations.sort(key=lambda x: severity_order.get(x["severity"], 9))

        return recommendations

    def explain_decision(self, decision_id: str = None) -> Dict:
        """
        Простое объяснение последнего решения.
        Позже можно расширить через explainability-модули.
        """
        return {
            "decision_id": decision_id or "last",
            "explanation": "Решение принято на основе критического пути, "
                           "минимизации изменений плана и текущей загрузки бригад",
            "factors": [
                "critical_path",
                "resource_availability",
                "minimal_disruption",
                "brigade_load"
            ],
            "last_plan_generated_at": self.last_plan.get("generated_at") if self.last_plan else None,
            "last_anomalies_status": self.last_anomalies.get("status") if self.last_anomalies else None
        }

    def get_status(self) -> Dict[str, Any]:
        """Текущий статус движка (удобно для дашборда и AI-панели)"""
        return {
            "has_plan": self.last_plan is not None,
            "plan_horizon": self.last_plan.get("horizon") if self.last_plan else None,
            "plan_duration_days": self.last_plan.get("total_duration_days") if self.last_plan else None,
            "critical_tasks": self.last_plan.get("stats", {}).get("critical_tasks") if self.last_plan else 0,
            "bottlenecks": len(self.last_plan.get("bottlenecks", [])) if self.last_plan else 0,
            "last_anomalies_status": self.last_anomalies.get("status") if self.last_anomalies else "unknown",
            "generated_at": self.last_plan.get("generated_at") if self.last_plan else None
        }