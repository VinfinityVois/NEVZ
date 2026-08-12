from typing import Dict, Any, Optional

from .learning_record import LearningRecord
from .repository import LearningRepository


class DataCollector:
    """
    Слой обратной связи AI.

    Его задача:

        prediction
             ↓
        сохранение
             ↓
        actual result
             ↓
        calculation error
             ↓
        training data

    ВАЖНО:
    DataCollector НЕ обучает модель.
    """

    def __init__(
        self,
        repository: LearningRepository
    ):
        self.repository = repository

    def record_prediction(
        self,
        task_id: str,
        model_version: str,

        planned_duration: Optional[float],
        predicted_duration: Optional[float],

        planned_delay: Optional[float],
        predicted_delay: Optional[float],

        features: Dict[str, Any],
    ):

        record = LearningRecord.create(

            task_id=task_id,

            model_version=model_version,

            planned_duration=planned_duration,
            predicted_duration=predicted_duration,

            planned_delay=planned_delay,
            predicted_delay=predicted_delay,

            actual_duration=None,
            actual_delay=None,

            features=features,
        )

        return self.repository.create(record)

    def complete_prediction(
        self,
        task_id: str,

        actual_duration: Optional[float],
        actual_delay: Optional[float],
    ):

        record = self.repository.find_by_task_id(
            task_id
        )

        if record is None:
            return None

        record.actual_duration = actual_duration

        record.actual_delay = actual_delay

        if (
            record.predicted_delay is not None
            and actual_delay is not None
        ):

            record.prediction_error = (
                actual_delay
                - record.predicted_delay
            )

        return self.repository.update(
            record
        )

    def get_training_size(self) -> int:

        return self.repository.count_completed()