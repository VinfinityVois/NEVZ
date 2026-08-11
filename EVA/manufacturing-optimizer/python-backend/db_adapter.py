# python-backend/db_adapter.py
"""Адаптер: SQLite → AI Engine формат"""
import sqlite3
import json
from pathlib import Path
from typing import Dict, List

# Тот же путь, что api.py / db_unified: .../manufacturing-optimizer/data/manufacturing.db
_BASE = Path(__file__).resolve().parent       # python-backend
_ROOT = _BASE.parent                          # manufacturing-optimizer
DB_PATH = _ROOT / "data" / "manufacturing.db"
if not DB_PATH.exists():
    alt = _BASE / "data" / "manufacturing.db"
    if alt.exists():
        DB_PATH = alt

def get_db():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def build_ai_plan_from_db() -> Dict:
    """Текущий план из БД в формате AI Engine"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM operations ORDER BY op_number")
    ops = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM brigades")
    brigades = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT brigade_id, COUNT(*) as cnt FROM workers GROUP BY brigade_id")
    workers_count = {r['brigade_id']: r['cnt'] for r in cursor.fetchall()}

    conn.close()

    tasks = []
    for op in ops:
        prev = json.loads(op['prev_ops']) if op.get('prev_ops') else []
        nxt  = json.loads(op['next_ops']) if op.get('next_ops') else []

        duration = op.get('duration') or 0
        if duration == 0 and op.get('labor_hours', 0) > 0 and op.get('people_count', 1) > 0:
            duration = round(op['labor_hours'] / op['people_count'], 2)

        tasks.append({
            "id": f"T{op['op_number']}",
            "name": op['name'],
            "duration_days": duration,
            "dependencies": [f"T{p}" for p in prev],
            "priority": 1 if op.get('priority') == 'critical' else 2 if op.get('priority') == 'high' else 3,
            "required_skills": [],
            "brigade_id": str(op['brigade_id']) if op.get('brigade_id') else None,
            "status": op.get('status', 'pending'),
            "people_count": op.get('people_count', 1),
            "labor_hours": op.get('labor_hours', 0),
            "post": op.get('post')
        })

    brigades_out = []
    for b in brigades:
        load = workers_count.get(b['id'], 0)
        brigades_out.append({
            "id": str(b['id']),
            "name": b['name'],
            "skills": [],
            "capacity": float(b.get('max_capacity', 10)) * 20.0,
            "current_load": load,
            "efficiency_rating": b.get('efficiency_rating', 1.0)
        })

    total_duration = sum(t['duration_days'] for t in tasks)

    return {
        "tasks": tasks,
        "brigades": brigades_out,
        "resources": [],
        "start_date": None,
        "horizon": "month",
        "total_duration_days": total_duration,
        "critical_path_ids": [],
        "generated_at": None
    }

def get_historical_for_ml() -> List[Dict]:
    """Данные из ai_training_data для Predictor.train_delay_model()"""
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_training_data'")
        if not cursor.fetchone():
            conn.close()
            return []

        cursor.execute("PRAGMA table_info(ai_training_data)")
        cols = {r[1] for r in cursor.fetchall()}

        cursor.execute("SELECT * FROM ai_training_data")
        rows = cursor.fetchall()
        conn.close()

        historical = []
        for r in rows:
            d = dict(r)
            labor = float(d.get('labor_hours') or 0)
            people = float(d.get('people_count') or 1) or 1
            planned = labor / people if labor else float(d.get('duration') or 1)
            if 'actual_delay_days' in cols and d.get('actual_delay_days') is not None:
                delay = max(0.0, float(d['actual_delay_days']))
            elif 'actual_duration' in cols and d.get('actual_duration') is not None:
                delay = max(0.0, float(d['actual_duration']) - planned)
            else:
                delay = 0.0
            historical.append({
                "duration_days": planned,
                "priority": 2,
                "required_skills": [],
                "dependencies": [],
                "total_float": float(d.get('time_reserve') or d.get('total_float') or 0),
                "is_critical": bool(d.get('is_critical') or (float(d.get('time_reserve') or 0) < 0.5)),
                "progress": 1.0,
                "actual_delay_days": round(delay, 2),
            })
        return historical
    except Exception as e:
        conn.close()
        print("get_historical_for_ml error:", e)
        return []
def sync_operation_history_to_training() -> int:
    """Переносит operation_history → ai_training_data (одноразовый/повторный)"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT oh.operation_id, oh.actual_duration, oh.actual_people, oh.efficiency,
               o.labor_hours, o.people_count, o.time_reserve
        FROM operation_history oh
        JOIN operations o ON oh.operation_id = o.id
        WHERE oh.actual_duration IS NOT NULL
    """)

    inserted = 0
    for row in cursor.fetchall():
        cursor.execute("""
            INSERT OR IGNORE INTO ai_training_data 
            (operation_id, labor_hours, people_count, brigade_load, time_reserve, actual_duration, efficiency)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (row[0], row[4], row[5], 0, row[6], row[1], row[3]))
        if cursor.rowcount > 0:
            inserted += 1

    conn.commit()
    conn.close()
    return inserted