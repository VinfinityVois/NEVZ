/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - АУТЕНТИФИКАЦИЯ
 * ================================================================
 */

export class AuthManager {
    constructor() {
        this.currentUser = null;
        this.token = null;
        this.rememberMe = false;
        this.maxAttempts = 5;
        this.lockoutDuration = 300000; // 5 минут
    }

    /**
     * Инициализация
     */
    init() {
        this.loadSavedCredentials();
    }

    /**
     * Загрузка сохранённых учётных данных
     */
    loadSavedCredentials() {
        try {
            const saved = window.electronAPI?.storage?.get('auth');
            if (saved) {
                this.rememberMe = saved.rememberMe || false;
                if (saved.login) {
                    // Только логин, пароль не сохраняем
                    return saved.login;
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки учётных данных:', error);
        }
        return null;
    }

    /**
     * Вход в систему
     */
    async login(login, password, rememberMe = false) {
        // Проверка блокировки
        if (this.isLocked()) {
            throw new Error('Слишком много попыток. Попробуйте позже.');
        }
        
        try {
            // Здесь должен быть API запрос
            const result = await this.authenticate(login, password);
            
            if (result.success) {
                this.currentUser = result.user;
                this.token = result.token;
                this.rememberMe = rememberMe;
                this.resetAttempts();
                
                // Сохраняем логин если нужно
                if (rememberMe) {
                    window.electronAPI?.storage?.set('auth', {
                        login: login,
                        rememberMe: true
                    });
                }
                
                return result.user;
            } else {
                this.recordFailedAttempt();
                throw new Error(result.message || 'Неверный логин или пароль');
            }
            
        } catch (error) {
            this.recordFailedAttempt();
            throw error;
        }
    }

    /**
     * Аутентификация (имитация)
     */
    async authenticate(login, password) {
        return new Promise(resolve => {
            setTimeout(() => {
                // Тестовые учётные данные
                const users = {
                    'admin': { 
                        password: 'admin123', 
                        user: { id: 1, name: 'Администратор', role: 'admin', brigade_id: null }
                    },
                    'worker1': { 
                        password: 'worker123', 
                        user: { id: 2, name: 'Иван Петров', role: 'worker', brigade_id: 1 }
                    },
                    'brigadier1': { 
                        password: 'brig123', 
                        user: { id: 3, name: 'Пётр Сидоров', role: 'brigadier', brigade_id: 2 }
                    }
                };
                
                const user = users[login];
                if (user && user.password === password) {
                    resolve({
                        success: true,
                        user: user.user,
                        token: `token_${Date.now()}`
                    });
                } else {
                    resolve({
                        success: false,
                        message: 'Неверный логин или пароль'
                    });
                }
            }, 500);
        });
    }

    /**
     * Выход из системы
     */
    logout() {
        this.currentUser = null;
        this.token = null;
        
        // Очищаем сохранённые данные
        window.electronAPI?.storage?.remove('auth');
        
        // Перенаправляем на страницу входа
        if (window.electronAPI) {
            window.electronAPI.navigation.logout();
        } else {
            window.location.href = 'index.html';
        }
    }

    /**
     * Проверка авторизации
     */
    isAuthenticated() {
        return this.currentUser !== null && this.token !== null;
    }

    /**
     * Проверка роли
     */
    hasRole(role) {
        return this.currentUser && this.currentUser.role === role;
    }

    /**
     * Проверка доступа
     */
    canAccess(permission) {
        if (!this.currentUser) return false;
        
        const permissions = {
            admin: ['view_dashboard', 'manage_operations', 'manage_brigades', 'manage_workers', 'run_optimization', 'view_reports', 'manage_settings'],
            brigadier: ['view_dashboard', 'view_operations', 'manage_workers', 'view_reports'],
            worker: ['view_own_tasks', 'start_task', 'complete_task', 'view_own_stats']
        };
        
        const userPermissions = permissions[this.currentUser.role] || [];
        return userPermissions.includes(permission);
    }

    /**
     * Запись неудачной попытки
     */
    recordFailedAttempt() {
        const attempts = window.electronAPI?.storage?.get('login_attempts') || {
            count: 0,
            lastAttempt: null
        };
        
        attempts.count++;
        attempts.lastAttempt = Date.now();
        
        window.electronAPI?.storage?.set('login_attempts', attempts);
    }

    /**
     * Сброс счётчика попыток
     */
    resetAttempts() {
        window.electronAPI?.storage?.set('login_attempts', {
            count: 0,
            lastAttempt: null
        });
    }

    /**
     * Проверка блокировки
     */
    isLocked() {
        const attempts = window.electronAPI?.storage?.get('login_attempts');
        
        if (!attempts) return false;
        
        if (attempts.count >= this.maxAttempts) {
            const timeSinceLastAttempt = Date.now() - (attempts.lastAttempt || 0);
            if (timeSinceLastAttempt < this.lockoutDuration) {
                return true;
            } else {
                this.resetAttempts();
            }
        }
        
        return false;
    }

    /**
     * Получение оставшегося времени блокировки
     */
    getLockoutRemaining() {
        const attempts = window.electronAPI?.storage?.get('login_attempts');
        
        if (!attempts || attempts.count < this.maxAttempts) {
            return 0;
        }
        
        const timeSinceLastAttempt = Date.now() - (attempts.lastAttempt || 0);
        return Math.max(0, this.lockoutDuration - timeSinceLastAttempt);
    }

    /**
     * Смена пароля
     */
    async changePassword(oldPassword, newPassword) {
        if (!this.currentUser) {
            throw new Error('Не авторизован');
        }
        
        // Здесь должен быть API запрос
        return new Promise(resolve => {
            setTimeout(() => {
                resolve({ success: true });
            }, 500);
        });
    }
}

// Экспорт синглтона
export const auth = new AuthManager();