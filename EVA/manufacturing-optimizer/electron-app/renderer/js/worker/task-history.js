/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - ИСТОРИЯ ЗАДАЧ
 * ================================================================
 */

export class TaskHistory {
    constructor() {
        this.history = [];
        this.filteredHistory = [];
        this.filter = 'all';
        this.sortBy = 'date';
        this.onUpdate = null;
        this.maxItems = 50;
    }

    /**
     * Установка истории
     */
    setHistory(history) {
        this.history = history;
        this.applyFilters();
    }

    /**
     * Применение фильтров
     */
    applyFilters() {
        let filtered = [...this.history];
        
        // Фильтр по дате
        const today = new Date().toISOString().split('T')[0];
        if (this.filter === 'today') {
            filtered = filtered.filter(h => h.completed_at?.startsWith(today));
        } else if (this.filter === 'week') {
            const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
            filtered = filtered.filter(h => h.completed_at >= weekAgo);
        } else if (this.filter === 'month') {
            const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
            filtered = filtered.filter(h => h.completed_at >= monthAgo);
        }
        
        // Сортировка
        filtered = this.sortHistory(filtered);
        
        // Ограничение
        if (filtered.length > this.maxItems) {
            filtered = filtered.slice(0, this.maxItems);
        }
        
        this.filteredHistory = filtered;
        this.notifyUpdate();
        
        return this.filteredHistory;
    }

    /**
     * Сортировка истории
     */
    sortHistory(history) {
        if (this.sortBy === 'date') {
            history.sort((a, b) => {
                return new Date(b.completed_at || 0) - new Date(a.completed_at || 0);
            });
        } else if (this.sortBy === 'duration') {
            history.sort((a, b) => {
                return (b.actual_duration || b.duration || 0) - (a.actual_duration || a.duration || 0);
            });
        } else if (this.sortBy === 'efficiency') {
            history.sort((a, b) => {
                return (b.efficiency || 0) - (a.efficiency || 0);
            });
        }
        
        return history;
    }

    /**
     * Добавление записи
     */
    addEntry(task, actualDuration, actualPeople) {
        const entry = {
            ...task,
            actual_duration: actualDuration,
            actual_people: actualPeople,
            efficiency: task.duration / actualDuration,
            completed_at: new Date().toISOString()
        };
        
        this.history.unshift(entry);
        this.applyFilters();
        
        return entry;
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
     * Получение статистики
     */
    getStatistics() {
        if (this.history.length === 0) {
            return {
                total: 0,
                avgDuration: 0,
                avgEfficiency: 0,
                totalLaborHours: 0
            };
        }
        
        const total = this.history.length;
        const totalDuration = this.history.reduce((sum, h) => 
            sum + (h.actual_duration || h.duration || 0), 0
        );
        const totalEfficiency = this.history.reduce((sum, h) => 
            sum + (h.efficiency || 1), 0
        );
        const totalLabor = this.history.reduce((sum, h) => 
            sum + (h.labor_hours || 0), 0
        );
        
        return {
            total,
            avgDuration: totalDuration / total,
            avgEfficiency: totalEfficiency / total,
            totalLaborHours: totalLabor
        };
    }

    /**
     * Получение лучшего результата
     */
    getBestResult() {
        if (this.history.length === 0) return null;
        
        return this.history.reduce((best, current) => {
            const currentEff = current.efficiency || 0;
            const bestEff = best.efficiency || 0;
            return currentEff > bestEff ? current : best;
        });
    }

    /**
     * Очистка истории
     */
    clear() {
        this.history = [];
        this.filteredHistory = [];
        this.notifyUpdate();
    }

    /**
     * Экспорт истории
     */
    exportHistory() {
        return {
            exported_at: new Date().toISOString(),
            count: this.history.length,
            history: this.history
        };
    }

    /**
     * Уведомление об обновлении
     */
    notifyUpdate() {
        if (this.onUpdate) {
            this.onUpdate(this.filteredHistory);
        }
    }
}