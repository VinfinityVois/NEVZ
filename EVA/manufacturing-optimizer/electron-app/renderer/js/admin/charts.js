/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - МОДУЛЬ ГРАФИКОВ
 * ================================================================
 * 
 * Этот модуль отвечает за отрисовку всех графиков в админ-панели:
 * - Круговая диаграмма прогресса операций (статусы)
 * - Столбчатая диаграмма загрузки бригад
 * 
 * Использование:
 *   import { ChartsManager } from './charts.js';
 *   const charts = new ChartsManager();
 *   charts.renderProgressChart(canvasElement, operationsArray);
 *   charts.renderBrigadeChart(canvasElement, brigadesArray);
 * 
 * @author Manufacturing Optimizer Team
 * @version 1.0.0
 */

export class ChartsManager {
    
    /**
     * Конструктор
     * Инициализирует пустой объект для хранения ссылок на графики
     */
    constructor() {
        // Здесь можно хранить ссылки на графики, если нужно их обновлять
        this.charts = {};
    }

    /**
     * ================================================================
     * ОТРИСОВКА КРУГОВОЙ ДИАГРАММЫ ПРОГРЕССА ОПЕРАЦИЙ
     * ================================================================
     * 
     * Рисует круговую диаграмму (pie chart) на Canvas, показывающую
     * распределение операций по статусам:
     * - Завершено (completed) - зелёный (#10b981)
     * - В работе (in_progress) - синий (#0961f6)
     * - Ожидает (pending) - жёлтый (#f59e0b)
     * - Заблокировано (blocked) - красный (#ef4444)
     * 
     * @param {HTMLCanvasElement} canvas - Элемент canvas для отрисовки
     * @param {Array} operations - Массив операций из AdminState
     */
    renderProgressChart(canvas, operations) {
        // ===== 1. ПРОВЕРКА НАЛИЧИЯ CANVAS =====
        if (!canvas) {
            console.warn('[Charts] Canvas для прогресса не найден');
            return;
        }

        // ===== 2. ПОЛУЧЕНИЕ КОНТЕКСТА И НАСТРОЙКА РАЗМЕРОВ =====
        const ctx = canvas.getContext('2d');
        
        // Устанавливаем размеры canvas на основе его отображаемого размера
        // Это важно для чёткой отрисовки на экранах с разным DPI
        const width = canvas.offsetWidth || 400;   // ширина по умолчанию 400px
        const height = canvas.height = 200;        // фиксированная высота 200px
        canvas.width = width;
        
        // Очищаем canvas перед отрисовкой
        ctx.clearRect(0, 0, width, height);

        // ===== 3. ПОДСЧЁТ КОЛИЧЕСТВА ОПЕРАЦИЙ ПО СТАТУСАМ =====
        const statusCounts = {
            completed: operations.filter(op => op.status === 'completed').length,
            in_progress: operations.filter(op => op.status === 'in_progress').length,
            pending: operations.filter(op => op.status === 'pending').length,
            blocked: operations.filter(op => op.status === 'blocked').length
        };

        // Общее количество операций (если 0, то берём 1 чтобы избежать деления на 0)
        const total = operations.length || 1;

        // ===== 4. ПОДГОТОВКА ДАННЫХ ДЛЯ ОТРИСОВКИ =====
        // Каждый элемент содержит: название, значение, цвет
        const data = [
            { label: 'Завершено', value: statusCounts.completed, color: '#10b981' },
            { label: 'В работе', value: statusCounts.in_progress, color: '#0961f6' },
            { label: 'Ожидает', value: statusCounts.pending, color: '#f59e0b' },
            { label: 'Заблокировано', value: statusCounts.blocked, color: '#ef4444' }
        ].filter(item => item.value > 0); // Показываем только те статусы, где есть операции

        // ===== 5. ПРОВЕРКА НАЛИЧИЯ ДАННЫХ =====
        if (data.length === 0) {
            // Если данных нет, показываем сообщение
            ctx.fillStyle = '#414B4E';
            ctx.font = '14px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Нет данных для отображения', width / 2, height / 2);
            return;
        }

        // ===== 6. ПАРАМЕТРЫ ДЛЯ ОТРИСОВКИ КРУГА =====
        const centerX = width / 2;                           // центр по X
        const centerY = height / 2;                          // центр по Y
        const radius = Math.min(width, height) / 2 - 30;     // радиус с отступом для легенды
        
        let startAngle = 0;  // начальный угол (в радианах)

