#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Manufacturing Optimizer API - COMPLETE WORKING VERSION
=======================================================
Полностью рабочий API с импортом Excel, управлением бригадами,
рабочими, операциями, CPM и AI оптимизацией.
"""

import os
import sys
import json
import sqlite3
from datetime import datetime
from typing import List, Dict, Optional, Any
from pathlib import Path
from contextlib import asynccontextmanager

# Настройка кодировки для Windows
if sys.platform == 'win32':
    import codecs
    try:
        if hasattr(sys.stdout, 'buffer'):
            sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
        if hasattr(sys.stderr, 'buffer'):
            sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')
    except (AttributeError, TypeError):
        pass

from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
import pandas as pd
import numpy as np
import io

# from api.ai_endpoints import router as ai_router

# ================================================================
# КОНФИГУРАЦИЯ ПУТЕЙ
# ================================================================

import httpx

from db_adapter import (
    build_ai_plan_from_db,
    sync_operation_history_to_training,
    get_historical_for_ml
)

# ================================================================
# КОНФИГУРАЦИЯ ПУТЕЙ
# ================================================================

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR.parent / "data"
DB_PATH = DATA_DIR / "manufacturing.db"
EXPORTS_DIR = DATA_DIR / "exports"

DATA_DIR.mkdir(parents=True, exist_ok=True)
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

# ================================================================
# БАЗА ДАННЫХ
# ================================================================

# ================================================================
# БАЗА ДАННЫХ
# ================================================================

from db_unified import init_db, migrate_db, get_db, seed_database
# ================================================================
# LIFESPAN
# ================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("=" * 60)
    print("[INFO] Manufacturing Optimizer API starting...")
    migrate_db()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM brigades")
    if cursor.fetchone()[0] == 0:
        print("[INFO] Database empty, seeding...")
        seed_database()
    conn.close()
    print("[INFO] API running at: http://127.0.0.1:8000")
    print("[INFO] API docs at: http://127.0.0.1:8000/docs")
    print("=" * 60)
    yield
    print("[INFO] API shutting down...")

# ================================================================
# FASTAPI APP
# ================================================================

app = FastAPI(
    title="Manufacturing Optimizer API",
    description="API для оптимизации производства с AI",
    version="2.0.0",
    lifespan=lifespan
)

# Подключение AI-роутера
try:
    from api.ai_endpoints import router as ai_router
    app.include_router(ai_router)
except Exception as e:
    import logging
    logging.getLogger(__name__).warning(f"AI router not loaded: {e}")

# app.include_router(ai_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    from api.ai_endpoints import router as ai_router
    app.include_router(ai_router)
    print("[OK] AI endpoints loaded")
except Exception as e:
    print(f"[WARN] AI endpoints not loaded: {e}")

try:
    from api.cpm_endpoints import router as cpm_router
    app.include_router(cpm_router)
    print("[OK] CPM endpoints loaded")
except Exception as e:
    print(f"[WARN] CPM endpoints not loaded: {e}")
# ================================================================
# ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ОШИБОК
# ================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"status": "error", "detail": str(exc)}
    )

# ================================================================
# КОНФИГУРАЦИЯ OLLAMA
# ================================================================

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3"

class OllamaAssistant:
    @staticmethod
    async def get_recommendation(prompt: str) -> str:
        """Запрос к локальной нейросети за советом"""
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "system": "Ты — эксперт по оптимизации производства (Lean Manufacturing). Твоя задача — давать четкие, технические советы на основе предоставленных данных. Отвечай на русском языке."
        }
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(OLLAMA_URL, json=payload)
                if response.status_code == 200:
                    result = response.json()
                    return result.get("response", "Не удалось получить ответ от нейросети")
                return f"Ошибка Ollama: {response.status_code} - {response.text}"
        except httpx.TimeoutException:
            return "Ollama не отвечает. Проверьте, запущена ли Ollama (ollama serve)"
        except httpx.ConnectError:
            return "Ollama не доступна. Убедитесь, что Ollama запущена локально: 'ollama serve'"
        except Exception as e:
            return f"Ошибка при обращении к Ollama: {str(e)}"

# ================================================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ================================================================

def row_to_dict(row):
    if not row:
        return None
    d = dict(row)
    for field in ['prev_ops', 'next_ops', 'skills', 'assigned_workers']:
        if field in d and d[field]:
            try:
                d[field] = json.loads(d[field])
            except:
                d[field] = []
    if 'is_brigadier' in d:
        d['is_brigadier'] = bool(d['is_brigadier'])
    return d

def parse_list(value):
    if value is None or value == "":
        return []
    if isinstance(value, (int, float)):
        return [int(value)]
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            return [int(x.strip()) for x in value.split(',') if x.strip()]
        except:
            return []
    return []

def calculate_cpm(operations):
    """Расчёт критического пути"""
    if not operations:
        return {"project_duration": 0, "critical_path": [], "critical_path_length": 0}
    
    graph = {}
    duration = {}
    all_nodes = set()
    
    for op in operations:
        op_num = op['op_number']
        all_nodes.add(op_num)
        duration[op_num] = op.get('duration', 0)
        next_ops = op.get('next_ops', [])
        if isinstance(next_ops, str):
            next_ops = json.loads(next_ops) if next_ops else []
        graph[op_num] = next_ops
        for n in next_ops:
            all_nodes.add(n)
    
    in_degree = {node: 0 for node in all_nodes}
    for node in graph:
        for neighbor in graph[node]:
            if neighbor in in_degree:
                in_degree[neighbor] += 1
    
    queue = [node for node in in_degree if in_degree[node] == 0]
    sorted_nodes = []
    
    while queue:
        node = queue.pop(0)
        sorted_nodes.append(node)
        for neighbor in graph.get(node, []):
            if neighbor in in_degree:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)
    
    es = {node: 0 for node in sorted_nodes}
    ef = {}
    for node in sorted_nodes:
        ef[node] = es[node] + duration.get(node, 0)
        for neighbor in graph.get(node, []):
            if neighbor in es:
                es[neighbor] = max(es.get(neighbor, 0), ef[node])
    
    project_duration = max(ef.values()) if ef else 0
    
    lf = {node: project_duration for node in sorted_nodes}
    ls = {}
    for node in reversed(sorted_nodes):
        # Сначала обновляем LF текущей операции по LS её последователей
        # (последователи уже обработаны, т.к. идём в обратном топологическом порядке),
        # и только потом считаем LS самой операции. Раньше порядок был перепутан,
        # из-за чего резерв времени считался неверно и часть операций критического
        # пути не распознавалась как критическая — это позволяло /optimize
        # переставлять операции, которые двигать нельзя (нарушая зависимости).
        for neighbor in graph.get(node, []):
            if neighbor in ls:
                lf[node] = min(lf[node], ls[neighbor])
        ls[node] = lf[node] - duration.get(node, 0)
    
    critical_path = []
    for node in sorted_nodes:
        if abs(ls[node] - es[node]) < 0.001:
            critical_path.append(node)
    
    return {
        "project_duration": round(project_duration, 2),
        "critical_path": critical_path,
        "critical_path_length": len(critical_path),
        "total_operations": len(operations)
    }

def recalculate_brigade_load(brigade_id: int):
    """Recalculate brigade load based on active tasks"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Count active tasks
    cursor.execute("""
        SELECT COUNT(*) FROM brigade_tasks 
        WHERE brigade_id = ? AND status IN ('pending', 'in_progress')
    """, (brigade_id,))
    active_tasks = cursor.fetchone()[0]
    
    # Count workers
    cursor.execute("SELECT COUNT(*) FROM workers WHERE brigade_id = ?", (brigade_id,))
    workers_count = cursor.fetchone()[0]
    
    # Load = (active_tasks / (workers * 3)) * 100
    if workers_count == 0:
        load = 0
    else:
        max_tasks = workers_count * 3
        load = min(100, round((active_tasks / max_tasks) * 100)) if max_tasks > 0 else 0
    
    cursor.execute("UPDATE brigades SET current_load = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (load, brigade_id))
    conn.commit()
    conn.close()
    
    return {"load": load, "active_tasks": active_tasks, "workers": workers_count}

def get_brigade_tasks_sync(brigade_id: Optional[int] = None):
    """Получить задачи бригад (синхронная версия)"""
    conn = get_db()
    cursor = conn.cursor()
    
    if brigade_id:
        cursor.execute("""
            SELECT t.*, w.name as worker_name 
            FROM brigade_tasks t
            LEFT JOIN workers w ON t.assigned_worker_id = w.id
            WHERE t.brigade_id = ?
            ORDER BY 
                CASE t.priority 
                    WHEN 'critical' THEN 1 
                    WHEN 'high' THEN 2 
                    WHEN 'medium' THEN 3 
                    WHEN 'low' THEN 4 
                END,
                t.due_date ASC,
                t.created_at DESC
        """, (brigade_id,))
    else:
        cursor.execute("""
            SELECT t.*, w.name as worker_name, b.name as brigade_name
            FROM brigade_tasks t
            LEFT JOIN workers w ON t.assigned_worker_id = w.id
            LEFT JOIN brigades b ON t.brigade_id = b.id
            ORDER BY t.created_at DESC
        """)
    
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

# ================================================================
# PYDANTIC МОДЕЛИ
# ================================================================

class OperationCreate(BaseModel):
    post: Optional[int] = None
    op_number: int
    prev_ops: List[int] = []
    next_ops: List[int] = []
    name: str
    drawing: str = ""
    labor_hours: float = 0.0
    people_count: int = Field(1, ge=1, le=20)
    duration: float = 0.0
    brigade_id: Optional[int] = None
    location: str = ""
    time_reserve: float = 0.0
    status: str = "pending"
    priority: str = "medium"

class OperationUpdate(BaseModel):
    post: Optional[int] = None
    op_number: Optional[int] = None
    prev_ops: Optional[List[int]] = None
    next_ops: Optional[List[int]] = None
    name: Optional[str] = None
    drawing: Optional[str] = None
    labor_hours: Optional[float] = None
    people_count: Optional[int] = None
    duration: Optional[float] = None
    brigade_id: Optional[int] = None
    location: Optional[str] = None
    time_reserve: Optional[float] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    end_date: Optional[str] = None

class BrigadeCreate(BaseModel):
    name: str
    description: str = ""
    max_capacity: int = Field(10, ge=1, le=50)
    efficiency_rating: float = Field(1.0, ge=0.0, le=2.0)

class BrigadeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    current_load: Optional[float] = None
    max_capacity: Optional[int] = None
    efficiency_rating: Optional[float] = None
    importance: Optional[str] = None

class WorkerCreate(BaseModel):
    name: str
    position: Optional[str] = "Рабочий"
    brigade_id: Optional[int] = None
    skills: Optional[List[str]] = []
    login: str
    password: str
    is_brigadier: Optional[bool] = False
    phone: Optional[str] = None
    email: Optional[str] = None

class WorkerUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[str] = None
    brigade_id: Optional[int] = None
    skills: Optional[List[str]] = None
    status: Optional[str] = None
    is_brigadier: Optional[bool] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    login: Optional[str] = None
    password: Optional[str] = None

class TransferWorkerRequest(BaseModel):
    worker_id: int
    new_brigade_id: Optional[int] = None

class AssignBrigadierRequest(BaseModel):
    worker_id: int
    brigade_id: int

class BrigadeTaskCreate(BaseModel):
    brigade_id: int
    title: str
    description: Optional[str] = ""
    priority: Optional[str] = "medium"
    task_type: Optional[str] = "main"
    assigned_worker_id: Optional[int] = None
    due_date: Optional[str] = None
    estimated_hours: Optional[float] = 0

class BrigadeTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    task_type: Optional[str] = None
    status: Optional[str] = None
    assigned_worker_id: Optional[int] = None
    due_date: Optional[str] = None
    estimated_hours: Optional[float] = None
    actual_hours: Optional[float] = None

class ScheduleTaskCreate(BaseModel):
    brigade_id: int
    title: str
    description: Optional[str] = ""
    scheduled_date: str
    due_date: Optional[str] = None
    priority: Optional[str] = "medium"
    assigned_worker_id: Optional[int] = None
    estimated_hours: Optional[float] = 0

class ScheduleTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    assigned_worker_id: Optional[int] = None
    estimated_hours: Optional[float] = None
    actual_hours: Optional[float] = None
    status: Optional[str] = None

class ChatRequest(BaseModel):
    message: str

# ================================================================
# КОРНЕВЫЕ ЭНДПОИНТЫ
# ================================================================

@app.get("/")
async def root():
    return {"status": "running", "service": "Manufacturing Optimizer API", "version": "2.0.0"}

@app.get("/health")
async def health():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM operations")
    ops = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM brigades")
    brigs = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM workers")
    works = cursor.fetchone()[0]
    conn.close()
    return {"status": "healthy", "operations": ops, "brigades": brigs, "workers": works}

# ================================================================
# ОПЕРАЦИИ - СПЕЦИФИЧНЫЕ ЭНДПОИНТЫ (ДО /operations/{op_id})
# ================================================================

@app.get("/operations/by-post")
async def get_operations_by_post():
    """Получить операции, сгруппированные по постам"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT 
            post,
            COUNT(*) as total_ops,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
            SUM(labor_hours) as total_labor_hours,
            SUM(duration) as total_duration,
            COUNT(DISTINCT brigade_id) as brigades_count
        FROM operations
        GROUP BY post
        ORDER BY post
    """)
    
    posts = []
    for row in cursor.fetchall():
        posts.append({
            "post": row[0],
            "total_ops": row[1],
            "completed": row[2],
            "in_progress": row[3],
            "total_labor_hours": round(row[4], 2) if row[4] else 0,
            "total_duration": round(row[5], 2) if row[5] else 0,
            "brigades_count": row[6]
        })
    
    conn.close()
    return posts

