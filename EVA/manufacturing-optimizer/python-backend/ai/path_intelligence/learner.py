"""
Path Intelligence Learner
=========================

Сохраняет feedback о применённых bridges и выбранных путях.
Корректирует веса PathScorer на основе реальных результатов.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from dataclasses import dataclass, asdict


@dataclass
class BridgeFeedback:
    gap_type: str
    from_op: int
    to_op: int
    confidence: float
    success: bool           # True = bridge сработал, граф стал целостным
    actual_delay_hours: float = 0.0


@dataclass
class PathFeedback:
    path: List[int]
    planned_score: float
    actual_duration: float
    actual_cost: float
    on_time: bool


class PathIntelligenceLearner:
    """
    Простой онлайн-learner без тяжёлых зависимостей.
    Хранит историю в памяти (можно сериализовать в JSON).
    """
    
    def __init__(self):
        self.bridge_history: List[BridgeFeedback] = []
        self.path_history: List[PathFeedback] = []
        self.gap_type_success: Dict[str, Dict[str, Any]] = {}
    
    def record_bridge(self, feedback: BridgeFeedback) -> None:
        self.bridge_history.append(feedback)
        
        gt = feedback.gap_type
        if gt not in self.gap_type_success:
            self.gap_type_success[gt] = {"success": 0, "total": 0}
        
        self.gap_type_success[gt]["total"] += 1
        if feedback.success:
            self.gap_type_success[gt]["success"] += 1
    
    def record_path(self, feedback: PathFeedback) -> None:
        self.path_history.append(feedback)
    
    def get_bridge_success_rate(self, gap_type: str) -> float:
        stats = self.gap_type_success.get(gap_type, {"success": 0, "total": 0})
        if stats["total"] == 0:
            return 0.5
        return stats["success"] / stats["total"]
    
    def suggest_weights_adjustment(self) -> Dict[str, float]:
        """
        Если реальные пути систематически длиннее запланированных —
        увеличиваем вес time, уменьшаем cost.
        """
        if len(self.path_history) < 5:
            return {}
        
        on_time_count = sum(1 for p in self.path_history if p.on_time)
        total = len(self.path_history)
        on_time_rate = on_time_count / total
        
        adjustments = {}
        
        if on_time_rate < 0.7:
            # Срываем сроки — увеличиваем вес времени
            adjustments["time"] = +0.05
            adjustments["cost"] = -0.03
        
        if on_time_rate > 0.95:
            # Всё идёт идеально — можно чуть сэкономить
            adjustments["cost"] = +0.03
            adjustments["time"] = -0.02
        
        return adjustments
    
    def export(self) -> Dict[str, Any]:
        return {
            "bridge_history": [asdict(b) for b in self.bridge_history],
            "path_history": [asdict(p) for p in self.path_history],
            "gap_type_success": self.gap_type_success,
        }
    
    @classmethod
    def import_(cls, data: Dict[str, Any]) -> "PathIntelligenceLearner":
        learner = cls()
        learner.gap_type_success = data.get("gap_type_success", {})
        # bridge_history / path_history можно восстановить при необходимости
        return learner