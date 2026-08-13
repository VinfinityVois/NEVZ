"""
Graph Analyzer
==============

Анализ производственного графа операций.

ВАЖНО:
    Этот модуль пока НЕ использует ML.

Он отвечает только за математическую и структурную
проверку графа.

Операция = вершина графа.
Зависимость A -> B = направленное ребро.

На этом этапе мы ничего не изменяем в БД.
"""

from __future__ import annotations

import json
from typing import (
    Any,
    Dict,
    Iterable,
    List,
    Optional,
    Set,
    Tuple,
)


class GraphAnalyzer:
    """
    Анализатор графа производственных операций.

    Основные задачи:

    - построение графа;
    - поиск корневых операций;
    - поиск конечных операций;
    - поиск изолированных операций;
    - поиск циклов;
    - поиск несвязанных компонентов;
    - поиск битых ссылок;
    - поиск противоречий prev_ops / next_ops.
    """
    # В graph_analyzer.py, в класс GraphAnalyzer

    def get_operation(self, op_number: int) -> Optional[Dict[str, Any]]:
        """
        Безопасное получение операции по номеру.
        """
        return self.operations.get(op_number)

    def get_all_operations(self) -> Dict[int, Dict[str, Any]]:
        """
        Возвращает копию всех операций.
        """
        return dict(self.operations)

    def get_graph(self) -> Dict[int, Set[int]]:
        """
        Возвращает копию направленного графа.
        """
        return {k: set(v) for k, v in self.graph.items()}

    def get_reverse_graph(self) -> Dict[int, Set[int]]:
        """
        Возвращает копию обратного графа.
        """
        return {k: set(v) for k, v in self.reverse_graph.items()}

    def __init__(self) -> None:
        self.operations: Dict[int, Dict[str, Any]] = {}

        # Основной направленный граф:
        #
        # {
        #     100: {200, 300},
        #     200: {400},
        # }
        #
        # То есть:
        #
        # 100 -> 200
        # 100 -> 300
        # 200 -> 400

        self.graph: Dict[int, Set[int]] = {}

        # Обратный граф:
        #
        # {
        #     200: {100},
        #     300: {100},
        #     400: {200},
        # }

        self.reverse_graph: Dict[int, Set[int]] = {}

    # ============================================================
    # НОРМАЛИЗАЦИЯ НОМЕРА ОПЕРАЦИИ
    # ============================================================

    @staticmethod
    def _normalize_op_number(
        value: Any,
    ) -> Optional[int]:
        """
        Приводит номер операции к int.

        Поддерживает:

            120
            "120"
            120.0
            "120.0"
            "T120"

        Если значение невозможно преобразовать:
            None
        """

        if value is None:
            return None

        # bool является наследником int.
        # Поэтому отдельно исключаем True / False.
        if isinstance(value, bool):
            return None

        if isinstance(value, int):
            return value

        text = str(value).strip()

        if not text:
            return None

        # Поддержка вида T120.
        if text.upper().startswith("T"):
            text = text[1:].strip()

        try:
            return int(float(text))

        except (ValueError, TypeError):
            return None

    # ============================================================
    # НОРМАЛИЗАЦИЯ СПИСКА СВЯЗЕЙ
    # ============================================================

    @classmethod
    def _normalize_refs(
        cls,
        value: Any,
    ) -> List[int]:
        """
        Преобразует prev_ops / next_ops в список int.

        Поддерживает:

            [100, 200]

            "[100, 200]"

            ["100", "200"]

            "100,200"

            "100;200"

            None
        """

        if value is None:
            return []

        # --------------------------------------------------------
        # Если пришла строка
        # --------------------------------------------------------

        if isinstance(value, str):

            text = value.strip()

            if not text:
                return []

            # Сначала пробуем JSON.
            try:
                parsed = json.loads(text)

                if isinstance(parsed, list):
                    value = parsed

                elif isinstance(
                    parsed,
                    (int, float, str),
                ):
                    value = [parsed]

                else:
                    return []

            except json.JSONDecodeError:

                # Если это не JSON,
                # поддерживаем:

                # "100,200"
                # "100;200"

                text = text.replace(
                    ";",
                    ",",
                )

                value = [
                    item.strip()
                    for item in text.split(",")
                    if item.strip()
                ]

        # --------------------------------------------------------
        # Одно число
        # --------------------------------------------------------

        if isinstance(
            value,
            (int, float),
        ):
            value = [value]

        # --------------------------------------------------------
        # Проверяем, что получили коллекцию
        # --------------------------------------------------------

        if not isinstance(
            value,
            (list, tuple, set),
        ):
            return []

        result: List[int] = []

        # --------------------------------------------------------
        # Преобразуем каждый элемент
        # --------------------------------------------------------

        for item in value:

            number = cls._normalize_op_number(
                item
            )

            if number is not None:
                result.append(number)

        # Убираем дубли и сортируем.
        return sorted(set(result))

    # ============================================================
    # ПОСТРОЕНИЕ ГРАФА
    # ============================================================

    def build(
        self,
        operations: Iterable[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Построить граф операций.

        На вход:

            [
                {
                    "op_number": 100,
                    "prev_ops": [],
                    "next_ops": [200]
                },
                {
                    "op_number": 200,
                    "prev_ops": [100],
                    "next_ops": []
                }
            ]

        Возвращает структурированный результат анализа.
        """

        # --------------------------------------------------------
        # Сбрасываем предыдущее состояние
        # --------------------------------------------------------

        self.operations = {}
        self.graph = {}
        self.reverse_graph = {}

        # --------------------------------------------------------
        # 1. Регистрируем все операции
        # --------------------------------------------------------

        for raw_operation in operations:

            if not isinstance(
                raw_operation,
                dict,
            ):
                continue

            op_number = self._normalize_op_number(
                raw_operation.get("op_number")
            )

            if op_number is None:
                continue

            # Копируем исходную операцию,
            # чтобы не изменять объект,
            # переданный извне.

            operation = dict(
                raw_operation
            )

            operation["op_number"] = (
                op_number
            )

            # Нормализуем зависимости.

            operation["prev_ops"] = (
                self._normalize_refs(
                    raw_operation.get(
                        "prev_ops"
                    )
                )
            )

            operation["next_ops"] = (
                self._normalize_refs(
                    raw_operation.get(
                        "next_ops"
                    )
                )
            )

            # Сохраняем операцию.

            self.operations[
                op_number
            ] = operation

            # Создаём пустые вершины графа.

            self.graph[
                op_number
            ] = set()

            self.reverse_graph[
                op_number
            ] = set()

        # Все существующие операции.

        valid_nodes = set(
            self.operations.keys()
        )

        # --------------------------------------------------------
        # 2. Добавляем связи
        # --------------------------------------------------------
        #
        # Используем ОБА источника:
        #
        # A.next_ops -> B
        #
        # и
        #
        # B.prev_ops -> A
        #
        # Если хотя бы одна сторона указывает
        # на связь, граф считает её существующей.
        # --------------------------------------------------------

        dangling_references: List[
            Dict[str, Any]
        ] = []

        for (
            op_number,
            operation,
        ) in self.operations.items():

            # ====================================================
            # next_ops
            # ====================================================

            for next_op in operation[
                "next_ops"
            ]:

                # Ссылка на несуществующую операцию.

                if next_op not in valid_nodes:

                    dangling_references.append(
                        {
                            "from": op_number,
                            "to": next_op,
                            "source": "next_ops",
                        }
                    )

                    continue

                # Создаём направление:

                # op_number -> next_op

                self.graph[
                    op_number
                ].add(next_op)

                # И обратную связь:

                # next_op <- op_number

                self.reverse_graph[
                    next_op
                ].add(op_number)

            # ====================================================
            # prev_ops
            # ====================================================

            for prev_op in operation[
                "prev_ops"
            ]:

                # Ссылка на несуществующую операцию.

                if prev_op not in valid_nodes:

                    dangling_references.append(
                        {
                            "from": prev_op,
                            "to": op_number,
                            "source": "prev_ops",
                        }
                    )

                    continue

                # Если B говорит:
                #
                # prev_ops = [A]
                #
                # значит создаём:
                #
                # A -> B

                self.graph[
                    prev_op
                ].add(op_number)

                self.reverse_graph[
                    op_number
                ].add(prev_op)

        # --------------------------------------------------------
        # 3. Находим корневые операции
        # --------------------------------------------------------
        #
        # Корень:
        #
        # нет предшественников.
        #
        # Например:
        #
        # 100 -> 200 -> 300
        #
        # root = 100
        # --------------------------------------------------------

        roots = [
            op_number
            for op_number in sorted(
                valid_nodes
            )
            if not self.reverse_graph[
                op_number
            ]
        ]

        # --------------------------------------------------------
        # 4. Находим конечные операции
        # --------------------------------------------------------
        #
        # Leaf:
        #
        # нет следующих операций.
        #
        # Например:
        #
        # 100 -> 200 -> 300
        #
        # leaf = 300
        # --------------------------------------------------------

        leaves = [
            op_number
            for op_number in sorted(
                valid_nodes
            )
            if not self.graph[
                op_number
            ]
        ]

        # --------------------------------------------------------
        # 5. Изолированные операции
        # --------------------------------------------------------
        #
        # Нет ни prev, ни next.
        #
        # То есть операция вообще не связана
        # с остальным графом.
        # --------------------------------------------------------

        isolated = [
            op_number
            for op_number in sorted(
                valid_nodes
            )
            if (
                not self.graph[
                    op_number
                ]
                and not self.reverse_graph[
                    op_number
                ]
            )
        ]

        # --------------------------------------------------------
        # 6. Самоссылки
        # --------------------------------------------------------

        self_loops: List[int] = []

        for op_number in sorted(
            valid_nodes
        ):

            if (
                op_number
                in self.graph[op_number]
            ):
                self_loops.append(
                    op_number
                )

        # --------------------------------------------------------
        # 7. Циклы
        # --------------------------------------------------------

        cycles = self._find_cycles()

        # --------------------------------------------------------
        # 8. Слабосвязанные компоненты
        # --------------------------------------------------------

        components = (
            self._find_weak_components()
        )

        # --------------------------------------------------------
        # 9. Несимметричные зависимости
        # --------------------------------------------------------

        asymmetric_dependencies = (
            self._find_asymmetric_dependencies()
        )

        # --------------------------------------------------------
        # 10. Возвращаем результат
        # --------------------------------------------------------

        return {
            "success": True,

            "summary": {
                "operations": len(
                    valid_nodes
                ),

                "edges": sum(
                    len(edges)
                    for edges in self.graph.values()
                ),

                "roots": len(roots),

                "leaves": len(leaves),

                "isolated": len(
                    isolated
                ),

                "components": len(
                    components
                ),

                "cycles": len(
                    cycles
                ),

                "self_loops": len(
                    self_loops
                ),

                "dangling_references": len(
                    dangling_references
                ),

                "asymmetric_dependencies": len(
                    asymmetric_dependencies
                ),
            },

            "roots": roots,

            "leaves": leaves,

            "isolated": isolated,

            "components": components,

            "cycles": cycles,

            "self_loops": self_loops,

            "dangling_references": (
                dangling_references
            ),

            "asymmetric_dependencies": (
                asymmetric_dependencies
            ),

            "graph": {
                str(node): sorted(edges)
                for node, edges
                in self.graph.items()
            },

            "reverse_graph": {
                str(node): sorted(edges)
                for node, edges
                in self.reverse_graph.items()
            },
        }

    # ============================================================
    # ПОИСК НЕСИММЕТРИЧНЫХ ЗАВИСИМОСТЕЙ
    # ============================================================

    def _find_asymmetric_dependencies(
        self,
    ) -> List[Dict[str, Any]]:
        """
        Ищет противоречия между prev_ops и next_ops.

        Например:

            A.next_ops = [B]

        но:

            B.prev_ops = []

        В таком случае обнаруживается:

            missing_prev_reference

        Обратная ситуация:

            B.prev_ops = [A]

        но:

            A.next_ops = []

        даст:

            missing_next_reference
        """

        result: List[
            Dict[str, Any]
        ] = []

        # ========================================================
        # Проверяем:
        #
        # A.next_ops -> B
        #
        # присутствует ли A в B.prev_ops?
        # ========================================================

        for (
            op_number,
            operation,
        ) in self.operations.items():

            next_ops = set(
                operation.get(
                    "next_ops",
                    [],
                )
            )

            for next_op in next_ops:

                # Если операция отсутствует,
                # это уже dangling reference.
                #
                # Здесь её дополнительно
                # не рассматриваем.

                if next_op not in self.operations:
                    continue

                next_operation = (
                    self.operations[
                        next_op
                    ]
                )

                next_prev_ops = set(
                    next_operation.get(
                        "prev_ops",
                        [],
                    )
                )

                # A указывает на B,
                # но B не указывает обратно
                # на A через prev_ops.

                if (
                    op_number
                    not in next_prev_ops
                ):

                    result.append(
                        {
                            "type": (
                                "missing_prev_reference"
                            ),

                            "from": op_number,

                            "to": next_op,

                            "message": (
                                f"Операция "
                                f"{op_number} "
                                f"указывает "
                                f"next_ops на "
                                f"{next_op}, "
                                f"но {next_op} "
                                f"не содержит "
                                f"{op_number} "
                                f"в prev_ops."
                            ),
                        }
                    )

        # ========================================================
        # Проверяем:
        #
        # B.prev_ops -> A
        #
        # присутствует ли B в A.next_ops?
        # ========================================================

        for (
            op_number,
            operation,
        ) in self.operations.items():

            prev_ops = set(
                operation.get(
                    "prev_ops",
                    [],
                )
            )

            for prev_op in prev_ops:

                # Если операция отсутствует,
                # это dangling reference.
                #
                # Здесь её пропускаем.

                if prev_op not in self.operations:
                    continue

                prev_operation = (
                    self.operations[
                        prev_op
                    ]
                )

                prev_next_ops = set(
                    prev_operation.get(
                        "next_ops",
                        [],
                    )
                )

                # B указывает на A через prev_ops,
                # но A не содержит B в next_ops.

                if (
                    op_number
                    not in prev_next_ops
                ):

                    result.append(
                        {
                            "type": (
                                "missing_next_reference"
                            ),

                            "from": prev_op,

                            "to": op_number,

                            "message": (
                                f"Операция "
                                f"{op_number} "
                                f"указывает "
                                f"prev_ops на "
                                f"{prev_op}, "
                                f"но {prev_op} "
                                f"не содержит "
                                f"{op_number} "
                                f"в next_ops."
                            ),
                        }
                    )

        return result

    # ============================================================
    # ПОИСК СЛАБОСВЯЗАННЫХ КОМПОНЕНТОВ
    # ============================================================

    def _find_weak_components(
        self,
    ) -> List[List[int]]:
        """
        Ищет слабосвязанные компоненты.

        Направление ребра здесь игнорируется.

        Например:

            A -> B -> C

        является одной компонентой.

        А:

            A -> B

            C -> D

        являются двумя компонентами.
        """

        all_nodes = set(
            self.operations.keys()
        )

        # --------------------------------------------------------
        # Создаём неориентированную копию графа.
        # --------------------------------------------------------

        undirected: Dict[
            int,
            Set[int],
        ] = {
            node: set()
            for node in all_nodes
        }

        for (
            source,
            targets,
        ) in self.graph.items():

            for target in targets:

                undirected[
                    source
                ].add(target)

                undirected[
                    target
                ].add(source)

        # --------------------------------------------------------
        # Обход компонентов
        # --------------------------------------------------------

        visited: Set[int] = set()

        components: List[
            List[int]
        ] = []

        for start in sorted(
            all_nodes
        ):

            if start in visited:
                continue

            component: List[int] = []

            stack: List[int] = [
                start
            ]

            visited.add(start)

            while stack:

                node = stack.pop()

                component.append(
                    node
                )

                for neighbour in (
                    undirected[node]
                ):

                    if neighbour in visited:
                        continue

                    visited.add(
                        neighbour
                    )

                    stack.append(
                        neighbour
                    )

            components.append(
                sorted(component)
            )

        # Самая крупная компонента первой.

        components.sort(
            key=lambda component: (
                -len(component),
                component[0]
                if component
                else 0,
            )
        )

        return components

    # ============================================================
    # ПОИСК ЦИКЛОВ
    # ============================================================

    def _find_cycles(
        self,
    ) -> List[List[int]]:
        """
        Поиск циклов DFS.

        Например:

            100 -> 200
                   |
                   v
                  300
                   |
                   └----> 100

        будет обнаружен как:

            [100, 200, 300, 100]
        """

        WHITE = 0
        GRAY = 1
        BLACK = 2

        # Состояние каждой вершины.

        color: Dict[
            int,
            int,
        ] = {
            node: WHITE
            for node
            in self.operations
        }

        # Текущий стек DFS.

        stack: List[int] = []

        cycles: List[
            List[int]
        ] = []

        # Чтобы один и тот же цикл
        # не добавить несколько раз.

        seen_cycles: Set[
            Tuple[int, ...]
        ] = set()

        def dfs(
            node: int,
        ) -> None:

            color[node] = GRAY

            stack.append(
                node
            )

            for neighbour in sorted(
                self.graph.get(
                    node,
                    set(),
                )
            ):

                # ------------------------------------------------
                # Не посещали вершину
                # ------------------------------------------------

                if (
                    color[neighbour]
                    == WHITE
                ):

                    dfs(
                        neighbour
                    )

                # ------------------------------------------------
                # Нашли возвратное ребро
                #
                # Значит есть цикл.
                # ------------------------------------------------

                elif (
                    color[neighbour]
                    == GRAY
                ):

                    if neighbour not in stack:
                        continue

                    index = stack.index(
                        neighbour
                    )

                    cycle = (
                        stack[index:]
                        + [neighbour]
                    )

                    # Убираем последний
                    # повторяющийся элемент
                    # для нормализации.

                    body = cycle[:-1]

                    if not body:
                        continue

                    # ------------------------------------------------
                    # Нормализация цикла.
                    #
                    # Например:
                    #
                    # [300, 100, 200]
                    #
                    # превращаем в:
                    #
                    # [100, 200, 300]
                    # ------------------------------------------------

                    min_index = body.index(
                        min(body)
                    )

                    normalized = (
                        body[min_index:]
                        + body[:min_index]
                    )

                    key = tuple(
                        normalized
                    )

                    if key in seen_cycles:
                        continue

                    seen_cycles.add(
                        key
                    )

                    cycles.append(
                        normalized
                        + [
                            normalized[0]
                        ]
                    )

            # Завершаем обработку вершины.

            stack.pop()

            color[node] = BLACK

        # Запускаем DFS из каждой ещё
        # не посещённой вершины.

        for node in sorted(
            self.operations
        ):

            if (
                color[node]
                == WHITE
            ):

                dfs(node)

        return cycles

    # ============================================================
    # ПОЛУЧИТЬ ПОСЛЕДОВАТЕЛЕЙ
    # ============================================================

    def successors(
        self,
        op_number: int,
    ) -> List[int]:
        """
        Возвращает операции,
        которые непосредственно следуют
        за указанной операцией.
        """

        return sorted(
            self.graph.get(
                op_number,
                set(),
            )
        )

    # ============================================================
    # ПОЛУЧИТЬ ПРЕДШЕСТВЕННИКОВ
    # ============================================================

    def predecessors(
        self,
        op_number: int,
    ) -> List[int]:
        """
        Возвращает операции,
        которые непосредственно предшествуют
        указанной операции.
        """

        return sorted(
            self.reverse_graph.get(
                op_number,
                set(),
            )
        )

    # ============================================================
    # ПРОВЕРКА СУЩЕСТВОВАНИЯ ПУТИ
    # ============================================================

    def has_path(
        self,
        start: int,
        target: int,
    ) -> bool:
        """
        Проверяет существование пути:

            start -> ... -> target

        Используется обычный DFS/BFS-подобный обход.
        """

        # Путь из вершины в саму себя
        # считаем существующим.

        if start == target:
            return True

        # Уже посещённые вершины.

        visited: Set[int] = set()

        # Стек DFS.

        stack: List[int] = [
            start
        ]

        while stack:

            node = stack.pop()

            # Не обрабатываем вершину повторно.

            if node in visited:
                continue

            visited.add(
                node
            )

            # Получаем следующие вершины.

            for neighbour in self.graph.get(
                node,
                set(),
            ):

                # Нашли target.

                if neighbour == target:
                    return True

                # Продолжаем поиск.

                if neighbour not in visited:

                    stack.append(
                        neighbour
                    )

        # Пути нет.

        return False