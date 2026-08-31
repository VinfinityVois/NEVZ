"""
AI Endpoints — API для работы с ИИ-движком планирования НЭВЗ.
"""

from typing import List, Dict, Optional, Any
from datetime import datetime
from fastapi import APIRouter, HTTPException, Body, UploadFile, File
from pydantic import BaseModel, Field
import json
import logging
import os
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)

# --- Real-data ML pipeline (no synthetic rows) ---
try:
    from ai.training_data_pipeline import (
        load_operations_from_db,
        build_samples_from_rows,
        sync_samples_to_training_table,
        load_samples_from_training_table,
        analyze_operations,
        row_to_sample,
    )
except ImportError:
    try:
        from training_data_pipeline import (
            load_operations_from_db,
            build_samples_from_rows,
            sync_samples_to_training_table,
            load_samples_from_training_table,
            analyze_operations,
            row_to_sample,
        )
    except ImportError:
        load_operations_from_db = None
        build_samples_from_rows = None
        sync_samples_to_training_table = None
        load_samples_from_training_table = None
        analyze_operations = None
        row_to_sample = None
        logger.warning("training_data_pipeline not found — /ai/data/quality & train-from-db limited")


# --- Plan compare / horizons / lifecycle import ---
try:
    from ai.plan_compare import (
        normalize_horizon,
        horizon_window,
        filter_tasks_by_horizon,
        extract_plan_metrics,
        compare_plans,
        tasks_from_document_stub,
        save_snapshot,
        get_snapshot,
        list_snapshots,
        HORIZON_DAYS,
    )
except ImportError:
    try:
        from plan_compare import (
            normalize_horizon,
            horizon_window,
            filter_tasks_by_horizon,
            extract_plan_metrics,
            compare_plans,
            tasks_from_document_stub,
            save_snapshot,
            get_snapshot,
            list_snapshots,
            HORIZON_DAYS,
        )
    except ImportError:
        normalize_horizon = None
        horizon_window = None
        filter_tasks_by_horizon = None
        extract_plan_metrics = None
        compare_plans = None
        tasks_from_document_stub = None
        save_snapshot = None
        get_snapshot = None
        list_snapshots = None
        HORIZON_DAYS = {
            "day": 1, "week": 7, "month": 30, "quarter": 90,
            "half_year": 182, "year": 365,
        }
        logger.warning("plan_compare not found — /ai/plan/* limited")



try:
    from db_adapter import build_ai_plan_from_db, get_historical_for_ml
except ImportError:
    build_ai_plan_from_db = None
    get_historical_for_ml = None
    
# Импорт ИИ-движка
try:
    from ai import AIEngine
    from ai.engine import AIEngine as Engine
except ImportError:
    try:
        from python_backend.ai import AIEngine
    except ImportError:
        AIEngine = None
        logger.error("AI Engine не найден. Проверьте установку пакета ai.")

# router = APIRouter(prefix="/ai", tags=["AI"])
# 
# Глобальный экземпляр движка (можно заменить на dependency injection)
_engine: Optional[AIEngine] = None


# def get_db_path() -> str:
#     """Единый путь к manufacturing.db — тот же, что у api.py / db_unified"""
#     here = os.path.dirname(os.path.abspath(__file__))
#     # api/ → python-backend → manufacturing-optimizer/data/manufacturing.db
#     candidates = [
#         os.path.join(here, "..", "..", "data", "manufacturing.db"),  # EVA/.../data/
#         os.path.join(here, "..", "data", "manufacturing.db"),         # python-backend/data/
#         os.path.join(here, "..", "manufacturing.db"),
#         os.path.join(here, "manufacturing.db"),
#         "manufacturing.db",
#     ]
#     for c in candidates:
#         path = os.path.normpath(c)
#         if os.path.exists(path):
#             logger.info(f"DB path: {path}")
#             return path
#     # fallback — как в db_unified
#     fallback = os.path.normpath(os.path.join(here, "..", "..", "data", "manufacturing.db"))
#     logger.warning(f"DB not found, using fallback: {fallback}")
#     return fallback
def get_db_path() -> str:
    """Тот же manufacturing.db, что у api.py / UI."""
    here = os.path.dirname(os.path.abspath(__file__))
    # __file__ = .../python-backend/api/ai_endpoints.py  ИЛИ  .../python-backend/ai_endpoints.py
    candidates = [
        # EVA/manufacturing-optimizer/data/manufacturing.db
        os.path.normpath(os.path.join(here, "..", "..", "data", "manufacturing.db")),
        # если ai_endpoints лежит в python-backend/ (не в api/)
        os.path.normpath(os.path.join(here, "..", "data", "manufacturing.db")),
        os.path.normpath(os.path.join(here, "data", "manufacturing.db")),
        os.path.normpath(os.path.join(here, "..", "manufacturing.db")),
        os.path.normpath(os.path.join(here, "manufacturing.db")),
    ]
    for path in candidates:
        if os.path.isfile(path):
            logger.info("DB path: %s", path)
            return path

    # ЖЁСТКО: вставь путь из Get-ChildItem, если candidates пустые
    hardcoded = r"C:\MYDESK\code\NEVZ\EVA\manufacturing-optimizer\data\manufacturing.db"
    if os.path.isfile(hardcoded):
        return hardcoded

    logger.warning("DB not found, fallback %s", candidates[0])
    return candidates[0]

