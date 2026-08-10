"""
Visualizer — визуализация графа зависимостей и критического пути.
"""

from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
import logging
import tempfile
import base64
from io import BytesIO

logger = logging.getLogger(__name__)

try:
    import networkx as nx
    import matplotlib
    matplotlib.use("Agg")  # без GUI
    import matplotlib.pyplot as plt
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False
    logger.warning("matplotlib/networkx не установлены — генерация картинок недоступна")


class GraphVisualizer:
    """
    Два режима:
    1. JSON для фронтенда (nodes + edges) — основной
    2. PNG-картинка (base64) — для отчётов и быстрого просмотра
    """

    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {}

    def to_frontend_format(
        self,
        cpm_result: Dict[str, Any],
        highlight_critical: bool = True
    ) -> Dict[str, Any]:
        """
        Преобразует результат CPM в формат, удобный для graph-viewer.js / cytoscape / vis.js / d3.
        """
        tasks = cpm_result.get("tasks", [])
        critical_ids = set(cpm_result.get("critical_path_ids", []))

        nodes = []
        for t in tasks:
            is_critical = t["id"] in critical_ids or t.get("is_critical", False)
            
            nodes.append({
                "id": str(t["id"]),
                "label": t.get("name") or t["id"],
                "duration": t.get("duration", t.get("duration_days", 0)),
                "es": t.get("es"),
                "ef": t.get("ef"),
                "ls": t.get("ls"),
                "lf": t.get("lf"),
                "total_float": t.get("total_float"),
                "free_float": t.get("free_float"),
                "is_critical": is_critical,
                "brigade_id": t.get("brigade_id"),
                "status": t.get("status", "planned"),
                # для визуализации
                "color": "#e74c3c" if is_critical else "#3498db",
                "border_color": "#c0392b" if is_critical else "#2980b9",
                "shape": "round-rectangle",
            })

        # Рёбра (зависимости)
        edges = []
        for t in tasks:
            for dep in t.get("dependencies", []) or []:
                edges.append({
                    "id": f"{dep}->{t['id']}",
                    "source": str(dep),
                    "target": str(t["id"]),
                    "is_critical": (
                        str(dep) in critical_ids and str(t["id"]) in critical_ids
                    )
                })

        return {
            "nodes": nodes,
            "edges": edges,
            "critical_path_ids": list(critical_ids),
            "project_duration_days": cpm_result.get("project_duration_days"),
            "stats": {
                "total_nodes": len(nodes),
                "total_edges": len(edges),
                "critical_nodes": len(critical_ids)
            }
        }

    def render_png(
        self,
        cpm_result: Dict[str, Any],
        width: int = 1400,
        height: int = 900,
        highlight_critical: bool = True
    ) -> Optional[str]:
        """
        Рисует граф и возвращает base64 PNG.
        Если matplotlib нет — возвращает None.
        """
        if not HAS_MATPLOTLIB:
            return None

        try:
            tasks = cpm_result.get("tasks", [])
            critical_ids = set(cpm_result.get("critical_path_ids", []))

            G = nx.DiGraph()

            for t in tasks:
                G.add_node(
                    str(t["id"]),
                    name=t.get("name") or t["id"],
                    duration=t.get("duration", 0),
                    is_critical=t["id"] in critical_ids or t.get("is_critical", False)
                )

            for t in tasks:
                for dep in t.get("dependencies", []) or []:
                    G.add_edge(str(dep), str(t["id"]))

            if G.number_of_nodes() == 0:
                return None

            # Раскладка
            try:
                pos = nx.nx_agraph.graphviz_layout(G, prog="dot")  # если есть pygraphviz
            except Exception:
                try:
                    pos = nx.drawing.nx_pydot.graphviz_layout(G, prog="dot")
                except Exception:
                    pos = nx.spring_layout(G, k=1.8, iterations=80, seed=42)

            plt.figure(figsize=(width / 100, height / 100), dpi=100)
            ax = plt.gca()
            ax.set_title(
                f"Граф зависимостей | Длительность: {cpm_result.get('project_duration_days', '?')} дн.",
                fontsize=14, pad=15
            )

            # Обычные узлы
            normal_nodes = [n for n, d in G.nodes(data=True) if not d.get("is_critical")]
            critical_nodes = [n for n, d in G.nodes(data=True) if d.get("is_critical")]

            nx.draw_networkx_nodes(
                G, pos,
                nodelist=normal_nodes,
                node_color="#3498db",
                node_size=1800,
                alpha=0.95,
                edgecolors="#2980b9",
                linewidths=2
            )
            nx.draw_networkx_nodes(
                G, pos,
                nodelist=critical_nodes,
                node_color="#e74c3c",
                node_size=2000,
                alpha=0.95,
                edgecolors="#c0392b",
                linewidths=2.5
            )

            # Рёбра
            normal_edges = [
                (u, v) for u, v in G.edges()
                if not (G.nodes[u].get("is_critical") and G.nodes[v].get("is_critical"))
            ]
            critical_edges = [
                (u, v) for u, v in G.edges()
                if G.nodes[u].get("is_critical") and G.nodes[v].get("is_critical")
            ]

            nx.draw_networkx_edges(
                G, pos,
                edgelist=normal_edges,
                edge_color="#7f8c8d",
                arrows=True,
                arrowsize=18,
                width=1.5,
                alpha=0.7
            )
            nx.draw_networkx_edges(
                G, pos,
                edgelist=critical_edges,
                edge_color="#c0392b",
                arrows=True,
                arrowsize=20,
                width=2.5,
                alpha=0.9
            )

            # Подписи
            labels = {}
            for n, d in G.nodes(data=True):
                name = d.get("name", n)
                if len(name) > 18:
                    name = name[:16] + "…"
                labels[n] = f"{n}\n{name}"

            nx.draw_networkx_labels(
                G, pos,
                labels,
                font_size=8,
                font_color="white",
                font_weight="bold"
            )

            plt.axis("off")
            plt.tight_layout()

            buf = BytesIO()
            plt.savefig(buf, format="png", bbox_inches="tight", facecolor="white")
            plt.close()
            buf.seek(0)

            img_base64 = base64.b64encode(buf.read()).decode("utf-8")
            return f"data:image/png;base64,{img_base64}"

        except Exception as e:
            logger.exception(f"Ошибка рендера графа: {e}")
            return None


def build_graph_view(cpm_result: Dict[str, Any], with_image: bool = False) -> Dict[str, Any]:
    """Удобная функция верхнего уровня"""
    viz = GraphVisualizer()
    data = viz.to_frontend_format(cpm_result)

    if with_image:
        data["image_base64"] = viz.render_png(cpm_result)

    return data