/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - УПРАВЛЕНИЕ РАБОЧИМИ
 * ================================================================
 */

export class WorkersManager {
    constructor() {
        this.workers = [];
        this.brigades = [];
    }

    /**
     * Загрузка рабочих
     */
    async loadWorkers() {
        try {
            this.workers = this.getDefaultWorkers();
            return this.workers;
        } catch (error) {
            console.error('Ошибка загрузки рабочих:', error);
            return [];
        }
    }

    /**
     * Получение рабочего по ID
     */
    getWorker(id) {
        return this.workers.find(w => w.id === id);
    }

    /**
     * Получение рабочих по бригаде
     */
    getWorkersByBrigade(brigadeId) {
        return this.workers.filter(w => w.brigade_id === brigadeId);
    }

    /**
     * Получение доступных рабочих
     */
    getAvailableWorkers() {
        return this.workers.filter(w => 
            w.status === 'online' || w.status === 'available'
        );
    }

    /**
     * Получение занятых рабочих
     */
    getBusyWorkers() {
        return this.workers.filter(w => w.status === 'busy');
    }

    /**
     * Добавление рабочего
     */
    addWorker(workerData) {
        const newWorker = {
            id: this.getNextId(),
            ...workerData,
            status: workerData.status || 'offline',
            created_at: new Date().toISOString()
        };
        
        this.workers.push(newWorker);
        return newWorker;
    }

    /**
     * Обновление рабочего
     */
    updateWorker(id, updates) {
        const index = this.workers.findIndex(w => w.id === id);
        if (index !== -1) {
            this.workers[index] = { ...this.workers[index], ...updates };
            return this.workers[index];
        }
        return null;
    }

