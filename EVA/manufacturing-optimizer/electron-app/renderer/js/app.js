/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - ГЛАВНЫЙ СКРИПТ ПРИЛОЖЕНИЯ
 * ================================================================
 * 
 * Этот файл содержит:
 * - Инициализацию приложения
 * - Логику страницы входа
 * - Управление состоянием
 * - Вспомогательные функции
 * - Обработку событий
 * 
 * @author Manufacturing Optimizer Team
 * @version 1.0.0
 */

// ================================================================
// СТРОГИЙ РЕЖИМ И ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ================================================================

'use strict';

// Состояние приложения
const AppState = {
    isAuthenticated: false,
    currentUser: null,
    pythonApiReady: false,
    theme: 'light',
    language: 'ru',
    loginAttempts: 0,
    maxLoginAttempts: 5,
    lockoutUntil: null
};

// DOM элементы
let DOM = {};

// Таймеры
let timers = {
    pythonCheck: null,
    statsRefresh: null,
    lockoutTimer: null
};

// Конфигурация
const CONFIG = {
    PYTHON_CHECK_INTERVAL: 30000, // 30 секунд
    STATS_REFRESH_INTERVAL: 60000, // 1 минута
    LOCKOUT_DURATION: 300000, // 5 минут в мс
    ANIMATION_DURATION: 400
};

// ================================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ================================================================

/**
 * Главная функция инициализации
 */
async function initApp() {
    console.log('[App] 🚀 Инициализация приложения...');
    
    // Кэшируем DOM элементы
    cacheDomElements();
    
    // Проверяем доступность Electron API
    if (!window.electronAPI) {
        showFatalError('Electron API недоступен. Перезапустите приложение.');
        return;
    }
    
    // Загружаем настройки из хранилища
    await loadSettings();
    
    // Применяем тему
    applyTheme(AppState.theme);
    
    // Устанавливаем версию приложения
    await setAppVersion();
    
    // Проверяем статус Python API
    await checkPythonStatus();
    
    // Загружаем сохранённые учётные данные
    loadSavedCredentials();
    
    // Загружаем статистику для информационной панели
    await loadStats();
    
    // Настраиваем обработчики событий
    setupEventListeners();
    
    // Запускаем периодические проверки
    startPeriodicChecks();
    
    // Анимация появления
    animateEntrance();
    
    console.log('[App] ✅ Инициализация завершена');
}

/**
 * Кэширование DOM элементов
 */
function cacheDomElements() {
    DOM = {
        // Форма входа
        loginForm: document.getElementById('loginForm'),
        loginInput: document.getElementById('login'),
        passwordInput: document.getElementById('password'),
        loginBtn: document.getElementById('loginBtn'),
        errorMessage: document.getElementById('errorMessage'),
        togglePasswordBtn: document.getElementById('togglePassword'),
        rememberMe: document.getElementById('rememberMe'),
        forgotPassword: document.getElementById('forgotPassword'),
        
        // Загрузка
        loadingOverlay: document.getElementById('loadingOverlay'),
        
        // Статус
        connectionStatus: document.getElementById('connectionStatus'),
        statusIndicator: document.querySelector('.status-indicator'),
        statusText: document.querySelector('.status-text'),
        
        // Информация
        appVersion: document.getElementById('appVersion'),
        
        // Статистика
        totalOperations: document.getElementById('totalOperations'),
        activeBrigades: document.getElementById('activeBrigades'),
        avgEfficiency: document.getElementById('avgEfficiency')
    };
}

// ================================================================
// НАСТРОЙКИ И ТЕМА
// ================================================================

/**
 * Загрузка настроек из хранилища
 */
async function loadSettings() {
    try {
        const settings = window.electronAPI.storage.get('app_settings', {});
        AppState.theme = settings.theme || 'light';
        AppState.language = settings.language || 'ru';
        
        console.log('[App] Настройки загружены:', AppState);
    } catch (error) {
        console.error('[App] Ошибка загрузки настроек:', error);
    }
}

/**
 * Применение темы
 * @param {string} theme - 'light' или 'dark'
 */
