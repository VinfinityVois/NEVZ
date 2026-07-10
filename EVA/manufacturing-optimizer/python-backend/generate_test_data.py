#!/usr/bin/env python3
"""
Генератор тестовых данных для Manufacturing Optimizer
=======================================================
Создаёт:
- 1000 сотрудников
- 500 бригад
- 10 групп бригад
- 2000 чертежей
- 100 мест
- ~500 операций со случайными данными
"""

import sqlite3
import random
import json
from datetime import datetime, timedelta
from pathlib import Path

# Путь к БД
DB_PATH = Path(__file__).parent.parent / "data" / "manufacturing.db"

# ================================================================
# ГЕНЕРАТОРЫ ДАННЫХ
# ================================================================

# Русские имена
FIRST_NAMES_MALE = [
    "Александр", "Михаил", "Максим", "Артём", "Даниил", "Иван", "Дмитрий", 
    "Кирилл", "Никита", "Егор", "Матвей", "Андрей", "Илья", "Алексей",
    "Роман", "Сергей", "Владислав", "Ярослав", "Тимофей", "Арсений",
    "Денис", "Владимир", "Павел", "Глеб", "Константин", "Евгений", "Олег",
    "Николай", "Степан", "Юрий", "Василий", "Антон", "Виктор", "Григорий"
]

FIRST_NAMES_FEMALE = [
    "Анастасия", "Мария", "Анна", "Елена", "Дарья", "София", "Виктория",
    "Екатерина", "Ксения", "Алиса", "Полина", "Александра", "Ольга",
    "Юлия", "Татьяна", "Наталья", "Ирина", "Светлана", "Вера", "Любовь",
    "Маргарита", "Валерия", "Евгения", "Алёна", "Варвара", "Ульяна"
]

LAST_NAMES = [
    "Иванов", "Петров", "Сидоров", "Смирнов", "Кузнецов", "Попов", "Васильев",
    "Михайлов", "Новиков", "Фёдоров", "Морозов", "Волков", "Алексеев",
    "Лебедев", "Семёнов", "Егоров", "Павлов", "Козлов", "Степанов", "Николаев",
    "Орлов", "Андреев", "Макаров", "Никитин", "Захаров", "Соловьёв", "Борисов",
    "Яковлев", "Григорьев", "Романов", "Воробьёв", "Сорокин", "Титов"
]

LAST_NAMES_FEMALE = [name + "а" for name in LAST_NAMES]

# Названия бригад
BRIGADE_PREFIXES = [
    "Бригада", "Цех", "Участок", "Отдел", "Сектор", "Группа", "Команда"
]

BRIGADE_TYPES = [
    "подготовки", "раскроя", "пошива", "сборки", "монтажа", "наладки",
    "контроля", "испытаний", "упаковки", "транспортировки", "сварки",
    "покраски", "шлифовки", "сверления", "фрезеровки", "токарных работ"
]

# Названия операций
OPERATION_VERBS = [
    "Подготовка", "Раскрой", "Пошив", "Сборка", "Монтаж", "Установка",
    "Наладка", "Проверка", "Контроль", "Испытание", "Регулировка",
    "Калибровка", "Сварка", "Пайка", "Склеивание", "Зачистка", "Покраска",
    "Маркировка", "Упаковка", "Транспортировка", "Демонтаж", "Очистка"
]

OPERATION_OBJECTS = [
    "деталей", "узлов", "агрегатов", "модулей", "блоков", "панелей",
    "плат", "кабелей", "жгутов", "соединений", "корпусов", "крышек",
    "панелей управления", "системы", "оборудования", "приборов"
]

# Места проведения
LOCATIONS = [
    "Цех №1", "Цех №2", "Цех №3", "Цех №4", "Цех №5",
    "Сборочный цех", "Механический цех", "Сварочный пост", "Малярный участок",
    "Участок сборки", "Участок контроля", "Лаборатория", "Испытательный стенд",
    "Склад", "Инструментальная", "Ремонтная зона", "Зона упаковки",
    "Участок подготовки", "Линия №1", "Линия №2", "Конвейер", "Пост ОТК"
]

