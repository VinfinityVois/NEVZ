"""
Gap Detector
============

Поиск структурных разрывов производственного графа.

ВАЖНО:

На этом этапе модуль НЕ пытается угадывать отсутствующую
технологическую связь.

Он сначала фиксирует объективные проблемы:

    - изолированные операции;
    - отдельные компоненты графа;
    - битые ссылки;
    - циклы;
    - противоречия prev_ops / next_ops;
    - подозрительные окончания цепочек.

Позже сюда будет добавлена ML-модель,
которая будет оценивать вероятность отсутствующей связи.
"""

from __future__ import annotations

from typing import Any, Dict, List, Set

from .graph_analyzer import GraphAnalyzer


class GapDetector:
    """
    Детектор структурных разрывов.

    Использует GraphAnalyzer.

    Ничего не изменяет в БД.
    """

    def __init__(
        self,
        graph_analyzer: GraphAnalyzer | None = None,
    ) -> None:

        self.graph_analyzer = (
            graph_analyzer
            or GraphAnalyzer()
        )

    # ============================================================
    # ОСНОВНОЙ АНАЛИЗ
    # ============================================================

    def analyze(
        self,
        operations: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Полный анализ разрывов.
        """

        graph_result = (
            self.graph_analyzer.build(
                operations
            )
        )

        gaps: List[Dict[str, Any]] = []

        # --------------------------------------------------------
        # 1. Изолированные операции
        # --------------------------------------------------------

        for op_number in graph_result["isolated"]:

            operation = (
                self.graph_analyzer.operations
                .get(op_number, {})
            )

            gaps.append({

                "type": "isolated_operation",

                "severity": "warning",

                "op_number": op_number,

                "confidence": 1.0,

                "reason": (
                    "Операция не имеет ни одного "
                    "предшественника и ни одного "
                    "последователя."
                ),

                "operation": {
                    "name": operation.get("name"),
                    "drawing": operation.get(
                        "drawing"
                    ),
                    "post": operation.get(
                        "post"
                    ),
                    "brigade_id": operation.get(
                        "brigade_id"
                    ),
                },

                "requires_ml": True,
            })

        # --------------------------------------------------------
        # 2. Битые ссылки
        # --------------------------------------------------------

        for item in graph_result[
            "dangling_references"
        ]:

            gaps.append({

                "type": "dangling_reference",

                "severity": "critical",

                "from": item["from"],
                "to": item["to"],

                "source": item["source"],

                "confidence": 1.0,

                "reason": (
                    "Связь ссылается на операцию, "
                    "которой нет в текущем наборе."
                ),

                "requires_ml": False,
            })

        # --------------------------------------------------------
        # 3. Циклы
        # --------------------------------------------------------

        for cycle in graph_result["cycles"]:

            gaps.append({

                "type": "cycle",

                "severity": "critical",

                "cycle": cycle,

                "confidence": 1.0,

                "reason": (
                    "Обнаружен цикл в графе "
                    "производственных операций."
                ),

                "requires_ml": False,
            })

        # --------------------------------------------------------
        # 4. Самоссылки
        # --------------------------------------------------------

        for op_number in graph_result[
            "self_loops"
        ]:

            gaps.append({

                "type": "self_loop",

                "severity": "critical",

                "op_number": op_number,

                "confidence": 1.0,

                "reason": (
                    "Операция ссылается сама на себя."
                ),

                "requires_ml": False,
            })

        # --------------------------------------------------------
        # 5. Противоречивые зависимости
        # --------------------------------------------------------

        for item in graph_result[
            "asymmetric_dependencies"
        ]:

            gaps.append({

                "type": (
                    "asymmetric_dependency"
                ),

                "severity": "warning",

                "from": item["from"],
                "to": item["to"],

                "confidence": 1.0,

                "reason": item["message"],

                "source_type": item["type"],

                "requires_ml": False,
            })

        # --------------------------------------------------------
        # 6. Несвязанные компоненты
        # --------------------------------------------------------

        components = (
            graph_result["components"]
        )

        if len(components) > 1:

            # Первая компонента обычно крупнейшая.
            # Но это НЕ означает, что остальные являются
            # ошибкой.
            for index, component in enumerate(
                components[1:],
                start=2,
            ):

                gaps.append({

                    "type": (
                        "disconnected_component"
                    ),

                    "severity": "info",

                    "component_index": index,

                    "operations": component,

                    "size": len(component),

                    "confidence": 0.0,

                    "reason": (
                        "Операции находятся в отдельной "
                        "связной компоненте графа. "
                        "Это не обязательно ошибка."
                    ),

                    "requires_ml": True,
                })

        # --------------------------------------------------------
        # 7. Подозрительные конечные операции
        # --------------------------------------------------------
        #
        # Операция без next_ops сама по себе НЕ ошибка.
        #
        # Это может быть нормальная конечная операция.
        #
        # Поэтому только отмечаем её как candidate.
        # --------------------------------------------------------

        leaves = graph_result["leaves"]

        for op_number in leaves:

            if op_number in graph_result[
                "isolated"
            ]:
                continue

            operation = (
                self.graph_analyzer.operations
                .get(op_number, {})
            )

            gaps.append({

                "type": "leaf_operation",

                "severity": "info",

                "op_number": op_number,

                "confidence": 0.0,

                "reason": (
                    "Операция является конечной "
                    "вершиной своей цепочки."
                ),

                "operation": {
                    "name": operation.get("name"),
                    "drawing": operation.get(
                        "drawing"
                    ),
                    "post": operation.get(
                        "post"
                    ),
                },

                "requires_ml": True,
            })

        # --------------------------------------------------------
        # 8. Подозрительные корни
        # --------------------------------------------------------

        roots = graph_result["roots"]

        for op_number in roots:

            if op_number in graph_result[
                "isolated"
            ]:
                continue

            operation = (
                self.graph_analyzer.operations
                .get(op_number, {})
            )

            gaps.append({

                "type": "root_operation",

                "severity": "info",

                "op_number": op_number,

                "confidence": 0.0,

                "reason": (
                    "Операция является начальной "
                    "вершиной своей цепочки."
                ),

                "operation": {
                    "name": operation.get("name"),
                    "drawing": operation.get(
                        "drawing"
                    ),
                    "post": operation.get(
                        "post"
                    ),
                },

                "requires_ml": True,
            })

        # --------------------------------------------------------
        # Итог
        # --------------------------------------------------------

        severity_order = {
            "critical": 0,
            "warning": 1,
            "info": 2,
        }

        gaps.sort(
            key=lambda item: (
                severity_order.get(
                    item["severity"],
                    99,
                ),
                item.get(
                    "op_number",
                    item.get(
                        "from",
                        0,
                    ),
                ),
            )
        )

        critical_count = sum(
            1
            for item in gaps
            if item["severity"] == "critical"
        )

        warning_count = sum(
            1
            for item in gaps
            if item["severity"] == "warning"
        )

        info_count = sum(
            1
            for item in gaps
            if item["severity"] == "info"
        )

        return {

            "success": True,

            "summary": {

                "total_gaps": len(gaps),

                "critical": critical_count,

                "warning": warning_count,

                "info": info_count,

                "requires_ml": sum(
                    1
                    for item in gaps
                    if item.get(
                        "requires_ml",
                        False
                    )
                ),
            },

            "gaps": gaps,

            "graph": graph_result,
        }

    # ============================================================
    # ТОЛЬКО ПРОБЛЕМЫ, КОТОРЫЕ ТРЕБУЮТ ML
    # ============================================================

    def get_ml_candidates(
        self,
        analysis: Dict[str, Any],
    ) -> List[Dict[str, Any]]:

        return [
            gap
            for gap in analysis.get(
                "gaps",
                []
            )
            if gap.get(
                "requires_ml",
                False
            )
        ]

    # ============================================================
    # ТОЛЬКО КРИТИЧЕСКИЕ
    # ============================================================

    def get_critical_gaps(
        self,
        analysis: Dict[str, Any],
    ) -> List[Dict[str, Any]]:

        return [
            gap
            for gap in analysis.get(
                "gaps",
                []
            )
            if gap.get(
                "severity"
            ) == "critical"
        ]

    # ============================================================
    # ТОЛЬКО ПРЕДУПРЕЖДЕНИЯ
    # ============================================================

    def get_warnings(
        self,
        analysis: Dict[str, Any],
    ) -> List[Dict[str, Any]]:

        return [
            gap
            for gap in analysis.get(
                "gaps",
                []
            )
            if gap.get(
                "severity"
            ) == "warning"
        ]