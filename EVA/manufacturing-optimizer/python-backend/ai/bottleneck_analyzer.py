"""
Bottleneck Analyzer — поиск узких мест в плане.
Анализирует критический путь, загрузку бригад и ресурсы.
"""

from typing import Dict, List, Optional, Any, Tuple
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)


class BottleneckAnalyzer:
    """
    Находит узкие места:
    - Работы на критическом пути с высоким риском
    - Бригады с перегрузкой
    - Ресурсы, которые блокируют много задач
    - Длинные цепочки зависимостей
    - Работы с маленьким float, но большой длительностью
    """

    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {}
        
        # Пороги
        self.high_load_ratio = self.config.get("high_load_ratio", 0.85)
        self.critical_float_threshold = self.config.get("critical_float_threshold", 1.5)
        self.long_task_days = self.config.get("long_task_days", 10)

    def analyze(
        self,
        plan: Dict[str, Any],
        resources: Optional[List[Dict]] = None,
        brigades: Optional[List[Dict]] = None
    ) -> List[Dict[str, Any]]:
        """
        Главный метод анализа узких мест.
        
        Возвращает список bottleneck-ов, отсортированный по важности.
        """
        bottlenecks = []
        
        tasks = plan.get("tasks", [])
        critical_ids = set(plan.get("critical_path_ids", []))
        allocation = plan.get("allocation", {})
        
        if not tasks:
            return []

        # 1. Узкие места на критическом пути
        bottlenecks.extend(
            self._analyze_critical_path(tasks, critical_ids)
        )

        # 2. Перегруженные бригады
        if brigades:
            bottlenecks.extend(
                self._analyze_brigade_load(tasks, brigades, allocation)
            )

        # 3. Работы с очень маленьким резервом (почти критические)
        bottlenecks.extend(
            self._analyze_near_critical(tasks, critical_ids)
        )

        # 4. Длинные работы (риск большого срыва)
        bottlenecks.extend(
            self._analyze_long_tasks(tasks, critical_ids)
        )

        # 5. Концентрация зависимостей (много работ ждут одну)
        bottlenecks.extend(
            self._analyze_dependency_concentration(tasks)
        )

        # Сортируем по severity
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        bottlenecks.sort(key=lambda x: (severity_order.get(x["severity"], 9), -x.get("score", 0)))

        return bottlenecks

    def _analyze_critical_path(
        self,
        tasks: List[Dict],
        critical_ids: set
    ) -> List[Dict]:
        """Самые опасные работы на критическом пути"""
        results = []
        
        for task in tasks:
            if task["id"] not in critical_ids:
                continue
                
            duration = task.get("duration", task.get("duration_days", 1))
            float_val = task.get("total_float", 0)
            
            # Чем длиннее критическая работа — тем опаснее
            score = duration * 1.5
            
            severity = "high"
            if duration >= self.long_task_days:
                severity = "critical"
                score *= 1.4
            
            results.append({
                "type": "critical_path_task",
                "severity": severity,
                "score": score,
                "task_id": task["id"],
                "task_name": task.get("name"),
                "brigade_id": task.get("brigade_id"),
                "duration": duration,
                "total_float": float_val,
                "message": f"Критическая работа «{task.get('name', task['id'])}» длительностью {duration} дн.",
                "suggestion": "Держать под ежедневным контролем. Подготовить резерв людей/оборудования.",
                "location": "critical_path"
            })
        
        return results

    def _analyze_brigade_load(
        self,
        tasks: List[Dict],
        brigades: List[Dict],
        allocation: Dict
    ) -> List[Dict]:
        """Перегруженные и почти перегруженные бригады"""
        results = []
        
        # Считаем суммарную загрузку по бригадам
        load = defaultdict(float)
        task_count = defaultdict(int)
        
        for task in tasks:
            b_id = str(task.get("brigade_id") or allocation.get("task_to_brigade", {}).get(task["id"], "unknown"))
            duration = task.get("duration", task.get("duration_days", 1))
            load[b_id] += duration
            task_count[b_id] += 1

        brigade_map = {str(b["id"]): b for b in brigades}
        
        for b_id, total_load in load.items():
            brigade = brigade_map.get(b_id, {})
            capacity = float(brigade.get("capacity", brigade.get("max_load", 20)))
            
            if capacity <= 0:
                continue
                
            ratio = total_load / capacity
            
            if ratio >= 1.0:
                severity = "critical"
                message = f"Бригада «{brigade.get('name', b_id)}» перегружена ({ratio:.0%})"
                suggestion = "Срочно перераспределить задачи или добавить людей"
            elif ratio >= self.high_load_ratio:
                severity = "high"
                message = f"Бригада «{brigade.get('name', b_id)}» близка к перегрузке ({ratio:.0%})"
                suggestion = "Следить за загрузкой, не добавлять новые задачи без необходимости"
            else:
                continue

            results.append({
                "type": "brigade_overload",
                "severity": severity,
                "score": ratio * 20,
                "brigade_id": b_id,
                "brigade_name": brigade.get("name", b_id),
                "load": round(total_load, 1),
                "capacity": capacity,
                "ratio": round(ratio, 2),
                "tasks_count": task_count[b_id],
                "message": message,
                "suggestion": suggestion,
                "location": "resources"
            })
        
        return results

    def _analyze_near_critical(
        self,
        tasks: List[Dict],
        critical_ids: set
    ) -> List[Dict]:
        """Работы с очень маленьким резервом (почти критические)"""
        results = []
        
        for task in tasks:
            if task["id"] in critical_ids:
                continue
                
            float_val = task.get("total_float", 999)
            duration = task.get("duration", task.get("duration_days", 1))
            
            if float_val <= self.critical_float_threshold and float_val > 0:
                results.append({
                    "type": "near_critical",
                    "severity": "medium",
                    "score": (self.critical_float_threshold - float_val + 1) * duration,
                    "task_id": task["id"],
                    "task_name": task.get("name"),
                    "total_float": float_val,
                    "duration": duration,
                    "message": f"Работа «{task.get('name', task['id'])}» имеет очень маленький резерв ({float_val:.1f} дн.)",
                    "suggestion": "Контролировать. При малейшем срыве может стать критической.",
                    "location": "near_critical_path"
                })
        
        return results

    def _analyze_long_tasks(
        self,
        tasks: List[Dict],
        critical_ids: set
    ) -> List[Dict]:
        """Очень длинные работы — высокий риск большого срыва"""
        results = []
        
        for task in tasks:
            duration = task.get("duration", task.get("duration_days", 1))
            
            if duration < self.long_task_days:
                continue
                
            is_crit = task["id"] in critical_ids
            severity = "high" if is_crit else "medium"
            
            results.append({
                "type": "long_task",
                "severity": severity,
                "score": duration * (1.5 if is_crit else 1.0),
                "task_id": task["id"],
                "task_name": task.get("name"),
                "duration": duration,
                "is_critical": is_crit,
                "message": f"Длинная работа «{task.get('name', task['id'])}» ({duration} дн.)",
                "suggestion": "Разбить на подзадачи или усилить контроль промежуточных результатов",
                "location": "duration"
            })
        
        return results

    def _analyze_dependency_concentration(
        self,
        tasks: List[Dict]
    ) -> List[Dict]:
        """Работы, от которых зависит много других (бутылочное горлышко по зависимостям)"""
        results = []
        
        # Считаем, сколько работ напрямую зависят от каждой
        successors_count = defaultdict(int)
        task_map = {t["id"]: t for t in tasks}
        
        for task in tasks:
            for dep in task.get("dependencies", []):
                successors_count[dep] += 1

        for task_id, count in successors_count.items():
            if count < 3:  # порог
                continue
                
            task = task_map.get(task_id, {"id": task_id, "name": task_id})
            
            severity = "high" if count >= 5 else "medium"
            
            results.append({
                "type": "dependency_bottleneck",
                "severity": severity,
                "score": count * 3,
                "task_id": task_id,
                "task_name": task.get("name", task_id),
                "dependent_count": count,
                "message": f"От работы «{task.get('name', task_id)}» зависят {count} других работ",
                "suggestion": "Приоритизировать эту работу. Любая задержка сильно расползётся по плану.",
                "location": "dependencies"
            })
        
        return results


# Удобная функция
def find_bottlenecks(
    plan: Dict[str, Any],
    resources: Optional[List[Dict]] = None,
    brigades: Optional[List[Dict]] = None,
    config: Optional[Dict] = None
) -> List[Dict]:
    analyzer = BottleneckAnalyzer(config)
    return analyzer.analyze(plan, resources, brigades)