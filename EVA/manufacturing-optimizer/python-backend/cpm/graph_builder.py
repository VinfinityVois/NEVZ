"""
Graph Builder — построение сетевого графа работ (Activity-on-Node).
Использует networkx.
"""

from typing import List, Dict, Optional, Any
import networkx as nx
import logging

logger = logging.getLogger(__name__)


class GraphBuilder:
    """
    Строит ориентированный граф работ (DiGraph) из списка задач.
    
    Ожидаемый формат задачи:
    {
        "id": "T1",
        "name": "Сборка секции",
        "duration_days": 5,
        "dependencies": ["T0"],          # список id предшественников
        "brigade_id": "B12",             # опционально
        "priority": 1,
        ...
    }
    """

    def __init__(self):
        self.graph: Optional[nx.DiGraph] = None

    def build(self, tasks: List[Dict[str, Any]]) -> nx.DiGraph:
        """
        Строит граф из списка задач.
        Возвращает networkx.DiGraph.
        """
        G = nx.DiGraph()

        # Добавляем узлы
        for task in tasks:
            task_id = str(task["id"])
            G.add_node(
                task_id,
                name=task.get("name", task_id),
                duration=float(task.get("duration_days", task.get("duration", 1))),
                brigade_id=task.get("brigade_id"),
                priority=task.get("priority", 1),
                original=task,  # сохраняем исходные данные
            )

        # Добавляем рёбра (зависимости)
        for task in tasks:
            task_id = str(task["id"])
            deps = task.get("dependencies", []) or task.get("predecessors", [])
            for pred in deps:
                pred_id = str(pred)
                if pred_id in G and task_id in G:
                    G.add_edge(pred_id, task_id)
                else:
                    logger.warning(f"Пропущена зависимость {pred_id} → {task_id}: узел не найден")

        # Проверка на циклы
        if not nx.is_directed_acyclic_graph(G):
            cycles = list(nx.simple_cycles(G))
            raise ValueError(f"Обнаружены циклы в зависимостях: {cycles[:3]}...")

        self.graph = G
        logger.info(f"Граф построен: {G.number_of_nodes()} работ, {G.number_of_edges()} зависимостей")
        return G

    def get_topological_order(self) -> List[str]:
        """Возвращает топологический порядок работ"""
        if self.graph is None:
            raise RuntimeError("Сначала вызовите build()")
        return list(nx.topological_sort(self.graph))

    def get_successors(self, task_id: str) -> List[str]:
        return list(self.graph.successors(str(task_id))) if self.graph else []

    def get_predecessors(self, task_id: str) -> List[str]:
        return list(self.graph.predecessors(str(task_id))) if self.graph else []