def get_engine() -> AIEngine:
    global _engine
    if _engine is None:
        if AIEngine is None:
            raise HTTPException(status_code=503, detail="AI Engine недоступен")
        _engine = AIEngine(config={
            "max_extension_days": 7.0,
            "delay_threshold_days": 2.0,
            "critical_delay_days": 5.0,
        })
    return _engine


# ====================== Pydantic-модели ======================

class TaskIn(BaseModel):
    id: str
    name: str
    duration_days: float = Field(..., gt=0)
    dependencies: List[str] = []
    priority: int = 1
    required_skills: List[str] = []
    brigade_id: Optional[str] = None


class BrigadeIn(BaseModel):
    id: str
    name: str
    skills: List[str] = []
    capacity: float = 12.0


class ResourceIn(BaseModel):
    id: str
    name: str
    type: str = "equipment"
    capacity: float = 1.0


class BuildPlanRequest(BaseModel):
    tasks: List[TaskIn]
    brigades: List[BrigadeIn]
    resources: List[ResourceIn] = []
    horizon: str = Field(
        "year",
        pattern="^(day|week|month|quarter|three_months|half_year|year)$",
        description="day|week|month|quarter(3 months)|half_year|year — year is default priority",
    )
    start_date: Optional[str] = None
    do_leveling: bool = True
    constraints: Optional[Dict[str, Any]] = None


class ActualTaskIn(BaseModel):
    id: str
    status: str  # planned | in_progress | completed | blocked | delayed
    progress: float = Field(0.0, ge=0.0, le=1.0)
    actual_start: Optional[str] = None
    actual_end: Optional[str] = None
    reported_at: Optional[str] = None
    delay_reason: Optional[str] = None
    blocked_by: Optional[str] = None


class DetectReplanRequest(BaseModel):
    current_plan: Dict[str, Any]
    actual_tasks: List[ActualTaskIn]
    brigades: List[BrigadeIn] = []
    resources: List[ResourceIn] = []
    timestamp: Optional[str] = None


# ====================== Эндпоинты ======================
router = APIRouter(prefix="/ai", tags=["AI"])
@router.get("/status")
def ai_status():
    """Текущий статус ИИ-движка"""
    engine = get_engine()
    return {
        "status": "ok",
        "engine": engine.get_status(),
        "timestamp": datetime.now().isoformat()
    }


@router.post("/build-plan")
def build_plan(req: BuildPlanRequest):
    """
    Построить план:
    - распределение бригад
    - Critical Path
    - Resource Leveling
    - анализ узких мест
    - окно горизонта day|week|month|quarter|half_year|year
    """
    engine = get_engine()

    try:
        tasks = [t.dict() for t in req.tasks]
        brigades = [b.dict() for b in req.brigades]
        resources = [r.dict() for r in req.resources]

        horizon = req.horizon
        if normalize_horizon:
            horizon = normalize_horizon(req.horizon)
        if filter_tasks_by_horizon:
            tasks = filter_tasks_by_horizon(tasks, horizon, req.start_date)

        plan = engine.build_plan(
            tasks=tasks,
            resources=resources,
            brigades=brigades,
            horizon=horizon,
            start_date=req.start_date,
            constraints=req.constraints,
            do_leveling=req.do_leveling
        )
        plan["horizon"] = horizon
        if horizon_window:
            plan["horizon_window"] = horizon_window(horizon, req.start_date)
        if extract_plan_metrics:
            plan["metrics"] = extract_plan_metrics(plan)

        return {
            "success": True,
            "plan": plan,
            "recommendations": engine.get_recommendations(plan),
            "metrics": plan.get("metrics"),
        }
    except Exception as e:
        logger.exception("Ошибка построения плана")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/detect-and-replan")
