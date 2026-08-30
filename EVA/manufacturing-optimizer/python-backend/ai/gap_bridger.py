"""GapBridger — предложения связей для разрывов цепочки.

Улучшения:
- dangling_prev/next: всегда ищем ближайшие существующие номера (floor confidence)
- token-overlap по имени, даже без drawing/post
- ниже порог для «дыр» (0.08), иначе на реальных данных НЭВЗ proposals=0
- API propose/apply_links без изменений
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple
from difflib import SequenceMatcher


class GapBridger:
    def propose(
        self,
        operations: List[Dict],
        gaps: List[Dict],
        min_confidence: float = 0.18,
        auto_threshold: float = 0.70,
    ) -> Dict[str, Any]:
        by_num: Dict[str, Dict] = {}
        for op in operations or []:
            num = str(op.get("op_number") or op.get("id") or "").strip()
            if not num:
                continue
            # нормализация "464.0" → "464"
            try:
                num = str(int(float(num)))
            except Exception:
                pass
            by_num[num] = op

        def _norm_id(x) -> str:
            s = str(x or "").strip()
            if s.upper().startswith("T"):
                s = s[1:].strip()
            try:
                return str(int(float(s)))
            except Exception:
                return s

        # пересобрать by_num с нормализованными prev/next внутри score/_has_edge
        nums_int: List[Tuple[int, str]] = []
        for n in by_num.keys():
            try:
                nums_int.append((int(float(n)), n))
            except Exception:
                pass
        nums_int.sort()
        nums = [n for _, n in nums_int]

        def _norm_list(xs) -> List[str]:
            out: List[str] = []
            for x in xs or []:
                s = _norm_id(x)
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

        def _tokens(op: Dict) -> set:
            import re
            name = (op.get("name") or "").lower()
            return set(re.findall(r"[a-zа-яё0-9]{3,}", name, flags=re.I))

        def score(a: Dict, b: Dict) -> Tuple[float, List[str]]:
            conf = 0.0
            reasons: List[str] = []

            pa_n, pb_n = _post_num(a), _post_num(b)
            if pa_n is not None and pb_n is not None:
                if pb_n == pa_n:
                    conf += 0.25
                    reasons.append(f"один пост {pa_n}")
                elif pb_n == pa_n + 1:
                    conf += 0.30
                    reasons.append(f"пост {pa_n}→{pb_n}")
                elif abs(pb_n - pa_n) <= 2:
                    conf += 0.12
                    reasons.append(f"посты рядом {pa_n}/{pb_n}")

            da = (a.get("drawing") or "").strip()
            db = (b.get("drawing") or "").strip()
            if da and db and da == db:
                conf += 0.40
                reasons.append("один чертёж")

            na_p, nb_p = _name_prefix(a), _name_prefix(b)
            if na_p and nb_p and len(na_p) >= 3 and na_p == nb_p:
                conf += 0.22
                reasons.append("один маршрут/префикс")

            ta, tb = _tokens(a), _tokens(b)
            if ta and tb:
                inter = ta & tb
                if inter:
                    conf += min(0.20, 0.08 * len(inter))
                    reasons.append("общие слова: " + ",".join(list(inter)[:3]))

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
                    conf += 0.12
                    reasons.append(f"номера Δ{diff}")
                elif diff <= 50:
                    conf += 0.08
                    reasons.append(f"номера Δ{diff}")
                elif diff <= 150:
                    conf += 0.05
                    reasons.append(f"номера Δ{diff}")
                if na < nb:
                    conf += 0.04
            except Exception:
                pass

            sa, sb = (a.get("name") or ""), (b.get("name") or "")
            if sa and sb:
                sim = SequenceMatcher(None, sa.lower(), sb.lower()).ratio()
                if sim >= 0.35:
                    conf += 0.14 * sim
                    reasons.append(f"названия {sim:.2f}")

            return max(0.0, min(conf, 0.99)), reasons

        def _nearest_ids(node: str, limit: int = 15, prefer_lower: bool = True) -> List[str]:
            """Ближайшие существующие номера (сначала меньшие — типичный prev)."""
            try:
                t = int(float(node))
            except Exception:
                return [n for n in nums if n != node][:limit]
            scored: List[Tuple[float, str]] = []
            for ni, n in nums_int:
                if n == node:
                    continue
                dist = abs(t - ni)
                # меньший номер чуть предпочтительнее для prev
                pen = 0.0 if (prefer_lower and ni < t) else 0.15
                scored.append((dist + pen * 1000, n))
            scored.sort()
            return [n for _, n in scored[:limit]]

        def _add_proposal(
            frm: str,
            to: str,
            conf: float,
            reasons: List[str],
            gap_type: str,
            seen: set,
            proposals: List[Dict],
            floor: float = 0.08,
        ) -> None:
            frm, to = _norm_id(frm), _norm_id(to)
            if frm not in by_num or to not in by_num or frm == to:
                return
            if _has_edge(frm, to):
                return
            key = (frm, to)
            if key in seen:
                return
            if conf < floor:
                return
            seen.add(key)
            proposals.append(
                {
                    "from": frm,
                    "to": to,
                    "confidence": round(float(conf), 3),
                    "auto_apply": conf >= auto_threshold,
                    "reasons": reasons[:8],
                    "from_name": by_num[frm].get("name"),
                    "to_name": by_num[to].get("name"),
                    "message": f"Связь #{frm} → #{to} ({round(conf * 100)}%)",
                    "gap_type": gap_type,
                }
            )

        proposals: List[Dict] = []
        seen: set = set()

        for g in gaps or []:
            gtype = str(g.get("type") or "")
            to_raw = g.get("op_number")
            if to_raw is None:
                continue
            node = _norm_id(to_raw)
            if node not in by_num:
                continue

            ref = g.get("ref")
            ref_s = _norm_id(ref) if ref is not None else None

            # --- dangling_prev: кандидат → node ---
            if gtype == "dangling_prev":
                target = by_num[node]
                td = (target.get("drawing") or "").strip()
                tprefix = _name_prefix(target)
                cands: List[str] = []

                if ref_s and ref_s in by_num and ref_s != node:
                    cands.append(ref_s)

                for n, op in by_num.items():
                    if n == node:
                        continue
                    if td and (op.get("drawing") or "").strip() == td:
                        cands.append(n)
                    elif tprefix and len(tprefix) >= 3 and _name_prefix(op) == tprefix:
                        cands.append(n)

                # ключ фикса: всегда ближайшие номера
                cands.extend(_nearest_ids(node, limit=20, prefer_lower=True))

                cands = list(dict.fromkeys(cands))[:40]
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
                            conf = min(0.99, conf + 0.18)
                            reasons = reasons + ["близкий меньший номер"]
                        elif 0 < delta <= 30:
                            conf = min(0.99, conf + 0.10)
                            reasons = reasons + ["меньший номер в окрестности"]
                        elif delta > 0:
                            # гарантированный минимум для «есть кого поставить вместо дыры»
                            conf = max(conf, 0.10)
                            reasons = reasons + ["ближайший существующий prev"]
                    except Exception:
                        conf = max(conf, 0.10)
                        reasons = reasons + ["кандидат на prev"]
                    if ref_s and frm == ref_s:
                        conf = min(0.99, conf + 0.20)
                        reasons = reasons + ["по ref разрыва"]
                    reasons = reasons + ["замена dangling_prev"]
                    local_best.append((conf, frm, reasons))

                local_best.sort(key=lambda x: -x[0])
                # всегда хотя бы top-3 если есть кандидаты
                for conf, frm, reasons in local_best[:5]:
                    _add_proposal(frm, node, conf, reasons, gtype, seen, proposals, floor=0.08)
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
                    elif sprefix and len(sprefix) >= 3 and _name_prefix(op) == sprefix:
                        cands.append(n)
                cands.extend(_nearest_ids(node, limit=20, prefer_lower=False))
                cands = list(dict.fromkeys(cands))[:40]
                local_best = []
                for to in cands:
                    if to not in by_num or to == node:
                        continue
                    if _has_edge(node, to):
                        continue
                    conf, reasons = score(by_num[node], by_num[to])
                    try:
                        delta = int(float(to)) - int(float(node))
                        if delta == 1:
                            conf = min(0.99, conf + 0.35)
                            reasons = reasons + ["следующий номер"]
                        elif 0 < delta <= 30:
                            conf = min(0.99, conf + 0.12)
                            reasons = reasons + ["больший номер рядом"]
                        elif delta > 0:
                            conf = max(conf, 0.10)
                            reasons = reasons + ["ближайший существующий next"]
                    except Exception:
                        conf = max(conf, 0.10)
                    if ref_s and to == ref_s:
                        conf = min(0.99, conf + 0.20)
                        reasons = reasons + ["по ref разрыва"]
                    reasons = reasons + ["замена dangling_next"]
                    local_best.append((conf, to, reasons))
                local_best.sort(key=lambda x: -x[0])
                for conf, to, reasons in local_best[:5]:
                    _add_proposal(node, to, conf, reasons, gtype, seen, proposals, floor=0.08)
                continue

            # --- asymmetric ---
            if gtype == "asymmetric_dependency":
                if ref_s and ref_s in by_num:
                    conf, reasons = score(by_num[node], by_num[ref_s])
                    conf = max(conf, 0.25)
                    reasons = reasons + ["восстановление asymmetric"]
                    _add_proposal(node, ref_s, conf, reasons, gtype, seen, proposals, floor=0.12)
                continue

            # --- disconnected_component: мост остров → главная компонента ---
            if gtype == "disconnected_component":
                island = [_norm_id(x) for x in (g.get("component") or []) if _norm_id(x) in by_num]
                if not island:
                    island = [node]
                # главная компонента: всё, что не в острове (приближение) + main_sample
                island_set = set(island)
                main_nodes = [n for n in nums if n not in island_set]
                main_sample = g.get("main_sample")
                if main_sample:
                    ms = _norm_id(main_sample)
                    if ms in by_num and ms not in island_set:
                        main_nodes = [ms] + [n for n in main_nodes if n != ms]

                if not main_nodes:
                    continue

                # кандидаты: из острова (граничные по score) → в main
                local_best = []
                for a in island[:12]:
                    for b in main_nodes[:25]:
                        if _has_edge(a, b) or _has_edge(b, a):
                            continue
                        conf1, r1 = score(by_num[a], by_num[b])
                        conf2, r2 = score(by_num[b], by_num[a])
                        # предпочитаем направление меньший→больший номер
                        try:
                            ia, ib = int(float(a)), int(float(b))
                            if ia <= ib:
                                conf, reasons, frm, to = conf1, r1, a, b
                            else:
                                conf, reasons, frm, to = conf2, r2, b, a
                        except Exception:
                            conf, reasons, frm, to = conf1, r1, a, b
                        conf = max(conf, 0.14)
                        reasons = list(reasons) + ["мост остров→основной граф"]
                        local_best.append((conf, frm, to, reasons))
                local_best.sort(key=lambda x: -x[0])
                for conf, frm, to, reasons in local_best[:6]:
                    _add_proposal(frm, to, conf, reasons, gtype, seen, proposals, floor=0.12)
                continue

            # --- isolated: связать с ближайшими вне себя ---
            if gtype == "isolated_operation":
                for other in _nearest_ids(node, limit=8, prefer_lower=True):
                    conf, reasons = score(by_num[other], by_num[node])
                    conf = max(conf, 0.12)
                    reasons = reasons + ["isolated → ближайший"]
                    try:
                        if int(float(other)) < int(float(node)):
                            _add_proposal(other, node, conf, reasons, gtype, seen, proposals, floor=0.10)
                        else:
                            _add_proposal(node, other, conf, reasons, gtype, seen, proposals, floor=0.10)
                    except Exception:
                        _add_proposal(other, node, conf, reasons, gtype, seen, proposals, floor=0.10)
                continue

        # сначала дыры (dangling), потом остальное; внутри — по confidence
        def _rank(p):
            gt = str(p.get("gap_type") or "")
            if gt.startswith("dangling"):
                pri = 0
            elif gt == "disconnected_component":
                pri = 1
            elif gt == "asymmetric_dependency":
                pri = 2
            else:
                pri = 3
            return (pri, -p["confidence"])

        proposals.sort(key=_rank)
        per_node: Dict[str, int] = {}
        filtered: List[Dict] = []
        dangling_kept = 0
        for p in proposals:
            f, t = p["from"], p["to"]
            is_dangle = str(p.get("gap_type") or "").startswith("dangling")
            # для дыр — мягче лимит на узел
            lim = 5 if is_dangle else 3
            if per_node.get(f, 0) >= lim or per_node.get(t, 0) >= lim:
                continue
            per_node[f] = per_node.get(f, 0) + 1
            per_node[t] = per_node.get(t, 0) + 1
            filtered.append(p)
            if is_dangle:
                dangling_kept += 1

        # не выкидывать dangling даже при низком conf
        strong = []
        for p in filtered:
            gt = str(p.get("gap_type") or "")
            if gt.startswith("dangling") or p["confidence"] >= min_confidence:
                strong.append(p)
        if len(strong) >= 3:
            filtered = strong

        proposals = filtered[:100]
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

        def _nid(x) -> str:
            s = str(x or "").strip()
            if s.upper().startswith("T"):
                s = s[1:].strip()
            try:
                return str(int(float(s)))
            except Exception:
                return s

        for op in operations or []:
            o = dict(op)
            num = _nid(o.get("op_number") or o.get("id") or "")
            o["op_number"] = num or str(o.get("op_number") or o.get("id") or "")
            o["prev_ops"] = [_nid(x) for x in (o.get("prev_ops") or []) if _nid(x)]
            o["next_ops"] = [_nid(x) for x in (o.get("next_ops") or []) if _nid(x)]
            if o["op_number"]:
                by_num[o["op_number"]] = o
            out.append(o)

        for link in links or []:
            frm, to = _nid(link.get("from")), _nid(link.get("to"))
            if frm not in by_num or to not in by_num:
                continue
            if to not in by_num[frm]["next_ops"]:
                by_num[frm]["next_ops"].append(to)
            if frm not in by_num[to]["prev_ops"]:
                by_num[to]["prev_ops"].append(frm)
        return out
