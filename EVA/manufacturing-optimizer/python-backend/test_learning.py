from ai.learning.repository import LearningRepository
from ai.learning.data_collector import DataCollector


repository = LearningRepository(
    "test_learning.db"
)

collector = DataCollector(
    repository
)


print("=== STEP 1: prediction ===")

record_id = collector.record_prediction(

    task_id="TEST-001",

    model_version="v1",

    planned_duration=8.0,
    predicted_duration=9.2,

    planned_delay=0.0,
    predicted_delay=1.2,

    features={
        "duration_days": 8,
        "priority": 3,
        "skills_count": 2,
        "deps_count": 1,
        "total_float": 0,
        "is_critical": True,
        "progress": 0,
    }
)


print(
    "Создана запись:",
    record_id
)


print("\n=== STEP 2: actual result ===")


collector.complete_prediction(

    task_id="TEST-001",

    actual_duration=10.5,
    actual_delay=2.5,
)


print(
    "Обучающих записей:",
    collector.get_training_size()
)


print("\n=== STEP 3: read record ===")


record = repository.find_by_task_id(
    "TEST-001"
)


print(
    record.to_dict()
)