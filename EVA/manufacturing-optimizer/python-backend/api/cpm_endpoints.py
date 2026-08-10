"""
CPM Endpoints — API для Critical Path Method и Resource Leveling.
"""

from typing import List, Dict, Optional, Any
from datetime import datetime
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field
import logging

logger = logging.getLogger(__name__)

# Импорты CPM
try:
    from cpm import (
        GraphBuilder,
        CriticalPathCalculator,
        calculate_critical_path,
        ResourceLeveler,
    )
    HAS_CPM = True
except ImportError:
    try:
        from cpm.critical_path import CriticalPathCalculator, calculate_critical_path
        from cpm.graph_builder import GraphBuilder
        from cpm.resource_leveling import ResourceLeveler
        HAS_CPM = True
    except ImportError:
        HAS_CPM = False
        logger.error("Модуль cpm не найден")

router = APIRouter(prefix="/cpm", tags=["CPM"])

try:
    from cpm.visualizer import GraphVisualizer, build_graph_view
    HAS_VISUALIZER = True
except ImportError:
    HAS_VISUALIZER = False
# ====================== Pydantic-модели ======================

class TaskCPM(BaseModel):
    id: str
    name: Optional[str] = None
    duration_days: float = Field(..., gt=0, description="Длительность в днях")
    dependencies: List[str] = Field(default_factory=list)
    brigade_id: Optional[str] = None
    priority: int = 1


class BrigadeCPM(BaseModel):
    id: str
    name: Optional[str] = None
    capacity: float = 12.0
    skills: List[str] = Field(default_factory=list)


class CalculateCPMRequest(BaseModel):
    tasks: List[TaskCPM]
    start_date: Optional[str] = None   # пока не используется напрямую, но оставляем для совместимости


class LevelResourcesRequest(BaseModel):
    cpm_result: Dict[str, Any]         # результат /cpm/calculate
    brigades: List[BrigadeCPM]
    max_extension_days: float = 5.0


# ====================== Эндпоинты ======================

@router.get("/status")
def cpm_status():
    """Проверка доступности CPM-модуля"""
    return {
        "available": HAS_CPM,
        "modules": ["graph_builder", "critical_path", "resource_leveling"] if HAS_CPM else [],
        "timestamp": datetime.now().isoformat()
    }


@router.post("/calculate")
def calculate_cpm(req: CalculateCPMRequest):
    """
    Полный расчёт Critical Path Method:
    - ES / EF / LS / LF
    - Total Float / Free Float
    - Критический путь
    - Длительность проекта
    """
    if not HAS_CPM:
        raise HTTPException(status_code=503, detail="Модуль CPM недоступен")

    try:
        tasks = [t.dict() for t in req.tasks]

        # Нормализуем поле duration
        for t in tasks:
            if "duration" not in t:
                t["duration"] = t.get("duration_days", 1)

        result = calculate_critical_path(tasks)

        return {
            "success": True,
            "project_duration_days": result["project_duration_days"],
            "critical_path": result["critical_path"],
            "critical_path_ids": result["critical_path_ids"],
            "tasks": result["tasks"],
            "stats": {
                "total_tasks": result["total_tasks"],
                "critical_tasks_count": result["critical_tasks_count"]
            },
            "calculated_at": datetime.now().isoformat()
        }
    except ValueError as e:
        # Обычно циклы в зависимостях
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Ошибка расчёта CPM")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/level-resources")
def level_resources(req: LevelResourcesRequest):
    """
    Resource Leveling — выравнивание загрузки бригад
    на основе уже посчитанного CPM-результата.
    """
    if not HAS_CPM:
        raise HTTPException(status_code=503, detail="Модуль CPM недоступен")

    try:
        leveler = ResourceLeveler(max_extension_days=req.max_extension_days)
        brigades = [b.dict() for b in req.brigades]

        leveled = leveler.level(
            cpm_result=req.cpm_result,
            brigades=brigades
        )

        return {
            "success": True,
            "leveled": leveled.get("leveled", False),
            "tasks": leveled.get("tasks", []),
            "moved_tasks": leveled.get("moved_tasks", []),
            "original_duration": leveled.get("original_duration"),
            "new_duration": leveled.get("new_duration"),
            "extension_days": leveled.get("extension_days", 0),
            "message": leveled.get("message"),
            "load_profile": leveled.get("load_profile"),
            "calculated_at": datetime.now().isoformat()
        }
    except Exception as e:
        logger.exception("Ошибка Resource Leveling")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/full-analysis")
