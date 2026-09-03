/**
 * NEVZ Worker Hub — Industrial Precision + API
 */
'use strict';

const API = 'http://127.0.0.1:8000';

const WorkerState = {
  userId: null,
  brigadeId: null,
  user: null,
  brigade: null,
  currentTask: null,
  tasks: [],
  history: [],
  mates: [],
  stats: { completed: 0, totalHours: 0, efficiency: 0, percent: 0 },
  timer: { isRunning: false, startTime: null, elapsedSeconds: 0, interval: null },
  filter: 'all',
  horizon: 'week',
  page: 'tasks',
  qr: { token: null, expires: null }
};

const DOM = {};

const PAGE_LABELS = {
  tasks: 'Мои задачи',
  operations: 'Операции',
  schedule: 'Расписание',
  graph: 'Граф процесса',
  ai: 'AI-поддержка',
  messages: 'Сообщения',
  settings: 'Настройки'
};

const CHAT_ROLE = 'worker';
const ChatState = { threads: [], activeId: null };


async function initWorker() {
  cacheDomElements();
  setupSidebar();
  setupHubNav();
  setupEventListeners();
  setupSettings();

  document.getElementById('btnChatSend')?.addEventListener('click', sendChatMessage);
  document.getElementById('chatSearch')?.addEventListener('input', renderChatThreadList);
  document.getElementById('btnNotifPanel')?.addEventListener('click', () => {
    if (typeof showPage === 'function') showPage('messages');
    loadChatThreads();
  });
  fillChatTemplates();

  const auth = window.electronAPI?.storage?.get('auth');
  const q = new URLSearchParams(window.location.search || '');
  const params = window.electronAPI?.app?.getStartupParams?.() || {};
  WorkerState.userId = auth?.user?.id || params.userId || q.get('userId') || null;
  WorkerState.brigadeId = auth?.user?.brigade_id ?? params.brigadeId ?? q.get('brigadeId') ?? null;

  // restore sidebar
  if (localStorage.getItem('workerSidebarCollapsed') === '1') {
    document.getElementById('hubSidebar')?.classList.add('collapsed');
  }

  showHubPage('tasks');
  await loadWorkerData();
  startDateTimeUpdates();
  checkConnection();
  setInterval(checkConnection, 30000);
}

function cacheDomElements() {
  [
    'userName','userBrigade','userAvatar','currentDate','currentTime',
    'currentTaskContainer','noTaskMessage','taskDetails','taskNumber','taskName',
    'taskPost','taskDrawing','taskLabor','taskPeople','taskDuration','taskLocation',
    'taskPriority','taskDependencies','startTaskBtn','completeTaskBtn','pauseTaskBtn',
    'timerValue','timerProgress','taskQueueList','queueCount','historyList','brigadeInfo',
    'tasksCompleted','totalHours','efficiency','tasksInQueue','shiftProgressText','shiftProgressBar',
    'modalOverlay','completeTaskModal','actualDuration','actualPeople','taskComment',
    'connectionStatus','appVersion','loadingOverlay','loadingText','notificationsContainer',
    'hubBrigadeLabel','hubPageLabel','profileInfo','operationsGrid','scheduleList',
    'workerGraphFlow','aiQuestion','aiAnswer'
  ].forEach((id) => { DOM[id] = document.getElementById(id); });
}

function setupSidebar() {
  const side = document.getElementById('hubSidebar');
  const toggle = document.getElementById('sidebarToggle');
  const mobile = document.getElementById('sidebarToggleMobile');
  const modeSel = () => localStorage.getItem('workerSidebarMode') || 'click';

  function setCollapsed(on) {
    if (!side) return;
    side.classList.toggle('collapsed', !!on);
    localStorage.setItem('workerSidebarCollapsed', on ? '1' : '0');
  }

  toggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    setCollapsed(!side.classList.contains('collapsed'));
  });
  // Свернутый бар: клик по логотипу разворачивает (стрелки нет)
  side?.querySelector('.hub-logo')?.addEventListener('click', () => {
    if (side.classList.contains('collapsed')) setCollapsed(false);
  });
  mobile?.addEventListener('click', () => side?.classList.toggle('mobile-hidden'));
  document.getElementById('toggleSidebarNowBtn')?.addEventListener('click', () => {
    setCollapsed(!side?.classList.contains('collapsed'));
  });

  let hoverTimer = null;
  side?.addEventListener('mouseenter', () => {
    if (modeSel() !== 'hover') return;
    clearTimeout(hoverTimer);
    if (side.classList.contains('collapsed')) {
      side.dataset.wasCollapsed = '1';
      side.classList.remove('collapsed');
    }
  });
  side?.addEventListener('mouseleave', () => {
    if (modeSel() !== 'hover') return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      if (side.dataset.wasCollapsed === '1') {
        side.classList.add('collapsed');
        side.dataset.wasCollapsed = '';
      }
    }, 180);
  });
}

function setupHubNav() {
  document.querySelectorAll('.hub-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => showHubPage(btn.dataset.page));
  });
  document.getElementById('hubLogoutBtn')?.addEventListener('click', logout);
}

function showHubPage(page) {
  WorkerState.page = page;
  document.querySelectorAll('.hub-nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.page === page);
  });
  document.querySelectorAll('.hub-page').forEach((el) => {
    el.classList.toggle('active', el.id === 'page-' + page);
  });
  if (DOM.hubPageLabel) DOM.hubPageLabel.textContent = PAGE_LABELS[page] || page;
  if (page === 'operations') renderOperationsGrid();
  if (page === 'schedule') { renderScheduleList(); renderBrigadeInfo(); renderHistory(); }
  if (page === 'graph') renderWorkerGraph();
  if (page === 'settings') {
    fillSettingsForm();
    loadPersonalQr();
  }
}

