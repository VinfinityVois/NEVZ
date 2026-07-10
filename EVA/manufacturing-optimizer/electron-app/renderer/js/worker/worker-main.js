/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - ГЛАВНЫЙ СКРИПТ РАБОЧЕГО
 * ================================================================
 */

'use strict';

// Состояние рабочего
const WorkerState = {
    userId: null,
    brigadeId: null,
    user: null,
    brigade: null,
    currentTask: null,
    tasks: [],
    history: [],
    stats: {
        completed: 0,
        totalHours: 0,
        efficiency: 0
    },
    timer: {
        isRunning: false,
        startTime: null,
        elapsedSeconds: 0,
        interval: null
    },
    filter: 'all'
};

// DOM элементы
const DOM = {
    userName: null,
    userBrigade: null,
    userAvatar: null,
    currentDate: null,
    currentTime: null,
    currentTaskContainer: null,
    noTaskMessage: null,
    taskDetails: null,
    taskNumber: null,
    taskName: null,
    taskPost: null,
    taskDrawing: null,
    taskLabor: null,
    taskPeople: null,
    taskDuration: null,
    taskLocation: null,
    taskPriority: null,
    taskDependencies: null,
    startTaskBtn: null,
    completeTaskBtn: null,
    pauseTaskBtn: null,
    timerValue: null,
    timerProgress: null,
    taskQueueList: null,
    queueCount: null,
    historyList: null,
    brigadeInfo: null,
    tasksCompleted: null,
    totalHours: null,
    efficiency: null,
    tasksInQueue: null,
    shiftProgressText: null,
    shiftProgressBar: null,
    modalOverlay: null,
    completeTaskModal: null,
    actualDuration: null,
    actualPeople: null,
    taskComment: null,
    connectionStatus: null,
    appVersion: null,
    loadingOverlay: null,
    loadingText: null,
    notificationsContainer: null
};

// ================================================================
// ИНИЦИАЛИЗАЦИЯ
// ================================================================

async function initWorker() {
    console.log('[Worker] 🚀 Инициализация...');
    
    cacheDomElements();
    
    // Получаем параметры запуска
    const params = window.electronAPI?.app?.getStartupParams() || {};
    WorkerState.userId = params.userId || 2;
    WorkerState.brigadeId = params.brigadeId || 1;
    
    console.log(`[Worker] userId=${WorkerState.userId}, brigadeId=${WorkerState.brigadeId}`);
    
    // Загружаем данные
    await loadWorkerData();
    
    // Настраиваем обработчики
    setupEventListeners();
    subscribeToElectronEvents();
    
    // Запускаем часы
    startDateTimeUpdates();
    
    // Проверяем соединение
    checkConnection();
    setInterval(checkConnection, 30000);
    
    console.log('[Worker] ✅ Инициализация завершена');
}

function cacheDomElements() {
    DOM.userName = document.getElementById('userName');
    DOM.userBrigade = document.getElementById('userBrigade');
    DOM.userAvatar = document.getElementById('userAvatar');
    DOM.currentDate = document.getElementById('currentDate');
    DOM.currentTime = document.getElementById('currentTime');
    DOM.currentTaskContainer = document.getElementById('currentTaskContainer');
    DOM.noTaskMessage = document.getElementById('noTaskMessage');
    DOM.taskDetails = document.getElementById('taskDetails');
    DOM.taskNumber = document.getElementById('taskNumber');
    DOM.taskName = document.getElementById('taskName');
    DOM.taskPost = document.getElementById('taskPost');
    DOM.taskDrawing = document.getElementById('taskDrawing');
    DOM.taskLabor = document.getElementById('taskLabor');
    DOM.taskPeople = document.getElementById('taskPeople');
    DOM.taskDuration = document.getElementById('taskDuration');
    DOM.taskLocation = document.getElementById('taskLocation');
    DOM.taskPriority = document.getElementById('taskPriority');
    DOM.taskDependencies = document.getElementById('taskDependencies');
    DOM.startTaskBtn = document.getElementById('startTaskBtn');
    DOM.completeTaskBtn = document.getElementById('completeTaskBtn');
    DOM.pauseTaskBtn = document.getElementById('pauseTaskBtn');
    DOM.timerValue = document.getElementById('timerValue');
    DOM.timerProgress = document.getElementById('timerProgress');
    DOM.taskQueueList = document.getElementById('taskQueueList');
    DOM.queueCount = document.getElementById('queueCount');
    DOM.historyList = document.getElementById('historyList');
    DOM.brigadeInfo = document.getElementById('brigadeInfo');
    DOM.tasksCompleted = document.getElementById('tasksCompleted');
    DOM.totalHours = document.getElementById('totalHours');
    DOM.efficiency = document.getElementById('efficiency');
    DOM.tasksInQueue = document.getElementById('tasksInQueue');
    DOM.shiftProgressText = document.getElementById('shiftProgressText');
    DOM.shiftProgressBar = document.getElementById('shiftProgressBar');
    DOM.modalOverlay = document.getElementById('modalOverlay');
    DOM.completeTaskModal = document.getElementById('completeTaskModal');
    DOM.actualDuration = document.getElementById('actualDuration');
    DOM.actualPeople = document.getElementById('actualPeople');
    DOM.taskComment = document.getElementById('taskComment');
    DOM.connectionStatus = document.getElementById('connectionStatus');
    DOM.appVersion = document.getElementById('appVersion');
    DOM.loadingOverlay = document.getElementById('loadingOverlay');
    DOM.loadingText = document.getElementById('loadingText');
    DOM.notificationsContainer = document.getElementById('notificationsContainer');
}

