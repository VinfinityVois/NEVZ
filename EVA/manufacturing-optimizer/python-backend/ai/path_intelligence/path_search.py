"""
Path Search
===========

Поиск возможных путей выполнения производственных операций.

ВАЖНО:

Этот модуль НЕ использует ML.

Его задача — математически найти возможные варианты
прохождения по направленному графу операций.

Дальше эти варианты будут передаваться в:

    PathScorer
        ↓
    PathOptimizer
        ↓
    ML / Learning

Пример:

    100
     |
     v
    200
    / \
   v   v
  300 350
   |   |
   v   v
  400 450
    \ /
     v
    500

Результат:

    [100, 200, 300, 400, 500]
    [100, 200, 350, 450, 500]
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import (
    Any,
    Dict,
    List,
    Optional,
    Set,
    Tuple,
)


# ================================================================
# КОНФИГУРАЦИЯ ПОИСКА
# ================================================================


@dataclass
class PathSearchConfig:
    """
    Настройки поиска путей.

    max_paths:
        Максимальное количество найденных путей.

    max_depth:
        Максимальная длина одного пути.

    allow_partial:
        Разрешать ли возвращать незавершённые пути,
        если поиск упёрся в max_depth.

    include_start:
        Включать ли стартовую операцию в результат.

    include_target:
        Включать ли конечную операцию в результат.
    """

    max_paths: int = 1000

    max_depth: int = 100

    allow_partial: bool = False

    include_start: bool = True

    include_target: bool = True


# ================================================================
# ОСНОВНОЙ КЛАСС
# ================================================================


class PathSearcher:
    """
    Поиск маршрутов по графу производственных операций.

    Ожидаемый формат графа:

        {
            100: {200},
            200: {300, 350},
            300: {400},
            350: {450},
            400: {500},
            450: {500},
        }

    То есть:

        100 -> 200
        200 -> 300
        200 -> 350
        ...
    """

    def __init__(
        self,
        config: Optional[PathSearchConfig] = None,
    ) -> None:

        self.config = (
            config
            if config is not None
            else PathSearchConfig()
        )

    # ============================================================
    # НОРМАЛИЗАЦИЯ ГРАФА
    # ============================================================

    @staticmethod
    def _normalize_graph(
        graph: Dict[Any, Any],
    ) -> Dict[int, Set[int]]:
        """
        Приводит граф к нормальному виду:

            Dict[int, Set[int]]

        Например:

            {
                "100": ["200", "300"]
            }

        превращается в:

            {
                100: {200, 300}
            }
        """

        normalized: Dict[
            int,
            Set[int],
        ] = {}

        for raw_node, raw_targets in graph.items():

            # ----------------------------------------------------
            # Нормализуем номер вершины
            # ----------------------------------------------------

            try:
                node = int(
                    float(
                        str(raw_node).strip()
                    )
                )

            except (
                ValueError,
                TypeError,
            ):
                continue

            # ----------------------------------------------------
            # Нормализуем список соседей
            # ----------------------------------------------------

            if raw_targets is None:

                targets: List[Any] = []

            elif isinstance(
                raw_targets,
                (list, tuple, set),
            ):

                targets = list(
                    raw_targets
                )

            else:

                targets = [
                    raw_targets
                ]

            normalized_targets: Set[
                int
            ] = set()

            for raw_target in targets:

                try:

                    target = int(
                        float(
                            str(
                                raw_target
                            ).strip()
                        )
                    )

                except (
                    ValueError,
                    TypeError,
                ):
                    continue

                normalized_targets.add(
                    target
                )

            normalized[node] = (
                normalized_targets
            )

        # --------------------------------------------------------
        # Добавляем вершины, которые встречаются только
        # как destination.
        #
        # Например:
        #
        # {
        #     100: {200}
        # }
        #
        # должна стать:
        #
        # {
        #     100: {200},
        #     200: set()
        # }
        # --------------------------------------------------------

        all_nodes = set(
            normalized.keys()
        )

        for targets in normalized.values():

            all_nodes.update(
                targets
            )

        for node in all_nodes:

            normalized.setdefault(
                node,
                set(),
            )

        return normalized

    # ============================================================
    # ПОИСК ОДНОГО ПУТИ
    # ============================================================

    def find_paths(
        self,
        graph: Dict[Any, Any],
        start: int,
        target: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Найти пути из start.

        Если target задан:

            ищем пути:

                start -> target

        Если target не задан:

            ищем пути до конечных вершин.

        Возвращает:

            {
                "success": True,
                "start": 100,
                "target": 500,
                "paths": [
                    [100, 200, 300, 400, 500],
                    [100, 200, 350, 450, 500],
                ],
                "count": 2,
                "truncated": False
            }
        """

        normalized_graph = (
            self._normalize_graph(
                graph
            )
        )

        # --------------------------------------------------------
        # Проверяем start
        # --------------------------------------------------------

        if start not in normalized_graph:

            return {
                "success": False,
                "error": (
                    f"Start operation "
                    f"{start} not found "
                    f"in graph."
                ),
                "start": start,
                "target": target,
                "paths": [],
                "count": 0,
                "truncated": False,
            }

        # --------------------------------------------------------
        # Проверяем target
        # --------------------------------------------------------

        if (
            target is not None
            and target
            not in normalized_graph
        ):

            return {
                "success": False,
                "error": (
                    f"Target operation "
                    f"{target} not found "
                    f"in graph."
                ),
                "start": start,
                "target": target,
                "paths": [],
                "count": 0,
                "truncated": False,
            }

        # --------------------------------------------------------
        # Результаты
        # --------------------------------------------------------

        paths: List[
            List[int]
        ] = []

        truncated = False

        # --------------------------------------------------------
        # DFS
        # --------------------------------------------------------

        def dfs(
            current: int,
            current_path: List[int],
        ) -> None:

            nonlocal truncated

            # ----------------------------------------------------
            # Ограничение количества путей
            # ----------------------------------------------------

            if (
                len(paths)
                >= self.config.max_paths
            ):

                truncated = True

                return

            # ----------------------------------------------------
            # Ограничение глубины
            # ----------------------------------------------------

            if (
                len(current_path)
                > self.config.max_depth
            ):

                truncated = True

                if (
                    self.config.allow_partial
                    and (
                        target is None
                        or current
                        == target
                    )
                ):

                    paths.append(
                        current_path.copy()
                    )

                return

            # ----------------------------------------------------
            # Если достигли target
            # ----------------------------------------------------

            if (
                target is not None
                and current == target
            ):

                paths.append(
                    current_path.copy()
                )

                return

            # ----------------------------------------------------
            # Если target не указан,
            # конечная вершина считается готовым путём.
            # ----------------------------------------------------

            neighbours = sorted(
                normalized_graph.get(
                    current,
                    set(),
                )
            )

            if (
                target is None
                and not neighbours
            ):

                paths.append(
                    current_path.copy()
                )

                return

            # ----------------------------------------------------
            # Идём по соседям
            # ----------------------------------------------------

            for neighbour in neighbours:

                # ------------------------------------------------
                # Защита от цикла.
                #
                # Например:
                #
                # 100 -> 200 -> 300 -> 100
                #
                # не должны привести к:
                #
                # 100 -> 200 -> 300 -> 100 -> ...
                # ------------------------------------------------

                if neighbour in current_path:

                    continue

                dfs(
                    neighbour,
                    current_path
                    + [neighbour],
                )

                # Если достигли лимита,
                # прекращаем дальнейший поиск.

                if (
                    len(paths)
                    >= self.config.max_paths
                ):

                    truncated = True

                    return

        # --------------------------------------------------------
        # Запускаем поиск
        # --------------------------------------------------------

        initial_path: List[int]

        if self.config.include_start:

            initial_path = [start]

        else:

            initial_path = []

        dfs(
            start,
            initial_path,
        )

        # --------------------------------------------------------
        # Если нужно убрать target
        # --------------------------------------------------------

        if (
            target is not None
            and not self.config.include_target
        ):

            paths = [
                path[:-1]
                if path
                else path
                for path in paths
            ]

        return {
            "success": True,
            "start": start,
            "target": target,
            "paths": paths,
            "count": len(paths),
            "truncated": truncated,
        }

    # ============================================================
    # ПОИСК ВСЕХ ПУТЕЙ МЕЖДУ ДВУМЯ ВЕРШИНАМИ
    # ============================================================

    def find_paths_between(
        self,
        graph: Dict[Any, Any],
        start: int,
        target: int,
    ) -> Dict[str, Any]:
        """
        Удобная обёртка для поиска:

            start -> target
        """

        return self.find_paths(
            graph=graph,
            start=start,
            target=target,
        )

    # ============================================================
    # ПОИСК ПУТЕЙ ОТ КОРНЯ
    # ============================================================

    def find_paths_from_root(
        self,
        graph: Dict[Any, Any],
        start: int,
    ) -> Dict[str, Any]:
        """
        Найти все пути от стартовой операции
        до конечных операций.
        """

        return self.find_paths(
            graph=graph,
            start=start,
            target=None,
        )

    # ============================================================
    # ПОИСК ПУТЕЙ МЕЖДУ ВСЕМИ КОРНЯМИ И ЛИСТЬЯМИ
    # ============================================================

    def find_all_root_to_leaf_paths(
        self,
        graph: Dict[Any, Any],
        roots: Optional[
            List[int]
        ] = None,
    ) -> Dict[str, Any]:
        """
        Ищет пути:

            root -> ... -> leaf

        для всех корневых операций.

        Если roots передан:

            используем его.

        Если нет:

            автоматически определяем корни.
        """

        normalized_graph = (
            self._normalize_graph(
                graph
            )
        )

        # --------------------------------------------------------
        # Если корни не переданы —
        # определяем их.
        # --------------------------------------------------------

        if roots is None:

            incoming: Dict[
                int,
                int,
            ] = {
                node: 0
                for node
                in normalized_graph
            }

            for targets in (
                normalized_graph.values()
            ):

                for target in targets:

                    incoming.setdefault(
                        target,
                        0,
                    )

                    incoming[
                        target
                    ] += 1

            roots = [
                node
                for node, count
                in sorted(
                    incoming.items()
                )
                if count == 0
            ]

        # --------------------------------------------------------
        # Ищем пути от каждого корня.
        # --------------------------------------------------------

        all_paths: List[
            List[int]
        ] = []

        root_results: Dict[
            int,
            Dict[str, Any],
        ] = {}

        truncated = False

        for root in roots:

            result = self.find_paths_from_root(
                normalized_graph,
                root,
            )

            root_results[
                root
            ] = result

            all_paths.extend(
                result.get(
                    "paths",
                    [],
                )
            )

            if result.get(
                "truncated",
                False,
            ):

                truncated = True

            # Общий лимит.

            if (
                len(all_paths)
                >= self.config.max_paths
            ):

                all_paths = all_paths[
                    : self.config.max_paths
                ]

                truncated = True

                break

        return {
            "success": True,
            "roots": roots,
            "paths": all_paths,
            "count": len(all_paths),
            "truncated": truncated,
            "root_results": root_results,
        }

    # ============================================================
    # НАЙТИ КРАТЧАЙШИЙ ПУТЬ
    # ============================================================

    def find_shortest_path(
        self,
        graph: Dict[Any, Any],
        start: int,
        target: int,
    ) -> Dict[str, Any]:
        """
        Находит путь с минимальным количеством рёбер.

        ВАЖНО:

        Это пока НЕ экономически оптимальный путь.

        Это только математически кратчайший путь
        по количеству переходов.

        Позже PathScorer будет учитывать:

            время
            стоимость
            загрузку
            переналадку
            риск
            и ML-оценку.
        """

        normalized_graph = (
            self._normalize_graph(
                graph
            )
        )

        if start not in normalized_graph:

            return {
                "success": False,
                "error": (
                    f"Start operation "
                    f"{start} not found."
                ),
                "path": [],
                "distance": None,
            }

        if target not in normalized_graph:

            return {
                "success": False,
                "error": (
                    f"Target operation "
                    f"{target} not found."
                ),
                "path": [],
                "distance": None,
            }

        # --------------------------------------------------------
        # BFS
        #
        # Для невзвешенного графа BFS гарантированно
        # находит путь с минимальным количеством рёбер.
        # --------------------------------------------------------

        queue: List[
            List[int]
        ] = [
            [start]
        ]

        visited: Set[int] = {
            start
        }

        while queue:

            path = queue.pop(
                0
            )

            current = path[-1]

            # Нашли цель.

            if current == target:

                return {
                    "success": True,
                    "path": path,
                    "distance": (
                        len(path) - 1
                    ),
                }

            for neighbour in sorted(
                normalized_graph.get(
                    current,
                    set(),
                )
            ):

                if neighbour in visited:
                    continue

                visited.add(
                    neighbour
                )

                queue.append(
                    path
                    + [neighbour]
                )

        # Пути нет.

        return {
            "success": True,
            "path": [],
            "distance": None,
        }

    # ============================================================
    # ПОЛУЧИТЬ КОЛИЧЕСТВО ВЕРШИН ПУТИ
    # ============================================================

    @staticmethod
    def path_node_count(
        path: List[int],
    ) -> int:
        """
        Количество операций в пути.
        """

        return len(path)

    # ============================================================
    # ПОЛУЧИТЬ ДЛИНУ ПУТИ
    # ============================================================

    @staticmethod
    def path_edge_count(
        path: List[int],
    ) -> int:
        """
        Количество переходов между операциями.

        Например:

            [100, 200, 300]

        содержит:

            2 ребра.
        """

        if len(path) < 2:
            return 0

        return len(path) - 1