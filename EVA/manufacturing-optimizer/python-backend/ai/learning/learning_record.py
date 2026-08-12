from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Optional, Dict, Any


@dataclass
class LearningRecord:
    """
    Один обучающий пример, полученный из реальной работы системы.

    Здесь хранится:
    - что было запланировано;
    - что предсказал AI;
    - что произошло на самом деле;
    - ошибка прогноза;
    - признаки, которые видел AI;
    - версия модели.
    """

    task_id: str

    model_version: str

    planned_duration: Optional[float]
    predicted_duration: Optional[float]

    planned_delay: Optional[float]
    predicted_delay: Optional[float]

    actual_duration: Optional[float]
    actual_delay: Optional[float]

    prediction_error: Optional[float]

    features: Dict[str, Any]

    created_at: str

    is_valid: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def create(
        cls,
        task_id: str,
        model_version: str,
        planned_duration: Optional[float],
        predicted_duration: Optional[float],
        planned_delay: Optional[float],
        predicted_delay: Optional[float],
        actual_duration: Optional[float],
        actual_delay: Optional[float],
        features: Dict[str, Any],
    ) -> "LearningRecord":

        prediction_error = None

        if (
            predicted_delay is not None
            and actual_delay is not None
        ):
            prediction_error = (
                actual_delay - predicted_delay
            )

        return cls(
            task_id=str(task_id),

            model_version=model_version,

            planned_duration=planned_duration,
            predicted_duration=predicted_duration,

            planned_delay=planned_delay,
            predicted_delay=predicted_delay,

            actual_duration=actual_duration,
            actual_delay=actual_delay,

            prediction_error=prediction_error,

            features=features,

            created_at=datetime.now().isoformat(),

            is_valid=True,
        )