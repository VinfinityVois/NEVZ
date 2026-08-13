"""
AI Engine — главный оркестратор системы планирования НЭВЗ.
Лёгкий, быстрый, без тяжёлых нейросетей в реальном времени.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Импорты модулей ИИ
from .scheduler import Scheduler
from .optimizer import Optimizer
from .anomaly_detector import AnomalyDetector
from .bottleneck_analyzer import BottleneckAnalyzer
from .gap_detector import GapDetector
from .gap_bridger import GapBridger

from .learning.data_collector import DataCollector
from .learning.repository import LearningRepository

from .path_intelligence.path_finder import PathFinder
from .path_intelligence.gantt_gap_analyzer import GanttGapAnalyzer


# Predictor пока опциональный
try:
    from .predictor import Predictor
    HAS_PREDICTOR = True
except ImportError:
    HAS_PREDICTOR = False


class AIEngine:
    """
    Главный ИИ-движок для НЭВЗ.
    
    Возможности:
    - Построение планов (год / полгода / месяц)
    - Автоматическое распределение бригад и сотрудников
    - Обнаружение сбоев и критических ситуаций
    - Перестроение плана с минимальными изменениями
    - Поиск узких мест и оптимизация загрузки
    """

    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {}
        
        self.scheduler = Scheduler(self.config)
        self.optimizer = Optimizer(self.config)
        self.anomaly_detector = AnomalyDetector(self.config)
        self.bottleneck_analyzer = BottleneckAnalyzer(self.config)
        
        self.path_finder = PathFinder()
        self.gantt_analyzer = GanttGapAnalyzer()
        
        self.predictor = Predictor(self.config) if HAS_PREDICTOR else None
        self.learning_collector = DataCollector(
            LearningRepository(
                db_path=self.config.get(
                    "db_path",
                    "manufacturing.db"
                )
            )
        )
        self.last_plan: Optional[Dict] = None
        self.last_analysis: Optional[Dict] = None
        self.last_anomalies: Optional[Dict] = None

    def build_plan(
        self,
        tasks: List[Dict],
        resources: List[Dict],
        brigades: List[Dict],
        horizon: str = "year",          # year | half_year | month
        start_date: Optional[str] = None,
        constraints: Optional[Dict] = None,
        do_leveling: bool = True
    ) -> Dict[str, Any]:
        """
        Строит оптимальный план на заданный горизонт.
        
        Шаги:
        1. Распределение задач по бригадам (Optimizer)
        2. Построение расписания + Critical Path (Scheduler)
        3. Анализ узких мест (BottleneckAnalyzer)
        """
        logger.info(f"Building plan | horizon={horizon} | tasks={len(tasks)} | brigades={len(brigades)}")
        
        constraints = constraints or {}

                # --- Разрывы цепочки (detect + auto-bridge) ---
        ops_for_gaps = []
        for t in tasks:
            prev = t.get("prev_ops")
            if prev is None and t.get("dependencies"):
                prev = [
                    str(d).lstrip("T") if str(d).upper().startswith("T") else str(d)
                    for d in (t.get("dependencies") or [])
                ]
            ops_for_gaps.append({
                "op_number": str(t.get("op_number") or t.get("id", "")).lstrip("T"),
                "id": t.get("id"),
                "name": t.get("name"),
                "prev_ops": [str(x).lstrip("T") for x in (prev or [])],
                "next_ops": [str(x).lstrip("T") for x in (t.get("next_ops") or [])],
                "drawing": t.get("drawing"),
                "post": t.get("post"),
                "status": t.get("status"),
            })

        gap_report = self.gap_detector.detect(ops_for_gaps)
        bridge = self.gap_bridger.propose(ops_for_gaps, gap_report.get("gaps", []))

        if bridge.get("auto_apply"):
            ops_for_gaps = self.gap_bridger.apply_links(ops_for_gaps, bridge["auto_apply"])
            fix_map = {str(o["op_number"]): o for o in ops_for_gaps}
            for t in tasks:
                key = str(t.get("op_number") or t.get("id", "")).lstrip("T")
                if key in fix_map:
                    prevs = fix_map[key].get("prev_ops", [])
                    t["prev_ops"] = prevs
                    t["next_ops"] = fix_map[key].get("next_ops", [])
                    t["dependencies"] = [
                        (p if str(p).upper().startswith("T") else f"T{p}") for p in prevs
                    ]

        # ===== НОВОЕ: Анализ графа операций на разрывы =====
        def _norm_id(value):
            """Убирает префикс T и приводит к int."""
            if value is None:
                return None
            text = str(value).strip()
            if text.upper().startswith("T"):
                text = text[1:].strip()
            try:
                return int(float(text))
            except (ValueError, TypeError):
                return None

        def _norm_list(values):
            return [v for v in (_norm_id(x) for x in (values or [])) if v is not None]

        operations = []
        for t in tasks:
            op_num = _norm_id(t.get("id", t.get("op_number")))
            if op_num is None:
                continue
            operations.append({
                "op_number": op_num,
                "name": t.get("name"),
                "prev_ops": _norm_list(t.get("dependencies", t.get("prev_ops", []))),
                "next_ops": _norm_list(t.get("next_ops", [])),
                "drawing": t.get("drawing"),
                "post": t.get("post"),
                "brigade_id": t.get("brigade_id"),
                "duration": t.get("duration", t.get("duration_days", 0)),
                "cost": t.get("cost", 0),
                "risk": t.get("risk", 0),
                "setup_time": t.get("setup_time", 0),
            })

        path_result = self.path_finder.find_best_paths(
            operations=operations,
            auto_bridge=True,
        )

        if path_result.get("bridges_applied", 0) > 0:
            logger.info(f"Auto-bridged {path_result['bridges_applied']} gaps")

        graph_gaps = path_result.get("gaps", {})
        # ===== КОНЕЦ НОВОГО =====

        # 1. Оптимизация распределения ресурсов и бригад
        allocation = self.optimizer.allocate(
            tasks=tasks,
            resources=resources,
            brigades=brigades,
            constraints=constraints
        )

        # 2. Построение расписания + критический путь + leveling
        plan = self.scheduler.build_schedule(
            tasks=tasks,
            allocation=allocation,
            horizon=horizon,
            start_date=start_date,
            constraints=constraints,
            brigades=brigades,
            do_leveling=do_leveling
        )

        # ===== НОВОЕ: Сверка Ганта с графом =====
        if plan.get("tasks"):
            time_gaps = self.gantt_analyzer.analyze(
                plan=plan,
                graph=path_result.get("graph", {}).get("graph", {}),
                operations=operations,
            )
            plan["time_gaps"] = time_gaps
            if time_gaps:
                logger.warning(f"Found {len(time_gaps)} time gaps in Gantt vs graph")
        # ===== КОНЕЦ НОВОГО =====

        # 3. Анализ узких мест
        bottlenecks = self.bottleneck_analyzer.analyze(
            plan=plan,
            resources=resources,
            brigades=brigades
        )


        leveling_info = plan.get("leveling") or {}
        plan["leveled"] = bool(
            leveling_info.get("leveled")
            or plan.get("stats", {}).get("leveling_applied")
        )
        plan["leveling"] = {
            **leveling_info,
            "leveled": plan["leveled"],
            "reason": leveling_info.get("reason")
            or (
                "applied" if plan["leveled"]
                else "no_overload_or_no_float_or_empty_brigades"
            ),
        }

        # Собираем итоговый результат
        plan["allocation"] = allocation
        plan["bottlenecks"] = bottlenecks
        plan["horizon"] = horizon
        plan["generated_at"] = datetime.now().isoformat()
        plan["stats"] = {
            "total_tasks": len(tasks),
            "critical_tasks": plan.get("cpm_stats", {}).get("critical_tasks_count", 0),
            "bottlenecks_count": len(bottlenecks),
            "critical_bottlenecks": len([b for b in bottlenecks if b["severity"] == "critical"]),
            "leveling_applied": plan.get("leveling", {}).get("leveled", False),
            "graph_gaps_total": graph_gaps.get("summary", {}).get("total_gaps", 0),
            "graph_gaps_critical": graph_gaps.get("summary", {}).get("critical", 0),
            "bridges_applied": path_result.get("bridges_applied", 0),
        }

        plan["graph_analysis"] = path_result

        plan["gaps"] = gap_report
        plan["bridge_proposals"] = bridge
        plan["chain_fixed_auto"] = len(bridge.get("auto_apply") or [])

        self.last_plan = plan
        self.last_analysis = {
            "bottlenecks": bottlenecks,
            "allocation": allocation
        }

        logger.info(
            f"Plan built | duration={plan.get('total_duration_days')}d | "
            f"critical={plan['stats']['critical_tasks']} | "
            f"bottlenecks={plan['stats']['bottlenecks_count']}"
        )
        return plan

    def detect_and_replan(
        self,
        current_plan: Dict,
        actual_data: Dict,
        resources: List[Dict],
        brigades: List[Dict]
    ) -> Dict[str, Any]:
        """
        Главный метод реагирования на критические ситуации.
        
        1. Обнаруживает отклонения и сбои (AnomalyDetector)
        2. Если критично — перестраивает план с минимальными изменениями
        3. Повторно анализирует узкие места
        """
        logger.info("Running anomaly detection + replan check...")

        # 1. Поиск аномалий / срывов
        anomalies = self.anomaly_detector.detect(
            plan=current_plan,
            actual=actual_data
        )
        self.last_anomalies = anomalies

        if not anomalies.get("has_critical"):
            return {
                "status": "ok",
                "message": anomalies.get("message", "Критических отклонений не обнаружено"),
                "anomalies": anomalies,
                "new_plan": None,
                "recommendations": self.get_recommendations(current_plan)
            }

        # 2. Перестроение с минимальными изменениями
        logger.warning(
            f"Critical anomalies detected: {len(anomalies.get('affected_tasks', []))} tasks. Replanning..."
        )

        new_plan = self.scheduler.replan_minimal(
            original_plan=current_plan,
            anomalies=anomalies,
            resources=resources,
            brigades=brigades
        )

        # 3. Повторная оптимизация только затронутых частей (если нужно)
        new_plan = self.optimizer.reoptimize_affected(
            plan=new_plan,
            affected_tasks=anomalies.get("affected_tasks", []),
            resources=resources,
            brigades=brigades
        )

        # 4. Новый анализ узких мест
        new_bottlenecks = self.bottleneck_analyzer.analyze(
            plan=new_plan,
            resources=resources,
            brigades=brigades
        )
        new_plan["bottlenecks"] = new_bottlenecks

        self.last_plan = new_plan

        return {
            "status": "replanned",
            "message": "План перестроен с минимальными изменениями",
            "anomalies": anomalies,
            "changes_summary": new_plan.get("changes_summary", {}),
            "new_plan": new_plan,
            "recommendations": self.get_recommendations(new_plan)
        }

    def get_recommendations(self, plan: Optional[Dict] = None) -> List[Dict]:
        """
        Возвращает рекомендации по улучшению текущего плана.
        Берёт данные из bottleneck-ов + перегрузки.
        """

        plan = plan or self.last_plan
        if not plan:
            return []

        recommendations = []

        # Из узких мест
        for bn in plan.get("bottlenecks", []):
            recommendations.append({
                "type": bn.get("type", "bottleneck"),
                "severity": bn.get("severity", "medium"),
                "message": bn.get("message"),
                "suggestion": bn.get("suggestion"),
                "task_id": bn.get("task_id"),
                "brigade_id": bn.get("brigade_id"),
                "source": "bottleneck_analyzer"
            })

        # Перегрузка бригад (дополнительно)
        try:
            overloaded = self.optimizer.find_overloaded(plan)
            for item in overloaded:
                recommendations.append({
                    "type": "overload",
                    "severity": "high",
                    "message": f"Бригада {item.get('brigade_name', item.get('brigade_id'))} "
                               f"перегружена на {item.get('overload_percent', '?')}%",
                    "suggestion": "Перераспределить задачи или добавить людей",
                    "brigade_id": item.get("brigade_id"),
                    "source": "optimizer"
                })
        except Exception as e:
            logger.debug(f"find_overloaded failed: {e}")

        # Сортируем по важности
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        recommendations.sort(key=lambda x: severity_order.get(x["severity"], 9))

        return recommendations

                gaps = (plan or self.last_plan or {}).get("gaps", {}).get("gaps") or []
        for g in gaps[:15]:
            recs.append({
                "type": "chain_gap",
                "severity": g.get("severity", "medium"),
                "message": g.get("message"),
                "suggestion": "Проверьте prev/next или примите предложенную связь",
                "op_number": g.get("op_number"),
                "task_id": g.get("op_number"),
            })
        for p in ((plan or self.last_plan or {}).get("bridge_proposals") or {}).get("need_confirm") or []:
            recs.append({
                "type": "bridge_proposal",
                "severity": "medium",
                "message": p.get("message"),
                "suggestion": "; ".join(p.get("reasons") or []),
                "from": p.get("from"),
                "to": p.get("to"),
                "confidence": p.get("confidence"),
            })
                    src = plan or self.last_plan or {}
        for g in (src.get("gaps") or {}).get("gaps") or []:
            recs.append({
                "type": "chain_gap",
                "severity": g.get("severity", "medium"),
                "message": g.get("message"),
                "suggestion": "Проверьте prev/next или примите предложенную связь",
                "op_number": g.get("op_number"),
                "task_id": g.get("op_number"),
            })
        for p in (src.get("bridge_proposals") or {}).get("need_confirm") or []:
            recs.append({
                "type": "bridge_proposal",
                "severity": "medium",
                "message": p.get("message"),
                "suggestion": "; ".join(p.get("reasons") or []),
                "from": p.get("from"),
                "to": p.get("to"),
                "confidence": p.get("confidence"),
            })

    def explain_decision(self, decision_id: str = None) -> Dict:
        """
        Простое объяснение последнего решения.
        Позже можно расширить через explainability-модули.
        """
        return {
            "decision_id": decision_id or "last",
            "explanation": "Решение принято на основе критического пути, "
                           "минимизации изменений плана и текущей загрузки бригад",
            "factors": [
                "critical_path",
                "resource_availability",
                "minimal_disruption",
                "brigade_load"
            ],
            "last_plan_generated_at": self.last_plan.get("generated_at") if self.last_plan else None,
            "last_anomalies_status": self.last_anomalies.get("status") if self.last_anomalies else None
        }

    def get_status(self) -> Dict[str, Any]:
        """Текущий статус движка (удобно для дашборда и AI-панели)"""
        return {
            "has_plan": self.last_plan is not None,
            "plan_horizon": self.last_plan.get("horizon") if self.last_plan else None,
            "project_duration_days": (
                self.last_plan.get("total_duration_days")
                or self.last_plan.get("project_duration_days")
                if self.last_plan else None
            ),
            "plan_duration_days": (
                self.last_plan.get("total_duration_days")
                or self.last_plan.get("project_duration_days")
                if self.last_plan else None
            ),
            "critical_tasks": self.last_plan.get("stats", {}).get("critical_tasks") if self.last_plan else 0,
            "bottlenecks": len(self.last_plan.get("bottlenecks", [])) if self.last_plan else 0,
            "last_anomalies_status": self.last_anomalies.get("status") if self.last_anomalies else "unknown",
            "generated_at": self.last_plan.get("generated_at") if self.last_plan else None,
        }