"""
AI Endpoints — API для работы с ИИ-движком планирования НЭВЗ.
"""

from typing import List, Dict, Optional, Any
from datetime import datetime
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field
import logging
import sqlite3
import os

logger = logging.getLogger(__name__)


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
    """Путь к manufacturing.db — как у api.py / db_unified"""
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.normpath(os.path.join(here, "..", "..", "data", "manufacturing.db")),
        os.path.normpath(os.path.join(here, "..", "data", "manufacturing.db")),
        os.path.normpath(os.path.join(here, "..", "manufacturing.db")),
        "manufacturing.db",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
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
    horizon: str = Field("month", pattern="^(year|half_year|month)$")
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
    """
    engine = get_engine()

    try:
        tasks = [t.dict() for t in req.tasks]
        brigades = [b.dict() for b in req.brigades]
        resources = [r.dict() for r in req.resources]

        plan = engine.build_plan(
            tasks=tasks,
            resources=resources,
            brigades=brigades,
            horizon=req.horizon,
            start_date=req.start_date,
            constraints=req.constraints,
            do_leveling=req.do_leveling
        )

        return {
            "success": True,
            "plan": plan,
            "recommendations": engine.get_recommendations(plan)
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
    """Объяснение последнего решения ИИ"""
    engine = get_engine()
    return engine.explain_decision(decision_id)

# ====================== Синхронизация данных ======================

@router.post("/sync-training-data")
def sync_training_data():
    """
    Синхронизирует реальные завершённые операции в ai_training_data
    для последующего обучения модели прогноза задержек.

    ВАЖНО: берём только операции, у которых реально проставлена
    actual_end (см. PUT /operations/{id} — она теперь заполняется
    автоматически при переводе статуса в 'completed'). Без этого
    actual_delay_days всегда был бы 0, и модель училась бы
    предсказывать «задержки никогда не будет» — то есть ничему
    полезному на самом деле не училась бы.
    """
    db_path = get_db_path()
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        cursor.execute("PRAGMA table_info(operations)")
        columns = [c[1] for c in cursor.fetchall()]

        if not columns:
            conn.close()
            return {"success": False, "error": "Таблица operations не найдена"}

        required = {'end_date', 'actual_end', 'status'}
        missing = required - set(columns)
        if missing:
            conn.close()
            return {
                "success": False,
                "error": f"В таблице operations нет колонок: {', '.join(missing)}"
            }

        cursor.execute("DROP TABLE IF EXISTS ai_training_data")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_training_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operation_id INTEGER, op_number INTEGER, name TEXT,
                duration REAL, labor_hours REAL, people_count INTEGER,
                priority TEXT DEFAULT 'medium', status TEXT, brigade_id INTEGER,
                start_date TEXT, end_date TEXT, actual_delay_days REAL DEFAULT 0,
                is_critical INTEGER DEFAULT 0, total_float REAL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Реальный сигнал: только завершённые операции с фактической
        # датой окончания. actual_delay_days считаем прямо в SQL как
        # разницу между фактом и планом (не даём уйти в минус, чтобы не
        # путать модель "досрочным" исполнением, которое сюда не о том).
        cursor.execute(f"""
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
            LIMIT 5000
        """)
        conn.commit()

        cursor.execute("SELECT COUNT(*) FROM ai_training_data")
        count = cursor.fetchone()[0]

        conn.close()

        if count == 0:
            return {
                "success": True,
                "samples": 0,
                "message": (
                    "Синхронизировано 0 записей — пока ни одна операция не "
                    "завершена с проставленной фактической датой (actual_end). "
                    "Данные появятся по мере того, как бригады будут закрывать "
                    "реальные работы."
                )
            }

        return {"success": True, "samples": count, "message": f"Данные синхронизированы. Записей: {count}"}
    except Exception as e:
        logger.exception("sync_training_data error")
        return {"success": False, "error": str(e), "detail": "Проверьте структуру таблицы operations"}
# ====================== Обучение моделей ======================

class HistoricalTask(BaseModel):
    """Одна историческая запись для обучения"""
    id: Optional[str] = None
    duration_days: float = Field(..., gt=0)
    priority: int = 1
    required_skills: List[str] = []
    dependencies: List[str] = []
    total_float: float = 5.0
    is_critical: bool = False
    progress: float = Field(1.0, ge=0.0, le=1.0)
    actual_delay_days: float = Field(..., ge=0.0, description="Фактическая задержка в днях")


class TrainDelayModelRequest(BaseModel):
    historical: List[HistoricalTask]
    save: bool = True


@router.post("/train/delay-model")
def train_delay_model(req: TrainDelayModelRequest):
    """
    Обучить модель прогноза задержек на исторических данных.
    
    Нужно минимум ~20–30 записей.
    После обучения модель автоматически сохраняется и начинает использоваться
    в predict_task_delay.
    """
    engine = get_engine()

    if engine.predictor is None:
        raise HTTPException(
            status_code=503,
            detail="Predictor не инициализирован"
        )

    try:
        historical = [h.dict() for h in req.historical]
        result = engine.predictor.train_delay_model(
            historical=historical,
            save=req.save
        )

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("message", "Ошибка обучения"))

        return {
            "success": True,
            **result,
            "trained_at": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Ошибка обучения модели задержек")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/train/delay-model-from-db")
def train_delay_model_from_db():
    """Обучить модель на данных из manufacturing.db (ai_training_data)"""
    # Создаём таблицу если её нет (защита от "no such table")
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_training_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operation_id INTEGER,
            op_number INTEGER,
            name TEXT,
            duration REAL,
            labor_hours REAL,
            people_count INTEGER,
            priority TEXT DEFAULT 'medium',
            status TEXT,
            brigade_id INTEGER,
            start_date TEXT,
            end_date TEXT,
            actual_delay_days REAL DEFAULT 0,
            is_critical INTEGER DEFAULT 0,
            total_float REAL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()
    
    engine = get_engine()
    if engine.predictor is None:
        raise HTTPException(status_code=503, detail="Predictor не инициализирован")

    if get_historical_for_ml is None:
        # Fallback — читаем напрямую из БД
        try:
            db_path = get_db_path()
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT operation_id, duration, priority, status, 
                       actual_delay_days, is_critical, total_float
                FROM ai_training_data
                LIMIT 1000
            """)
            rows = cursor.fetchall()
            conn.close()
            
            historical = []
            for row in rows:
                historical.append({
                    "id": str(row[0]),
                    "duration_days": float(row[1] or 1),
                    "priority": 1,
                    "required_skills": [],
                    "dependencies": [],
                    "total_float": float(row[6] or 5),
                    "is_critical": bool(row[5]),
                    "progress": 1.0,
                    "actual_delay_days": float(row[4] or 0)
                })
            
            if len(historical) < 20:
                return {
                    "success": False,
                    "message": f"Недостаточно данных ({len(historical)}). "
                               f"Сначала заполните таблицу ai_training_data "
                               f"(POST /ai/sync-training-data)",
                    "samples": len(historical)
                }
            
            result = engine.predictor.train_delay_model(historical=historical, save=True)
            return {
                "success": True,
                **result,
                "trained_at": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.exception("DB training fallback error")
            raise HTTPException(status_code=503, detail=f"DB adapter не найден и fallback ошибка: {e}")

    historical = get_historical_for_ml()

    if len(historical) < 20:
        return {
            "success": False,
            "message": f"Недостаточно данных ({len(historical)}). "
                       f"Сначала заполните таблицу ai_training_data "
                       f"(POST /ai/sync-training-data или POST /seed-test-data)",
            "samples": len(historical)
        }

    result = engine.predictor.train_delay_model(historical=historical, save=True)
    return {
        "success": True,
        **result,
        "trained_at": datetime.now().isoformat()
    }

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
    import json
    links = payload.get("links") or []
    persist = bool(payload.get("persist", False))
    if not links:
        return {"status": "error", "detail": "no links"}
    if not persist:
        return {"status": "ok", "applied": 0, "dry_run": True, "links": links}

    from api import get_db  # ← путь к get_db как у тебя в проекте
    conn = get_db()
    cur = conn.cursor()
    applied = 0

    def _load_list(val):
        if val is None:
            return []
        if isinstance(val, list):
            return [str(x) for x in val]
        try:
            return [str(x) for x in json.loads(val or "[]")]
        except Exception:
            return []

    for link in links:
        frm, to = str(link["from"]), str(link["to"])

        cur.execute(
            "SELECT id, prev_ops, next_ops FROM operations WHERE CAST(op_number AS TEXT) = ?",
            (frm,),
        )
        r = cur.fetchone()
        if r:
            rid = r[0] if not hasattr(r, "keys") else r["id"]
            nxt = _load_list(r[2] if not hasattr(r, "keys") else r["next_ops"])
            if to not in nxt:
                nxt.append(to)
                cur.execute(
                    "UPDATE operations SET next_ops = ? WHERE id = ?",
                    (json.dumps(nxt), rid),
                )
                applied += 1

        cur.execute(
            "SELECT id, prev_ops, next_ops FROM operations WHERE CAST(op_number AS TEXT) = ?",
            (to,),
        )
        r2 = cur.fetchone()
        if r2:
            rid2 = r2[0] if not hasattr(r2, "keys") else r2["id"]
            prev = _load_list(r2[1] if not hasattr(r2, "keys") else r2["prev_ops"])
            if frm not in prev:
                prev.append(frm)
                cur.execute(
                    "UPDATE operations SET prev_ops = ? WHERE id = ?",
                    (json.dumps(prev), rid2),
                )
                applied += 1

    conn.commit()
    conn.close()
    return {"status": "ok", "applied": applied, "links": links}