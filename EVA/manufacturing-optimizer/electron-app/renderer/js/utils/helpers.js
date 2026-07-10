/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
 * ================================================================
 */

/**
 * Дебаунс функции
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Троттлинг функции
 */
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Глубокое клонирование
 */
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    
    const clonedObj = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            clonedObj[key] = deepClone(obj[key]);
        }
    }
    return clonedObj;
}

/**
 * Генерация уникального ID
 */
export function generateId(prefix = '') {
    return `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Форматирование числа
 */
export function formatNumber(num, decimals = 2) {
    if (num === null || num === undefined) return '0';
    return Number(num).toFixed(decimals);
}

/**
 * Форматирование процентов
 */
export function formatPercent(value, decimals = 1) {
    if (value === null || value === undefined) return '0%';
    return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Группировка массива по ключу
 */
export function groupBy(array, key) {
    return array.reduce((result, item) => {
        const groupKey = typeof key === 'function' ? key(item) : item[key];
        if (!result[groupKey]) result[groupKey] = [];
        result[groupKey].push(item);
        return result;
    }, {});
}

/**
 * Сортировка массива по нескольким полям
 */
export function sortBy(array, ...keys) {
    return [...array].sort((a, b) => {
        for (const key of keys) {
            const aVal = typeof key === 'function' ? key(a) : a[key];
            const bVal = typeof key === 'function' ? key(b) : b[key];
            
            if (aVal < bVal) return -1;
            if (aVal > bVal) return 1;
        }
        return 0;
    });
}

/**
 * Фильтрация массива по поисковому запросу
 */
export function filterBySearch(array, query, fields) {
    if (!query) return array;
    
    const lowerQuery = query.toLowerCase();
    
    return array.filter(item => {
        return fields.some(field => {
            const value = item[field];
            return value && String(value).toLowerCase().includes(lowerQuery);
        });
    });
}

/**
 * Получение цвета в зависимости от значения
 */
export function getColorByValue(value, thresholds, colors) {
    for (let i = 0; i < thresholds.length; i++) {
        if (value <= thresholds[i]) {
            return colors[i];
        }
    }
    return colors[colors.length - 1];
}

/**
 * Получение текста статуса
 */
export function getStatusText(status, locale = 'ru') {
    const statusMap = {
        ru: {
            pending: 'Ожидает',
            in_progress: 'В работе',
            completed: 'Завершено',
            blocked: 'Заблокировано',
            cancelled: 'Отменено'
        },
        en: {
            pending: 'Pending',
            in_progress: 'In Progress',
            completed: 'Completed',
            blocked: 'Blocked',
            cancelled: 'Cancelled'
        }
    };
    
    return statusMap[locale]?.[status] || status;
}

/**
 * Получение цвета статуса
 */
export function getStatusColor(status) {
    const colorMap = {
        pending: '#414B4E',
        in_progress: '#0961f6',
        completed: '#10b981',
        blocked: '#f59e0b',
        cancelled: '#ef4444'
    };
    
    return colorMap[status] || '#414B4E';
}

/**
 * Получение текста приоритета
 */
export function getPriorityText(priority, locale = 'ru') {
    const priorityMap = {
        ru: {
            low: 'Низкий',
            medium: 'Средний',
            high: 'Высокий',
            critical: 'Критический'
        },
        en: {
            low: 'Low',
            medium: 'Medium',
            high: 'High',
            critical: 'Critical'
        }
    };
    
    return priorityMap[locale]?.[priority] || priority;
}

/**
 * Получение цвета приоритета
 */
export function getPriorityColor(priority) {
    const colorMap = {
        low: '#10b981',
        medium: '#f59e0b',
        high: '#f97316',
        critical: '#ef4444'
    };
    
    return colorMap[priority] || '#414B4E';
}

/**
 * Склонение числительных
 */
export function pluralize(count, forms, locale = 'ru') {
    if (locale === 'ru') {
        const mod10 = count % 10;
        const mod100 = count % 100;
        
        if (mod10 === 1 && mod100 !== 11) return `${count} ${forms[0]}`;
        if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
            return `${count} ${forms[1]}`;
        }
        return `${count} ${forms[2]}`;
    }
    
    // English
    return `${count} ${count === 1 ? forms[0] : forms[1]}`;
}

/**
 * Обрезание текста
 */
export function truncate(text, maxLength, suffix = '...') {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Капитализация первой буквы
 */
export function capitalize(text) {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Преобразование camelCase в раздельные слова
 */
export function camelToWords(text) {
    return text
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

/**
 * Ожидание
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Повторение запроса с экспоненциальной задержкой
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            const delay = baseDelay * Math.pow(2, i);
            await sleep(delay);
        }
    }
    
    throw lastError;
}

/**
 * Безопасное выполнение JSON.parse
 */
export function safeJsonParse(str, defaultValue = null) {
    try {
        return JSON.parse(str);
    } catch {
        return defaultValue;
    }
}

/**
 * Проверка на пустой объект
 */
export function isEmpty(obj) {
    if (!obj) return true;
    if (Array.isArray(obj)) return obj.length === 0;
    if (typeof obj === 'object') return Object.keys(obj).length === 0;
    return !obj;
}

/**
 * Удаление falsy значений из объекта
 */
export function compactObject(obj) {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, value]) => value != null && value !== '')
    );
}