/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - ЛОГГЕР
 * ================================================================
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

class Logger {
    constructor() {
        this.level = LOG_LEVELS.INFO;
        this.prefix = '[MFG]';
        this.enableConsole = true;
        this.enableStorage = false;
        this.maxStorageLogs = 1000;
        this.logs = [];
    }

    /**
     * Установка уровня логирования
     */
    setLevel(level) {
        if (typeof level === 'string') {
            this.level = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
        } else {
            this.level = level;
        }
    }

    /**
     * Форматирование сообщения
     */
    format(level, ...args) {
        const timestamp = new Date().toISOString();
        const message = args.map(arg => {
            if (arg instanceof Error) {
                return `${arg.message}\n${arg.stack}`;
            }
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
        
        return `${timestamp} ${this.prefix} [${level}] ${message}`;
    }

    /**
     * Запись в хранилище
     */
    saveToStorage(level, ...args) {
        if (!this.enableStorage) return;
        
        this.logs.push({
            timestamp: new Date().toISOString(),
            level,
            message: args.map(arg => String(arg)).join(' ')
        });
        
        if (this.logs.length > this.maxStorageLogs) {
            this.logs.shift();
        }
        
        try {
            window.electronAPI?.storage?.set('logs', this.logs.slice(-100));
        } catch (error) {
            // Игнорируем ошибки сохранения
        }
    }

    /**
     * DEBUG уровень
     */
    debug(...args) {
        if (this.level > LOG_LEVELS.DEBUG) return;
        
        const formatted = this.format('DEBUG', ...args);
        if (this.enableConsole) console.debug(formatted);
        this.saveToStorage('DEBUG', ...args);
    }

    /**
     * INFO уровень
     */
    info(...args) {
        if (this.level > LOG_LEVELS.INFO) return;
        
        const formatted = this.format('INFO', ...args);
        if (this.enableConsole) console.info(formatted);
        this.saveToStorage('INFO', ...args);
    }

    /**
     * WARN уровень
     */
    warn(...args) {
        if (this.level > LOG_LEVELS.WARN) return;
        
        const formatted = this.format('WARN', ...args);
        if (this.enableConsole) console.warn(formatted);
        this.saveToStorage('WARN', ...args);
    }

    /**
     * ERROR уровень
     */
    error(...args) {
        if (this.level > LOG_LEVELS.ERROR) return;
        
        const formatted = this.format('ERROR', ...args);
        if (this.enableConsole) console.error(formatted);
        this.saveToStorage('ERROR', ...args);
    }

    /**
     * Группировка логов
     */
    group(label) {
        if (this.enableConsole) console.group(label);
    }

    groupEnd() {
        if (this.enableConsole) console.groupEnd();
    }

    /**
     * Измерение времени выполнения
     */
    time(label) {
        if (this.enableConsole) console.time(label);
    }

    timeEnd(label) {
        if (this.enableConsole) console.timeEnd(label);
    }

    /**
     * Таблица
     */
    table(data) {
        if (this.enableConsole) console.table(data);
    }

    /**
     * Получение всех логов
     */
    getLogs() {
        return [...this.logs];
    }

    /**
     * Очистка логов
     */
    clearLogs() {
        this.logs = [];
        if (this.enableConsole) console.clear();
    }

    /**
     * Экспорт логов
     */
    exportLogs() {
        return this.logs.map(log => 
            `${log.timestamp} [${log.level}] ${log.message}`
        ).join('\n');
    }
}

// Экспорт синглтона
export const logger = new Logger();

// Установка уровня в зависимости от окружения
if (window.electronAPI?.app?.isDevelopment()) {
    logger.setLevel('DEBUG');
}