def detect_and_replan(req: DetectReplanRequest):
    """
    Обнаружить аномалии и при необходимости перестроить план
    с минимальными изменениями.
    """
    engine = get_engine()

    try:
        actual_data = {
            "timestamp": req.timestamp or datetime.now().isoformat(),
            "tasks": [t.dict() for t in req.actual_tasks]
        }

        result = engine.detect_and_replan(
            current_plan=req.current_plan,
            actual_data=actual_data,
            resources=[r.dict() for r in req.resources],
            brigades=[b.dict() for b in req.brigades]
        )

        return {
            "success": True,
            **result
        }
    except Exception as e:
        logger.exception("Ошибка detect-and-replan")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/recommendations")
def get_recommendations(plan: Dict[str, Any] = Body(...)):
    """Получить рекомендации по существующему плану"""
    engine = get_engine()
    try:
        recs = engine.get_recommendations(plan)
        return {"success": True, "recommendations": recs}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/bottlenecks")
def analyze_bottlenecks(
    plan: Dict[str, Any] = Body(...),
    brigades: List[BrigadeIn] = Body([]),
    resources: List[ResourceIn] = Body([])
):
    """Только анализ узких мест (без перестроения)"""
    engine = get_engine()
    try:
        bottlenecks = engine.bottleneck_analyzer.analyze(
            plan=plan,
            brigades=[b.dict() for b in brigades],
            resources=[r.dict() for r in resources]
        )
        return {"success": True, "bottlenecks": bottlenecks}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/explain")
def explain_last_decision(decision_id: Optional[str] = None):
    try:
        engine = get_engine()
        fi = engine.predictor.get_delay_explanation()
        return {
            "status": "ok",
            "decision_id": decision_id,
            "feature_importance": fi,
            "note": "Глобальная важность признаков delay_model (не локальный SHAP по одной задаче)",
        }
    except Exception as e:
        logger.exception("explain")
        return {"status": "error", "decision_id": decision_id, "detail": str(e), "features": []}

@router.get("/explain/feature-importance")
def explain_feature_importance():
    try:
        engine = get_engine()   # ← как в /ai/status, /train и т.д.
        if engine is None or getattr(engine, "predictor", None) is None:
            return {
                "status": "error",
                "available": False,
                "message": "Predictor не инициализирован",
                "features": [],
            }
        payload = engine.predictor.get_delay_explanation()
        return {"status": "ok", **payload}
    except Exception as e:
        logger.exception("explain feature-importance")
        return {
            "status": "error",
            "available": False,
            "detail": str(e),
            "message": str(e),
            "features": [],
        }
# ====================== Синхронизация данных ======================


# ====================== Данные и обучение (только факты из operations) ======================

@router.get("/data/quality")
def data_quality():
    """
    Анализ operations: сколько строк реально пригодно для ML.
    Ничего не выдумывает — только счётчики по БД.
    """
    path = get_db_path()
    if load_operations_from_db is None or analyze_operations is None:
        return {
            "status": "error",
            "message": "training_data_pipeline не установлен",
            "db_path": path,
            "trainable_samples": 0,
            "ready_to_train": False,
        }
    try:
        rows = load_operations_from_db(path)
        report = analyze_operations(rows)
        return {"status": "ok", "db_path": path, **report}
    except Exception as e:
        logger.exception("data_quality")
        return {"status": "error", "message": str(e), "trainable_samples": 0, "ready_to_train": False}


@router.post("/sync-training-data")
def sync_training_data():
    """
    Синхронизирует ai_training_data ТОЛЬКО из completed + actual_end.
    Без seed и без случайных задержек.
    """
    path = get_db_path()
    if load_operations_from_db is None or build_samples_from_rows is None:
        return {"success": False, "error": "training_data_pipeline не установлен", "samples": 0}
    try:
        rows = load_operations_from_db(path)
        samples, analysis = build_samples_from_rows(rows)
        n = sync_samples_to_training_table(path, samples)
        return {
            "success": True,
            "samples": n,
            "analysis": analysis,
            "message": analysis.get("message") or f"Синхронизировано {n} образцов",
        }
    except Exception as e:
        logger.exception("sync_training_data")
        return {"success": False, "error": str(e), "samples": 0}