async function loadWorkerData() {
  showLoading('Загрузка…');
  try {
    await loadTasksFromApi();
    renderCurrentTask();
    renderTasks();
    renderHistory();
    renderBrigadeInfo();
    updateQueueCount();
    renderOperationsGrid();
    renderScheduleList();
    renderWorkerGraph();
    fillSettingsForm();
  } catch (e) {
    console.error(e);
    showNotification('Ошибка', e.message || 'Не удалось загрузить данные', 'error');
  } finally {
    hideLoading();
  }
}

async function loadTasksFromApi() {
  const auth = window.electronAPI?.storage?.get('auth');
  const workerId = auth?.user?.id || WorkerState.userId;
  if (!workerId) throw new Error('Нет workerId — войдите снова');

  const res = await fetch(
    API + '/auth/worker/' + workerId + '/dashboard?horizon=' + encodeURIComponent(WorkerState.horizon || 'week')
  );
  if (!res.ok) throw new Error('dashboard HTTP ' + res.status);
  const data = await res.json();

  WorkerState.user = data.worker || null;
  WorkerState.brigadeId = data.worker?.brigade_id ?? WorkerState.brigadeId;
  WorkerState.brigade = data.brigade || null;
  WorkerState.tasks = Array.isArray(data.operations) ? data.operations : [];
  WorkerState.mates = Array.isArray(data.mates) ? data.mates : [];
  WorkerState.stats.completed = data.progress?.completed || 0;
  WorkerState.stats.percent = data.progress?.percent || 0;
  WorkerState.stats.efficiency = data.progress?.percent || 0;
  WorkerState.currentTask =
    WorkerState.tasks.find((t) => String(t.status).toLowerCase() === 'in_progress') || null;

  const name = data.worker?.name || 'Сотрудник';
  const letter = (name.charAt(0) || '?').toUpperCase();
  if (DOM.userName) DOM.userName.textContent = name;
  if (DOM.userAvatar) DOM.userAvatar.textContent = letter;
  const sideAv = document.getElementById('userAvatarSide');
  if (sideAv) sideAv.textContent = letter;
  const sideName = document.getElementById('userNameSide');
  if (sideName) sideName.textContent = name;
  const sideRole = document.getElementById('userRoleSide');
  if (sideRole) sideRole.textContent = data.worker?.role || 'worker';

  const brigName =
    (data.brigade && data.brigade.name) ||
    (data.worker?.brigade_id != null ? 'Бригада #' + data.worker.brigade_id : '—');
  if (DOM.userBrigade) DOM.userBrigade.textContent = brigName;
  if (DOM.hubBrigadeLabel) DOM.hubBrigadeLabel.textContent = brigName;
  applyAvatarFromStorage();

  applyStatsToDom();
}

function applyStatsToDom() {
  const pct = Math.max(0, Math.min(100, Number(WorkerState.stats.percent) || 0));
  if (DOM.tasksCompleted) DOM.tasksCompleted.textContent = String(WorkerState.stats.completed || 0);
  if (DOM.efficiency) DOM.efficiency.textContent = pct + '%';
  if (DOM.shiftProgressText) DOM.shiftProgressText.textContent = pct + '%';
  if (DOM.shiftProgressBar) DOM.shiftProgressBar.style.width = pct + '%';
  const ring = document.getElementById('efficiencyRing');
  if (ring) ring.setAttribute('stroke-dasharray', pct + ', 100');
  if (DOM.totalHours) {
    const hours = WorkerState.tasks.reduce((s, t) => s + (Number(t.duration) || 0), 0);
    DOM.totalHours.textContent = hours.toFixed(1);
  }
  const active = WorkerState.tasks.filter((t) => {
    const st = String(t.status || '').toLowerCase();
    return st === 'pending' || st === 'ready' || st === 'in_progress';
  }).length;
  const totalGoal = Math.max(active + (WorkerState.stats.completed || 0), 1);
  if (DOM.tasksInQueue) DOM.tasksInQueue.textContent = String(totalGoal);
}

function setupEventListeners() {
  document.getElementById('refreshBtn')?.addEventListener('click', () => loadWorkerData());
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  DOM.startTaskBtn?.addEventListener('click', startCurrentTask);
  DOM.completeTaskBtn?.addEventListener('click', openCompleteModal);
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      WorkerState.filter = btn.dataset.filter;
      renderTasks();
    });
  });
  DOM.modalOverlay?.addEventListener('click', closeModal);
  document.querySelector('.modal-close')?.addEventListener('click', closeModal);
  document.getElementById('cancelCompleteBtn')?.addEventListener('click', closeModal);
  document.getElementById('confirmCompleteBtn')?.addEventListener('click', confirmCompleteTask);
  document.getElementById('clearHistoryBtn')?.addEventListener('click', clearHistory);
  document.getElementById('horizonSelect')?.addEventListener('change', async (e) => {
    WorkerState.horizon = e.target.value;
    await loadWorkerData();
  });
  document.getElementById('aiAskBtn')?.addEventListener('click', onAiAsk);
}

