import sqlite3
import os

# Путь к БД
db_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'manufacturing.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("🔄 Создание недостающих таблиц...")

# 1. Таблица групп бригад
cursor.execute('''
    CREATE TABLE IF NOT EXISTS brigade_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
''')
print("✅ brigade_groups создана")

# 2. Таблица связей групп и бригад
cursor.execute('''
    CREATE TABLE IF NOT EXISTS brigade_group_members (
        group_id INTEGER,
        brigade_id INTEGER,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, brigade_id),
        FOREIGN KEY (group_id) REFERENCES brigade_groups(id) ON DELETE CASCADE,
        FOREIGN KEY (brigade_id) REFERENCES brigades(id) ON DELETE CASCADE
    )
''')
print("✅ brigade_group_members создана")

# 3. Таблица задач бригад
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
print("✅ brigade_tasks создана")

# 4. Добавляем колонку importance в brigades (если нет)
try:
    cursor.execute("ALTER TABLE brigades ADD COLUMN importance TEXT DEFAULT 'medium'")
    print("✅ importance добавлена")
except sqlite3.OperationalError:
    print("✅ importance уже существует")

conn.commit()
conn.close()
print("🎉 Миграция завершена!")