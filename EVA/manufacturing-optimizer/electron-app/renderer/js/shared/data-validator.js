/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - ВАЛИДАЦИЯ ДАННЫХ
 * ================================================================
 */

/**
 * Валидация операции
 */
export function validateOperation(operation) {
    const errors = [];
    
    if (!operation.name || operation.name.trim() === '') {
        errors.push('Название операции обязательно');
    }
    
    if (!operation.op_number || operation.op_number <= 0) {
        errors.push('Номер операции должен быть положительным числом');
    }
    
    if (operation.duration < 0) {
        errors.push('Длительность не может быть отрицательной');
    }
    
    if (operation.labor_hours < 0) {
        errors.push('Трудоёмкость не может быть отрицательной');
    }
    
    if (operation.people_count < 1 || operation.people_count > 11) {
        errors.push('Количество человек должно быть от 1 до 11');
    }
    
    if (operation.time_reserve < 0) {
        errors.push('Резерв времени не может быть отрицательным');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Валидация бригады
 */
export function validateBrigade(brigade) {
    const errors = [];
    
    if (!brigade.name || brigade.name.trim() === '') {
        errors.push('Название бригады обязательно');
    }
    
    if (brigade.max_capacity < 1 || brigade.max_capacity > 20) {
        errors.push('Максимальная вместимость должна быть от 1 до 20');
    }
    
    if (brigade.current_load < 0 || brigade.current_load > 100) {
        errors.push('Загрузка должна быть от 0 до 100%');
    }
    
    if (brigade.efficiency_rating < 0 || brigade.efficiency_rating > 2) {
        errors.push('Рейтинг эффективности должен быть от 0 до 2');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Валидация рабочего
 */
export function validateWorker(worker) {
    const errors = [];
    
    if (!worker.name || worker.name.trim() === '') {
        errors.push('Имя рабочего обязательно');
    }
    
    const validRoles = ['worker', 'brigadier', 'supervisor', 'admin'];
    if (!validRoles.includes(worker.role)) {
        errors.push('Недопустимая роль');
    }
    
    const validStatuses = ['online', 'offline', 'busy', 'away'];
    if (worker.status && !validStatuses.includes(worker.status)) {
        errors.push('Недопустимый статус');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Валидация email
 */
export function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Валидация пароля (минимум 6 символов)
 */
export function validatePassword(password) {
    return password && password.length >= 6;
}

/**
 * Проверка на пустое значение
 */
export function isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

/**
 * Проверка на число
 */
export function isNumber(value) {
    return !isNaN(parseFloat(value)) && isFinite(value);
}

/**
 * Проверка на целое число
 */
export function isInteger(value) {
    return Number.isInteger(value);
}

/**
 * Проверка на положительное число
 */
export function isPositive(value) {
    return isNumber(value) && value > 0;
}

/**
 * Проверка на неотрицательное число
 */
export function isNonNegative(value) {
    return isNumber(value) && value >= 0;
}

/**
 * Проверка на диапазон
 */
export function inRange(value, min, max) {
    return isNumber(value) && value >= min && value <= max;
}