function setupSettings() {
  document.getElementById('refreshQrBtn')?.addEventListener('click', () => loadPersonalQr(true));
  document.getElementById('settingsSaveBtn')?.addEventListener('click', saveSettingsLocal);
  document.getElementById('settingsCancelBtn')?.addEventListener('click', fillSettingsForm);
  document.getElementById('changePasswordBtn')?.addEventListener('click', changePassword);
  document.getElementById('settingsSidebarMode')?.addEventListener('change', (e) => {
    localStorage.setItem('workerSidebarMode', e.target.value);
  });
  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      localStorage.setItem('workerTheme', btn.dataset.theme);
      showNotification('Тема', btn.dataset.theme === 'dark' ? 'Тёмная (флаг сохранён)' : 'Светлая', 'info');
    });
  });
  document.getElementById('avatarChangeBtn')?.addEventListener('click', () => {
    document.getElementById('avatarFileInput')?.click();
  });
  document.getElementById('avatarFileInput')?.addEventListener('change', onAvatarSelected);
  document.getElementById('avatarDeleteBtn')?.addEventListener('click', deleteAvatar);
  document.getElementById('sendReportBtn')?.addEventListener('click', sendAdminReport);
}

function fillSettingsForm() {
  const u = WorkerState.user || {};
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v != null && v !== '') ? String(v) : '—'; };
  set('settingsName', u.name);
  set('settingsLogin', u.login);
  set('settingsId', u.id);
  set('settingsRole', u.role || 'worker');
  set('settingsBrigade', WorkerState.brigade?.name || (u.brigade_id != null ? '#' + u.brigade_id : ''));
  set('settingsEmail', u.email || u.mail);
  set('settingsPhone', u.phone || u.telephone);
  set('settingsPosition', u.position || u.job_title || u.title);
  set('settingsTabNum', u.tab_number || u.personnel_number || u.employee_number);
  // Учётная запись (из БД) vs присутствие (сессия)
  const accEl = document.getElementById('settingsAccountStatus');
  if (accEl) {
    let acc = '—';
    if (u.is_active === 0 || u.is_active === false || String(u.status).toLowerCase() === 'inactive') acc = 'неактивна';
    else if (u.is_active === 1 || u.is_active === true || String(u.status).toLowerCase() === 'active') acc = 'активна';
    else if (u.status) acc = String(u.status);
    else acc = 'активна'; // есть сессия в кабинете — запись рабочая
    accEl.value = acc;
  }
  updateOnlineStatusField();
  const letter = (u.name || '?').charAt(0).toUpperCase();
  const av = document.getElementById('settingsAvatar');
  if (av) av.textContent = letter;
  applyAvatarFromStorage();
  const mode = document.getElementById('settingsSidebarMode');
  if (mode) mode.value = localStorage.getItem('workerSidebarMode') || 'click';
  renderReportList();
}

async function loadPersonalQr(force) {
  const frame = document.getElementById('personalQrFrame');
  const canvas = document.getElementById('personalQrCanvas');
  const ph = document.getElementById('personalQrPlaceholder');
  const expEl = document.getElementById('qrExpires');
  const stEl = document.getElementById('qrStatus');
  if (ph) ph.textContent = 'Загрузка…';

  const auth = window.electronAPI?.storage?.get('auth');
  const workerId = auth?.user?.id || WorkerState.userId;
  if (!workerId) {
    if (ph) ph.textContent = 'Нет сессии';
    if (stEl) stEl.textContent = 'ошибка';
    return;
  }

  try {
    // Prefer personal daily QR endpoint
    let res = await fetch(API + '/auth/qr/my?worker_id=' + encodeURIComponent(workerId) + (force ? '&refresh=1' : ''));
    if (!res.ok) {
      // fallback: create session token for display
      res = await fetch(API + '/auth/qr/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: workerId, purpose: 'personal_daily' })
      });
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const token = data.token || data.qr_token || data.code || data.payload;
    const expires = data.expires_at || data.expires || data.valid_until;
    WorkerState.qr = { token, expires };

    if (expEl) {
      try {
        expEl.textContent = expires
          ? new Date(expires).toLocaleString('ru-RU')
          : 'до полуночи (сервер)';
      } catch (_) {
        expEl.textContent = String(expires || '—');
      }
    }
    if (stEl) stEl.textContent = data.status || 'активен';
    const payload = typeof token === 'string' ? token : JSON.stringify(token || data);
    const prev = document.getElementById('qrTokenPreview');
    if (prev) {
      const s = String(payload);
      prev.textContent = s.length > 28 ? s.slice(0, 14) + '…' + s.slice(-8) : s;
    }
    await drawQrOnCanvas(canvas, payload);
    frame?.classList.add('has-qr');
    if (ph) ph.style.display = 'none';
  } catch (e) {
    console.warn('[QR]', e);
    frame?.classList.remove('has-qr');
    if (ph) {
      ph.style.display = 'flex';
      ph.textContent = 'QR недоступен: ' + (e.message || e) + '. Нужен /auth/qr/my на API.';
    }
    if (stEl) stEl.textContent = 'не загружен';
    // local fallback pattern for UI demo
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 180, 180);
      ctx.fillStyle = '#1b2b48';
      ctx.font = '12px sans-serif';
      ctx.fillText('QR API offline', 40, 90);
    }
  }
}

/** Minimal QR-like placeholder if no library — tries CDN-free matrix from token hash */
async function drawQrOnCanvas(canvas, text) {
  if (!canvas) return;
  const size = 180;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Try global QRCode if present
  if (typeof window.QRCode !== 'undefined') {
    return new Promise((resolve) => {
      try {
        // qrcodejs style
        const div = document.createElement('div');
        // eslint-disable-next-line no-new
        new window.QRCode(div, { text: String(text), width: size, height: size });
        setTimeout(() => {
          const img = div.querySelector('img') || div.querySelector('canvas');
          if (img) ctx.drawImage(img, 0, 0, size, size);
          resolve();
        }, 50);
      } catch (_) {
        drawPseudoQr(ctx, text, size);
        resolve();
      }
    });
  }
  drawPseudoQr(ctx, text, size);
}