// ================================================================
// ЗАГРУЗКА ДАННЫХ
// ================================================================

async function loadWorkerData() {
    showLoading('Загрузка данных...');
    
    try {
        // Загружаем информацию о рабочем
        await loadUserInfo();
        
        // Загружаем информацию о бригаде
        await loadBrigadeInfo();
        
        // Загружаем задачи
        await loadTasks();
        
        // Загружаем историю
        await loadHistory();
        
        // Обновляем статистику
        updateStats();
        
        // Обновляем UI
        renderTasks();
        renderHistory();
        
    } catch (error) {
        console.error('[Worker] Ошибка загрузки данных:', error);
        showNotification('Ошибка', 'Не удалось загрузить данные', 'error');
    } finally {
        hideLoading();
    }
}

async function loadUserInfo() {
    // Тестовые данные
    WorkerState.user = {
        id: WorkerState.userId,
        name: 'Иван Петров',
        role: 'worker',
        brigade_id: WorkerState.brigadeId
    };
    
    if (DOM.userName) {
        DOM.userName.textContent = WorkerState.user.name;
    }
    if (DOM.userAvatar) {
        DOM.userAvatar.textContent = WorkerState.user.name.charAt(0);
    }
}

async function loadBrigadeInfo() {
    // Тестовые данные
    WorkerState.brigade = {
        id: WorkerState.brigadeId,
        name: `Бригада ${WorkerState.brigadeId}`,
        members: [
            { id: 1, name: 'Иван Петров', status: 'online' },
            { id: 2, name: 'Пётр Сидоров', status: 'busy' },
            { id: 3, name: 'Анна Смирнова', status: 'online' }
        ],
        currentLoad: 65,
        efficiency: 92
    };
    
    if (DOM.userBrigade) {
        DOM.userBrigade.textContent = WorkerState.brigade.name;
    }
    
    renderBrigadeInfo();
}

async function loadTasks() {
    // Тестовые данные
    WorkerState.tasks = [
        { id: 1, op_number: 103, name: 'Раскрой подкладки', status: 'in_progress', priority: 'high', post: 2, drawing: 'МБ-001', labor_hours: 12, people_count: 2, duration: 6, location: 'Цех 2', time_reserve: 3, dependencies: [101] },
        { id: 2, op_number: 105, name: 'Пошив подкладки', status: 'pending', priority: 'medium', post: 3, drawing: 'МБ-001', labor_hours: 18, people_count: 3, duration: 6, location: 'Цех 3', time_reserve: 2, dependencies: [103] },
        { id: 3, op_number: 108, name: 'Проверка швов', status: 'pending', priority: 'low', post: 5, drawing: 'МБ-001', labor_hours: 4, people_count: 1, duration: 4, location: 'ОТК', time_reserve: 5, dependencies: [105, 106] },
        { id: 4, op_number: 109, name: 'Упаковка', status: 'blocked', priority: 'low', post: 6, drawing: 'МБ-001', labor_hours: 2, people_count: 1, duration: 2, location: 'Склад', time_reserve: 8, dependencies: [108] }
    ];
    
    // Находим текущую активную задачу
    WorkerState.currentTask = WorkerState.tasks.find(t => t.status === 'in_progress');
    
    updateQueueCount();
}

