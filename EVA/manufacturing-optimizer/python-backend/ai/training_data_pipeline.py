"""
training_data_pipeline.py — сбор и анализ обучающей выборки ТОЛЬКО из реальных operations.

Правила:
- не генерируем синтетические строки;
- берём только status=completed с проставленными датами;
- целевая переменная actual_delay_days считается из дат (или 0, если план/факт совпали);
- признаки — только поля, которые есть в таблице operations / считаются из них.
"""
from __future__ import annotations

import json
import math
import sqlite3
from collections import Counter
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple


PRIORITY_MAP = {
    "low": 1,
    "medium": 2,
    "normal": 2,
    "high": 3,
    "critical": 4,
    "urgent": 4,
}


def _parse_list(val) -> List[str]:
    if val is None:
        return []
    if isinstance(val, list):
        return [str(x).strip() for x in val if str(x).strip()]
    s = str(val).strip()
    if not s:
        return []
    try:
        data = json.loads(s)
        if isinstance(data, list):
            return [str(x).strip() for x in data if str(x).strip()]
    except Exception:
        pass
    # "1,2,3"
    if "," in s:
        return [p.strip() for p in s.split(",") if p.strip()]
    return [s]


def _to_float(x, default=0.0) -> float:
    try:
        if x is None or x == "":
            return float(default)
        return float(x)
    except Exception:
        return float(default)


def _priority_num(p) -> float:
    if p is None:
        return 2.0
    if isinstance(p, (int, float)):
        return float(p)
    return float(PRIORITY_MAP.get(str(p).strip().lower(), 2))


def _parse_date(s) -> Optional[datetime]:
    if s is None:
        return None
    t = str(s).strip()
    if not t:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%d.%m.%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(t[:19], fmt)
        except Exception:
            continue
    try:
        # ISO
        return datetime.fromisoformat(t.replace("Z", ""))
    except Exception:
        return None


def planned_duration_days(row: Dict) -> float:
    """План длительности в днях из реальных полей."""
    d = _to_float(row.get("duration"), 0)
    if d > 0:
        return d
    labor = _to_float(row.get("labor_hours"), 0)
    people = max(_to_float(row.get("people_count"), 1), 1)
    if labor > 0:
        return labor / (people * 8.0)
    return 0.0


def actual_duration_days(row: Dict) -> Optional[float]:
    a0 = _parse_date(row.get("actual_start"))
    a1 = _parse_date(row.get("actual_end"))
    if a0 and a1 and a1 >= a0:
        return max((a1 - a0).total_seconds() / 86400.0, 0.0)
    return None


def actual_delay_days(row: Dict) -> Optional[float]:
    """
    Задержка = факт окончания − план окончания (в днях).
    Если end_date нет — считаем max(0, actual_duration − planned_duration).
    """
    plan_end = _parse_date(row.get("end_date"))
    act_end = _parse_date(row.get("actual_end"))
    if plan_end and act_end:
        return (act_end - plan_end).total_seconds() / 86400.0

    act_dur = actual_duration_days(row)
    plan_dur = planned_duration_days(row)
    if act_dur is not None and plan_dur > 0:
        return act_dur - plan_dur
    return None


def row_to_sample(row: Dict, critical_ids: Optional[set] = None) -> Optional[Dict[str, Any]]:
    """
    Одна строка обучения. None — если данных недостаточно (не выдумываем).
    """
    status = str(row.get("status") or "").lower()
    if status not in ("completed", "done", "finished"):
        return None

    act_end = row.get("actual_end")
    if not act_end:
        return None

    delay = actual_delay_days(row)
    if delay is None:
        return None

    plan_dur = planned_duration_days(row)
    if plan_dur <= 0:
        # без плана длительности признак duration бессмысленен — пропускаем
        return None

    prevs = _parse_list(row.get("prev_ops"))
    nexts = _parse_list(row.get("next_ops"))
    op_num = str(row.get("op_number") or row.get("id") or "").strip()
    is_crit = False
    if critical_ids and op_num:
        is_crit = op_num in critical_ids or f"T{op_num}" in critical_ids

    labor = _to_float(row.get("labor_hours"), 0)
    people = max(_to_float(row.get("people_count"), 1), 1)
    reserve = _to_float(row.get("time_reserve"), 0)
    post = _to_float(row.get("post"), 0)
    act_dur = actual_duration_days(row)

    sample = {
        "operation_id": row.get("id"),
        "op_number": op_num,
        "name": row.get("name"),
        # признаки (согласованы с Predictor.FEATURE_NAMES)
        "duration_days": plan_dur,
        "duration": plan_dur,
        "labor_hours": labor,
        "people_count": people,
        "labor_per_person": labor / people if people else labor,
        "priority": _priority_num(row.get("priority")),
        "deps_count": float(len(prevs)),
        "next_count": float(len(nexts)),
        "total_float": reserve,
        "time_reserve": reserve,
        "post": post,
        "is_critical": bool(is_crit),
        "progress": 1.0,  # completed
        "required_skills": [],  # в operations нет — не выдумываем skills
        "dependencies": prevs,
        # цель
        "actual_delay_days": float(delay),
        "actual_duration_days": float(act_dur) if act_dur is not None else None,
        "end_date": row.get("end_date"),
        "actual_end": row.get("actual_end"),
        "actual_start": row.get("actual_start"),
    }
    return sample