function drawPseudoQr(ctx, text, size) {
  // Deterministic pattern from string — visual stand-in until QR lib added
  let h = 0;
  const s = String(text);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const cells = 25;
  const cell = Math.floor(size / cells);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1b2b48';
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const bit = ((h >> ((x * 3 + y) % 16)) ^ (x * 7 + y * 13 + h)) & 1;
      const finder =
        (x < 7 && y < 7) || (x >= cells - 7 && y < 7) || (x < 7 && y >= cells - 7);
      if (finder) {
        const onEdge = x === 0 || y === 0 || x === 6 || y === 6 ||
          x === cells - 1 || y === cells - 1 || x === cells - 7 || y === cells - 7;
        const inCore = (x >= 2 && x <= 4 && y >= 2 && y <= 4) ||
          (x >= cells - 5 && x <= cells - 3 && y >= 2 && y <= 4) ||
          (x >= 2 && x <= 4 && y >= cells - 5 && y <= cells - 3);
        if (onEdge || inCore) ctx.fillRect(x * cell, y * cell, cell, cell);
      } else if (bit) {
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }
}

function saveSettingsLocal() {
  const lang = document.getElementById('settingsLang')?.value;
  const mode = document.getElementById('settingsSidebarMode')?.value;
  if (lang) localStorage.setItem('workerLang', lang);
  if (mode) localStorage.setItem('workerSidebarMode', mode);
  localStorage.setItem('workerNotifApp', document.getElementById('notifApp')?.checked ? '1' : '0');
  localStorage.setItem('workerNotifCritical', document.getElementById('notifCritical')?.checked ? '1' : '0');
  showNotification('Сохранено', 'Настройки интерфейса записаны локально', 'success');
}

