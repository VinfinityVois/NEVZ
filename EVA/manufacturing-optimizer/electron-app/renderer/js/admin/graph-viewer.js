/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - ВИЗУАЛИЗАЦИЯ ГРАФА ПРОЦЕССОВ
 * ================================================================
 * 
 * Этот модуль отвечает за отрисовку и управление графом операций
 * с использованием библиотеки Cytoscape.js.
 * 
 * Возможности:
 * - Отрисовка узлов (операций) и рёбер (связей)
 * - Цветовое кодирование по статусу операции
 * - Подсветка критического пути
 * - Изменение раскладки графа
 * - Зум и панорамирование
 * - Обработка кликов по узлам
 * 
 * Использование:
 *   import { GraphViewer } from './graph-viewer.js';
 *   const viewer = new GraphViewer('cyGraph');
 *   viewer.render(operations, criticalPath);
 *   viewer.onNodeClick = (nodeData) => { ... };
 * 
 * @author Manufacturing Optimizer Team
 * @version 1.0.0
 */

export class GraphViewer {
    
    /**
     * Конструктор
     * @param {string} containerId - ID HTML-элемента, в котором будет граф
     */
    constructor(containerId) {
        // ===== 1. ПОИСК КОНТЕЙНЕРА =====
        this.container = document.getElementById(containerId);
        
        // ===== 2. ССЫЛКА НА ЭКЗЕМПЛЯР CYTOSCAPE =====
        this.cy = null;
        
        // ===== 3. НАСТРОЙКИ ПО УМОЛЧАНИЮ =====
        this.layout = 'dagre';           // раскладка по умолчанию (слева направо)
        this.showCriticalPath = true;    // показывать критический путь
        this.showLabels = true;          // показывать подписи узлов
        this.zoomEnabled = true;         // разрешить зум
        this.panEnabled = true;          // разрешить панорамирование
        
        // ===== 4. КОЛЛБЭКИ =====
        this.onNodeClick = null;         // вызывается при клике на узел
        this.onEdgeClick = null;         // вызывается при клике на ребро
        this.onBackgroundClick = null;   // вызывается при клике на фон
        
        // ===== 5. КЭШ ДАННЫХ =====
        this.operations = [];
        this.criticalPath = [];
        
        // ===== 6. ПРОВЕРКА НАЛИЧИЯ КОНТЕЙНЕРА =====
        if (!this.container) {
            console.error('[GraphViewer] Контейнер не найден:', containerId);
        } else {
            console.log('[GraphViewer] Инициализирован, контейнер:', containerId);
        }
    }

    /**
     * ================================================================
     * ОСНОВНОЙ МЕТОД: ОТРИСОВКА ГРАФА
     * ================================================================
     * 
     * Создаёт или обновляет граф на основе переданных операций.
     * 
     * @param {Array} operations - Массив операций из API
     * @param {Array} criticalPath - Массив номеров операций на критическом пути
     */
    render(operations, criticalPath = []) {
        // ===== 1. ПРОВЕРКА КОНТЕЙНЕРА =====
        if (!this.container) {
            console.error('[GraphViewer] Невозможно отрисовать: контейнер не найден');
            return;
        }

        // ===== 2. СОХРАНЕНИЕ ДАННЫХ В КЭШ =====
        this.operations = operations || [];
        this.criticalPath = criticalPath || [];

        // ===== 3. ПРЕОБРАЗОВАНИЕ ОПЕРАЦИЙ В ЭЛЕМЕНТЫ ГРАФА =====
        const elements = this.convertToElements(this.operations, this.criticalPath);

        // ===== 4. УНИЧТОЖЕНИЕ СТАРОГО ГРАФА (ЕСЛИ ЕСТЬ) =====
        if (this.cy) {
            this.cy.destroy();
            this.cy = null;
        }

        // ===== 5. СОЗДАНИЕ НОВОГО ГРАФА =====
        try {
            this.cy = cytoscape({
                container: this.container,           // HTML-элемент
                elements: elements,                  // узлы и рёбра
                style: this.getGraphStyle(),         // стили оформления
                layout: this.getLayoutOptions(),     // настройки раскладки
                
                // Настройки взаимодействия
                zoom: this.zoomEnabled ? 1 : 1,      // начальный зум
                pan: this.panEnabled ? { x: 0, y: 0 } : { x: 0, y: 0 },
                minZoom: 0.1,                        // минимальный зум
                maxZoom: 3,                          // максимальный зум
                
                // Настройки колёсика мыши
                wheelSensitivity: 0.2,
                
                // Настройки выделения
                selectionType: 'single',             // можно выделить только один элемент
                
                // Настройки рёбер
                styleEnabled: true
            });

            // ===== 6. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ =====
            this.setupEvents();

            console.log('[GraphViewer] Граф отрисован, элементов:', elements.length);

        } catch (error) {
            console.error('[GraphViewer] Ошибка при создании графа:', error);
        }
    }

