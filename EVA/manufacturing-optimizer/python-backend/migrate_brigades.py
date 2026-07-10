import sqlite3
import json

conn = sqlite3.connect('../data/manufacturing.db')
cursor = conn.cursor()

# 1. Добавляем колонку importance (важность)
try:
    cursor.execute("ALTER TABLE brigades ADD COLUMN importance TEXT DEFAULT 'medium'")
    print("Column 'importance' added")
except sqlite3.OperationalError as e:
    if 'duplicate column' in str(e):
        print("Column 'importance' already exists")

# 2. Создаём таблицу групп бригад
cursor.execute('''
    CREATE TABLE IF NOT EXISTS brigade_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
''')

# 3. Создаём связующую таблицу (бригады в группах)
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

# 4. Обновляем существующие бригады — добавляем важность по умолчанию
cursor.execute("UPDATE brigades SET importance = 'high' WHERE name LIKE '%подготовки%' OR name LIKE '%раскроя%'")
cursor.execute("UPDATE brigades SET importance = 'medium' WHERE importance IS NULL")

conn.commit()
conn.close()
print("Migration complete!")