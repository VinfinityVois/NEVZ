"""GapDetector — разрывы в цепочке операций."""
from typing import Dict, List, Any, Set
from collections import defaultdict


class GapDetector:
    def detect(self, operations: List[Dict]) -> Dict[str, Any]:
        by_num: Dict[str, Dict] = {}
        for op in operations or []:
            num = str(op.get("op_number") or op.get("id") or "").strip()
            if not num:
                continue
            by_num[num] = op

        ids: Set[str] = set(by_num.keys())
        gaps: List[Dict] = []

        for num, op in by_num.items():
            for p in op.get("prev_ops") or []:
                ps = str(p)
                if ps and ps not in ids:
                    gaps.append({
                        "type": "dangling_prev",
                        "severity": "high",
                        "op_number": num,
                        "name": op.get("name"),
                        "ref": ps,
                        "message": f"#{num} → несуществующий prev #{ps}",
                    })
            for n in op.get("next_ops") or []:
                ns = str(n)
                if ns and ns not in ids:
                    gaps.append({
                        "type": "dangling_next",
                        "severity": "high",
                        "op_number": num,
                        "name": op.get("name"),
                        "ref": ns,
                        "message": f"#{num} → несуществующий next #{ns}",
                    })

        for num, op in by_num.items():
            for n in op.get("next_ops") or []:
                ns = str(n)
                if ns not in by_num:
                    continue
                prevs = [str(x) for x in (by_num[ns].get("prev_ops") or [])]
                if num not in prevs:
                    gaps.append({
                        "type": "asymmetric_dependency",
                        "severity": "medium",
                        "op_number": num,
                        "name": op.get("name"),
                        "ref": ns,
                        "message": f"#{num}→#{ns} в next, но нет в prev у #{ns}",
                    })

        for num, op in by_num.items():
            if not (op.get("prev_ops") or []) and not (op.get("next_ops") or []):
                if op.get("status") != "completed":
                    gaps.append({
                        "type": "isolated_operation",
                        "severity": "medium",
                        "op_number": num,
                        "name": op.get("name"),
                        "message": f"#{num} без prev и next",
                    })

        undirected = defaultdict(set)
        for num, op in by_num.items():
            for p in op.get("prev_ops") or []:
                ps = str(p)
                if ps in ids:
                    undirected[num].add(ps)
                    undirected[ps].add(num)
            for n in op.get("next_ops") or []:
                ns = str(n)
                if ns in ids:
                    undirected[num].add(ns)
                    undirected[ns].add(num)

        visited: Set[str] = set()
        components: List[List[str]] = []

        def dfs(start: str, acc: List[str]):
            stack = [start]
            while stack:
                u = stack.pop()
                if u in visited:
                    continue
                visited.add(u)
                acc.append(u)
                stack.extend(undirected[u] - visited)

        for num in ids:
            if num not in visited:
                acc: List[str] = []
                dfs(num, acc)
                components.append(acc)

        components.sort(key=len, reverse=True)
        if len(components) > 1:
            for comp in components[1:]:
                sample = comp[0]
                gaps.append({
                    "type": "disconnected_component",
                    "severity": "high",
                    "op_number": sample,
                    "name": (by_num.get(sample) or {}).get("name"),
                    "component_size": len(comp),
                    "message": f"Остров из {len(comp)} оп. (напр. #{sample})",
                })

        color = {n: 0 for n in ids}  # 0 white 1 gray 2 black

        def dfs_cycle(u: str):
            color[u] = 1
            op = by_num[u]
            for n in op.get("next_ops") or []:
                v = str(n)
                if v not in ids:
                    continue
                if color[v] == 1:
                    gaps.append({
                        "type": "cycle",
                        "severity": "critical",
                        "op_number": u,
                        "ref": v,
                        "name": (by_num.get(u) or {}).get("name"),
                        "message": f"Цикл: #{u} → #{v}",
                    })
                elif color[v] == 0:
                    dfs_cycle(v)
            color[u] = 2

        for n in ids:
            if color[n] == 0:
                dfs_cycle(n)

        by_type: Dict[str, int] = defaultdict(int)
        for g in gaps:
            by_type[g["type"]] += 1

        return {
            "gaps": gaps,
            "counts": dict(by_type),
            "total": len(gaps),
            "components_count": len(components),
            "main_component_size": len(components[0]) if components else 0,
        }