import json
import sqlite3
from typing import Optional, List

from .learning_record import LearningRecord


class LearningRepository:
    """
    Работа с историей прогнозов и фактических результатов.

    Repository ничего не знает про ML.
    Его задача только:
        сохранить
        получить
        обновить
        выбрать обучающие данные
    """

    def __init__(self, db_path: str):
        self.db_path = db_path

        self._create_table()

    def _connect(self):
        return sqlite3.connect(self.db_path)

    def _create_table(self):
        with self._connect() as conn:

            conn.execute("""
                CREATE TABLE IF NOT EXISTS ai_learning_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,

                    task_id TEXT NOT NULL,

                    model_version TEXT NOT NULL,

                    planned_duration REAL,
                    predicted_duration REAL,

                    planned_delay REAL,
                    predicted_delay REAL,

                    actual_duration REAL,
                    actual_delay REAL,

                    prediction_error REAL,

                    features_json TEXT NOT NULL,

                    created_at TEXT NOT NULL,

                    is_valid INTEGER DEFAULT 1
                )
            """)

            conn.commit()

    def create(
        self,
        record: LearningRecord
    ) -> int:

        with self._connect() as conn:

            cursor = conn.execute(
                """
                INSERT INTO ai_learning_records (
                    task_id,
                    model_version,

                    planned_duration,
                    predicted_duration,

                    planned_delay,
                    predicted_delay,

                    actual_duration,
                    actual_delay,

                    prediction_error,

                    features_json,

                    created_at,
                    is_valid
                )

                VALUES (
                    ?, ?,
                    ?, ?,
                    ?, ?,
                    ?, ?,
                    ?,
                    ?,
                    ?, ?
                )
                """,

                (
                    record.task_id,
                    record.model_version,

                    record.planned_duration,
                    record.predicted_duration,

                    record.planned_delay,
                    record.predicted_delay,

                    record.actual_duration,
                    record.actual_delay,

                    record.prediction_error,

                    json.dumps(
                        record.features,
                        ensure_ascii=False
                    ),

                    record.created_at,

                    int(record.is_valid),
                )
            )

            conn.commit()

            return cursor.lastrowid

    def find_by_task_id(
        self,
        task_id: str
    ) -> Optional[LearningRecord]:

        with self._connect() as conn:

            conn.row_factory = sqlite3.Row

            row = conn.execute(
                """
                SELECT *
                FROM ai_learning_records

                WHERE task_id = ?

                ORDER BY id DESC

                LIMIT 1
                """,

                (str(task_id),)
            ).fetchone()

        if row is None:
            return None

        return LearningRecord(
            task_id=row["task_id"],

            model_version=row["model_version"],

            planned_duration=row["planned_duration"],
            predicted_duration=row["predicted_duration"],

            planned_delay=row["planned_delay"],
            predicted_delay=row["predicted_delay"],

            actual_duration=row["actual_duration"],
            actual_delay=row["actual_delay"],

            prediction_error=row["prediction_error"],

            features=json.loads(
                row["features_json"]
            ),

            created_at=row["created_at"],

            is_valid=bool(row["is_valid"]),
        )

    def update(
        self,
        record: LearningRecord
    ):

        with self._connect() as conn:

            conn.execute(
                """
                UPDATE ai_learning_records

                SET
                    actual_duration = ?,
                    actual_delay = ?,
                    prediction_error = ?,
                    is_valid = ?

                WHERE task_id = ?
                """,

                (
                    record.actual_duration,
                    record.actual_delay,
                    record.prediction_error,
                    int(record.is_valid),

                    record.task_id,
                )
            )

            conn.commit()

        return record

    def get_completed_records(
        self,
        limit: Optional[int] = None
    ) -> List[LearningRecord]:

        query = """
            SELECT *
            FROM ai_learning_records

            WHERE actual_delay IS NOT NULL
              AND is_valid = 1

            ORDER BY id ASC
        """

        params = ()

        if limit is not None:

            query += " LIMIT ?"

            params = (limit,)

        with self._connect() as conn:

            conn.row_factory = sqlite3.Row

            rows = conn.execute(
                query,
                params
            ).fetchall()

        result = []

        for row in rows:

            result.append(
                LearningRecord(
                    task_id=row["task_id"],

                    model_version=row["model_version"],

                    planned_duration=row["planned_duration"],
                    predicted_duration=row["predicted_duration"],

                    planned_delay=row["planned_delay"],
                    predicted_delay=row["predicted_delay"],

                    actual_duration=row["actual_duration"],
                    actual_delay=row["actual_delay"],

                    prediction_error=row["prediction_error"],

                    features=json.loads(
                        row["features_json"]
                    ),

                    created_at=row["created_at"],

                    is_valid=bool(row["is_valid"]),
                )
            )

        return result

    def count_completed(self) -> int:

        with self._connect() as conn:

            row = conn.execute(
                """
                SELECT COUNT(*)
                FROM ai_learning_records

                WHERE actual_delay IS NOT NULL
                  AND is_valid = 1
                """
            ).fetchone()

        return int(row[0])