"""
Gap Bridger
===========

Замыкание разрывов в производственном графе.

Получает gaps от GapDetector → предлагает варианты связей.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple
from dataclasses import dataclass
from difflib import SequenceMatcher


@dataclass
class BridgeCandidate:
    gap_type: str
    from_op: int
    to_op: int
    confidence: float          # 0..1
    reason: str
    proposed_edges: List[Tuple[int, int]]
    estimated_cost: float = 0.0


class GapBridger:
    """
    Ищет способы замкнуть разрывы в графе операций.
    """
    
    def __init__(self, graph_analyzer=None):
        self.graph_analyzer = graph_analyzer
    
    # ============================================================
    # ГЛАВНЫЙ МЕТОД
    # ============================================================
    
    def bridge_gaps(
        self,
        gaps: Dict[str, Any],
        operations: List[Dict[str, Any]],
    ) -> List[BridgeCandidate]:
        """
        Для каждого gap типа isolated / disconnected_component
        ищет варианты замыкания.
        """
        candidates: List[BridgeCandidate] = []
        op_map = {}
        for op in operations:
            key = self._norm_op(op.get("op_number"))
            if key is not None:
                op_map[key] = op
        
        for gap in gaps.get("gaps", []):
            gap_type = gap.get("type")
            
            if gap_type == "isolated_operation":
                cands = self._bridge_isolated(gap, op_map)
                candidates.extend(cands)
            
            elif gap_type == "disconnected_component":
                cands = self._bridge_component(gap, op_map)
                candidates.extend(cands)
            
            elif gap_type == "asymmetric_dependency":
                cands = self._bridge_asymmetric(gap, op_map)
                candidates.extend(cands)
        
        # Сортируем по confidence (лучшие первыми)
        candidates.sort(key=lambda c: -c.confidence)
        return candidates
    
    # ============================================================
    # ИЗОЛИРОВАННАЯ ОПЕРАЦИЯ
    # ============================================================
    
    def _bridge_isolated(
        self,
        gap: Dict[str, Any],
        op_map: Dict[int, Dict[str, Any]],
    ) -> List[BridgeCandidate]:
        """
        Ищем операции с тем же drawing/post и ближайшим op_number.
        """
        isolated_op = gap.get("op_number")
        if isolated_op is None:
            return []
        isolated_data = op_map.get(isolated_op, {})
        
        candidates = []
        
        for op_num, op_data in op_map.items():
            if op_num is None or op_num == isolated_op:
                continue
            
            score = 0.0
            reasons = []
            
            # Совпадение чертежа
            if isolated_data.get("drawing") and isolated_data.get("drawing") == op_data.get("drawing"):
                score += 0.4
                reasons.append("совпадает drawing")
            
            # Совпадение поста
            if isolated_data.get("post") and isolated_data.get("post") == op_data.get("post"):
                score += 0.3
                reasons.append("совпадает post")
            
            # Близость номеров (технологическая близость)
            num_diff = abs(op_num - isolated_op)
            if num_diff < 50:
                score += 0.2 * (1 - num_diff / 50)
                reasons.append(f"близкий номер ({num_diff})")
            
            # Похожесть названия
            name_sim = self._name_similarity(
                isolated_data.get("name", ""),
                op_data.get("name", "")
            )
            if name_sim > 0.6:
                score += 0.1 * name_sim
                reasons.append(f"похожее название ({name_sim:.2f})")
            
            if score > 0.3:
                # Предлагаем связать: op_num -> isolated_op
                # (предполагаем, что isolated_op идёт после op_num)
                edge = (op_num, isolated_op)
                candidates.append(BridgeCandidate(
                    gap_type="isolated_operation",
                    from_op=op_num,
                    to_op=isolated_op,
                    confidence=min(score, 0.95),
                    reason="; ".join(reasons),
                    proposed_edges=[edge],
                    estimated_cost=0.0,
                ))
        
        return candidates[:5]  # топ-5
    
    # ============================================================
    # НЕСВЯЗНАЯ КОМПОНЕНТА
    # ============================================================
    
    def _bridge_component(
        self,
        gap: Dict[str, Any],
        op_map: Dict[int, Dict[str, Any]],
    ) -> List[BridgeCandidate]:
        """
        Ищем «мост» между компонентой и основным графом.
        """
        component = gap.get("operations", [])
        if not component:
            return []
        
        candidates = []
        
        for comp_op in component:
            comp_data = op_map.get(comp_op, {})
            for main_op, main_data in op_map.items():
                if main_op is None or main_op in component:
                    continue
                
                score = 0.0
                reasons = []
                
                if comp_data.get("drawing") == main_data.get("drawing"):
                    score += 0.5
                    reasons.append("совпадает drawing")
                
                if comp_data.get("post") == main_data.get("post"):
                    score += 0.3
                    reasons.append("совпадает post")
                
                num_diff = abs(comp_op - main_op)
                if num_diff < 100:
                    score += 0.2 * (1 - num_diff / 100)
                
                if score > 0.3:
                    # Предполагаем направление: меньший номер -> больший
                    if comp_op < main_op:
                        edge = (comp_op, main_op)
                    else:
                        edge = (main_op, comp_op)
                    
                    candidates.append(BridgeCandidate(
                        gap_type="disconnected_component",
                        from_op=edge[0],
                        to_op=edge[1],
                        confidence=min(score, 0.9),
                        reason="; ".join(reasons),
                        proposed_edges=[edge],
                        estimated_cost=0.0,
                    ))
        
        return candidates[:3]
    
    # ============================================================
    # АСИММЕТРИЧНАЯ ЗАВИСИМОСТЬ
    # ============================================================
    
    def _bridge_asymmetric(
        self,
        gap: Dict[str, Any],
        op_map: Dict[int, Dict[str, Any]],
    ) -> List[BridgeCandidate]:
        """
        Автоисправление: дописать недостающую связь.
        """
        from_op = gap.get("from")
        to_op = gap.get("to")
        dep_type = gap.get("source_type", "")
        
        if dep_type == "missing_prev_reference":
            # A.next_ops -> B, но B.prev_ops не содержит A
            # Предлагаем: добавить A в B.prev_ops
            return [BridgeCandidate(
                gap_type="asymmetric_dependency",
                from_op=from_op,
                to_op=to_op,
                confidence=0.95,
                reason="Автоисправление: добавить prev_ops",
                proposed_edges=[(from_op, to_op)],
                estimated_cost=0.0,
            )]
        
        elif dep_type == "missing_next_reference":
            # B.prev_ops -> A, но A.next_ops не содержит B
            return [BridgeCandidate(
                gap_type="asymmetric_dependency",
                from_op=from_op,
                to_op=to_op,
                confidence=0.95,
                reason="Автоисправление: добавить next_ops",
                proposed_edges=[(from_op, to_op)],
                estimated_cost=0.0,
            )]
        
        return []
    
    # ============================================================
    # УТИЛИТЫ
    # ============================================================
    
    @staticmethod
    def _norm_op(value: Any) -> Optional[int]:
        if value is None:
            return None
        try:
            return int(float(str(value).strip()))
        except (ValueError, TypeError):
            return None
    
    @staticmethod
    def _name_similarity(a: str, b: str) -> float:
        return SequenceMatcher(None, str(a).lower(), str(b).lower()).ratio()
    
    # ============================================================
    # ПРИМЕНЕНИЕ BRIDGE К ОПЕРАЦИЯМ
    # ============================================================
    
    @staticmethod
    def apply_bridge(
        operations: List[Dict[str, Any]],
        bridge: BridgeCandidate,
    ) -> List[Dict[str, Any]]:
        """
        Мутирует список операций: добавляет недостающие prev_ops/next_ops.
        Возвращает новый список (deep copy).
        """
        from copy import deepcopy
        ops = deepcopy(operations)
        op_map = {int(float(str(op.get("op_number")).strip())): op for op in ops}
        
        for from_op, to_op in bridge.proposed_edges:
            from_data = op_map.get(from_op)
            to_data = op_map.get(to_op)
            
            if not from_data or not to_data:
                continue
            
            # Нормализуем prev_ops/next_ops
            def norm_list(val):
                if val is None:
                    return []
                if isinstance(val, str):
                    import json
                    try:
                        parsed = json.loads(val)
                        return parsed if isinstance(parsed, list) else [parsed]
                    except:
                        return [x.strip() for x in val.replace(";", ",").split(",") if x.strip()]
                if isinstance(val, (int, float)):
                    return [val]
                return list(val) if isinstance(val, (list, tuple, set)) else []
            
            # Добавляем next_ops в from_op
            next_ops = set(norm_list(from_data.get("next_ops")))
            next_ops.add(to_op)
            from_data["next_ops"] = sorted(next_ops)
            
            # Добавляем prev_ops в to_op
            prev_ops = set(norm_list(to_data.get("prev_ops")))
            prev_ops.add(from_op)
            to_data["prev_ops"] = sorted(prev_ops)
        
        return ops