function applyTheme(theme) {
    const themeStylesheet = document.getElementById('theme-stylesheet');
    if (themeStylesheet) {
        themeStylesheet.href = `css/themes/${theme}.css`;
    }
    
    document.body.setAttribute('data-theme', theme);
    AppState.theme = theme;
}

/**
 * Переключение темы
 */
function toggleTheme() {
    const newTheme = AppState.theme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
    
    // Сохраняем настройку
    window.electronAPI.storage.set('app_settings', {
        ...window.electronAPI.storage.get('app_settings', {}),
        theme: newTheme
    });
}

// ================================================================
// ВЕРСИЯ И СТАТУС
// ================================================================

/**
 * Установка версии приложения
 */
async function setAppVersion() {
    try {
        const version = await window.electronAPI.app.getVersion();
        if (DOM.appVersion) {
            DOM.appVersion.textContent = `Версия ${version}`;
        }
    } catch (error) {
        console.error('[App] Ошибка получения версии:', error);
        if (DOM.appVersion) {
            DOM.appVersion.textContent = 'Версия 1.0.0';
        }
    }
}

/**
 * Проверка статуса Python API
 */
async function checkPythonStatus() {
    try {
        AppState.pythonApiReady = await window.electronAPI.python.isReady();
        updateConnectionStatus();
    } catch (error) {
        console.error('[App] Ошибка проверки Python API:', error);
        AppState.pythonApiReady = false;
        updateConnectionStatus();
    }
}

/**
 * Обновление отображения статуса подключения
 */
function updateConnectionStatus() {
    const statusEl = DOM.connectionStatus;
    if (!statusEl) return;
    
    statusEl.className = 'connection-status';
    
    if (AppState.pythonApiReady) {
        statusEl.classList.add('online');
        DOM.statusText.textContent = 'Python API подключён';
    } else {
        statusEl.classList.add('warning');
        DOM.statusText.textContent = 'Python API недоступен (функции AI ограничены)';
    }
}

// ================================================================
// УЧЁТНЫЕ ДАННЫЕ
// ================================================================

/**
 * Загрузка сохранённых учётных данных
 */
function loadSavedCredentials() {
    try {
        const savedLogin = window.electronAPI.storage.get('saved_login');
        if (savedLogin && DOM.loginInput) {
            DOM.loginInput.value = savedLogin;
            if (DOM.rememberMe) {
                DOM.rememberMe.checked = true;
            }
        }
    } catch (error) {
        console.error('[App] Ошибка загрузки учётных данных:', error);
    }
}

/**
 * Сохранение учётных данных
 * @param {string} login - Логин пользователя
 */
function saveCredentials(login) {
    try {
        if (DOM.rememberMe && DOM.rememberMe.checked) {
            window.electronAPI.storage.set('saved_login', login);
        } else {
            window.electronAPI.storage.remove('saved_login');
        }
    } catch (error) {
        console.error('[App] Ошибка сохранения учётных данных:', error);
    }
}

// ================================================================
// СТАТИСТИКА
// ================================================================

/**
 * Загрузка статистики для информационной панели
 */
async function loadStats() {
    if (!AppState.pythonApiReady) {
        setDefaultStats();
        return;
    }
    
    try {
        const stats = await window.electronAPI.ai.getStatistics();
        
        // Анимируем числа
        animateNumber(DOM.totalOperations, 0, stats.total_operations || 270, 1500);
        animateNumber(DOM.activeBrigades, 0, stats.active_brigades || 10, 1500);
        animateNumber(DOM.avgEfficiency, 0, stats.avg_efficiency || 87, 1500, '%');
        
    } catch (error) {
        console.error('[App] Ошибка загрузки статистики:', error);
        setDefaultStats();
    }
}

/**
 * Установка значений по умолчанию для статистики
 */
function setDefaultStats() {
    if (DOM.totalOperations) DOM.totalOperations.textContent = '--';
    if (DOM.activeBrigades) DOM.activeBrigades.textContent = '--';
    if (DOM.avgEfficiency) DOM.avgEfficiency.textContent = '--';
}

/**
 * Анимация изменения числа
 * @param {HTMLElement} element - Элемент для обновления
 * @param {number} start - Начальное значение
 * @param {number} end - Конечное значение
 * @param {number} duration - Длительность в мс
 * @param {string} suffix - Суффикс (например, '%')
 */
