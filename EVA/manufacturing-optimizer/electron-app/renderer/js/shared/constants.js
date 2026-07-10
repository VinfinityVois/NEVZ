/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - КОНСТАНТЫ
 * ================================================================
 */

export const APP_NAME = 'Manufacturing Optimizer';
export const APP_VERSION = '1.0.0';

// Статусы операций
export const OPERATION_STATUS = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    BLOCKED: 'blocked',
    CANCELLED: 'cancelled'
};

// Текстовые метки статусов
export const OPERATION_STATUS_LABELS = {
    [OPERATION_STATUS.PENDING]: 'Ожидает',
    [OPERATION_STATUS.IN_PROGRESS]: 'В работе',
    [OPERATION_STATUS.COMPLETED]: 'Завершено',
    [OPERATION_STATUS.BLOCKED]: 'Заблокировано',
    [OPERATION_STATUS.CANCELLED]: 'Отменено'
};

// Цвета статусов
export const OPERATION_STATUS_COLORS = {
    [OPERATION_STATUS.PENDING]: '#414B4E',
    [OPERATION_STATUS.IN_PROGRESS]: '#0961f6',
    [OPERATION_STATUS.COMPLETED]: '#10b981',
    [OPERATION_STATUS.BLOCKED]: '#f59e0b',
    [OPERATION_STATUS.CANCELLED]: '#ef4444'
};

// Роли пользователей
export const USER_ROLES = {
    ADMIN: 'admin',
    WORKER: 'worker',
    BRIGADIER: 'brigadier',
    SUPERVISOR: 'supervisor'
};

// Приоритеты задач
export const TASK_PRIORITY = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};

export const TASK_PRIORITY_LABELS = {
    [TASK_PRIORITY.LOW]: 'Низкий',
    [TASK_PRIORITY.MEDIUM]: 'Средний',
    [TASK_PRIORITY.HIGH]: 'Высокий',
    [TASK_PRIORITY.CRITICAL]: 'Критический'
};

// Типы уведомлений
export const NOTIFICATION_TYPES = {
    INFO: 'info',
    SUCCESS: 'success',
    WARNING: 'warning',
    ERROR: 'error'
};

// Лимиты системы
export const LIMITS = {
    MAX_PEOPLE_PER_BRIGADE: 11,
    MIN_PEOPLE_PER_OPERATION: 1,
    MAX_BRIGADES: 10,
    MAX_OPERATIONS_PER_POST: 50
};

// Интервалы обновления (мс)
export const INTERVALS = {
    STATS_REFRESH: 60000,
    API_CHECK: 30000,
    TASK_QUEUE_REFRESH: 30000,
    AUTO_SAVE: 60000
};

// Цвета бренда
export const BRAND_COLORS = {
    PRIMARY_BG: '#d6e0e5',
    ACCENT_DARK: '#414B4E',
    ACCENT_BLUE: '#0961f6',
    SUCCESS: '#10b981',
    WARNING: '#f59e0b',
    ERROR: '#ef4444',
    INFO: '#3b82f6'
};

// URL API
export const API_URL = 'http://127.0.0.1:8000';

// Эндпоинты API
export const API_ENDPOINTS = {
    HEALTH: '/health',
    OPERATIONS: '/operations',
    BRIGADES: '/brigades',
    WORKERS: '/workers',
    OPTIMIZE: '/optimize',
    PREDICT: '/predict',
    TRAIN: '/train',
    CALCULATE_CPM: '/calculate-cpm',
    STATISTICS: '/statistics',
    IMPORT_EXCEL: '/import-excel',
    EXPORT_REPORT: '/export-report'
};

// Ключи для localStorage
export const STORAGE_KEYS = {
    SETTINGS: 'app_settings',
    SAVED_LOGIN: 'saved_login',
    THEME: 'theme',
    LANGUAGE: 'language',
    RECENT_OPERATIONS: 'recent_operations',
    DASHBOARD_LAYOUT: 'dashboard_layout'
};

// Языки
export const LANGUAGES = {
    RU: 'ru',
    EN: 'en'
};

// Форматы дат
export const DATE_FORMATS = {
    FULL: 'DD.MM.YYYY HH:mm',
    SHORT: 'DD.MM.YYYY',
    TIME: 'HH:mm',
    DURATION: 'H ч m мин'
};

// Сообщения об ошибках
export const ERROR_MESSAGES = {
    NETWORK: 'Ошибка сети. Проверьте подключение.',
    API_UNAVAILABLE: 'Python API недоступен.',
    UNAUTHORIZED: 'Необходима авторизация.',
    FORBIDDEN: 'Доступ запрещён.',
    NOT_FOUND: 'Ресурс не найден.',
    VALIDATION: 'Проверьте правильность введённых данных.',
    SERVER: 'Ошибка сервера. Попробуйте позже.'
};

// Анимации
export const ANIMATION_DURATIONS = {
    FAST: 150,
    NORMAL: 300,
    SLOW: 500
};

// Горячие клавиши
export const HOTKEYS = {
    SAVE: 'Ctrl+S',
    UNDO: 'Ctrl+Z',
    REDO: 'Ctrl+Y',
    SEARCH: 'Ctrl+F',
    REFRESH: 'F5',
    LOGOUT: 'Ctrl+Q',
    DEV_TOOLS: 'Ctrl+Shift+I'
};