"""
============================================================
MANUFACTURING OPTIMIZER - МОДУЛЬ БАЗЫ ДАННЫХ
============================================================
"""

import sqlite3
import json
from pathlib import Path
from typing import List, Dict, Optional, Any
from datetime import datetime

class Database:
    _instance = None
    _connection = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._connection is None:
            self.db_path = Path(__file__).parent.parent.parent / "data" / "manufacturing.db"
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            self._init_database()
    
    def _init_database(self):
        """Инициализация базы данных"""
        self._connection = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._create_tables()
    
    def _create_tables(self):
        """Создание таблиц"""
        cursor = self._connection.cursor()
        
        # Таблица операций
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS operations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post INTEGER,
                op_number INTEGER UNIQUE,
                prev_ops TEXT,
                next_ops TEXT,
                name TEXT,
                drawing TEXT,
                labor_hours REAL,
                people_count INTEGER,
                duration REAL,
                brigade_id INTEGER,
                location TEXT,
                time_reserve REAL,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Таблица бригад
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS brigades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                current_load REAL DEFAULT 0,
                max_capacity INTEGER DEFAULT 10,
                efficiency_rating REAL DEFAULT 1.0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Таблица рабочих
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS workers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                role TEXT DEFAULT 'worker',
                brigade_id INTEGER,
                skills TEXT,
                status TEXT DEFAULT 'offline',
                login TEXT UNIQUE,
                password TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (brigade_id) REFERENCES brigades(id)
            )
        ''')
        
        # Таблица истории выполнения
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS operation_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operation_id INTEGER,
                worker_id INTEGER,
                actual_duration REAL,
                actual_people INTEGER,
                efficiency REAL,
                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (operation_id) REFERENCES operations(id),
                FOREIGN KEY (worker_id) REFERENCES workers(id)
            )
        ''')
        
        # Таблица для обучения AI
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS ai_training_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                labor_hours REAL,
                people_count INTEGER,
                brigade_load REAL,
                time_reserve REAL,
                actual_duration REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        self._connection.commit()
    
    def execute(self, query: str, params: tuple = ()) -> sqlite3.Cursor:
        """Выполнение запроса"""
        cursor = self._connection.cursor()
        cursor.execute(query, params)
        self._connection.commit()
        return cursor
    
    def fetch_one(self, query: str, params: tuple = ()) -> Optional[Dict]:
        """Получение одной записи"""
        cursor = self._connection.cursor()
        cursor.execute(query, params)
        row = cursor.fetchone()
        return dict(row) if row else None
    
    def fetch_all(self, query: str, params: tuple = ()) -> List[Dict]:
        """Получение всех записей"""
        cursor = self._connection.cursor()
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]
    
    # ===== ОПЕРАЦИИ =====
    
    def get_operations(self) -> List[Dict]:
        return self.fetch_all("SELECT * FROM operations ORDER BY op_number")
    
    def get_operation(self, op_id: int) -> Optional[Dict]:
        return self.fetch_one("SELECT * FROM operations WHERE id = ?", (op_id,))
    
    def create_operation(self, data: Dict) -> int:
        cursor = self.execute(
            """INSERT INTO operations 
               (post, op_number, prev_ops, next_ops, name, drawing, labor_hours, 
                people_count, duration, brigade_id, location, time_reserve, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (data.get('post'), data.get('op_number'), 
             json.dumps(data.get('prev_ops', [])), json.dumps(data.get('next_ops', [])),
             data.get('name'), data.get('drawing'), data.get('labor_hours'),
             data.get('people_count'), data.get('duration'), data.get('brigade_id'),
             data.get('location'), data.get('time_reserve'), data.get('status', 'pending'))
        )
        return cursor.lastrowid
    
    def update_operation(self, op_id: int, data: Dict) -> bool:
        fields = []
        params = []
        for key, value in data.items():
            if key in ['prev_ops', 'next_ops']:
                fields.append(f"{key} = ?")
                params.append(json.dumps(value))
            else:
                fields.append(f"{key} = ?")
                params.append(value)
        params.append(op_id)
        
        query = f"UPDATE operations SET {', '.join(fields)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        self.execute(query, tuple(params))
        return True
    
    def delete_operation(self, op_id: int) -> bool:
        self.execute("DELETE FROM operations WHERE id = ?", (op_id,))
        return True
    
    # ===== БРИГАДЫ =====
    
    def get_brigades(self) -> List[Dict]:
        return self.fetch_all("SELECT * FROM brigades ORDER BY id")
    
    def create_brigade(self, data: Dict) -> int:
        cursor = self.execute(
            "INSERT INTO brigades (name, max_capacity, efficiency_rating) VALUES (?, ?, ?)",
            (data.get('name'), data.get('max_capacity', 10), data.get('efficiency_rating', 1.0))
        )
        return cursor.lastrowid
    
    # ===== РАБОЧИЕ =====
    
    def get_workers(self, brigade_id: Optional[int] = None) -> List[Dict]:
        if brigade_id:
            return self.fetch_all("SELECT * FROM workers WHERE brigade_id = ?", (brigade_id,))
        return self.fetch_all("SELECT * FROM workers ORDER BY id")
    
    def get_worker_by_login(self, login: str) -> Optional[Dict]:
        return self.fetch_one("SELECT * FROM workers WHERE login = ?", (login,))
    
    def create_worker(self, data: Dict) -> int:
        cursor = self.execute(
            """INSERT INTO workers (name, role, brigade_id, skills, login, password)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (data.get('name'), data.get('role', 'worker'), data.get('brigade_id'),
             json.dumps(data.get('skills', [])), data.get('login'), data.get('password'))
        )
        return cursor.lastrowid
    
    # ===== ИСТОРИЯ =====
    
    def add_history(self, data: Dict) -> int:
        cursor = self.execute(
            """INSERT INTO operation_history 
               (operation_id, worker_id, actual_duration, actual_people, efficiency)
               VALUES (?, ?, ?, ?, ?)""",
            (data.get('operation_id'), data.get('worker_id'), 
             data.get('actual_duration'), data.get('actual_people'), data.get('efficiency'))
        )
        return cursor.lastrowid
    
    def get_training_data(self) -> List[Dict]:
        return self.fetch_all("SELECT * FROM ai_training_data ORDER BY created_at DESC LIMIT 1000")
    
    def add_training_data(self, data: Dict) -> int:
        cursor = self.execute(
            """INSERT INTO ai_training_data 
               (labor_hours, people_count, brigade_load, time_reserve, actual_duration)
               VALUES (?, ?, ?, ?, ?)""",
            (data.get('labor_hours'), data.get('people_count'), 
             data.get('brigade_load'), data.get('time_reserve'), data.get('actual_duration'))
        )
        return cursor.lastrowid

# Синглтон базы данных
db = Database()