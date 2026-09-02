# -*- coding: utf-8 -*-
"""
NEVZ Auth + Worker dashboard + QR session.
Подключение в api.py:"""
    from auth_api import router as auth_router
    app.include_router(auth_router)

from __future__ import annotations

import json
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/auth", tags=["auth"])

_QR_SESSIONS: Dict[str, Dict[str, Any]] = {}

HORIZON_DAYS = {
    "day": 1,
    "week": 7,
    "month": 30,
    "quarter": 90,
    "three_months": 90,
    "half_year": 182,
    "year": 365,
}


def get_db_path() -> str:
    here = Path(__file__).resolve().parent
    for p in (
        here.parent / "data" / "manufacturing.db",  # EVA/.../data/manufacturing.db
        here / "data" / "manufacturing.db",
        here / "manufacturing.db",
        here.parent / "manufacturing.db",
    ):
        if p.is_file():
            return str(p)
    # как в api.py
    return str(here.parent / "data" / "manufacturing.db")


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    return conn


def row_user(r) -> Optional[dict]:
    if r is None:
        return None
    d = dict(r)
    d.pop("password", None)
    if d.get("role") == "admin":
        role = "admin"
    elif int(d.get("is_brigadier") or 0) == 1:
        role = "brigadier"
    else:
        role = "worker"
    d["role"] = role
    return d


class LoginRequest(BaseModel):
    login: str
    password: str


class ProfileUpdate(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    name: Optional[str] = None


class PasswordChange(BaseModel):
    worker_id: int
    old_password: str
    new_password: str = Field(min_length=4)


class QrConfirmRequest(BaseModel):
    token: str
    login: str
    password: str


@router.post("/login")
def login(body: LoginRequest):
    login_s = (body.login or "").strip()
    password = body.password or ""

    if login_s == "admin" and password == "admin123":
        return {
            "success": True,
            "user": {
                "id": 0,
                "name": "Администратор",
                "role": "admin",
                "brigade_id": None,
                "login": "admin",
                "is_brigadier": 0,
            },
            "token": secrets.token_hex(16),
        }

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM workers WHERE lower(login) = lower(?) LIMIT 1",
            (login_s,),
        )
        row = cur.fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    if (row["password"] or "") != password:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    user = row_user(row)
    return {"success": True, "user": user, "token": secrets.token_hex(16)}


@router.post("/qr/create")
def qr_create():
    token = secrets.token_urlsafe(24)
    _QR_SESSIONS[token] = {
        "created": time.time(),
        "expires": time.time() + 180,
        "used": False,
        "user": None,
        "token_auth": None,
    }
    payload = json.dumps({"t": token, "v": 1}, ensure_ascii=False)
    return {
        "success": True,
        "token": token,
        "payload": payload,
        "expires_in": 180,
    }


@router.post("/qr/confirm")
def qr_confirm(body: QrConfirmRequest):
    sess = _QR_SESSIONS.get(body.token)
    if not sess or sess["used"] or time.time() > sess["expires"]:
        raise HTTPException(status_code=400, detail="QR истёк или недействителен")
    result = login(LoginRequest(login=body.login, password=body.password))
    sess["user"] = result["user"]
    sess["token_auth"] = result["token"]
    return {"success": True, "message": "Подтверждено — вернитесь к экрану входа"}


@router.get("/qr/poll/{token}")
def qr_poll(token: str):
    sess = _QR_SESSIONS.get(token)
    if not sess or time.time() > sess["expires"]:
        return {"status": "expired"}
    if sess.get("user"):
        sess["used"] = True
        return {
            "status": "ok",
            "user": sess["user"],
            "token": sess.get("token_auth"),
        }
    return {"status": "pending"}


@router.get("/worker/{worker_id}/dashboard")
def worker_dashboard(
    worker_id: int,
    horizon: str = Query("week", pattern="^(day|week|month|quarter|three_months|half_year|year)$"),
):
    days = HORIZON_DAYS.get(horizon, 7)
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM workers WHERE id = ?", (worker_id,))
        w = cur.fetchone()
        if not w:
            raise HTTPException(status_code=404, detail="Сотрудник не найден")

        brigade_id = w["brigade_id"]
        brigade = None
        if brigade_id:
            cur.execute("SELECT * FROM brigades WHERE id = ?", (brigade_id,))
            br = cur.fetchone()
            brigade = dict(br) if br else None

        if brigade_id:
            cur.execute(
                """
                SELECT * FROM operations
                WHERE brigade_id = ?
                ORDER BY COALESCE(start_date, ''), id
                """,
                (brigade_id,),
            )
        else:
            cur.execute("SELECT * FROM operations WHERE 0")
        ops = [dict(r) for r in cur.fetchall()]

        mates = []
        if brigade_id:
            cur.execute(
                "SELECT id, name, position, role, is_brigadier, status, phone FROM workers WHERE brigade_id = ?",
                (brigade_id,),
            )
            mates = [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()

    total = len(ops)
    done = sum(
        1
        for o in ops
        if str(o.get("status") or "").lower() in ("completed", "done", "finished")
    )
    in_prog = sum(
        1 for o in ops if str(o.get("status") or "").lower() in ("in_progress", "active")
    )
    pending = max(0, total - done - in_prog)

    return {
        "worker": row_user(w),
        "brigade": brigade,
        "mates": mates,
        "horizon": horizon,
        "horizon_days": days,
        "operations": ops,
        "progress": {
            "total": total,
            "completed": done,
            "in_progress": in_prog,
            "pending": pending,
            "percent": round(100.0 * done / total, 1) if total else 0.0,
        },
    }


@router.put("/profile/{worker_id}")
def update_profile(worker_id: int, body: ProfileUpdate):
    data = body.dict(exclude_unset=True)
    fields, params = [], []
    for k in ("email", "phone", "name"):
        if k in data and data[k] is not None:
            fields.append(f"{k} = ?")
            params.append(data[k])
    if not fields:
        return {"success": True}
    params.append(worker_id)
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(f"UPDATE workers SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()
        cur.execute("SELECT * FROM workers WHERE id = ?", (worker_id,))
        u = row_user(cur.fetchone())
    finally:
        conn.close()
    return {"success": True, "user": u}


@router.post("/password")
def change_password(body: PasswordChange):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT password FROM workers WHERE id = ?", (body.worker_id,))
        row = cur.fetchone()
        if not row or (row["password"] or "") != body.old_password:
            raise HTTPException(status_code=400, detail="Неверный текущий пароль")
        cur.execute(
            "UPDATE workers SET password = ? WHERE id = ?",
            (body.new_password, body.worker_id),
        )
        conn.commit()
    finally:
        conn.close()
    return {"success": True}