    /**
     * Удаление рабочего
     */
    deleteWorker(id) {
        const index = this.workers.findIndex(w => w.id === id);
        if (index !== -1) {
            this.workers.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Перевод рабочего в другую бригаду
     */
    transferWorker(workerId, newBrigadeId) {
        const worker = this.getWorker(workerId);
        if (!worker) return null;
        
        const oldBrigadeId = worker.brigade_id;
        worker.brigade_id = newBrigadeId;
        worker.transfer_history = worker.transfer_history || [];
        worker.transfer_history.push({
            from: oldBrigadeId,
            to: newBrigadeId,
            date: new Date().toISOString()
        });
        
        return worker;
    }

    /**
     * Изменение статуса рабочего
     */
    setWorkerStatus(workerId, status) {
        const worker = this.getWorker(workerId);
        if (worker) {
            worker.status = status;
            worker.last_status_change = new Date().toISOString();
            
            // Уведомление об изменении
            this.onWorkerStatusChange?.(worker, status);
        }
        return worker;
    }

    /**
     * Назначение задачи рабочему
     */
    assignTask(workerId, taskId) {
        const worker = this.getWorker(workerId);
        if (worker) {
            worker.current_task = taskId;
            worker.status = 'busy';
            worker.task_assigned_at = new Date().toISOString();
        }
        return worker;
    }

    /**
     * Завершение задачи
     */
    completeTask(workerId) {
        const worker = this.getWorker(workerId);
        if (worker) {
            worker.completed_tasks = (worker.completed_tasks || 0) + 1;
            worker.current_task = null;
            worker.status = 'online';
            worker.last_task_completed = new Date().toISOString();
        }
        return worker;
    }

    /**
     * Получение статистики рабочего
     */
    getWorkerStatistics(workerId, operations) {
        const worker = this.getWorker(workerId);
        if (!worker) return null;
        
        const workerOps = operations.filter(op => 
            op.assigned_workers && op.assigned_workers.includes(workerId)
        );
        
        const completedOps = workerOps.filter(op => op.status === 'completed');
        const totalLabor = completedOps.reduce((sum, op) => sum + (op.labor_hours || 0), 0);
        const avgEfficiency = completedOps.length > 0
            ? completedOps.reduce((sum, op) => {
                const efficiency = op.duration / (op.actual_duration || op.duration);
                return sum + efficiency;
            }, 0) / completedOps.length
            : 0;
        
        return {
            workerId,
            workerName: worker.name,
            brigade: worker.brigade_id,
            totalTasks: workerOps.length,
            completedTasks: completedOps.length,
            totalLaborHours: totalLabor,
            avgEfficiency: Math.round(avgEfficiency * 100) / 100,
            currentTask: worker.current_task,
            status: worker.status
        };
    }

    /**
     * Получение рейтинга рабочих
     */
    getWorkersRanking(operations) {
        const stats = this.workers.map(worker => 
            this.getWorkerStatistics(worker.id, operations)
        );
        
        // Сортировка по эффективности
        stats.sort((a, b) => b.avgEfficiency - a.avgEfficiency);
        
        return stats.map((stat, index) => ({
            rank: index + 1,
            ...stat
        }));
    }

    /**
     * Рекомендации по назначению рабочих
     */
    recommendWorkerAssignment(task, availableWorkers) {
        const recommendations = [];
        
        availableWorkers.forEach(worker => {
            let score = 100;
            
            // Учитываем опыт (количество выполненных задач)
            score += (worker.completed_tasks || 0) * 2;
            
            // Учитываем текущую загрузку
            if (worker.current_task) score -= 30;
            
            // Учитываем бригаду
            if (worker.brigade_id === task.brigade_id) score += 20;
            
            // Учитываем навыки
            if (worker.skills && worker.skills.includes(task.skill_required)) {
                score += 30;
            }
            
            recommendations.push({
                workerId: worker.id,
                workerName: worker.name,
                score,
                currentTask: worker.current_task,
                brigade: worker.brigade_id
            });
        });
        
        // Сортировка по score
        recommendations.sort((a, b) => b.score - a.score);
        
        return recommendations.slice(0, 5);
    }

    /**
     * Проверка доступности рабочего
     */
    isWorkerAvailable(workerId) {
        const worker = this.getWorker(workerId);
        return worker && (worker.status === 'online' || worker.status === 'available');
    }

    /**
     * Получение следующего ID
     */
    getNextId() {
        return Math.max(...this.workers.map(w => w.id), 0) + 1;
    }

    /**
     * Валидация рабочего
     */
    validateWorker(worker) {
        const errors = [];
        
        if (!worker.name || worker.name.trim() === '') {
            errors.push('Имя обязательно');
        }
        
        if (!worker.brigade_id) {
            errors.push('Бригада обязательна');
        }
        
        const validRoles = ['worker', 'brigadier', 'supervisor'];
        if (worker.role && !validRoles.includes(worker.role)) {
            errors.push('Недопустимая роль');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Экспорт данных рабочих
     */
    exportWorkers(format = 'json') {
        if (format === 'json') {
            return JSON.stringify(this.workers, null, 2);
        }
        
        if (format === 'csv') {
            const headers = ['id', 'name', 'role', 'brigade_id', 'status', 'completed_tasks'];
            const rows = this.workers.map(w => 
                headers.map(h => w[h] || '').join(',')
            );
            return [headers.join(','), ...rows].join('\n');
        }
        
        return null;
    }

    /**
     * Тестовые данные
     */
    getDefaultWorkers() {
        return [
            { id: 1, name: 'Иванов Иван', role: 'worker', brigade_id: 1, status: 'online', skills: ['раскрой', 'подготовка'], completed_tasks: 15 },
            { id: 2, name: 'Петров Пётр', role: 'worker', brigade_id: 1, status: 'online', skills: ['подготовка'], completed_tasks: 12 },
            { id: 3, name: 'Сидоров Сидор', role: 'worker', brigade_id: 2, status: 'busy', skills: ['раскрой', 'пошив'], completed_tasks: 20, current_task: 102 },
            { id: 4, name: 'Кузнецов Николай', role: 'brigadier', brigade_id: 2, status: 'online', skills: ['раскрой', 'управление'], completed_tasks: 45 },
            { id: 5, name: 'Смирнова Анна', role: 'worker', brigade_id: 3, status: 'online', skills: ['пошив', 'отделка'], completed_tasks: 18 },
            { id: 6, name: 'Васильев Василий', role: 'worker', brigade_id: 3, status: 'busy', skills: ['пошив'], completed_tasks: 14, current_task: 103 },
            { id: 7, name: 'Михайлова Мария', role: 'worker', brigade_id: 4, status: 'online', skills: ['сборка', 'контроль'], completed_tasks: 22 },
            { id: 8, name: 'Алексеев Алексей', role: 'brigadier', brigade_id: 5, status: 'online', skills: ['контроль', 'управление'], completed_tasks: 38 }
        ];
    }
}