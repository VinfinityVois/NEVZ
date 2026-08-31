"""
plan_compare.py — метрики плана, сравнение до/после в %, горизонты, импорт ЖЦ из Excel.

Резервы (float) считаются в cpm/critical_path.py:
  Total Float TF = LS - ES = LF - EF
  Free Float  FF = min(ES successors) - EF  (или TF, если нет successors)
  is_critical  ⇔  |TF| < 1e-6

Этот модуль НЕ пересчитывает CPM — берёт готовый plan из AIEngine / Scheduler
и строит сводки + процентные дельты.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from copy import deepcopy
import io
import logging
import re

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Горизонты планирования (дни от start_date)
# ---------------------------------------------------------------------------
HORIZON_DAYS: Dict[str, int] = {
    "day": 1,
    "week": 7,
    "month": 30,
    "quarter": 90,       # три месяца
    "three_months": 90,  # алиас
    "half_year": 182,
    "year": 365,
}

HORIZON_ALIASES = {
    "день": "day",
    "неделя": "week",
    "месяц": "month",
    "квартал": "quarter",
    "3месяца": "quarter",
    "три_месяца": "quarter",
    "полгода": "half_year",
    "год": "year",
}


def normalize_horizon(horizon: Optional[str]) -> str:
    if not horizon:
        return "year"
    h = str(horizon).strip().lower().replace(" ", "_").replace("-", "_")
    h = HORIZON_ALIASES.get(h, h)
    if h not in HORIZON_DAYS:
        logger.warning("Unknown horizon %r, fallback year", horizon)
        return "year"
    return h


def horizon_window(
    horizon: str,
    start_date: Optional[str] = None,
) -> Dict[str, Any]:
    """Окно планирования: start / end / days."""
    h = normalize_horizon(horizon)
    days = HORIZON_DAYS[h]
    if start_date:
        try:
            start = datetime.fromisoformat(start_date.replace("Z", "")[:10])
        except Exception:
            start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=days)
    return {
        "horizon": h,
        "days": days,
        "start_date": start.strftime("%Y-%m-%d"),
        "end_date": end.strftime("%Y-%m-%d"),
    }


def filter_tasks_by_horizon(
    tasks: List[Dict[str, Any]],
    horizon: str,
    start_date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Оставляет задачи, пересекающие окно горизонта.
    Если у задачи нет дат — оставляем (не теряем граф); фильтр мягкий.
    """
    win = horizon_window(horizon, start_date)
    try:
        w0 = datetime.fromisoformat(win["start_date"])
        w1 = datetime.fromisoformat(win["end_date"])
    except Exception:
        return list(tasks)

    out: List[Dict] = []
    for t in tasks:
        s = t.get("start_date") or t.get("planned_start") or t.get("es_date")
        e = t.get("end_date") or t.get("planned_end") or t.get("ef_date")
        # относительные дни ES/EF после CPM
        es = t.get("es")
        ef = t.get("ef")
        if s or e:
            try:
                ts = datetime.fromisoformat(str(s)[:10]) if s else None
                te = datetime.fromisoformat(str(e)[:10]) if e else ts
                if ts is None and te is None:
                    out.append(t)
                    continue
                if ts is None:
                    ts = te
                if te is None:
                    te = ts
                # пересечение интервалов
                if te >= w0 and ts <= w1:
                    out.append(t)
            except Exception:
                out.append(t)
        elif es is not None or ef is not None:
            # дни от старта проекта
            try:
                es_f = float(es if es is not None else 0)
                ef_f = float(ef if ef is not None else es_f)
                if ef_f >= 0 and es_f <= win["days"]:
                    out.append(t)
            except Exception:
                out.append(t)
        else:
            out.append(t)
    return out if out else list(tasks)


# ---------------------------------------------------------------------------
# Метрики плана (для сводки и %)
# ---------------------------------------------------------------------------
def _num(x: Any, default: float = 0.0) -> float:
    try:
        if x is None:
            return default
        return float(x)
    except Exception:
        return default