        // ===== 7. ОТРИСОВКА СЕГМЕНТОВ КРУГА =====
        data.forEach(item => {
            // Вычисляем угол сегмента пропорционально значению
            const angle = (item.value / total) * 2 * Math.PI;

            // Начинаем новый путь
            ctx.beginPath();
            
            // Устанавливаем цвет заливки
            ctx.fillStyle = item.color;
            
            // Рисуем сегмент круга
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + angle);
            ctx.closePath();
            
            // Заливаем сегмент
            ctx.fill();

            // ===== 8. ДОБАВЛЕНИЕ ПРОЦЕНТОВ ВНУТРИ СЕГМЕНТА =====
            // Вычисляем середину сегмента для размещения текста
            const midAngle = startAngle + angle / 2;
            
            // Координаты для текста (на 70% радиуса от центра)
            const labelX = centerX + Math.cos(midAngle) * (radius * 0.7);
            const labelY = centerY + Math.sin(midAngle) * (radius * 0.7);

            // Настройка стиля текста
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Вычисляем процент и выводим
            const percent = Math.round((item.value / total) * 100);
            ctx.fillText(`${percent}%`, labelX, labelY);

            // Перемещаем начальный угол для следующего сегмента
            startAngle += angle;
        });

        // ===== 9. ОТРИСОВКА ЛЕГЕНДЫ =====
        let legendY = 20;  // начальная позиция по Y для легенды
        
        data.forEach(item => {
            // Рисуем цветной квадратик
            ctx.fillStyle = item.color;
            ctx.fillRect(20, legendY, 12, 12);
            
            // Рисуем текст легенды
            ctx.fillStyle = '#414B4E';
            ctx.font = '11px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(`${item.label}: ${item.value}`, 38, legendY);
            
            // Смещаемся вниз для следующего элемента легенды
            legendY += 20;
        });
    }

    /**
     * ================================================================
     * ОТРИСОВКА СТОЛБЧАТОЙ ДИАГРАММЫ ЗАГРУЗКИ БРИГАД
     * ================================================================
     * 
     * Рисует столбчатую диаграмму (bar chart) на Canvas, показывающую
     * загрузку каждой бригады в процентах.
     * 
     * Цвета столбцов зависят от уровня загрузки:
     * - 0-30%: зелёный (#10b981) - низкая загрузка
     * - 30-60%: синий (#0961f6) - нормальная загрузка
     * - 60-80%: жёлтый (#f59e0b) - высокая загрузка
     * - 80-100%: красный (#ef4444) - критическая загрузка
     * 
     * @param {HTMLCanvasElement} canvas - Элемент canvas для отрисовки
     * @param {Array} brigades - Массив бригад из AdminState
     */
    renderBrigadeChart(canvas, brigades) {
        // ===== 1. ПРОВЕРКА НАЛИЧИЯ CANVAS =====
        if (!canvas) {
            console.warn('[Charts] Canvas для бригад не найден');
            return;
        }

        // ===== 2. ПОЛУЧЕНИЕ КОНТЕКСТА И НАСТРОЙКА РАЗМЕРОВ =====
        const ctx = canvas.getContext('2d');
        
        const width = canvas.offsetWidth || 500;
        const height = canvas.height = 200;
        canvas.width = width;
        
        ctx.clearRect(0, 0, width, height);

        // ===== 3. ПРОВЕРКА НАЛИЧИЯ ДАННЫХ =====
        // Показываем только первые 6 бригад, чтобы не перегружать график
        const displayBrigades = brigades.slice(0, 6);
        
        if (displayBrigades.length === 0) {
            ctx.fillStyle = '#414B4E';
            ctx.font = '14px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Нет данных о бригадах', width / 2, height / 2);
            return;
        }

        // ===== 4. ВЫЧИСЛЕНИЕ РАЗМЕРОВ СТОЛБЦОВ =====
        // Ширина одного столбца (не больше 50px)
        const barWidth = Math.min(50, (width - 80) / displayBrigades.length - 10);
        
        // Максимальная загрузка для масштабирования (не меньше 100%)
        const maxLoad = Math.max(...displayBrigades.map(b => b.current_load || 0), 100);

        // ===== 5. ОТРИСОВКА СТОЛБЦОВ =====
        displayBrigades.forEach((brigade, index) => {
            // Вычисляем позицию столбца
            const x = 50 + index * (barWidth + 15);
            
            // Вычисляем высоту столбца (пропорционально загрузке)
            const currentLoad = brigade.current_load || 0;
            const barHeight = (currentLoad / maxLoad) * (height - 50);
            const y = height - 20 - barHeight;

            // ===== 6. ВЫБОР ЦВЕТА В ЗАВИСИМОСТИ ОТ ЗАГРУЗКИ =====
            let color;
            if (currentLoad > 80) {
                color = '#ef4444';      // красный - критическая
            } else if (currentLoad > 60) {
                color = '#f59e0b';      // жёлтый - высокая
            } else if (currentLoad > 30) {
                color = '#0961f6';      // синий - нормальная
            } else {
                color = '#10b981';      // зелёный - низкая
            }

            // ===== 7. СОЗДАНИЕ ГРАДИЕНТА ДЛЯ ОБЪЁМНОГО ЭФФЕКТА =====
            const gradient = ctx.createLinearGradient(x, y, x + barWidth, height - 20);
            gradient.addColorStop(0, color);                        // основной цвет
            gradient.addColorStop(1, this.shadeColor(color, -20));  // затемнённый

            // ===== 8. ОТРИСОВКА СТОЛБЦА =====
            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, barWidth, barHeight);

            // ===== 9. ПОДПИСЬ НАЗВАНИЯ БРИГАДЫ =====
            ctx.fillStyle = '#414B4E';
            ctx.font = '10px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            
            // Обрезаем название если слишком длинное
            const shortName = brigade.name.length > 8 
                ? brigade.name.substring(0, 6) + '..' 
                : brigade.name;
            ctx.fillText(shortName, x + barWidth / 2, height - 15);

            // ===== 10. ПОДПИСЬ ПРОЦЕНТА ЗАГРУЗКИ НАД СТОЛБЦОМ =====
            ctx.fillStyle = color;
            ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
            ctx.fillText(`${Math.round(currentLoad)}%`, x + barWidth / 2, y - 5);
        });

        // ===== 11. ОТРИСОВКА ГОРИЗОНТАЛЬНОЙ ЛИНИИ (ОСЬ X) =====
        ctx.beginPath();
        ctx.strokeStyle = '#414B4E';
        ctx.lineWidth = 1;
        ctx.moveTo(40, height - 20);
        ctx.lineTo(width - 20, height - 20);
        ctx.stroke();
    }

    /**
     * ================================================================
     * ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: ЗАТЕМНЕНИЕ ЦВЕТА
     * ================================================================
     * 
     * Принимает HEX-цвет и процент, на который нужно его затемнить или осветлить.
     * Используется для создания градиентов на столбцах.
     * 
     * @param {string} color - Цвет в формате HEX (например, '#10b981')
     * @param {number} percent - Процент изменения (-100 до 100)
     * @returns {string} - Изменённый цвет в формате HEX
     */
    shadeColor(color, percent) {
        // Извлекаем RGB компоненты из HEX
        let R = parseInt(color.substring(1, 3), 16);
        let G = parseInt(color.substring(3, 5), 16);
        let B = parseInt(color.substring(5, 7), 16);

        // Изменяем каждый компонент
        R = Math.max(0, Math.min(255, R + percent));
        G = Math.max(0, Math.min(255, G + percent));
        B = Math.max(0, Math.min(255, B + percent));

        // Собираем обратно в HEX
        return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
    }

    /**
     * ================================================================
     * ОЧИСТКА ВСЕХ ГРАФИКОВ
     * ================================================================
     */
    clearAll() {
        this.charts = {};
    }

    /**
     * ================================================================
     * ОБНОВЛЕНИЕ РАЗМЕРОВ ПРИ ИЗМЕНЕНИИ ОКНА
     * ================================================================
     * 
     * @param {Array} operations - Операции для перерисовки
     * @param {Array} brigades - Бригады для перерисовки
     */
    resize(operations, brigades) {
        const progressCanvas = document.getElementById('progressCanvas');
        const brigadeCanvas = document.getElementById('brigadeLoadCanvas');
        
        if (progressCanvas && operations) {
            this.renderProgressChart(progressCanvas, operations);
        }
        if (brigadeCanvas && brigades) {
            this.renderBrigadeChart(brigadeCanvas, brigades);
        }
    }
}

// ================================================================
// ЭКСПОРТ ДЛЯ ИСПОЛЬЗОВАНИЯ В ДРУГИХ МОДУЛЯХ
// ================================================================
// Этот класс экспортируется как именованный экспорт.
// Импортировать так: import { ChartsManager } from './charts.js';