"""
============================================================
MANUFACTURING OPTIMIZER - КОНФИГУРАЦИЯ
============================================================
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Загрузка .env файла
load_dotenv()

# Базовые пути
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR.parent / "data"
MODELS_DIR = BASE_DIR / "models_storage"
LOGS_DIR = BASE_DIR / "logs"

# Создание директорий
for dir_path in [DATA_DIR, MODELS_DIR, LOGS_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)

# Настройки API
API_HOST = os.getenv("API_HOST", "127.0.0.1")
API_PORT = int(os.getenv("API_PORT", 8000))
DEBUG = os.getenv("DEBUG", "true").lower() == "true"

# Настройки AI
AI_CONFIG = {
    "model_type": os.getenv("MODEL_TYPE", "gradient_boosting"),
    "default_efficiency_threshold": float(os.getenv("DEFAULT_EFFICIENCY_THRESHOLD", 0.75)),
    "max_workers_per_brigade": int(os.getenv("MAX_WORKERS_PER_BRIGADE", 11)),
    "model_path": MODELS_DIR / "gradient_boosting" / "production_model.pkl",
    "scaler_path": MODELS_DIR / "gradient_boosting" / "scaler.pkl"
}

# Настройки CORS
CORS_CONFIG = {
    "allow_origins": ["*"],
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"]
}

# Лимиты
LIMITS = {
    "max_people_per_brigade": 11,
    "min_people_per_operation": 1,
    "max_brigades": 10,
    "max_file_size": 10 * 1024 * 1024  # 10 MB
}

# Статусы операций
OPERATION_STATUS = {
    "PENDING": "pending",
    "IN_PROGRESS": "in_progress",
    "COMPLETED": "completed",
    "BLOCKED": "blocked",
    "CANCELLED": "cancelled"
}

# Роли пользователей
USER_ROLES = {
    "ADMIN": "admin",
    "WORKER": "worker",
    "BRIGADIER": "brigadier",
    "SUPERVISOR": "supervisor"
}