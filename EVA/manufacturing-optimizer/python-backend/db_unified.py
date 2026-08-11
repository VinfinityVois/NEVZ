#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
db_unified.py
=============
Единый скрипт для работы с manufacturing.db.
Заменяет: migrate_all.py, migrate_brigades.py, migrate_dates.py,
          migrate_schedule.py, migrate_tasks.py, add_end_date.py,
          create_tasks_table.py, import_from_csv.py, generate_test_data.py

Использование:
    python db_unified.py init          # создать/пересоздать БД с нуля + seed
    python db_unified.py migrate       # мигрировать существующую БД
    python db_unified.py seed          # наполнить базовыми данными
    python db_unified.py import-csv    # импорт из data.csv
    python db_unified.py generate      # сгенерировать 500 бригад/1000 рабочих/500 операций
    python db_unified.py clear         # очистить все таблицы
"""

import os
import sys
import sqlite3
import csv
import json
import random
import argparse
from datetime import datetime, timedelta
from pathlib import Path

# Настройка кодировки для Windows
# Настройка кодировки для Windows
if sys.platform == 'win32':
    import codecs
    try:
        if hasattr(sys.stdout, 'buffer'):
            sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
        if hasattr(sys.stderr, 'buffer'):
            sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')
    except (AttributeError, TypeError):
        pass  # stdout уже обёрнут или перенаправлен
# ================================================================
# ПУТИ
# ================================================================
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR.parent / "data"
DB_PATH = DATA_DIR / "manufacturing.db"
CSV_PATH = BASE_DIR / "data.csv"

DATA_DIR.mkdir(parents=True, exist_ok=True)

# ================================================================
# УТИЛИТЫ
# ================================================================
def get_db():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def column_exists(cursor, table, column):
    cursor.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cursor.fetchall())

def table_exists(cursor, table):
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
    return cursor.fetchone() is not None

# ================================================================
# ПОЛНАЯ СХЕМА (объединение api.py + всех миграций)
# ================================================================
SQL_CREATE_TABLES = {
    "brigades": '''
        CREATE TABLE IF NOT EXISTS brigades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            current_load REAL DEFAULT 0,
            max_capacity INTEGER DEFAULT 10,
            efficiency_rating REAL DEFAULT 1.0,
            importance TEXT DEFAULT 'medium',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''',
    "workers": '''
        CREATE TABLE IF NOT EXISTS workers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            position TEXT DEFAULT 'Рабочий',
            role TEXT DEFAULT 'worker',
            brigade_id INTEGER,
            skills TEXT DEFAULT '[]',
            status TEXT DEFAULT 'offline',
            login TEXT UNIQUE,
            password TEXT,
            is_brigadier INTEGER DEFAULT 0,
            phone TEXT,
            email TEXT,
            hire_date DATE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (brigade_id) REFERENCES brigades(id) ON DELETE SET NULL
        )
    ''',
    "operations": '''
        CREATE TABLE IF NOT EXISTS operations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post INTEGER,
            op_number INTEGER UNIQUE NOT NULL,
            prev_ops TEXT DEFAULT '[]',
            next_ops TEXT DEFAULT '[]',
            name TEXT NOT NULL,
            drawing TEXT DEFAULT '',
            labor_hours REAL DEFAULT 0,
            people_count INTEGER DEFAULT 1,
            duration REAL DEFAULT 0,
            brigade_id INTEGER,
            location TEXT DEFAULT '',
            time_reserve REAL DEFAULT 0,
            status TEXT DEFAULT 'pending',
            priority TEXT DEFAULT 'medium',
            start_date DATE,
            end_date DATE,
            actual_start DATE,
            actual_end DATE,
            assigned_workers TEXT DEFAULT '[]',
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (brigade_id) REFERENCES brigades(id) ON DELETE SET NULL
        )
    ''',
    "operation_history": '''
        CREATE TABLE IF NOT EXISTS operation_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operation_id INTEGER NOT NULL,
            worker_id INTEGER,
            action TEXT NOT NULL,
            actual_duration REAL,
            actual_people INTEGER,
            efficiency REAL,
            comment TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE CASCADE,
            FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE SET NULL
        )
    ''',
        "ai_training_data": '''
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE CASCADE
        )
    ''',
    "brigade_tasks": '''
        CREATE TABLE IF NOT EXISTS brigade_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brigade_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            priority TEXT DEFAULT 'medium',
            status TEXT DEFAULT 'pending',
            task_type TEXT DEFAULT 'main',
            assigned_worker_id INTEGER,
            due_date DATE,
            estimated_hours REAL DEFAULT 0,
            actual_hours REAL DEFAULT 0,
            completed_at TIMESTAMP,
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (brigade_id) REFERENCES brigades(id) ON DELETE CASCADE,
            FOREIGN KEY (assigned_worker_id) REFERENCES workers(id) ON DELETE SET NULL,
            FOREIGN KEY (created_by) REFERENCES workers(id) ON DELETE SET NULL
        )
    ''',
    "brigade_schedule": '''
        CREATE TABLE IF NOT EXISTS brigade_schedule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brigade_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            scheduled_date DATE NOT NULL,
            due_date DATE,
            priority TEXT DEFAULT 'medium',
            priority_order INTEGER DEFAULT 3,
            status TEXT DEFAULT 'pending',
            assigned_worker_id INTEGER,
            estimated_hours REAL DEFAULT 0,
            actual_hours REAL DEFAULT 0,
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (brigade_id) REFERENCES brigades(id) ON DELETE CASCADE,
            FOREIGN KEY (assigned_worker_id) REFERENCES workers(id) ON DELETE SET NULL
        )
    ''',
    "brigade_groups": '''
        CREATE TABLE IF NOT EXISTS brigade_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''',
    "brigade_group_members": '''
        CREATE TABLE IF NOT EXISTS brigade_group_members (
            group_id INTEGER,
            brigade_id INTEGER,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (group_id, brigade_id),
            FOREIGN KEY (group_id) REFERENCES brigade_groups(id) ON DELETE CASCADE,
            FOREIGN KEY (brigade_id) REFERENCES brigades(id) ON DELETE CASCADE
        )
    '''
}

# ================================================================
# 1. ИНИЦИАЛИЗАЦИЯ С НУЛЯ
# ================================================================
def init_db():
    """Создаёт БД с полной схемой (удаляет и пересоздает manufacturing.db)"""
    if DB_PATH.exists():
        DB_PATH.unlink()
        print(f"[OK] Удалена старая БД: {DB_PATH}")

    conn = get_db()
    cursor = conn.cursor()

    for name, sql in SQL_CREATE_TABLES.items():
        cursor.execute(sql)
        print(f"  [CREATE] {name}")

    conn.commit()
    conn.close()
    print("[OK] База данных инициализирована")

# ================================================================
# 2. МИГРАЦИЯ СУЩЕСТВУЮЩЕЙ БД
# ================================================================
def migrate_db():
    """Добавляет недостающие таблицы и колонки в существующую БД"""
    conn = get_db()
    cursor = conn.cursor()
    print("[MIGRATE] Проверка схемы...")

    # 2.1 Таблицы
    for name, sql in SQL_CREATE_TABLES.items():
        if not table_exists(cursor, name):
            cursor.execute(sql)
            print(f"  [+] Создана таблица: {name}")

    # 2.2 Колонки (объединение всех миграций)
    columns_to_add = [
        ("brigades", "importance", "TEXT DEFAULT 'medium'"),
        ("brigades", "current_load", "REAL DEFAULT 0"),
        ("brigades", "max_capacity", "INTEGER DEFAULT 10"),
        ("brigades", "efficiency_rating", "REAL DEFAULT 1.0"),
        ("brigades", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
        ("workers", "phone", "TEXT"),
        ("workers", "email", "TEXT"),
        ("workers", "hire_date", "DATE"),
        ("workers", "is_brigadier", "INTEGER DEFAULT 0"),
        ("workers", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
        ("operations", "start_date", "DATE"),
        ("operations", "end_date", "DATE"),
        ("operations", "actual_start", "DATE"),
        ("operations", "actual_end", "DATE"),
        ("operations", "assigned_workers", "TEXT DEFAULT '[]'"),
        ("operations", "notes", "TEXT"),
        ("operations", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
        ("brigade_tasks", "task_type", "TEXT DEFAULT 'main'"),
        ("brigade_tasks", "estimated_hours", "REAL DEFAULT 0"),
        ("brigade_tasks", "actual_hours", "REAL DEFAULT 0"),
        ("brigade_tasks", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
        ("brigade_tasks", "created_by", "INTEGER"),
        ("brigade_schedule", "due_date", "DATE"),
        ("brigade_schedule", "priority_order", "INTEGER DEFAULT 3"),
        ("brigade_schedule", "actual_hours", "REAL DEFAULT 0"),
        ("brigade_schedule", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
    ]

    for table, col, dtype in columns_to_add:
        if table_exists(cursor, table) and not column_exists(cursor, table, col):
            try:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {dtype}")
                print(f"  [+] Добавлена колонка: {table}.{col}")
            except sqlite3.OperationalError as e:
                print(f"  [!] Пропуск {table}.{col}: {e}")

    # 2.3 Обновление дефолтных значений importance
    cursor.execute("UPDATE brigades SET importance = 'high' WHERE name LIKE '%подготовки%' OR name LIKE '%раскроя%'")
    cursor.execute("UPDATE brigades SET importance = 'medium' WHERE importance IS NULL")

    conn.commit()
    conn.close()
    print("[OK] Миграция завершена")

# ================================================================
# 3. БАЗОВЫЙ SEED (как в api.py)
# ================================================================
def seed_database():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM brigades")
    if cursor.fetchone()[0] > 0:
        print("[SKIP] База уже содержит данные")
        conn.close()
        return

    print("[SEED] Наполнение базовыми данными...")

    brigades = [
        (1, 'Бригада подготовки', 'Подготовка материалов', 25, 5, 0.95, 'high'),
        (2, 'Бригада раскроя', 'Раскрой материалов', 80, 6, 0.88, 'high'),
        (3, 'Бригада пошива', 'Пошив изделий', 60, 8, 0.92, 'medium'),
        (4, 'Бригада сборки', 'Сборка изделий', 35, 6, 0.85, 'high'),
        (5, 'Бригада ОТК', 'Контроль качества', 20, 4, 0.98, 'critical'),
    ]
    for b in brigades:
        cursor.execute(
            "INSERT OR IGNORE INTO brigades (id, name, description, current_load, max_capacity, efficiency_rating, importance) VALUES (?, ?, ?, ?, ?, ?, ?)",
            b
        )

    workers = [
        (1, 'Иванов И.И.', 'Раскройщик', 'worker', 2, '["раскрой"]', 'online', 'ivanov', '123', 0),
        (2, 'Петров П.П.', 'Швея', 'worker', 3, '["пошив"]', 'online', 'petrov', '123', 0),
        (3, 'Сидорова А.В.', 'Раскройщик', 'worker', 2, '["раскрой"]', 'busy', 'sidorova', '123', 0),
        (4, 'Кузнецов Н.С.', 'Бригадир', 'brigadier', 2, '["управление"]', 'online', 'kuznetsov', '123', 1),
        (5, 'Администратор', 'Админ', 'admin', None, '[]', 'online', 'admin', 'admin123', 0),
    ]
    for w in workers:
        cursor.execute(
            """INSERT OR IGNORE INTO workers (id, name, position, role, brigade_id, skills, status, login, password, is_brigadier)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            w
        )

    conn.commit()
    conn.close()
    print("[OK] Seed завершён (admin / admin123)")

