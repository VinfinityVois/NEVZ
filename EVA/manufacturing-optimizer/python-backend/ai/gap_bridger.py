"""GapBridger — предложения связей для разрывов цепочки.

Улучшения (без смены API):
- учитывает gap['ref'] (несуществующий prev/next)
- для dangling_prev предлагает только X → op (замена дыры)
- для dangling_next предлагает только op → Y
- ниже порог confidence для дыр в нумерации
- бонус за соседний/близкий меньший номер и общий префикс имени
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple
from difflib import SequenceMatcher


class GapBridger:
    def propose(
        self,
        operations: List[Dict],
        gaps: List[Dict],
        min_confidence: float = 0.22,
        auto_threshold: float = 0.70,
    ) -> Dict[str, Any]:
        by_num: Dict[str, Dict] = {}
        for op in operations or []:
            num = str(op.get("op_number") or op.get("id") or "").strip()
            if num:
                by_num[num] = op

        nums = list(by_num.keys())

        def _norm_list(xs) -> List[str]:
            out: List[str] = []
            for x in xs or []:
                try:
                    out.append(str(int(float(str(x).strip()))))
                except Exception:
                    s = str(x).strip()
                    if s:
                        out.append(s)
            return out

        def _has_edge(frm: str, to: str) -> bool:
            a, b = by_num.get(str(frm)), by_num.get(str(to))
            if not a or not b:
                return False
            return to in _norm_list(a.get("next_ops")) or frm in _norm_list(
                b.get("prev_ops")
            )

        def _post_num(op: Dict):
            p = op.get("post")
            if p is None or p == "":
                return None
            try:
                return int(float(str(p).strip()))
            except Exception:
                return None

        def _name_prefix(op: Dict) -> str:
            return (op.get("name") or "").split(":")[0].strip().lower()

        def score(a: Dict, b: Dict) -> Tuple[float, List[str]]:
            conf = 0.0
            reasons: List[str] = []

            pa_n, pb_n = _post_num(a), _post_num(b)
            if pa_n is not None and pb_n is not None:
                if pb_n == pa_n:
                    conf += 0.25
                    reasons.append(f"один пост {pa_n}")
                elif pb_n == pa_n + 1:
                    conf += 0.40
                    reasons.append(f"маршрут пост {pa_n}→{pb_n}")
                elif 0 < (pb_n - pa_n) <= 3:
                    conf += 0.18
                    reasons.append(f"посты рядом {pa_n}→{pb_n}")
                elif pb_n < pa_n:
                    conf -= 0.25
                    reasons.append(f"назад по посту {pa_n}→{pb_n}")

            da = (a.get("drawing") or "").strip()
            db = (b.get("drawing") or "").strip()
            if da and db and da == db:
                conf += 0.40
                reasons.append("один чертёж")

            na_p, nb_p = _name_prefix(a), _name_prefix(b)
            if na_p and nb_p and na_p == nb_p:
                conf += 0.22
                reasons.append("один маршрут/префикс")

            try:
                na = int(float(str(a.get("op_number") or a.get("id"))))
                nb = int(float(str(b.get("op_number") or b.get("id"))))
                diff = abs(na - nb)
                if diff == 1:
                    conf += 0.30
                    reasons.append("соседние номера")
                elif diff <= 5:
                    conf += 0.18
                    reasons.append(f"номера Δ{diff}")
                elif diff <= 20:
                    conf += 0.10
                    reasons.append(f"номера Δ{diff}")
                elif diff <= 50:
                    conf += 0.05
                if na < nb:
                    conf += 0.05
            except Exception:
                pass

            sa, sb = (a.get("name") or ""), (b.get("name") or "")
            if sa and sb:
                sim = SequenceMatcher(None, sa.lower(), sb.lower()).ratio()
                if sim >= 0.50:
                    conf += 0.12 * sim
                    reasons.append(f"названия {sim:.2f}")

            return max(0.0, min(conf, 0.99)), reasons

        def _add_proposal(
            frm: str,
            to: str,
            conf: float,
            reasons: List[str],
            gap_type: str,
            seen: set,
            proposals: List[Dict],
        ) -> None:
            if frm not in by_num or to not in by_num or frm == to:
                return
            if _has_edge(frm, to):
                return
            key = (frm, to)
            if key in seen:
                return
            if conf < 0.12:
                return
            seen.add(key)
            proposals.append(
                {
                    "from": frm,
                    "to": to,
                    "confidence": round(conf, 3),
                    "auto_apply": conf >= auto_threshold,
                    "reasons": reasons,
                    "from_name": by_num[frm].get("name"),
                    "to_name": by_num[to].get("name"),
                    "message": f"Связь #{frm} → #{to} ({conf:.2f})",
                    "gap_type": gap_type,
                }
            )

        proposals: List[Dict] = []
        seen = set()

        # --- 1) По каждому gap целенаправленно ---
        for g in gaps or []:
            gtype = str(g.get("type") or "")
            to_raw = g.get("op_number")
            if to_raw is None:
                continue
            node = str(to_raw).strip()
            if node not in by_num:
                continue

            ref = g.get("ref")
            ref_s = str(ref).strip() if ref is not None else None

            # --- dangling_prev: нужен предшественник → node ---
            if gtype == "dangling_prev":
                target = by_num[node]
                td = (target.get("drawing") or "").strip()
                tprefix = _name_prefix(target)
                cands: List[str] = []

                # если ref существует в данных — он приоритет
                if ref_s and ref_s in by_num and ref_s != node:
                    cands.append(ref_s)

                for n, op in by_num.items():
                    if n == node:
                        continue
                    if td and (op.get("drawing") or "").strip() == td:
                        cands.append(n)
                    elif tprefix and _name_prefix(op) == tprefix:
                        cands.append(n)

                # ближайшие меньшие номера (типично #102 без #101)
                try:
                    tnum = int(float(node))
                    lower = []
                    for n in nums:
                        if n == node:
                            continue
                        try:
                            ni = int(float(n))
                            if ni < tnum:
                                lower.append((tnum - ni, n))
                        except Exception:
                            pass
                    lower.sort()
                    for _, n in lower[:30]:
                        cands.append(n)
                except Exception:
                    pass

                if not cands:
                    cands = [n for n in nums if n != node][:30]

                cands = list(dict.fromkeys(cands))[:30]
                local_best: List[Tuple[float, str, List[str]]] = []

                for frm in cands:
                    if frm not in by_num or frm == node:
                        continue
                    if _has_edge(frm, node):
                        continue
                    conf, reasons = score(by_num[frm], by_num[node])
                    try:
                        delta = int(float(node)) - int(float(frm))
                        if delta == 1:
                            conf = min(0.99, conf + 0.35)
                            reasons = reasons + ["следующий номер"]
                        elif 0 < delta <= 5:
                            conf = min(0.99, conf + 0.15)
                            reasons = reasons + ["близкий меньший номер"]
                    except Exception:
                        pass
                    if ref_s and frm == ref_s:
                        conf = min(0.99, conf + 0.20)
                        reasons = reasons + ["по ref разрыва"]
                    reasons = reasons + ["замена dangling_prev"]
                    if conf >= 0.12:
                        local_best.append((conf, frm, reasons))

                local_best.sort(key=lambda x: -x[0])
                for conf, frm, reasons in local_best[:5]:
                    _add_proposal(frm, node, conf, reasons, gtype, seen, proposals)
                continue

            # --- dangling_next: node → кандидат ---
            if gtype == "dangling_next":
                src = by_num[node]
                sd = (src.get("drawing") or "").strip()
                sprefix = _name_prefix(src)
                cands = []
                if ref_s and ref_s in by_num and ref_s != node:
                    cands.append(ref_s)
                for n, op in by_num.items():
                    if n == node:
                        continue
                    if sd and (op.get("drawing") or "").strip() == sd:
                        cands.append(n)
                    elif sprefix and _name_prefix(op) == sprefix:
                        cands.append(n)
                try:
                    tnum = int(float(node))
                    higher = []
                    for n in nums:
                        if n == node:
                            continue
                        try:
                            ni = int(float(n))
                            if ni > tnum:
                                higher.append((ni - tnum, n))
                        except Exception:
                            pass
                    higher.sort()
                    for _, n in higher[:30]:
                        cands.append(n)
                except Exception:
                    pass
                cands = list(dict.fromkeys(cands))[:30]
                local_best = []
                for cand in cands:
                    if cand not in by_num or cand == node:
                        continue
                    if _has_edge(node, cand):
                        continue
                    conf, reasons = score(by_num[node], by_num[cand])
                    try:
                        delta = int(float(cand)) - int(float(node))
                        if delta == 1:
                            conf = min(0.99, conf + 0.35)
                            reasons = reasons + ["следующий номер"]
                        elif 0 < delta <= 5:
                            conf = min(0.99, conf + 0.15)
                    except Exception:
                        pass
                    reasons = reasons + ["замена dangling_next"]
                    if conf >= 0.12:
                        local_best.append((conf, cand, reasons))
                local_best.sort(key=lambda x: -x[0])
                for conf, cand, reasons in local_best[:5]:
                    _add_proposal(node, cand, conf, reasons, gtype, seen, proposals)
                continue

            # --- isolated / disconnected / asymmetric ---
            if gtype in (
                "isolated_operation",
                "disconnected_component",
                "asymmetric_dependency",
            ):
                a = by_num[node]
                local_best = []
                for other in nums:
                    if other == node:
                        continue
                    conf, reasons = score(a, by_num[other])
                    if conf < min_confidence:
                        continue
                    # направление по номерам/постам
                    try:
                        na, nb = float(node), float(other)
                    except Exception:
                        na, nb = 0.0, 1.0
                    pa_n, pb_n = _post_num(a), _post_num(by_num[other])
                    if pa_n is not None and pb_n is not None and pa_n != pb_n:
                        frm, to = (node, other) if pa_n < pb_n else (other, node)
                    else:
                        frm, to = (node, other) if na <= nb else (other, node)
                    if gtype == "asymmetric_dependency" and ref_s:
                        # next без prev → node → ref
                        frm, to = node, ref_s if ref_s in by_num else to
                    local_best.append((conf, frm, to, reasons + [gtype]))
                local_best.sort(key=lambda x: -x[0])
                for conf, frm, to, reasons in local_best[:3]:
                    _add_proposal(frm, to, conf, reasons, gtype, seen, proposals)

        # --- 2) fallback: изолированные без gap-записи ---
        for num, op in by_num.items():
            if op.get("prev_ops") or op.get("next_ops"):
                continue
            if op.get("status") == "completed":
                continue
            if any(p["to"] == num or p["from"] == num for p in proposals):
                continue
            local_best = []
            for other in nums:
                if other == num:
                    continue
                conf, reasons = score(op, by_num[other])
                if conf < min_confidence:
                    continue
                try:
                    frm, to = (
                        (num, other)
                        if float(num) <= float(other)
                        else (other, num)
                    )
                except Exception:
                    frm, to = num, other
                local_best.append((conf, frm, to, reasons))
            local_best.sort(key=lambda x: -x[0])
            for conf, frm, to, reasons in local_best[:2]:
                _add_proposal(frm, to, conf, reasons, "isolated_fallback", seen, proposals)

        proposals.sort(key=lambda x: -x["confidence"])
        # не предлагать слишком много рёбер на один узел (читаемость графа)
        per_node: Dict[str, int] = {}
        filtered: List[Dict] = []
        for p in proposals:
            f, t = p["from"], p["to"]
            if per_node.get(f, 0) >= 3 or per_node.get(t, 0) >= 3:
                continue
            per_node[f] = per_node.get(f, 0) + 1
            per_node[t] = per_node.get(t, 0) + 1
            filtered.append(p)

        proposals = filtered[:80]
        auto = [p for p in proposals if p.get("auto_apply")]
        manual = [p for p in proposals if not p.get("auto_apply")]
        return {
            "proposals": proposals,
            "auto_apply": auto[:30],
            "need_confirm": manual[:50],
            "count": len(proposals),
        }

    def apply_links(self, operations: List[Dict], links: List[Dict]) -> List[Dict]:
        by_num: Dict[str, Dict] = {}
        out: List[Dict] = []
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
