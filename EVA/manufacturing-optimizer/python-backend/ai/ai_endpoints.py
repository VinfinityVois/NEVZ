"""AI Endpoints — роутер для /ai/*."""
from __future__ import annotations
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ai.engine import AIEngine


router = APIRouter(prefix="/ai", tags=["AI"])
engine = AIEngine()


class BuildPlanRequest(BaseModel):
    tasks: List[Dict[str, Any]]
    brigades: Optional[List[Dict]] = []
    resources: Optional[List[Dict]] = []
    do_leveling: Optional[bool] = True
    horizon: Optional[str] = "month"


class BottleneckRequest(BaseModel):
    plan: Dict[str, Any]
    brigades: Optional[List[Dict]] = []


@router.get("/status")
def ai_status():
    engine = get_engine()  # или как у тебя называется получение AIEngine
    if engine is None:
        return {"status": "error", "engine": {}}
    return {
        "status": "ok",
        "engine": engine.get_status(),
    }


@router.get("/models/status")
def models_status():
    engine = get_engine()
    st = engine.get_status() if engine else {}
    models = st.get("models") or {}
    return {
        "predictor_available": bool(models.get("predictor_available", False)),
        "delay_model_loaded": bool(models.get("delay_model_loaded", False)),
        "anomaly_model_loaded": bool(models.get("anomaly_model_loaded", False)),
    }
@router.post("/build-plan")
async def build_plan(request: BuildPlanRequest):
    try:
        result = engine.build_plan(
            tasks=request.tasks,
            brigades=request.brigades or [],
            resources=request.resources or [],
            horizon=request.horizon or "month",
            do_leveling=request.do_leveling if request.do_leveling is not None else True,
        )
        return result
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("Build plan failed")
        raise HTTPException(status_code=500, detail=f"Build plan error: {str(e)}")


@router.post("/bottlenecks")
async def bottlenecks(request: BottleneckRequest):
    try:
        bns = engine.bottleneck_analyzer.analyze(
            plan=request.plan,
            resources=[],
            brigades=request.brigades or [],
        )
        return {"bottlenecks": bns}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/train/delay-model-from-db")
async def train_delay_model():
    return {"status": "success", "message": "Training not yet implemented", "samples": 0}


@router.post("/sync-training-data")
async def sync_training_data():
    return {"status": "success", "message": "Sync not yet implemented"}


@router.post("/detect-and-replan")
async def detect_and_replan(data: Dict[str, Any]):
    current_plan = data.get("current_plan", {})
    resources = data.get("resources", [])
    brigades = data.get("brigades", [])
    result = engine.detect_and_replan(current_plan, current_plan, resources, brigades)
    return result