@app.get("/operations/status-summary")
async def get_operations_status_summary():
    """Получить сводку по статусам операций"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT 
            status,
            COUNT(*) as count,
            SUM(labor_hours) as total_labor_hours,
            SUM(duration) as total_duration
        FROM operations
        GROUP BY status
    """)
    
    result = []
    for row in cursor.fetchall():
        result.append({
            "status": row[0],
            "count": row[1],
            "total_labor_hours": round(row[2], 2) if row[2] else 0,
            "total_duration": round(row[3], 2) if row[3] else 0
        })
    
    conn.close()
    return result

@app.get("/operations/network")
async def get_operations_network():
    """Получить сетевой граф операций для визуализации"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM operations ORDER BY op_number")
    rows = cursor.fetchall()
    conn.close()
    
    nodes = []
    edges = []
    
    for row in rows:
        op = row_to_dict(row)
        nodes.append({
            "id": op['op_number'],
            "label": f"{op['op_number']}: {op['name'][:20]}",
            "duration": op.get('duration', 0),
            "status": op.get('status', 'pending'),
            "post": op.get('post'),
            "people": op.get('people_count', 1),
            "labor_hours": op.get('labor_hours', 0)
        })
        
        for next_op in op.get('next_ops', []):
            edges.append({
                "from": op['op_number'],
                "to": next_op
            })
    
    return {"nodes": nodes, "edges": edges}

@app.get("/operations/network-d3")
async def get_network_d3():
    """Получить сетевой граф в формате D3.js для визуализации"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM operations ORDER BY op_number")
    rows = cursor.fetchall()
    conn.close()
    
    nodes = []
    links = []
    
    ops = [row_to_dict(row) for row in rows]
    cpm_data = calculate_cpm(ops)
    critical_path = cpm_data.get('critical_path', [])
    
    for row in rows:
        op = row_to_dict(row)
        is_critical = op['op_number'] in critical_path
        
        nodes.append({
            "id": op['op_number'],
            "name": op['name'][:30] + ('...' if len(op['name']) > 30 else ''),
            "duration": op.get('duration', 0),
            "status": op.get('status', 'pending'),
            "post": op.get('post'),
            "people": op.get('people_count', 1),
            "critical": is_critical,
            "brigade_id": op.get('brigade_id')
        })
        
        for next_op in op.get('next_ops', []):
            links.append({
                "source": op['op_number'],
                "target": next_op
            })
    
    return {"nodes": nodes, "links": links}

@app.get("/operations/statistics")
async def get_operations_statistics():
    """Получить общую статистику по операциям"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM operations")
    total = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM operations WHERE status = 'completed'")
    completed = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM operations WHERE status = 'in_progress'")
    in_progress = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM operations WHERE status = 'blocked'")
    blocked = cursor.fetchone()[0]
    
    cursor.execute("SELECT SUM(labor_hours) FROM operations")
    total_labor = cursor.fetchone()[0] or 0
    
    cursor.execute("SELECT SUM(duration) FROM operations")
    total_duration = cursor.fetchone()[0] or 0
    
    cursor.execute("SELECT SUM(labor_hours) FROM operations WHERE status != 'completed'")
    remaining_labor = cursor.fetchone()[0] or 0
    
    cursor.execute("SELECT COUNT(DISTINCT post) FROM operations")
    total_posts = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(DISTINCT brigade_id) FROM operations WHERE brigade_id IS NOT NULL")
    total_brigades = cursor.fetchone()[0]
    
    conn.close()
    
    return {
        "total_operations": total,
        "completed_operations": completed,
        "in_progress_operations": in_progress,
        "blocked_operations": blocked,
        "pending_operations": total - completed - in_progress - blocked,
        "total_labor_hours": round(total_labor, 2),
        "total_duration_hours": round(total_duration, 2),
        "remaining_labor_hours": round(remaining_labor, 2),
        "total_posts": total_posts,
        "total_brigades": total_brigades,
        "completion_rate": round((completed / total * 100), 1) if total > 0 else 0
    }

@app.get("/operations/critical-path")
async def get_critical_path_analysis():
    """Получить анализ критического пути"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM operations")
    rows = cursor.fetchall()
    conn.close()
    
    ops = [row_to_dict(row) for row in rows]
    cpm_data = calculate_cpm(ops)
    
    critical_ops = []
    for op in ops:
        if op['op_number'] in cpm_data.get('critical_path', []):
            critical_ops.append({
                "op_number": op['op_number'],
                "name": op['name'],
                "duration": op.get('duration', 0),
                "post": op.get('post'),
                "brigade_id": op.get('brigade_id'),
                "status": op.get('status', 'pending')
            })
    
    return {
        "project_duration": cpm_data.get('project_duration', 0),
        "critical_path_length": len(cpm_data.get('critical_path', [])),
        "total_operations": cpm_data.get('total_operations', 0),
        "critical_path_operations": critical_ops,
        "optimization_potential": round(cpm_data.get('project_duration', 0) * 0.15, 2)
    }

@app.get("/operations/critical-path-detailed")
async def get_critical_path_detailed():
    """Получить детальный анализ критического пути со всеми операциями"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM operations")
    rows = cursor.fetchall()
    conn.close()
    
    ops = [row_to_dict(row) for row in rows]
    cpm_data = calculate_cpm(ops)
    
    critical_path_ops = []
    for op_num in cpm_data.get('critical_path', []):
        for op in ops:
            if op['op_number'] == op_num:
                critical_path_ops.append({
                    "op_number": op['op_number'],
                    "name": op['name'],
                    "duration": op.get('duration', 0),
                    "post": op.get('post'),
                    "brigade_id": op.get('brigade_id'),
                    "status": op.get('status', 'pending'),
                    "prev_ops": op.get('prev_ops', []),
                    "next_ops": op.get('next_ops', [])
                })
                break
    
    return {
        "project_duration": cpm_data.get('project_duration', 0),
        "critical_path_length": len(critical_path_ops),
        "critical_path_operations": critical_path_ops,
        "total_operations": cpm_data.get('total_operations', 0)
    }

@app.get("/operations/posts")
async def get_posts_list():
    """Получить список всех постов"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT DISTINCT post 
        FROM operations 
        WHERE post IS NOT NULL 
        ORDER BY post
    """)
    
    posts = [row[0] for row in cursor.fetchall()]
    conn.close()
    return posts

@app.get("/operations/by-brigade/{brigade_id}")
async def get_operations_by_brigade(brigade_id: int):
    """Получить операции для конкретной бригады"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT * FROM operations 
        WHERE brigade_id = ? 
        ORDER BY op_number
    """, (brigade_id,))
    
    rows = cursor.fetchall()
    conn.close()
    return [row_to_dict(row) for row in rows]

@app.get("/operations/debug-relations")
async def debug_relations():
    """Диагностика связей между операциями"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT op_number, prev_ops, next_ops FROM operations LIMIT 20")
    rows = cursor.fetchall()
    
    result = []
    for row in rows:
        result.append({
            "op_number": row[0],
            "prev_ops": json.loads(row[1]) if row[1] else [],
            "next_ops": json.loads(row[2]) if row[2] else []
        })
    
    cursor.execute("SELECT COUNT(*) FROM operations")
    total = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM operations WHERE prev_ops != '[]' OR next_ops != '[]'")
    with_relations = cursor.fetchone()[0]
    
    conn.close()
    
    return {
        "total_operations": total,
        "operations_with_relations": with_relations,
        "sample": result
    }

# ================================================================
# ОПЕРАЦИИ - ОСНОВНЫЕ CRUD ЭНДПОИНТЫ (ПОСЛЕ СПЕЦИФИЧНЫХ)
# ================================================================

@app.get("/operations")
async def get_operations():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM operations ORDER BY op_number")
    rows = cursor.fetchall()
    conn.close()
    return [row_to_dict(row) for row in rows]

@app.get("/operations/all")
async def get_all_operations():
    return await get_operations()

@app.get("/operations/{op_id}")
async def get_operation(op_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM operations WHERE id = ?", (op_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Операция не найдена")
    return row_to_dict(row)

@app.post("/operations")
async def create_operation(op: OperationCreate):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO operations 
            (post, op_number, prev_ops, next_ops, name, drawing, labor_hours, 
             people_count, duration, brigade_id, location, time_reserve, status, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            op.post, op.op_number, json.dumps(op.prev_ops), json.dumps(op.next_ops),
            op.name, op.drawing, op.labor_hours, op.people_count, op.duration,
            op.brigade_id, op.location, op.time_reserve, op.status, op.priority
        ))
        conn.commit()
        op_id = cursor.lastrowid
        cursor.execute("SELECT * FROM operations WHERE id = ?", (op_id,))
        row = cursor.fetchone()
        conn.close()
        return row_to_dict(row)
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Операция с таким номером уже существует")