# ================================================================
# 4. ИМПОРТ ИЗ CSV
# ================================================================
def parse_ops_list(value):
    if not value or value.strip() in ('', '0'):
        return []
    value = value.strip().strip('"')
    result = []
    if ' ' in value and ',' not in value:
        for part in value.split():
            part = part.strip()
            if part and part != '0':
                try:
                    result.append(int(float(part)))
                except:
                    pass
    else:
        for part in value.split(','):
            part = part.strip()
            if part and part != '0':
                try:
                    if ' ' in part:
                        for p in part.split():
                            if p.strip() and p.strip() != '0':
                                result.append(int(float(p.strip())))
                    else:
                        result.append(int(float(part)))
                except:
                    pass
    return result

def parse_brigade_name(value):
    if not value or value.strip() == '':
        return None
    name = value.strip().upper()
    mapping = {
        'Т/Б': 'Бригада ТБ', 'М/Р': 'Бригада МР', 'К/Ш': 'Бригада КШ',
        'СТОЛ': 'Бригада Стол', 'ПНЕВМ': 'Бригада Пневматика',
        'ПАН': 'Бригада Панельная', 'ПОНОМ': 'Бригада Поношенко',
        'ОРИЩЕНКО': 'Бригада Орищенко', 'КАЧАЕВ': 'Бригада Качаева',
        'ПЕТ': 'Бригада Петрова', 'ГИГ': 'Бригада Гигин',
        'СДАТКА': 'Бригада Сдатки', 'ВСЕ': 'Сводная бригада'
    }
    return mapping.get(name, name)