async function changePassword() {
  const p1 = document.getElementById('newPassword')?.value || '';
  const p2 = document.getElementById('newPassword2')?.value || '';
  if (p1.length < 6) {
    showNotification('Ошибка', 'Пароль не короче 6 символов', 'error');
    return;
  }
  if (p1 !== p2) {
    showNotification('Ошибка', 'Пароли не совпадают', 'error');
    return;
  }
  const auth = window.electronAPI?.storage?.get('auth');
  const workerId = auth?.user?.id || WorkerState.userId;
  try {
    const res = await fetch(API + '/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: workerId, new_password: p1 })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' — эндпоинт может быть ещё не подключён');
    showNotification('Готово', 'Пароль изменён', 'success');
    document.getElementById('newPassword').value = '';
    document.getElementById('newPassword2').value = '';
  } catch (e) {
    showNotification('Пароль', String(e.message || e), 'warning');
  }
}

function renderCurrentTask() {
  if (!DOM.noTaskMessage || !DOM.taskDetails) return;
  if (!WorkerState.currentTask) {
    DOM.noTaskMessage.style.display = 'block';
    DOM.taskDetails.style.display = 'none';
    if (DOM.startTaskBtn) DOM.startTaskBtn.style.display = 'none';
    if (DOM.completeTaskBtn) DOM.completeTaskBtn.style.display = 'none';
    if (DOM.currentTaskStatus) DOM.currentTaskStatus.textContent = 'Нет';
    stopTimer();
    return;
  }
  DOM.noTaskMessage.style.display = 'none';
  DOM.taskDetails.style.display = 'block';
  const task = WorkerState.currentTask;
  if (DOM.taskNumber) DOM.taskNumber.textContent = '#' + (task.op_number ?? task.id);
  if (DOM.taskName) DOM.taskName.textContent = task.name || 'Операция';
  if (DOM.taskPost) DOM.taskPost.textContent = task.post ?? '—';
  if (DOM.taskDrawing) DOM.taskDrawing.textContent = task.drawing || '—';
  if (DOM.taskLabor) DOM.taskLabor.textContent = (task.labor_hours ?? '—') + ' чел·ч';
  if (DOM.taskPeople) DOM.taskPeople.textContent = task.people_count ?? '—';
  if (DOM.taskDuration) DOM.taskDuration.textContent = (task.duration ?? '—') + ' ч';
  if (DOM.taskLocation) DOM.taskLocation.textContent = task.location || '—';
  const priorityMap = { high: 'Высокий', medium: 'Средний', low: 'Низкий', critical: 'Критический' };
  if (DOM.taskPriority) DOM.taskPriority.textContent = priorityMap[task.priority] || task.priority || '—';
  const deps = task.prev_ops || task.dependencies || [];
  if (DOM.taskDependencies) {
    DOM.taskDependencies.textContent = Array.isArray(deps) && deps.length
      ? deps.map((d) => '#' + d).join(', ')
      : 'Нет';
  }
  const st = String(task.status || '').toLowerCase();
  if (DOM.currentTaskStatus) DOM.currentTaskStatus.textContent = getStatusText(st);
  if (st === 'in_progress') {
    if (DOM.startTaskBtn) DOM.startTaskBtn.style.display = 'none';
    if (DOM.completeTaskBtn) DOM.completeTaskBtn.style.display = 'inline-flex';
    startTimer();
  } else {
    if (DOM.startTaskBtn) DOM.startTaskBtn.style.display = 'inline-flex';
    if (DOM.completeTaskBtn) DOM.completeTaskBtn.style.display = 'none';
  }
}

function renderTasks() {
  if (!DOM.taskQueueList) return;
  let tasks = WorkerState.tasks.filter((t) => String(t.status).toLowerCase() !== 'in_progress');
  if (WorkerState.filter === 'pending') {
    tasks = tasks.filter((t) => ['pending', 'ready'].includes(String(t.status).toLowerCase()));
  } else if (WorkerState.filter === 'blocked') {
    tasks = tasks.filter((t) => String(t.status).toLowerCase() === 'blocked');
  }
  if (!tasks.length) {
    DOM.taskQueueList.innerHTML = '<div class="empty-queue"><p>Нет задач в очереди</p></div>';
    return;
  }
  DOM.taskQueueList.innerHTML = tasks.map((task) => {
    const st = String(task.status || 'pending').toLowerCase();
    return (
      '<div class="queue-item ' + st + '" data-task-id="' + task.id + '">' +
      '<div class="queue-item-icon">' + (task.op_number ?? task.id) + '</div>' +
      '<div class="queue-item-content">' +
      '<div class="queue-item-title">' + escapeHtml(task.name || 'Операция') + '</div>' +
      '<div class="queue-item-meta"><span>Пост ' + (task.post ?? '—') + '</span>' +
      '<span>' + (task.duration ?? '—') + ' ч</span></div></div>' +
      '<div class="queue-item-status">' + getStatusText(st) + '</div></div>'
    );
  }).join('');
  DOM.taskQueueList.querySelectorAll('.queue-item').forEach((item) => {
    item.addEventListener('click', () => selectTask(Number(item.dataset.taskId)));
  });
}

function renderHistory() {
  if (!DOM.historyList) return;
  if (!WorkerState.history.length) {
    DOM.historyList.innerHTML = '<div class="empty-history"><p>Нет завершённых задач за сессию</p></div>';
    return;
  }
  DOM.historyList.innerHTML = WorkerState.history.slice(0, 15).map((item) =>
    '<div class="history-item"><div class="history-item-header">' +
    '<span class="history-item-number">#' + item.op_number + '</span>' +
    '<span>' + formatTime(item.completed_at) + '</span></div>' +
    '<div>' + escapeHtml(item.name) + '</div></div>'
  ).join('');
}

function renderBrigadeInfo() {
  if (!DOM.brigadeInfo) return;
  const name = WorkerState.brigade?.name || ('Бригада #' + (WorkerState.brigadeId || '—'));
  const mates = WorkerState.mates || [];
  DOM.brigadeInfo.innerHTML =
    '<div><strong>' + escapeHtml(name) + '</strong>' +
    (mates.length
      ? '<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">' +
        mates.map((m) =>
          '<span style="background:#f1f5f9;padding:4px 10px;border-radius:999px;font-size:12px;">' +
          escapeHtml(m.name || '') + (m.is_brigadier ? ' ★' : '') + '</span>'
        ).join('') + '</div>'
      : '<p class="muted">Нет данных о составе</p>') +
    '</div>';
}

function renderOperationsGrid() {
  const box = DOM.operationsGrid || document.getElementById('operationsGrid');
  if (!box) return;
  const tasks = WorkerState.tasks || [];
  if (!tasks.length) {
    box.innerHTML = '<p class="muted">Нет операций у вашей бригады.</p>';
    return;
  }
  box.innerHTML = tasks.map((t) => {
    const st = String(t.status || 'pending').toLowerCase();
    return (
      '<div class="op-card ' + st + '">' +
      '<span class="op-badge ' + st + '">' + getStatusText(st) + '</span>' +
      '<div class="op-card-title">#' + (t.op_number ?? t.id) + ' · ' + escapeHtml(t.name || '') + '</div>' +
      '<div class="op-card-meta">Пост ' + (t.post ?? '—') + ' · ' + (t.duration ?? '—') + ' ч<br>Чертёж: ' +
      escapeHtml(t.drawing || '—') + '</div></div>'
    );
  }).join('');
}

function renderScheduleList() {
  const box = DOM.scheduleList || document.getElementById('scheduleList');
  if (!box) return;
  const tasks = WorkerState.tasks || [];
  if (!tasks.length) {
    box.innerHTML = '<p class="muted">Нет данных на горизонт.</p>';
    return;
  }
  box.innerHTML = '<ul style="list-style:none;margin:0;padding:0;">' +
    tasks.map((t) =>
      '<li class="op-card" style="margin-bottom:8px;">#' + (t.op_number ?? t.id) + ' — ' +
      escapeHtml(t.name || '') + ' <span class="muted">(' + getStatusText(t.status) + ')</span></li>'
    ).join('') + '</ul>';
}

function renderWorkerGraph() {
  const box = DOM.workerGraphFlow || document.getElementById('workerGraphFlow');
  if (!box) return;
  const tasks = WorkerState.tasks || [];
  if (!tasks.length) {
    box.innerHTML = '<p class="muted">Нет операций для графа.</p>';
    return;
  }
  box.innerHTML = tasks.map((t) => {
    let next = t.next_ops;
    if (typeof next === 'string') {
      try { next = JSON.parse(next); } catch (_) { next = []; }
    }
    if (!Array.isArray(next)) next = [];
    return (
      '<div class="op-card">#' + (t.op_number ?? t.id) + ' ' + escapeHtml(t.name || '') +
      ' → [' + (next.length ? next.join(', ') : '—') + ']</div>'
    );
  }).join('');
}

function updateQueueCount() {
  if (!DOM.queueCount) return;
  const count = WorkerState.tasks.filter((t) => String(t.status).toLowerCase() !== 'in_progress').length;
  DOM.queueCount.textContent = count + ' ' + getTaskWord(count);
}

function selectTask(taskId) {
  const task = WorkerState.tasks.find((t) => Number(t.id) === Number(taskId));
  if (!task || String(task.status).toLowerCase() === 'blocked') return;
  if (WorkerState.currentTask && Number(WorkerState.currentTask.id) !== Number(task.id)) {
    showNotification('Внимание', 'Сначала завершите текущую задачу', 'warning');
    return;
  }
  WorkerState.currentTask = task;
  renderCurrentTask();
  renderTasks();
}

async function startCurrentTask() {
  if (!WorkerState.currentTask) return;
  const id = WorkerState.currentTask.id;
  try {
    showLoading('Старт…');
    const res = await fetch(API + '/operations/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    WorkerState.currentTask.status = 'in_progress';
    const t = WorkerState.tasks.find((x) => Number(x.id) === Number(id));
    if (t) t.status = 'in_progress';
    renderCurrentTask();
    renderTasks();
    showNotification('Задача начата', '#' + (WorkerState.currentTask.op_number ?? id), 'success');
  } catch (e) {
    showNotification('Ошибка', String(e.message || e), 'error');
  } finally {
    hideLoading();
  }
}

function openCompleteModal() {
  if (!WorkerState.currentTask) return;
  if (DOM.actualDuration) DOM.actualDuration.value = WorkerState.currentTask.duration || 1;
  if (DOM.actualPeople) DOM.actualPeople.value = WorkerState.currentTask.people_count || 1;
  if (DOM.modalOverlay) DOM.modalOverlay.style.display = 'block';
  if (DOM.completeTaskModal) DOM.completeTaskModal.style.display = 'block';
}
function closeModal() {
  if (DOM.modalOverlay) DOM.modalOverlay.style.display = 'none';
  if (DOM.completeTaskModal) DOM.completeTaskModal.style.display = 'none';
}

async function confirmCompleteTask() {
  const actualDuration = parseFloat(DOM.actualDuration?.value);
  const actualPeople = parseInt(DOM.actualPeople?.value, 10);
  if (!actualDuration || actualDuration <= 0) {
    showNotification('Ошибка', 'Укажите фактическое время', 'error');
    return;
  }
  const task = WorkerState.currentTask;
  if (!task) return;
  closeModal();
  showLoading('Завершение…');
  try {
    const res = await fetch(API + '/operations/' + task.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    WorkerState.history.unshift({
      id: Date.now(),
      op_number: task.op_number,
      name: task.name,
      completed_at: new Date().toISOString(),
      planned_duration: task.duration,
      actual_duration: actualDuration,
      people_actual: actualPeople
    });
    WorkerState.tasks = WorkerState.tasks.filter((t) => Number(t.id) !== Number(task.id));
    WorkerState.currentTask = null;
    stopTimer();
    WorkerState.stats.completed = (WorkerState.stats.completed || 0) + 1;
    renderCurrentTask();
    renderTasks();
    renderHistory();
    applyStatsToDom();
    updateQueueCount();
    renderOperationsGrid();
    showNotification('Готово', 'Операция #' + (task.op_number ?? task.id) + ' завершена', 'success');
  } catch (e) {
    showNotification('Ошибка', String(e.message || e), 'error');
  } finally {
    hideLoading();
  }
}

function startTimer() {
  if (WorkerState.timer.isRunning) return;
  WorkerState.timer.isRunning = true;
  WorkerState.timer.startTime = Date.now() - WorkerState.timer.elapsedSeconds * 1000;
  WorkerState.timer.interval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - WorkerState.timer.startTime) / 1000);
    WorkerState.timer.elapsedSeconds = elapsed;
    if (DOM.timerValue) DOM.timerValue.textContent = formatDuration(elapsed);
    if (WorkerState.currentTask && DOM.timerProgress) {
      const progress = Math.min((elapsed / 3600) / (WorkerState.currentTask.duration || 1) * 100, 100);
      DOM.timerProgress.style.width = progress + '%';
    }
  }, 1000);
}
function stopTimer() {
  if (WorkerState.timer.interval) clearInterval(WorkerState.timer.interval);
  WorkerState.timer.interval = null;
  WorkerState.timer.isRunning = false;
  WorkerState.timer.elapsedSeconds = 0;
  if (DOM.timerValue) DOM.timerValue.textContent = '00:00:00';
  if (DOM.timerProgress) DOM.timerProgress.style.width = '0%';
}