@router.post("/train/delay-model")
def train_delay_model(req: dict = Body(default=None)):
    """
    Обучение на переданном historical[] (клиент/тесты).
    Для цеха предпочтителен /train/delay-model-from-db.
    """
    req = req or {}
    historical = req.get("historical") or []
    if not historical:
        raise HTTPException(status_code=400, detail="historical пуст — передайте факты или используйте from-db")
    if len(historical) < 20:
        return {
            "success": False,
            "message": f"Мало данных ({len(historical)}). Нужно ≥ 20.",
        }
    engine = get_engine()
    result = engine.predictor.train_delay_model(historical=historical, save=True)
    return {
        "success": bool(result.get("success", True)),
        **result,
        "trained_at": datetime.now().isoformat(),
    }


@router.post("/train/delay-model-from-db")
def train_delay_model_from_db():
    """
    1) Пересобрать samples из operations (факты)
    2) Обучить GBR + IsolationForest
    3) При N < 20 — честный отказ с analysis
    """
    path = get_db_path()
    if load_operations_from_db is None:
        return {
            "success": False,
            "status": "error",
            "detail": "training_data_pipeline не установлен",
        }
    try:
        rows = load_operations_from_db(path)
        samples, analysis = build_samples_from_rows(rows)
        sync_samples_to_training_table(path, samples)

        if len(samples) < 20:
            return {
                "success": False,
                "status": "error",
                "detail": analysis.get("message")
                or f"Мало данных ({len(samples)}). Нужно ≥ 20 completed с actual_end.",
                "analysis": analysis,
            }

        engine = get_engine()
        result = engine.predictor.train_delay_model(historical=samples, save=True)
        return {
            "success": bool(result.get("success", True)),
            **result,
            "analysis": analysis,
            "samples": len(samples),
            "trained_at": datetime.now().isoformat(),
        }
    except Exception as e:
        logger.exception("train_delay_model_from_db")
        return {"success": False, "status": "error", "detail": str(e)}


@router.post("/training/feedback")
def training_feedback(payload: dict = Body(...)):
    """
    Online feedback: одна завершённая операция → дописать в ai_training_data.
    Вызывается из PUT /operations при status=completed.
    """
    if row_to_sample is None or sync_samples_to_training_table is None:
        return {"success": False, "detail": "pipeline missing"}
    try:
        path = get_db_path()
        sample = row_to_sample(payload)
        if sample is None:
            return {
                "success": False,
                "detail": "строка не подходит (нужны completed + actual_end + план длительности)",
                "accepted": False,
            }
        # дописать к существующим
        existing = load_samples_from_training_table(path) if load_samples_from_training_table else []
        # заменить по op_number если уже есть
        opn = str(sample.get("op_number") or "")
        merged = [s for s in existing if str(s.get("op_number") or "") != opn]
        merged.append(sample)
        n = sync_samples_to_training_table(path, merged)
        return {"success": True, "accepted": True, "samples_total": n, "op_number": opn}
    except Exception as e:
        logger.exception("training_feedback")
        return {"success": False, "detail": str(e)}



@router.get("/models/status")
def models_status():
    """Статус загруженных ML-моделей"""
    engine = get_engine()
    predictor = getattr(engine, "predictor", None)

    if predictor is None:
        return {
            "predictor_available": False,
            "delay_model_loaded": False,
            "anomaly_model_loaded": False
        }

    return {
        "predictor_available": True,
        "delay_model_loaded": predictor.delay_model is not None,
        "anomaly_model_loaded": predictor.anomaly_model is not None,
        "model_dir": str(getattr(predictor, "model_dir", "")),
        "has_sklearn": getattr(predictor, "delay_model", None) is not None or True
    }


