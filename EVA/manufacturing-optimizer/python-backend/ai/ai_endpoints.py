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
async def apply_gap_links(payload: Dict[str, Any]):
    import json
    links = payload.get("links") or []
    persist = bool(payload.get("persist", True))
    if not links:
        raise HTTPException(400, detail="links empty")

    if not persist:
        return {"status": "ok", "applied": links, "persist": False}

    from db_unified import get_db
    conn = get_db()
    cur = conn.cursor()
    applied = []
    try:
        for link in links:
            frm, to = str(link["from"]), str(link["to"])

            cur.execute(
                "SELECT id, next_ops FROM operations WHERE CAST(op_number AS TEXT) = ?",
                (frm,),
            )
            row = cur.fetchone()
            if not row:
                continue
            rid = row["id"] if hasattr(row, "keys") else row[0]
            raw = row["next_ops"] if hasattr(row, "keys") else row[1]
            nxt = json.loads(raw) if isinstance(raw, str) and raw else (list(raw) if raw else [])
            nxt = [str(x) for x in nxt]
            if to not in nxt:
                nxt.append(to)
                cur.execute(
                    "UPDATE operations SET next_ops = ? WHERE id = ?",
                    (json.dumps(nxt), rid),
                )

            cur.execute(
                "SELECT id, prev_ops FROM operations WHERE CAST(op_number AS TEXT) = ?",
                (to,),
            )
            row = cur.fetchone()
            if not row:
                continue
            rid = row["id"] if hasattr(row, "keys") else row[0]
            raw = row["prev_ops"] if hasattr(row, "keys") else row[1]
            prev = json.loads(raw) if isinstance(raw, str) and raw else (list(raw) if raw else [])
            prev = [str(x) for x in prev]
            if frm not in prev:
                prev.append(frm)
                cur.execute(
                    "UPDATE operations SET prev_ops = ? WHERE id = ?",
                    (json.dumps(prev), rid),
                )

            applied.append({"from": frm, "to": to})
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, detail=str(e))
    finally:
        conn.close()

    return {"status": "ok", "applied": applied, "persist": True}