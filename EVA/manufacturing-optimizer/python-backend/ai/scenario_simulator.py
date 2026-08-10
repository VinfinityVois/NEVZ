"""
Scenario Simulator — симуляция сценариев сбоев и «что если».
Позволяет заранее увидеть последствия поломок, нехватки людей и срывов.
"""

from typing import Dict, List, Optional, Any
from copy import deepcopy
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

try:
    from .scheduler import Scheduler
    from .optimizer import Optimizer
    from .bottleneck_analyzer import BottleneckAnalyzer
    from .anomaly_detector import AnomalyDetector
except ImportError:
    from scheduler import Scheduler
    from optimizer import Optimizer
    from bottleneck_analyzer import BottleneckAnalyzer
    from anomaly_detector import AnomalyDetector


class ScenarioSimulator:
    """
    Симулятор сценариев сбоев.
    
    Примеры сценариев:
    - Поломка оборудования на критической работе (+N дней)
    - Выпадение бригады на несколько дней
    - Одновременный срыв нескольких работ
    - Задержка поставки комплектующих
    """

    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {}
        self.scheduler = Scheduler(self.config)
        self.optimizer = Optimizer(self.config)
        self.bottleneck_analyzer = BottleneckAnalyzer(self.config)

    def run_scenario(
        self,
        base_plan: Dict[str, Any],
        scenario: Dict[str, Any],
        brigades: List[Dict],
        resources: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """
        Главный метод симуляции.
        
        scenario = {
            "name": "Поломка сварочного оборудования",
            "description": "...",
            "task_delays": {                # task_id → дополнительные дни
                "T3": 6,
                "T5": 2
            },
            "disabled_brigades": ["B2"],    # бригады, которые недоступны
            "duration_multipliers": {       # опционально: увеличить длительность
                "T3": 1.4
            }
        }
        """
        resources = resources or []
        scenario_name = scenario.get("name", "Безымянный сценарий")
        
        logger.info(f"Running scenario: {scenario_name}")

        # 1. Копируем задачи из базового плана
        original_tasks = deepcopy(base_plan.get("tasks", []))
        task_map = {t["id"]: t for t in original_tasks}

        # 2. Применяем задержки и изменения длительности
        affected = []
        task_delays = scenario.get("task_delays", {})
        duration_multipliers = scenario.get("duration_multipliers", {})

        for task_id, extra_days in task_delays.items():
            if task_id not in task_map:
                continue
            task = task_map[task_id]
            old_duration = task.get("duration", task.get("duration_days", 1))
            
            # Увеличиваем длительность
            new_duration = old_duration + extra_days
            if task_id in duration_multipliers:
                new_duration = old_duration * duration_multipliers[task_id]

            task["duration"] = new_duration
            task["duration_days"] = new_duration
            task["status"] = "simulated_delay"
            task["simulation_extra_days"] = extra_days
            
            affected.append({
                "task_id": task_id,
                "name": task.get("name"),
                "old_duration": old_duration,
                "new_duration": new_duration,
                "extra_days": extra_days
            })

        # 3. Отключаем бригады (переназначаем их задачи)
        disabled_brigades = set(scenario.get("disabled_brigades", []))
        reassigned = []
        
        if disabled_brigades:
            available_brigades = [
                b for b in brigades if str(b["id"]) not in disabled_brigades
            ]
            
            for task in original_tasks:
                b_id = str(task.get("brigade_id", ""))
                if b_id in disabled_brigades:
                    # Переназначаем на наименее загруженную доступную бригаду
                    if available_brigades:
                        # Простое переназначение
                        new_brigade = available_brigades[0]
                        old_brigade = task.get("brigade_id")
                        task["brigade_id"] = new_brigade["id"]
                        reassigned.append({
                            "task_id": task["id"],
                            "from_brigade": old_brigade,
                            "to_brigade": new_brigade["id"]
                        })

        # 4. Собираем allocation заново
        allocation = {
            "task_to_brigade": {
                t["id"]: t.get("brigade_id") for t in original_tasks if t.get("brigade_id")
            }
        }

        # 5. Полный пересчёт плана через Scheduler (CPM + Leveling)
        new_plan = self.scheduler.build_schedule(
            tasks=original_tasks,
            allocation=allocation,
            horizon=base_plan.get("horizon", "month"),
            start_date=base_plan.get("start_date"),
            brigades=brigades,
            do_leveling=True
        )

        # 6. Анализ узких мест нового плана
        bottlenecks = self.bottleneck_analyzer.analyze(
            plan=new_plan,
            brigades=brigades,
            resources=resources
        )
        new_plan["bottlenecks"] = bottlenecks

        # 7. Сравнение с базовым планом
        original_duration = base_plan.get("total_duration_days", 0)
        new_duration = new_plan.get("total_duration_days", 0)
        delay_days = new_duration - original_duration

        original_end = base_plan.get("end_date")
        new_end = new_plan.get("end_date")

        comparison = {
            "original_duration_days": original_duration,
            "new_duration_days": new_duration,
            "delay_days": round(delay_days, 1),
            "original_end_date": original_end,
            "new_end_date": new_end,
            "critical_path_changed": (
                base_plan.get("critical_path_ids") != new_plan.get("critical_path_ids")
            ),
            "original_critical_count": len(base_plan.get("critical_path_ids", [])),
            "new_critical_count": len(new_plan.get("critical_path_ids", [])),
        }

        # 8. Итоговый результат симуляции
        return {
            "success": True,
            "scenario_name": scenario_name,
            "scenario_description": scenario.get("description"),
            "affected_tasks": affected,
            "reassigned_tasks": reassigned,
            "disabled_brigades": list(disabled_brigades),
            "comparison": comparison,
            "new_plan": new_plan,
            "impact_level": self._assess_impact(delay_days),
            "recommendations": self._generate_recommendations(
                delay_days, affected, bottlenecks, disabled_brigades
            ),
            "simulated_at": datetime.now().isoformat()
        }

    def run_multiple_scenarios(
        self,
        base_plan: Dict[str, Any],
        scenarios: List[Dict[str, Any]],
        brigades: List[Dict],
        resources: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """Прогон нескольких сценариев и сравнение"""
        results = []
        
        for sc in scenarios:
            try:
                res = self.run_scenario(base_plan, sc, brigades, resources)
                results.append({
                    "name": sc.get("name"),
                    "delay_days": res["comparison"]["delay_days"],
                    "impact_level": res["impact_level"],
                    "critical_path_changed": res["comparison"]["critical_path_changed"],
                    "full_result": res
                })
            except Exception as e:
                logger.error(f"Scenario failed: {sc.get('name')} — {e}")
                results.append({
                    "name": sc.get("name"),
                    "error": str(e)
                })

        # Сортируем по тяжести последствий
        results.sort(key=lambda x: x.get("delay_days", 999), reverse=True)

        return {
            "success": True,
            "scenarios_count": len(scenarios),
            "results": results,
            "worst_scenario": results[0] if results else None,
            "simulated_at": datetime.now().isoformat()
        }

    def _assess_impact(self, delay_days: float) -> str:
        if delay_days <= 0:
            return "none"
        if delay_days <= 2:
            return "low"
        if delay_days <= 7:
            return "medium"
        if delay_days <= 14:
            return "high"
        return "critical"

    def _generate_recommendations(
        self,
        delay_days: float,
        affected: List[Dict],
        bottlenecks: List[Dict],
        disabled_brigades: List
    ) -> List[Dict]:
        recs = []

        if delay_days > 5:
            recs.append({
                "severity": "high",
                "message": f"Срок проекта сдвигается на {delay_days:.0f} дней",
                "suggestion": "Рассмотреть добавление ресурсов на критические работы или пересмотр приоритетов"
            })

        if disabled_brigades:
            recs.append({
                "severity": "high",
                "message": f"Недоступны бригады: {', '.join(disabled_brigades)}",
                "suggestion": "Подготовить подменные бригады или перекрёстное обучение"
            })

        for bn in bottlenecks[:3]:
            if bn.get("severity") in ("critical", "high"):
                recs.append({
                    "severity": bn["severity"],
                    "message": bn.get("message"),
                    "suggestion": bn.get("suggestion")
                })

        if not recs:
            recs.append({
                "severity": "low",
                "message": "Сценарий не вызывает серьёзных последствий",
                "suggestion": "Можно использовать текущий план"
            })

        return recs


# Готовые шаблоны сценариев для НЭВЗ
def get_predefined_scenarios() -> List[Dict]:
    return [
        {
            "name": "Поломка ключевого оборудования",
            "description": "Выход из строя сварочного/сборочного оборудования на 5–7 дней",
            "task_delays": {},          # пользователь укажет конкретные id
            "disabled_brigades": [],
        },
        {
            "name": "Нехватка комплектующих",
            "description": "Задержка поставки на 4–10 дней",
            "task_delays": {},
            "disabled_brigades": [],
        },
        {
            "name": "Выпадение бригады",
            "description": "Одна бригада недоступна (больничный, отпуск, переброска)",
            "task_delays": {},
            "disabled_brigades": [],    # указать id бригады
        },
        {
            "name": "Массовый срыв на критическом пути",
            "description": "Одновременные проблемы на нескольких критических работах",
            "task_delays": {},
            "disabled_brigades": [],
        }
    ]