def analyze_operations(rows: List[Dict]) -> Dict[str, Any]:
    """Отчёт по качеству данных — только факты из rows."""
    total = len(rows)
    by_status = Counter(str(r.get("status") or "unknown").lower() for r in rows)
    completed = [r for r in rows if str(r.get("status") or "").lower() in ("completed", "done", "finished")]
    with_actual_end = [r for r in completed if r.get("actual_end")]
    with_end_date = [r for r in completed if r.get("end_date")]
    with_both_dates = [r for r in completed if r.get("actual_end") and r.get("end_date")]
    with_plan_dur = [r for r in completed if planned_duration_days(r) > 0]

    samples = []
    skipped = Counter()
    for r in rows:
        s = row_to_sample(r)
        if s is None:
            st = str(r.get("status") or "").lower()
            if st not in ("completed", "done", "finished"):
                skipped["not_completed"] += 1
            elif not r.get("actual_end"):
                skipped["no_actual_end"] += 1
            elif actual_delay_days(r) is None:
                skipped["cannot_compute_delay"] += 1
            elif planned_duration_days(r) <= 0:
                skipped["no_planned_duration"] += 1
            else:
                skipped["other"] += 1
        else:
            samples.append(s)

    delays = [s["actual_delay_days"] for s in samples]
    delay_stats = {}
    if delays:
        delays_sorted = sorted(delays)
        delay_stats = {
            "min": round(min(delays), 3),
            "max": round(max(delays), 3),
            "mean": round(sum(delays) / len(delays), 3),
            "median": round(delays_sorted[len(delays_sorted) // 2], 3),
            "positive_delay_count": sum(1 for d in delays if d > 0.01),
            "zero_or_early_count": sum(1 for d in delays if d <= 0.01),
        }

    return {
        "total_operations": total,
        "by_status": dict(by_status),
        "completed": len(completed),
        "completed_with_actual_end": len(with_actual_end),
        "completed_with_end_date": len(with_end_date),
        "completed_with_both_plan_and_actual_end": len(with_both_dates),
        "completed_with_planned_duration": len(with_plan_dur),
        "trainable_samples": len(samples),
        "skipped": dict(skipped),
        "delay_stats": delay_stats,
        "min_samples_recommended": 20,
        "ready_to_train": len(samples) >= 20,
        "message": (
            f"Готово к обучению: {len(samples)} образцов."
            if len(samples) >= 20
            else (
                f"Мало данных для ML: {len(samples)} образцов (нужно ≥ 20). "
                f"completed={len(completed)}, с actual_end={len(with_actual_end)}. "
                "Закройте операции с фактическими датами — без этого модель не из чего учить."
            )
        ),
    }


def build_samples_from_rows(
    rows: List[Dict],
    critical_ids: Optional[set] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    analysis = analyze_operations(rows)
    samples = []
    for r in rows:
        s = row_to_sample(r, critical_ids=critical_ids)
        if s is not None:
            samples.append(s)
    analysis["trainable_samples"] = len(samples)
    analysis["ready_to_train"] = len(samples) >= 20
    return samples, analysis


def load_operations_from_db(db_path: str) -> List[Dict[str, Any]]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='operations'")
    if not cur.fetchone():
        conn.close()
        return []
    cur.execute("SELECT * FROM operations")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def sync_samples_to_training_table(db_path: str, samples: List[Dict[str, Any]]) -> int:
    """Пишет образцы в ai_training_data (пересоздание содержимого)."""
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_training_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operation_id INTEGER,
            op_number TEXT,
            duration_days REAL,
            labor_hours REAL,
            people_count REAL,
            priority REAL,
            deps_count REAL,
            total_float REAL,
            post REAL,
            is_critical INTEGER DEFAULT 0,
            progress REAL DEFAULT 1.0,
            actual_delay_days REAL,
            actual_duration_days REAL,
            end_date TEXT,
            actual_end TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cur.execute("DELETE FROM ai_training_data")
    for s in samples:
        cur.execute(
            """
            INSERT INTO ai_training_data (
                operation_id, op_number, duration_days, labor_hours, people_count,
                priority, deps_count, total_float, post, is_critical, progress,
                actual_delay_days, actual_duration_days, end_date, actual_end
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                s.get("operation_id"),
                s.get("op_number"),
                s.get("duration_days"),
                s.get("labor_hours"),
                s.get("people_count"),
                s.get("priority"),
                s.get("deps_count"),
                s.get("total_float"),
                s.get("post"),
                1 if s.get("is_critical") else 0,
                s.get("progress", 1.0),
                s.get("actual_delay_days"),
                s.get("actual_duration_days"),
                s.get("end_date"),
                s.get("actual_end"),
            ),
        )
    conn.commit()
    n = cur.execute("SELECT COUNT(*) FROM ai_training_data").fetchone()[0]
    conn.close()
    return int(n)


def load_samples_from_training_table(db_path: str) -> List[Dict[str, Any]]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_training_data'")
    if not cur.fetchone():
        conn.close()
        return []
    cur.execute("SELECT * FROM ai_training_data")
    rows = []
    for r in cur.fetchall():
        d = dict(r)
        d["duration"] = d.get("duration_days")
        d["dependencies"] = []  # deps_count уже числом
        d["required_skills"] = []
        d["is_critical"] = bool(d.get("is_critical"))
        rows.append(d)
    conn.close()
    return rows
