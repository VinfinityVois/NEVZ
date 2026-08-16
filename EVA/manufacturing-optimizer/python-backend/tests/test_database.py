"""
Тесты на схему и SQL-логику работы с operations / ai_training_data.

Главный сценарий здесь — регрессия для самого важного фикса: раньше
actual_delay_days при синхронизации в ai_training_data всегда был 0,
потому что actual_end никогда не проставлялся, а SQL просто не считал
разницу дат. Сейчас должно быть наоборот: реальные даты -> реальная,
ненулевая, различающаяся по операциям задержка.
"""
import sqlite3
import os
import tempfile

import pytest


SCHEMA = """
CREATE TABLE operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    op_number INTEGER,
    name TEXT,
    duration REAL DEFAULT 0,
    labor_hours REAL DEFAULT 0,
    people_count INTEGER DEFAULT 1,
    brigade_id INTEGER,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    start_date DATE,
    end_date DATE,
    actual_start DATE,
    actual_end DATE
);
"""

SYNC_SQL = """
    INSERT INTO ai_training_data
        (operation_id, op_number, name, duration, labor_hours,
         people_count, priority, status, brigade_id,
         start_date, end_date, actual_delay_days)
    SELECT
        id, op_number, name, duration, labor_hours,
        people_count, priority, status, brigade_id,
        start_date, end_date,
        MAX(0, julianday(actual_end) - julianday(end_date)) AS actual_delay_days
    FROM operations
    WHERE status = 'completed'
      AND actual_end IS NOT NULL
      AND end_date IS NOT NULL
"""

TRAINING_TABLE_SCHEMA = """
CREATE TABLE ai_training_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id INTEGER, op_number INTEGER, name TEXT,
    duration REAL, labor_hours REAL, people_count INTEGER,
    priority TEXT DEFAULT 'medium', status TEXT, brigade_id INTEGER,
    start_date TEXT, end_date TEXT, actual_delay_days REAL DEFAULT 0,
    is_critical INTEGER DEFAULT 0, total_float REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
"""


@pytest.fixture
def db_conn():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.execute(TRAINING_TABLE_SCHEMA)
    conn.commit()
    yield conn
    conn.close()
    os.remove(path)


def _insert_op(conn, **kwargs):
    defaults = dict(
        op_number=1, name="test", duration=5, labor_hours=40,
        people_count=2, brigade_id=1, status="pending",
        priority="medium", start_date=None, end_date=None,
        actual_start=None, actual_end=None,
    )
    defaults.update(kwargs)
    cols = ", ".join(defaults.keys())
    placeholders = ", ".join("?" * len(defaults))
    conn.execute(
        f"INSERT INTO operations ({cols}) VALUES ({placeholders})",
        list(defaults.values())
    )
    conn.commit()


class TestActualDelayCalculation:
    def test_completed_op_with_dates_produces_real_delay(self, db_conn):
        _insert_op(
            db_conn, status="completed",
            end_date="2026-08-01", actual_end="2026-08-05"
        )
        db_conn.execute(SYNC_SQL)
        db_conn.commit()

        row = db_conn.execute(
            "SELECT actual_delay_days FROM ai_training_data"
        ).fetchone()
        assert row is not None
        assert row[0] == 4.0

    def test_early_finish_clamped_to_zero_not_negative(self, db_conn):
        """Досрочное завершение не должно давать отрицательную 'задержку' —
        это отдельный сигнал (опережение), а не то же самое, что задержка."""
        _insert_op(
            db_conn, status="completed",
            end_date="2026-08-10", actual_end="2026-08-05"
        )
        db_conn.execute(SYNC_SQL)
        db_conn.commit()

        row = db_conn.execute(
            "SELECT actual_delay_days FROM ai_training_data"
        ).fetchone()
        assert row[0] == 0.0

    def test_completed_without_actual_end_is_excluded(self, db_conn):
        """
        Регрессия на исходный баг: операция помечена 'completed', но
        actual_end никогда не был проставлен (старые записи до фикса
        PUT /operations/{id}). Раньше такая запись всё равно попадала
        в выборку с actual_delay_days=0 по умолчанию — теперь она
        просто не должна участвовать в обучении вообще, а не тихо
        симулировать 'задержки не было'.
        """
        _insert_op(
            db_conn, status="completed",
            end_date="2026-08-01", actual_end=None
        )
        db_conn.execute(SYNC_SQL)
        db_conn.commit()

        count = db_conn.execute(
            "SELECT COUNT(*) FROM ai_training_data"
        ).fetchone()[0]
        assert count == 0

    def test_pending_and_in_progress_ops_excluded(self, db_conn):
        _insert_op(db_conn, status="pending", end_date="2026-08-01")
        _insert_op(db_conn, status="in_progress", end_date="2026-08-01")
        db_conn.execute(SYNC_SQL)
        db_conn.commit()

        count = db_conn.execute(
            "SELECT COUNT(*) FROM ai_training_data"
        ).fetchone()[0]
        assert count == 0

    def test_multiple_completed_ops_produce_varied_delays(self, db_conn):
        """
        Ключевая проверка "не фейк": на нескольких завершённых операциях
        с разными датами задержка должна реально различаться, а не быть
        одной и той же константой для всех строк.
        """
        _insert_op(db_conn, op_number=1, status="completed",
                   end_date="2026-08-01", actual_end="2026-08-01")  # 0 дней
        _insert_op(db_conn, op_number=2, status="completed",
                   end_date="2026-08-01", actual_end="2026-08-04")  # 3 дня
        _insert_op(db_conn, op_number=3, status="completed",
                   end_date="2026-08-01", actual_end="2026-08-09")  # 8 дней

        db_conn.execute(SYNC_SQL)
        db_conn.commit()

        delays = [
            r[0] for r in db_conn.execute(
                "SELECT actual_delay_days FROM ai_training_data ORDER BY op_number"
            ).fetchall()
        ]
        assert delays == [0.0, 3.0, 8.0]
        # Не все значения одинаковы — то есть модель получит сигнал,
        # а не константу.
        assert len(set(delays)) > 1