function startDateTimeUpdates() {
  const tick = () => {
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
  };
  tick();
  setInterval(tick, 1000);
}

async function checkConnection() {
  try {
    const r = await fetch(API + '/health');
    const ok = r.ok;
    if (DOM.connectionStatus) {
      DOM.connectionStatus.classList.toggle('offline', !ok);
      const t = DOM.connectionStatus.querySelector('.status-text');
      if (t) t.textContent = ok ? 'Подключено' : 'Нет связи';
    }
  } catch (_) {
    if (DOM.connectionStatus) {
      DOM.connectionStatus.classList.add('offline');
      const t = DOM.connectionStatus.querySelector('.status-text');
      if (t) t.textContent = 'Нет связи';
    }
  }
  updateOnlineStatusField();
}

function clearHistory() {
  if (!confirm('Очистить историю за сессию?')) return;
  WorkerState.history = [];
  renderHistory();
}

async function logout() {
  try { await window.electronAPI?.navigation?.logout?.(); } catch (_) {}
}

async function onAiAsk() {
  const q = (DOM.aiQuestion?.value || '').trim();
  if (!q) return;
  const box = document.getElementById('aiMessages');
  if (box) {
    const u = document.createElement('div');
    u.className = 'bubble user';
    u.textContent = q;
    box.appendChild(u);
  }
  if (DOM.aiQuestion) DOM.aiQuestion.value = '';
  try {
    const res = await fetch(API + '/ai/status').catch(() => null);
    const text = res && res.ok
      ? 'AI API доступен. Полный чат можно подключить позже.'
      : 'AI в заготовке. Вопрос сохранён локально.';
    if (box) {
      const b = document.createElement('div');
      b.className = 'bubble bot';
      b.textContent = text;
      box.appendChild(b);
      box.scrollTop = box.scrollHeight;
    }
  } catch (e) {
    if (DOM.aiAnswer) {
      DOM.aiAnswer.style.display = 'block';
      DOM.aiAnswer.textContent = String(e);
    }
  }
}