async function loadHistory() {
    // Тестовые данные
    WorkerState.history = [
        { id: 1, op_number: 101, name: 'Подготовка материалов', completed_at: '2024-01-15T10:30:00', planned_duration: 4, actual_duration: 3.5, people_planned: 2, people_actual: 2, efficiency: 1.14 },
        { id: 2, op_number: 102, name: 'Раскрой ткани', completed_at: '2024-01-15T14:45:00', planned_duration: 5.3, actual_duration: 6, people_planned: 3, people_actual: 3, efficiency: 0.88 }
    ];
    
    WorkerState.stats.completed = WorkerState.history.length;
    WorkerState.stats.totalHours = WorkerState.history.reduce((sum, h) => sum + h.actual_duration, 0);
    WorkerState.stats.efficiency = WorkerState.history.length > 0 
        ? WorkerState.history.reduce((sum, h) => sum + h.efficiency, 0) / WorkerState.history.length * 100 
        : 0;
}

// ================================================================
// ОТРИСОВКА UI
// ================================================================

function renderCurrentTask() {
    if (!WorkerState.currentTask) {
        DOM.noTaskMessage.style.display = 'flex';
        DOM.taskDetails.style.display = 'none';
        DOM.startTaskBtn.style.display = 'none';
        DOM.completeTaskBtn.style.display = 'none';
        return;
    }
    
    DOM.noTaskMessage.style.display = 'none';
    DOM.taskDetails.style.display = 'block';
    
    const task = WorkerState.currentTask;
    
    DOM.taskNumber.textContent = `#${task.op_number}`;
    DOM.taskName.textContent = task.name;
    DOM.taskPost.textContent = task.post;
    DOM.taskDrawing.textContent = task.drawing;
    DOM.taskLabor.textContent = `${task.labor_hours} чел/ч`;
    DOM.taskPeople.textContent = task.people_count;
    DOM.taskDuration.textContent = `${task.duration} ч`;
    DOM.taskLocation.textContent = task.location;
    
    // Приоритет
    const priorityMap = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };
    DOM.taskPriority.textContent = priorityMap[task.priority] || 'Обычный';
    DOM.taskPriority.style.background = task.priority === 'high' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)';
    DOM.taskPriority.style.color = task.priority === 'high' ? 'var(--error)' : 'var(--warning)';
    
    // Зависимости
    if (task.dependencies && task.dependencies.length > 0) {
        DOM.taskDependencies.textContent = task.dependencies.map(d => `#${d}`).join(', ');
    } else {
        DOM.taskDependencies.textContent = 'Нет зависимостей';
    }
    
    // Кнопки
    if (task.status === 'in_progress') {
        DOM.startTaskBtn.style.display = 'none';
        DOM.completeTaskBtn.style.display = 'flex';
        startTimer();
    } else {
        DOM.startTaskBtn.style.display = 'flex';
        DOM.completeTaskBtn.style.display = 'none';
    }
}

function renderTasks() {
    if (!DOM.taskQueueList) return;
    
    let tasks = WorkerState.tasks.filter(t => t.status !== 'in_progress');
    
    // Фильтрация
    if (WorkerState.filter === 'pending') {
        tasks = tasks.filter(t => t.status === 'pending');
    } else if (WorkerState.filter === 'blocked') {
        tasks = tasks.filter(t => t.status === 'blocked');
    }
    
    if (tasks.length === 0) {
        DOM.taskQueueList.innerHTML = `
            <div class="empty-queue">
                <svg viewBox="0 0 60 60" fill="none">
                    <rect x="15" y="20" width="30" height="25" rx="3" stroke="#414B4E" stroke-width="2" opacity="0.3"/>
                    <path d="M22 28H38M22 33H38M22 38H30" stroke="#414B4E" stroke-width="2" opacity="0.3"/>
                </svg>
                <p>Нет задач в очереди</p>
            </div>
        `;
        return;
    }
    
    DOM.taskQueueList.innerHTML = tasks.map(task => `
        <div class="queue-item ${task.status} ${WorkerState.currentTask?.id === task.id ? 'selected' : ''}" 
             data-task-id="${task.id}">
            <div class="queue-item-icon">${task.op_number}</div>
            <div class="queue-item-content">
                <div class="queue-item-title">${task.name}</div>
                <div class="queue-item-meta">
                    <span>Пост ${task.post}</span>
                    <span>${task.duration} ч</span>
                    <span>👥 ${task.people_count}</span>
                </div>
            </div>
            <div class="queue-item-status ${task.status}">
                ${getStatusText(task.status)}
            </div>
        </div>
    `).join('');
    
    // Добавляем обработчики клика
    DOM.taskQueueList.querySelectorAll('.queue-item').forEach(item => {
        item.addEventListener('click', () => selectTask(parseInt(item.dataset.taskId)));
    });
}

