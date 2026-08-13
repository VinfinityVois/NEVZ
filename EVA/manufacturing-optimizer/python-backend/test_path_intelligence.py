from ai.path_intelligence.graph_analyzer import (
    GraphAnalyzer,
)

from ai.path_intelligence.gap_detector import (
    GapDetector,
)


operations = [

    {
        "op_number": 100,
        "name": "Подготовка",
        "drawing": "A-001",
        "post": 1,
        "brigade_id": 1,
        "prev_ops": [],
        "next_ops": [200],
    },

    {
        "op_number": 200,
        "name": "Обработка",
        "drawing": "A-001",
        "post": 2,
        "brigade_id": 1,
        "prev_ops": [100],
        "next_ops": [300],
    },

    {
        "op_number": 300,
        "name": "Сборка",
        "drawing": "A-001",
        "post": 3,
        "brigade_id": 2,
        "prev_ops": [200],
        "next_ops": [400],
    },

    {
        "op_number": 400,
        "name": "Контроль",
        "drawing": "A-001",
        "post": 4,
        "brigade_id": 2,
        "prev_ops": [300],
        "next_ops": [],
    },

    # Полностью изолированная операция
    {
        "op_number": 500,
        "name": "Изолированная операция",
        "drawing": "B-001",
        "post": 5,
        "brigade_id": 3,
        "prev_ops": [],
        "next_ops": [],
    },

    # Битая ссылка
    {
        "op_number": 600,
        "name": "Битая зависимость",
        "drawing": "C-001",
        "post": 6,
        "brigade_id": 3,
        "prev_ops": [],
        "next_ops": [9999],
    },

    # Несогласованная связь
    {
        "op_number": 700,
        "name": "Несогласованная связь",
        "drawing": "D-001",
        "post": 7,
        "brigade_id": 4,
        "prev_ops": [],
        "next_ops": [800],
    },

    {
        "op_number": 800,
        "name": "Следующая операция",
        "drawing": "D-001",
        "post": 8,
        "brigade_id": 4,
        "prev_ops": [],
        "next_ops": [],
    },

    # Самоссылка
    {
        "op_number": 900,
        "name": "Самоссылка",
        "drawing": "E-001",
        "post": 9,
        "brigade_id": 5,
        "prev_ops": [900],
        "next_ops": [900],
    },
]


print("=" * 70)
print("GRAPH ANALYZER TEST")
print("=" * 70)


analyzer = GraphAnalyzer()

graph = analyzer.build(
    operations
)


print("\nSUMMARY")
print("-" * 70)

for key, value in graph["summary"].items():
    print(f"{key:30} {value}")


print("\nROOTS")
print("-" * 70)
print(graph["roots"])


print("\nLEAVES")
print("-" * 70)
print(graph["leaves"])


print("\nISOLATED")
print("-" * 70)
print(graph["isolated"])


print("\nCYCLES")
print("-" * 70)
print(graph["cycles"])


print("\nDANGLING REFERENCES")
print("-" * 70)

for item in graph["dangling_references"]:
    print(item)


print("\nASYMMETRIC DEPENDENCIES")
print("-" * 70)

for item in graph[
    "asymmetric_dependencies"
]:
    print(item)


print("\nCOMPONENTS")
print("-" * 70)

for index, component in enumerate(
    graph["components"],
    start=1,
):
    print(
        f"Component {index}: "
        f"{component}"
    )


print("\n")
print("=" * 70)
print("GAP DETECTOR TEST")
print("=" * 70)


detector = GapDetector(
    analyzer
)

analysis = detector.analyze(
    operations
)


print("\nGAP SUMMARY")
print("-" * 70)

for key, value in analysis[
    "summary"
].items():

    print(
        f"{key:30} {value}"
    )


print("\nGAPS")
print("-" * 70)

for gap in analysis["gaps"]:

    print(
        f"[{gap['severity'].upper():8}] "
        f"{gap['type']:30} "
        f"{gap.get('op_number', '')}"
    )

    print(
        f"    {gap['reason']}"
    )


print("\n")
print("=" * 70)
print("TEST FINISHED")
print("=" * 70)

from ai.path_intelligence.path_search import (
    PathSearchConfig,
    PathSearcher,
)


def print_separator():
    print("=" * 60)


