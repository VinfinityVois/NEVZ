/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - СИСТЕМА УВЕДОМЛЕНИЙ
 * ================================================================
 */

export class NotificationSystem {
    constructor() {
        this.container = null;
        this.notifications = [];
        this.maxNotifications = 5;
        this.defaultDuration = 5000;
        this.sounds = {
            success: null,
            warning: null,
            error: null,
            info: null
        };
        this.soundEnabled = true;
    }

    /**
     * Инициализация
     */
    init(containerId = 'notificationsContainer') {
        this.container = document.getElementById(containerId);
        
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'notifications-container';
            document.body.appendChild(this.container);
        }
        
        this.loadSettings();
    }

    /**
     * Загрузка настроек
     */
    loadSettings() {
        try {
            const settings = window.electronAPI?.storage?.get('app_settings');
            if (settings?.notifications) {
                this.soundEnabled = settings.notifications.sound || false;
            }
        } catch (error) {
            console.error('Ошибка загрузки настроек уведомлений:', error);
        }
    }

    /**
     * Показать уведомление
     */
    show(title, message, type = 'info', duration = this.defaultDuration) {
        const notification = this.createNotification(title, message, type);
        
        this.container.appendChild(notification);
        this.notifications.push(notification);
        
        // Ограничение количества
        if (this.notifications.length > this.maxNotifications) {
            const oldest = this.notifications.shift();
            oldest.remove();
        }
        
        // Анимация появления
        this.animateIn(notification);
        
        // Воспроизведение звука
        if (this.soundEnabled) {
            this.playSound(type);
        }
        
        // Автоматическое скрытие
        if (duration > 0) {
            setTimeout(() => {
                this.hide(notification);
            }, duration);
        }
        
        return notification;
    }

    /**
     * Создание уведомления
     */
    createNotification(title, message, type) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        const icons = {
            success: '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>',
            warning: '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>',
            error: '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>',
            info: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>'
        };
        
        notification.innerHTML = `
            <div class="notification-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    ${icons[type] || icons.info}
                </svg>
            </div>
            <div class="notification-content">
                <div class="notification-title">${this.escapeHtml(title)}</div>
                <div class="notification-message">${this.escapeHtml(message)}</div>
            </div>
            <button class="notification-close" onclick="this.closest('.notification').remove()">
                &times;
            </button>
        `;
        
        // Добавляем обработчик закрытия
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            this.hide(notification);
        });
        
        return notification;
    }

    /**
     * Скрыть уведомление
     */
    hide(notification) {
        this.animateOut(notification, () => {
            notification.remove();
            const index = this.notifications.indexOf(notification);
            if (index !== -1) {
                this.notifications.splice(index, 1);
            }
        });
    }

    /**
     * Анимация появления
     */
    animateIn(element) {
        if (typeof anime !== 'undefined') {
            anime({
                targets: element,
                translateX: [100, 0],
                opacity: [0, 1],
                duration: 300,
                easing: 'easeOutCubic'
            });
        }
    }

    /**
     * Анимация исчезновения
     */
    animateOut(element, callback) {
        if (typeof anime !== 'undefined') {
            anime({
                targets: element,
                translateX: [0, 100],
                opacity: [1, 0],
                duration: 200,
                easing: 'easeInCubic',
                complete: callback
            });
        } else {
            callback();
        }
    }

    /**
     * Воспроизведение звука
     */
    playSound(type) {
        // Можно добавить звуки позже
        console.log(`[Sound] ${type}`);
    }

    /**
     * Успешное уведомление
     */
    success(title, message, duration) {
        return this.show(title, message, 'success', duration);
    }

    /**
     * Предупреждение
     */
    warning(title, message, duration) {
        return this.show(title, message, 'warning', duration);
    }

    /**
     * Ошибка
     */
    error(title, message, duration) {
        return this.show(title, message, 'error', duration);
    }

    /**
     * Информация
     */
    info(title, message, duration) {
        return this.show(title, message, 'info', duration);
    }

    /**
     * Очистить все уведомления
     */
    clearAll() {
        this.notifications.forEach(n => n.remove());
        this.notifications = [];
    }

    /**
     * Включить/выключить звук
     */
    toggleSound(enabled) {
        this.soundEnabled = enabled;
    }

    /**
     * Экранирование HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Экспорт синглтона
export const notifications = new NotificationSystem();