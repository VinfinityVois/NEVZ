# python-backend/migrate_dates.py
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'manufacturing.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Добавляем колонки для дат
try:
    cursor.execute("ALTER TABLE operations ADD COLUMN start_date DATE")
    print("✅ start_date добавлена")
except sqlite3.OperationalError as e:
    if 'duplicate column' in str(e):
        print("✅ start_date уже существует")
    else:
        print(f"❌ Ошибка: {e}")

try:
    cursor.execute("ALTER TABLE operations ADD COLUMN end_date DATE")
    print("✅ end_date добавлена")
except sqlite3.OperationalError as e:
    if 'duplicate column' in str(e):
        print("✅ end_date уже существует")
    else:
        print(f"❌ Ошибка: {e}")

# Обновляем тестовые данные - используем подзапрос для SQLite
cursor.execute("""
    UPDATE operations 
    SET start_date = '2024-01-10', end_date = '2024-01-15' 
    WHERE id IN (SELECT id FROM operations WHERE start_date IS NULL LIMIT 5)
""")

cursor.execute("""
    UPDATE operations 
    SET start_date = '2024-01-16', end_date = '2024-01-20' 
    WHERE id IN (SELECT id FROM operations WHERE start_date IS NULL LIMIT 5)
""")

conn.commit()
conn.close()
print("🎉 Миграция завершена!")