    /**
     * ================================================================
     * ПРЕОБРАЗОВАНИЕ ОПЕРАЦИЙ В ЭЛЕМЕНТЫ CYTOSCAPE
     * ================================================================
     * 
     * Создаёт массив элементов в формате Cytoscape.js:
     * - Узлы: { data: { id, label, ... } }
     * - Рёбра: { data: { id, source, target } }
     * 
     * @param {Array} operations - Массив операций
     * @param {Array} criticalPath - Критический путь
     * @returns {Array} - Массив элементов для Cytoscape
     */
    convertToElements(operations, criticalPath) {
        const elements = [];
        const nodeIds = new Set(); // для отслеживания существующих узлов

        // ===== 1. СОЗДАНИЕ УЗЛОВ =====
        operations.forEach(op => {
            const opNumber = op.op_number;
            nodeIds.add(`op${opNumber}`);
            
            // Определяем, на критическом ли пути эта операция
            const isCritical = criticalPath.includes(opNumber);
            
            // Определяем статус (по умолчанию pending)
            const status = op.status || 'pending';
            
            // Создаём узел
            elements.push({
                data: {
                    // Уникальный идентификатор узла
                    id: `op${opNumber}`,
                    
                    // Отображаемая метка (полная или короткая)
                    label: this.showLabels 
                        ? `${opNumber}: ${this.truncate(op.name, 15)}` 
                        : `${opNumber}`,
                    
                    // Дополнительные данные для стилей и обработчиков
                    op_number: opNumber,
                    name: op.name,
                    status: status,
                    duration: op.duration || 0,
                    labor_hours: op.labor_hours || 0,
                    people_count: op.people_count || 1,
                    brigade_id: op.brigade_id,
                    isCritical: isCritical,
                    
                    // Для тултипа
                    tooltip: `${opNumber}: ${op.name}\nСтатус: ${this.getStatusText(status)}\nДлительность: ${op.duration}ч`
                }
            });
        });

        // ===== 2. СОЗДАНИЕ РЁБЕР =====
        operations.forEach(op => {
            const sourceId = `op${op.op_number}`;
            const nextOps = op.next_ops || [];
            
            nextOps.forEach(targetOpNumber => {
                const targetId = `op${targetOpNumber}`;
                
                // Проверяем, что целевой узел существует (защита от битых ссылок)
                if (nodeIds.has(targetId)) {
                    // Определяем, оба ли узла на критическом пути
                    const sourceIsCritical = criticalPath.includes(op.op_number);
                    const targetIsCritical = criticalPath.includes(targetOpNumber);
                    
                    elements.push({
                        data: {
                            // Уникальный идентификатор ребра
                            id: `edge_${op.op_number}_${targetOpNumber}`,
                            
                            // Исходный и целевой узлы
                            source: sourceId,
                            target: targetId,
                            
                            // Является ли ребро частью критического пути
                            isCritical: sourceIsCritical && targetIsCritical
                        }
                    });
                } else {
                    console.warn(`[GraphViewer] Пропущено ребро: узел op${targetOpNumber} не найден`);
                }
            });
        });

        return elements;
    }

    /**
     * ================================================================
     * СТИЛИ ГРАФА
     * ================================================================
     * 
     * Определяет внешний вид узлов и рёбер в формате Cytoscape.js.
     * 
     * @returns {Array} - Массив стилей
     */
    getGraphStyle() {
        return [
            // ===== БАЗОВЫЙ СТИЛЬ УЗЛА =====
            {
                selector: 'node',
                style: {
                    // Фон
                    'background-color': '#414B4E',
                    
                    // Текст
                    'label': 'data(label)',
                    'color': '#ffffff',
                    'font-size': '11px',
                    'font-weight': 'bold',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'text-wrap': 'wrap',
                    'text-max-width': '80px',
                    
                    // Размеры
                    'width': 'mapData(duration, 1, 20, 45, 70)',
                    'height': 'mapData(duration, 1, 20, 45, 70)',
                    
                    // Граница
                    'border-width': 2,
                    'border-color': '#ffffff',
                    
                    // Анимация
                    'transition-property': 'background-color, border-color, width, height',
                    'transition-duration': '0.2s'
                }
            },
            
            // ===== СТИЛЬ ДЛЯ ЗАВЕРШЁННЫХ ОПЕРАЦИЙ =====
            {
                selector: 'node[status="completed"]',
                style: {
                    'background-color': '#10b981'  // зелёный
                }
            },
            
            // ===== СТИЛЬ ДЛЯ ОПЕРАЦИЙ В РАБОТЕ =====
            {
                selector: 'node[status="in_progress"]',
                style: {
                    'background-color': '#0961f6'  // синий
                }
            },
            
            // ===== СТИЛЬ ДЛЯ ЗАБЛОКИРОВАННЫХ ОПЕРАЦИЙ =====
            {
                selector: 'node[status="blocked"]',
                style: {
                    'background-color': '#ef4444'  // красный
                }
            },
            
            // ===== СТИЛЬ ДЛЯ УЗЛОВ НА КРИТИЧЕСКОМ ПУТИ =====
            {
                selector: 'node[isCritical="true"]',
                style: {
                    'border-color': '#ef4444',
                    'border-width': 3
                }
            },
            
            // ===== СТИЛЬ ДЛЯ ВЫДЕЛЕННОГО УЗЛА =====
            {
                selector: 'node:selected',
                style: {
                    'border-color': '#0961f6',
                    'border-width': 3,
                    'overlay-opacity': 0.1
                }
            },
            
            // ===== БАЗОВЫЙ СТИЛЬ РЕБРА =====
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#414B4E',
                    'target-arrow-color': '#414B4E',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'arrow-scale': 1.2
                }
            },
            