def full_cpm_analysis(
    tasks: List[TaskCPM] = Body(...),
    brigades: List[BrigadeCPM] = Body([]),
    do_leveling: bool = Body(True),
    max_extension_days: float = Body(5.0)
):
    """
    Полный анализ за один запрос:
    1. Считаем CPM
    2. (Опционально) делаем Resource Leveling
    """
    if not HAS_CPM:
        raise HTTPException(status_code=503, detail="Модуль CPM недоступен")

    try:
        task_list = [t.dict() for t in tasks]
        for t in task_list:
            if "duration" not in t:
                t["duration"] = t.get("duration_days", 1)

        # 1. CPM
        cpm_result = calculate_critical_path(task_list)

        response = {
            "success": True,
            "cpm": {
                "project_duration_days": cpm_result["project_duration_days"],
                "critical_path": cpm_result["critical_path"],
                "critical_path_ids": cpm_result["critical_path_ids"],
                "tasks": cpm_result["tasks"],
                "stats": {
                    "total_tasks": cpm_result["total_tasks"],
                    "critical_tasks_count": cpm_result["critical_tasks_count"]
                }
            },
            "leveling": None,
            "calculated_at": datetime.now().isoformat()
        }

        # 2. Leveling (если нужно и есть бригады)
        if do_leveling and brigades:
            leveler = ResourceLeveler(max_extension_days=max_extension_days)
            leveled = leveler.level(
                cpm_result=cpm_result,
                brigades=[b.dict() for b in brigades]
            )
            response["leveling"] = {
                "leveled": leveled.get("leveled", False),
                "moved_tasks": leveled.get("moved_tasks", []),
                "original_duration": leveled.get("original_duration"),
                "new_duration": leveled.get("new_duration"),
                "extension_days": leveled.get("extension_days", 0),
                "message": leveled.get("message"),
                "tasks": leveled.get("tasks", [])
            }

        return response

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Ошибка полного CPM-анализа")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validate-graph")
def validate_graph(tasks: List[TaskCPM] = Body(...)):
    """
    Проверка графа зависимостей на циклы и корректность
    (без полного расчёта CPM).
    """
    if not HAS_CPM:
        raise HTTPException(status_code=503, detail="Модуль CPM недоступен")

    try:
        builder = GraphBuilder()
        task_list = [t.dict() for t in tasks]
        graph = builder.build(task_list)

        return {
            "success": True,
            "valid": True,
            "nodes": graph.number_of_nodes(),
            "edges": graph.number_of_edges(),
            "topological_order": builder.get_topological_order(),
            "message": "Граф корректный, циклов нет"
        }
    except ValueError as e:
        return {
            "success": False,
            "valid": False,
            "message": str(e)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ====================== Визуализация графа ======================

class VisualizeRequest(BaseModel):
    cpm_result: Dict[str, Any]
    with_image: bool = False          # генерировать PNG в base64


@router.post("/visualize")
def visualize_graph(req: VisualizeRequest):
    """
    Возвращает граф зависимостей в формате для фронтенда
    (+ опционально PNG-картинку).
    """
    if not HAS_VISUALIZER:
        raise HTTPException(status_code=503, detail="Модуль визуализации недоступен")

    try:
        result = build_graph_view(
            cpm_result=req.cpm_result,
            with_image=req.with_image
        )
        return {
            "success": True,
            **result
        }
    except Exception as e:
        logger.exception("Ошибка визуализации графа")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/visualize-from-tasks")
def visualize_from_tasks(
    tasks: List[TaskCPM] = Body(...),
    with_image: bool = Body(False)
):
    """
    Сначала считает CPM, потом сразу отдаёт данные для визуализации.
    Удобный эндпоинт «одной кнопкой».
    """
    if not HAS_CPM or not HAS_VISUALIZER:
        raise HTTPException(status_code=503, detail="CPM или Visualizer недоступны")

    try:
        task_list = [t.dict() for t in tasks]
        for t in task_list:
            if "duration" not in t:
                t["duration"] = t.get("duration_days", 1)

        cpm_result = calculate_critical_path(task_list)
        graph_data = build_graph_view(cpm_result, with_image=with_image)

        return {
            "success": True,
            "cpm": {
                "project_duration_days": cpm_result["project_duration_days"],
                "critical_path_ids": cpm_result["critical_path_ids"],
            },
            "graph": graph_data
        }
    except Exception as e:
        logger.exception("Ошибка visualize-from-tasks")
        raise HTTPException(status_code=400, detail=str(e))