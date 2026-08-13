"""
Path Scorer
===========

Оценка производственных маршрутов.

Этот модуль пока НЕ использует ML.

Его задача:

    Path
      ↓
    характеристики операций
      ↓
    нормализация
      ↓
    score
      ↓
    возможность сравнить маршруты

Позже ML будет использовать реальные производственные
данные для корректировки оценки.

Пример:

    Path A:
        100 -> 200 -> 300 -> 400 -> 500

    Path B:
        100 -> 200 -> 350 -> 450 -> 500

Scorer должен определить характеристики обоих путей
и дать каждому итоговую оценку.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional


# ================================================================
# CONFIG
# ================================================================


@dataclass
class PathScoreWeights:
    """
    Весовые коэффициенты.

    Все коэффициенты должны быть >= 0.

    Их сумма автоматически нормализуется.

    Чем больше вес параметра,
    тем сильнее он влияет на итоговый score.
    """

    time: float = 0.40

    cost: float = 0.30

    downtime: float = 0.10

    risk: float = 0.10

    operations: float = 0.10


# ================================================================
# SCORE RESULT
# ================================================================


@dataclass
class PathScore:
    """
    Результат оценки одного пути.
    """

    path: List[int]

    total_time: float

    total_cost: float

    total_downtime: float

    average_risk: float

    operation_count: int

    normalized_time: float

    normalized_cost: float

    normalized_downtime: float

    normalized_risk: float

    normalized_operations: float

    score: float

    feasible: bool = True

    reasons: Optional[List[str]] = None


# ================================================================
# PATH SCORER
# ================================================================


class PathScorer:
    """
    Рассчитывает характеристики и score маршрутов.
    """

    def __init__(
        self,
        weights: Optional[
            PathScoreWeights
        ] = None,
    ) -> None:

        self.weights = (
            weights
            if weights is not None
            else PathScoreWeights()
        )

        self._normalize_weights()

    # ============================================================
    # NORMALIZE WEIGHTS
    # ============================================================

    def _normalize_weights(
        self,
    ) -> None:
        """
        Нормализует веса так,
        чтобы их сумма была равна 1.
        """

        total = (
            self.weights.time
            + self.weights.cost
            + self.weights.downtime
            + self.weights.risk
            + self.weights.operations
        )

        if total <= 0:

            raise ValueError(
                "Sum of path score "
                "weights must be > 0."
            )

        self.weights.time /= total

        self.weights.cost /= total

        self.weights.downtime /= total

        self.weights.risk /= total

        self.weights.operations /= total

    # ============================================================
    # EXTRACT VALUE
    # ============================================================

    @staticmethod
    def _number(
        value: Any,
        default: float = 0.0,
    ) -> float:
        """
        Безопасное преобразование значения в число.
        """

        if value is None:
            return default

        try:
            return float(value)

        except (
            TypeError,
            ValueError,
        ):
            return default

    # ============================================================
    # OPERATION DATA
    # ============================================================

    @staticmethod
    def _get_operation_data(
        operations: Dict[int, Dict[str, Any]],
        operation_id: int,
    ) -> Dict[str, Any]:
        """
        Получает данные операции.

        Поддерживает int и string ключи.
        """

        if operation_id in operations:

            data = operations[
                operation_id
            ]

            if isinstance(
                data,
                dict,
            ):

                return data

        string_id = str(
            operation_id
        )

        if string_id in operations:

            data = operations[
                string_id
            ]

            if isinstance(
                data,
                dict,
            ):

                return data

        return {}

    # ============================================================
    # RAW PATH METRICS
    # ============================================================

    def calculate_metrics(
        self,
        path: List[int],
        operations: Dict[
            int,
            Dict[str, Any],
        ],
    ) -> Dict[str, Any]:
        """
        Рассчитывает исходные характеристики пути.

        Ожидаемые поля операции:

            duration
            time
            processing_time

            cost

            downtime

            risk

        Если какого-то поля нет,
        используется 0.
        """

        total_time = 0.0

        total_cost = 0.0

        total_downtime = 0.0

        risks: List[
            float
        ] = []
        

        for operation_id in path:

            data = (
                self._get_operation_data(
                    operations,
                    operation_id,
                )
            )

            # ----------------------------------------------------
            # ВРЕМЯ
            # ----------------------------------------------------

            duration = (
                data.get(
                    "duration",
                    data.get(
                        "time",
                        data.get(
                            "processing_time",
                            0,
                        ),
                    ),
                )
            )

            total_time += self._number(
                duration
            )

            # ----------------------------------------------------
            # СТОИМОСТЬ
            # ----------------------------------------------------

            cost = data.get(
                "cost",
                0,
            )

            total_cost += self._number(
                cost
            )

            # ----------------------------------------------------
            # ПРОСТОЙ
            # ----------------------------------------------------

            downtime = data.get(
                "downtime",
                0,
            )

            total_downtime += (
                self._number(
                    downtime
                )
            )

            # ----------------------------------------------------
            # РИСК
            # ----------------------------------------------------

            risk = data.get(
                "risk",
                0,
            )

            risks.append(
                self._number(
                    risk
                )
            )

             # ----------------------------------------------------
            # ПЕРЕНАЛАДКА (setup_time)
            # ----------------------------------------------------
            if i > 0:
                prev_id = path[i - 1]
                prev_data = self._get_operation_data(
                    operations,
                    prev_id,
                )

                current_post = data.get("post")
                prev_post = prev_data.get("post")

                if current_post and prev_post and current_post != prev_post:
                    setup = data.get(
                        "setup_time",
                        0,
                    )
                    if not setup:
                        setup = 2.0

                    total_time += self._number(
                        setup
                    )

                current_drawing = data.get(
                    "drawing"
                )
                prev_drawing = prev_data.get(
                    "drawing"
                )
                if (
                    current_drawing
                    and prev_drawing
                    and current_drawing != prev_drawing
                ):
                    drawing_change = data.get(
                        "drawing_change_time",
                        1.0,
                    )
                    total_time += self._number(
                        drawing_change
                    )

        # --------------------------------------------------------
        # Средний риск
        # --------------------------------------------------------

        if risks:

            average_risk = (
                sum(risks)
                / len(risks)
            )

        else:

            average_risk = 0.0

        return {
            "total_time": total_time,
            "total_cost": total_cost,
            "total_downtime": (
                total_downtime
            ),
            "average_risk": average_risk,
            "operation_count": len(path),
        }

    # ============================================================
    # NORMALIZATION
    # ============================================================

    @staticmethod
    def normalize(
        value: float,
        minimum: float,
        maximum: float,
    ) -> float:
        """
        Min-Max нормализация:

            (value - min)
            -------------
            (max - min)

        Результат:

            0...1

        Если maximum == minimum,
        возвращается 0.
        """

        if maximum <= minimum:

            return 0.0

        result = (
            value - minimum
        ) / (
            maximum - minimum
        )

        return max(
            0.0,
            min(
                1.0,
                result,
            ),
        )

    # ============================================================
    # SCORE
    # ============================================================

    def calculate_score(
        self,
        metrics: Dict[str, Any],
        ranges: Dict[str, Any],
    ) -> Dict[str, float]:
        """
        Рассчитывает нормализованные значения
        и итоговый score.

        ВАЖНО:

        Сейчас меньший score = лучший путь.

        То есть:

            0.10
        лучше чем
            0.80
        """

        normalized_time = (
            self.normalize(
                self._number(
                    metrics.get(
                        "total_time"
                    )
                ),
                self._number(
                    ranges[
                        "time"
                    ][0]
                ),
                self._number(
                    ranges[
                        "time"
                    ][1]
                ),
            )
        )

        normalized_cost = (
            self.normalize(
                self._number(
                    metrics.get(
                        "total_cost"
                    )
                ),
                self._number(
                    ranges[
                        "cost"
                    ][0]
                ),
                self._number(
                    ranges[
                        "cost"
                    ][1]
                ),
            )
        )

        normalized_downtime = (
            self.normalize(
                self._number(
                    metrics.get(
                        "total_downtime"
                    )
                ),
                self._number(
                    ranges[
                        "downtime"
                    ][0]
                ),
                self._number(
                    ranges[
                        "downtime"
                    ][1]
                ),
            )
        )

        normalized_risk = (
            self.normalize(
                self._number(
                    metrics.get(
                        "average_risk"
                    )
                ),
                self._number(
                    ranges[
                        "risk"
                    ][0]
                ),
                self._number(
                    ranges[
                        "risk"
                    ][1]
                ),
            )
        )

        normalized_operations = (
            self.normalize(
                self._number(
                    metrics.get(
                        "operation_count"
                    )
                ),
                self._number(
                    ranges[
                        "operations"
                    ][0]
                ),
                self._number(
                    ranges[
                        "operations"
                    ][1]
                ),
            )
        )

        # --------------------------------------------------------
        # Итоговая оценка
        # --------------------------------------------------------

        score = (

            normalized_time
            * self.weights.time

            +

            normalized_cost
            * self.weights.cost

            +

            normalized_downtime
            * self.weights.downtime

            +

            normalized_risk
            * self.weights.risk

            +

            normalized_operations
            * self.weights.operations
        )

        return {
            "normalized_time":
                normalized_time,

            "normalized_cost":
                normalized_cost,

            "normalized_downtime":
                normalized_downtime,

            "normalized_risk":
                normalized_risk,

            "normalized_operations":
                normalized_operations,

            "score":
                score,
        }

    # ============================================================
    # SCORE MULTIPLE PATHS
    # ============================================================

    def score_paths(
        self,
        paths: List[List[int]],
        operations: Dict[
            int,
            Dict[str, Any],
        ],
    ) -> List[PathScore]:
        """
        Оценивает несколько маршрутов.

        Диапазоны для нормализации автоматически
        рассчитываются по переданным маршрутам.
        """

        if not paths:

            return []

        # --------------------------------------------------------
        # Сначала считаем raw metrics
        # --------------------------------------------------------

        metrics_list: List[
            Dict[str, Any]
        ] = []

        for path in paths:

            metrics = (
                self.calculate_metrics(
                    path,
                    operations,
                )
            )

            metrics_list.append(
                metrics
            )

        # --------------------------------------------------------
        # Формируем диапазоны
        # --------------------------------------------------------

                def make_range(
            key: str,
        ) -> tuple[float, float]:

            values = [
                self._number(
                    metrics.get(key)
                )
                for metrics
                in metrics_list
            ]

            if not values:

                return (
                    0.0,
                    1.0,
                )

            mn = min(values)
            mx = max(values)

            if mn == mx:

                return (
                    mn,
                    mn + 1.0,
                )

            return (
                mn,
                mx,
            )

        ranges = {
            "time":
                make_range(
                    "total_time"
                ),

            "cost":
                make_range(
                    "total_cost"
                ),

            "downtime":
                make_range(
                    "total_downtime"
                ),

            "risk":
                make_range(
                    "average_risk"
                ),

            "operations":
                make_range(
                    "operation_count"
                ),
        }

        # --------------------------------------------------------
        # Считаем score
        # --------------------------------------------------------

        results: List[
            PathScore
        ] = []

        for path, metrics in zip(
            paths,
            metrics_list,
        ):

            score_data = (
                self.calculate_score(
                    metrics,
                    ranges,
                )
            )

            results.append(
                PathScore(
                    path=path,

                    total_time=(
                        metrics[
                            "total_time"
                        ]
                    ),

                    total_cost=(
                        metrics[
                            "total_cost"
                        ]
                    ),

                    total_downtime=(
                        metrics[
                            "total_downtime"
                        ]
                    ),

                    average_risk=(
                        metrics[
                            "average_risk"
                        ]
                    ),

                    operation_count=(
                        metrics[
                            "operation_count"
                        ]
                    ),

                    normalized_time=(
                        score_data[
                            "normalized_time"
                        ]
                    ),

                    normalized_cost=(
                        score_data[
                            "normalized_cost"
                        ]
                    ),

                    normalized_downtime=(
                        score_data[
                            "normalized_downtime"
                        ]
                    ),

                    normalized_risk=(
                        score_data[
                            "normalized_risk"
                        ]
                    ),

                    normalized_operations=(
                        score_data[
                            "normalized_operations"
                        ]
                    ),

                    score=(
                        score_data[
                            "score"
                        ]
                    ),
                )
            )

        # --------------------------------------------------------
        # Сортируем:
        #
        # меньший score = лучший
        # --------------------------------------------------------

        results.sort(
            key=lambda item:
                item.score
        )

        return results

    # ============================================================
    # BEST PATH
    # ============================================================

    def best_path(
        self,
        paths: List[List[int]],
        operations: Dict[
            int,
            Dict[str, Any],
        ],
    ) -> Optional[PathScore]:
        """
        Возвращает лучший путь.
        """

        results = (
            self.score_paths(
                paths,
                operations,
            )
        )

        if not results:

            return None

        return results[0]