            // ===== СТИЛЬ ДЛЯ РЁБЕР КРИТИЧЕСКОГО ПУТИ =====
            {
                selector: 'edge[isCritical="true"]',
                style: {
                    'width': 3,
                    'line-color': '#ef4444',
                    'target-arrow-color': '#ef4444'
                }
            },
            
            // ===== СТИЛЬ ДЛЯ ВЫДЕЛЕННОГО РЕБРА =====
            {
                selector: 'edge:selected',
                style: {
                    'width': 3,
                    'line-color': '#0961f6',
                    'target-arrow-color': '#0961f6'
                }
            }
        ];
    }

    /**
     * ================================================================
     * НАСТРОЙКИ РАСКЛАДКИ
     * ================================================================
     * 
     * Возвращает конфигурацию для выбранной раскладки графа.
     * 
     * @returns {Object} - Конфигурация раскладки
     */
    getLayoutOptions() {
        const baseOptions = {
            name: this.layout,
            fit: true,                    // вписать граф в контейнер
            padding: 30,                  // отступы
            animate: true,                // анимация
            animationDuration: 500        // длительность анимации
        };

        // Дополнительные настройки для конкретных раскладок
        switch (this.layout) {
            case 'dagre':
                return {
                    ...baseOptions,
                    rankDir: 'LR',         // слева направо (Left to Right)
                    spacingFactor: 1.5,    // множитель расстояния между узлами
                    nodeSep: 50,           // минимальное расстояние между узлами
                    edgeSep: 10            // расстояние между рёбрами
                };
            
            case 'breadthfirst':
                return {
                    ...baseOptions,
                    directed: true,        // направленный граф
                    spacingFactor: 1.5,
                    roots: this.findRootNodes()  // корневые узлы
                };
            
            case 'circle':
                return {
                    ...baseOptions,
                    radius: 150,
                    sweep: 360
                };
            
            case 'cose':
                return {
                    ...baseOptions,
                    idealEdgeLength: 100,
                    nodeOverlap: 20,
                    refresh: 20
                };
            
            default:
                return baseOptions;
        }
    }

    /**
     * ================================================================
     * ПОИСК КОРНЕВЫХ УЗЛОВ (БЕЗ ВХОДЯЩИХ РЁБЕР)
     * ================================================================
     */
    findRootNodes() {
        const roots = [];
        const hasIncoming = new Set();
        
        this.operations.forEach(op => {
            const nextOps = op.next_ops || [];
            nextOps.forEach(next => hasIncoming.add(`op${next}`));
        });
        
        this.operations.forEach(op => {
            if (!hasIncoming.has(`op${op.op_number}`)) {
                roots.push(`#op${op.op_number}`);
            }
        });
        
        return roots.length > 0 ? roots : undefined;
    }

    /**
     * ================================================================
     * НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ
     * ================================================================
     */
    setupEvents() {
        if (!this.cy) return;

        // ===== КЛИК ПО УЗЛУ =====
        this.cy.on('tap', 'node', (event) => {
            const node = event.target;
            const nodeData = node.data();
            
            console.log('[GraphViewer] Клик по узлу:', nodeData.op_number);
            
            if (this.onNodeClick) {
                this.onNodeClick(nodeData);
            }
        });

        // ===== КЛИК ПО РЕБРУ =====
        this.cy.on('tap', 'edge', (event) => {
            const edge = event.target;
            const edgeData = edge.data();
            
            console.log('[GraphViewer] Клик по ребру:', edgeData.id);
            
            if (this.onEdgeClick) {
                this.onEdgeClick(edgeData);
            }
        });

        // ===== КЛИК ПО ФОНУ =====
        this.cy.on('tap', (event) => {
            if (event.target === this.cy) {
                console.log('[GraphViewer] Клик по фону');
                
                // Снимаем выделение
                this.cy.elements().unselect();
                
                if (this.onBackgroundClick) {
                    this.onBackgroundClick();
                }
            }
        });

        // ===== ДВОЙНОЙ КЛИК ПО УЗЛУ — ФОКУСИРОВКА =====
        this.cy.on('dblclick', 'node', (event) => {
            const node = event.target;
            
            this.cy.animate({
                center: { eles: node },
                zoom: 1.5,
                duration: 500
            });
        });

        // ===== НАВЕДЕНИЕ МЫШИ =====
        this.cy.on('mouseover', 'node', (event) => {
            const node = event.target;
            this.container.style.cursor = 'pointer';
        });

        this.cy.on('mouseout', 'node', () => {
            this.container.style.cursor = 'default';
        });
    }

    /**
     * ================================================================
     * ИЗМЕНЕНИЕ РАСКЛАДКИ
     * ================================================================
     * 
     * @param {string} layoutName - Название раскладки (dagre, circle, cose, breadthfirst)
     */
    changeLayout(layoutName) {
        this.layout = layoutName;
        
        if (this.cy) {
            this.cy.layout(this.getLayoutOptions()).run();
            console.log('[GraphViewer] Раскладка изменена на:', layoutName);
        }
    }

    /**
     * ================================================================
     * ВКЛЮЧЕНИЕ/ВЫКЛЮЧЕНИЕ ОТОБРАЖЕНИЯ КРИТИЧЕСКОГО ПУТИ
     * ================================================================
     */
    toggleCriticalPath(show) {
        this.showCriticalPath = show;
        
        if (this.cy) {
            // Перерисовываем с новыми данными
            this.render(this.operations, show ? this.criticalPath : []);
        }
    }

    /**
     * ================================================================
     * ВКЛЮЧЕНИЕ/ВЫКЛЮЧЕНИЕ ОТОБРАЖЕНИЯ ПОДПИСЕЙ
     * ================================================================
     */
    toggleLabels(show) {
        this.showLabels = show;
        
        if (this.cy) {
            // Обновляем подписи всех узлов
            this.cy.nodes().forEach(node => {
                const data = node.data();
                node.data('label', show 
                    ? `${data.op_number}: ${this.truncate(data.name, 15)}` 
                    : `${data.op_number}`
                );
            });
        }
    }

    /**
     * ================================================================
     * УПРАВЛЕНИЕ ЗУМОМ
     * ================================================================
     */
    zoomIn() {
        if (this.cy) {
            this.cy.zoom(this.cy.zoom() * 1.2);
        }
    }

    zoomOut() {
        if (this.cy) {
            this.cy.zoom(this.cy.zoom() * 0.8);
        }
    }

    fit() {
        if (this.cy) {
            this.cy.fit(50); // с отступом 50px
        }
    }

    resetZoom() {
        if (this.cy) {
            this.cy.zoom(1);
            this.cy.center();
        }
    }

    /**
     * ================================================================
     * ЭКСПОРТ ГРАФА В PNG
     * ================================================================
     */
    exportToPNG(filename = 'graph.png') {
        if (!this.cy) return;
        
        const png = this.cy.png({
            output: 'blob',
            bg: 'white',
            full: true
        });
        
        const url = URL.createObjectURL(png);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        
        console.log('[GraphViewer] Граф экспортирован в PNG');
    }

    /**
     * ================================================================
     * УНИЧТОЖЕНИЕ ГРАФА И ОСВОБОЖДЕНИЕ ПАМЯТИ
     * ================================================================
     */
    destroy() {
        if (this.cy) {
            this.cy.destroy();
            this.cy = null;
            console.log('[GraphViewer] Граф уничтожен');
        }
        this.operations = [];
        this.criticalPath = [];
    }

    /**
     * ================================================================
     * ОБНОВЛЕНИЕ РАЗМЕРА ПРИ ИЗМЕНЕНИИ ОКНА
     * ================================================================
     */
    resize() {
        if (this.cy) {
            this.cy.resize();
            this.cy.fit(30);
        }
    }

    // ================================================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ================================================================

    /**
     * Обрезание длинного текста
     */
    truncate(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    }

    /**
     * Получение текста статуса на русском
     */
    getStatusText(status) {
        const map = {
            pending: 'Ожидает',
            in_progress: 'В работе',
            completed: 'Завершено',
            blocked: 'Заблокировано'
        };
        return map[status] || status;
    }

    /**
     * Проверка, инициализирован ли граф
     */
    isReady() {
        return this.cy !== null;
    }

    /**
     * Получение текущего зума
     */
    getZoom() {
        return this.cy ? this.cy.zoom() : 1;
    }
}

// ================================================================
// ЭКСПОРТ
// ================================================================
// Импортировать: import { GraphViewer } from './graph-viewer.js';