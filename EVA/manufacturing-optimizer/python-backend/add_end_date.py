# python-backend/add_end_date.py
import sqlite3
conn = sqlite3.connect('../data/manufacturing.db')
cursor = conn.cursor()
try:
    cursor.execute("ALTER TABLE operations ADD COLUMN end_date DATE")
    print("✅ Колонка end_date добавлена")
except:
    print("✅ Колонка end_date уже существует")
conn.commit()
conn.close()