function renderHistory() {
    if (!DOM.historyList) return;
    
    if (WorkerState.history.length === 0) {
        DOM.historyList.innerHTML = '<div class="empty-history"><p>Нет завершённых задач</p></div>';
        return;
    }
    
    DOM.historyList.innerHTML = WorkerState.history.slice(0, 10).map(item => `
        <div class="history-item">
            <div class="history-item-header">
                <span class="history-item-number">#${item.op_number}</span>
                <span class="history-item-time">${formatTime(item.completed_at)}</span>
            </div>
            <div class="history-item-name">${item.name}</div>
            <div class="history-item-stats">
                <span class="history-stat">
                    ⏱ ${item.actual_duration} / ${item.planned_duration} ч
                </span>
                <span class="history-stat ${item.efficiency >= 1 ? 'positive' : 'warning'}">
                    ⚡ ${Math.round(item.efficiency * 100)}%
                </span>
            </div>
        </div>
    `).join('');
}

function renderBrigadeInfo() {
    if (!DOM.brigadeInfo || !WorkerState.brigade) return;
    
    DOM.brigadeInfo.innerHTML = `
        <div class="brigade-details">
            <div class="brigade-header-info">
                <div class="brigade-icon">${WorkerState.brigade.name.charAt(0)}</div>
                <div class="brigade-name-section">
                    <h4>${WorkerState.brigade.name}</h4>
                    <p>Загрузка: ${WorkerState.brigade.currentLoad}%</p>
                </div>
            </div>
            <div class="brigade-members">
                ${WorkerState.brigade.members.map(m => `
                    <div class="member-badge">
                        <span class="member-avatar">${m.name.charAt(0)}</span>
                        <span>${m.name.split(' ')[0]}</span>
                        <span class="member-status ${m.status}"></span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function updateStats() {
    if (DOM.tasksCompleted) {
        DOM.tasksCompleted.textContent = WorkerState.stats.completed;
    }
    if (DOM.totalHours) {
        DOM.totalHours.textContent = WorkerState.stats.totalHours.toFixed(1);
    }
    if (DOM.efficiency) {
        DOM.efficiency.textContent = `${Math.round(WorkerState.stats.efficiency)}%`;
    }
    if (DOM.tasksInQueue) {
        const pendingCount = WorkerState.tasks.filter(t => t.status === 'pending').length;
        DOM.tasksInQueue.textContent = pendingCount;
    }
    
    // Прогресс смены (пример)
    const shiftProgress = 65;
    if (DOM.shiftProgressText) {
        DOM.shiftProgressText.textContent = `${shiftProgress}%`;
    }
    if (DOM.shiftProgressBar) {
        DOM.shiftProgressBar.style.width = `${shiftProgress}%`;
    }
}

function updateQueueCount() {
    if (DOM.queueCount) {
        const count = WorkerState.tasks.filter(t => t.status !== 'in_progress').length;
        DOM.queueCount.textContent = `${count} ${getTaskWord(count)}`;
    }
}

// ================================================================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ================================================================

function setupEventListeners() {
    // Кнопки
    document.getElementById('refreshBtn')?.addEventListener('click', refreshData);
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
    
    DOM.startTaskBtn?.addEventListener('click', startCurrentTask);
    DOM.completeTaskBtn?.addEventListener('click', openCompleteModal);
    
    // Фильтры
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            WorkerState.filter = btn.dataset.filter;
            renderTasks();
        });
    });
    
    // Модальное окно
    DOM.modalOverlay?.addEventListener('click', closeModal);
    document.querySelector('.modal-close')?.addEventListener('click', closeModal);
    document.getElementById('cancelCompleteBtn')?.addEventListener('click', closeModal);
    document.getElementById('confirmCompleteBtn')?.addEventListener('click', confirmCompleteTask);
    
    // Очистка истории
    document.getElementById('clearHistoryBtn')?.addEventListener('click', clearHistory);
}

