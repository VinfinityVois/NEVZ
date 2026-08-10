"""
Resource Leveling — выравнивание загрузки бригад и ресурсов.
Старается не увеличивать срок проекта (или увеличивать минимально).
"""

from typing import List, Dict, Optional, Any, Tuple
from copy import deepcopy
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)


class ResourceLeveler:
    """
    Выравнивает загрузку бригад с учётом критического пути.
    
    Стратегии:
    1. Сначала двигаем работы с большим Total Float
    2. Не трогаем критические работы (float = 0), если возможно
    3. Минимизируем пиковые перегрузки
    """

    def __init__(self, max_extension_days: float = 5.0):
        """
        max_extension_days — насколько максимум можно удлинить проект
        ради выравнивания загрузки.
        """
        self.max_extension_days = max_extension_days

    def level(
        self,
        cpm_result: Dict[str, Any],
        brigades: List[Dict],
        capacity_per_brigade: Optional[Dict[str, float]] = None
    ) -> Dict[str, Any]:
        """
        Главный метод выравнивания.
        
        cpm_result — результат CriticalPathCalculator.calculate()
        brigades — список бригад
        capacity_per_brigade — {brigade_id: максимальная загрузка в днях/период}
        """
        tasks = deepcopy(cpm_result["tasks"])
        task_map = {t["id"]: t for t in tasks}

        # Если ёмкость не передана — считаем примерно
        if capacity_per_brigade is None:
            capacity_per_brigade = {
                str(b["id"]): b.get("capacity", 10.0) for b in brigades
            }

        # Считаем текущую загрузку по дням
        load_profile = self._build_load_profile(tasks)
        peaks = self._find_peaks(load_profile, capacity_per_brigade)

        if not peaks:
            return {
                "tasks": tasks,
                "leveled": False,
                "message": "Перегрузок не обнаружено",
                "load_profile": load_profile,
            }

        # Пытаемся сдвинуть работы с float > 0
        moved = []
        for peak in peaks:
            candidates = self._get_movable_tasks(tasks, peak, task_map)
            for task in candidates:
                shift = self._try_shift_task(task, peak, load_profile, capacity_per_brigade)
                if shift > 0:
                    self._apply_shift(task, shift, tasks, task_map)
                    moved.append({
                        "task_id": task["id"],
                        "shift_days": shift,
                        "reason": f"Снижение пика загрузки бригады {task.get('brigade_id')}"
                    })
                    # Обновляем профиль
                    load_profile = self._build_load_profile(tasks)

        # Пересчитываем длительность
        new_duration = max(t["ef"] for t in tasks) if tasks else 0

        return {
            "tasks": tasks,
            "leveled": len(moved) > 0,
            "moved_tasks": moved,
            "original_duration": cpm_result["project_duration_days"],
            "new_duration": new_duration,
            "extension_days": max(0, new_duration - cpm_result["project_duration_days"]),
            "load_profile": load_profile,
            "message": f"Сдвинуто работ: {len(moved)}"
        }

    def _build_load_profile(self, tasks: List[Dict]) -> Dict[str, Dict[int, float]]:
        """
        Строит профиль загрузки: {brigade_id: {day: load}}
        """
        profile = defaultdict(lambda: defaultdict(float))

        for task in tasks:
            brigade_id = str(task.get("brigade_id") or "unknown")
            start = int(task["es"])
            end = int(task["ef"])
            duration = task["duration"]

            # Равномерная загрузка по дням работы
            daily_load = duration / max(1, end - start) if end > start else duration
            for day in range(start, end):
                profile[brigade_id][day] += daily_load

        return profile

    def _find_peaks(
        self,
        load_profile: Dict,
        capacity: Dict[str, float]
    ) -> List[Dict]:
        """Находит дни и бригады с превышением ёмкости"""
        peaks = []
        for brigade_id, days in load_profile.items():
            cap = capacity.get(brigade_id, 999)
            for day, load in days.items():
                if load > cap * 1.05:  # небольшой допуск
                    peaks.append({
                        "brigade_id": brigade_id,
                        "day": day,
                        "load": load,
                        "capacity": cap,
                        "overload": load - cap
                    })
        # Сортируем по величине перегрузки
        peaks.sort(key=lambda x: x["overload"], reverse=True)
        return peaks

    def _get_movable_tasks(
        self,
        tasks: List[Dict],
        peak: Dict,
        task_map: Dict
    ) -> List[Dict]:
        """Работы, которые можно сдвинуть (есть float и попадают в пик)"""
        candidates = []
        for task in tasks:
            if str(task.get("brigade_id")) != peak["brigade_id"]:
                continue
            if task.get("is_critical") and task.get("total_float", 0) < 0.1:
                continue  # критические стараемся не трогать

            es, ef = task["es"], task["ef"]
            if es <= peak["day"] < ef and task.get("total_float", 0) > 0.5:
                candidates.append(task)

        # Сначала те, у кого больше резерва
        candidates.sort(key=lambda t: t.get("total_float", 0), reverse=True)
        return candidates

    def _try_shift_task(
        self,
        task: Dict,
        peak: Dict,
        load_profile: Dict,
        capacity: Dict
    ) -> float:
        """Пробует найти сдвиг, который уберёт работу из пика"""
        max_shift = min(task.get("total_float", 0), self.max_extension_days)
        if max_shift <= 0:
            return 0.0

        # Простой вариант: сдвигаем ровно настолько, чтобы уйти из пикового дня
        needed = peak["day"] - task["es"] + 1
        shift = min(needed, max_shift)
        return max(0.0, shift)

    def _apply_shift(
        self,
        task: Dict,
        shift: float,
        all_tasks: List[Dict],
        task_map: Dict
    ):
        """Применяет сдвиг к работе и (упрощённо) к её последователям"""
        task["es"] += shift
        task["ef"] += shift
        task["ls"] = task.get("ls", task["es"]) + shift
        task["lf"] = task.get("lf", task["ef"]) + shift
        task["total_float"] = max(0, task.get("total_float", 0) - shift)