function animateNumber(element, start, end, duration, suffix = '') {
    if (!element) return;
    
    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;
    
    const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
            element.textContent = Math.round(end) + suffix;
            clearInterval(timer);
        } else {
            element.textContent = Math.round(current) + suffix;
        }
    }, 16);
}

// ================================================================
// АУТЕНТИФИКАЦИЯ
// ================================================================

/**
 * Проверка блокировки после неудачных попыток
 * @returns {boolean} - true если вход заблокирован
 */
function isLoginLocked() {
    if (AppState.lockoutUntil && Date.now() < AppState.lockoutUntil) {
        const remainingMinutes = Math.ceil((AppState.lockoutUntil - Date.now()) / 60000);
        showError(`Слишком много попыток. Попробуйте через ${remainingMinutes} мин.`);
        return true;
    }
    
    // Сбрасываем блокировку если время вышло
    if (AppState.lockoutUntil && Date.now() >= AppState.lockoutUntil) {
        AppState.loginAttempts = 0;
        AppState.lockoutUntil = null;
    }
    
    return false;
}

/**
 * Обработка отправки формы входа
 * @param {Event} e - Событие отправки формы
 */
async function handleLoginSubmit(e) {
    e.preventDefault();
    
    // Проверяем блокировку
    if (isLoginLocked()) {
        return;
    }
    
    const login = DOM.loginInput.value.trim();
    const password = DOM.passwordInput.value;
    
    // Валидация
    if (!login) {
        showError('Введите логин');
        animateShake(DOM.loginInput);
        return;
    }
    
    if (!password) {
        showError('Введите пароль');
        animateShake(DOM.passwordInput);
        return;
    }
    
    // Скрываем предыдущую ошибку
    hideError();
    
    // Показываем загрузку
    showLoading(true);
    
    try {
        // Имитация сетевой задержки
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Проверка учётных данных
        // В реальном приложении здесь будет запрос к API
        const authResult = await authenticate(login, password);
        
        if (authResult.success) {
            // Сохраняем учётные данные если нужно
            saveCredentials(login);
            
            // Сбрасываем счётчик попыток
            AppState.loginAttempts = 0;
            
            // Устанавливаем текущего пользователя
            AppState.currentUser = authResult.user;
            AppState.isAuthenticated = true;
            
            // Анимация успешного входа
            await animateSuccessfulLogin();
            
            // Открываем соответствующее окно
            if (authResult.user.role === 'admin') {
                await window.electronAPI.navigation.openAdmin();
            } else {
                await window.electronAPI.navigation.openWorker(
                    authResult.user.id,
                    authResult.user.brigade_id
                );
            }
        } else {
            handleLoginFailure(authResult.message);
        }
        
    } catch (error) {
        console.error('[App] Ошибка аутентификации:', error);
        showError('Ошибка подключения к серверу');
        showLoading(false);
    }
}

/**
 * Аутентификация пользователя
 * @param {string} login - Логин
 * @param {string} password - Пароль
 * @returns {Promise<Object>} - Результат аутентификации
 */
async function authenticate(login, password) {
    // TODO: Заменить на реальный API запрос
    // Пока используем тестовые учётные данные
    
    const testCredentials = {
        'admin': {
            password: 'admin123',
            user: {
                id: 1,
                login: 'admin',
                name: 'Администратор',
                role: 'admin',
                brigade_id: null
            }
        },
        'worker1': {
            password: 'worker123',
            user: {
                id: 2,
                login: 'worker1',
                name: 'Иван Петров',
                role: 'worker',
                brigade_id: 1
            }
        }
    };
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const userData = testCredentials[login];
    
    if (userData && userData.password === password) {
        return {
            success: true,
            user: userData.user
        };
    }
    
    return {
        success: false,
        message: 'Неверный логин или пароль'
    };
}

/**
 * Обработка неудачной попытки входа
 * @param {string} message - Сообщение об ошибке
 */