# ================================================================
# ПОДКЛЮЧЕНИЕ К БД
# ================================================================

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

# ================================================================
# ГЕНЕРАЦИЯ БРИГАД (500)
# ================================================================

def generate_brigades(count=500):
    brigades = []
    
    for i in range(1, count + 1):
        prefix = random.choice(BRIGADE_PREFIXES)
        br_type = random.choice(BRIGADE_TYPES)
        name = f"{prefix} {br_type} №{i}"
        
        # Случайные параметры
        max_capacity = random.choice([3, 4, 5, 6, 8, 10, 12, 15])
        efficiency = round(random.uniform(0.75, 1.25), 2)
        importance = random.choice(['critical', 'high', 'medium', 'low'])
        current_load = random.randint(0, 100)
        
        brigades.append({
            'id': i,
            'name': name,
            'description': f"Бригада выполняет работы по {br_type.lower()}",
            'max_capacity': max_capacity,
            'efficiency_rating': efficiency,
            'importance': importance,
            'current_load': current_load
        })
    
    print(f"✅ Сгенерировано {len(brigades)} бригад")
    return brigades

# ================================================================
# ГЕНЕРАЦИЯ СОТРУДНИКОВ (1000)
# ================================================================

def generate_workers(count=1000, brigades_count=500):
    workers = []
    used_logins = set()
    
    for i in range(1, count + 1):
        # Случайное имя
        if random.random() > 0.3:
            first_name = random.choice(FIRST_NAMES_MALE)
            last_name = random.choice(LAST_NAMES)
            middle_name = random.choice(FIRST_NAMES_MALE) + "ович"
        else:
            first_name = random.choice(FIRST_NAMES_FEMALE)
            last_name = random.choice(LAST_NAMES_FEMALE)
            middle_name = random.choice(FIRST_NAMES_FEMALE) + "овна"
        
        full_name = f"{last_name} {first_name} {middle_name}"
        
        # Уникальный логин
        base_login = f"{last_name.lower()}{first_name[0].lower()}"
        login = base_login
        counter = 1
        while login in used_logins:
            login = f"{base_login}{counter}"
            counter += 1
        used_logins.add(login)
        
        # Должность
        positions = ["Слесарь", "Сборщик", "Монтажник", "Наладчик", "Контролёр", 
                    "Оператор", "Техник", "Инженер", "Мастер", "Электрик", "Сварщик"]
        
        # Навыки
        skills_options = ["раскрой", "пошив", "сборка", "монтаж", "пайка", 
                        "сварка", "контроль", "наладка", "программирование", "черчение"]
        skills = random.sample(skills_options, random.randint(1, 4))
        
        # Бригада (70% сотрудников в бригадах, 30% без)
        brigade_id = random.randint(1, brigades_count) if random.random() > 0.3 else None
        
        # Статус
        status = random.choice(['online', 'offline', 'busy'])
        
        workers.append({
            'id': i,
            'name': full_name,
            'position': random.choice(positions),
            'role': 'worker',
            'brigade_id': brigade_id,
            'skills': json.dumps(skills, ensure_ascii=False),
            'status': status,
            'login': login,
            'password': '123456',
            'is_brigadier': 1 if random.random() < 0.05 else 0,  # 5% бригадиров
            'phone': f"+79{random.randint(100000000, 999999999)}",
            'email': f"{login}@company.ru"
        })
    
    print(f"✅ Сгенерировано {len(workers)} сотрудников")
    return workers

# ================================================================
# ГЕНЕРАЦИЯ ГРУПП БРИГАД (10)
# ================================================================

