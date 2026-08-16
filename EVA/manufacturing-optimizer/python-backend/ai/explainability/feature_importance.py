"""
Глобальная объяснимость GradientBoosting (delay_model)
через feature_importances_.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional

# Порядок = predictor._task_features
FEATURE_NAMES = [
    "duration_days",
    "priority",
    "skills_count",
    "deps_count",
    "total_float",
    "is_critical",
    "progress",
    "duration_x_critical",
]

FEATURE_LABELS_RU = {
    "duration_days": "Длительность (дни)",
    "priority": "Приоритет",
    "skills_count": "Число требуемых навыков",
    "deps_count": "Число зависимостей",
    "total_float": "Полный резерв (float)",
    "is_critical": "На критическом пути",
    "progress": "Прогресс выполнения",
    "duration_x_critical": "Длительность × критичность",
}


def extract_feature_importances(model) -> List[Dict[str, Any]]:
    """model — обученный GradientBoostingRegressor (или любой с feature_importances_)."""
    if model is None:
        return []
    imp = getattr(model, "feature_importances_", None)
    if imp is None:
        return []
    rows = []
    for i, name in enumerate(FEATURE_NAMES):
        if i >= len(imp):
            break
        v = float(imp[i])
        rows.append({
            "feature": name,
            "label": FEATURE_LABELS_RU.get(name, name),
            "importance": round(v, 4),
            "pct": round(v * 100, 1),
        })
    rows.sort(key=lambda x: x["importance"], reverse=True)
    return rows


def build_explanation_payload(
    model,
    r2_train: Optional[float] = None,
    samples: Optional[int] = None,
) -> Dict[str, Any]:
    items = extract_feature_importances(model)
    top = items[0] if items else None
    summary = None
    if top:
        summary = (
            f"Сильнее всего на прогноз задержки влияет «{top['label']}» "
            f"({top['pct']}%). Чем выше столбец — тем больше вклад признака в модель."
        )
    return {
        "available": True,
        "method": "gradient_boosting_feature_importances",
        "features": features,
        "top_feature": top,
        "summary_ru": summary_ru,
        "r2_train": r2_train,
        "samples": samples,
    }