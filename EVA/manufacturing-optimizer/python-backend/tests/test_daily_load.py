"""
pytest tests/test_daily_load.py -v
Требует: uvicorn на 127.0.0.1:8000 + залитый сценарий дня.
"""
import os
import requests
import pytest
from datetime import date
from scenarios.daily_load import build_day_profile, generate_operations_for_day

BASE = os.getenv("API_BASE", "http://127.0.0.1:8000")


@pytest.fixture(scope="module")
def day_ops():
    profile = build_day_profile(date.today())
    return generate_operations_for_day(profile), profile


def test_no_orphan_dependencies(day_ops):
    ops, _ = day_ops
    nums = {o["op_number"] for o in ops}
    orphans = []
    for o in ops:
        for n in o["next_ops"]:
            if n not in nums:
                orphans.append((o["op_number"], n))
        for p in o["prev_ops"]:
            if p not in nums:
                orphans.append((p, o["op_number"]))
    assert orphans == [], f"битые связи: {orphans[:10]}"


def test_api_operations_count():
    r = requests.get(f"{BASE}/operations", timeout=30)
    assert r.status_code == 200
    ops = r.json()
    assert len(ops) >= 20


def test_cpm_returns_path():
    r = requests.post(f"{BASE}/calculate-cpm", json={}, timeout=60)
    assert r.status_code == 200
    data = r.json()
    path = data.get("critical_path") or data.get("criticalPath") or []
    assert len(path) >= 1


def test_ai_optimize_smoke():
    """
    Контракт /ai/build-plan (см. api/ai_endpoints.py::BuildPlanRequest):
    ожидает {"tasks": [...], "brigades": [...]}, а не "operations" —
    прежняя версия теста слала неправильный ключ и всегда получала 422
    ещё до того, как AI-движок вообще успевал что-то посчитать.

    duration_days обязателен и должен быть > 0 (Field(..., gt=0)).
    Колонка operations.duration в БД хранится в ЧАСАХ (тот же расчёт,
    что и в electron-app/renderer/js/admin/ai-panel.js), поэтому делим
    на 8 при конвертации — если оставить как есть, задачи с duration=8
    превратятся в "8 дней" вместо "1 дня" и план разъедет по срокам.
    """
    ops = requests.get(f"{BASE}/operations", timeout=30).json()
    assert ops, "нет операций — сначала примени сценарий дня (apply_daily_scenario.py)"

    def to_duration_days(op):
        hours = op.get("duration") or (
            (op.get("labor_hours") or 0) / max(op.get("people_count") or 1, 1)
        )
        return max(0.1, round((hours or 8) / 8.0, 2))

    tasks = [
        {
            "id": str(op["op_number"]),
            "name": op.get("name") or f"#{op['op_number']}",
            "duration_days": to_duration_days(op),
            "dependencies": [str(p) for p in (op.get("prev_ops") or [])],
            "priority": 1,
            "required_skills": [],
            "brigade_id": str(op["brigade_id"]) if op.get("brigade_id") else None,
        }
        for op in ops[:80]
        if op.get("op_number") is not None
    ]
    brigade_ids = {t["brigade_id"] for t in tasks if t["brigade_id"]}
    brigades = [
        {"id": bid, "name": f"Бригада {bid}", "skills": [], "capacity": 12.0}
        for bid in brigade_ids
    ] or [{"id": "b1", "name": "Бригада 1", "skills": [], "capacity": 12.0}]

    r = requests.post(
        f"{BASE}/ai/build-plan",
        json={"tasks": tasks, "brigades": brigades, "horizon": "month"},
        timeout=120,
    )
    assert r.status_code == 200, f"{r.status_code}: {r.text[:500]}"
    body = r.json()
    assert body.get("success") is True
    assert "plan" in body


def test_status_mix_realistic(day_ops):
    ops, profile = day_ops
    completed = sum(1 for o in ops if o["status"] == "completed")
    ratio = completed / max(len(ops), 1)
    assert 0.15 <= ratio <= 0.70  # не «всё done» и не «ничего»