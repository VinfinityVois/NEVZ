/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - УТИЛИТЫ ДЛЯ РАБОТЫ С ДАТАМИ
 * ================================================================
 */

/**
 * Форматирование даты
 */
export function formatDate(date, format = 'DD.MM.YYYY HH:mm') {
    if (!date) return '';
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    return format
        .replace('DD', day)
        .replace('MM', month)
        .replace('YYYY', year)
        .replace('YY', String(year).slice(-2))
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
}

/**
 * Форматирование времени
 */
export function formatTime(date) {
    return formatDate(date, 'HH:mm');
}

/**
 * Форматирование короткой даты
 */
export function formatShortDate(date) {
    return formatDate(date, 'DD.MM.YYYY');
}

/**
 * Форматирование длительности в часах
 */
export function formatDuration(hours, showSeconds = false) {
    if (hours === null || hours === undefined) return '0 ч';
    
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    
    if (h === 0) {
        return `${m} мин`;
    }
    
    let result = `${h} ч`;
    if (m > 0) {
        result += ` ${m} мин`;
    }
    
    return result;
}

/**
 * Форматирование длительности в секундах в формат ЧЧ:ММ:СС
 */
export function formatDurationFromSeconds(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Получение относительного времени (например "5 минут назад")
 */
export function getRelativeTime(date, locale = 'ru') {
    if (!date) return '';
    
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (locale === 'ru') {
        if (minutes < 1) return 'только что';
        if (minutes < 60) return `${minutes} ${getMinutesWord(minutes)} назад`;
        if (hours < 24) return `${hours} ${getHoursWord(hours)} назад`;
        if (days < 7) return `${days} ${getDaysWord(days)} назад`;
        return formatShortDate(d);
    }
    
    // English fallback
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
    return formatShortDate(d);
}

/**
 * Склонение слова "минута"
 */
function getMinutesWord(n) {
    if (n % 10 === 1 && n % 100 !== 11) return 'минуту';
    if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'минуты';
    return 'минут';
}

/**
 * Склонение слова "час"
 */
function getHoursWord(n) {
    if (n % 10 === 1 && n % 100 !== 11) return 'час';
    if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'часа';
    return 'часов';
}

/**
 * Склонение слова "день"
 */
function getDaysWord(n) {
    if (n % 10 === 1 && n % 100 !== 11) return 'день';
    if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'дня';
    return 'дней';
}

/**
 * Получение начала дня
 */
export function startOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Получение конца дня
 */
export function endOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

/**
 * Получение начала недели (понедельник)
 */
export function startOfWeek(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

/**
 * Получение начала месяца
 */
export function startOfMonth(date = new Date()) {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Добавление дней к дате
 */
export function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

/**
 * Добавление часов к дате
 */
export function addHours(date, hours) {
    const d = new Date(date);
    d.setHours(d.getHours() + hours);
    return d;
}

/**
 * Разница в часах между двумя датами
 */
export function diffHours(date1, date2) {
    const diff = new Date(date2) - new Date(date1);
    return diff / 3600000;
}

/**
 * Проверка, является ли дата сегодняшней
 */
export function isToday(date) {
    const d = new Date(date);
    const today = new Date();
    return d.toDateString() === today.toDateString();
}

/**
 * Получение текущего времени в ISO формате
 */
export function nowISO() {
    return new Date().toISOString();
}

/**
 * Получение временной метки
 */
export function timestamp() {
    return Date.now();
}