function subscribeToElectronEvents() {
    window.electronAPI?.on.dbUpdated.subscribe(() => {
        console.log('[Worker] Данные обновлены');
        refreshData();
    });
    
    window.electronAPI?.on.taskStatusChanged.subscribe((data) => {
        console.log('[Worker] Статус задачи изменён:', data);
        if (data.brigadeId === WorkerState.brigadeId) {
            refreshData();
        }
    });
}

// ================================================================
// ДЕЙСТВИЯ С ЗАДАЧАМИ
// ================================================================

function selectTask(taskId) {
    const task = WorkerState.tasks.find(t => t.id === taskId);
    if (!task || task.status === 'blocked') return;
    
    // Если уже есть активная задача
    if (WorkerState.currentTask) {
        showNotification('Внимание', 'Сначала завершите текущую задачу', 'warning');
        return;
    }
    
    WorkerState.currentTask = task;
    task.status = 'in_progress';
    
    renderCurrentTask();
    renderTasks();
    updateQueueCount();
    
    // Уведомляем систему
    window.electronAPI?.emit.taskStarted({
        operationId: task.op_number,
        brigadeId: WorkerState.brigadeId,
        userId: WorkerState.userId
    });
    
    showNotification('Задача начата', `Операция #${task.op_number}`, 'success');
}

function startCurrentTask() {
    if (!WorkerState.currentTask) return;
    
    WorkerState.currentTask.status = 'in_progress';
    renderCurrentTask();
    
    window.electronAPI?.emit.taskStarted({
        operationId: WorkerState.currentTask.op_number,
        brigadeId: WorkerState.brigadeId
    });
}

function openCompleteModal() {
    if (!WorkerState.currentTask) return;
    
    // Предзаполняем форму
    if (DOM.actualDuration) {
        DOM.actualDuration.value = WorkerState.currentTask.duration;
    }
    if (DOM.actualPeople) {
        DOM.actualPeople.value = WorkerState.currentTask.people_count;
    }
    
    DOM.modalOverlay.style.display = 'block';
    DOM.completeTaskModal.style.display = 'block';
}

function closeModal() {
    DOM.modalOverlay.style.display = 'none';
    DOM.completeTaskModal.style.display = 'none';
}

async function confirmCompleteTask() {
    const actualDuration = parseFloat(DOM.actualDuration?.value);
    const actualPeople = parseInt(DOM.actualPeople?.value);
    
    if (!actualDuration || actualDuration <= 0) {
        showNotification('Ошибка', 'Укажите фактическое время', 'error');
        return;
    }
    
    closeModal();
    showLoading('Завершение задачи...');
    
    try {
        const task = WorkerState.currentTask;
        const efficiency = task.duration / actualDuration;
        
        // Добавляем в историю
        WorkerState.history.unshift({
            id: Date.now(),
            op_number: task.op_number,
            name: task.name,
            completed_at: new Date().toISOString(),
            planned_duration: task.duration,
            actual_duration: actualDuration,
            people_planned: task.people_count,
            people_actual: actualPeople,
            efficiency: efficiency
        });
        
        // Удаляем из текущих задач
        WorkerState.tasks = WorkerState.tasks.filter(t => t.id !== task.id);
        WorkerState.currentTask = null;
        
        // Останавливаем таймер
        stopTimer();
        
        // Обновляем статистику
        WorkerState.stats.completed++;
        WorkerState.stats.totalHours += actualDuration;
        
        // Уведомляем систему
        window.electronAPI?.emit.taskCompleted({
            operationId: task.op_number,
            actualDuration,
            actualPeople,
            efficiency
        });
        
        // Обновляем UI
        renderCurrentTask();
        renderTasks();
        renderHistory();
        updateStats();
        updateQueueCount();
        
        showNotification('Задача завершена', `Операция #${task.op_number}`, 'success');
        
        // Отправляем данные для обучения AI
        await window.electronAPI?.ai.trainModel([{
            labor_hours: task.labor_hours,
            people_count: actualPeople,
            brigade_load: WorkerState.brigade.currentLoad,
            time_reserve: task.time_reserve,
            actual_duration: actualDuration
        }]);
        
    } catch (error) {
        console.error('[Worker] Ошибка завершения задачи:', error);
        showNotification('Ошибка', 'Не удалось завершить задачу', 'error');
    } finally {
        hideLoading();
    }
}