def extract_plan_metrics(plan: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Унифицированная сводка из ответа build_plan / cpm.
    """
    plan = plan or {}
    tasks = plan.get("tasks") or plan.get("scheduled_tasks") or []
    if not isinstance(tasks, list):
        tasks = []

    duration = _num(
        plan.get("total_duration_days")
        or plan.get("project_duration_days")
        or plan.get("project_duration")
        or (plan.get("cpm_stats") or {}).get("project_duration")
    )

    crit_ids = (
        plan.get("critical_path_ids")
        or [x.get("id") for x in (plan.get("critical_path") or []) if isinstance(x, dict)]
        or []
    )
    crit_ids = [str(x) for x in crit_ids]

    floats: List[float] = []
    zero_float = 0
    for t in tasks:
        if not isinstance(t, dict):
            continue
        tf = t.get("total_float")
        if tf is None:
            tf = t.get("time_reserve")
        if tf is None:
            continue
        v = _num(tf)
        floats.append(v)
        if abs(v) < 1e-6:
            zero_float += 1

    gaps = plan.get("gaps") or {}
    if isinstance(gaps, dict):
        gap_count = int(gaps.get("count") or len(gaps.get("gaps") or []) or 0)
    elif isinstance(gaps, list):
        gap_count = len(gaps)
    else:
        gap_count = 0

    proposals = plan.get("bridge_proposals") or plan.get("proposals") or {}
    if isinstance(proposals, dict):
        prop_count = int(proposals.get("count") or len(proposals.get("proposals") or []) or 0)
    elif isinstance(proposals, list):
        prop_count = len(proposals)
    else:
        prop_count = 0

    leveling = plan.get("leveling") or {}
    max_load = _num(
        plan.get("max_brigade_load")
        or leveling.get("max_load")
        or (plan.get("stats") or {}).get("max_brigade_load")
    )

    return {
        "project_duration_days": round(duration, 4),
        "tasks_count": len(tasks),
        "critical_tasks_count": len(crit_ids) if crit_ids else zero_float,
        "critical_path_ids": crit_ids,
        "zero_float_count": zero_float,
        "avg_total_float": round(sum(floats) / len(floats), 4) if floats else None,
        "min_total_float": round(min(floats), 4) if floats else None,
        "gaps_count": gap_count,
        "bridge_proposals_count": prop_count,
        "leveled": bool(leveling.get("leveled") if isinstance(leveling, dict) else plan.get("leveled")),
        "max_brigade_load": max_load if max_load else None,
        "horizon": plan.get("horizon"),
        "formula_note": {
            "total_float": "TF = LS - ES = LF - EF",
            "critical": "is_critical ⇔ |TF| ≈ 0",
            "free_float": "FF = min(ES_succ) - EF (or TF if no successors)",
        },
    }


def _pct_change(before: float, after: float) -> Optional[float]:
    """Процент изменения: (after - before) / |before| * 100. None если before=0."""
    if before is None or after is None:
        return None
    b, a = float(before), float(after)
    if abs(b) < 1e-12:
        if abs(a) < 1e-12:
            return 0.0
        return None  # нельзя делить
    return round((a - b) / abs(b) * 100.0, 2)


def compare_plans(
    before: Dict[str, Any],
    after: Dict[str, Any],
    *,
    labels: Tuple[str, str] = ("before", "after"),
) -> Dict[str, Any]:
    """
    Сводка сравнения в абсолютах и процентах.
    Улучшение срока: отрицательный pct по duration = сокращение.
    """
    m0 = extract_plan_metrics(before) if before.get("project_duration_days") is None and "tasks" in before else (
        extract_plan_metrics(before) if "total_duration_days" in before or "tasks" in before or "critical_path_ids" in before
        else before
    )
    # if already metrics-like
    if "project_duration_days" in before and "tasks" not in before and "critical_path" not in before:
        m0 = before
    else:
        m0 = extract_plan_metrics(before)

    if "project_duration_days" in after and "tasks" not in after and "critical_path" not in after:
        m1 = after
    else:
        m1 = extract_plan_metrics(after)

    keys = [
        "project_duration_days",
        "tasks_count",
        "critical_tasks_count",
        "zero_float_count",
        "gaps_count",
        "bridge_proposals_count",
        "max_brigade_load",
        "avg_total_float",
    ]

    rows = []
    for k in keys:
        b = m0.get(k)
        a = m1.get(k)
        if b is None and a is None:
            continue
        b_n = _num(b) if b is not None else None
        a_n = _num(a) if a is not None else None
        delta = None if b_n is None or a_n is None else round(a_n - b_n, 4)
        pct = _pct_change(b_n, a_n) if b_n is not None and a_n is not None else None
        rows.append({
            "metric": k,
            "label_ru": {
                "project_duration_days": "Длительность проекта (дн)",
                "tasks_count": "Число операций",
                "critical_tasks_count": "Критических операций",
                "zero_float_count": "Операций с TF=0",
                "gaps_count": "Разрывов цепочки",
                "bridge_proposals_count": "Предложений связей",
                "max_brigade_load": "Макс. загрузка бригады",
                "avg_total_float": "Средний Total Float (дн)",
            }.get(k, k),
            labels[0]: b_n,
            labels[1]: a_n,
            "delta": delta,
            "pct_change": pct,
        })

    # интерпретация срока
    dur_row = next((r for r in rows if r["metric"] == "project_duration_days"), None)
    summary_ru = []
    if dur_row and dur_row.get("pct_change") is not None:
        p = dur_row["pct_change"]
        if p < -0.5:
            summary_ru.append(f"Срок проекта сокращён на {abs(p):.1f}%")
        elif p > 0.5:
            summary_ru.append(f"Срок проекта вырос на {p:.1f}%")
        else:
            summary_ru.append("Срок проекта почти не изменился")

    g = next((r for r in rows if r["metric"] == "gaps_count"), None)
    if g and g.get("delta") is not None and g["delta"] < 0:
        summary_ru.append(f"Разрывов меньше на {int(abs(g['delta']))}")

    return {
        "success": True,
        labels[0]: m0,
        labels[1]: m1,
        "comparison": rows,
        "summary_ru": "; ".join(summary_ru) if summary_ru else "Сводка сформирована",
        "compared_at": datetime.now().isoformat(),
    }


# ---------------------------------------------------------------------------
# Импорт плана ЖЦ из Excel (основной формат для сравнения)
# ---------------------------------------------------------------------------
_COL_MAP = {
    "op_number": ["op_number", "номер", "номер операции", "operation", "id", "№", "no"],
    "name": ["name", "название", "наименование", "операция", "work"],
    "duration": ["duration", "длительность", "duration_days", "дн", "days"],
    "labor_hours": ["labor_hours", "трудоёмкость", "трудоемкость", "часы"],
    "people_count": ["people_count", "люди", "чел", "people"],
    "prev_ops": ["prev_ops", "prev", "предшественники", "предшествующие"],
    "next_ops": ["next_ops", "next", "последующие"],
    "brigade_id": ["brigade_id", "бригада", "brigade"],
    "post": ["post", "пост"],
    "drawing": ["drawing", "чертёж", "чертеж"],
    "start_date": ["start_date", "начало", "план начало", "planned_start"],
    "end_date": ["end_date", "окончание", "конец", "planned_end"],
    "status": ["status", "статус"],
}


def _norm_header(h: Any) -> str:
    s = str(h or "").strip().lower().replace("ё", "е")
    s = re.sub(r"\s+", " ", s)
    return s


def _resolve_columns(headers: List[str]) -> Dict[str, int]:
    normalized = [_norm_header(h) for h in headers]
    mapping: Dict[str, int] = {}
    for field, aliases in _COL_MAP.items():
        for i, h in enumerate(normalized):
            if h in aliases or any(a == h for a in aliases):
                mapping[field] = i
                break
    return mapping


def _parse_list_cell(val: Any) -> List[int]:
    if val is None or (isinstance(val, float) and str(val) == "nan"):
        return []
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return [int(val)]
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none", "-"):
        return []
    # JSON list?
    if s.startswith("["):
        try:
            import json
            data = json.loads(s)
            return [int(x) for x in data]
        except Exception:
            pass
    parts = re.split(r"[,;/\s]+", s)
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        try:
            out.append(int(float(p.replace("T", ""))))
        except Exception:
            continue
    return out


def tasks_from_excel_bytes(content: bytes, sheet_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Читает Excel-план ЖЦ → список tasks для CPM / compare.
    PDF/Word: отдельный путь (см. tasks_from_document_stub).
    """
    try:
        import pandas as pd
    except ImportError:
        return {"success": False, "error": "pandas не установлен", "tasks": []}

    try:
        xl = pd.ExcelFile(io.BytesIO(content))
        sheet = sheet_name or xl.sheet_names[0]
        df = pd.read_excel(xl, sheet_name=sheet, dtype=object)
    except Exception as e:
        return {"success": False, "error": f"Не удалось прочитать Excel: {e}", "tasks": []}

    if df.empty:
        return {"success": False, "error": "Пустой лист", "tasks": []}

    headers = [str(c) for c in df.columns]
    col = _resolve_columns(headers)
    if "op_number" not in col and "name" not in col:
        return {
            "success": False,
            "error": "Не найдены колонки номера/названия операции",
            "headers": headers,
            "tasks": [],
        }

    tasks: List[Dict[str, Any]] = []
    for _, row in df.iterrows():
        def cell(field: str, default=None):
            if field not in col:
                return default
            v = row.iloc[col[field]]
            if v is None or (isinstance(v, float) and str(v) == "nan"):
                return default
            return v

        op = cell("op_number")
        name = cell("name")
        if op is None and name is None:
            continue
        try:
            op_number = int(float(str(op).replace("T", "").strip())) if op is not None else None
        except Exception:
            op_number = None
        if op_number is None and not name:
            continue

        duration = cell("duration")
        labor = cell("labor_hours")
        people = cell("people_count") or 1
        try:
            people = int(float(people))
        except Exception:
            people = 1
        if duration is not None:
            try:
                duration_days = float(duration)
            except Exception:
                duration_days = 1.0
        elif labor is not None:
            try:
                duration_days = float(labor) / max(people, 1) / 8.0
            except Exception:
                duration_days = 1.0
        else:
            duration_days = 1.0

        tid = str(op_number if op_number is not None else name)
        tasks.append({
            "id": tid,
            "op_number": op_number if op_number is not None else tid,
            "name": str(name or f"Оп. {tid}"),
            "duration_days": max(duration_days, 0.01),
            "duration": max(duration_days, 0.01),
            "dependencies": [str(x) for x in _parse_list_cell(cell("prev_ops"))],
            "prev_ops": _parse_list_cell(cell("prev_ops")),
            "next_ops": _parse_list_cell(cell("next_ops")),
            "brigade_id": cell("brigade_id"),
            "post": cell("post"),
            "drawing": cell("drawing"),
            "start_date": str(cell("start_date"))[:10] if cell("start_date") is not None else None,
            "end_date": str(cell("end_date"))[:10] if cell("end_date") is not None else None,
            "status": str(cell("status") or "pending"),
            "labor_hours": float(labor) if labor is not None else None,
            "people_count": people,
        })

    return {
        "success": True,
        "source": "excel",
        "sheet": sheet,
        "tasks_count": len(tasks),
        "tasks": tasks,
        "mapped_columns": {k: headers[i] for k, i in col.items()},
    }


def tasks_from_document_stub(filename: str, content: bytes) -> Dict[str, Any]:
    """
    PDF / Word — заготовка.
    Excel обрабатывается tasks_from_excel_bytes.
    """
    lower = (filename or "").lower()
    if lower.endswith((".xlsx", ".xls", ".xlsm")):
        return tasks_from_excel_bytes(content)
    if lower.endswith(".csv"):
        try:
            import pandas as pd
            df = pd.read_csv(io.BytesIO(content))
            buf = io.BytesIO()
            df.to_excel(buf, index=False)
            return tasks_from_excel_bytes(buf.getvalue())
        except Exception as e:
            return {"success": False, "error": str(e), "tasks": []}
    if lower.endswith((".docx", ".doc")):
        return {
            "success": False,
            "error": "Импорт Word в разработке: выгрузите таблицу операций в Excel",
            "tasks": [],
            "hint": "Колонки: op_number, name, duration, prev_ops, next_ops",
        }
    if lower.endswith(".pdf"):
        return {
            "success": False,
            "error": "Импорт PDF в разработке: используйте Excel-таблицу плана ЖЦ",
            "tasks": [],
        }
    return {"success": False, "error": f"Неизвестный формат: {filename}", "tasks": []}


# In-memory snapshots (процесс API; для production — таблица БД)
_SNAPSHOTS: Dict[str, Dict[str, Any]] = {}


def save_snapshot(name: str, plan: Dict[str, Any], meta: Optional[Dict] = None) -> Dict[str, Any]:
    key = (name or "default").strip() or "default"
    metrics = extract_plan_metrics(plan)
    _SNAPSHOTS[key] = {
        "name": key,
        "saved_at": datetime.now().isoformat(),
        "plan": plan,
        "metrics": metrics,
        "meta": meta or {},
    }
    return {"success": True, "name": key, "metrics": metrics, "saved_at": _SNAPSHOTS[key]["saved_at"]}


def get_snapshot(name: str) -> Optional[Dict[str, Any]]:
    return _SNAPSHOTS.get((name or "default").strip() or "default")


def list_snapshots() -> List[Dict[str, Any]]:
    return [
        {"name": v["name"], "saved_at": v["saved_at"], "metrics": v["metrics"]}
        for v in _SNAPSHOTS.values()
    ]