function handleLoginFailure(message) {
    AppState.loginAttempts++;
    
    if (AppState.loginAttempts >= AppState.maxLoginAttempts) {
        AppState.lockoutUntil = Date.now() + CONFIG.LOCKOUT_DURATION;
        showError('Слишком много попыток. Попробуйте через 5 минут.');
    } else {
        const attemptsLeft = AppState.maxLoginAttempts - AppState.loginAttempts;
        showError(`${message}. Осталось попыток: ${attemptsLeft}`);
    }
    
    showLoading(false);
    animateShake(DOM.loginForm);
}

// ================================================================
// UI ФУНКЦИИ
// ================================================================

/**
 * Показать сообщение об ошибке
 * @param {string} message - Текст ошибки
 */
function showError(message) {
    if (!DOM.errorMessage) return;
    
    DOM.errorMessage.textContent = message;
    DOM.errorMessage.style.display = 'block';
    
    // Анимация появления
    if (typeof anime !== 'undefined') {
        anime({
            targets: DOM.errorMessage,
            opacity: [0, 1],
            translateY: [-10, 0],
            duration: 300,
            easing: 'easeOutCubic'
        });
    }
}

/**
 * Скрыть сообщение об ошибке
 */
function hideError() {
    if (!DOM.errorMessage) return;
    DOM.errorMessage.style.display = 'none';
}

/**
 * Показать/скрыть загрузку
 * @param {boolean} show - Показать или скрыть
 */
function showLoading(show) {
    if (!DOM.loadingOverlay) return;
    
    DOM.loadingOverlay.style.display = show ? 'flex' : 'none';
    
    if (DOM.loginBtn) {
        DOM.loginBtn.disabled = show;
    }
    
    if (show && typeof anime !== 'undefined') {
        anime({
            targets: DOM.loadingOverlay,
            opacity: [0, 1],
            duration: 200,
            easing: 'easeOutCubic'
        });
    }
}

/**
 * Показать фатальную ошибку
 * @param {string} message - Сообщение
 */