def import_from_csv():
    if not CSV_PATH.exists():
        print(f"[ERROR] Файл не найден: {CSV_PATH}")
        return

    print(f"[INFO] Импорт из: {CSV_PATH}")
    conn = get_db()
    cursor = conn.cursor()

    # Очистка
    for tbl in ['operation_history', 'brigade_tasks', 'brigade_schedule',
                'brigade_group_members', 'brigade_groups', 'operations',
                'workers', 'brigades']:
        try:
            cursor.execute(f"DELETE FROM {tbl}")
            cursor.execute(f"DELETE FROM sqlite_sequence WHERE name='{tbl}'")
        except:
            pass

    # Чтение CSV
    rows_data = []
    try:
        with open(CSV_PATH, 'r', encoding='cp1251') as f:
            reader = csv.DictReader(f)
            rows_data = list(reader)
            print(f"[INFO] Прочитано строк: {len(rows_data)}")
    except Exception as e:
        print(f"[ERROR] {e}")
        conn.close()
        return

    # Бригады
    brigades_set = set()
    for row in rows_data:
        bn = parse_brigade_name(row.get('Бригада', ''))
        if bn:
            brigades_set.add(bn)

    brigade_map = {}
    for name in sorted(brigades_set):
        cursor.execute(
            "INSERT INTO brigades (name, description, max_capacity, efficiency_rating, importance) VALUES (?, ?, ?, ?, ?)",
            (name, f"Бригада {name}", 10, 1.0, 'medium')
        )
        brigade_map[name] = cursor.lastrowid
        print(f"  [+] Бригада: {name} (ID: {cursor.lastrowid})")

    # Админ
    cursor.execute("""
        INSERT INTO workers (id, name, position, role, login, password, status, is_brigadier)
        VALUES (0, 'Администратор Системы', 'Админ', 'admin', 'admin', 'admin123', 'online', 0)
    """)

    # Рабочие
    wid = 1
    for brigade_id in brigade_map.values():
        for i in range(1, 4):
            cursor.execute("""
                INSERT INTO workers (id, name, position, role, brigade_id, skills, status, login, password, is_brigadier)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (wid, f'Рабочий {wid}', 'Рабочий', 'worker', brigade_id, '[]', 'online', f'worker_{wid}', '123456', 1 if i == 1 else 0))
            wid += 1

    # Операции
    all_ops = {}
    for row in rows_data:
        try:
            op_val = row.get('Номер операции', '').strip()
            if not op_val:
                continue
            op_number = int(float(op_val))

            post_val = row.get('Пост', '').strip()
            post = int(float(post_val)) if post_val else None

            name = row.get('Наименование операции', f'Операция {op_number}').strip()
            drawing = row.get('Чертеж', '').strip()

            labor_val = row.get('Трудоемкость', '').strip()
            labor_hours = float(str(labor_val).replace(',', '.')) if labor_val else 0.0

            people_val = row.get('Кол-во человек', '').strip()
            people_count = max(1, int(float(people_val))) if people_val else 1

            duration_val = row.get('Время', '').strip()
            duration = float(str(duration_val).replace(',', '.')) if duration_val else 0.0
            if duration == 0 and labor_hours > 0 and people_count > 0:
                duration = round(labor_hours / people_count, 2)

            brigade_name = parse_brigade_name(row.get('Бригада', ''))
            brigade_id = brigade_map.get(brigade_name)

            location = row.get('Место проведения работ', '').strip()

            reserve_val = row.get('Резерв операции', '').strip()
            time_reserve = float(str(reserve_val).replace(',', '.')) if reserve_val else 0.0

            prev_ops = parse_ops_list(row.get('Номер предшеств.', '').strip())
            next_ops = parse_ops_list(row.get('Номер послед.', '').strip())

            all_ops[op_number] = {
                'post': post, 'op_number': op_number, 'name': name,
                'drawing': drawing, 'labor_hours': labor_hours,
                'people_count': people_count, 'duration': duration,
                'brigade_id': brigade_id, 'location': location,
                'time_reserve': time_reserve, 'status': 'pending',
                'priority': 'medium', 'prev_ops': prev_ops, 'next_ops': next_ops
            }
        except Exception as e:
            continue

    # Фильтрация связей
    valid = set(all_ops.keys())
    for op in all_ops.values():
        op['prev_ops'] = [p for p in op['prev_ops'] if p in valid]
        op['next_ops'] = [n for n in op['next_ops'] if n in valid]

    imported = 0
    for op in all_ops.values():
        cursor.execute("""
            INSERT INTO operations 
            (post, op_number, prev_ops, next_ops, name, drawing, labor_hours,
             people_count, duration, brigade_id, location, time_reserve, status, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            op['post'], op['op_number'], json.dumps(op['prev_ops']),
            json.dumps(op['next_ops']), op['name'], op['drawing'],
            op['labor_hours'], op['people_count'], op['duration'],
            op['brigade_id'], op['location'], op['time_reserve'],
            op['status'], op['priority']
        ))
        imported += 1

    conn.commit()
    conn.close()
    print(f"[OK] Импорт завершён: {imported} операций, {len(brigade_map)} бригад, {wid-1} рабочих")

