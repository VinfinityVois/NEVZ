"""
python -m scripts.apply_daily_scenario
python -m scripts.apply_daily_scenario --date 2026-08-18
python -m scripts.apply_daily_scenario --dry-run
"""
import argparse
import json
import sqlite3
from datetime import date
from pathlib import Path

from scenarios.daily_load import build_day_profile, generate_operations_for_day, scenario_summary

DB = Path(__file__).resolve().parents[1].parent / "data" / "manufacturing.db"
# подправь путь под свой get_db_path


def apply(d: date, dry: bool = False):
    profile = build_day_profile(d)
    ops = generate_operations_for_day(profile, brigades_count=40)
    summary = scenario_summary(ops, profile)
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if dry:
        return summary

    conn = sqlite3.connect(str(DB))
    cur = conn.cursor()

    # ВНИМАНИЕ: для daily-test лучше отдельная БД manufacturing_daily.db
    cur.execute("DELETE FROM operations")  # или TRUNCATE логика

    for o in ops:
        cur.execute(
            """
            INSERT INTO operations (
              post, op_number, name, drawing, labor_hours, people_count,
              duration, time_reserve, brigade_id, location, status,
              start_date, end_date, prev_ops, next_ops
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                o["post"], o["op_number"], o["name"], o["drawing"],
                o["labor_hours"], o["people_count"], o["duration"],
                o["time_reserve"], o["brigade_id"], o["location"], o["status"],
                o["start_date"], o["end_date"],
                json.dumps(o["prev_ops"]), json.dumps(o["next_ops"]),
            ),
        )
    conn.commit()
    conn.close()
    print("OK written", len(ops), "ops →", DB)
    return summary


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--date", default=None, help="YYYY-MM-DD")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    d = date.fromisoformat(args.date) if args.date else date.today()
    apply(d, dry=args.dry_run)