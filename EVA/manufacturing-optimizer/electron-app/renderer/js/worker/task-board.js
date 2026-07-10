/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - ДОСКА ЗАДАЧ РАБОЧЕГО
 * ================================================================
 */

export class TaskBoard {
    constructor(workerId, brigadeId) {
        this.workerId = workerId;
        this.brigadeId = brigadeId;
        this.tasks = [];
        this.currentTask = null;
        this.history = [];
        this.filters = {
            status: 'all',
            priority: 'all'
        };
    }

    /**
     * Загрузка задач
     */
    async loadTasks() {
        try {
            // Здесь должен быть API запрос
            this.tasks = this.getDefaultTasks();
            this.currentTask = this.tasks.find(t => t.status === 'in_progress');
            return this.tasks;
        } catch (error) {
            console.error('Ошибка загрузки задач:', error);
            return [];
        }
    }

    /**
     * Загрузка истории
     */
    async loadHistory() {
        try {
            // Здесь должен быть API запрос
            this.history = this.getDefaultHistory();
            return this.history;
        } catch (error) {
            console.error('Ошибка загрузки истории:', error);
            return [];
        }
    }

    /**
     * Получение отфильтрованных задач
     */
    getFilteredTasks() {
        let filtered = [...this.tasks];
        
        if (this.filters.status !== 'all') {
            filtered = filtered.filter(t => t.status === this.filters.status);
        }
        
        if (this.filters.priority !== 'all') {
            filtered = filtered.filter(t => t.priority === this.filters.priority);
        }
        
        return filtered;
    }

    /**
     * Начало задачи
     */
    startTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return null;
        
        // Проверяем зависимости
        if (!this.checkDependencies(task)) {
            return { 
                success: false, 
                error: 'Не выполнены предшествующие операции' 
            };
        }
        
        // Если уже есть активная задача
        if (this.currentTask) {
            return { 
                success: false, 
                error: 'У вас уже есть активная задача' 
            };
        }
        
        task.status = 'in_progress';
        task.started_at = new Date().toISOString();
        this.currentTask = task;
        
        return { success: true, task };
    }

    /**
     * Завершение задачи
     */
    completeTask(taskId, actualData) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return null;
        
        task.status = 'completed';
        task.completed_at = new Date().toISOString();
        task.actual_duration = actualData.duration;
        task.actual_people = actualData.people;
        task.efficiency = task.duration / actualData.duration;
        
        // Переносим в историю
        this.history.unshift({ ...task });
        
        // Удаляем из активных задач
        this.tasks = this.tasks.filter(t => t.id !== taskId);
        
        if (this.currentTask?.id === taskId) {
            this.currentTask = null;
        }
        
        return { success: true, task };
    }

    /**
     * Проверка зависимостей
     */
    checkDependencies(task) {
        if (!task.dependencies || task.dependencies.length === 0) {
            return true;
        }
        
        return task.dependencies.every(depId => {
            const depTask = this.tasks.find(t => t.op_number === depId);
            return depTask && depTask.status === 'completed';
        });
    }

    /**
     * Получение статистики
     */
    getStatistics() {
        const completed = this.history.length;
        const totalLabor = this.history.reduce((sum, t) => sum + (t.actual_duration || t.duration), 0);
        const avgEfficiency = completed > 0
            ? this.history.reduce((sum, t) => sum + (t.efficiency || 1), 0) / completed
            : 0;
        
        return {
            completed,
            inProgress: this.currentTask ? 1 : 0,
            pending: this.tasks.filter(t => t.status === 'pending').length,
            blocked: this.tasks.filter(t => t.status === 'blocked').length,
            totalLaborHours: totalLabor,
            avgEfficiency: Math.round(avgEfficiency * 100)
        };
    }

    /**
     * Установка фильтра
     */
    setFilter(type, value) {
        this.filters[type] = value;
    }

    /**
     * Сброс фильтров
     */
    resetFilters() {
        this.filters = {
            status: 'all',
            priority: 'all'
        };
    }

    /**
     * Тестовые задачи
     */
    getDefaultTasks() {
        return [
            {
                id: 1,
                op_number: 103,
                name: 'Раскрой подкладки',
                status: 'in_progress',
                priority: 'high',
                post: 2,
                drawing: 'МБ-001',
                labor_hours: 12,
                people_count: 2,
                duration: 6,
                location: 'Цех 2',
                time_reserve: 3,
                dependencies: [101],
                started_at: new Date(Date.now() - 3600000).toISOString()
            },
            {
                id: 2,
                op_number: 105,
                name: 'Пошив подкладки',
                status: 'pending',
                priority: 'medium',
                post: 3,
                drawing: 'МБ-001',
                labor_hours: 18,
                people_count: 3,
                duration: 6,
                location: 'Цех 3',
                time_reserve: 2,
                dependencies: [103]
            },
            {
                id: 3,
                op_number: 108,
                name: 'Проверка швов',
                status: 'pending',
                priority: 'low',
                post: 5,
                drawing: 'МБ-001',
                labor_hours: 4,
                people_count: 1,
                duration: 4,
                location: 'ОТК',
                time_reserve: 5,
                dependencies: [105, 106]
            },
            {
                id: 4,
                op_number: 109,
                name: 'Упаковка',
                status: 'blocked',
                priority: 'low',
                post: 6,
                drawing: 'МБ-001',
                labor_hours: 2,
                people_count: 1,
                duration: 2,
                location: 'Склад',
                time_reserve: 8,
                dependencies: [108]
            }
        ];
    }

    /**
     * Тестовая история
     */
    getDefaultHistory() {
        return [
            {
                id: 101,
                op_number: 101,
                name: 'Подготовка материалов',
                status: 'completed',
                priority: 'medium',
                duration: 4,
                actual_duration: 3.5,
                actual_people: 2,
                efficiency: 1.14,
                completed_at: new Date(Date.now() - 86400000).toISOString()
            },
            {
                id: 102,
                op_number: 102,
                name: 'Раскрой ткани',
                status: 'completed',
                priority: 'high',
                duration: 5.3,
                actual_duration: 6,
                actual_people: 3,
                efficiency: 0.88,
                completed_at: new Date(Date.now() - 43200000).toISOString()
            }
        ];
    }
}