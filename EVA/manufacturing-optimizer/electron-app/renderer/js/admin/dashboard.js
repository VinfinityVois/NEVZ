/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - ДАШБОРД АДМИНИСТРАТОРА
 * ================================================================
 */

export class Dashboard {
    constructor() {
        this.stats = {
            totalOperations: 0,
            completedOperations: 0,
            inProgressOperations: 0,
            activeBrigades: 0,
            efficiency: 0,
            criticalPathLength: 0
        };
        this.charts = {};
        this.refreshInterval = null;
    }

    /**
     * Инициализация дашборда
     */
    async init() {
        await this.loadStats();
        this.initCharts();
        this.startAutoRefresh();
    }

    /**
     * Загрузка статистики
     */
    async loadStats() {
        try {
            // Здесь должен быть API запрос
            this.stats = await this.fetchStats();
            this.updateUI();
            return this.stats;
        } catch (error) {
            console.error('Ошибка загрузки статистики:', error);
            this.stats = this.getDefaultStats();
            this.updateUI();
            return this.stats;
        }
    }

    /**
     * Получение статистики с сервера
     */
    async fetchStats() {
        // Имитация API запроса
        return new Promise(resolve => {
            setTimeout(() => {
                resolve({
                    totalOperations: 270,
                    completedOperations: 145,
                    inProgressOperations: 12,
                    activeBrigades: 8,
                    efficiency: 87,
                    criticalPathLength: 7,
                    avgTaskTime: 4.5,
                    totalLaborHours: 1240,
                    brigadesLoad: [
                        { id: 1, name: 'Подготовка', load: 45 },
                        { id: 2, name: 'Раскрой', load: 78 },
                        { id: 3, name: 'Пошив', load: 62 },
                        { id: 4, name: 'Сборка', load: 33 },
                        { id: 5, name: 'ОТК', load: 51 }
                    ],
                    operationsByStatus: {
                        pending: 98,
                        in_progress: 12,
                        completed: 145,
                        blocked: 15
                    },
                    dailyProgress: [
                        { date: '2024-01-08', completed: 18 },
                        { date: '2024-01-09', completed: 22 },
                        { date: '2024-01-10', completed: 20 },
                        { date: '2024-01-11', completed: 25 },
                        { date: '2024-01-12', completed: 19 },
                        { date: '2024-01-13', completed: 23 },
                        { date: '2024-01-14', completed: 18 }
                    ]
                });
            }, 500);
        });
    }

    /**
     * Инициализация графиков
     */
    initCharts() {
        this.initProgressChart();
        this.initBrigadesLoadChart();
        this.initStatusChart();
    }

    /**
     * График прогресса
     */
    initProgressChart() {
        const canvas = document.getElementById('progressCanvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        this.charts.progress = {
            update: (data) => {
                this.drawProgressChart(ctx, data);
            }
        };
        
        if (this.stats.dailyProgress) {
            this.charts.progress.update(this.stats.dailyProgress);
        }
    }

    /**
     * Отрисовка графика прогресса
     */
    drawProgressChart(ctx, data) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const padding = 40;
        
        // Очистка
        ctx.clearRect(0, 0, width, height);
        
        if (!data || data.length === 0) return;
        
        // Настройки
        const chartWidth = width - 2 * padding;
        const chartHeight = height - 2 * padding;
        const maxValue = Math.max(...data.map(d => d.completed)) * 1.2;
        
        // Рисуем оси
        ctx.beginPath();
        ctx.strokeStyle = '#414B4E';
        ctx.lineWidth = 1;
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
        
        // Рисуем столбцы
        const barWidth = chartWidth / data.length * 0.7;
        const barSpacing = chartWidth / data.length * 0.3;
        
