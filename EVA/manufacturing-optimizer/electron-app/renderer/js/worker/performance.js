/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - ПРОИЗВОДИТЕЛЬНОСТЬ РАБОЧЕГО
 * ================================================================
 */

export class PerformanceTracker {
    constructor(workerId) {
        this.workerId = workerId;
        this.stats = {
            daily: [],
            weekly: [],
            monthly: []
        };
        this.currentShift = null;
    }

    /**
     * Загрузка статистики
     */
    async loadStats() {
        try {
            // Здесь должен быть API запрос
            this.stats = this.getDefaultStats();
            return this.stats;
        } catch (error) {
            console.error('Ошибка загрузки статистики:', error);
            return this.stats;
        }
    }

    /**
     * Начало смены
     */
    startShift() {
        this.currentShift = {
            startTime: new Date().toISOString(),
            tasksCompleted: 0,
            totalLaborHours: 0,
            efficiency: 0,
            breaks: []
        };
    }

    /**
     * Добавление перерыва
     */
    addBreak(type = 'break') {
        if (this.currentShift) {
            this.currentShift.breaks.push({
                type,
                start: new Date().toISOString(),
                end: null
            });
        }
    }

    /**
     * Завершение перерыва
     */
    endBreak() {
        if (this.currentShift && this.currentShift.breaks.length > 0) {
            const lastBreak = this.currentShift.breaks[this.currentShift.breaks.length - 1];
            if (!lastBreak.end) {
                lastBreak.end = new Date().toISOString();
            }
        }
    }

    /**
     * Завершение смены
     */
    endShift() {
        if (!this.currentShift) return null;
        
        this.currentShift.endTime = new Date().toISOString();
        
        const shift = { ...this.currentShift };
        this.stats.daily.unshift(shift);
        this.currentShift = null;
        
        return shift;
    }

    /**
     * Учёт выполненной задачи
     */
    recordTaskCompletion(task, actualDuration, actualPeople) {
        if (this.currentShift) {
            this.currentShift.tasksCompleted++;
            this.currentShift.totalLaborHours += actualDuration;
        }
        
        // Обновление эффективности
        const efficiency = task.duration / actualDuration;
        this.updateEfficiency(efficiency);
    }

    /**
     * Обновление эффективности
     */
    updateEfficiency(efficiency) {
        if (this.currentShift) {
            const total = this.currentShift.tasksCompleted;
            const oldEff = this.currentShift.efficiency;
            this.currentShift.efficiency = (oldEff * (total - 1) + efficiency) / total;
        }
    }

    /**
     * Получение статистики за день
     */
    getDailyStats(date = new Date()) {
        const dateStr = date.toISOString().split('T')[0];
        
        const dayStats = this.stats.daily.find(s => 
            s.startTime.startsWith(dateStr)
        );
        
        if (dayStats) return dayStats;
        
        return {
            tasksCompleted: 0,
            totalLaborHours: 0,
            efficiency: 0
        };
    }

    /**
     * Получение статистики за неделю
     */
    getWeeklyStats() {
        const now = new Date();
        const weekStart = new Date(now.setDate(now.getDate() - now.getDay() + 1));
        
        const weekStats = this.stats.daily.filter(s => 
            new Date(s.startTime) >= weekStart
        );
        
        if (weekStats.length === 0) {
            return {
                tasksCompleted: 0,
                totalLaborHours: 0,
                avgEfficiency: 0,
                daysWorked: 0
            };
        }
        
        return {
            tasksCompleted: weekStats.reduce((sum, s) => sum + s.tasksCompleted, 0),
            totalLaborHours: weekStats.reduce((sum, s) => sum + s.totalLaborHours, 0),
            avgEfficiency: weekStats.reduce((sum, s) => sum + s.efficiency, 0) / weekStats.length,
            daysWorked: weekStats.length
        };
    }

    /**
     * Получение рейтинга
     */
    getRating() {
        const weekly = this.getWeeklyStats();
        
        // Расчёт рейтинга на основе эффективности и объёма работы
        const efficiencyScore = weekly.avgEfficiency * 50;
        const volumeScore = Math.min(weekly.totalLaborHours / 40 * 50, 50);
        
        const totalScore = efficiencyScore + volumeScore;
        
        let rank;
        if (totalScore >= 90) rank = 'Мастер';
        else if (totalScore >= 75) rank = 'Профессионал';
        else if (totalScore >= 60) rank = 'Опытный';
        else if (totalScore >= 40) rank = 'Новичок';
        else rank = 'Ученик';
        
        return {
            score: Math.round(totalScore),
            rank,
            efficiency: Math.round(weekly.avgEfficiency * 100),
            hoursWorked: weekly.totalLaborHours,
            tasksCompleted: weekly.tasksCompleted
        };
    }

    /**
     * Получение прогресса за смену
     */
    getShiftProgress(plannedHours = 8) {
        if (!this.currentShift) return 0;
        
        const elapsed = this.currentShift.totalLaborHours;
        return Math.min(100, (elapsed / plannedHours) * 100);
    }

    /**
     * Расчёт оставшегося времени смены
     */
    getRemainingShiftTime(plannedHours = 8) {
        if (!this.currentShift) return plannedHours;
        
        const elapsed = this.currentShift.totalLaborHours;
        return Math.max(0, plannedHours - elapsed);
    }

    /**
     * Прогноз выполнения плана
     */
    getForecast(plannedTasks) {
        const weekly = this.getWeeklyStats();
        const avgTasksPerHour = weekly.tasksCompleted / Math.max(weekly.totalLaborHours, 1);
        
        const remainingHours = this.getRemainingShiftTime();
        const predictedTasks = Math.floor(avgTasksPerHour * remainingHours);
        
        const currentTasks = this.currentShift?.tasksCompleted || 0;
        const totalPredicted = currentTasks + predictedTasks;
        
        return {
            current: currentTasks,
            predicted: totalPredicted,
            planned: plannedTasks,
            onTrack: totalPredicted >= plannedTasks,
            completionRate: Math.round((currentTasks / plannedTasks) * 100)
        };
    }

    /**
     * Тестовые данные
     */
    getDefaultStats() {
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        
        return {
            daily: [
                {
                    startTime: `${today}T08:00:00`,
                    endTime: `${today}T16:00:00`,
                    tasksCompleted: 4,
                    totalLaborHours: 6.5,
                    efficiency: 0.92,
                    breaks: []
                },
                {
                    startTime: `${yesterday}T08:00:00`,
                    endTime: `${yesterday}T16:00:00`,
                    tasksCompleted: 5,
                    totalLaborHours: 7.2,
                    efficiency: 0.88,
                    breaks: []
                }
            ],
            weekly: [],
            monthly: []
        };
    }
}