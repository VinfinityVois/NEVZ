"""
============================================================
MANUFACTURING OPTIMIZER - PYDANTIC СХЕМЫ
============================================================
"""

from pydantic import BaseModel, Field, validator
from typing import List, Optional, Any, Dict
from datetime import datetime
from enum import Enum

class OperationStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    BLOCKED = "blocked"
    CANCELLED = "cancelled"

class UserRole(str, Enum):
    ADMIN = "admin"
    WORKER = "worker"
    BRIGADIER = "brigadier"
    SUPERVISOR = "supervisor"

class WorkerStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    BUSY = "busy"
    AWAY = "away"

# ===== ОПЕРАЦИИ =====

class OperationBase(BaseModel):
    post: Optional[int] = None
    op_number: int
    name: str
    drawing: Optional[str] = ""
    labor_hours: float = 0.0
    people_count: int = Field(1, ge=1, le=11)
    duration: float = 0.0
    brigade_id: Optional[int] = None
    location: Optional[str] = ""
    time_reserve: float = 0.0

class OperationCreate(OperationBase):
    prev_ops: List[int] = []
    next_ops: List[int] = []
    status: OperationStatus = OperationStatus.PENDING

class OperationUpdate(BaseModel):
    post: Optional[int] = None
    name: Optional[str] = None
    labor_hours: Optional[float] = None
    people_count: Optional[int] = Field(None, ge=1, le=11)
    duration: Optional[float] = None
    brigade_id: Optional[int] = None
    location: Optional[str] = None
    time_reserve: Optional[float] = None
    status: Optional[OperationStatus] = None
    prev_ops: Optional[List[int]] = None
    next_ops: Optional[List[int]] = None

class OperationResponse(OperationBase):
    id: int
    prev_ops: List[int] = []
    next_ops: List[int] = []
    status: OperationStatus
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ===== БРИГАДЫ =====

class BrigadeBase(BaseModel):
    name: str
    max_capacity: int = Field(10, ge=1, le=20)
    efficiency_rating: float = Field(1.0, ge=0.0, le=2.0)

class BrigadeCreate(BrigadeBase):
    pass

class BrigadeUpdate(BaseModel):
    name: Optional[str] = None
    max_capacity: Optional[int] = Field(None, ge=1, le=20)
    efficiency_rating: Optional[float] = Field(None, ge=0.0, le=2.0)

class BrigadeResponse(BrigadeBase):
    id: int
    current_load: float = 0.0
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ===== РАБОЧИЕ =====

class WorkerBase(BaseModel):
    name: str
    role: UserRole = UserRole.WORKER
    brigade_id: Optional[int] = None
    skills: List[str] = []

class WorkerCreate(WorkerBase):
    login: str
    password: str

class WorkerUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[UserRole] = None
    brigade_id: Optional[int] = None
    skills: Optional[List[str]] = None
    status: Optional[WorkerStatus] = None

class WorkerResponse(WorkerBase):
    id: int
    status: WorkerStatus = WorkerStatus.OFFLINE
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class WorkerLogin(BaseModel):
    login: str
    password: str

# ===== AI =====

class OptimizationRequest(BaseModel):
    operations: List[Dict[str, Any]]
    available_workers: int = Field(50, ge=1, le=100)
    target_efficiency: float = Field(0.8, ge=0.5, le=0.95)

class PredictionRequest(BaseModel):
    labor_hours: float
    people_count: int = Field(1, ge=1, le=11)
    brigade_load: float = 50.0
    time_reserve: float = 0.0

class TrainingData(BaseModel):
    labor_hours: float
    people_count: int
    brigade_load: float
    time_reserve: float
    actual_duration: float

class TrainingRequest(BaseModel):
    data: List[TrainingData]

# ===== CPM =====

class CPMRequest(BaseModel):
    operations: List[Dict[str, Any]]

# ===== ИМПОРТ/ЭКСПОРТ =====

class ImportExcelRequest(BaseModel):
    filename: str
    data: str  # base64

class ExportReportRequest(BaseModel):
    format: str = "xlsx"
    data: Dict[str, Any]