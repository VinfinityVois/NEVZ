# python-backend/import_from_csv.py
import sqlite3
import csv
import json
import re
from pathlib import Path
import sys

# Настройка кодировки для Windows
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

DB_PATH = Path(__file__).parent.parent / "data" / "manufacturing.db"

def parse_ops_list(value):
    """Парсит список операций из строки вида '2,7,11,12,18'"""
    if not value or value.strip() == '' or value.strip() == '0':
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
    """Парсит название бригады"""
    if not value or value.strip() == '':
        return None
    name = value.strip().upper()
    mapping = {
        'Т/Б': 'Бригада ТБ',
        'М/Р': 'Бригада МР',
        'К/Ш': 'Бригада КШ',
        'СТОЛ': 'Бригада Стол',
        'ПНЕВМ': 'Бригада Пневматика',
        'ПАН': 'Бригада Панельная',
        'ПОНОМ': 'Бригада Поношенко',
        'ОРИЩЕНКО': 'Бригада Орищенко',
        'КАЧАЕВ': 'Бригада Качаева',
        'ПЕТ': 'Бригада Петрова',
        'ГИГ': 'Бригада Гигин',
        'СДАТКА': 'Бригада Сдатки',
        'ВСЕ': 'Сводная бригада'
    }
    return mapping.get(name, name)

