/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - НАСТРОЙКИ
 * ================================================================
 */

export class SettingsManager {
    constructor() {
        this.defaultSettings = {
            theme: 'light',
            language: 'ru',
            autoSave: true,
            autoSaveInterval: 60,
            refreshInterval: 30,
            notifications: {
                enabled: true,
                sound: false,
                taskAssigned: true,
                taskCompleted: true,
                optimizationComplete: true
            },
            ai: {
                autoOptimize: false,
                efficiencyThreshold: 75,
                maxWorkersPerBrigade: 11,
                modelUpdateInterval: 24
            },
            display: {
                showCriticalPath: true,
                showLabels: true,
                graphLayout: 'dagre',
                tableRowsPerPage: 50,
                animations: true
            },
            export: {
                defaultFormat: 'xlsx',
                includeCompletedTasks: true,
                includeStatistics: true
            }
        };
        
        this.settings = { ...this.defaultSettings };
        this.loadSettings();
    }

    /**
     * Загрузка настроек
     */
    loadSettings() {
        try {
            const saved = window.electronAPI?.storage?.get('app_settings');
            if (saved) {
                this.settings = this.mergeSettings(this.defaultSettings, saved);
            }
        } catch (error) {
            console.error('Ошибка загрузки настроек:', error);
        }
    }

    /**
     * Сохранение настроек
     */
    saveSettings() {
        try {
            window.electronAPI?.storage?.set('app_settings', this.settings);
            this.applySettings();
            return true;
        } catch (error) {
            console.error('Ошибка сохранения настроек:', error);
            return false;
        }
    }

    /**
     * Применение настроек
     */
    applySettings() {
        // Применяем тему
        this.applyTheme(this.settings.theme);
        
        // Применяем язык
        this.applyLanguage(this.settings.language);
        
        // Применяем настройки анимаций
        this.applyAnimations(this.settings.display.animations);
    }

    /**
     * Применение темы
     */
    applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        
        const themeStylesheet = document.getElementById('theme-stylesheet');
        if (themeStylesheet) {
            themeStylesheet.href = `css/themes/${theme}.css`;
        }
    }

    /**
     * Применение языка
     */
    applyLanguage(language) {
        document.documentElement.setAttribute('lang', language);
        // Здесь можно добавить загрузку переводов
    }

    /**
     * Применение анимаций
     */
    applyAnimations(enabled) {
        document.body.classList.toggle('animations-disabled', !enabled);
    }

    /**
     * Получение настройки
     */
    get(key, defaultValue = null) {
        const keys = key.split('.');
        let value = this.settings;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return defaultValue;
            }
        }
        
        return value;
    }

    /**
     * Установка настройки
     */
    set(key, value) {
        const keys = key.split('.');
        let obj = this.settings;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!(k in obj) || typeof obj[k] !== 'object') {
                obj[k] = {};
            }
            obj = obj[k];
        }
        
        obj[keys[keys.length - 1]] = value;
        
        // Автосохранение если включено
        if (this.settings.autoSave) {
            this.saveSettings();
        }
    }

    /**
     * Сброс настроек
     */
    resetSettings() {
        this.settings = { ...this.defaultSettings };
        this.saveSettings();
        this.applySettings();
    }

    /**
     * Сброс раздела настроек
     */
    resetSection(section) {
        if (this.defaultSettings[section]) {
            this.settings[section] = { ...this.defaultSettings[section] };
            this.saveSettings();
            this.applySettings();
        }
    }

    /**
     * Экспорт настроек
     */
    exportSettings() {
        return JSON.stringify(this.settings, null, 2);
    }

    /**
     * Импорт настроек
     */
    importSettings(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            this.settings = this.mergeSettings(this.defaultSettings, imported);
            this.saveSettings();
            this.applySettings();
            return true;
        } catch (error) {
            console.error('Ошибка импорта настроек:', error);
            return false;
        }
    }

    /**
     * Слияние настроек
     */
    mergeSettings(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    result[key] = this.mergeSettings(target[key] || {}, source[key]);
                } else {
                    result[key] = source[key];
                }
            }
        }
        
        return result;
    }

    /**
     * Получение всех настроек
     */
    getAll() {
        return { ...this.settings };
    }

    /**
     * Переключение темы
     */
    toggleTheme() {
        const newTheme = this.settings.theme === 'light' ? 'dark' : 'light';
        this.set('theme', newTheme);
        return newTheme;
    }

    /**
     * Переключение автосохранения
     */
    toggleAutoSave() {
        const newValue = !this.settings.autoSave;
        this.set('autoSave', newValue);
        return newValue;
    }

    /**
     * Переключение уведомлений
     */
    toggleNotifications() {
        const newValue = !this.settings.notifications.enabled;
        this.set('notifications.enabled', newValue);
        return newValue;
    }

    /**
     * Проверка, включены ли уведомления для типа
     */
    isNotificationEnabled(type) {
        return this.settings.notifications.enabled && 
               this.settings.notifications[type] !== false;
    }
}