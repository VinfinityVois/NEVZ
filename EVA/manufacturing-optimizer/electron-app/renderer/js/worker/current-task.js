/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - ТЕКУЩАЯ ЗАДАЧА
 * ================================================================
 */

export class CurrentTaskManager {
    constructor() {
        this.task = null;
        this.timer = null;
        this.onTaskUpdate = null;
    }

    /**
     * Установка задачи
     */
    setTask(task, timer) {
        this.task = task;
        this.timer = timer;
        this.notifyUpdate();
    }

    /**
     * Получение задачи
     */
    getTask() {
        return this.task;
    }

    /**
     * Проверка наличия задачи
     */
    hasTask() {
        return this.task !== null;
    }

    /**
     * Получение деталей задачи
     */
    getTaskDetails() {
        if (!this.task) return null;
        
        return {
            number: this.task.op_number,
            name: this.task.name,
            status: this.task.status,
            priority: this.task.priority,
            post: this.task.post,
            drawing: this.task.drawing,
            laborHours: this.task.labor_hours,
            peopleCount: this.task.people_count,
            plannedDuration: this.task.duration,
            location: this.task.location,
            timeReserve: this.task.time_reserve,
            dependencies: this.task.dependencies || [],
            startedAt: this.task.started_at
        };
    }

    /**
     * Получение прогресса
     */
    getProgress() {
        if (!this.task || !this.timer) return 0;
        
        const elapsedHours = this.timer.getHours();
        const plannedHours = this.task.duration;
        
        return Math.min(100, (elapsedHours / plannedHours) * 100);
    }

    /**
     * Получение оставшегося времени
     */
    getRemainingTime() {
        if (!this.task || !this.timer) return null;
        
        const elapsedHours = this.timer.getHours();
        const plannedHours = this.task.duration;
        const remaining = Math.max(0, plannedHours - elapsedHours);
        
        return {
            hours: remaining,
            formatted: this.formatHours(remaining)
        };
    }

    /**
     * Проверка просрочки
     */
    isOverdue() {
        if (!this.task || !this.timer) return false;
        
        const elapsedHours = this.timer.getHours();
        return elapsedHours > this.task.duration;
    }

    /**
     * Получение статуса задачи
     */
    getStatusInfo() {
        if (!this.task) return null;
        
        const statusMap = {
            pending: { text: 'Ожидает', color: '#414B4E' },
            in_progress: { text: 'В работе', color: '#0961f6' },
            completed: { text: 'Завершено', color: '#10b981' },
            blocked: { text: 'Заблокировано', color: '#f59e0b' }
        };
        
        return statusMap[this.task.status] || { text: 'Неизвестно', color: '#414B4E' };
    }

    /**
     * Получение информации о приоритете
     */
    getPriorityInfo() {
        if (!this.task) return null;
        
        const priorityMap = {
            low: { text: 'Низкий', color: '#10b981' },
            medium: { text: 'Средний', color: '#f59e0b' },
            high: { text: 'Высокий', color: '#f97316' },
            critical: { text: 'Критический', color: '#ef4444' }
        };
        
        return priorityMap[this.task.priority] || { text: 'Обычный', color: '#414B4E' };
    }

    /**
     * Проверка зависимостей
     */
    areDependenciesMet(completedTasks) {
        if (!this.task || !this.task.dependencies) return true;
        
        return this.task.dependencies.every(depId =>
            completedTasks.some(t => t.op_number === depId)
        );
    }

    /**
     * Очистка задачи
     */
    clearTask() {
        this.task = null;
        this.timer = null;
        this.notifyUpdate();
    }

    /**
     * Форматирование часов
     */
    formatHours(hours) {
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        
        if (h === 0) return `${m} мин`;
        if (m === 0) return `${h} ч`;
        return `${h} ч ${m} мин`;
    }

    /**
     * Уведомление об обновлении
     */
    notifyUpdate() {
        if (this.onTaskUpdate) {
            this.onTaskUpdate(this.task);
        }
    }
}