@app.put("/operations/{op_id}")
async def update_operation(op_id: int, op: OperationUpdate):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM operations WHERE id = ?", (op_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Операция не найдена")
    
    data = op.dict(exclude_unset=True)
    if data:
        updates = []
        params = []
        for field, value in data.items():
            if field in ['prev_ops', 'next_ops']:
                updates.append(f"{field} = ?")
                params.append(json.dumps(value))
            elif field in ['post', 'op_number', 'name', 'drawing', 'labor_hours', 
                          'people_count', 'duration', 'brigade_id', 'location', 
                          'time_reserve', 'status', 'priority', 'start_date', 'end_date']:
                updates.append(f"{field} = ?")
                params.append(value)
        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(op_id)
        cursor.execute(f"UPDATE operations SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
    
    cursor.execute("SELECT * FROM operations WHERE id = ?", (op_id,))
    row = cursor.fetchone()
    conn.close()
    return row_to_dict(row)

@app.delete("/operations/{op_id}")
async def delete_operation(op_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM operations WHERE id = ?", (op_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted", "id": op_id}

# ================================================================
# БРИГАДЫ
# ================================================================

@app.get("/brigades")
async def get_brigades():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM brigades ORDER BY id")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.get("/brigades/with-operations")
async def get_brigades_with_operations():
    """Получить бригады с количеством операций"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT 
            b.id,
            b.name,
            b.current_load,
            b.max_capacity,
            b.efficiency_rating,
            b.importance,
            COUNT(o.id) as operations_count,
            SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) as completed_ops,
            SUM(CASE WHEN o.status = 'in_progress' THEN 1 ELSE 0 END) as active_ops,
            SUM(o.labor_hours) as total_labor_hours,
            SUM(o.duration) as total_duration
        FROM brigades b
        LEFT JOIN operations o ON b.id = o.brigade_id
        GROUP BY b.id
        ORDER BY b.name
    """)
    
    result = []
    for row in cursor.fetchall():
        result.append({
            "id": row[0],
            "name": row[1],
            "current_load": row[2] or 0,
            "max_capacity": row[3] or 10,
            "efficiency_rating": row[4] or 1.0,
            "importance": row[5] or 'medium',
            "operations_count": row[6] or 0,
            "completed_ops": row[7] or 0,
            "active_ops": row[8] or 0,
            "total_labor_hours": round(row[9], 2) if row[9] else 0,
            "total_duration": round(row[10], 2) if row[10] else 0
        })
    
    conn.close()
    return result

@app.get("/brigades/{brigade_id}")
async def get_brigade(brigade_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM brigades WHERE id = ?", (brigade_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Бригада не найдена")
    brigade = dict(row)
    cursor.execute("SELECT * FROM workers WHERE brigade_id = ?", (brigade_id,))
    brigade['workers'] = [row_to_dict(w) for w in cursor.fetchall()]
    conn.close()
    return brigade