function showNotification(title, message, type) {
  if (!DOM.notificationsContainer) return;
  if (localStorage.getItem('workerNotifApp') === '0' && type !== 'error') return;
  const el = document.createElement('div');
  el.className = 'notification ' + (type || 'info');
  el.innerHTML =
    '<div class="notification-title">' + escapeHtml(title) + '</div>' +
    '<div class="notification-message">' + escapeHtml(message) + '</div>';
  DOM.notificationsContainer.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}
function showLoading(text) {
  if (DOM.loadingText) DOM.loadingText.textContent = text || 'Загрузка…';
  if (DOM.loadingOverlay) DOM.loadingOverlay.style.display = 'flex';
}
function hideLoading() {
  if (DOM.loadingOverlay) DOM.loadingOverlay.style.display = 'none';
}
function getStatusText(status) {
  const map = {
    pending: 'Ожидает', ready: 'Готово', in_progress: 'В работе',
    completed: 'Завершено', done: 'Завершено', blocked: 'Блок'
  };
  return map[String(status || '').toLowerCase()] || status || '—';
}
function getTaskWord(count) {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return 'задач';
  if (n1 === 1) return 'задача';
  if (n1 >= 2 && n1 <= 4) return 'задачи';
  return 'задач';
}
function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch (_) { return ''; }
}
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((x) => String(x).padStart(2, '0')).join(':');
}
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


function avatarStorageKey() {
  const id = WorkerState.userId || WorkerState.user?.id || 'anon';
  return 'workerAvatar:' + id;
}

function applyAvatarFromStorage() {
  const dataUrl = localStorage.getItem(avatarStorageKey());
  const letter = (WorkerState.user?.name || '?').charAt(0).toUpperCase();
  const targets = [
    document.getElementById('settingsAvatar'),
    document.getElementById('userAvatar'),
    document.getElementById('userAvatarSide')
  ];
  const img = document.getElementById('settingsAvatarImg');
  if (dataUrl) {
    targets.forEach((el) => {
      if (!el) return;
      el.classList.add('has-photo');
      el.style.backgroundImage = 'url(' + dataUrl + ')';
      el.textContent = '';
    });
    if (img) {
      img.src = dataUrl;
      img.style.display = 'block';
      const av = document.getElementById('settingsAvatar');
      if (av) av.style.display = 'none';
    }
  } else {
    targets.forEach((el) => {
      if (!el) return;
      el.classList.remove('has-photo');
      el.style.backgroundImage = '';
      el.textContent = letter;
    });
    if (img) {
      img.removeAttribute('src');
      img.style.display = 'none';
    }
    const av = document.getElementById('settingsAvatar');
    if (av) av.style.display = '';
  }
}

function onAvatarSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showNotification('Фото', 'Максимум 2 МБ', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      localStorage.setItem(avatarStorageKey(), reader.result);
      applyAvatarFromStorage();
      showNotification('Фото', 'Аватар обновлён (локально на этом ПК)', 'success');
    } catch (err) {
      showNotification('Фото', 'Не удалось сохранить (лимит storage)', 'error');
    }
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function deleteAvatar() {
  localStorage.removeItem(avatarStorageKey());
  applyAvatarFromStorage();
  showNotification('Фото', 'Аватар удалён', 'info');
}

function reportStorageKey() {
  const id = WorkerState.userId || WorkerState.user?.id || 'anon';
  return 'workerReports:' + id;
}

function renderReportList() {
  const box = document.getElementById('reportList');
  if (!box) return;
  let list = [];
  try { list = JSON.parse(localStorage.getItem(reportStorageKey()) || '[]'); } catch (_) {}
  if (!list.length) {
    box.innerHTML = '<p class="muted" style="margin:8px 0 0;">Пока нет отправленных запросов</p>';
    return;
  }
  box.innerHTML = list.slice(0, 8).map((r) =>
    '<div class="report-item"><div>' + escapeHtml(r.text) + '</div>' +
    '<div class="r-meta">' + escapeHtml(r.at) + ' · ' + escapeHtml(r.status || 'ожидает') + '</div></div>'
  ).join('');
}