# ================================================================
# 5. ГЕНЕРАЦИЯ ТЕСТОВЫХ ДАННЫХ
# ================================================================
FIRST_NAMES_MALE = ["Александр","Михаил","Максим","Артём","Даниил","Иван","Дмитрий","Кирилл","Никита","Егор","Матвей","Андрей","Илья","Алексей","Роман","Сергей","Владислав","Ярослав","Тимофей","Арсений","Денис","Владимир","Павел","Глеб","Константин","Евгений","Олег","Николай","Степан","Юрий","Василий","Антон","Виктор","Григорий"]
FIRST_NAMES_FEMALE = ["Анастасия","Мария","Анна","Елена","Дарья","София","Виктория","Екатерина","Ксения","Алиса","Полина","Александра","Ольга","Юлия","Татьяна","Наталья","Ирина","Светлана","Вера","Любовь","Маргарита","Валерия","Евгения","Алёна","Варвара","Ульяна"]
LAST_NAMES = ["Иванов","Петров","Сидоров","Смирнов","Кузнецов","Попов","Васильев","Михайлов","Новиков","Фёдоров","Морозов","Волков","Алексеев","Лебедев","Семёнов","Егоров","Павлов","Козлов","Степанов","Николаев","Орлов","Андреев","Макаров","Никитин","Захаров","Соловьёв","Борисов","Яковлев","Григорьев","Романов","Воробьёв","Сорокин","Титов"]
LAST_NAMES_FEMALE = [n+"а" for n in LAST_NAMES]
BRIGADE_PREFIXES = ["Бригада","Цех","Участок","Отдел","Сектор","Группа","Команда"]
BRIGADE_TYPES = ["подготовки","раскроя","пошива","сборки","монтажа","наладки","контроля","испытаний","упаковки","транспортировки","сварки","покраски","шлифовки","сверления","фрезеровки","токарных работ"]
OPERATION_VERBS = ["Подготовка","Раскрой","Пошив","Сборка","Монтаж","Установка","Наладка","Проверка","Контроль","Испытание","Регулировка","Калибровка","Сварка","Пайка","Склеивание","Зачистка","Покраска","Маркировка","Упаковка","Транспортировка","Демонтаж","Очистка"]
OPERATION_OBJECTS = ["деталей","узлов","агрегатов","модулей","блоков","панелей","плат","кабелей","жгутов","соединений","корпусов","крышек","панелей управления","системы","оборудования","приборов"]
LOCATIONS = ["Цех №1","Цех №2","Цех №3","Цех №4","Цех №5","Сборочный цех","Механический цех","Сварочный пост","Малярный участок","Участок сборки","Участок контроля","Лаборатория","Испытательный стенд","Склад","Инструментальная","Ремонтная зона","Зона упаковки","Участок подготовки","Линия №1","Линия №2","Конвейер","Пост ОТК"]