        data.forEach((item, index) => {
            const x = padding + index * (barWidth + barSpacing);
            const barHeight = (item.completed / maxValue) * chartHeight;
            const y = height - padding - barHeight;
            
            // Градиент
            const gradient = ctx.createLinearGradient(x, y, x, height - padding);
            gradient.addColorStop(0, '#0961f6');
            gradient.addColorStop(1, '#414B4E');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, barWidth, barHeight);
            
            // Подпись
            ctx.fillStyle = '#414B4E';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(item.date.slice(5), x + barWidth / 2, height - padding + 15);
        });
    }

    /**
     * График загрузки бригад
     */
    initBrigadesLoadChart() {
        const canvas = document.getElementById('brigadeLoadCanvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        this.charts.brigades = {
            update: (data) => {
                this.drawBrigadesChart(ctx, data);
            }
        };
        
        if (this.stats.brigadesLoad) {
            this.charts.brigades.update(this.stats.brigadesLoad);
        }
    }

    /**
     * Отрисовка графика загрузки бригад
     */
    drawBrigadesChart(ctx, data) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const padding = 40;
        
        ctx.clearRect(0, 0, width, height);
        
        if (!data || data.length === 0) return;
        
        const chartWidth = width - 2 * padding;
        const chartHeight = height - 2 * padding;
        
        // Рисуем оси
        ctx.beginPath();
        ctx.strokeStyle = '#414B4E';
        ctx.lineWidth = 1;
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
        
        // Рисуем горизонтальные линии
        ctx.strokeStyle = '#d6e0e5';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 100; i += 20) {
            const y = height - padding - (i / 100) * chartHeight;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
            
            ctx.fillStyle = '#414B4E';
            ctx.font = '10px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(i + '%', padding - 5, y + 3);
        }
        
        // Рисуем столбцы
        const barWidth = chartWidth / data.length * 0.6;
        const barSpacing = chartWidth / data.length * 0.4;
        
        data.forEach((item, index) => {
            const x = padding + index * (barWidth + barSpacing);
            const barHeight = (item.load / 100) * chartHeight;
            const y = height - padding - barHeight;
            
            // Цвет в зависимости от загрузки
            let color;
            if (item.load > 80) color = '#ef4444';
            else if (item.load > 60) color = '#f59e0b';
            else if (item.load > 30) color = '#0961f6';
            else color = '#10b981';
            
            ctx.fillStyle = color;
            ctx.fillRect(x, y, barWidth, barHeight);
            
            // Название бригады
            ctx.fillStyle = '#414B4E';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(item.name.substring(0, 8), x + barWidth / 2, height - padding + 15);
        });
    }

    /**
     * Круговая диаграмма статусов
     */
    initStatusChart() {
        // Можно добавить позже
    }

    /**
     * Обновление UI
     */
    updateUI() {
        // Обновляем счётчики
        this.updateCounter('totalOps', this.stats.totalOperations);
        this.updateCounter('completedOps', this.stats.completedOperations);
        this.updateCounter('inProgressOps', this.stats.inProgressOperations);
        this.updateCounter('activeBrigadesCount', this.stats.activeBrigades);
        
        // Обновляем критический путь
        const cpLength = document.getElementById('criticalPathLength');
        if (cpLength) {
            cpLength.textContent = `${this.stats.criticalPathLength} операций`;
        }
        
        // Обновляем эффективность
        const efficiency = document.getElementById('efficiency');
        if (efficiency) {
            efficiency.textContent = `${this.stats.efficiency}%`;
        }
        
        // Обновляем графики
        if (this.charts.progress && this.stats.dailyProgress) {
            this.charts.progress.update(this.stats.dailyProgress);
        }
        if (this.charts.brigades && this.stats.brigadesLoad) {
            this.charts.brigades.update(this.stats.brigadesLoad);
        }
    }

    /**
     * Анимация счётчика
     */
    updateCounter(id, value) {
        const element = document.getElementById(id);
        if (!element) return;
        
        const current = parseInt(element.textContent) || 0;
        this.animateNumber(element, current, value, 500);
    }

    /**
     * Анимация числа
     */
    animateNumber(element, start, end, duration) {
        const range = end - start;
        const increment = range / (duration / 16);
        let current = start;
        
        const timer = setInterval(() => {
            current += increment;
            if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
                element.textContent = Math.round(end);
                clearInterval(timer);
            } else {
                element.textContent = Math.round(current);
            }
        }, 16);
    }

    /**
     * Запуск автообновления
     */
    startAutoRefresh() {
        this.refreshInterval = setInterval(() => {
            this.loadStats();
        }, 30000); // Каждые 30 секунд
    }

    /**
     * Остановка автообновления
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    /**
     * Принудительное обновление
     */
    async refresh() {
        await this.loadStats();
        return this.stats;
    }

    /**
     * Экспорт данных дашборда
     */
    exportData() {
        return {
            exported_at: new Date().toISOString(),
            stats: this.stats
        };
    }

    /**
     * Статистика по умолчанию
     */
    getDefaultStats() {
        return {
            totalOperations: 270,
            completedOperations: 145,
            inProgressOperations: 12,
            activeBrigades: 8,
            efficiency: 87,
            criticalPathLength: 7,
            avgTaskTime: 4.5,
            totalLaborHours: 1240,
            brigadesLoad: [
                { id: 1, name: 'Подготовка', load: 45 },
                { id: 2, name: 'Раскрой', load: 78 },
                { id: 3, name: 'Пошив', load: 62 },
                { id: 4, name: 'Сборка', load: 33 },
                { id: 5, name: 'ОТК', load: 51 }
            ],
            operationsByStatus: {
                pending: 98,
                in_progress: 12,
                completed: 145,
                blocked: 15
            },
            dailyProgress: [
                { date: '2024-01-08', completed: 18 },
                { date: '2024-01-09', completed: 22 },
                { date: '2024-01-10', completed: 20 },
                { date: '2024-01-11', completed: 25 },
                { date: '2024-01-12', completed: 19 },
                { date: '2024-01-13', completed: 23 },
                { date: '2024-01-14', completed: 18 }
            ]
        };
    }

    /**
     * Уничтожение
     */
    destroy() {
        this.stopAutoRefresh();
        this.charts = {};
    }
}