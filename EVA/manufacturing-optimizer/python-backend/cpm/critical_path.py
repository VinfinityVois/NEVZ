"""
Critical Path Method (CPM) — полный расчёт критического пути.
Forward Pass + Backward Pass + Float + Critical Path.
"""

from typing import List, Dict, Optional, Any, Tuple
from copy import deepcopy
import networkx as nx
import logging

from .graph_builder import GraphBuilder

logger = logging.getLogger(__name__)


class CriticalPathCalculator:
    """
    Классический алгоритм CPM:
    - Forward Pass (ES, EF)
    - Backward Pass (LS, LF)
    - Total Float / Free Float
    - Определение критического пути
    """

    def __init__(self):
        self.builder = GraphBuilder()
        self.graph: Optional[nx.DiGraph] = None
        self.results: Dict[str, Dict] = {}  # task_id -> {es, ef, ls, lf, total_float, ...}

    def calculate(self, tasks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Главный метод.
        Возвращает полный результат анализа.
        """
        self.graph = self.builder.build(tasks)
        self._forward_pass()
        self._backward_pass()
        self._calculate_floats()

        critical_path = self._get_critical_path()
        project_duration = self._get_project_duration()

        return {
            "tasks": self._format_tasks(),
            "critical_path": critical_path,
            "critical_path_ids": [t["id"] for t in critical_path],
            "project_duration_days": project_duration,
            "has_cycles": False,
            "total_tasks": len(tasks),
            "critical_tasks_count": len(critical_path),
        }

    def _forward_pass(self):
        """Прямой проход: ES и EF"""
        for node in nx.topological_sort(self.graph):
            duration = self.graph.nodes[node]["duration"]
            preds = list(self.graph.predecessors(node))

            if not preds:
                es = 0.0
            else:
                es = max(self.results[p]["ef"] for p in preds)

            ef = es + duration
            self.results[node] = {
                "es": es,
                "ef": ef,
                "ls": None,
                "lf": None,
                "total_float": None,
                "free_float": None,
                "is_critical": False,
            }

    def _backward_pass(self):
        """Обратный проход: LS и LF"""
        project_duration = max(r["ef"] for r in self.results.values())

        # Идём в обратном топологическом порядке
        for node in reversed(list(nx.topological_sort(self.graph))):
            duration = self.graph.nodes[node]["duration"]
            succs = list(self.graph.successors(node))

            if not succs:
                lf = project_duration
            else:
                lf = min(self.results[s]["ls"] for s in succs)

            ls = lf - duration
            self.results[node]["ls"] = ls
            self.results[node]["lf"] = lf

    def _calculate_floats(self):
        """Расчёт резервов времени"""
        for node, data in self.results.items():
            total_float = data["ls"] - data["es"]
            data["total_float"] = total_float
            data["is_critical"] = abs(total_float) < 1e-6  # float == 0

            # Free Float
            succs = list(self.graph.successors(node))
            if not succs:
                free_float = total_float
            else:
                free_float = min(self.results[s]["es"] for s in succs) - data["ef"]
            data["free_float"] = max(0.0, free_float)

    def _get_critical_path(self) -> List[Dict]:
        """Возвращает список критических работ в правильном порядке"""
        critical_nodes = [
            n for n, d in self.results.items() if d["is_critical"]
        ]

        if not critical_nodes:
            return []

        # Строим подграф только из критических узлов и топологически сортируем
        critical_subgraph = self.graph.subgraph(critical_nodes).copy()
        ordered = list(nx.topological_sort(critical_subgraph))

        path = []
        for node in ordered:
            node_data = self.graph.nodes[node]
            res = self.results[node]
            path.append({
                "id": node,
                "name": node_data.get("name", node),
                "duration": node_data["duration"],
                "es": res["es"],
                "ef": res["ef"],
                "ls": res["ls"],
                "lf": res["lf"],
                "total_float": res["total_float"],
                "brigade_id": node_data.get("brigade_id"),
            })
        return path

    def _get_project_duration(self) -> float:
        if not self.results:
            return 0.0
        return max(r["ef"] for r in self.results.values())

    def _format_tasks(self) -> List[Dict]:
        """Форматированный список всех задач с параметрами CPM"""
        tasks = []
        for node in nx.topological_sort(self.graph):
            node_data = self.graph.nodes[node]
            res = self.results[node]
            tasks.append({
                "id": node,
                "name": node_data.get("name", node),
                "duration": node_data["duration"],
                "es": round(res["es"], 2),
                "ef": round(res["ef"], 2),
                "ls": round(res["ls"], 2),
                "lf": round(res["lf"], 2),
                "total_float": round(res["total_float"], 2),
                "free_float": round(res["free_float"], 2),
                "is_critical": res["is_critical"],
                "brigade_id": node_data.get("brigade_id"),
            })
        return tasks

    def get_task_result(self, task_id: str) -> Optional[Dict]:
        """Получить результат по одной задаче"""
        return self.results.get(str(task_id))


# Удобная функция верхнего уровня
def calculate_critical_path(tasks: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Быстрый расчёт критического пути.
    
    Пример:
        result = calculate_critical_path(tasks)
        print(result["critical_path_ids"])
        print(result["project_duration_days"])
    """
    calc = CriticalPathCalculator()
    return calc.calculate(tasks)