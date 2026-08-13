"""GapBridger — предложения связей для разрывов."""
from typing import Dict, List, Any
from difflib import SequenceMatcher


class GapBridger:
    def propose(
        self,
        operations: List[Dict],
        gaps: List[Dict],
        min_confidence: float = 0.3,
        auto_threshold: float = 0.75,
    ) -> Dict[str, Any]:
        by_num = {}
        for op in operations or []:
            num = str(op.get("op_number") or op.get("id") or "").strip()
            if num:
                by_num[num] = op

        proposals: List[Dict] = []
        seen = set()
        targets = []
        for g in gaps or []:
            if g.get("type") in (
                "isolated_operation",
                "disconnected_component",
                "dangling_prev",
                "dangling_next",
            ):
                targets.append(str(g.get("op_number")))
        for num, op in by_num.items():
            if not (op.get("prev_ops") or []) and not (op.get("next_ops") or []):
                targets.append(num)
        targets = list(dict.fromkeys([t for t in targets if t]))

        def score(a: Dict, b: Dict):
            conf = 0.0
            reasons = []
            da, db = (a.get("drawing") or "").strip(), (b.get("drawing") or "").strip()
            if da and db and da == db:
                conf += 0.45
                reasons.append(f"чертёж «{da}» +0.45")
            pa, pb = (a.get("post") or "").strip(), (b.get("post") or "").strip()
            if pa and pb and pa == pb:
                conf += 0.30
                reasons.append(f"пост «{pa}» +0.30")
            try:
                na = int(float(str(a.get("op_number") or a.get("id"))))
                nb = int(float(str(b.get("op_number") or b.get("id"))))
                diff = abs(na - nb)
                if 0 < diff <= 20:
                    conf += 0.20
                    reasons.append(f"номера Δ{diff} +0.20")
                elif diff <= 50:
                    conf += 0.10
                    reasons.append(f"номера Δ{diff} +0.10")
            except Exception:
                pass
            sa, sb = (a.get("name") or ""), (b.get("name") or "")
            if sa and sb:
                sim = SequenceMatcher(None, sa.lower(), sb.lower()).ratio()
                if sim >= 0.55:
                    conf += 0.10 * sim
                    reasons.append(f"названия {sim:.2f}")
            return conf, reasons

        nums = list(by_num.keys())
        for t in targets:
            a = by_num.get(t)
            if not a:
                continue
            best = []
            for other in nums:
                if other == t:
                    continue
                conf, reasons = score(a, by_num[other])
                if conf < min_confidence:
                    continue
                try:
                    na, nb = float(t), float(other)
                    frm, to = (t, other) if na <= nb else (other, t)
                except Exception:
                    frm, to = t, other
                key = (frm, to)
                if key in seen:
                    continue
                seen.add(key)
                best.append({
                    "from": frm,
                    "to": to,
                    "confidence": round(conf, 3),
                    "auto_apply": conf >= auto_threshold,
                    "reasons": reasons,
                    "from_name": (by_num.get(frm) or {}).get("name"),
                    "to_name": (by_num.get(to) or {}).get("name"),
                    "message": f"Связь #{frm} → #{to} ({conf:.2f})",
                })
            best.sort(key=lambda x: -x["confidence"])
            proposals.extend(best[:3])

        proposals.sort(key=lambda x: -x["confidence"])
        auto = [p for p in proposals if p["auto_apply"]]
        manual = [p for p in proposals if not p["auto_apply"]]
        return {
            "proposals": proposals[:80],
            "auto_apply": auto[:30],
            "need_confirm": manual[:50],
            "count": len(proposals),
        }

    def apply_links(self, operations: List[Dict], links: List[Dict]) -> List[Dict]:
        by_num = {}
        out = []
        for op in operations or []:
            o = dict(op)
            num = str(o.get("op_number") or o.get("id") or "").strip()
            o["prev_ops"] = [str(x) for x in (o.get("prev_ops") or [])]
            o["next_ops"] = [str(x) for x in (o.get("next_ops") or [])]
            if num:
                by_num[num] = o
            out.append(o)
        for link in links or []:
            frm, to = str(link["from"]), str(link["to"])
            if frm not in by_num or to not in by_num:
                continue
            if to not in by_num[frm]["next_ops"]:
                by_num[frm]["next_ops"].append(to)
            if frm not in by_num[to]["prev_ops"]:
                by_num[to]["prev_ops"].append(frm)
        return out