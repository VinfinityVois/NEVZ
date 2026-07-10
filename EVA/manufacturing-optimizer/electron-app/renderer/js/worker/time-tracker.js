/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - ТРЕКЕР ВРЕМЕНИ
 * ================================================================
 */

export class TimeTracker {
    constructor() {
        this.isRunning = false;
        this.startTime = null;
        this.elapsedSeconds = 0;
        this.pausedAt = null;
        this.interval = null;
        this.listeners = [];
    }

    /**
     * Запуск таймера
     */
    start(initialSeconds = 0) {
        if (this.isRunning) return;
        
        this.elapsedSeconds = initialSeconds;
        this.startTime = Date.now() - this.elapsedSeconds * 1000;
        this.isRunning = true;
        this.pausedAt = null;
        
        this.startInterval();
        this.notifyListeners('start', { elapsed: this.elapsedSeconds });
    }

    /**
     * Пауза
     */
    pause() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        this.pausedAt = Date.now();
        this.stopInterval();
        
        this.notifyListeners('pause', { elapsed: this.elapsedSeconds });
    }

    /**
     * Продолжить
     */
    resume() {
        if (this.isRunning) return;
        if (!this.pausedAt) {
            this.start();
            return;
        }
        
        const pauseDuration = Date.now() - this.pausedAt;
        this.startTime += pauseDuration;
        this.isRunning = true;
        this.pausedAt = null;
        
        this.startInterval();
        this.notifyListeners('resume', { elapsed: this.elapsedSeconds });
    }

    /**
     * Сброс
     */
    reset() {
        this.stop();
        this.elapsedSeconds = 0;
        this.notifyListeners('reset', { elapsed: 0 });
    }

    /**
     * Остановка
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        
        this.isRunning = false;
        this.startTime = null;
        this.pausedAt = null;
        
        this.notifyListeners('stop', { elapsed: this.elapsedSeconds });
    }

    /**
     * Получение текущего времени
     */
    getElapsedTime() {
        if (this.isRunning) {
            this.elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        }
        return this.elapsedSeconds;
    }

    /**
     * Форматирование времени
     */
    getFormattedTime() {
        const seconds = this.getElapsedTime();
        return this.formatDuration(seconds);
    }

    /**
     * Форматирование длительности
     */
    formatDuration(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    /**
     * Получение часов (десятичное)
     */
    getHours() {
        return this.getElapsedTime() / 3600;
    }

    /**
     * Прогресс относительно планового времени
     */
    getProgress(plannedHours) {
        if (!plannedHours || plannedHours <= 0) return 0;
        
        const elapsedHours = this.getHours();
        return Math.min(100, (elapsedHours / plannedHours) * 100);
    }

    /**
     * Запуск интервала
     */
    startInterval() {
        if (this.interval) {
            clearInterval(this.interval);
        }
        
        this.interval = setInterval(() => {
            this.elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
            this.notifyListeners('tick', { elapsed: this.elapsedSeconds });
        }, 1000);
    }

    /**
     * Остановка интервала
     */
    stopInterval() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    /**
     * Добавление слушателя
     */
    addListener(callback) {
        this.listeners.push(callback);
    }

    /**
     * Удаление слушателя
     */
    removeListener(callback) {
        const index = this.listeners.indexOf(callback);
        if (index !== -1) {
            this.listeners.splice(index, 1);
        }
    }

    /**
     * Уведомление слушателей
     */
    notifyListeners(event, data) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('Ошибка в слушателе таймера:', error);
            }
        });
    }

    /**
     * Проверка, запущен ли таймер
     */
    isActive() {
        return this.isRunning;
    }

    /**
     * Проверка, на паузе ли таймер
     */
    isPaused() {
        return !this.isRunning && this.pausedAt !== null;
    }

    /**
     * Уничтожение
     */
    destroy() {
        this.stop();
        this.listeners = [];
    }
}