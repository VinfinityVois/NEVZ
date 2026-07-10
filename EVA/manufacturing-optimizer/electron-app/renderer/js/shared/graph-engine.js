/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - ДВИЖОК ГРАФОВ (CPM НА JAVASCRIPT)
 * ================================================================
 */

export class GraphEngine {
    constructor() {
        this.nodes = new Map();
        this.edges = new Map();
    }

    /**
     * Добавление узла
     */
    addNode(id, data = {}) {
        this.nodes.set(id, {
            id,
            duration: data.duration || 0,
            name: data.name || '',
            status: data.status || 'pending',
            ...data
        });
    }

    /**
     * Добавление ребра
     */
    addEdge(from, to) {
        const edgeId = `${from}->${to}`;
        this.edges.set(edgeId, { from, to });
        
        // Обновляем связи в узлах
        const fromNode = this.nodes.get(from);
        const toNode = this.nodes.get(to);
        
        if (fromNode) {
            fromNode.next = fromNode.next || [];
            if (!fromNode.next.includes(to)) {
                fromNode.next.push(to);
            }
        }
        
        if (toNode) {
            toNode.prev = toNode.prev || [];
            if (!toNode.prev.includes(from)) {
                toNode.prev.push(from);
            }
        }
    }

    /**
     * Построение графа из операций
     */
    buildFromOperations(operations) {
        this.nodes.clear();
        this.edges.clear();
        
        // Добавляем узлы
        operations.forEach(op => {
            this.addNode(op.op_number, {
                duration: op.duration || 0,
                name: op.name || '',
                status: op.status || 'pending',
                labor_hours: op.labor_hours,
                people_count: op.people_count,
                brigade_id: op.brigade_id,
                time_reserve: op.time_reserve
            });
        });
        
        // Добавляем рёбра
        operations.forEach(op => {
            const nextOps = Array.isArray(op.next_ops) ? op.next_ops : [];
            nextOps.forEach(nextId => {
                if (this.nodes.has(nextId)) {
                    this.addEdge(op.op_number, nextId);
                }
            });
        });
    }

    /**
     * Топологическая сортировка
     */
    topologicalSort() {
        const inDegree = new Map();
        const queue = [];
        const result = [];
        
        // Инициализация степеней входа
        this.nodes.forEach((_, id) => {
            inDegree.set(id, 0);
        });
        
        this.edges.forEach(edge => {
            inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
        });
        
        // Находим начальные узлы
        inDegree.forEach((degree, id) => {
            if (degree === 0) queue.push(id);
        });
        
        // Сортировка
        while (queue.length > 0) {
            const current = queue.shift();
            result.push(current);
            
            const node = this.nodes.get(current);
            if (node && node.next) {
                node.next.forEach(nextId => {
                    inDegree.set(nextId, inDegree.get(nextId) - 1);
                    if (inDegree.get(nextId) === 0) {
                        queue.push(nextId);
                    }
                });
            }
        }
        
        // Проверка на циклы
        if (result.length !== this.nodes.size) {
            console.warn('⚠️ Обнаружен цикл в графе');
        }
        
        return result;
    }

