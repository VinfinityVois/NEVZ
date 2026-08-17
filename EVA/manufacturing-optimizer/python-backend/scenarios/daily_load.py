"""
Сценарий дня: seed от даты → стабильная «сегодняшняя» нагрузка.
"""
from __future__ import annotations

import hashlib
import json
import random
from dataclasses import dataclass, asdict
from datetime import date, datetime, timedelta
from typing import Any

from .tech_routes import ROUTES


def day_seed(d: date | None = None) -> int:
    d = d or date.today()
    # один и тот же день → один seed; завтра — другой
    h = hashlib.sha256(d.isoformat().encode()).hexdigest()
    return int(h[:8], 16)


@dataclass
class DayProfile:
    """Профиль «как прошёл день на заводе»."""
    date: str
    seed: int
    # доли статусов (сумма ~1)
    pct_completed: float
    pct_in_progress: float
    pct_blocked: float
    # события
    sick_leave_workers: int
    overloaded_brigades: int
    equipment_down_posts: list[int]
    delay_factor: float  # 1.0 норма, >1 задержки
    n_routes: int        # сколько параллельных «изделий» в работе


def build_day_profile(d: date | None = None) -> DayProfile:
    d = d or date.today()
    rng = random.Random(day_seed(d))

    # будни чуть тяжелее, пн — разгон, пт — сдача
    weekday = d.weekday()  # 0=пн
    base_done = 0.35 + (0.08 if weekday >= 3 else 0.0)
    base_blocked = 0.04 + (0.03 if weekday == 0 else 0.0)

    pct_completed = round(min(0.55, base_done + rng.uniform(-0.05, 0.08)), 3)
    pct_blocked = round(min(0.12, base_blocked + rng.uniform(0, 0.04)), 3)
    pct_in_progress = round(min(0.40, 0.25 + rng.uniform(-0.05, 0.1)), 3)
    # остаток → pending

    return DayProfile(
        date=d.isoformat(),
        seed=day_seed(d),
        pct_completed=pct_completed,
        pct_in_progress=pct_in_progress,
        pct_blocked=pct_blocked,
        sick_leave_workers=rng.randint(2, 12),
        overloaded_brigades=rng.randint(1, 5),
        equipment_down_posts=rng.sample(range(1, 11), k=rng.randint(0, 2)),
        delay_factor=round(rng.uniform(0.95, 1.35), 2),
        n_routes=rng.randint(8, 16),  # параллельных изделий
    )


def generate_operations_for_day(
    profile: DayProfile,
    brigades_count: int = 40,
) -> list[dict[str, Any]]:
    """
    Строит операции с КОРРЕКТНЫМИ prev/next только внутри маршрута.
    op_number уникален, без ссылок «в никуда».
    """
    rng = random.Random(profile.seed)
    ops: list[dict[str, Any]] = []
    op_number = 100
    today = date.fromisoformat(profile.date)
    route_keys = list(ROUTES.keys())

    for unit_i in range(profile.n_routes):
        key = route_keys[unit_i % len(route_keys)]
        route = ROUTES[key]
        steps = route["steps"]
        posts = route["posts"]
        unit_ops = []

        for step_i, (name, hours, people) in enumerate(steps):
            post = posts[step_i] if step_i < len(posts) else posts[-1]
            duration = round(hours / max(people, 1) * profile.delay_factor, 2)

            # сдвиг по цепочке
            start = today - timedelta(days=len(steps) - step_i + rng.randint(0, 3))
            end = start + timedelta(days=max(1, int(duration / 8) + 1))

            # статус по профилю дня + позиция в цепочке
            roll = rng.random()
            if step_i < int(len(steps) * profile.pct_completed):
                status = "completed"
            elif roll < profile.pct_blocked or post in profile.equipment_down_posts:
                status = "blocked"
            elif roll < profile.pct_blocked + profile.pct_in_progress:
                status = "in_progress"
            else:
                status = "pending"

            brigade_id = (unit_i * 3 + step_i) % max(brigades_count, 1) + 1

            unit_ops.append({
                "op_number": op_number,
                "post": post,
                "name": f"{route['name']}: {name}",
                "drawing": f"{key.upper()}-{unit_i+1:03d}",
                "labor_hours": hours,
                "people_count": people,
                "duration": duration,
                "time_reserve": round(duration * 0.15, 2),
                "brigade_id": brigade_id,
                "location": f"Пост {post}",
                "status": status,
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "prev_ops": [],
                "next_ops": [],
            })
            op_number += 1

        # связи только соседние FS внутри изделия
        for i in range(len(unit_ops)):
            if i > 0:
                unit_ops[i]["prev_ops"] = [unit_ops[i - 1]["op_number"]]
            if i < len(unit_ops) - 1:
                unit_ops[i]["next_ops"] = [unit_ops[i + 1]["op_number"]]

        ops.extend(unit_ops)

    return ops


def scenario_summary(ops: list[dict], profile: DayProfile) -> dict:
    from collections import Counter
    c = Counter(o["status"] for o in ops)
    return {
        "date": profile.date,
        "seed": profile.seed,
        "ops": len(ops),
        "status": dict(c),
        "blocked_posts": profile.equipment_down_posts,
        "delay_factor": profile.delay_factor,
        "sick_leave": profile.sick_leave_workers,
        "overloaded_brigades": profile.overloaded_brigades,
    }