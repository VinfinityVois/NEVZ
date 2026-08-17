"""
Тесты для ai/predictor.py.

Раньше этот файл был пустым (0 байт) — ни одной проверки на то, что
модель прогноза задержек и детектор аномалий реально работают. Ниже —
минимальный, но содержательный набор: не просто "функция не падает",
а "модель реально различает разные входы и находит подставленную
аномалию".
"""
import sys
import os
import random

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai.predictor import Predictor, HAS_SKLEARN


requires_sklearn = pytest.mark.skipif(
    not HAS_SKLEARN, reason="scikit-learn не установлен в этом окружении"
)


@pytest.fixture
def predictor(tmp_path):
    """Изолированный Predictor с моделями в temp-директории —
    не задевает реальные models/saved/*.joblib проекта."""
    return Predictor(config={"model_dir": str(tmp_path / "models")})


def _make_historical(n=40, seed=42):
    """Синтетическая история: чем меньше total_float и чем длиннее
    duration, тем больше реальная задержка. Модель должна это уловить."""
    rnd = random.Random(seed)
    rows = []
    for i in range(n):
        duration = rnd.uniform(2, 15)
        total_float = rnd.uniform(0, 10)
        is_critical = total_float < 2
        base_delay = max(0.0, (duration - 5) * 0.3 + (5 - total_float) * 0.4)
        noise = rnd.uniform(-0.5, 0.5)
        rows.append({
            "id": str(i),
            "duration_days": duration,
            "priority": 1,
            "total_float": total_float,
            "is_critical": is_critical,
            "progress": 1.0,
            "actual_delay_days": max(0.0, base_delay + noise),
        })
    return rows


class TestDelayModelTraining:
    @requires_sklearn
    def test_train_delay_model_learns_non_trivial_signal(self, predictor):
        """
        Ключевая регрессия: раньше sync_training_data всегда писал
        actual_delay_days = 0, и модель обучалась предсказывать
        "задержки никогда не будет" для любой задачи. Проверяем, что
        при реальном разбросе целевой переменной модель различает
        задачи с высоким и низким риском.
        """
        historical = _make_historical(n=50)
        result = predictor.train_delay_model(historical=historical, save=False)

        assert result["success"] is True
        assert result["samples"] == 50
        # r2_train == 0 (или отрицательный) означал бы, что модель не
        # уловила вообще никакой закономерности — именно так вело себя
        # обучение на константных нулях.
        assert result["r2_train"] > 0.3

    @requires_sklearn
    def test_predict_task_delay_distinguishes_risk_levels(self, predictor):
        historical = _make_historical(n=60)
        predictor.train_delay_model(historical=historical, save=False)

        low_risk_task = {
            "id": "low", "duration_days": 3, "total_float": 9, "progress": 0.0
        }
        high_risk_task = {
            "id": "high", "duration_days": 14, "total_float": 0.5, "progress": 0.0
        }

        low_pred = predictor.predict_task_delay(low_risk_task, is_critical=False)
        high_pred = predictor.predict_task_delay(high_risk_task, is_critical=True)

        assert low_pred["method"] == "ml"
        assert high_pred["method"] == "ml"
        # Модель обязана давать разным по риску задачам разный прогноз,
        # а не одну и ту же константу.
        assert high_pred["expected_delay_days"] > low_pred["expected_delay_days"]

    def test_train_delay_model_without_data_is_safe(self, predictor):
        """Пустая история не должна ронять обучение."""
        result = predictor.train_delay_model(historical=[], save=False)
        assert result.get("success") in (False, None) or result.get("samples") == 0


class TestAnomalyDetection:
    @requires_sklearn
    def test_detect_anomalies_finds_planted_outlier(self, predictor):
        """
        Раньше признаки (progress, 1-progress) были линейно зависимы —
        IsolationForest не мог найти содержательных выбросов. Проверяем
        на новых признаках (schedule_ratio, labor_intensity,
        people_density), что явно подставленная аномалия находится.
        """
        rnd = random.Random(7)
        tasks = []
        for i in range(15):
            duration = rnd.uniform(3, 8)
            tasks.append({
                "id": f"normal_{i}",
                "duration_days": duration,
                "labor_hours": duration * 3 * 8 * rnd.uniform(0.9, 1.1),
                "people_count": 3,
                "elapsed_days": duration * rnd.uniform(0.4, 0.9),
            })

        # Задача должна была идти 4 дня, идёт уже 30, трудозатрат почти нет
        tasks.append({
            "id": "planted_anomaly",
            "duration_days": 4,
            "labor_hours": 3,
            "people_count": 3,
            "elapsed_days": 30,
        })

        anomalies = predictor.detect_anomalies_ml(tasks, contamination=0.1)
        anomaly_ids = {a["task_id"] for a in anomalies}

        assert "planted_anomaly" in anomaly_ids

        planted = next(a for a in anomalies if a["task_id"] == "planted_anomaly")
        # Подставленная аномалия должна быть самой выраженной (наименьший score)
        assert planted["anomaly_score"] == min(a["anomaly_score"] for a in anomalies)

    def test_detect_anomalies_respects_min_samples(self, predictor):
        """Меньше min_samples операций — результат не считаем (ненадёжно
        на маленькой выборке), а не выдаём случайные 10% как аномалии."""
        tasks = [
            {"id": "t1", "duration_days": 5, "labor_hours": 40,
             "people_count": 2, "elapsed_days": 3}
            for _ in range(3)
        ]
        anomalies = predictor.detect_anomalies_ml(tasks, min_samples=10)
        assert anomalies == []

    def test_detect_anomalies_empty_input(self, predictor):
        assert predictor.detect_anomalies_ml([]) == []

class TestExplainability:
    @requires_sklearn
    def test_global_feature_importance_before_training_is_empty(self, predictor):
        assert predictor.get_global_feature_importance() == []

    @requires_sklearn
    def test_global_feature_importance_sums_to_one_and_is_sorted(self, predictor):
        historical = _make_historical(n=50)
        predictor.train_delay_model(historical=historical, save=False)

        importance = predictor.get_global_feature_importance()
        assert len(importance) == len(predictor.FEATURE_NAMES)

        total = sum(f["importance"] for f in importance)
        assert total == pytest.approx(1.0, abs=0.01)

        values = [f["importance"] for f in importance]
        assert values == sorted(values, reverse=True)

    @requires_sklearn
    def test_prediction_explanation_reflects_known_signal(self, predictor):
        """
        Синтетические данные сконструированы так, что задержка зависит
        от duration и total_float. Проверяем, что объяснение прогноза
        называет именно эти факторы, а не что-то нерелевантное вроде
        priority (которая в _make_historical константа и не несёт
        никакого сигнала).
        """
        historical = _make_historical(n=60)
        predictor.train_delay_model(historical=historical, save=False)

        task = {"id": "t1", "duration_days": 13, "total_float": 0.3, "progress": 0.0}
        result = predictor.predict_task_delay(task, is_critical=True)

        assert "explanation" in result
        top_features = {f["feature"] for f in result["explanation"]["top_factors"]}
        assert "priority" not in top_features
        assert top_features & {"duration", "total_float", "duration_x_critical"}