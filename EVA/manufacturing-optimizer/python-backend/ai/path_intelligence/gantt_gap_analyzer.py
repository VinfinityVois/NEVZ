"""
Gantt Gap Analyzer
==================

Сверка диаграммы Ганта с графом операций.
Ищет временные разрывы, которые не объясняются технологией.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from datetime import datetime


class GanttGapAnalyzer:
    """
    Проверяет: если в графе A -> B, то в Ганта B.start должна быть
    близка к A.end (с учётом setup_time).
    """
    
    def analyze(
        self,
        plan: Dict[str, Any],
        graph: Dict[int, Any],
        operations: List[Dict[str, Any]],
        max_acceptable_gap_hours: float = 48.0,
    ) -> List[Dict[str, Any]]:
        """
        Возвращает список временных разрывов.
        """
        gaps = []
        task_map = {t.get("id", t.get("op_number")): t for t in plan.get("tasks", [])}
        op_map = {
            int(float(str(op.get("op_number")).strip())): op
            for op in operations
            if op.get("op_number") is not None
        }
        
        for node_str, edges in graph.items():
            try:
                node = int(float(str(node_str).strip()))
            except (ValueError, TypeError):
                continue
            
            task_a = task_map.get(node) or task_map.get(str(node))
            if not task_a:
                continue
            
            for next_node in edges:
                task_b = task_map.get(next_node) or task_map.get(str(next_node))
                if not task_b:
                    continue
                
                # Парсим даты
                try:
                    end_a = datetime.fromisoformat(task_a["end"].replace("Z", "+00:00"))
                    start_b = datetime.fromisoformat(task_b["start"].replace("Z", "+00:00"))
                except (KeyError, ValueError):
                    continue
                
                gap_hours = (start_b - end_a).total_seconds() / 3600
                
                # Ожидаемый setup_time
                op_b = op_map.get(next_node, {})
                expected_setup = op_b.get("setup_time", 0)  # в часах
                
                # Если gap больше setup_time + допуск
                if gap_hours > expected_setup + max_acceptable_gap_hours:
                    gaps.append({
                        "type": "temporal_gap",
                        "from_op": node,
                        "to_op": next_node,
                        "from_task_name": task_a.get("name"),
                        "to_task_name": task_b.get("name"),
                        "gap_hours": round(gap_hours, 2),
                        "expected_setup_hours": expected_setup,
                        "excess_hours": round(gap_hours - expected_setup, 2),
                        "severity": "high" if gap_hours > expected_setup + 168 else "medium",
                        "reason": (
                            f"Между операцией {node} и {next_node} "
                            f"зазор {gap_hours:.1f}ч, "
                            f"ожидалось ≤ {expected_setup + max_acceptable_gap_hours:.1f}ч"
                        ),
                    })
        
        return sorted(gaps, key=lambda x: -x["excess_hours"])