async function sendAdminReport() {
  const ta = document.getElementById('reportText');
  const text = (ta?.value || '').trim();
  if (text.length < 5) {
    showNotification('Репорт', 'Опишите причину подробнее', 'warning');
    return;
  }
  const auth = window.electronAPI?.storage?.get('auth');
  const workerId = auth?.user?.id || WorkerState.userId;
  const payload = {
    worker_id: workerId,
    text,
    fields_requested: 'profile_change',
    at: new Date().toISOString()
  };
  let status = 'локально (API нет)';
  try {
    const res = await fetch(API + '/auth/worker/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) status = 'отправлено админу';
    else status = 'локально (HTTP ' + res.status + ')';
  } catch (_) {
    status = 'локально (нет связи)';
  }
  let list = [];
  try { list = JSON.parse(localStorage.getItem(reportStorageKey()) || '[]'); } catch (_) {}
  list.unshift({ text, at: new Date().toLocaleString('ru-RU'), status });
  localStorage.setItem(reportStorageKey(), JSON.stringify(list.slice(0, 20)));
  if (ta) ta.value = '';
  renderReportList();
  showNotification('Репорт', status, status.startsWith('отправлено') ? 'success' : 'warning');
}



function updateOnlineStatusField() {
  const el = document.getElementById('settingsOnlineStatus');
  if (!el) return;
  const cs = document.getElementById('connectionStatus');
  const apiOk = cs && !cs.classList.contains('offline');
  const hasSession = !!(WorkerState.userId || WorkerState.user?.id);
  if (hasSession && apiOk) {
    el.value = 'в сети';
  } else if (hasSession && !apiOk) {
    el.value = 'в приложении · API недоступен';
  } else {
    el.value = 'не в сети';
  }
}


document.addEventListener('DOMContentLoaded', initWorker);


const CHAT_TEMPLATES_WORKER = {
  profile: 'Прошу исправить данные профиля.',
  password: 'Не могу войти / сменить пароль.',
  task: 'Вопрос по назначенной задаче.',
  delay: 'Сообщаю о задержке на участке.',
  other: 'Другой вопрос к администрации.',
};

function fillChatTemplates() {
  const sel = document.getElementById('chatTemplate');
  if (!sel) return;
  const map = CHAT_TEMPLATES_WORKER;
  sel.innerHTML =
    '<option value="">— шаблон —</option>' +
    Object.keys(map).map((k) => '<option value="' + k + '">' + k + '</option>').join('');
  sel.onchange = () => {
    if (map[sel.value]) document.getElementById('chatBody').value = map[sel.value];
  };
}

async function loadChatThreads() {
  const uid = State?.userId || State?.user?.id;
  if (!uid) return;
  const params = new URLSearchParams({ role: 'worker', worker_id: String(uid), limit: '100' });
  if (State.brigadeId != null) params.set('brigade_id', String(State.brigadeId));
  try {
    const r = await fetch(API + '/chat/threads?' + params);
    if (!r.ok) return;
    ChatState.threads = (await r.json()).items || [];
    renderChatThreadList();
    const n = ChatState.threads.reduce((s, t) => s + (t.unread || 0), 0);
    const dot = document.getElementById('notifDot');
    if (dot) {
      dot.style.display = n > 0 ? 'block' : 'none';
      if (n > 0) dot.textContent = n > 99 ? '99+' : String(n);
    }
  } catch (e) {
    console.warn(e);
  }
}

function renderChatThreadList() {
  const box = document.getElementById('chatThreadList');
  if (!box) return;
  const q = (document.getElementById('chatSearch')?.value || '').toLowerCase();
  let list = ChatState.threads;
  if (q) {
    list = list.filter(
      (t) =>
        String(t.subject || '').toLowerCase().includes(q) ||
        String(t.last_preview || '').toLowerCase().includes(q)
    );
  }
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  box.innerHTML = list.length
    ? list
        .map((t) => {
          const active = Number(t.id) === Number(ChatState.activeId) ? ' active' : '';
          const unread = t.unread ? '<span class="unread-pill">' + t.unread + '</span>' : '';
          return (
            '<div class="chat-thread-item' + active + '" data-tid="' + t.id + '">' +
            '<div class="t-title">' + esc(t.subject || t.peer_name || '#' + t.id) + '</div>' +
            '<div class="t-prev">' + esc(t.last_preview || '') + '</div>' +
            '<div class="t-meta"><span>' + esc((t.updated_at || '').slice(0, 16)) + '</span>' +
            unread + '</div></div>'
          );
        })
        .join('')
    : '<p class="muted" style="padding:12px">Нет диалогов</p>';
  box.querySelectorAll('.chat-thread-item').forEach((el) => {
    el.addEventListener('click', () => openChatThread(el.getAttribute('data-tid')));
  });
}

async function openChatThread(tid) {
  ChatState.activeId = Number(tid);
  renderChatThreadList();
  const t = ChatState.threads.find((x) => Number(x.id) === Number(tid));
  const setT = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v || '';
  };
  setT('chatPeerName', t?.subject || t?.peer_name || 'Диалог #' + tid);
  setT('chatPeerMeta', t?.peer_type || '');
  await fetch(API + '/chat/threads/' + tid + '/read?role=worker', { method: 'POST' });
  const r = await fetch(API + '/chat/threads/' + tid + '/messages');
  const d = r.ok ? await r.json() : { items: [] };
  const box = document.getElementById('chatMessages');
  if (!box) return;
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  box.innerHTML = (d.items || [])
    .map((m) => {
      const isMe = m.sender_role !== 'admin';
      return (
        '<div class="chat-bubble ' + (isMe ? 'me' : 'them') + '">' +
        esc(m.body) +
        '<div class="b-meta">' +
        esc(m.sender_name || m.sender_role) +
        ' · ' +
        esc((m.created_at || '').slice(0, 16)) +
        '</div></div>'
      );
    })
    .join('');
  box.scrollTop = box.scrollHeight;
  loadChatThreads();
}

async function sendChatMessage() {
  const body = (document.getElementById('chatBody')?.value || '').trim();
  if (!body) return;
  const template_key = document.getElementById('chatTemplate')?.value || null;
  const uid = State?.userId || State?.user?.id;
  const name = State?.user?.name;
  try {
    if (!ChatState.activeId) {
      const r = await fetch(API + '/chat/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peer_type: 'worker',
          peer_id: uid,
          peer_name: name,
          brigade_id: State.brigadeId,
          subject: body.slice(0, 80),
          body,
          sender_role: 'worker',
          sender_id: uid,
          sender_name: name,
          template_key,
        }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      document.getElementById('chatBody').value = '';
      await loadChatThreads();
      openChatThread(d.thread_id);
      return;
    }
    const r = await fetch(API + '/chat/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread_id: ChatState.activeId,
        body,
        sender_role: 'worker',
        sender_id: uid,
        sender_name: name,
        template_key,
      }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    document.getElementById('chatBody').value = '';
    openChatThread(ChatState.activeId);
  } catch (e) {
    console.error(e);
    alert('Чат: ' + (e.message || e));
  }
}