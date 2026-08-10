"""
Пример работы ИИ-движка НЭВЗ
"""

from datetime import datetime, timedelta
from ai import AIEngine

# ====================== Тестовые данные ======================

tasks = [
    {
        "id": "T1",
        "name": "Подготовка документации",
        "duration_days": 4,
        "dependencies": [],
        "priority": 2,
        "required_skills": ["docs"]
    },
    {
        "id": "T2",
        "name": "Закупка комплектующих",
        "duration_days": 7,
        "dependencies": ["T1"],
        "priority": 3,
        "required_skills": ["procurement"]
    },
    {
        "id": "T3",
        "name": "Сборка секции кузова",
        "duration_days": 12,
        "dependencies": ["T2"],
        "priority": 5,
        "required_skills": ["assembly"]
    },
    {
        "id": "T4",
        "name": "Монтаж электрооборудования",
        "duration_days": 9,
        "dependencies": ["T2"],
        "priority": 4,
        "required_skills": ["electrical"]
    },
    {
        "id": "T5",
        "name": "Испытания секции",
        "duration_days": 5,
        "dependencies": ["T3", "T4"],
        "priority": 5,
        "required_skills": ["testing"]
    },
    {
        "id": "T6",
        "name": "Покраска и финишная отделка",
        "duration_days": 6,
        "dependencies": ["T5"],
        "priority": 3,
        "required_skills": ["painting"]
    },
]

brigades = [
    {"id": "B1", "name": "Бригада сборки №1", "skills": ["assembly", "docs"], "capacity": 18},
    {"id": "B2", "name": "Бригада электриков", "skills": ["electrical", "testing"], "capacity": 15},
    {"id": "B3", "name": "Бригада закупки и подготовки", "skills": ["procurement", "docs"], "capacity": 12},
    {"id": "B4", "name": "Бригада покраски", "skills": ["painting"], "capacity": 10},
]

resources = []  # можно добавить оборудование позже

# ====================== Создание движка ======================

engine = AIEngine(config={
    "max_extension_days": 5.0,
    "delay_threshold_days": 2.0,
    "critical_delay_days": 4.0,
})

# ====================== 1. Строим план ======================

print("=" * 60)
print("1. СТРОИМ ПЛАН НА МЕСЯЦ")
print("=" * 60)

plan = engine.build_plan(
    tasks=tasks,
    resources=resources,
    brigades=brigades,
    horizon="month",
    start_date=datetime.now().strftime("%Y-%m-%d"),
    do_leveling=True
)

print(f"\nДлительность проекта: {plan['total_duration_days']} дней")
print(f"Дата окончания: {plan['end_date']}")
print(f"Критических работ: {plan['stats']['critical_tasks']}")
print(f"Узких мест: {plan['stats']['bottlenecks_count']}")

print("\nКритический путь:")
for t in plan["critical_path"]:
    print(f"  • {t['id']} — {t['name']} ({t['start'][:10]} → {t['end'][:10]})")

print("\nНазначение бригад:")
for task in plan["tasks"]:
    print(f"  {task['id']:4} → бригада {task.get('brigade_id')} | {task.get('name')}")

print("\nРекомендации:")
for rec in engine.get_recommendations(plan)[:5]:
    print(f"  [{rec['severity'].upper()}] {rec['message']}")
    print(f"           → {rec['suggestion']}")

# ====================== 2. Имитация сбоя ======================

print("\n" + "=" * 60)
print("2. ИМИТАЦИЯ СБОЯ (срыв на критической работе)")
print("=" * 60)

# Допустим, работа T3 (сборка) сильно отстаёт
actual_data = {
    "timestamp": datetime.now().isoformat(),
    "tasks": [
        {
            "id": "T1",
            "status": "completed",
            "progress": 1.0,
            "actual_end": (datetime.now() - timedelta(days=1)).isoformat()
        },
        {
            "id": "T2",
            "status": "completed",
            "progress": 1.0,
            "actual_end": datetime.now().isoformat()
        },
        {
            "id": "T3",
            "status": "in_progress",
            "progress": 0.25,                    # сильно отстаёт
            "actual_start": (datetime.now() - timedelta(days=4)).isoformat(),
            "reported_at": datetime.now().isoformat(),
            "delay_reason": "Поломка сварочного оборудования"
        },
        {
            "id": "T4",
            "status": "in_progress",
            "progress": 0.4,
            "actual_start": (datetime.now() - timedelta(days=3)).isoformat(),
            "reported_at": datetime.now().isoformat()
        },
        # остальные ещё не начаты
    ]
}

result = engine.detect_and_replan(
    current_plan=plan,
    actual_data=actual_data,
    resources=resources,
    brigades=brigades
)

print(f"\nСтатус: {result['status']}")
print(f"Сообщение: {result['message']}")

if result["status"] == "replanned":
    new_plan = result["new_plan"]
    print(f"\nНовая длительность: {new_plan['total_duration_days']} дней")
    print(f"Новая дата окончания: {new_plan['end_date']}")
    
    print("\nЧто изменилось:")
    changes = new_plan.get("changes_summary", {})
    for moved in changes.get("moved_tasks", []):
        print(f"  • Задача {moved['task_id']} сдвинута / увеличена")
    
    print("\nНовый критический путь:")
    for t in new_plan["critical_path"]:
        print(f"  • {t['id']} — {t['name']}")

print("\n" + "=" * 60)
print("Статус движка:", engine.get_status())
print("=" * 60)