def import_csv():
    """Импорт данных из CSV"""
    csv_path = Path(__file__).parent / "data.csv"
    
    if not csv_path.exists():
        print(f"[ERROR] File not found: {csv_path}")
        return
    
    print(f"[INFO] Importing data from: {csv_path}")
    
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    # Очищаем таблицы
    print("[INFO] Clearing existing data...")
    cursor.execute("DELETE FROM operation_history")
    cursor.execute("DELETE FROM brigade_tasks")
    cursor.execute("DELETE FROM brigade_schedule")
    cursor.execute("DELETE FROM brigade_group_members")
    cursor.execute("DELETE FROM brigade_groups")
    cursor.execute("DELETE FROM operations")
    cursor.execute("DELETE FROM workers")
    cursor.execute("DELETE FROM brigades")
    cursor.execute("DELETE FROM sqlite_sequence WHERE name='operations'")
    cursor.execute("DELETE FROM sqlite_sequence WHERE name='brigades'")
    cursor.execute("DELETE FROM sqlite_sequence WHERE name='workers'")
    
    # Читаем CSV с правильной кодировкой
    rows_data = []
    try:
        with open(csv_path, 'r', encoding='cp1251') as f:
            reader = csv.DictReader(f)
            rows_data = list(reader)
            print(f"[INFO] Read {len(rows_data)} rows")
            print(f"[INFO] Columns: {list(rows_data[0].keys()) if rows_data else []}")
    except Exception as e:
        print(f"[ERROR] Failed to read CSV: {e}")
        return
    
    if not rows_data:
        print("[ERROR] No data read")
        return
    
    # Собираем бригады
    brigades_set = set()
    for row in rows_data:
        brigade_name = parse_brigade_name(row.get('Бригада', ''))
        if brigade_name:
            brigades_set.add(brigade_name)
    
    # Создаем бригады
    brigade_map = {}
    print(f"[INFO] Creating {len(brigades_set)} brigades...")
    for name in sorted(brigades_set):
        cursor.execute(
            "INSERT INTO brigades (name, description, max_capacity, efficiency_rating, importance) VALUES (?, ?, ?, ?, ?)",
            (name, f"Бригада {name}", 10, 1.0, 'medium')
        )
        brigade_map[name] = cursor.lastrowid
        print(f"  Created brigade: {name} (ID: {brigade_map[name]})")
    
    # Создаем администратора
    cursor.execute("""
        INSERT INTO workers (id, name, position, role, login, password, status, is_brigadier)
        VALUES (0, 'Администратор Системы', 'Админ', 'admin', 'admin', 'admin123', 'online', 0)
    """)
    
    # Создаем тестовых рабочих
    print("[INFO] Creating workers...")
    worker_id = 1
    for brigade_id in brigade_map.values():
        for i in range(1, 4):
            cursor.execute("""
                INSERT INTO workers (id, name, position, role, brigade_id, skills, status, login, password, is_brigadier)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                worker_id,
                f'Рабочий {worker_id}',
                'Рабочий',
                'worker',
                brigade_id,
                '[]',
                'online',
                f'worker_{worker_id}',
                '123456',
                1 if i == 1 else 0
            ))
            worker_id += 1
    
    # Импортируем операции
    print("[INFO] Importing operations...")
    all_ops = {}
    imported = 0
    
    for row in rows_data:
        try:
            # Номер операции - используем колонку 'Номер операции'
            op_number = None
            op_val = row.get('Номер операции', '').strip()
            if op_val:
                try:
                    op_number = int(float(op_val))
                except:
                    pass
            
            if not op_number:
                continue
            
            # Пост
            post = None
            post_val = row.get('Пост', '').strip()
            if post_val:
                try:
                    post = int(float(post_val))
                except:
                    pass
            
            # Название
            name = row.get('Наименование операции', f'Операция {op_number}').strip()
            
            # Чертеж
            drawing = row.get('Чертеж', '').strip()
            
            # Трудоемкость
            labor_hours = 0.0
            labor_val = row.get('Трудоемкость', '').strip()
            if labor_val:
                try:
                    labor_hours = float(str(labor_val).replace(',', '.'))
                except:
                    pass
            
            # Количество человек
            people_count = 1
            people_val = row.get('Кол-во человек', '').strip()
            if people_val:
                try:
                    people_count = max(1, int(float(people_val)))
                except:
                    pass
            
            # Время (длительность)
            duration = 0.0
            duration_val = row.get('Время', '').strip()
            if duration_val:
                try:
                    duration = float(str(duration_val).replace(',', '.'))
                except:
                    pass
            
            # Если длительность не указана, рассчитываем
            if duration == 0 and labor_hours > 0 and people_count > 0:
                duration = round(labor_hours / people_count, 2)
            
            # Бригада
            brigade_id = None
            brigade_name = parse_brigade_name(row.get('Бригада', ''))
            if brigade_name:
                brigade_id = brigade_map.get(brigade_name)
            
            # Место проведения
            location = row.get('Место проведения работ', '').strip()
            
            # Резерв операции
            time_reserve = 0.0
            reserve_val = row.get('Резерв операции', '').strip()
            if reserve_val:
                try:
                    time_reserve = float(str(reserve_val).replace(',', '.'))
                except:
                    pass
            
            # Предшествующие операции
            prev_ops = []
            prev_val = row.get('Номер предшеств.', '').strip()
            if prev_val:
                prev_ops = parse_ops_list(prev_val)
            
            # Последующие операции
            next_ops = []
            next_val = row.get('Номер послед.', '').strip()
            if next_val:
                next_ops = parse_ops_list(next_val)
            
            # Статус (по умолчанию pending)
            status = 'pending'
            
            # Приоритет (по умолчанию medium)
            priority = 'medium'
            
            # Сохраняем
            all_ops[op_number] = {
                'post': post,
                'op_number': op_number,
                'name': name,
                'drawing': drawing,
                'labor_hours': labor_hours,
                'people_count': people_count,
                'duration': duration,
                'brigade_id': brigade_id,
                'location': location,
                'time_reserve': time_reserve,
                'status': status,
                'priority': priority,
                'prev_ops': prev_ops,
                'next_ops': next_ops
            }
            
        except Exception as e:
            print(f"[ERROR] Failed to parse row: {e}")
            continue
    
    print(f"[INFO] Parsed {len(all_ops)} operations")
    
    # Фильтруем связи - только существующие операции
    print("[INFO] Filtering operation relationships...")
    valid_ops = set(all_ops.keys())
    for op_num in list(all_ops.keys()):
        all_ops[op_num]['prev_ops'] = [p for p in all_ops[op_num]['prev_ops'] if p in valid_ops]
        all_ops[op_num]['next_ops'] = [n for n in all_ops[op_num]['next_ops'] if n in valid_ops]
    
    # Вставляем в БД
    print(f"[INFO] Inserting operations into database...")
    for op_data in all_ops.values():
        try:
            cursor.execute("""
                INSERT INTO operations 
                (post, op_number, prev_ops, next_ops, name, drawing, labor_hours, 
                 people_count, duration, brigade_id, location, time_reserve, status, priority)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                op_data['post'],
                op_data['op_number'],
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
            if imported % 50 == 0:
                print(f"  Imported {imported} operations...")
        except Exception as e:
            print(f"[ERROR] Failed to insert operation {op_data['op_number']}: {e}")
    
    conn.commit()
    conn.close()
    
    print(f"\n[SUCCESS] Import complete!")
    print(f"  - Operations: {imported}")
    print(f"  - Brigades: {len(brigade_map)}")
    print(f"  - Workers: {worker_id - 1}")
    print(f"\n[INFO] Admin credentials: admin / admin123")
    
    # Проверяем связи
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM operations")
    total_ops = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM operations WHERE prev_ops != '[]' OR next_ops != '[]'")
    has_relations = cursor.fetchone()[0]
    conn.close()
    print(f"[INFO] Total operations: {total_ops}")
    print(f"[INFO] Operations with relations: {has_relations}")

if __name__ == "__main__":
    import_csv()