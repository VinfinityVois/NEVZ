"""Path Finder — высокоуровневый API."""
from __future__ import annotations
from typing import Any, Dict, List, Optional

from .graph_analyzer import GraphAnalyzer
from .gap_detector import GapDetector
from .gap_bridger import GapBridger, BridgeCandidate
from .path_search import PathSearcher, PathSearchConfig
from .path_scorer import PathScorer, PathScoreWeights


class PathFinder:
    def __init__(
        self,
        weights: Optional[PathScoreWeights] = None,
        config: Optional[PathSearchConfig] = None,
    ) -> None:
        self.analyzer = GraphAnalyzer()
        self.detector = GapDetector(self.analyzer)
        self.bridger = GapBridger(self.analyzer)
        self.searcher = PathSearcher(config or PathSearchConfig())
        self.scorer = PathScorer(weights)

    def _build_edge_weights(
        self,
        graph: Dict[int, Set[int]],
        operations: Dict[int, Dict[str, Any]],
    ) -> Dict[tuple[int, int], float]:
        weights = {}
        for from_op, edges in graph.items():
            for to_op in edges:
                to_data = operations.get(to_op, {})
                from_data = operations.get(from_op, {})

                w = 0.0
                w += self.scorer._number(to_data.get("duration", 0)) * 0.4
                w += self.scorer._number(to_data.get("risk", 0)) * 0.1

                current_post = to_data.get("post")
                prev_post = from_data.get("post")
                if current_post and prev_post and current_post != prev_post:
                    setup = to_data.get("setup_time", 0)
                    if not setup:
                        setup = 2.0
                    w += self.scorer._number(setup) * 0.2

                current_drawing = to_data.get("drawing")
                prev_drawing = from_data.get("drawing")
                if current_drawing and prev_drawing and current_drawing != prev_drawing:
                    w += self.scorer._number(to_data.get("drawing_change_time", 1.0)) * 0.15

                weights[(from_op, to_op)] = w
        return weights

    def find_best_paths(
        self,
        operations: List[Dict[str, Any]],
        start: Optional[int] = None,
        target: Optional[int] = None,
        auto_bridge: bool = True,
    ) -> Dict[str, Any]:
        graph_result = self.analyzer.build(operations)
        gap_analysis = self.detector.analyze(operations)

        working_ops = operations
        bridges: List[BridgeCandidate] = []

        if auto_bridge and gap_analysis["summary"]["requires_ml"] > 0:
            bridges = self.bridger.bridge_gaps(gap_analysis, operations)
            for bridge in bridges:
                if bridge.confidence >= 0.7:
                    working_ops = self.bridger.apply_bridge(working_ops, bridge)
                    graph_result = self.analyzer.build(working_ops)

        op_map = {
            int(float(str(op.get("op_number")).strip())): op
            for op in working_ops
            if op.get("op_number") is not None
        }

        search_result = None
        optimal_result = None

        if start is not None:
            if target is not None:
                search_result = self.searcher.find_paths_between(
                    graph_result["graph"], start, target
                )
                # Dijkstra для оптимального пути
                edge_weights = self._build_edge_weights(
                    {int(k): set(v) for k, v in graph_result["graph"].items()},
                    op_map,
                )
                optimal_result = self.searcher.find_optimal_path(
                    graph_result["graph"], edge_weights, start, target
                )
            else:
                search_result = self.searcher.find_paths_from_root(
                    graph_result["graph"], start
                )
        else:
            search_result = self.searcher.find_all_root_to_leaf_paths(
                graph_result["graph"]
            )

        paths = search_result.get("paths", []) if search_result else []
        scored = self.scorer.score_paths(paths, op_map) if paths else []

        return {
            "success": True,
            "gaps": gap_analysis,
            "bridges_applied": len([b for b in bridges if b.confidence >= 0.7]),
            "bridge_candidates": [
                {
                    "from": b.from_op,
                    "to": b.to_op,
                    "confidence": b.confidence,
                    "reason": b.reason,
                }
                for b in bridges
            ],
            "paths": [
                {
                    "path": s.path,
                    "score": s.score,
                    "total_time": s.total_time,
                    "total_cost": s.total_cost,
                    "average_risk": s.average_risk,
                }
                for s in scored
            ],
            "best_path": scored[0].path if scored else None,
            "optimal_path": optimal_result.get("path") if optimal_result else None,
            "optimal_distance": optimal_result.get("distance") if optimal_result else None,
            "graph": graph_result,
        }