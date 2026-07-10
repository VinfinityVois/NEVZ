# python-backend/migrate_schedule.py
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'manufacturing.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute('''
    CREATE TABLE IF NOT EXISTS brigade_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        brigade_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        scheduled_date DATE NOT NULL,
        due_date DATE,
        priority TEXT DEFAULT 'medium',
        priority_order INTEGER DEFAULT 3,
        assigned_worker_id INTEGER,
        estimated_hours REAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        FOREIGN KEY (brigade_id) REFERENCES brigades(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_worker_id) REFERENCES workers(id) ON DELETE SET NULL
    )
''')

# Добавляем колонку due_date если её нет
try:
    cursor.execute("ALTER TABLE brigade_schedule ADD COLUMN due_date DATE")
except:
    pass

conn.commit()
conn.close()
print("✅ Таблица brigade_schedule создана!")