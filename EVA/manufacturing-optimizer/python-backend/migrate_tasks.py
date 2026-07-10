import sqlite3

conn = sqlite3.connect('../data/manufacturing.db')
cursor = conn.cursor()

# Таблица задач бригад
cursor.execute('''
    CREATE TABLE IF NOT EXISTS brigade_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        brigade_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'pending',
        assigned_worker_id INTEGER,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        due_date DATE,
        completed_at TIMESTAMP,
        FOREIGN KEY (brigade_id) REFERENCES brigades(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_worker_id) REFERENCES workers(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES workers(id) ON DELETE SET NULL
    )
''')

# Добавляем колонку importance если её нет


conn.commit()
conn.close()
print("✅ Миграция выполнена!")