@router.post("/predict/task-delay")
def predict_task_delay(
    task: TaskIn,
    is_critical: bool = False
):
    """Прогноз задержки одной задачи (ML или эвристика)"""
    engine = get_engine()
    if engine.predictor is None:
        raise HTTPException(status_code=503, detail="Predictor недоступен")

    try:
        result = engine.predictor.predict_task_delay(
            task=task.dict(),
            is_critical=is_critical
        )
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/predict/project-risk")
def predict_project_risk(plan: Dict[str, Any] = Body(...)):
    """Оценка риска срыва срока всего проекта"""
    engine = get_engine()
    if engine.predictor is None:
        raise HTTPException(status_code=503, detail="Predictor недоступен")

    try:
        result = engine.predictor.predict_project_risk(plan)
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/anomalies/detect")
def detect_anomalies():
    """
    Поиск операций с аномальным поведением среди активных (in_progress)
    работ через IsolationForest.

    Признаки считаются прямо из operations: насколько работа уже вышла
    за плановый срок (schedule_ratio), насколько трудозатраты отличаются
    от ожидаемых по плану (labor_intensity) и насколько нетипичен размер
    бригады относительно длительности (people_density). Раньше у этого
    метода не было REST-входа вообще — обученная модель была недостижима
    из интерфейса.
    """
    engine = get_engine()
    if engine.predictor is None:
        raise HTTPException(status_code=503, detail="Predictor недоступен")

    db_path = get_db_path()
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, op_number, name, duration, labor_hours, people_count,
                   start_date, actual_start
            FROM operations
            WHERE status = 'in_progress'
        """)
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
    except Exception as e:
        logger.exception("detect_anomalies: ошибка чтения operations")
        raise HTTPException(status_code=500, detail=str(e))

    if not rows:
        return {"success": True, "anomalies": [], "checked": 0, "message": "Нет активных операций для проверки"}

    today = datetime.now().date()
    tasks_actual = []
    op_lookup = {}
    for r in rows:
        effective_start = r.get("actual_start") or r.get("start_date")
        elapsed_days = 0.0
        if effective_start:
            try:
                start_dt = datetime.strptime(effective_start, "%Y-%m-%d").date()
                elapsed_days = max((today - start_dt).days, 0)
            except ValueError:
                elapsed_days = 0.0

        task_id = str(r["id"])
        tasks_actual.append({
            "id": task_id,
            "duration_days": r.get("duration") or 1,
            "labor_hours": r.get("labor_hours") or 0,
            "people_count": r.get("people_count") or 1,
            "elapsed_days": elapsed_days
        })
        op_lookup[task_id] = {"op_number": r.get("op_number"), "name": r.get("name")}

    anomalies = engine.predictor.detect_anomalies_ml(tasks_actual)

    for a in anomalies:
        info = op_lookup.get(a["task_id"], {})
        a["op_number"] = info.get("op_number")
        a["name"] = info.get("name")

    return {
        "success": True,
        "anomalies": anomalies,
        "checked": len(tasks_actual),
        "message": (
            f"Проверено операций: {len(tasks_actual)}"
            if len(tasks_actual) >= 10
            else f"Проверено операций: {len(tasks_actual)} (меньше 10 — результат ненадёжен)"
        )
    }



# ====================== Симуляция сценариев сбоев ======================

try:
    from ai.scenario_simulator import ScenarioSimulator, get_predefined_scenarios
    HAS_SIMULATOR = True
except ImportError:
    try:
        from scenario_simulator import ScenarioSimulator, get_predefined_scenarios
        HAS_SIMULATOR = True
    except ImportError:
        HAS_SIMULATOR = False
        ScenarioSimulator = None
        get_predefined_scenarios = None


class ScenarioTaskDelay(BaseModel):
    task_id: str
    extra_days: float = Field(..., gt=0)


class ScenarioRequest(BaseModel):
    name: str = "Сценарий сбоя"
    description: Optional[str] = None
    task_delays: Dict[str, float] = Field(
        default_factory=dict,
        description="task_id → дополнительные дни задержки"
    )
    disabled_brigades: List[str] = Field(
        default_factory=list,
        description="Список id бригад, которые недоступны"
    )
    duration_multipliers: Dict[str, float] = Field(
        default_factory=dict,
        description="task_id → множитель длительности (например 1.4)"
    )


class RunScenarioRequest(BaseModel):
    base_plan: Dict[str, Any]
    scenario: ScenarioRequest
    brigades: List[BrigadeIn] = []
    resources: List[ResourceIn] = []


class RunMultipleScenariosRequest(BaseModel):
    base_plan: Dict[str, Any]
    scenarios: List[ScenarioRequest]
    brigades: List[BrigadeIn] = []
    resources: List[ResourceIn] = []


@router.get("/scenarios/templates")
def get_scenario_templates():
    """Готовые шаблоны сценариев сбоев для НЭВЗ"""
    if not HAS_SIMULATOR:
        raise HTTPException(status_code=503, detail="Модуль симуляции недоступен")
    
    return {
        "success": True,
        "templates": get_predefined_scenarios()
    }


@router.post("/scenarios/run")
def run_scenario(req: RunScenarioRequest):
    """
    Запустить один сценарий сбоя («что если»).
    
    Возвращает:
    - насколько сдвинется срок
    - новый критический путь
    - уровень влияния
    - рекомендации
    """
    if not HAS_SIMULATOR:
        raise HTTPException(status_code=503, detail="Модуль симуляции недоступен")

    try:
        simulator = ScenarioSimulator()
        
        scenario_dict = {
            "name": req.scenario.name,
            "description": req.scenario.description,
            "task_delays": req.scenario.task_delays,
            "disabled_brigades": req.scenario.disabled_brigades,
            "duration_multipliers": req.scenario.duration_multipliers,
        }

        result = simulator.run_scenario(
            base_plan=req.base_plan,
            scenario=scenario_dict,
            brigades=[b.dict() for b in req.brigades],
            resources=[r.dict() for r in req.resources]
        )

        return {
            "success": True,
            **result
        }
    except Exception as e:
        logger.exception("Ошибка симуляции сценария")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/scenarios/run-from-db")
def run_scenario_from_db(scenario: ScenarioRequest):
    """
    Запуск сценария на текущем плане из БД.
    Не требует передачи base_plan — подтягивается автоматически.
    """
    if not HAS_SIMULATOR:
        raise HTTPException(status_code=503, detail="Модуль симуляции недоступен")

    try:
        base_plan = build_ai_plan_from_db()
        simulator = ScenarioSimulator()

        scenario_dict = {
            "name": scenario.name,
            "description": scenario.description,
            "task_delays": scenario.task_delays,
            "disabled_brigades": scenario.disabled_brigades,
            "duration_multipliers": scenario.duration_multipliers,
        }

        result = simulator.run_scenario(
            base_plan=base_plan,
            scenario=scenario_dict,
            brigades=base_plan.get("brigades", []),
            resources=[]
        )

        return {
            "success": True,
            "source": "database",
            **result
        }
    except Exception as e:
        logger.exception("Ошибка симуляции из БД")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/scenarios/run-multiple")
def run_multiple_scenarios(req: RunMultipleScenariosRequest):
    """
    Прогнать несколько сценариев сразу и сравнить последствия.
    Сценарии сортируются от самого тяжёлого к самому лёгкому.
    """
    if not HAS_SIMULATOR:
        raise HTTPException(status_code=503, detail="Модуль симуляции недоступен")

    try:
        simulator = ScenarioSimulator()

        scenarios = []
        for sc in req.scenarios:
            scenarios.append({
                "name": sc.name,
                "description": sc.description,
                "task_delays": sc.task_delays,
                "disabled_brigades": sc.disabled_brigades,
                "duration_multipliers": sc.duration_multipliers,
            })

        result = simulator.run_multiple_scenarios(
            base_plan=req.base_plan,
            scenarios=scenarios,
            brigades=[b.dict() for b in req.brigades],
            resources=[r.dict() for r in req.resources]
        )

        return {
            "success": True,
            **result
        }
    except Exception as e:
        logger.exception("Ошибка пакетной симуляции")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/gaps/detect")
async def detect_gaps(payload: dict = None):
    payload = payload or {}
    from ai.gap_detector import GapDetector
    from ai.gap_bridger import GapBridger

    ops = payload.get("operations") or payload.get("tasks") or []
    if not ops:
        # подставь свой доступ к БД, если есть
        try:
            from api import get_db, row_to_dict  # или как у тебя
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT * FROM operations")
            ops = [row_to_dict(r) for r in cur.fetchall()]
            conn.close()
        except Exception:
            ops = []

    det = GapDetector().detect(ops)
    br = GapBridger().propose(ops, det.get("gaps", []))
    return {"status": "ok", "gaps": det, "bridge": br}

@router.post("/gaps/apply")
async def apply_gap_links(payload: dict):
    links = payload.get("links") or []
    persist = bool(payload.get("persist", False))
    if not links:
        return {"status": "error", "detail": "no links"}
    if not persist:
        return {"status": "ok", "applied": 0, "dry_run": True, "links": links}

    path = get_db_path()  # ТОЛЬКО модульная функция, без local def
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    applied = 0
    already = 0
    missed = []

    def _load_list(val):
        if val is None:
            return []
        if isinstance(val, list):
            out = val
        else:
            try:
                out = json.loads(val or "[]")
            except Exception:
                out = []
        res = []
        for x in out:
            try:
                res.append(int(float(str(x).strip())))
            except Exception:
                continue
        return res

    def _find_op(num: int):
        cur.execute(
            "SELECT id, prev_ops, next_ops, op_number FROM operations WHERE op_number = ?",
            (num,),
        )
        r = cur.fetchone()
        if r:
            return r
        cur.execute(
            "SELECT id, prev_ops, next_ops, op_number FROM operations "
            "WHERE CAST(op_number AS TEXT) = ?",
            (str(num),),
        )
        return cur.fetchone()

    def _reaches(graph: Dict[int, set], start: int, target: int) -> bool:
        """BFS: можно ли дойти от start до target по next_ops."""
        if start == target:
            return True
        seen = {start}
        queue = [start]
        while queue:
            cur_node = queue.pop()
            for nxt_node in graph.get(cur_node, ()):
                if nxt_node == target:
                    return True
                if nxt_node not in seen:
                    seen.add(nxt_node)
                    queue.append(nxt_node)
        return False

    try:
        cur.execute("SELECT COUNT(*) AS c FROM operations")
        ops_count = cur.fetchone()["c"]

        # Полный граф next_ops по всей таблице — нужен, чтобы проверять
        # КАЖДУЮ предлагаемую связь на цикл ДО записи в БД. Раньше эта
        # проверка отсутствовала: связь писалась вслепую, и если
        # эвристика gap_bridger ошибалась направлением, в operations
        # навсегда оседал цикл — после чего GraphBuilder корректно
        # ловит его и кидает ValueError, но уже на КАЖДОМ следующем
        # построении плана, включая после перезапуска приложения
        # (цикл живёт в БД, а не в памяти процесса).
        cur.execute("SELECT op_number, next_ops FROM operations")
        graph: Dict[int, set] = {}
        for row in cur.fetchall():
            try:
                node = int(float(str(row["op_number"])))
            except Exception:
                continue
            graph[node] = set(_load_list(row["next_ops"]))

        for link in links:
            try:
                frm = int(float(str(link.get("from")).strip()))
                to = int(float(str(link.get("to")).strip()))
            except Exception:
                missed.append({"link": link, "reason": "bad from/to"})
                continue

            r = _find_op(frm)
            r2 = _find_op(to)
            if not r:
                missed.append({"op": frm, "reason": "from not found"})
            if not r2:
                missed.append({"op": to, "reason": "to not found"})
            if not r or not r2:
                continue

            # Если из to уже можно дойти до frm — добавление frm→to
            # замкнёт цикл. Такую связь не пишем в БД вообще.
            if _reaches(graph, to, frm):
                missed.append({
                    "link": {"from": frm, "to": to},
                    "reason": "would create cycle — связь не применена, "
                              "иначе граф работ станет циклическим и "
                              "AI-оптимизация перестанет строить план"
                })
                continue

            # from → next_ops += to
            nxt = _load_list(r["next_ops"])
            if to in nxt:
                already += 1
            else:
                nxt.append(to)
                cur.execute(
                    "UPDATE operations SET next_ops = ? WHERE id = ?",
                    (json.dumps(nxt), r["id"]),
                )
                applied += 1
                graph.setdefault(frm, set()).add(to)

            # to → prev_ops += from
            prev = _load_list(r2["prev_ops"])
            if frm in prev:
                already += 1
            else:
                prev.append(frm)
                cur.execute(
                    "UPDATE operations SET prev_ops = ? WHERE id = ?",
                    (json.dumps(prev), r2["id"]),
                )
                applied += 1

        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.exception("gaps/apply")
        return {"status": "error", "detail": str(e), "applied": 0, "db": path}
    finally:
        conn.close()

    # успех, если что-то записали ИЛИ связь уже была
    ok_count = applied + already
    return {
        "status": "ok",
        "applied": applied,
        "already": already,
        "ok": (applied + already) > 0,
        "links": links,
        "missed": missed,
        "db": path,
        "ops_count": ops_count,
    }


# ====================== Горизонты, снимки, сравнение планов, импорт ЖЦ ======================

@router.get("/horizons")
def list_horizons():
    """Доступные горизонты планирования (year — приоритетный)."""
    items = []
    for k, v in (HORIZON_DAYS or {}).items():
        if k == "three_months":
            continue
        items.append({"id": k, "days": v, "priority": k == "year"})
    return {"status": "ok", "horizons": items, "default": "year"}


@router.get("/plan/metrics/explain-float")
def explain_float():
    """Справка: как считаются резервы (Total Float / Free Float) в CPM."""
    return {
        "status": "ok",
        "formulas": {
            "EF": "EF = ES + duration",
            "ES": "ES = max(EF predecessors) or 0",
            "LF": "LF = min(LS successors) or T (project duration)",
            "LS": "LS = LF - duration",
            "total_float": "TF = LS - ES = LF - EF",
            "free_float": "FF = min(ES_succ) - EF (if no successors: FF = TF)",
            "critical": "is_critical ⇔ abs(TF) < 1e-6",
        },
        "fields": {
            "time_reserve": "Поле operations (норматив / ручной ввод)",
            "total_float": "Результат CPM после build_plan / calculate_cpm",
        },
        "code": "python-backend/cpm/critical_path.py",
    }


class SnapshotRequest(BaseModel):
    name: str = "before"
    plan: Dict[str, Any]
    meta: Optional[Dict[str, Any]] = None


@router.post("/plan/snapshot")
def plan_snapshot(req: SnapshotRequest):
    """Сохранить снимок плана (до или после оптимизации) для сравнения в %."""
    if save_snapshot is None:
        raise HTTPException(status_code=503, detail="plan_compare не установлен")
    return save_snapshot(req.name, req.plan, req.meta)


@router.get("/plan/snapshots")
def plan_snapshots_list():
    if list_snapshots is None:
        return {"status": "ok", "snapshots": []}
    return {"status": "ok", "snapshots": list_snapshots()}


class CompareBody(BaseModel):
    before: Optional[Dict[str, Any]] = None
    after: Optional[Dict[str, Any]] = None
    before_name: Optional[str] = "before"
    after_name: Optional[str] = "after"


@router.post("/plan/compare")
def plan_compare_endpoint(req: CompareBody):
    """
    Сравнение двух планов: абсолюты + pct_change.
    Можно передать JSON before/after или имена снимков.
    """
    if compare_plans is None:
        raise HTTPException(status_code=503, detail="plan_compare не установлен")
    before = req.before
    after = req.after
    if before is None:
        snap = get_snapshot(req.before_name or "before") if get_snapshot else None
        if not snap:
            raise HTTPException(status_code=404, detail="Нет снимка before")
        before = snap.get("plan") or snap.get("metrics")
    if after is None:
        snap = get_snapshot(req.after_name or "after") if get_snapshot else None
        if not snap:
            raise HTTPException(status_code=404, detail="Нет снимка after")
        after = snap.get("plan") or snap.get("metrics")
    return compare_plans(before, after)


@router.post("/plan/import-lifecycle")
async def import_lifecycle_plan(file: UploadFile = File(...)):
    """
    Импорт плана ЖЦ из файла.
    Excel/CSV — полноценно; PDF/Word — сообщение о разработке.
    """
    if tasks_from_document_stub is None:
        raise HTTPException(status_code=503, detail="plan_compare не установлен")
    content = await file.read()
    result = tasks_from_document_stub(file.filename or "upload.xlsx", content)
    if not result.get("success"):
        return result
    try:
        from cpm.critical_path import CriticalPathCalculator
        calc = CriticalPathCalculator()
        cpm_tasks = []
        for t in result.get("tasks") or []:
            cpm_tasks.append({
                "id": str(t["id"]),
                "name": t.get("name"),
                "duration": float(t.get("duration_days") or t.get("duration") or 1),
                "dependencies": t.get("dependencies")
                    or [str(x) for x in (t.get("prev_ops") or [])],
                "brigade_id": t.get("brigade_id"),
            })
        cpm = calc.calculate(cpm_tasks)
        if extract_plan_metrics:
            result["metrics"] = extract_plan_metrics({
                **cpm,
                "tasks": cpm.get("tasks") or [],
                "gaps": {"count": 0},
            })
        else:
            result["cpm"] = {
                "project_duration_days": cpm.get("project_duration_days"),
                "critical_path_ids": cpm.get("critical_path_ids"),
            }
    except Exception as e:
        result["cpm_error"] = str(e)
    return result