def main():

    print_separator()
    print("PATH SEARCH TEST")
    print_separator()

    # ----------------------------------------------------------
    # Тестовый производственный граф
    # ----------------------------------------------------------

    graph = {
        100: {200},
        200: {300, 350},
        300: {400},
        350: {450},
        400: {500},
        450: {500},
        500: set(),
    }

    # ----------------------------------------------------------
    # Создаём поисковик
    # ----------------------------------------------------------

    searcher = PathSearcher(
        PathSearchConfig(
            max_paths=100,
            max_depth=20,
        )
    )

    # ----------------------------------------------------------
    # 1. Все пути 100 -> 500
    # ----------------------------------------------------------

    print()
    print("PATHS 100 -> 500")
    print("-" * 60)

    result = searcher.find_paths_between(
        graph,
        100,
        500,
    )

    print(
        f"success: {result['success']}"
    )

    print(
        f"count: {result['count']}"
    )

    print(
        f"truncated: {result['truncated']}"
    )

    for index, path in enumerate(
        result["paths"],
        start=1,
    ):

        print(
            f"Path {index}: "
            f"{path}"
        )

    # ----------------------------------------------------------
    # 2. Кратчайший путь
    # ----------------------------------------------------------

    print()
    print("SHORTEST PATH")
    print("-" * 60)

    shortest = searcher.find_shortest_path(
        graph,
        100,
        500,
    )

    print(
        f"success: "
        f"{shortest['success']}"
    )

    print(
        f"path: "
        f"{shortest['path']}"
    )

    print(
        f"distance: "
        f"{shortest['distance']}"
    )

    # ----------------------------------------------------------
    # 3. Пути от корня
    # ----------------------------------------------------------

    print()
    print("ROOT -> LEAF PATHS")
    print("-" * 60)

    root_result = (
        searcher.find_paths_from_root(
            graph,
            100,
        )
    )

    for index, path in enumerate(
        root_result["paths"],
        start=1,
    ):

        print(
            f"Path {index}: "
            f"{path}"
        )

    # ----------------------------------------------------------
    # 4. Проверяем защиту от цикла
    # ----------------------------------------------------------

    print()
    print("CYCLE PROTECTION")
    print("-" * 60)

    cyclic_graph = {
        100: {200},
        200: {300},
        300: {100, 400},
        400: set(),
    }

    cycle_result = (
        searcher.find_paths_between(
            cyclic_graph,
            100,
            400,
        )
    )

    print(
        f"success: "
        f"{cycle_result['success']}"
    )

    print(
        f"paths: "
        f"{cycle_result['paths']}"
    )

    print(
        f"count: "
        f"{cycle_result['count']}"
    )

    # ----------------------------------------------------------
    # 5. Проверяем max_depth
    # ----------------------------------------------------------

    print()
    print("DEPTH LIMIT")
    print("-" * 60)

    limited_searcher = PathSearcher(
        PathSearchConfig(
            max_paths=100,
            max_depth=3,
        )
    )

    depth_result = (
        limited_searcher.find_paths_between(
            graph,
            100,
            500,
        )
    )

    print(
        f"success: "
        f"{depth_result['success']}"
    )

    print(
        f"paths: "
        f"{depth_result['paths']}"
    )

    print(
        f"count: "
        f"{depth_result['count']}"
    )

    print(
        f"truncated: "
        f"{depth_result['truncated']}"
    )

    # ----------------------------------------------------------
    # 6. Проверяем отсутствующую вершину
    # ----------------------------------------------------------

    print()
    print("INVALID START")
    print("-" * 60)

    invalid_result = (
        searcher.find_paths_between(
            graph,
            999,
            500,
        )
    )

    print(
        f"success: "
        f"{invalid_result['success']}"
    )

    print(
        f"error: "
        f"{invalid_result.get('error')}"
    )

    print()
    print_separator()
    print("TEST FINISHED")
    print_separator()

from ai.path_intelligence.path_scorer import (
    PathScorer,
    PathScoreWeights,
)


def main():

    print("=" * 60)
    print("PATH SCORER TEST")
    print("=" * 60)

    # ==========================================================
    # Граф
    # ==========================================================

    graph = {
        100: {200},
        200: {300, 350},
        300: {400},
        350: {450},
        400: {500},
        450: {500},
        500: set(),
    }

    # ==========================================================
    # Данные операций
    #
    # Здесь специально делаем второй путь более выгодным.
    # ==========================================================

    operations = {

        100: {
            "duration": 10,
            "cost": 100,
            "downtime": 2,
            "risk": 0.05,
        },

        200: {
            "duration": 15,
            "cost": 200,
            "downtime": 3,
            "risk": 0.10,
        },

        300: {
            "duration": 30,
            "cost": 400,
            "downtime": 8,
            "risk": 0.30,
        },

        350: {
            "duration": 10,
            "cost": 100,
            "downtime": 2,
            "risk": 0.05,
        },

        400: {
            "duration": 30,
            "cost": 350,
            "downtime": 7,
            "risk": 0.25,
        },

        450: {
            "duration": 15,
            "cost": 100,
            "downtime": 2,
            "risk": 0.05,
        },

        500: {
            "duration": 10,
            "cost": 100,
            "downtime": 2,
            "risk": 0.05,
        },
    }

    # ==========================================================
    # Получаем пути
    # ==========================================================

    paths = [
        [
            100,
            200,
            300,
            400,
            500,
        ],
        [
            100,
            200,
            350,
            450,
            500,
        ],
    ]

    # ==========================================================
    # Создаём scorer
    # ==========================================================

    scorer = PathScorer(
        PathScoreWeights(
            time=0.40,
            cost=0.30,
            downtime=0.10,
            risk=0.10,
            operations=0.10,
        )
    )

    # ==========================================================
    # Оцениваем
    # ==========================================================

    results = scorer.score_paths(
        paths,
        operations,
    )

    # ==========================================================
    # Вывод
    # ==========================================================

    print()
    print("PATH RESULTS")
    print("-" * 60)

    for index, result in enumerate(
        results,
        start=1,
    ):

        print(
            f"Path {index}: "
            f"{result.path}"
        )

        print(
            f"  time: "
            f"{result.total_time}"
        )

        print(
            f"  cost: "
            f"{result.total_cost}"
        )

        print(
            f"  downtime: "
            f"{result.total_downtime}"
        )

        print(
            f"  risk: "
            f"{result.average_risk:.3f}"
        )

        print(
            f"  operations: "
            f"{result.operation_count}"
        )

        print(
            f"  score: "
            f"{result.score:.4f}"
        )

        print()

    # ==========================================================
    # Лучший путь
    # ==========================================================

    best = scorer.best_path(
        paths,
        operations,
    )

    print("-" * 60)
    print("BEST PATH")
    print("-" * 60)

    if best is not None:

        print(
            f"path: "
            f"{best.path}"
        )

        print(
            f"score: "
            f"{best.score:.4f}"
        )

        print(
            f"time: "
            f"{best.total_time}"
        )

        print(
            f"cost: "
            f"{best.total_cost}"
        )

    else:

        print(
            "No valid paths."
        )

    print()
    print("=" * 60)
    print("TEST FINISHED")
    print("=" * 60)


if __name__ == "__main__":
    main()