function showFatalError(message) {
    document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif;">
            <div style="text-align: center; padding: 40px;">
                <h2 style="color: #dc3545;">Критическая ошибка</h2>
                <p>${message}</p>
                <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #0961f6; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    Перезагрузить
                </button>
            </div>
        </div>
    `;
}

// ================================================================
// АНИМАЦИИ
// ================================================================

/**
 * Анимация появления страницы
 */
function animateEntrance() {
    if (typeof anime === 'undefined') return;
    
    anime({
        targets: '.login-container',
        opacity: [0, 1],
        translateY: [30, 0],
        duration: 600,
        easing: 'easeOutCubic'
    });
    
    anime({
        targets: '.info-panel',
        opacity: [0, 1],
        translateX: [30, 0],
        duration: 600,
        delay: 100,
        easing: 'easeOutCubic'
    });
}

/**
 * Анимация успешного входа
 * @returns {Promise} - Промис, который резолвится после анимации
 */
function animateSuccessfulLogin() {
    return new Promise(resolve => {
        if (typeof anime === 'undefined') {
            resolve();
            return;
        }
        
        anime({
            targets: '.login-container',
            opacity: 0,
            scale: 0.95,
            duration: 400,
            easing: 'easeInCubic',
            complete: resolve
        });
        
        anime({
            targets: '.info-panel',
            opacity: 0,
            translateX: 30,
            duration: 400,
            easing: 'easeInCubic'
        });
    });
}

/**
 * Анимация тряски элемента
 * @param {HTMLElement|string} target - Элемент или селектор
 */
function animateShake(target) {
    if (typeof anime === 'undefined') return;
    
    anime({
        targets: target,
        translateX: [0, -10, 10, -5, 5, 0],
        duration: 400,
        easing: 'easeInOutQuad'
    });
}

// ================================================================
// ПЕРИОДИЧЕСКИЕ ПРОВЕРКИ
// ================================================================

/**
 * Запуск периодических проверок
 */
function startPeriodicChecks() {
    // Проверка Python API
    timers.pythonCheck = setInterval(async () => {
        await checkPythonStatus();
    }, CONFIG.PYTHON_CHECK_INTERVAL);
    
    // Обновление статистики
    timers.statsRefresh = setInterval(async () => {
        if (AppState.pythonApiReady) {
            await loadStats();
        }
    }, CONFIG.STATS_REFRESH_INTERVAL);
}

/**
 * Остановка периодических проверок
 */
function stopPeriodicChecks() {
    if (timers.pythonCheck) {
        clearInterval(timers.pythonCheck);
        timers.pythonCheck = null;
    }
    if (timers.statsRefresh) {
        clearInterval(timers.statsRefresh);
        timers.statsRefresh = null;
    }
}

// ================================================================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ================================================================

/**
 * Настройка обработчиков событий
 */
function setupEventListeners() {
    // Форма входа
    if (DOM.loginForm) {
        DOM.loginForm.addEventListener('submit', handleLoginSubmit);
    }
    
    // Переключение видимости пароля
    if (DOM.togglePasswordBtn) {
        DOM.togglePasswordBtn.addEventListener('click', togglePasswordVisibility);
    }
    
    // Забыли пароль
    if (DOM.forgotPassword) {
        DOM.forgotPassword.addEventListener('click', handleForgotPassword);
    }
    
    // Горячие клавиши
    document.addEventListener('keydown', handleKeyDown);
    
    // Подписка на события Electron
    subscribeToElectronEvents();
    
    // Очистка при уходе со страницы
    window.addEventListener('beforeunload', cleanup);
}

/**
 * Переключение видимости пароля
 */
function togglePasswordVisibility() {
    if (!DOM.passwordInput) return;
    
    const type = DOM.passwordInput.type === 'password' ? 'text' : 'password';
    DOM.passwordInput.type = type;
    
    // Анимация иконки
    const eyeIcon = DOM.togglePasswordBtn.querySelector('.eye-icon');
    if (eyeIcon && typeof anime !== 'undefined') {
        anime({
            targets: eyeIcon,
            scale: [1, 0.8, 1],
            duration: 300,
            easing: 'easeInOutQuad'
        });
    }
}

/**
 * Обработка "Забыли пароль"
 * @param {Event} e - Событие клика
 */
function handleForgotPassword(e) {
    e.preventDefault();
    
    if (typeof anime !== 'undefined') {
        anime({
            targets: DOM.forgotPassword,
            scale: [1, 1.1, 1],
            duration: 300
        });
    }
    
    window.electronAPI.notifications.show({
        title: 'Восстановление пароля',
        body: 'Обратитесь к администратору системы для сброса пароля.',
        type: 'info'
    });
}

/**
 * Обработка нажатий клавиш
 * @param {KeyboardEvent} e - Событие клавиатуры
 */
function handleKeyDown(e) {
    // Enter - отправка формы
    if (e.key === 'Enter' && !e.shiftKey) {
        const activeElement = document.activeElement;
        if (activeElement === DOM.loginInput || activeElement === DOM.passwordInput) {
            DOM.loginForm.dispatchEvent(new Event('submit'));
        }
    }
    
    // Ctrl+Shift+D - режим разработчика
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        console.log('[App] Режим разработчика активирован');
        // Можно показать дополнительную информацию
    }
    
    // Ctrl+Shift+T - переключение темы
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        toggleTheme();
    }
}

/**
 * Подписка на события Electron
 */
function subscribeToElectronEvents() {
    // Обновление БД
    window.electronAPI.on.dbUpdated.subscribe((data) => {
        console.log('[App] БД обновлена:', data);
        // Можно обновить статистику
    });
    
    // Импорт Excel
    window.electronAPI.on.importExcelTriggered.subscribe((filePath) => {
        console.log('[App] Запрошен импорт Excel:', filePath);
    });
    
    // Фокус окна
    window.electronAPI.on.windowFocus.subscribe(() => {
        console.log('[App] Окно получило фокус');
        checkPythonStatus();
    });
}

/**
 * Очистка ресурсов
 */
function cleanup() {
    console.log('[App] Очистка ресурсов...');
    stopPeriodicChecks();
}

// ================================================================
// ЗАПУСК ПРИЛОЖЕНИЯ
// ================================================================

// Запускаем приложение после загрузки DOM
document.addEventListener('DOMContentLoaded', initApp);

// Экспорт для возможного использования в других скриптах
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AppState,
        animateNumber,
        showError,
        hideError,
        showLoading
    };
}