    /**
     * Расчёт критического пути (CPM)
     */
    calculateCriticalPath() {
        const sorted = this.topologicalSort();
        
        // Early Start и Early Finish
        const es = new Map();
        const ef = new Map();
        
        sorted.forEach(id => {
            const node = this.nodes.get(id);
            const predecessors = node.prev || [];
            
            let maxEf = 0;
            predecessors.forEach(prevId => {
                maxEf = Math.max(maxEf, ef.get(prevId) || 0);
            });
            
            es.set(id, maxEf);
            ef.set(id, maxEf + (node.duration || 0));
        });
        
        const projectDuration = Math.max(...Array.from(ef.values()));
        
        // Late Start и Late Finish
        const ls = new Map();
        const lf = new Map();
        
        [...sorted].reverse().forEach(id => {
            const node = this.nodes.get(id);
            const successors = node.next || [];
            
            let minLs = projectDuration;
            successors.forEach(nextId => {
                minLs = Math.min(minLs, ls.get(nextId) || projectDuration);
            });
            
            lf.set(id, minLs);
            ls.set(id, minLs - (node.duration || 0));
        });
        
        // Критический путь и резервы
        const criticalPath = [];
        const slacks = new Map();
        
        sorted.forEach(id => {
            const slack = (ls.get(id) || 0) - (es.get(id) || 0);
            slacks.set(id, slack);
            
            if (Math.abs(slack) < 0.001) {
                criticalPath.push(id);
            }
        });
        
        return {
            projectDuration,
            criticalPath,
            slacks: Object.fromEntries(slacks),
            es: Object.fromEntries(es),
            ef: Object.fromEntries(ef),
            ls: Object.fromEntries(ls),
            lf: Object.fromEntries(lf),
            sortedNodes: sorted
        };
    }

    /**
     * Получение информации о критическом пути
     */
    getCriticalPathInfo() {
        const cpm = this.calculateCriticalPath();
        const pathNodes = cpm.criticalPath.map(id => ({
            id,
            name: this.nodes.get(id)?.name || '',
            duration: this.nodes.get(id)?.duration || 0
        }));
        
        return {
            path: pathNodes,
            length: pathNodes.length,
            totalDuration: cpm.projectDuration,
            nodes: cpm.sortedNodes.map(id => ({
                id,
                name: this.nodes.get(id)?.name || '',
                duration: this.nodes.get(id)?.duration || 0,
                earlyStart: cpm.es[id] || 0,
                earlyFinish: cpm.ef[id] || 0,
                lateStart: cpm.ls[id] || 0,
                lateFinish: cpm.lf[id] || 0,
                slack: cpm.slacks[id] || 0,
                isCritical: Math.abs(cpm.slacks[id] || 0) < 0.001
            }))
        };
    }

    /**
     * Проверка зависимостей для узла
     */
    areDependenciesMet(nodeId, completedNodes = []) {
        const node = this.nodes.get(nodeId);
        if (!node || !node.prev) return true;
        
        return node.prev.every(prevId => completedNodes.includes(prevId));
    }

    /**
     * Получение доступных узлов (все зависимости выполнены)
     */
    getAvailableNodes(completedNodes = []) {
        const available = [];
        
        this.nodes.forEach((node, id) => {
            if (!completedNodes.includes(id) && this.areDependenciesMet(id, completedNodes)) {
                available.push({
                    id,
                    name: node.name,
                    duration: node.duration,
                    status: node.status
                });
            }
        });
        
        return available;
    }

    /**
     * Экспорт графа в формат для визуализации
     */
    exportForVisualization() {
        const cpm = this.calculateCriticalPath();
        const elements = [];
        
        // Узлы
        this.nodes.forEach((node, id) => {
            elements.push({
                data: {
                    id: `op${id}`,
                    label: `${id}: ${node.name}`,
                    op_number: id,
                    name: node.name,
                    duration: node.duration,
                    status: node.status,
                    isCritical: cpm.criticalPath.includes(id),
                    earlyStart: cpm.es[id],
                    earlyFinish: cpm.ef[id],
                    lateStart: cpm.ls[id],
                    lateFinish: cpm.lf[id],
                    slack: cpm.slacks[id]
                }
            });
        });
        
        // Рёбра
        this.edges.forEach(edge => {
            const sourceCritical = cpm.criticalPath.includes(edge.from);
            const targetCritical = cpm.criticalPath.includes(edge.to);
            
            elements.push({
                data: {
                    id: `edge${edge.from}-${edge.to}`,
                    source: `op${edge.from}`,
                    target: `op${edge.to}`,
                    isCritical: sourceCritical && targetCritical
                }
            });
        });
        
        return elements;
    }
}