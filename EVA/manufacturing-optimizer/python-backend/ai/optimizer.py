"""
Optimizer — распределение бригад, сотрудников и ресурсов.
Использует OR-Tools (лёгкий и быстрый).
"""

from typing import Dict, List, Optional, Any
from copy import deepcopy
import logging

logger = logging.getLogger(__name__)

try:
    from ortools.linear_solver import pywraplp
    HAS_ORTOOLS = True
except ImportError:
    HAS_ORTOOLS = False
    logger.warning("OR-Tools не установлен, используется эвристика")


class Optimizer:
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {}

    def allocate(
        self,
        tasks: List[Dict],
        resources: List[Dict],
        brigades: List[Dict],
        constraints: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Основное распределение задач по бригадам.
        Цель: минимизировать перегрузку и время.
        """
        constraints = constraints or {}
        
        if HAS_ORTOOLS and len(tasks) < 300:  # для небольших/средних задач
            return self._allocate_ortools(tasks, brigades, constraints)
        else:
            return self._allocate_heuristic(tasks, brigades, constraints)

    def _allocate_heuristic(
        self,
        tasks: List[Dict],
        brigades: List[Dict],
        constraints: Dict
    ) -> Dict[str, Any]:
        """Быстрая эвристика (всегда работает)"""
        task_to_brigade = {}
        brigade_load = {b["id"]: 0 for b in brigades}
        
        # Сортируем задачи по приоритету / длительности
        sorted_tasks = sorted(
            tasks,
            key=lambda t: (-t.get("priority", 1), -t.get("duration_days", 1))
        )
        
        for task in sorted_tasks:
            # Выбираем бригаду с минимальной текущей загрузкой
            # и подходящей специализацией (если указана)
            best_brigade = None
            min_load = float("inf")
            
            required_skills = set(task.get("required_skills", []))
            
            for brigade in brigades:
                brigade_skills = set(brigade.get("skills", []))
                if required_skills and not required_skills.issubset(brigade_skills):
                    continue
                    
                load = brigade_load[brigade["id"]]
                if load < min_load:
                    min_load = load
                    best_brigade = brigade
            
            if best_brigade is None and brigades:
                # Если нет подходящей по навыкам — берём наименее загруженную
                best_brigade = min(brigades, key=lambda b: brigade_load[b["id"]])
            
            if best_brigade:
                task_to_brigade[task["id"]] = best_brigade["id"]
                brigade_load[best_brigade["id"]] += task.get("duration_days", 1)
        
        return {
            "task_to_brigade": task_to_brigade,
            "brigade_load": brigade_load,
            "method": "heuristic"
        }

    def _allocate_ortools(
        self,
        tasks: List[Dict],
        brigades: List[Dict],
        constraints: Dict
    ) -> Dict[str, Any]:
        """Точное решение через Linear Programming (OR-Tools)"""
        solver = pywraplp.Solver.CreateSolver("SCIP")
        if not solver:
            return self._allocate_heuristic(tasks, brigades, constraints)
        
        # Переменные: x[task, brigade] = 1 если задача назначена бригаде
        x = {}
        for t in tasks:
            for b in brigades:
                x[t["id"], b["id"]] = solver.BoolVar(f"x_{t['id']}_{b['id']}")
        
        # Каждая задача должна быть назначена ровно одной бригаде
        for t in tasks:
            solver.Add(sum(x[t["id"], b["id"]] for b in brigades) == 1)
        
        # Минимизируем максимальную загрузку (балансировка)
        max_load = solver.NumVar(0, solver.infinity(), "max_load")
        for b in brigades:
            load = sum(
                x[t["id"], b["id"]] * t.get("duration_days", 1)
                for t in tasks
            )
            solver.Add(load <= max_load)
        
        solver.Minimize(max_load)
        status = solver.Solve()
        
        task_to_brigade = {}
        brigade_load = {b["id"]: 0 for b in brigades}
        
        if status == pywraplp.Solver.OPTIMAL or status == pywraplp.Solver.FEASIBLE:
            for t in tasks:
                for b in brigades:
                    if x[t["id"], b["id"]].solution_value() > 0.5:
                        task_to_brigade[t["id"]] = b["id"]
                        brigade_load[b["id"]] += t.get("duration_days", 1)
                        break
        
        return {
            "task_to_brigade": task_to_brigade,
            "brigade_load": brigade_load,
            "method": "ortools",
            "max_load": max_load.solution_value() if status == pywraplp.Solver.OPTIMAL else None
        }

    def reoptimize_affected(
        self,
        plan: Dict,
        affected_tasks: List[str],
        resources: List[Dict],
        brigades: List[Dict]
    ) -> Dict:
        """Переоптимизация только затронутых задач (минимальные изменения)"""
        # Пока просто возвращаем план (в будущем можно доработать точечно)
        plan = deepcopy(plan)
        plan["reoptimized"] = True
        return plan

    def find_overloaded(self, plan: Dict, threshold: float = 1.15) -> List[Dict]:
        """Находит перегруженные бригады"""
        allocation = plan.get("allocation", {})
        brigade_load = allocation.get("brigade_load", {})
        
        overloaded = []
        # Здесь нужна нормальная ёмкость бригады. Пока упрощённо.
        for brigade_id, load in brigade_load.items():
            if load > 20 * threshold:  # пример порога
                overloaded.append({
                    "brigade_id": brigade_id,
                    "brigade_name": str(brigade_id),
                    "load": load,
                    "overload_percent": int((load / 20 - 1) * 100)
                })
        return overloaded