"""AI Endpoints — роутер для /ai/*."""
import json
import logging
import os
import sqlite3

logger = logging.getLogger(__name__)

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
    try:
        st = engine.get_status()
    except Exception:
        st = {}
    return {"status": "ok", "engine": st}


@router.get("/models/status")
def models_status():
    try:
        st = engine.get_status()
    except Exception:
        st = {}
    models = st.get("models") or {}
    return {
        "predictor_available": bool(models.get("predictor_available", False)),
        "delay_model_loaded": bool(models.get("delay_model_loaded", False)),
        "anomaly_model_loaded": bool(models.get("anomaly_model_loaded", False)),
    }
@router.post("/build-plan")
async def build_plan(request: BuildPlanRequest):
    try:
        plan = engine.build_plan(
            tasks=request.tasks,
            brigades=request.brigades or [],
            resources=request.resources or [],
            horizon=request.horizon or "month",
            do_leveling=request.do_leveling if request.do_leveling is not None else True,
        )
        recs = []
        try:
            recs = engine.get_recommendations(plan)
        except Exception:
            pass
        return {
            "success": True,
            "plan": plan,
            "recommendations": recs,
        }
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

@router.post("/gaps/detect")
async def detect_gaps(payload: Optional[Dict[str, Any]] = None):
    payload = payload or {}
    tasks = payload.get("tasks") or []
    if not tasks:
        # можно позже подтянуть из БД; пока пустой список
        return {"status": "ok", "gaps": {"gaps": [], "total": 0}, "bridge": {"proposals": [], "count": 0}}
    ops = []
    for t in tasks:
        prev = t.get("prev_ops")
        if prev is None:
            prev = t.get("dependencies") or []
        ops.append({
            "op_number": str(t.get("op_number") or t.get("id") or "").lstrip("T"),
            "name": t.get("name"),
            "prev_ops": [str(x).lstrip("T") for x in (prev or [])],
            "next_ops": [str(x).lstrip("T") for x in (t.get("next_ops") or [])],
            "drawing": t.get("drawing"),
            "post": t.get("post"),
        })
    det = engine.gap_detector.detect(ops)
    br = engine.gap_bridger.propose(ops, det.get("gaps") or [])
    return {"status": "ok", "gaps": det, "bridge": br}


@router.post("/gaps/apply")

def get_db_path() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.normpath(os.path.join(here, "..", "..", "data", "manufacturing.db")),
        os.path.normpath(os.path.join(here, "..", "data", "manufacturing.db")),
        os.path.normpath(os.path.join(here, "..", "manufacturing.db")),
        os.path.normpath(os.path.join(here, "manufacturing.db")),
        "manufacturing.db",
    ]
    for p in candidates:
        if os.path.isfile(p):
            return p
    return candidates[0]

async def apply_gap_links(payload: dict):
    import json

    links = payload.get("links") or []
    persist = bool(payload.get("persist", False))
    if not links:
        return {"status": "error", "detail": "no links"}
    if not persist:
        return {"status": "ok", "applied": 0, "dry_run": True, "links": links}

    # НЕ from api import get_db
    path = get_db_path()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    applied = 0
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
        # всегда числа op_number — как в графе/Гантте
        res = []
        for x in out:
            try:
                res.append(int(float(x)))
            except Exception:
                continue
        return res

    try:
        for link in links:
            try:
                frm = int(float(str(link.get("from")).strip()))
                to = int(float(str(link.get("to")).strip()))
            except Exception:
                missed.append({"link": link, "reason": "bad from/to"})
                continue

            # from: next_ops += to
            cur.execute(
                "SELECT id, prev_ops, next_ops FROM operations WHERE op_number = ?",
                (frm,),
            )
            r = cur.fetchone()
            if not r:
                missed.append({"op": frm, "reason": "from not found"})
            else:
                nxt = _load_list(r["next_ops"])
                if to not in nxt:
                    nxt.append(to)
                    cur.execute(
                        "UPDATE operations SET next_ops = ? WHERE id = ?",
                        (json.dumps(nxt), r["id"]),
                    )
                    applied += 1

            # to: prev_ops += from
            cur.execute(
                "SELECT id, prev_ops, next_ops FROM operations WHERE op_number = ?",
                (to,),
            )
            r2 = cur.fetchone()
            if not r2:
                missed.append({"op": to, "reason": "to not found"})
            else:
                prev = _load_list(r2["prev_ops"])
                if frm not in prev:
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
        return {"status": "error", "detail": str(e), "applied": 0}
    finally:
        conn.close()

    return {
        "status": "ok",
        "applied": applied,
        "links": links,
        "missed": missed,
        "db": path,
    }

@router.get("/explain/feature-importance")
def explain_feature_importance():
    try:
        local_engine = AIEngine()

        if local_engine.predictor is None:
            return {
                "status": "ok",
                "available": False,
                "features": [],
                "detail": "Predictor is not available",
            }

        model = local_engine.predictor.delay_model

        if model is None:
            return {
                "status": "ok",
                "available": False,
                "features": [],
                "detail": "Delay model is not trained or not loaded",
            }

        from ai.explainability.feature_importance import (
            build_explanation_payload
        )

        payload = build_explanation_payload(
            model=model
        )

        return {
            "status": "ok",
            **payload,
        }

    except Exception as e:
        import logging

        logging.getLogger(__name__).exception(
            "Feature importance explanation failed"
        )

        return {
            "status": "error",
            "available": False,
            "detail": str(e),
            "features": [],
        }