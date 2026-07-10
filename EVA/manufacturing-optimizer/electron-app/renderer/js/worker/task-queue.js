/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - ОЧЕРЕДЬ ЗАДАЧ
 * ================================================================
 */

export class TaskQueue {
    constructor() {
        this.tasks = [];
        this.filteredTasks = [];
        this.filter = 'all';
        this.sortBy = 'priority';
        this.onUpdate = null;
    }

    /**
     * Установка задач
     */
    setTasks(tasks) {
        this.tasks = tasks;
        this.applyFilters();
    }

    /**
     * Применение фильтров
     */
    applyFilters() {
        let filtered = [...this.tasks];
        
        // Фильтр по статусу
        if (this.filter === 'pending') {
            filtered = filtered.filter(t => t.status === 'pending');
        } else if (this.filter === 'blocked') {
            filtered = filtered.filter(t => t.status === 'blocked');
        } else if (this.filter === 'available') {
            filtered = filtered.filter(t => 
                t.status === 'pending' && this.areDependenciesMet(t)
            );
        }
        
        // Сортировка
        filtered = this.sortTasks(filtered);
        
        this.filteredTasks = filtered;
        this.notifyUpdate();
        
        return this.filteredTasks;
    }

    /**
     * Сортировка задач
     */
    sortTasks(tasks) {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        
        if (this.sortBy === 'priority') {
            tasks.sort((a, b) => {
                const pa = priorityOrder[a.priority] || 4;
                const pb = priorityOrder[b.priority] || 4;
                return pa - pb;
            });
        } else if (this.sortBy === 'duration') {
            tasks.sort((a, b) => (a.duration || 0) - (b.duration || 0));
        } else if (this.sortBy === 'number') {
            tasks.sort((a, b) => (a.op_number || 0) - (b.op_number || 0));
        }
        
        return tasks;
    }

    /**
     * Установка фильтра
     */
    setFilter(filter) {
        this.filter = filter;
        return this.applyFilters();
    }

    /**
     * Установка сортировки
     */
    setSortBy(sortBy) {
        this.sortBy = sortBy;
        return this.applyFilters();
    }

    /**
     * Проверка зависимостей
     */
    areDependenciesMet(task) {
        if (!task.dependencies || task.dependencies.length === 0) {
            return true;
        }
        
        return task.dependencies.every(depId => {
            const depTask = this.tasks.find(t => t.op_number === depId);
            return depTask && depTask.status === 'completed';
        });
    }

    /**
     * Получение следующей задачи
     */
    getNextTask() {
        const available = this.filteredTasks.filter(t => 
            t.status === 'pending' && this.areDependenciesMet(t)
        );
        
        return available.length > 0 ? available[0] : null;
    }

    /**
     * Получение задачи по ID
     */
    getTask(taskId) {
        return this.tasks.find(t => t.id === taskId || t.op_number === taskId);
    }

    /**
     * Получение количества задач по статусу
     */
    getCounts() {
        return {
            all: this.tasks.length,
            pending: this.tasks.filter(t => t.status === 'pending').length,
            blocked: this.tasks.filter(t => t.status === 'blocked').length,
            available: this.tasks.filter(t => 
                t.status === 'pending' && this.areDependenciesMet(t)
            ).length
        };
    }

    /**
     * Проверка на пустоту
     */
    isEmpty() {
        return this.filteredTasks.length === 0;
    }

    /**
     * Добавление задачи
     */
    addTask(task) {
        this.tasks.push(task);
        this.applyFilters();
    }

    /**
     * Обновление задачи
     */
    updateTask(taskId, updates) {
        const index = this.tasks.findIndex(t => t.id === taskId || t.op_number === taskId);
        if (index !== -1) {
            this.tasks[index] = { ...this.tasks[index], ...updates };
            this.applyFilters();
            return this.tasks[index];
        }
        return null;
    }

    /**
     * Удаление задачи
     */
    removeTask(taskId) {
        const index = this.tasks.findIndex(t => t.id === taskId || t.op_number === taskId);
        if (index !== -1) {
            this.tasks.splice(index, 1);
            this.applyFilters();
            return true;
        }
        return false;
    }

    /**
     * Очистка очереди
     */
    clear() {
        this.tasks = [];
        this.filteredTasks = [];
        this.notifyUpdate();
    }

    /**
     * Уведомление об обновлении
     */
    notifyUpdate() {
        if (this.onUpdate) {
            this.onUpdate(this.filteredTasks);
        }
    }
}