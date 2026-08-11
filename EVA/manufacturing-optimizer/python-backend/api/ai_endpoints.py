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

router = APIRouter(prefix="/ai", tags=["AI"])

# Глобальный экземпляр движка (можно заменить на dependency injection)
_engine: Optional[AIEngine] = None


def get_db_path() -> str:
    """Найти путь к manufacturing.db"""
    candidates = [
        "manufacturing.db",
        os.path.join(os.path.dirname(__file__), "..", "manufacturing.db"),
        os.path.join(os.path.dirname(__file__), "manufacturing.db"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return "manufacturing.db"

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
    db_path = get_db_path()
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Проверяем структуру таблицы operations
        cursor.execute("PRAGMA table_info(operations)")
        columns = [c[1] for c in cursor.fetchall()]
        
        if not columns:
            conn.close()
            return {"success": False, "error": "Таблица operations не найдена"}
        
        # Адаптивный INSERT — только существующие колонки
        available_cols = [c for c in ['id','op_number','name','duration','labor_hours',
                         'people_count','status','brigade_id','start_date','end_date'] 
                         if c in columns]
        
    # Удаляем старую таблицу если схема не совпадает (пересоздаём)
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
        
        cursor.execute("SELECT COUNT(*) FROM ai_training_data")
        count = cursor.fetchone()[0]
        
        if count < 20 and 'id' in columns:
            # Безопасный INSERT
            cursor.execute(f"""
                INSERT INTO ai_training_data 
                (operation_id, op_number, name, {','.join(available_cols[3:])})
                SELECT id, op_number, name, {','.join(available_cols[3:])}
                FROM operations WHERE id IS NOT NULL LIMIT 1000
            """)
            conn.commit()
            cursor.execute("SELECT COUNT(*) FROM ai_training_data")
            count = cursor.fetchone()[0]
        
        conn.close()
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