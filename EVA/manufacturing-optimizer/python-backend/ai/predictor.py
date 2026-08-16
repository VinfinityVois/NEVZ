"""
Predictor — прогноз задержек и рисков с использованием лёгкого ML.
Использует scikit-learn (быстро, без GPU).
"""

from typing import Dict, List, Optional, Any, Tuple
from collections import defaultdict
from pathlib import Path
import logging
import joblib
import numpy as np

logger = logging.getLogger(__name__)

# ML-зависимости
try:
    from sklearn.ensemble import GradientBoostingRegressor, IsolationForest
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False
    logger.warning("scikit-learn не установлен — предиктор работает в эвристическом режиме")


class Predictor:
    """
    Лёгкий предиктор с поддержкой ML:
    - Прогноз задержки работы
    - Оценка риска срыва проекта
    - Прогноз загрузки бригад
    - Простой anomaly detection (IsolationForest)
    """

    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {}
        self.model_dir = Path(self.config.get("model_dir", "ai/models/saved"))
        self.model_dir.mkdir(parents=True, exist_ok=True)

        self.delay_model = None          # GradientBoostingRegressor
        self.anomaly_model = None        # IsolationForest
        self.scaler = None

        self.default_delay_factor = self.config.get("default_delay_factor", 1.15)
        self._load_models()

    # ------------------------------------------------------------------
    # Загрузка / сохранение моделей
    # ------------------------------------------------------------------

    def _load_models(self):
        """Пытаемся загрузить ранее обученные модели"""
        if not HAS_SKLEARN:
            return

        delay_path = self.model_dir / "delay_model.joblib"
        anomaly_path = self.model_dir / "anomaly_model.joblib"

        try:
            if delay_path.exists():
                self.delay_model = joblib.load(delay_path)
                logger.info("Загружена модель прогноза задержек")
            if anomaly_path.exists():
                self.anomaly_model = joblib.load(anomaly_path)
                logger.info("Загружена модель anomaly detection")
        except Exception as e:
            logger.warning(f"Не удалось загрузить модели: {e}")

    def save_models(self):
        """Сохранить текущие модели на диск"""
        if not HAS_SKLEARN:
            return
        try:
            if self.delay_model is not None:
                joblib.dump(self.delay_model, self.model_dir / "delay_model.joblib")
            if self.anomaly_model is not None:
                joblib.dump(self.anomaly_model, self.model_dir / "anomaly_model.joblib")
            logger.info("Модели сохранены")
        except Exception as e:
            logger.error(f"Ошибка сохранения моделей: {e}")

    # ------------------------------------------------------------------
    # Признаки (feature engineering)
    # ------------------------------------------------------------------

    def _task_features(self, task: Dict, is_critical: bool = False) -> np.ndarray:
        """
        Простые числовые признаки задачи.
        Порядок должен быть одинаковым при обучении и предсказании.
        """
        duration = float(task.get("duration_days", task.get("duration", 5)))
        priority = float(task.get("priority", 1))
        skills_count = len(task.get("required_skills", []) or [])
        deps_count = len(task.get("dependencies", []) or [])
        float_val = float(task.get("total_float", 5) or 5)
        progress = float(task.get("progress", 0.0))

        return np.array([
            duration,
            priority,
            skills_count,
            deps_count,
            float_val,
            1.0 if is_critical else 0.0,
            progress,
            duration * (1.5 if is_critical else 1.0),  # взаимодействие
        ], dtype=float)

    # ------------------------------------------------------------------
    # Основные методы прогноза
    # ------------------------------------------------------------------

    def predict_task_delay(
        self,
        task: Dict,
        is_critical: bool = False,
        historical: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """
        Прогноз возможной задержки одной работы.
        Сначала пробует ML-модель, иначе — эвристику.
        """
        base_duration = float(task.get("duration_days", task.get("duration", 5)))

        # --- ML-прогноз ---
        if HAS_SKLEARN and self.delay_model is not None:
            try:
                features = self._task_features(task, is_critical).reshape(1, -1)
                predicted_delay = float(self.delay_model.predict(features)[0])
                predicted_delay = max(0.0, predicted_delay)

                predicted_duration = base_duration + predicted_delay
                risk = "high" if predicted_delay > 3 else "medium" if predicted_delay > 1 else "low"

                return {
                    "task_id": task["id"],
                    "base_duration": base_duration,
                    "predicted_duration": round(predicted_duration, 1),
                    "expected_delay_days": round(predicted_delay, 1),
                    "risk_level": risk,
                    "method": "ml"
                }
            except Exception as e:
                logger.debug(f"ML-прогноз не удался, fallback: {e}")

        # --- Эвристический fallback ---
        risk_multiplier = 1.0
        if is_critical:
            risk_multiplier += 0.12
        if base_duration >= 10:
            risk_multiplier += 0.15
        if len(task.get("required_skills", []) or []) > 2:
            risk_multiplier += 0.05
        if task.get("total_float", 5) < 1.5:
            risk_multiplier += 0.1

        predicted_duration = base_duration * risk_multiplier
        expected_delay = predicted_duration - base_duration

        return {
            "task_id": task["id"],
            "base_duration": base_duration,
            "predicted_duration": round(predicted_duration, 1),
            "expected_delay_days": round(max(0, expected_delay), 1),
            "risk_level": "high" if expected_delay > 3 else "medium" if expected_delay > 1 else "low",
            "method": "heuristic"
        }

    def predict_project_risk(self, plan: Dict) -> Dict[str, Any]:
        """Общая оценка риска срыва срока проекта"""
        tasks = plan.get("tasks", [])
        critical_ids = set(plan.get("critical_path_ids", []))

        if not tasks:
            return {"risk_score": 0, "level": "low", "message": "Нет задач"}

        critical_tasks = [t for t in tasks if t["id"] in critical_ids]
        long_critical = [t for t in critical_tasks if t.get("duration", t.get("duration_days", 0)) >= 8]

        # Суммарный ожидаемый delay по критическим работам
        total_expected_delay = 0.0
        for t in critical_tasks:
            pred = self.predict_task_delay(t, is_critical=True)
            total_expected_delay += pred["expected_delay_days"]

        risk_score = 0.0
        risk_score += len(critical_tasks) * 0.7
        risk_score += len(long_critical) * 1.4
        risk_score += plan.get("stats", {}).get("bottlenecks_count", 0) * 0.5
        risk_score += total_expected_delay * 0.35

        if risk_score >= 12:
            level, message = "high", "Высокий риск срыва срока"
        elif risk_score >= 6:
            level, message = "medium", "Умеренный риск"
        else:
            level, message = "low", "Риск низкий"

        return {
            "risk_score": round(risk_score, 1),
            "level": level,
            "message": message,
            "critical_tasks_count": len(critical_tasks),
            "long_critical_count": len(long_critical),
            "expected_total_delay_days": round(total_expected_delay, 1)
        }

    def predict_brigade_load(
        self,
        plan: Dict,
        brigades: List[Dict],
        days_ahead: int = 14
    ) -> List[Dict]:
        """Прогноз загрузки бригад"""
        results = []
        tasks = plan.get("tasks", [])

        load = defaultdict(float)
        for t in tasks:
            b_id = str(t.get("brigade_id", "unknown"))
            load[b_id] += float(t.get("duration", t.get("duration_days", 0)))

        for b in brigades:
            b_id = str(b["id"])
            capacity = float(b.get("capacity", 12))
            current_load = load.get(b_id, 0)
            ratio = current_load / capacity if capacity > 0 else 0

            results.append({
                "brigade_id": b_id,
                "brigade_name": b.get("name", b_id),
                "predicted_load": round(current_load, 1),
                "capacity": capacity,
                "utilization": round(ratio, 2),
                "status": "overloaded" if ratio > 1.05 else "high" if ratio > 0.85 else "normal"
            })
        return results

    # ------------------------------------------------------------------
    # Anomaly detection (IsolationForest)
    # ------------------------------------------------------------------

    def detect_anomalies_ml(
        self,
        tasks_actual: List[Dict],
        contamination: float = 0.1,
        min_samples: int = 10
    ) -> List[Dict]:
        """
        Поиск операций с аномальным поведением через IsolationForest.

        Признаки считаются из реальных, измеримых характеристик работы:
          - schedule_ratio: во сколько раз уже прошедшее время превышает
            плановую длительность (>1 значит работа уже не укладывается
            в срок, хотя формально ещё не завершена)
          - labor_intensity: фактические labor_hours относительно
            "ожидаемых" (duration_days * people_count * 8ч) — сильное
            отклонение говорит либо о недооценке трудоёмкости при
            планировании, либо о проблеме на месте
          - people_density: people_count относительно длительности —
            подозрительно большие бригады на короткие работы (и наоборот)

        Раньше здесь использовались две фичи progress/(1-progress), которые
        линейно зависимы друг от друга — на таких данных IsolationForest
        физически не может найти ничего осмысленного, только выбросы по
        единственной реальной оси. Сейчас признаки независимы и опираются
        на реальные поля из operations, а не на несуществующий "progress".
        """
        if not HAS_SKLEARN or not tasks_actual:
            return []

        if len(tasks_actual) < min_samples:
            logger.info(
                f"Недостаточно операций для anomaly detection: "
                f"{len(tasks_actual)} < {min_samples}"
            )
            return []

        try:
            features = []
            ids = []
            meta = []
            for t in tasks_actual:
                duration = max(float(t.get("duration_days", t.get("duration", 0)) or 0), 0.1)
                labor_hours = float(t.get("labor_hours", 0) or 0)
                people_count = max(float(t.get("people_count", 1) or 1), 1.0)
                elapsed_days = float(t.get("elapsed_days", 0) or 0)

                schedule_ratio = elapsed_days / duration
                expected_labor = duration * people_count * 8.0
                labor_intensity = labor_hours / expected_labor if expected_labor > 0 else 0.0
                people_density = people_count / duration

                features.append([schedule_ratio, labor_intensity, people_density])
                ids.append(t["id"])
                meta.append({
                    "schedule_ratio": round(schedule_ratio, 2),
                    "labor_intensity": round(labor_intensity, 2)
                })

            X = np.array(features)

            # Каждый вызов обучается заново на текущем срезе активных
            # операций — это не "накопленное обучение", а поиск выбросов
            # относительно текущей картины (это и есть корректное
            # применение IsolationForest для разовой диагностики, в
            # отличие от переиспользования модели, обученной на другом
            # распределении признаков).
            model = IsolationForest(
                contamination=contamination,
                random_state=42,
                n_estimators=150
            )
            preds = model.fit_predict(X)
            scores = model.decision_function(X)

            anomalies = []
            for i, pred in enumerate(preds):
                if pred == -1:
                    reason_parts = []
                    if meta[i]["schedule_ratio"] > 1.2:
                        reason_parts.append("сильно вышла за плановый срок")
                    if meta[i]["labor_intensity"] > 1.5:
                        reason_parts.append("трудозатраты сильно выше плана")
                    elif meta[i]["labor_intensity"] < 0.3:
                        reason_parts.append("трудозатраты подозрительно ниже плана")
                    reason = "; ".join(reason_parts) or "нетипичное сочетание признаков"

                    anomalies.append({
                        "task_id": ids[i],
                        "anomaly_score": float(scores[i]),
                        "type": "ml_anomaly",
                        "message": f"AI считает операцию аномальной: {reason}",
                        **meta[i]
                    })
            return anomalies
        except Exception as e:
            logger.warning(f"ML anomaly detection failed: {e}")
            return []

    # ------------------------------------------------------------------
    # Обучение модели задержек (на исторических данных)
    # ------------------------------------------------------------------

    def train_delay_model(
        self,
        historical: List[Dict],
        save: bool = True
    ) -> Dict[str, Any]:
        """
        Обучение GradientBoostingRegressor на исторических данных.
        
        historical — список словарей вида:
        {
            "duration_days": 8,
            "priority": 3,
            "required_skills": [...],
            "dependencies": [...],
            "total_float": 2.0,
            "is_critical": True,
            "progress": 1.0,
            "actual_delay_days": 2.5          # ← целевая переменная
        }
        """

        # Обучение детектора аномалий (IsolationForest)
        try:
            import numpy as np
            from sklearn.ensemble import IsolationForest

            X_anom = []
            for row in historical:
                delay = float(row.get("actual_delay_days", 0) or 0)
                dur = float(row.get("duration_days", 1) or 1)
                progress = float(row.get("progress", 1.0) or 1.0)
                X_anom.append([
                    progress,
                    1.0 - progress,
                    delay,
                    delay / max(dur, 0.01),
                ])
            X_anom = np.array(X_anom, dtype=float)

            if len(X_anom) >= 20:
                self.anomaly_model = IsolationForest(
                    contamination=0.1,
                    random_state=42,
                    n_estimators=100,
                )
                self.anomaly_model.fit(X_anom)
                if save:
                    self.save_models()
                logger.info("Anomaly model (IsolationForest) trained on %s samples", len(X_anom))
        except Exception as e:
            logger.warning("Anomaly model training skipped: %s", e)
            

        if not HAS_SKLEARN:
            return {"success": False, "message": "scikit-learn не установлен"}

        if len(historical) < 20:
            return {
                "success": False,
                "message": f"Мало данных для обучения ({len(historical)}). Нужно хотя бы 20–30 записей."
            }

        X, y = [], []
        for row in historical:
            is_crit = bool(row.get("is_critical", False))
            feat = self._task_features(row, is_critical=is_crit)
            X.append(feat)
            y.append(float(row.get("actual_delay_days", 0)))

        X = np.array(X)
        y = np.array(y)

        model = GradientBoostingRegressor(
            n_estimators=120,
            max_depth=4,
            learning_rate=0.08,
            random_state=42
        )
        model.fit(X, y)
        self.delay_model = model

        train_score = model.score(X, y)

        if save:
            self.save_models()

        return {
            "success": True,
            "samples": len(historical),
            "r2_train": round(train_score, 3),
            "message": "Модель прогноза задержек обучена"
        }