def generate_test_data(brigades_count=500, workers_count=1000, groups_count=10, ops_count=500):
    conn = get_db()
    cursor = conn.cursor()

    # Очистка
    for tbl in ['operation_history','brigade_tasks','brigade_schedule','operations',
                'brigade_group_members','brigade_groups','workers','brigades']:
        try:
            cursor.execute(f"DELETE FROM {tbl}")
            cursor.execute(f"DELETE FROM sqlite_sequence WHERE name='{tbl}'")
        except:
            pass

    print(f"[GEN] Генерация {brigades_count} бригад, {workers_count} рабочих, {ops_count} операций...")

    # Бригады
    brigades = []
    for i in range(1, brigades_count+1):
        prefix = random.choice(BRIGADE_PREFIXES)
        btype = random.choice(BRIGADE_TYPES)
        brigades.append({
            'id': i, 'name': f"{prefix} {btype} №{i}",
            'description': f"Бригада выполняет работы по {btype.lower()}",
            'max_capacity': random.choice([3,4,5,6,8,10,12,15]),
            'efficiency_rating': round(random.uniform(0.75,1.25),2),
            'importance': random.choice(['critical','high','medium','low']),
            'current_load': random.randint(0,100)
        })
    for b in brigades:
        cursor.execute("INSERT INTO brigades (id,name,description,max_capacity,efficiency_rating,importance,current_load) VALUES (?,?,?,?,?,?,?)",
                       (b['id'],b['name'],b['description'],b['max_capacity'],b['efficiency_rating'],b['importance'],b['current_load']))

    # Рабочие
    used_logins = set()
    wid = 1
    for i in range(1, workers_count+1):
        if random.random() > 0.3:
            fn = random.choice(FIRST_NAMES_MALE); ln = random.choice(LAST_NAMES); mn = random.choice(FIRST_NAMES_MALE)+"ович"
        else:
            fn = random.choice(FIRST_NAMES_FEMALE); ln = random.choice(LAST_NAMES_FEMALE); mn = random.choice(FIRST_NAMES_FEMALE)+"овна"
        full = f"{ln} {fn} {mn}"
        base = f"{ln.lower()}{fn[0].lower()}"
        login = base; c = 1
        while login in used_logins:
            login = f"{base}{c}"; c += 1
        used_logins.add(login)

        positions = ["Слесарь","Сборщик","Монтажник","Наладчик","Контролёр","Оператор","Техник","Инженер","Мастер","Электрик","Сварщик"]
        skills = json.dumps(random.sample(["раскрой","пошив","сборка","монтаж","пайка","сварка","контроль","наладка","программирование","черчение"], random.randint(1,4)), ensure_ascii=False)
        brigade_id = random.randint(1, brigades_count) if random.random() > 0.3 else None

        cursor.execute("""
            INSERT INTO workers (id,name,position,role,brigade_id,skills,status,login,password,is_brigadier,phone,email)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """, (wid, full, random.choice(positions), 'worker', brigade_id, skills,
              random.choice(['online','offline','busy']), login, '123456',
              1 if random.random() < 0.05 else 0, f"+79{random.randint(100000000,999999999)}", f"{login}@company.ru"))
        wid += 1

    # Группы
    group_names = ["Сборочный комплекс","Механический кластер","Электромонтажный сектор","Производственный хаб","Технологический альянс","Инженерный блок","Цеховая группа","Производственное объединение","Технический пул","Операционный кластер"]
    for i in range(1, groups_count+1):
        cursor.execute("INSERT INTO brigade_groups (id,name,description) VALUES (?,?,?)",
                       (i, group_names[i-1] if i <= len(group_names) else f"Группа №{i}", "Объединение производственных бригад"))

    # Связи групп
    for gid in range(1, groups_count+1):
        for bid in random.sample(range(1, brigades_count+1), random.randint(5,30)):
            cursor.execute("INSERT OR IGNORE INTO brigade_group_members (group_id,brigade_id) VALUES (?,?)", (gid,bid))

    # Чертежи
    prefixes = ["МБ","ТС","ТЛ","ЭЛ","СБ","МЧ","КМ","АТ","ПН","ГЧ"]
    series = ["001","002","003","004","005","010","020","050","100"]
    drawings = [f"{random.choice(prefixes)}.{random.randint(100,999)}.{random.choice(series)}{f'-{random.randint(1,99):02d}' if random.random()>0.5 else ''}" for _ in range(2000)]

    # Операции
    used_numbers = set()
    operations = []
    for i in range(1, ops_count+1):
        opn = random.randint(100,999)
        while opn in used_numbers:
            opn = random.randint(100,999)
        used_numbers.add(opn)

        verb = random.choice(OPERATION_VERBS)
        obj = random.choice(OPERATION_OBJECTS)
        labor = round(random.uniform(0.5,24),1)
        people = random.randint(1,8)
        dur = round(labor/people*random.uniform(0.8,1.2),1)
        today = datetime.now().date()
        sdate = today - timedelta(days=random.randint(0,30))
        edate = sdate + timedelta(days=random.randint(1,14))

        operations.append({
            'id': i, 'post': random.randint(1,10), 'op_number': opn,
            'prev_ops': '[]', 'next_ops': '[]',
            'name': f"{verb} {obj}", 'drawing': random.choice(drawings),
            'labor_hours': labor, 'people_count': people, 'duration': dur,
            'brigade_id': random.randint(1,brigades_count) if random.random()>0.1 else None,
            'location': random.choice(LOCATIONS), 'time_reserve': round(random.uniform(0,dur*0.3),1),
            'status': random.choice(['pending','in_progress','completed','blocked']),
            'priority': random.choice(['low','medium','high','critical']),
            'start_date': sdate.isoformat(), 'end_date': edate.isoformat()
        })

    # Связи операций
    for i in range(len(operations)):
        if random.random() > 0.3:
            nxt = random.sample(range(len(operations)), min(random.randint(1,3), len(operations)-1))
            nlist = []
            for idx in nxt:
                if idx != i and operations[idx]['op_number'] > operations[i]['op_number']:
                    nlist.append(operations[idx]['op_number'])
                    prev = json.loads(operations[idx]['prev_ops'])
                    if operations[i]['op_number'] not in prev:
                        prev.append(operations[i]['op_number'])
                        operations[idx]['prev_ops'] = json.dumps(prev)
            operations[i]['next_ops'] = json.dumps(nlist)

    for op in operations:
                cursor.execute("""
            INSERT INTO operations (id,post,op_number,prev_ops,next_ops,name,drawing,labor_hours,people_count,duration,brigade_id,location,time_reserve,status,priority,start_date,end_date)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (op['id'],op['post'],op['op_number'],op['prev_ops'],op['next_ops'],op['name'],op['drawing'],
              op['labor_hours'],op['people_count'],op['duration'],op['brigade_id'],op['location'],
              op['time_reserve'],op['status'],op['priority'],op['start_date'],op['end_date']))

    # Админ
    cursor.execute("""
        INSERT OR REPLACE INTO workers (id,name,position,role,login,password,status,is_brigadier)
        VALUES (0,'Администратор Системы','Админ','admin','admin','admin123','online',0)
    """)

    conn.commit()
    conn.close()
    print(f"[OK] Генерация завершена: {brigades_count} бригад, {workers_count} рабочих, {ops_count} операций")

# ================================================================
# 6. ОЧИСТКА
# ================================================================
def clear_database():
    conn = get_db()
    cursor = conn.cursor()
    for tbl in ['operation_history','brigade_tasks','brigade_schedule',
                'brigade_group_members','brigade_groups','operations',
                'workers','brigades']:
        try:
            cursor.execute(f"DELETE FROM {tbl}")
            cursor.execute(f"DELETE FROM sqlite_sequence WHERE name='{tbl}'")
            print(f"  [CLEAR] {tbl}")
        except:
            pass
    conn.commit()
    conn.close()
    print("[OK] Все таблицы очищены")

# ================================================================
# CLI
# ================================================================
def main():
    parser = argparse.ArgumentParser(description="Управление manufacturing.db")
    parser.add_argument('command', choices=['init','migrate','seed','import-csv','generate','clear'],
                        help='Команда: init|migrate|seed|import-csv|generate|clear')
    args = parser.parse_args()

    if args.command == 'init':
        init_db()
        seed_database()
    elif args.command == 'migrate':
        migrate_db()
    elif args.command == 'seed':
        seed_database()
    elif args.command == 'import-csv':
        migrate_db()  # на всякий случай
        import_from_csv()
    elif args.command == 'generate':
        migrate_db()
        generate_test_data()
    elif args.command == 'clear':
        clear_database()

if __name__ == "__main__":
    main()