@app.post("/brigades")
async def create_brigade(brigade: BrigadeCreate):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO brigades (name, description, max_capacity, efficiency_rating) VALUES (?, ?, ?, ?)",
            (brigade.name, brigade.description, brigade.max_capacity, brigade.efficiency_rating)
        )
        conn.commit()
        brigade_id = cursor.lastrowid
        cursor.execute("SELECT * FROM brigades WHERE id = ?", (brigade_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row)
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Бригада с таким названием уже существует")

@app.put("/brigades/{brigade_id}")
async def update_brigade(brigade_id: int, data: Dict):
    conn = get_db()
    cursor = conn.cursor()
    
    updates = []
    params = []
    for field, value in data.items():
        if field in ['name', 'description', 'max_capacity', 'efficiency_rating', 'importance', 'current_load']:
            updates.append(f"{field} = ?")
            params.append(value)
    
    if updates:
        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(brigade_id)
        cursor.execute(f"UPDATE brigades SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
    
    cursor.execute("SELECT * FROM brigades WHERE id = ?", (brigade_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

@app.delete("/brigades/{brigade_id}")
async def delete_brigade(brigade_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM brigades WHERE id = ?", (brigade_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted", "id": brigade_id}

@app.get("/brigades/{brigade_id}/workers")
async def get_brigade_workers(brigade_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM workers WHERE brigade_id = ? ORDER BY is_brigadier DESC, name", (brigade_id,))
    rows = cursor.fetchall()
    conn.close()
    return [row_to_dict(row) for row in rows]

@app.post("/brigades/{brigade_id}/recalculate-load")
async def recalc_brigade_load_route(brigade_id: int):
    """Пересчитать загрузку бригады"""
    return recalculate_brigade_load(brigade_id)

@app.get("/brigades/{brigade_id}/statistics")
async def get_brigade_statistics(brigade_id: int):
    """Get brigade statistics"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM brigade_tasks WHERE brigade_id = ?", (brigade_id,))
    total_tasks = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM brigade_tasks WHERE brigade_id = ? AND status = 'completed'", (brigade_id,))
    completed_tasks = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM brigade_tasks WHERE brigade_id = ? AND status IN ('pending', 'in_progress')", (brigade_id,))
    active_tasks = cursor.fetchone()[0]
    
    cursor.execute("""
        SELECT COUNT(*) FROM brigade_tasks 
        WHERE brigade_id = ? AND status != 'completed' AND due_date < date('now')
    """, (brigade_id,))
    overdue_tasks = cursor.fetchone()[0]
    
    cursor.execute("""
        SELECT task_type, COUNT(*) FROM brigade_tasks 
        WHERE brigade_id = ? GROUP BY task_type
    """, (brigade_id,))
    tasks_by_type = {row[0]: row[1] for row in cursor.fetchall()}
    
    efficiency = round((completed_tasks / total_tasks) * 100) if total_tasks > 0 else 0
    
    conn.close()
    
    return {
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "active_tasks": active_tasks,
        "overdue_tasks": overdue_tasks,
        "tasks_by_type": tasks_by_type,
        "efficiency": efficiency
    }

# ================================================================
# ГРУППЫ БРИГАД
# ================================================================

@app.get("/brigade-groups")
async def get_brigade_groups():
    """Получить все группы бригад"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT g.*, COUNT(m.brigade_id) as brigade_count
        FROM brigade_groups g
        LEFT JOIN brigade_group_members m ON g.id = m.group_id
        GROUP BY g.id
        ORDER BY g.name
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/brigade-groups")
async def create_brigade_group(data: Dict):
    """Создать группу бригад"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO brigade_groups (name, description) VALUES (?, ?)",
        (data.get('name'), data.get('description', ''))
    )
    conn.commit()
    group_id = cursor.lastrowid
    conn.close()
    return {"id": group_id, **data}

@app.put("/brigade-groups/{group_id}")
async def update_brigade_group(group_id: int, data: Dict):
    """Обновить группу бригад"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE brigade_groups SET name = ?, description = ? WHERE id = ?",
        (data.get('name'), data.get('description', ''), group_id)
    )
    conn.commit()
    conn.close()
    return {"status": "updated"}

@app.delete("/brigade-groups/{group_id}")
async def delete_brigade_group(group_id: int):
    """Удалить группу бригад"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM brigade_groups WHERE id = ?", (group_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.post("/brigade-groups/{group_id}/add-brigade")
async def add_brigade_to_group(group_id: int, brigade_id: int):
    """Добавить бригаду в группу"""
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO brigade_group_members (group_id, brigade_id) VALUES (?, ?)",
            (group_id, brigade_id)
        )
        conn.commit()
    except sqlite3.IntegrityError:
        pass
    conn.close()
    return {"status": "added", "group_id": group_id, "brigade_id": brigade_id}

@app.post("/brigade-groups/{group_id}/remove-brigade")
async def remove_brigade_from_group(group_id: int, brigade_id: int):
    """Убрать бригаду из группы"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM brigade_group_members WHERE group_id = ? AND brigade_id = ?",
        (group_id, brigade_id)
    )
    conn.commit()
    conn.close()
    return {"status": "removed", "group_id": group_id, "brigade_id": brigade_id}

@app.get("/brigade-groups/{group_id}/brigades")
async def get_group_brigades(group_id: int):
    """Получить бригады в группе"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT b.* FROM brigades b
        JOIN brigade_group_members m ON b.id = m.brigade_id
        WHERE m.group_id = ?
        ORDER BY b.name
    """, (group_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

# ================================================================
# РАБОЧИЕ
# ================================================================

@app.get("/workers")
async def get_workers(brigade_id: Optional[int] = None):
    """Получить всех рабочих"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        if brigade_id:
            cursor.execute("SELECT * FROM workers WHERE brigade_id = ? ORDER BY name", (brigade_id,))
        else:
            cursor.execute("SELECT * FROM workers ORDER BY name")
        
        rows = cursor.fetchall()
        conn.close()
        
        workers = []
        for row in rows:
            worker = dict(row)
            if worker.get('skills'):
                try:
                    worker['skills'] = json.loads(worker['skills'])
                except:
                    worker['skills'] = []
            worker['is_brigadier'] = bool(worker.get('is_brigadier', 0))
            workers.append(worker)
        
        return workers
    except Exception as e:
        print(f"ERROR in /workers: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/workers/{worker_id}")
async def get_worker(worker_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM workers WHERE id = ?", (worker_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Рабочий не найден")
    conn.close()
    return row_to_dict(row)

@app.post("/workers")
async def create_worker(worker: WorkerCreate):
    """Create worker"""
    print(f"[API] Creating worker: {worker.login}")
    
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO workers 
            (name, position, role, brigade_id, skills, login, password, is_brigadier, phone, email, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offline')
        """, (
            worker.name,
            worker.position or 'Рабочий',
            'worker',
            worker.brigade_id,
            json.dumps(worker.skills or []),
            worker.login,
            worker.password,
            1 if worker.is_brigadier else 0,
            worker.phone,
            worker.email
        ))
        conn.commit()
        worker_id = cursor.lastrowid
        
        cursor.execute("SELECT * FROM workers WHERE id = ?", (worker_id,))
        row = cursor.fetchone()
        conn.close()
        
        worker_data = row_to_dict(row)
        print(f"[API] Worker created: ID={worker_id}, login={worker.login}")
        
        return worker_data
        
    except sqlite3.IntegrityError as e:
        conn.close()
        print(f"[API] IntegrityError: {e}")
        if 'UNIQUE constraint failed: workers.login' in str(e):
            raise HTTPException(status_code=400, detail="Login already exists")
        raise HTTPException(status_code=400, detail=f"DB Error: {e}")
    except Exception as e:
        conn.close()
        print(f"[API] Error creating worker: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/workers/{worker_id}")
async def update_worker(worker_id: int, data: Dict):
    """Обновить рабочего"""
    print(f"[API] Updating worker {worker_id}: {data}")
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM workers WHERE id = ?", (worker_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Рабочий не найден")
    
    updates = []
    params = []
    
    allowed_fields = ['name', 'position', 'brigade_id', 'skills', 'login', 'is_brigadier', 'phone', 'email', 'status']
    
    for field, value in data.items():
        if field not in allowed_fields:
            continue
            
        if field == 'skills':
            updates.append(f"{field} = ?")
            params.append(json.dumps(value))
        elif field == 'is_brigadier':
            updates.append(f"{field} = ?")
            params.append(1 if value else 0)
        else:
            updates.append(f"{field} = ?")
            params.append(value)
    
    if updates:
        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(worker_id)
        
        try:
            cursor.execute(f"UPDATE workers SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
        except sqlite3.IntegrityError as e:
            conn.close()
            if 'UNIQUE constraint failed: workers.login' in str(e):
                raise HTTPException(status_code=400, detail="Логин уже существует")
            raise HTTPException(status_code=400, detail=str(e))
    
    cursor.execute("SELECT * FROM workers WHERE id = ?", (worker_id,))
    row = cursor.fetchone()
    conn.close()
    
    return row_to_dict(row)

@app.delete("/workers/{worker_id}")
async def delete_worker(worker_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM workers WHERE id = ?", (worker_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted", "id": worker_id}

@app.post("/workers/transfer")
async def transfer_worker(request: TransferWorkerRequest):
    """Перевод рабочего в другую бригаду"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE workers SET brigade_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (request.new_brigade_id, request.worker_id)
    )
    conn.commit()
    conn.close()
    return {"status": "transferred", "worker_id": request.worker_id, "new_brigade_id": request.new_brigade_id}

@app.post("/workers/assign-brigadier")
async def assign_brigadier(request: AssignBrigadierRequest):
    """Назначить рабочего бригадиром"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("UPDATE workers SET is_brigadier = 0 WHERE brigade_id = ?", (request.brigade_id,))
    cursor.execute(
        "UPDATE workers SET is_brigadier = 1, brigade_id = ? WHERE id = ?",
        (request.brigade_id, request.worker_id)
    )
    
    conn.commit()
    conn.close()
    return {"status": "assigned", "worker_id": request.worker_id, "brigade_id": request.brigade_id}

# ================================================================
# ЗАДАЧИ БРИГАД
# ================================================================

@app.get("/brigade-tasks")
async def get_brigade_tasks(brigade_id: Optional[int] = None):
    """Получить задачи бригад"""
    return get_brigade_tasks_sync(brigade_id)

@app.post("/brigade-tasks")
async def create_brigade_task(task: BrigadeTaskCreate):
    """Create brigade task"""
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            INSERT INTO brigade_tasks 
            (brigade_id, title, description, priority, task_type, assigned_worker_id, due_date, estimated_hours)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            task.brigade_id, 
            task.title, 
            task.description or "", 
            task.priority or "medium", 
            task.task_type or "main", 
            task.assigned_worker_id, 
            task.due_date, 
            task.estimated_hours or 0
        ))
        
        conn.commit()
        task_id = cursor.lastrowid
        conn.close()
        
        recalculate_brigade_load(task.brigade_id)
        
        return {"id": task_id, **task.dict()}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/brigade-tasks/{task_id}")
async def update_brigade_task(task_id: int, task: BrigadeTaskUpdate):
    """Update brigade task"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT brigade_id FROM brigade_tasks WHERE id = ?", (task_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")
    
    brigade_id = row[0]
    
    data = task.dict(exclude_unset=True)
    if data:
        updates = []
        params = []
        for field, value in data.items():
            if field not in ['id', 'created_at']:
                updates.append(f"{field} = ?")
                params.append(value)
        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(task_id)
        
        cursor.execute(f"UPDATE brigade_tasks SET {', '.join(updates)} WHERE id = ?", params)
        
        if 'status' in data and data['status'] == 'completed':
            cursor.execute("UPDATE brigade_tasks SET completed_at = CURRENT_TIMESTAMP WHERE id = ?", (task_id,))
        
        conn.commit()
    
    conn.close()
    recalculate_brigade_load(brigade_id)
    return {"status": "updated"}

@app.delete("/brigade-tasks/{task_id}")
async def delete_brigade_task(task_id: int):
    """Delete brigade task"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT brigade_id FROM brigade_tasks WHERE id = ?", (task_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")
    
    brigade_id = row[0]
    cursor.execute("DELETE FROM brigade_tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    
    recalculate_brigade_load(brigade_id)
    return {"status": "deleted"}

@app.post("/brigade-tasks/{task_id}/assign")
async def assign_task_to_worker(task_id: int, worker_id: int):
    """Назначить задачу на рабочего"""
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute("UPDATE brigade_tasks SET assigned_worker_id = ? WHERE id = ?", (worker_id, task_id))
        cursor.execute("SELECT brigade_id FROM brigade_tasks WHERE id = ?", (task_id,))
        row = cursor.fetchone()
        if row:
            brigade_id = row[0]
            conn.commit()
            recalculate_brigade_load(brigade_id)
        else:
            conn.rollback()
            raise HTTPException(status_code=404, detail="Task not found")
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
    
    return {"status": "assigned", "worker_id": worker_id, "task_id": task_id}

# ================================================================
# РАСПИСАНИЕ БРИГАД
# ================================================================

@app.get("/brigade-schedule/{brigade_id}")
async def get_brigade_schedule(brigade_id: int, date: Optional[str] = None):
    """Get brigade schedule for date"""
    conn = get_db()
    cursor = conn.cursor()
    
    if date:
        cursor.execute("""
            SELECT s.*, w.name as worker_name 
            FROM brigade_schedule s
            LEFT JOIN workers w ON s.assigned_worker_id = w.id
            WHERE s.brigade_id = ? AND s.scheduled_date = ?
            ORDER BY s.priority_order ASC, s.created_at ASC
        """, (brigade_id, date))
    else:
        cursor.execute("""
            SELECT s.*, w.name as worker_name 
            FROM brigade_schedule s
            LEFT JOIN workers w ON s.assigned_worker_id = w.id
            WHERE s.brigade_id = ?
            ORDER BY s.scheduled_date DESC, s.priority_order ASC
        """, (brigade_id,))
    
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/brigade-schedule")
async def create_schedule_task(task: ScheduleTaskCreate):
    """Create schedule task"""
    conn = get_db()
    cursor = conn.cursor()
    
    priority_order = {'critical': 1, 'high': 2, 'medium': 3, 'low': 4}
    
    try:
        cursor.execute("""
            INSERT INTO brigade_schedule 
            (brigade_id, title, description, scheduled_date, due_date, priority, priority_order, 
             assigned_worker_id, estimated_hours, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        """, (
            task.brigade_id, 
            task.title, 
            task.description or "", 
            task.scheduled_date,
            task.due_date, 
            task.priority or "medium", 
            priority_order.get(task.priority, 3),
            task.assigned_worker_id, 
            task.estimated_hours or 0
        ))
        
        conn.commit()
        task_id = cursor.lastrowid
        conn.close()
        
        return {"id": task_id, **task.dict()}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/brigade-schedule/{task_id}")
async def update_schedule_task(task_id: int, task: ScheduleTaskUpdate):
    """Update schedule task"""
    conn = get_db()
    cursor = conn.cursor()
    
    data = task.dict(exclude_unset=True)
    if data:
        updates = []
        params = []
        for field, value in data.items():
            if field == 'priority':
                priority_order = {'critical': 1, 'high': 2, 'medium': 3, 'low': 4}
                updates.append("priority = ?")
                params.append(value)
                updates.append("priority_order = ?")
                params.append(priority_order.get(value, 3))
            else:
                updates.append(f"{field} = ?")
                params.append(value)
        
        if updates:
            params.append(task_id)
            cursor.execute(f"UPDATE brigade_schedule SET {', '.join(updates)} WHERE id = ?", params)
            
            if 'status' in data and data['status'] == 'completed':
                cursor.execute("UPDATE brigade_schedule SET completed_at = CURRENT_TIMESTAMP WHERE id = ?", (task_id,))
            
            conn.commit()
    
    conn.close()
    return {"status": "updated"}

@app.delete("/brigade-schedule/{task_id}")
async def delete_schedule_task(task_id: int):
    """Delete schedule task"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM brigade_schedule WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.put("/brigade-schedule/{task_id}/complete")
async def complete_schedule_task(task_id: int):
    """Complete schedule task"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE brigade_schedule 
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (task_id,))
    conn.commit()
    conn.close()
    return {"status": "completed"}

# ================================================================
# CPM
# ================================================================

@app.post("/calculate-cpm")
async def calculate_cpm_endpoint():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM operations")
    rows = cursor.fetchall()
    conn.close()
    operations = [row_to_dict(row) for row in rows]
    return calculate_cpm(operations)

# ================================================================
# СТАТИСТИКА
# ================================================================

@app.get("/statistics")
async def get_statistics():
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM operations")
    total = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM operations WHERE status = 'completed'")
    completed = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM operations WHERE status = 'in_progress'")
    in_progress = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM brigades")
    brigades = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM workers")
    workers = cursor.fetchone()[0]
    conn.close()
    
    return {
        "total_operations": total,
        "completed_operations": completed,
        "in_progress_operations": in_progress,
        "active_brigades": brigades,
        "total_workers": workers,
        "avg_efficiency": 87.5
    }

@app.get("/brigades/load-analysis")
async def get_brigade_load_analysis():
    """Анализ загрузки всех бригад"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM brigades")
    brigades = [dict(row) for row in cursor.fetchall()]
    
    cursor.execute("SELECT brigade_id, COUNT(*) as count FROM workers GROUP BY brigade_id")
    workers_count = {row[0]: row[1] for row in cursor.fetchall()}
    
    cursor.execute("""
        SELECT brigade_id, COUNT(*) as count 
        FROM brigade_tasks 
        WHERE status != 'completed' 
        GROUP BY brigade_id
    """)
    tasks_count = {row[0]: row[1] for row in cursor.fetchall()}
    
    conn.close()
    
    result = []
    for brigade in brigades:
        b_id = brigade['id']
        workers = workers_count.get(b_id, 0)
        tasks = tasks_count.get(b_id, 0)
        max_cap = brigade.get('max_capacity', 10)
        
        worker_load = (workers / max_cap * 100) if max_cap > 0 else 0
        task_load = (tasks / (workers * 3) * 100) if workers > 0 else 0
        
        result.append({
            "id": b_id,
            "name": brigade['name'],
            "workers": workers,
            "max_capacity": max_cap,
            "active_tasks": tasks,
            "worker_load_percent": round(worker_load, 1),
            "task_load_percent": round(min(task_load, 100), 1),
            "status": "overloaded" if worker_load > 80 or task_load > 80 else "normal" if worker_load > 20 else "underloaded",
            "efficiency": brigade.get('efficiency_rating', 1.0)
        })
    
    return result

# ================================================================
# AI ЭНДПОИНТЫ (ОБНОВЛЕННЫЕ)
# ================================================================

@app.post("/optimize")
@app.post("/optimize/legacy")
async def optimize():
    """
    Оптимизация производства путем перераспределения бригад между операциями
    """
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        # Получаем все операции
        cursor.execute("SELECT * FROM operations")
        all_ops_rows = cursor.fetchall()
        all_ops = [row_to_dict(row) for row in all_ops_rows]
        
        # Получаем активные операции (не завершенные)
        cursor.execute("SELECT * FROM operations WHERE status != 'completed'")
        ops_rows = cursor.fetchall()
        ops = [row_to_dict(row) for row in ops_rows]
        
        # Получаем все бригады
        cursor.execute("SELECT * FROM brigades")
        brigades = [dict(row) for row in cursor.fetchall()]
        
        # Получаем рабочих
        cursor.execute("SELECT id, brigade_id, status FROM workers WHERE status != 'offline'")
        workers = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        
        if not ops:
            return {
                "status": "success",
                "message": "Нет активных операций для анализа",
                "recommendations": [],
                "ai_analysis": "Все операции завершены. Производство работает штатно.",
                "summary": {
                    "total_ops": 0,
                    "critical_path_length": 0,
                    "overloaded_brigades_count": 0,
                    "potential_time_saving": 0
                }
            }
        
        # Расчет CPM на основе ВСЕХ операций
        cpm_data = calculate_cpm(all_ops)
        critical_path = set(cpm_data.get("critical_path", []))
        project_duration = cpm_data.get("project_duration", 0)
        
        brigade_dict = {b['id']: b for b in brigades}
        
        # Текущая загрузка бригад (количество рабочих)
        brigade_worker_count = {}
        for w in workers:
            b_id = w.get('brigade_id')
            if b_id:
                brigade_worker_count[b_id] = brigade_worker_count.get(b_id, 0) + 1
        
        # Загрузка бригад по операциям
        brigade_operations = {}
        for op in ops:
            b_id = op.get('brigade_id')
            if b_id:
                if b_id not in brigade_operations:
                    brigade_operations[b_id] = []
                brigade_operations[b_id].append(op)
        
        # Расчет загрузки каждой бригады (в процентах)
        brigade_load = {}
        for b in brigades:
            b_id = b['id']
            workers_count = brigade_worker_count.get(b_id, 0)
            max_cap = b.get('max_capacity', 10)
            
            # Если нет рабочих, но есть операции - считаем загрузку по операциям
            if workers_count == 0 and b_id in brigade_operations:
                # Загрузка на основе количества операций
                ops_count = len(brigade_operations.get(b_id, []))
                load_percent = min(100, ops_count * 15)  # Каждая операция дает 15% загрузки
            else:
                load_percent = (workers_count / max_cap * 100) if max_cap > 0 else 0
            
            brigade_load[b_id] = {
                'workers': workers_count,
                'max_capacity': max_cap,
                'load_percent': round(min(load_percent, 100), 1),
                'operations_count': len(brigade_operations.get(b_id, [])),
                'critical_ops': sum(1 for op in brigade_operations.get(b_id, []) if op.get('op_number') in critical_path)
            }
        
        # Поиск перегруженных и недогруженных бригад (расширяем пороги)
        overloaded = []
        underloaded = []
        
        for b_id, data in brigade_load.items():
            # Перегружена: > 80% ИЛИ много операций на критическом пути
            is_overloaded = (
                data['load_percent'] > 80 or 
                data['critical_ops'] >= 2 or
                (data['operations_count'] > 5 and data['load_percent'] > 60)
            )
            
            # Недогружена: < 50% И есть свободные места
            is_underloaded = (
                data['load_percent'] < 50 and 
                data['workers'] < data['max_capacity'] and
                data['workers'] > 0
            )
            
            # Бригада без рабочих, но с операциями - кандидат для передачи
            if data['workers'] == 0 and data['operations_count'] > 0:
                is_underloaded = True
            
            if is_overloaded:
                overloaded.append({
                    'id': b_id,
                    'name': brigade_dict[b_id]['name'],
                    'load': data['load_percent'],
                    'workers': data['workers'],
                    'max_capacity': data['max_capacity'],
                    'operations_count': data['operations_count'],
                    'critical_ops': data['critical_ops']
                })
            elif is_underloaded:
                underloaded.append({
                    'id': b_id,
                    'name': brigade_dict[b_id]['name'],
                    'load': data['load_percent'],
                    'workers': data['workers'],
                    'max_capacity': data['max_capacity'],
                    'operations_count': data['operations_count']
                })
        
        # Сортируем
        overloaded.sort(key=lambda x: -x['load'])
        underloaded.sort(key=lambda x: x['load'])
        
        print(f"[DEBUG] Overloaded: {overloaded}")
        print(f"[DEBUG] Underloaded: {underloaded}")
        
        # Генерация рекомендаций по перераспределению бригад
        recommendations = []
        affected_ops = []
        
        # Если нет недогруженных бригад, но есть перегруженные - ищем бригады с наименьшей загрузкой
        if not underloaded and overloaded:
            # Берем все бригады, кроме перегруженных, сортируем по загрузке
            available = []
            for b_id, data in brigade_load.items():
                if b_id not in [o['id'] for o in overloaded]:
                    available.append({
                        'id': b_id,
                        'name': brigade_dict[b_id]['name'],
                        'load': data['load_percent'],
                        'workers': data['workers'],
                        'max_capacity': data['max_capacity'],
                        'operations_count': data['operations_count']
                    })
            available.sort(key=lambda x: x['load'])
            underloaded = available[:2]  # Берем две самые свободные
        
        # Для каждой перегруженной бригады ищем недогруженную для передачи операций
        for over in overloaded:
            if not underloaded:
                break
                
            # Берем самую недогруженную бригаду
            under = underloaded[0]
            
            # Ищем операции в перегруженной бригаде, которые можно передать
            ops_to_move = []
            for op in brigade_operations.get(over['id'], []):
                op_num = op.get('op_number')
                # Не перемещаем операции на критическом пути
                if op_num not in critical_path:
                    # Не перемещаем операции со статусом 'completed' или 'blocked'
                    if op.get('status') not in ['completed', 'blocked']:
                        ops_to_move.append(op)
            
            # Берем до 3 операций для передачи
            ops_to_move = ops_to_move[:3]
            
            for op in ops_to_move:
                # Проверяем, что у бригады-приемника есть свободные места
                under_workers = brigade_worker_count.get(under['id'], 0)
                under_max = brigade_dict[under['id']].get('max_capacity', 10)
                
                # Если у приемника нет рабочих, но есть место - можно передавать
                if under_workers < under_max or under_workers == 0:
                    # Рассчитываем новую длительность с учетом эффективности бригады-приемника
                    current_duration = op.get('duration', 0)
                    labor_hours = op.get('labor_hours', 0)
                    people_count = op.get('people_count', 1)
                    
                    # Эффективность бригад
                    over_eff = brigade_dict.get(over['id'], {}).get('efficiency_rating', 1.0)
                    under_eff = brigade_dict.get(under['id'], {}).get('efficiency_rating', 1.0)
                    
                    # Новая длительность с учетом эффективности
                    if under_eff > 0 and over_eff > 0:
                        efficiency_ratio = over_eff / under_eff
                        new_duration = round(current_duration * efficiency_ratio, 2)
                    else:
                        new_duration = current_duration
                    
                    # Время сохранения
                    time_saved = round(current_duration - new_duration, 2)
                    
                    recommendations.append({
                        "type": "transfer_operation",
                        "operation_id": op.get('id'),
                        "op_number": op.get('op_number'),
                        "operation_name": op.get('name'),
                        "from_brigade_id": over['id'],
                        "from_brigade_name": over['name'],
                        "to_brigade_id": under['id'],
                        "to_brigade_name": under['name'],
                        "current_duration": current_duration,
                        "predicted_duration": new_duration,
                        "time_saved": time_saved,
                        "people_count": people_count,
                        "efficiency_gain": round((time_saved / current_duration * 100), 1) if current_duration > 0 else 0,
                        "priority": "HIGH" if op.get('op_number') in critical_path else "MEDIUM",
                        "reason": f"Бригада '{over['name']}' перегружена ({over['load']}%), бригада '{under['name']}' имеет свободные ресурсы ({under['load']}%)"
                    })
                    
                    affected_ops.append({
                        "op_number": op.get('op_number'),
                        "from_brigade": over['name'],
                        "to_brigade": under['name'],
                        "time_saved": time_saved
                    })
            
            # Если перегруженная бригада отдала операции, обновляем её нагрузку
            if len(ops_to_move) > 0:
                over['load'] = max(0, over['load'] - len(ops_to_move) * 10)
                if over['load'] < 80:
                    overloaded = [o for o in overloaded if o['id'] != over['id']]
        
        # Если нет рекомендаций по передаче операций, предлагаем другие варианты
        if not recommendations:
            # Проверяем, есть ли операции без бригад
            unassigned_ops = [op for op in ops if op.get('brigade_id') is None]
            
            if unassigned_ops:
                # Ищем бригады с свободными местами
                available_brigades = []
                for b_id, data in brigade_load.items():
                    if data['workers'] < data['max_capacity']:
                        available_brigades.append({
                            'id': b_id,
                            'name': brigade_dict[b_id]['name'],
                            'free_slots': data['max_capacity'] - data['workers'],
                            'load': data['load_percent']
                        })
                available_brigades.sort(key=lambda x: x['load'])
                
                for under in available_brigades[:3]:
                    if unassigned_ops:
                        op = unassigned_ops[0]
                        recommendations.append({
                            "type": "assign_operation",
                            "operation_id": op.get('id'),
                            "op_number": op.get('op_number'),
                            "operation_name": op.get('name'),
                            "to_brigade_id": under['id'],
                            "to_brigade_name": under['name'],
                            "current_duration": op.get('duration', 0),
                            "people_count": op.get('people_count', 1),
                            "priority": "HIGH" if op.get('op_number') in critical_path else "MEDIUM",
                            "reason": f"Операция не назначена на бригаду. Бригада '{under['name']}' имеет свободные ресурсы ({under['free_slots']} мест)"
                        })
                        unassigned_ops.pop(0)
            
            # Примечание: раньше здесь был запасной вариант "optimize_people",
            # предлагавший менять количество рабочих на операции. Это не входит
            # в допустимый вид оптимизации (перестановка бригад/операций с учётом
            # зависимостей), поэтому этот вариант убран. Если рекомендаций по
            # передаче операций между бригадами нет — значит текущее распределение
            # уже оптимально в рамках допустимых действий.
        
        # Формируем AI анализ
        ai_analysis = ""
        if recommendations:
            total_time_saved = sum(r.get('time_saved', 0) for r in recommendations if r.get('time_saved', 0) > 0)
            ai_analysis = f"Найдено {len(recommendations)} рекомендаций по оптимизации. "
            if total_time_saved > 0:
                ai_analysis += f"Потенциальная экономия времени: {total_time_saved:.2f} часов. "
            ai_analysis += "Рекомендуется перераспределить бригады для выравнивания нагрузки."
        else:
            ai_analysis = "Оптимизация не требуется. Текущее распределение бригад оптимально."
        
        return {
            "status": "success",
            "message": f"Проанализировано {len(ops)} активных операций",
            "critical_path_length": project_duration,
            "critical_path_operations": len(critical_path),
            "recommendations": recommendations[:10],
            "affected_operations": affected_ops,
            "brigade_load_analysis": brigade_load,
            "overloaded_brigades": overloaded,
            "underloaded_brigades": underloaded,
            "ai_analysis": ai_analysis,
            "summary": {
                "total_ops": len(ops),
                "critical_path_length": project_duration,
                "overloaded_brigades_count": len(overloaded),
                "underloaded_brigades_count": len(underloaded),
                "potential_time_saving": round(sum(r.get('time_saved', 0) for r in recommendations if r.get('time_saved', 0) > 0), 2),
                "recommendations_count": len(recommendations)
            }
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Ошибка оптимизации: {str(e)}")
@app.post("/ai/chat")
async def ai_chat(request: ChatRequest):
    """Спросить ИИ о чем угодно"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT name, current_load FROM brigades")
        brigade_info = [f"{r['name']} (загрузка {r['current_load']}%)" for r in cursor.fetchall()]
        conn.close()
        
        full_prompt = f"""
        Контекст производства: {', '.join(brigade_info)}.
        Вопрос пользователя: {request.message}
        """
        
        response = await OllamaAssistant.get_recommendation(full_prompt)
        return {"reply": response}
    except Exception as e:
        return {"reply": f"Извините, AI временно недоступен. Ошибка: {str(e)}", "fallback": True}

@app.post("/predict")
async def predict(data: Dict):
    labor = data.get("labor_hours", 0)
    people = data.get("people_count", 1)
    return {"predicted_duration": round(labor / people, 2) if people > 0 else 0}

@app.post("/train")
async def train():
    return {"status": "success", "samples_available": 10}


@app.post("/ai/sync-training-data")
async def sync_training_data():
    """Переносит operation_history в ai_training_data для ML-модели"""
    count = sync_operation_history_to_training()
    return {
        "status": "success",
        "synced_records": count,
        "message": f"Синхронизировано {count} записей для обучения"
    }

@app.post("/ai/scenarios/run-from-db")
async def run_scenario_from_db_endpoint(scenario: dict):
    """
    Запуск сценария на текущем плане из БД.
    Тело запроса: {"scenario": {"name": "...", "task_delays": {"T3": 6}, ...}}
    """
    from ai.scenario_simulator import ScenarioSimulator
    from api.ai_endpoints import BrigadeIn, ResourceIn, ScenarioRequest

    base_plan = build_ai_plan_from_db()
    sim = ScenarioSimulator()

    sc = scenario.get("scenario", {})
    scenario_dict = {
        "name": sc.get("name", "Сценарий из БД"),
        "description": sc.get("description"),
        "task_delays": sc.get("task_delays", {}),
        "disabled_brigades": sc.get("disabled_brigades", []),
        "duration_multipliers": sc.get("duration_multipliers", {}),
    }

    brigades = base_plan.get("brigades", [])

    result = sim.run_scenario(
        base_plan=base_plan,
        scenario=scenario_dict,
        brigades=brigades,
        resources=[]
    )

    # Опционально: красивый текст через Ollama
    try:
        delay = result.get("comparison", {}).get("delay_days", 0)
        prompt = (f"Производственный сценарий: {scenario_dict['name']}. "
                  f"Сдвиг срока: {delay} дней. Дай краткий вывод для руководителя.")
        ai_text = await OllamaAssistant.get_recommendation(prompt)
        result["ai_summary"] = ai_text
    except Exception:
        result["ai_summary"] = None

    return result
# ================================================================
# ИМПОРТ EXCEL
# ================================================================

@app.post("/import-excel")
async def import_excel(file: UploadFile = File(...)):
    """Import operations from Excel file with proper duration and relations"""
    print(f"[API] Received file: {file.filename}")
    
    try:
        contents = await file.read()
        filename = file.filename.lower()
        
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents), encoding='utf-8')
        elif filename.endswith('.xlsb'):
            try:
                df = pd.read_excel(io.BytesIO(contents), engine='pyxlsb')
            except ImportError:
                raise HTTPException(
                    status_code=500, 
                    detail="Missing optional dependency 'pyxlsb'. Run: pip install pyxlsb"
                )
        elif filename.endswith('.xls'):
            df = pd.read_excel(io.BytesIO(contents), engine='xlrd')
        else:
            df = pd.read_excel(io.BytesIO(contents), engine='openpyxl')
        
        print(f"[API] Read {len(df)} rows")
        print(f"[API] Columns: {list(df.columns)}")
        
        conn = get_db()
        cursor = conn.cursor()
        
        imported = 0
        updated = 0
        errors = []
        
        cursor.execute("SELECT op_number, id FROM operations")
        existing_ops = {row[0]: row[1] for row in cursor.fetchall()}
        
        temp_operations = []
        
        cursor.execute("SELECT id, name FROM brigades")
        brigade_map = {row['name'].lower(): row['id'] for row in cursor.fetchall()}
        
        for idx, row in df.iterrows():
            try:
                if all(pd.isna(row.iloc[i]) for i in range(min(len(row), 12))):
                    continue
                
                op_number = None
                for col in df.columns:
                    col_lower = str(col).lower()
                    if 'номер' in col_lower or 'операц' in col_lower or '№' in col_lower or 'op' in col_lower:
                        val = row[col]
                        if pd.notna(val):
                            try:
                                op_number = int(float(val))
                                break
                            except:
                                pass
                
                if not op_number:
                    errors.append(f"Row {idx + 2}: Не найден номер операции")
                    continue
                
                name = f"Операция {op_number}"
                for col in df.columns:
                    col_lower = str(col).lower()
                    if 'наименование' in col_lower or 'название' in col_lower or 'name' in col_lower:
                        val = row[col]
                        if pd.notna(val):
                            name = str(val).strip()
                            break
                
                labor_hours = 0
                for col in df.columns:
                    col_lower = str(col).lower()
                    if 'трудо' in col_lower or 'labor' in col_lower or 'часы' in col_lower:
                        val = row[col]
                        if pd.notna(val):
                            try:
                                labor_hours = float(str(val).replace(',', '.'))
                                break
                            except:
                                pass
                
                people_count = 1
                for col in df.columns:
                    col_lower = str(col).lower()
                    if 'человек' in col_lower or 'люди' in col_lower or 'people' in col_lower or 'кол-во' in col_lower:
                        val = row[col]
                        if pd.notna(val):
                            try:
                                people_count = max(1, int(float(val)))
                                break
                            except:
                                pass
                
                duration = 0
                for col in df.columns:
                    col_lower = str(col).lower()
                    if 'длительн' in col_lower or 'duration' in col_lower or 'время' in col_lower:
                        val = row[col]
                        if pd.notna(val):
                            try:
                                duration = float(str(val).replace(',', '.'))
                                break
                            except:
                                pass
                
                if duration == 0 and labor_hours > 0 and people_count > 0:
                    duration = round(labor_hours / people_count, 2)
                
                prev_ops = []
                for col in df.columns:
                    col_lower = str(col).lower()
                    if 'предшеств' in col_lower or 'prev' in col_lower or 'перед' in col_lower:
                        val = row[col]
                        if pd.notna(val):
                            prev_str = str(val).strip()
                            if prev_str and prev_str != '0':
                                prev_ops = parse_list(prev_str)
                            break
                
                next_ops = []
                for col in df.columns:
                    col_lower = str(col).lower()
                    if 'послед' in col_lower or 'next' in col_lower or 'после' in col_lower:
                        val = row[col]
                        if pd.notna(val):
                            next_str = str(val).strip()
                            if next_str:
                                next_ops = parse_list(next_str)
                            break
                
                drawing = ""
                for col in df.columns:
                    col_lower = str(col).lower()
                    if 'черт' in col_lower or 'draw' in col_lower:
                        val = row[col]
                        if pd.notna(val):
                            drawing = str(val).strip()
                            break
                
                location = ""
                for col in df.columns:
                    col_lower = str(col).lower()
                    if 'место' in col_lower or 'location' in col_lower:
                        val = row[col]
                        if pd.notna(val):
                            location = str(val).strip()
                            break
                
                brigade_id = None
                for col in df.columns:
                    col_lower = str(col).lower()
                    if 'бригад' in col_lower or 'brigade' in col_lower:
                        val = row[col]
                        if pd.notna(val):
                            brigade_name = str(val).strip().upper()
                            for b_name, b_id in brigade_map.items():
                                if brigade_name in b_name.upper() or b_name.upper() in brigade_name:
                                    brigade_id = b_id
                                    break
                            if not brigade_id:
                                try:
                                    brigade_id = int(float(val))
                                except:
                                    pass
                            break
                
                time_reserve = 0
                for col in df.columns:
                    col_lower = str(col).lower()
                    if 'резерв' in col_lower or 'reserve' in col_lower:
                        val = row[col]
                        if pd.notna(val):
                            try:
                                time_reserve = float(str(val).replace(',', '.'))
                                break
                            except:
                                pass
                
                post = None
                for col in df.columns:
                    col_lower = str(col).lower()
                    if 'пост' in col_lower:
                        val = row[col]
                        if pd.notna(val):
                            try:
                                post = int(float(val))
                                break
                            except:
                                pass
                
                status = 'pending'
                for col in df.columns:
                    col_lower = str(col).lower()
                    if 'статус' in col_lower or 'status' in col_lower:
                        val = str(row[col]).lower() if pd.notna(row[col]) else ''
                        if 'заверш' in val or 'completed' in val or 'готов' in val:
                            status = 'completed'
                        elif 'работ' in val or 'progress' in val or 'выполн' in val:
                            status = 'in_progress'
                        elif 'блок' in val or 'blocked' in val:
                            status = 'blocked'
                        break
                
                priority = 'medium'
                for col in df.columns:
                    col_lower = str(col).lower()
                    if 'приоритет' in col_lower or 'priority' in col_lower:
                        val = str(row[col]).lower() if pd.notna(row[col]) else ''
                        if 'критич' in val or 'critical' in val:
                            priority = 'critical'
                        elif 'высок' in val or 'high' in val:
                            priority = 'high'
                        elif 'низк' in val or 'low' in val:
                            priority = 'low'
                        break
                
                temp_operations.append({
                    'post': post,
                    'op_number': op_number,
                    'prev_ops': prev_ops,
                    'next_ops': next_ops,
                    'name': name,
                    'drawing': drawing,
                    'labor_hours': labor_hours,
                    'people_count': people_count,
                    'duration': duration,
                    'brigade_id': brigade_id,
                    'location': location,
                    'time_reserve': time_reserve,
                    'status': status,
                    'priority': priority
                })
                
            except Exception as e:
                errors.append(f"Row {idx + 2}: {str(e)}")
                print(f"[API] Error in row {idx + 2}: {e}")
        
        for op_data in temp_operations:
            try:
                op_number = op_data['op_number']
                
                cursor.execute("SELECT id FROM operations WHERE op_number = ?", (op_number,))
                existing = cursor.fetchone()
                
                if existing:
                    cursor.execute("""
                        UPDATE operations 
                        SET post = ?, prev_ops = ?, next_ops = ?, name = ?, drawing = ?,
                            labor_hours = ?, people_count = ?, duration = ?, brigade_id = ?,
                            location = ?, time_reserve = ?, status = ?, priority = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE op_number = ?
                    """, (
                        op_data['post'],
                        json.dumps(op_data['prev_ops']),
                        json.dumps(op_data['next_ops']),
                        op_data['name'],
                        op_data['drawing'],
                        op_data['labor_hours'],
                        op_data['people_count'],
                        op_data['duration'],
                        op_data['brigade_id'],
                        op_data['location'],
                        op_data['time_reserve'],
                        op_data['status'],
                        op_data['priority'],
                        op_number
                    ))
                    updated += 1
                else:
                    cursor.execute("""
                        INSERT INTO operations 
                        (post, op_number, prev_ops, next_ops, name, drawing, labor_hours, 
                         people_count, duration, brigade_id, location, time_reserve, status, priority)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        op_data['post'],
                        op_number,
                        json.dumps(op_data['prev_ops']),
                        json.dumps(op_data['next_ops']),
                        op_data['name'],
                        op_data['drawing'],
                        op_data['labor_hours'],
                        op_data['people_count'],
                        op_data['duration'],
                        op_data['brigade_id'],
                        op_data['location'],
                        op_data['time_reserve'],
                        op_data['status'],
                        op_data['priority']
                    ))
                    imported += 1
                    
            except Exception as e:
                errors.append(f"Save error for op {op_number}: {str(e)}")
                print(f"[API] Save error: {e}")
        
        conn.commit()
        conn.close()
        
        print(f"[API] Import complete: +{imported} new, ~{updated} updated")
        
        return {
            "status": "success",
            "imported": imported,
            "updated": updated,
            "total": imported + updated,
            "errors": errors[:10] if errors else []
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Import error: {str(e)}")

# ================================================================
# ЭКСПОРТ
# ================================================================

@app.get("/export-operations")
async def export_operations(format: str = "xlsx"):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM operations ORDER BY op_number")
    rows = cursor.fetchall()
    conn.close()
    
    data = []
    for row in rows:
        op = row_to_dict(row)
        data.append({
            "ID": op.get("id"),
            "Пост": op.get("post", ""),
            "Номер операции": op.get("op_number"),
            "Предшествующие": ", ".join(map(str, op.get("prev_ops", []))),
            "Последующие": ", ".join(map(str, op.get("next_ops", []))),
            "Название": op.get("name"),
            "Чертёж": op.get("drawing", ""),
            "Трудоёмкость": op.get("labor_hours"),
            "Кол-во человек": op.get("people_count"),
            "Длительность": op.get("duration"),
            "Бригада": op.get("brigade_id", ""),
            "Место": op.get("location", ""),
            "Резерв": op.get("time_reserve"),
            "Статус": op.get("status"),
            "Приоритет": op.get("priority")
        })
    
    df = pd.DataFrame(data)
    filename = f"operations_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{format}"
    filepath = EXPORTS_DIR / filename
    
    if format == "xlsx":
        df.to_excel(filepath, index=False)
        return FileResponse(filepath, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=filename)
    elif format == "csv":
        df.to_csv(filepath, index=False, encoding='utf-8-sig')
        return FileResponse(filepath, media_type="text/csv", filename=filename)
    else:
        raise HTTPException(status_code=400, detail="Неподдерживаемый формат")

# ================================================================
# ИМПОРТ CSV ЧЕРЕЗ API
# ================================================================

@app.post("/import-csv")
async def import_csv_api():
    """Импорт данных из CSV файла через API"""
    try:
        from db_unified import import_from_csv
        import_from_csv()
        return {
            "status": "success",
            "message": "Data imported successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/import-csv-direct")
async def import_csv_direct(file: UploadFile = File(...)):
    """Импорт CSV файла напрямую через загрузку"""
    try:
        contents = await file.read()
        csv_path = Path(__file__).parent / "data.csv"
        with open(csv_path, 'w', encoding='utf-8') as f:
            f.write(contents.decode('utf-8'))
        from db_unified import import_from_csv
        import_from_csv()
        return {
            "status": "success",
            "message": "Data imported successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
# ================================================================
# ОПТИМИЗАЦИЯ ОПЕРАЦИИ
# ================================================================

@app.post("/operations/{op_number}/optimize")
async def optimize_operation(op_number: int):
    """Получить рекомендации по оптимизации конкретной операции"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM operations WHERE op_number = ?", (op_number,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Операция не найдена")
    
    op = row_to_dict(row)
    
    cursor.execute("SELECT * FROM operations")
    all_rows = cursor.fetchall()
    conn.close()
    
    all_ops = [row_to_dict(r) for r in all_rows]
    cpm_data = calculate_cpm(all_ops)
    critical_path = cpm_data.get('critical_path', [])
    
    is_critical = op_number in critical_path
    
    recommendations = []
    
    current_people = op.get('people_count', 1)
    labor_hours = op.get('labor_hours', 0)
    current_duration = op.get('duration', 0)
    
    if current_people < 8 and labor_hours > 0:
        for new_people in range(current_people + 1, min(current_people + 4, 10)):
            new_duration = round(labor_hours / new_people, 2)
            time_saved = round(current_duration - new_duration, 2)
            if time_saved > 0:
                recommendations.append({
                    "type": "increase_people",
                    "current_people": current_people,
                    "recommended_people": new_people,
                    "current_duration": current_duration,
                    "predicted_duration": new_duration,
                    "time_saved": time_saved,
                    "efficiency_gain": round((time_saved / current_duration) * 100, 1) if current_duration > 0 else 0
                })
    
    next_ops = op.get('next_ops', [])
    if len(next_ops) > 1:
        recommendations.append({
            "type": "parallelize",
            "message": f"Операция имеет {len(next_ops)} последующих операций. Рассмотрите возможность параллельного выполнения.",
            "next_operations": next_ops
        })
    
    prev_ops = op.get('prev_ops', [])
    if len(prev_ops) > 1 and len(next_ops) > 1:
        recommendations.append({
            "type": "bottleneck",
            "message": "Операция является узким местом (много входов и выходов). Требуется особое внимание.",
            "incoming": len(prev_ops),
            "outgoing": len(next_ops)
        })
    
    return {
        "operation": {
            "op_number": op_number,
            "name": op['name'],
            "duration": current_duration,
            "people_count": current_people,
            "labor_hours": labor_hours,
            "is_critical": is_critical,
            "status": op.get('status', 'pending'),
            "brigade_id": op.get('brigade_id'),
            "time_reserve": op.get('time_reserve', 0)
        },
        "recommendations": recommendations,
        "cpm_context": {
            "project_duration": cpm_data.get('project_duration', 0),
            "critical_path_length": len(critical_path),
            "is_on_critical_path": is_critical
        }
    }

# ================================================================
# РАСПРЕДЕЛЕНИЕ ОПЕРАЦИЙ ПО БРИГАДАМ
# ================================================================

@app.get("/brigades/operations-distribution")
async def get_brigades_operations_distribution():
    """Получить распределение операций по бригадам"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT 
            b.id as brigade_id,
            b.name as brigade_name,
            COUNT(o.id) as total_ops,
            SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) as completed_ops,
            SUM(CASE WHEN o.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_ops,
            SUM(o.labor_hours) as total_labor_hours,
            SUM(o.duration) as total_duration,
            AVG(o.people_count) as avg_people
        FROM brigades b
        LEFT JOIN operations o ON b.id = o.brigade_id
        GROUP BY b.id
        ORDER BY total_ops DESC
    """)
    
    rows = cursor.fetchall()
    conn.close()
    
    result = []
    for row in rows:
        result.append({
            "brigade_id": row[0],
            "brigade_name": row[1],
            "total_ops": row[2] or 0,
            "completed_ops": row[3] or 0,
            "in_progress_ops": row[4] or 0,
            "total_labor_hours": round(row[5], 2) if row[5] else 0,
            "total_duration": round(row[6], 2) if row[6] else 0,
            "avg_people": round(row[7], 1) if row[7] else 0,
            "completion_rate": round((row[3] / row[2] * 100), 1) if row[2] > 0 else 0
        })
    
    return result
# ================================================================
# ТЕСТОВЫЕ ДАННЫЕ
# ================================================================

@app.post("/seed-test-data")
async def seed_test_data():
    """Создать тестовые данные для демонстрации оптимизации"""
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        # Очищаем старые данные (кроме админа)
        cursor.execute("DELETE FROM operations")
        cursor.execute("DELETE FROM brigade_tasks")
        cursor.execute("DELETE FROM brigade_schedule")
        cursor.execute("DELETE FROM brigade_group_members")
        cursor.execute("DELETE FROM brigade_groups")
        cursor.execute("DELETE FROM workers WHERE id != 0")
        cursor.execute("DELETE FROM brigades")
        cursor.execute("DELETE FROM sqlite_sequence WHERE name='brigades'")
        cursor.execute("DELETE FROM sqlite_sequence WHERE name='workers'")
        cursor.execute("DELETE FROM sqlite_sequence WHERE name='operations'")
        
        # Создаем бригады
        brigades_data = [
            {"id": 1, "name": "Бригада ТБ", "description": "Техническая бригада", "max_capacity": 8, "efficiency_rating": 0.9, "importance": "high"},
            {"id": 2, "name": "Бригада МР", "description": "Монтажная бригада", "max_capacity": 10, "efficiency_rating": 1.1, "importance": "high"},
            {"id": 3, "name": "Бригада КШ", "description": "Кабельная бригада", "max_capacity": 6, "efficiency_rating": 0.85, "importance": "medium"},
            {"id": 4, "name": "Бригада ОТК", "description": "Отдел технического контроля", "max_capacity": 4, "efficiency_rating": 0.95, "importance": "critical"},
            {"id": 5, "name": "Бригада ПНЕВМ", "description": "Пневматическая бригада", "max_capacity": 5, "efficiency_rating": 0.8, "importance": "medium"},
        ]
        
        for b in brigades_data:
            cursor.execute("""
                INSERT INTO brigades (id, name, description, max_capacity, efficiency_rating, importance)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (b["id"], b["name"], b["description"], b["max_capacity"], b["efficiency_rating"], b["importance"]))
        
        # Создаем рабочих
        workers_data = [
            # Бригада ТБ (8 рабочих - перегружена)
            {"name": "Иванов И.И.", "brigade_id": 1, "login": "ivanov", "is_brigadier": 1},
            {"name": "Петров П.П.", "brigade_id": 1, "login": "petrov"},
            {"name": "Сидоров С.С.", "brigade_id": 1, "login": "sidorov"},
            {"name": "Козлов К.К.", "brigade_id": 1, "login": "kozlov"},
            {"name": "Смирнов С.С.", "brigade_id": 1, "login": "smirnov"},
            {"name": "Михайлов М.М.", "brigade_id": 1, "login": "mihailov"},
            {"name": "Федоров Ф.Ф.", "brigade_id": 1, "login": "fedorov"},
            {"name": "Николаев Н.Н.", "brigade_id": 1, "login": "nikolaev"},
            
            # Бригада МР (6 рабочих - нормальная)
            {"name": "Алексеев А.А.", "brigade_id": 2, "login": "alekseev", "is_brigadier": 1},
            {"name": "Егоров Е.Е.", "brigade_id": 2, "login": "egorov"},
            {"name": "Павлов П.П.", "brigade_id": 2, "login": "pavlov"},
            {"name": "Кузьмин К.К.", "brigade_id": 2, "login": "kuzmin"},
            {"name": "Григорьев Г.Г.", "brigade_id": 2, "login": "grigoriev"},
            {"name": "Орлов О.О.", "brigade_id": 2, "login": "orlov"},
            
            # Бригада КШ (2 рабочих - недогружена)
            {"name": "Сергеев С.С.", "brigade_id": 3, "login": "sergeev", "is_brigadier": 1},
            {"name": "Андреев А.А.", "brigade_id": 3, "login": "andreev"},
            
            # Бригада ОТК (3 рабочих)
            {"name": "Борисов Б.Б.", "brigade_id": 4, "login": "borisov", "is_brigadier": 1},
            {"name": "Тимофеев Т.Т.", "brigade_id": 4, "login": "timofeev"},
            {"name": "Васильев В.В.", "brigade_id": 4, "login": "vasilev"},
        ]
        
        worker_id = 1
        for w in workers_data:
            cursor.execute("""
                INSERT INTO workers (id, name, position, role, brigade_id, skills, status, login, password, is_brigadier)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                worker_id,
                w["name"],
                "Рабочий",
                "worker",
                w["brigade_id"],
                "[]",
                "online",
                w["login"],
                "123456",
                w.get("is_brigadier", 0)
            ))
            worker_id += 1
        
        # Создаем операции с правильными связями
        operations_data = [
            # Пост 1 - Бригада ТБ (перегружена, много операций)
            {"post": 1, "op_number": 1, "name": "Демонтаж крышевых люков", "prev_ops": [], "next_ops": [2, 7, 11, 12, 18], "labor_hours": 1.8, "people_count": 2, "duration": 0.9, "brigade_id": 1, "time_reserve": 0, "status": "in_progress", "priority": "critical"},
            {"post": 1, "op_number": 2, "name": "Изолировка по полу", "prev_ops": [1], "next_ops": [3, 14, 15], "labor_hours": 3.2, "people_count": 4, "duration": 0.8, "brigade_id": 1, "time_reserve": 4.09, "status": "in_progress", "priority": "high"},
            {"post": 1, "op_number": 3, "name": "Изолировка глухого коридора", "prev_ops": [2], "next_ops": [6], "labor_hours": 6.5, "people_count": 4, "duration": 1.625, "brigade_id": 1, "time_reserve": 9.415, "status": "pending", "priority": "medium"},
            {"post": 1, "op_number": 7, "name": "Установка реакторов РС-19", "prev_ops": [1], "next_ops": [8], "labor_hours": 0.49, "people_count": 1, "duration": 0.49, "brigade_id": 1, "time_reserve": 0, "status": "pending", "priority": "critical"},
            {"post": 1, "op_number": 8, "name": "Установка ИШ ВВК1", "prev_ops": [7], "next_ops": [9], "labor_hours": 1.475, "people_count": 1, "duration": 1.475, "brigade_id": 1, "time_reserve": 0, "status": "pending", "priority": "high"},
            {"post": 1, "op_number": 9, "name": "Установка ИШ ВВК2", "prev_ops": [8], "next_ops": [10], "labor_hours": 1.475, "people_count": 1, "duration": 1.475, "brigade_id": 1, "time_reserve": 0, "status": "pending", "priority": "high"},
            {"post": 1, "op_number": 10, "name": "Установка монтажных люлек", "prev_ops": [9], "next_ops": [20], "labor_hours": 0.5, "people_count": 1, "duration": 0.5, "brigade_id": 1, "time_reserve": 0, "status": "pending", "priority": "medium"},
            {"post": 1, "op_number": 11, "name": "Установка кондуитов", "prev_ops": [1], "next_ops": [35], "labor_hours": 0.5, "people_count": 1, "duration": 0.5, "brigade_id": 1, "time_reserve": 13.04, "status": "pending", "priority": "medium"},
            
            # Пост 2 - Бригада МР (нормальная нагрузка)
            {"post": 2, "op_number": 14, "name": "Прокладка проводов по полу В/В", "prev_ops": [2], "next_ops": [16], "labor_hours": 2.0, "people_count": 1, "duration": 2.0, "brigade_id": 2, "time_reserve": 4.09, "status": "in_progress", "priority": "medium"},
            {"post": 2, "op_number": 15, "name": "Прокладка проводов по полу Н/В", "prev_ops": [2], "next_ops": [17], "labor_hours": 2.0, "people_count": 1, "duration": 2.0, "brigade_id": 2, "time_reserve": 10.49, "status": "in_progress", "priority": "medium"},
            {"post": 2, "op_number": 16, "name": "Крепление проводов по полу В/В", "prev_ops": [14], "next_ops": [25], "labor_hours": 1.0, "people_count": 1, "duration": 1.0, "brigade_id": 2, "time_reserve": 4.09, "status": "pending", "priority": "low"},
            {"post": 2, "op_number": 17, "name": "Крепление проводов по полу Н/В", "prev_ops": [15], "next_ops": [30], "labor_hours": 1.0, "people_count": 1, "duration": 1.0, "brigade_id": 2, "time_reserve": 10.49, "status": "pending", "priority": "low"},
            {"post": 2, "op_number": 20, "name": "Установка ВУВ", "prev_ops": [10], "next_ops": [21], "labor_hours": 2.1, "people_count": 1, "duration": 2.1, "brigade_id": 2, "time_reserve": 0, "status": "pending", "priority": "high"},
            
            # Пост 3 - Бригада КШ (недогружена)
            {"post": 3, "op_number": 43, "name": "Зачистка и подготовка кабины", "prev_ops": [], "next_ops": [44], "labor_hours": 1.6, "people_count": 1, "duration": 1.6, "brigade_id": 3, "time_reserve": 0, "status": "pending", "priority": "high"},
            {"post": 3, "op_number": 44, "name": "Установка кабины", "prev_ops": [43], "next_ops": [45], "labor_hours": 3.25, "people_count": 2, "duration": 1.625, "brigade_id": 3, "time_reserve": 0, "status": "pending", "priority": "critical"},
            {"post": 3, "op_number": 45, "name": "Герметизация", "prev_ops": [44], "next_ops": [], "labor_hours": 2.75, "people_count": 2, "duration": 1.375, "brigade_id": 3, "time_reserve": 0, "status": "pending", "priority": "high"},
            {"post": 3, "op_number": 48, "name": "Раскладка ответвлений", "prev_ops": [47], "next_ops": [89, 91, 93, 111], "labor_hours": 2.4, "people_count": 4, "duration": 0.6, "brigade_id": 3, "time_reserve": 0, "status": "pending", "priority": "medium"},
            
            # Пост 4 - Бригада ОТК (контроль)
            {"post": 4, "op_number": 184, "name": "Установка окон", "prev_ops": [], "next_ops": [235], "labor_hours": 2.0, "people_count": 1, "duration": 2.0, "brigade_id": 4, "time_reserve": 0, "status": "pending", "priority": "medium"},
            {"post": 4, "op_number": 235, "name": "Установка знаков", "prev_ops": [184], "next_ops": [], "labor_hours": 1.5, "people_count": 1, "duration": 1.5, "brigade_id": 4, "time_reserve": 0, "status": "pending", "priority": "low"},
            {"post": 4, "op_number": 193, "name": "Монтаж клапанов сигналов 1 конец", "prev_ops": [], "next_ops": [198, 194], "labor_hours": 2.35, "people_count": 1, "duration": 2.35, "brigade_id": 4, "time_reserve": 0, "status": "pending", "priority": "medium"},
            
            # Пост 5 - Бригада ПНЕВМ
            {"post": 5, "op_number": 238, "name": "Опрессовка соединения труб", "prev_ops": [], "next_ops": [239], "labor_hours": 1.1, "people_count": 2, "duration": 0.55, "brigade_id": 5, "time_reserve": 0, "status": "in_progress", "priority": "high"},
            {"post": 5, "op_number": 239, "name": "Опрессовка соединения труб по кузову", "prev_ops": [238], "next_ops": [240], "labor_hours": 1.2, "people_count": 2, "duration": 0.6, "brigade_id": 5, "time_reserve": 0, "status": "pending", "priority": "medium"},
            {"post": 5, "op_number": 240, "name": "Опрессовка соединения труб на БПО", "prev_ops": [239], "next_ops": [241], "labor_hours": 0.89, "people_count": 2, "duration": 0.445, "brigade_id": 5, "time_reserve": 0, "status": "pending", "priority": "low"},
        ]
        
        for op in operations_data:
            cursor.execute("""
                INSERT INTO operations 
                (post, op_number, prev_ops, next_ops, name, labor_hours, people_count, duration, 
                 brigade_id, time_reserve, status, priority)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                op["post"],
                op["op_number"],
                json.dumps(op["prev_ops"]),
                json.dumps(op["next_ops"]),
                op["name"],
                op["labor_hours"],
                op["people_count"],
                op["duration"],
                op["brigade_id"],
                op["time_reserve"],
                op["status"],
                op["priority"]
            ))
        
        # Обновляем загрузку бригад
        for b in brigades_data:
            cursor.execute("""
                UPDATE brigades 
                SET current_load = (
                    SELECT COUNT(*) * 10 FROM operations WHERE brigade_id = ? AND status != 'completed'
                )
                WHERE id = ?
            """, (b["id"], b["id"]))

                # Автозаполнение ai_training_data для демо
        demo_training = []
        cursor.execute("SELECT id, labor_hours, people_count, duration, time_reserve FROM operations")
        for row in cursor.fetchall():
            planned = row['labor_hours'] / row['people_count'] if row['people_count'] else 1
            actual = row['duration'] or planned * (1 + (hash(row['id']) % 20) / 100)
            demo_training.append({
                "operation_id": row['id'],
                "labor_hours": row['labor_hours'],
                "people_count": row['people_count'],
                "brigade_load": 50,
                "time_reserve": row['time_reserve'],
                "actual_duration": round(actual, 2),
                "efficiency": 0.9
            })
        for dt in demo_training:
            cursor.execute("""
                INSERT OR IGNORE INTO ai_training_data 
                (operation_id, labor_hours, people_count, brigade_load, time_reserve, actual_duration, efficiency)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (dt['operation_id'], dt['labor_hours'], dt['people_count'],
                  dt['brigade_load'], dt['time_reserve'], dt['actual_duration'], dt['efficiency']))
        

        sync_operation_history_to_training()
        conn.commit()
        conn.close()

        
        
        return {
            "status": "success",
            "message": "Тестовые данные созданы успешно!",
            "brigades": len(brigades_data),
            "workers": len(workers_data),
            "operations": len(operations_data),
            "recommendation": "Теперь запустите POST /optimize для получения рекомендаций"
        }
        
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Ошибка создания тестовых данных: {str(e)}")


# ================================================================
# ЗАПУСК
# ================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