def generate_brigade_groups(count=10):
    groups = []
    group_names = [
        "Сборочный комплекс", "Механический кластер", "Электромонтажный сектор",
        "Производственный хаб", "Технологический альянс", "Инженерный блок",
        "Цеховая группа", "Производственное объединение", "Технический пул",
        "Операционный кластер"
    ]
    
    for i in range(1, count + 1):
        groups.append({
            'id': i,
            'name': group_names[i-1] if i <= len(group_names) else f"Группа бригад №{i}",
            'description': f"Объединение производственных бригад"
        })
    
    print(f"✅ Сгенерировано {len(groups)} групп бригад")
    return groups

# ================================================================
# ГЕНЕРАЦИЯ СВЯЗЕЙ ГРУПП С БРИГАДАМИ
# ================================================================

def generate_group_members(groups_count=10, brigades_count=500):
    members = []
    
    for group_id in range(1, groups_count + 1):
        # Каждая группа содержит от 5 до 30 бригад
        brigades_in_group = random.sample(range(1, brigades_count + 1), 
                                         random.randint(5, 30))
        for brigade_id in brigades_in_group:
            members.append({
                'group_id': group_id,
                'brigade_id': brigade_id
            })
    
    print(f"✅ Сгенерировано {len(members)} связей групп с бригадами")
    return members

# ================================================================
# ГЕНЕРАЦИЯ ЧЕРТЕЖЕЙ (2000)
# ================================================================

def generate_drawings(count=2000):
    drawings = []
    
    prefixes = ["МБ", "ТС", "ТЛ", "ЭЛ", "СБ", "МЧ", "КМ", "АТ", "ПН", "ГЧ"]
    series = ["001", "002", "003", "004", "005", "010", "020", "050", "100"]
    
    for i in range(count):
        prefix = random.choice(prefixes)
        num = str(random.randint(100, 999))
        ser = random.choice(series)
        suffix = f"-{random.randint(1, 99):02d}" if random.random() > 0.5 else ""
        
        drawing = f"{prefix}.{num}.{ser}{suffix}"
        drawings.append(drawing)
    
    print(f"✅ Сгенерировано {len(drawings)} чертежей")
    return drawings

# ================================================================
# ГЕНЕРАЦИЯ ОПЕРАЦИЙ (~500)
# ================================================================

def generate_operations(count=500, drawings=None, brigades_count=500):
    if drawings is None:
        drawings = generate_drawings(2000)
    
    operations = []
    used_numbers = set()
    
    for i in range(1, count + 1):
        # Уникальный номер операции
        op_number = random.randint(100, 999)
        while op_number in used_numbers:
            op_number = random.randint(100, 999)
        used_numbers.add(op_number)
        
        # Название
        verb = random.choice(OPERATION_VERBS)
        obj = random.choice(OPERATION_OBJECTS)
        name = f"{verb} {obj}"
        
        # Параметры
        post = random.randint(1, 10)
        labor_hours = round(random.uniform(0.5, 24), 1)
        people_count = random.randint(1, 8)
        duration = round(labor_hours / people_count * random.uniform(0.8, 1.2), 1)
        time_reserve = round(random.uniform(0, duration * 0.3), 1)
        
        # Бригада
        brigade_id = random.randint(1, brigades_count) if random.random() > 0.1 else None
        
        # Статус
        status = random.choice(['pending', 'in_progress', 'completed', 'blocked'])
        
        # Даты
        today = datetime.now().date()
        start_date = today - timedelta(days=random.randint(0, 30))
        end_date = start_date + timedelta(days=random.randint(1, 14))
        
        # Приоритет
        priority = random.choice(['low', 'medium', 'high', 'critical'])
        
        operations.append({
            'id': i,
            'post': post,
            'op_number': op_number,
            'prev_ops': '[]',
            'next_ops': '[]',
            'name': name,
            'drawing': random.choice(drawings),
            'labor_hours': labor_hours,
            'people_count': people_count,
            'duration': duration,
            'brigade_id': brigade_id,
            'location': random.choice(LOCATIONS),
            'time_reserve': time_reserve,
            'status': status,
            'priority': priority,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat()
        })
    
    # Добавляем связи между операциями
    for i in range(len(operations)):
        if random.random() > 0.3:  # 70% операций имеют связи
            next_count = random.randint(1, 3)
            next_indices = random.sample(range(len(operations)), min(next_count, len(operations)-1))
            
            prev_list = []
            next_list = []
            
            for idx in next_indices:
                if idx != i and operations[idx]['op_number'] > operations[i]['op_number']:
                    next_list.append(operations[idx]['op_number'])
                    # Добавляем обратную связь
                    existing_prev = json.loads(operations[idx]['prev_ops'])
                    if operations[i]['op_number'] not in existing_prev:
                        existing_prev.append(operations[i]['op_number'])
                        operations[idx]['prev_ops'] = json.dumps(existing_prev)
            
            operations[i]['next_ops'] = json.dumps(next_list)
    
    print(f"✅ Сгенерировано {len(operations)} операций")
    return operations