// ================================================================
// ТАЙМЕР
// ================================================================

function startTimer() {
    if (WorkerState.timer.isRunning) return;
    
    WorkerState.timer.isRunning = true;
    WorkerState.timer.startTime = Date.now() - WorkerState.timer.elapsedSeconds * 1000;
    
    WorkerState.timer.interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - WorkerState.timer.startTime) / 1000);
        WorkerState.timer.elapsedSeconds = elapsed;
        
        if (DOM.timerValue) {
            DOM.timerValue.textContent = formatDuration(elapsed);
        }
        
        // Прогресс относительно планового времени
        if (WorkerState.currentTask) {
            const progress = Math.min((elapsed / 3600) / WorkerState.currentTask.duration * 100, 100);
            if (DOM.timerProgress) {
                DOM.timerProgress.style.width = `${progress}%`;
            }
        }
    }, 1000);
}

function stopTimer() {
    if (WorkerState.timer.interval) {
        clearInterval(WorkerState.timer.interval);
        WorkerState.timer.interval = null;
    }
    WorkerState.timer.isRunning = false;
    WorkerState.timer.elapsedSeconds = 0;
    
    if (DOM.timerValue) {
        DOM.timerValue.textContent = '00:00:00';
    }
    if (DOM.timerProgress) {
        DOM.timerProgress.style.width = '0%';
    }
}

// ================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ================================================================

function startDateTimeUpdates() {
    updateDateTime();
    setInterval(updateDateTime, 1000);
}

function updateDateTime() {
    const now = new Date();
    
    if (DOM.currentDate) {
        DOM.currentDate.textContent = now.toLocaleDateString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    }
    if (DOM.currentTime) {
        DOM.currentTime.textContent = now.toLocaleTimeString('ru-RU', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }
}

async function checkConnection() {
    try {
        const isReady = await window.electronAPI?.python.isReady();
        if (DOM.connectionStatus) {
            DOM.connectionStatus.className = 'connection-status ' + (isReady ? '' : 'offline');
            const statusText = DOM.connectionStatus.querySelector('.status-text');
            if (statusText) {
                statusText.textContent = isReady ? 'Подключено' : 'Нет связи';
            }
        }
    } catch (error) {
        console.error('[Worker] Ошибка проверки соединения:', error);
    }
}

async function refreshData() {
    await loadWorkerData();
    renderCurrentTask();
    renderTasks();
    renderHistory();
    updateStats();
}

function clearHistory() {
    if (confirm('Очистить историю задач?')) {
        WorkerState.history = [];
        WorkerState.stats.completed = 0;
        WorkerState.stats.totalHours = 0;
        WorkerState.stats.efficiency = 0;
        renderHistory();
        updateStats();
    }
}

async function logout() {
    await window.electronAPI?.navigation.logout();
}

function showNotification(title, message, type = 'info') {
    if (!DOM.notificationsContainer) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-title">${title}</div>
        <div class="notification-message">${message}</div>
        <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    
    DOM.notificationsContainer.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

function showLoading(text = 'Загрузка...') {
    if (DOM.loadingOverlay) {
        if (DOM.loadingText) DOM.loadingText.textContent = text;
        DOM.loadingOverlay.style.display = 'flex';
    }
}

function hideLoading() {
    if (DOM.loadingOverlay) {
        DOM.loadingOverlay.style.display = 'none';
    }
}

function getStatusText(status) {
    const map = {
        pending: 'Ожидает',
        in_progress: 'В работе',
        completed: 'Завершено',
        blocked: 'Заблокировано'
    };
    return map[status] || status;
}

function getTaskWord(count) {
    if (count % 10 === 1 && count % 100 !== 11) return 'задача';
    if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return 'задачи';
    return 'задач';
}

function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ================================================================
// ЗАПУСК
// ================================================================

document.addEventListener('DOMContentLoaded', initWorker);