# ================================================================
# ОЧИСТКА И ЗАПИСЬ В БД
# ================================================================

def clear_tables():
    """Очистка всех таблиц"""
    conn = get_db()
    cursor = conn.cursor()
    
    tables = ['operation_history', 'brigade_tasks', 'brigade_schedule', 
              'operations', 'brigade_group_members', 'brigade_groups', 
              'workers', 'brigades']
    
    for table in tables:
        try:
            cursor.execute(f"DELETE FROM {table}")
            cursor.execute(f"DELETE FROM sqlite_sequence WHERE name='{table}'")
        except:
            pass
    
    conn.commit()
    conn.close()
    print("🗑️ Таблицы очищены")

def insert_data(table, data):
    """Вставка данных в таблицу"""
    conn = get_db()
    cursor = conn.cursor()
    
    if not data:
        return
    
    columns = list(data[0].keys())
    placeholders = ', '.join(['?' for _ in columns])
    columns_str = ', '.join(columns)
    
    for row in data:
        values = [row[col] for col in columns]
        try:
            cursor.execute(f"INSERT INTO {table} ({columns_str}) VALUES ({placeholders})", values)
        except Exception as e:
            print(f"⚠️ Ошибка вставки в {table}: {e}")
    
    conn.commit()
    conn.close()
    print(f"📦 Данные записаны в таблицу {table}")

# ================================================================
# ГЛАВНАЯ ФУНКЦИЯ
# ================================================================

def main():
    print("=" * 60)
    print("🚀 ГЕНЕРАЦИЯ ТЕСТОВЫХ ДАННЫХ")
    print("=" * 60)
    
    # Очистка старых данных
    clear_tables()
    
    # Генерация данных
    print("\n📊 Генерация данных...")
    
    brigades = generate_brigades(500)
    workers = generate_workers(1000, 500)
    groups = generate_brigade_groups(10)
    group_members = generate_group_members(10, 500)
    drawings = generate_drawings(2000)
    operations = generate_operations(500, drawings, 500)
    
    # Запись в БД
    print("\n💾 Запись в базу данных...")
    
    insert_data('brigades', brigades)
    insert_data('workers', workers)
    insert_data('brigade_groups', groups)
    insert_data('brigade_group_members', group_members)
    insert_data('operations', operations)
    
    # Добавляем админа
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO workers (id, name, position, role, login, password, status, is_brigadier)
        VALUES (0, 'Администратор Системы', 'Админ', 'admin', 'admin', 'admin123', 'online', 0)
    """)
    conn.commit()
    conn.close()
    
    print("\n" + "=" * 60)
    print("✅ ГЕНЕРАЦИЯ ЗАВЕРШЕНА!")
    print("=" * 60)
    print(f"""
    📊 Статистика:
    ├── Бригад: 500
    ├── Сотрудников: 1000
    ├── Групп бригад: 10
    ├── Чертежей: 2000
    ├── Мест: {len(LOCATIONS)}
    └── Операций: 500
    
    🔑 Учётные данные админа:
        Логин: admin
        Пароль: admin123
    
    🔑 Учётные данные сотрудников:
        Логин: фамилия + первая буква имени (например, ivanovi)
        Пароль: 123456
    """)

if __name__ == "__main__":
    main()