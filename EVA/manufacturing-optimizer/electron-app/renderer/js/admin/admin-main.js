/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - АДМИН ПАНЕЛЬ (ПОЛНЫЙ ФУНКЦИОНАЛ)
 * ================================================================
 */

// ================================================================
// СОСТОЯНИЕ
// ================================================================

const AdminState = {
    operations: [],
    brigades: [],
    workers: [],
    criticalPath: [],
    aiCriticalPath: [],      // путь из /ai/build-plan
    aiAdvantagePath: [],     // выгодный путь
    currentTab: 'dashboard',
    selectedOperation: null,
    draggedWorkerId: null
};

const PeerPicker = {
  items: [],      // { key, type, id, name, meta }
  filter: 'all',
  selected: null, // key
};

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function peerEsc(s) {
  return escapeHtml(s);
}
function renderPeerList() {
  const box = document.getElementById('chatPeerList');
  if (!box) return;

  const q = (document.getElementById('chatPeerSearch')?.value || '').toLowerCase().trim();
  let list = (PeerPicker.items || []).slice();
  if (PeerPicker.filter && PeerPicker.filter !== 'all') {
    list = list.filter((x) => x.type === PeerPicker.filter);
  }
  if (q) {
    list = list.filter(
      (x) =>
        String(x.name).toLowerCase().includes(q) ||
        String(x.meta || '').toLowerCase().includes(q) ||
        String(x.id).includes(q)
    );
  }

  box.innerHTML = list.length
    ? list
        .map((x) => {
          const sel = PeerPicker.selected === x.key ? ' selected' : '';
          return (
            '<div class="peer-item' +
            sel +
            '" data-key="' +
            peerEsc(x.key) +
            '">' +
            '<span class="p-name">' +
            peerEsc(x.name) +
            '</span>' +
            '<span class="p-meta">' +
            peerEsc(x.meta || '') +
            '</span></div>'
          );
        })
        .join('')
    : '<p class="muted" style="padding:8px">Никого не найдено</p>';

  box.querySelectorAll('.peer-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = el.getAttribute('data-key');
      PeerPicker.selected = key;

      const val = document.getElementById('chatPeerValue');
      if (val) val.value = key;

      const item = (PeerPicker.items || []).find((i) => i.key === key);
      const lab = document.getElementById('chatPeerSelectedLabel');
      if (lab) lab.textContent = item ? 'Выбран: ' + item.name : 'Выбран: ' + key;

      // только подсветка, без полного перерисовывания списка
      box.querySelectorAll('.peer-item').forEach((n) => n.classList.remove('selected'));
      el.classList.add('selected');
    });
  });
}
window.__BOOTSTRAP__ = null;

function applyBootstrapCache(cache) {
  if (!cache || !cache.ready) return false;
  window.__BOOTSTRAP__ = cache;

  const ops = (cache.operations || [])
    .slice()
    .sort((a, b) => (a.id || 0) - (b.id || 0));

  allOperationsCache = ops;
  window.allOperationsCache = ops;
  filteredOperationsCache = [...ops];
  window.filteredOperationsCache = filteredOperationsCache;
  totalOperations = ops.length;

  AdminState.operations = ops;
  AdminState.brigades = cache.brigades || [];
  AdminState.workers = cache.workers || [];

  console.log('[bootstrap] applied', {
    ops: ops.length,
    brigades: AdminState.brigades.length,
    workers: AdminState.workers.length,
    at: cache.loadedAt,
  });
  return ops.length > 0 || AdminState.brigades.length > 0;
}

async function tryLoadFromBootstrap() {
  try {
    if (!window.electronAPI?.bootstrap?.wait) return false;
    const cache = await window.electronAPI.bootstrap.wait();
    return applyBootstrapCache(cache);
  } catch (e) {
    console.warn('[bootstrap] wait failed', e);
    return false;
  }
}

/**
 * Отрисовка UI из кэша bootstrap (без повторного GET /operations).
 */
async function hydrateUiFromBootstrapCache() {
  showLoading('Подготовка интерфейса...');
  try {
    if (typeof loadOperationsPageFromCache === 'function') {
      loadOperationsPageFromCache(1);
    }

    let stats = null;
    try {
      stats = await api.getStatistics();
    } catch (_) {
      const ops = allOperationsCache || [];
      stats = {
        total_operations: ops.length,
        completed: ops.filter((o) => o.status === 'completed').length,
        in_progress: ops.filter((o) => o.status === 'in_progress').length,
        pending: ops.filter((o) => o.status === 'pending').length,
      };
    }
    if (typeof updateStats === 'function') updateStats(stats);

    if (typeof updateDashboardCards === 'function') {
      updateDashboardCards(allOperationsCache, AdminState.brigades || []);
    }

    try {
      const cpm = await api.calculateCPM();
      AdminState.criticalPath = cpm.critical_path || cpm.critical_path_ids || [];
      restoreAIPaths();
      const cpShow = AdminState.aiCriticalPath?.length
        ? AdminState.aiCriticalPath
        : AdminState.criticalPath;
      if (typeof updateCriticalPathUI === 'function') {
        updateCriticalPathUI({
          critical_path: cpShow,
          project_duration: cpm.project_duration || cpm.project_duration_days,
          critical_path_length: Array.isArray(cpShow) ? cpShow.length : 0,
        });
      }
    } catch (e) {
      console.warn('CPM after bootstrap', e);
      if (typeof updateCriticalPathUI === 'function') {
        updateCriticalPathUI({
          critical_path: AdminState.aiCriticalPath || [],
          project_duration: 0,
          critical_path_length: (AdminState.aiCriticalPath || []).length,
        });
      }
    }

    if (typeof populateWorkerBrigadeFilter === 'function') populateWorkerBrigadeFilter();
    if (typeof updateWorkersCache === 'function') updateWorkersCache();
    if (typeof populateFilters === 'function') populateFilters();
    if (typeof renderAll === 'function') renderAll();
    if (typeof renderCharts === 'function') renderCharts();
    try {
      if (typeof loadAIRecommendations === 'function') await loadAIRecommendations();
    } catch (e) {
      console.warn('AI recs after bootstrap', e);
    }
  } finally {
    hideLoading();
  }
}

function persistAIPaths() {
    try {
      localStorage.setItem('aiCriticalPath', JSON.stringify(AdminState.aiCriticalPath || []));
      localStorage.setItem('aiAdvantagePath', JSON.stringify(AdminState.aiAdvantagePath || []));
    } catch (_) {}
  }
  
  function restoreAIPaths() {
    try {
      const cp = JSON.parse(localStorage.getItem('aiCriticalPath') || '[]');
      const ap = JSON.parse(localStorage.getItem('aiAdvantagePath') || '[]');
      if (Array.isArray(cp) && cp.length) AdminState.aiCriticalPath = cp;
      if (Array.isArray(ap) && ap.length) AdminState.aiAdvantagePath = ap;
    } catch (_) {}
  }

  function persistAiPanelSnapshot() {
    try {
      const p = window.aiPanel;
      if (!p) return;
      const snap = {
        lastGaps: p.lastGaps,
        lastBridge: p.lastBridge,
        lastPlan: p.lastPlan,
        lastBottlenecks: p.lastBottlenecks,
        lastExplanation: p.lastExplanation,
        recommendations: p._lastRecommendations || null,
        summary: p._lastSummary || null,
        savedAt: Date.now()
      };
      localStorage.setItem('aiPanelSnapshot', JSON.stringify(snap));
    } catch (_) {}
  }
  
  function restoreAiPanelSnapshot() {
    try {
      const raw = localStorage.getItem('aiPanelSnapshot');
      if (!raw || !window.aiPanel) return;
      const s = JSON.parse(raw);
      const p = window.aiPanel;
      if (s.lastGaps) p.lastGaps = s.lastGaps;
      if (s.lastBridge) p.lastBridge = s.lastBridge;
      if (s.lastPlan) p.lastPlan = s.lastPlan;
      if (s.lastBottlenecks) p.lastBottlenecks = s.lastBottlenecks;
      if (s.lastExplanation) p.lastExplanation = s.lastExplanation;
      if (s.summary) p._lastSummary = s.summary;
      if (s.recommendations) p._lastRecommendations = s.recommendations;
  
      // отрисовать, если есть DOM
      if (s.summary) p.renderPlanSummary?.('aiPlanSummary', s.summary);
      if (s.recommendations) p.renderRecommendations?.('aiRecommendations', s.recommendations);
      if (s.lastGaps || s.lastBridge) p.renderGaps?.('aiGapsPanel', s.lastGaps, s.lastBridge);
      if (s.lastBottlenecks) p.renderBottleneckAnalysis?.('aiBottleneckList', s.lastBottlenecks);
      if (s.lastExplanation) p.renderFeatureImportance?.('aiExplainPanel', s.lastExplanation);
    } catch (e) {
      console.warn('restoreAiPanelSnapshot', e);
    }
  }
  
  window.persistAiPanelSnapshot = persistAiPanelSnapshot;
  window.restoreAiPanelSnapshot = restoreAiPanelSnapshot;
// ================================================================
// API КЛИЕНТ
// ================================================================

const API_BASE = 'http://127.0.0.1:8000';


const api = {
    async request(method, endpoint, data = null, isFormData = false) {
        const options = { method };
        if (!isFormData && data) {
            options.headers = { 'Content-Type': 'application/json' };
            options.body = JSON.stringify(data);
        } else if (isFormData && data) {
            options.body = data;
        }

        const response = await fetch(`${API_BASE}${endpoint}`, options);
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `HTTP ${response.status}`);
        }
        return response.json();
    },

    get: (url) => api.request('GET', url),
    post: (url, data) => api.request('POST', url, data),
    put: (url, data) => api.request('PUT', url, data),
    delete: (url) => api.request('DELETE', url),

    // Operations
    getOperations: () => api.get('/operations'),
    createOperation: (data) => api.post('/operations', data),
    updateOperation: (id, data) => api.put(`/operations/${id}`, data),
    deleteOperation: (id) => api.delete(`/operations/${id}`),

    // Brigades
    getBrigades: () => api.get('/brigades'),
    createBrigade: (data) => api.post('/brigades', data),
    updateBrigade: (id, data) => api.put(`/brigades/${id}`, data),
    deleteBrigade: (id) => api.delete(`/brigades/${id}`),

    // groop brigades
    getBrigadeGroups: () => api.get('/brigade-groups'),
    createBrigadeGroup: (data) => api.post('/brigade-groups', data),
    updateBrigadeGroup: (id, data) => api.put(`/brigade-groups/${id}`, data),
    deleteBrigadeGroup: (id) => api.delete(`/brigade-groups/${id}`),

     // Бригады в группе
     getGroupBrigades: (groupId) => api.get(`/brigade-groups/${groupId}/brigades`),
     addBrigadeToGroup: (groupId, brigadeId) => api.post(`/brigade-groups/${groupId}/add-brigade?brigade_id=${brigadeId}`, {}),
     removeBrigadeFromGroup: (groupId, brigadeId) => api.post(`/brigade-groups/${groupId}/remove-brigade?brigade_id=${brigadeId}`, {}),

    // Workers
    getWorkers: () => api.get('/workers'),
    createWorker: (data) => api.post('/workers', data),
    updateWorker: (id, data) => api.put(`/workers/${id}`, data),
    deleteWorker: (id) => api.delete(`/workers/${id}`),


    // getWorkers: () => api.get('/workers'),
    // createWorker: (data) => api.post('/workers', data),
    // updateWorker: (id, data) => api.put(`/workers/${id}`, data),
    // deleteWorker: (id) => api.delete(`/workers/${id}`),
    // transferWorker: (workerId, newBrigadeId) => api.post('/workers/transfer', { worker_id: workerId, new_brigade_id: newBrigadeId }),
    // assignBrigadier: (workerId, brigadeId) => api.post('/workers/assign-brigadier', { worker_id: workerId, brigade_id: brigadeId }),
    // updateWorkerBrigade: (workerId, brigadeId) => api.put(`/workers/${workerId}/brigade?brigade_id=${brigadeId || ''}`, null),

    // CPM & AI
    calculateCPM: () => api.post('/calculate-cpm', {}),
    optimize: () => api.post('/optimize', {}),
    getStatistics: () => api.get('/statistics'),

    // Import
    importExcel: (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.request('POST', '/import-excel', formData, true);
    }
};

const CHAT_ROLE = 'admin';
const ChatState = { threads: [], activeId: null };
const API_CHAT = (typeof API !== 'undefined' ? API : 'http://127.0.0.1:8000');

const CHAT_TEMPLATES_ADMIN = {
  deadline: 'Напоминание: проверьте сроки операций и обновите статусы.',
  overdue: 'Зафиксирована просрочка. Сообщите причину и план устранения.',
  status: 'Статус работ обновлён. Ознакомьтесь в кабинете.',
  plan: 'Изменён план смены. Сверьте назначения.',
  ack: 'Принято. Ожидайте обновления данных в системе.',
  need_info: 'Уточните: участок, номер операции и что именно неверно.',
};

if (typeof cytoscape !== 'undefined') {
    [
      window.cytoscapeDagre || window.dagre,
      window.cytoscapeElk,
      window.cytoscapeFcose,
      window.cytoscapeCola,
      window.cytoscapeCoseBilkent
    ].forEach((ext) => {
      if (!ext) return;
      try { cytoscape.use(ext); } catch (_) {}
    });
  }

import { AIPanel } from './ai-panel.js';
const aiPanel = new AIPanel();
window.aiPanel = aiPanel;
// ================================================================
// DOM ЭЛЕМЕНТЫ
// ================================================================

const getDOM = () => ({
    navItems: document.querySelectorAll('.nav-item'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    pageTitle: document.getElementById('pageTitle'),
    
    totalOps: document.getElementById('totalOps'),
    completedOps: document.getElementById('completedOps'),
    inProgressOps: document.getElementById('inProgressOps'),
    activeBrigadesCount: document.getElementById('activeBrigadesCount'),
    
    criticalPathLength: document.getElementById('criticalPathLength'),
    criticalPathInfo: document.getElementById('criticalPathInfo'),
    
    // AI Panel elements
    aiPlanSummary: document.getElementById('aiPlanSummary'),
    aiMlRiskPanel: document.getElementById('aiMlRiskPanel'),
    aiAnomalyPanel: document.getElementById('aiAnomalyPanel'),
    aiCriticalPathChart: document.getElementById('aiCriticalPathChart'),
    aiBottleneckList: document.getElementById('aiBottleneckList'),
    aiRecommendations: document.getElementById('aiRecommendations'),
    aiRecommendationsDash: document.getElementById('aiRecommendationsDash'),
    aiModelStatus: document.getElementById('aiModelStatus'),
    aiEngineStatus: document.getElementById('aiEngineStatus'),
    
    cyGraph: document.getElementById('cyGraph'),
    graphLoading: document.getElementById('graphLoading'),
    
    operationsTableBody: document.getElementById('operationsTableBody'),
    addOperationBtn: document.getElementById('addOperationBtn'),
    editOperationBtn: document.getElementById('editOperationBtn'),
    deleteOperationBtn: document.getElementById('deleteOperationBtn'),
    searchOperations: document.getElementById('searchOperations'),
    filterStatus: document.getElementById('filterStatus'),
    filterBrigade: document.getElementById('filterBrigade'),
    
    brigadesGrid: document.getElementById('brigadesGrid'),
    addBrigadeBtn: document.getElementById('addBrigadeBtn'),
    
    workersGrid: document.getElementById('workersGrid'),
    addWorkerBtn: document.getElementById('addWorkerBtn'),
    
    aiRecommendations: document.getElementById('aiRecommendations'),
    runOptimizationBtn: document.getElementById('runOptimizationBtn'),
    
    fileInput: document.getElementById('fileInput'),
    importExcelBtn: document.getElementById('importExcelBtn'),
    
    modalOverlay: document.getElementById('modalOverlay'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingText: document.getElementById('loadingText'),
    notificationsContainer: document.getElementById('notificationsContainer'),
    
    refreshBtn: document.getElementById('refreshBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    
    progressCanvas: document.getElementById('progressCanvas'),
    brigadeLoadCanvas: document.getElementById('brigadeLoadCanvas')
});

// ================================================================
// ИНИЦИАЛИЗАЦИЯ
// ================================================================

// ================================================================
// ГРАФ ПРОЦЕССОВ (ПОЛНАЯ ПЕРЕРАБОТКА)
// ================================================================
let ganttChart = null;

// Глобальная переменная для графа
let cy = null;
let graphElements = [];
let graphFilters = {
    showCompleted: true,
    showCriticalOnly: false,
    showBlocked: true,
    showBrigades: false,   // было true — тормозит
    showGroups: false,
    highlightCritical: true,
    highlightAdvantage: false
};

async function initAdmin() {
  document.getElementById('settingsSaveUiBtn')?.addEventListener('click', saveAdminUiSettings);

document.getElementById('avatarChangeBtn')?.addEventListener('click', () => {
  document.getElementById('avatarFileInput')?.click();
});
document.getElementById('avatarFileInput')?.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    localStorage.setItem('adminAvatarDataUrl', reader.result);
    applyAvatarFromStorageAdmin();
  };
  reader.readAsDataURL(f);
});
document.getElementById('avatarDeleteBtn')?.addEventListener('click', () => {
  localStorage.removeItem('adminAvatarDataUrl');
  const img = document.getElementById('settingsAvatarImg');
  if (img) { img.removeAttribute('src'); img.style.display = 'none'; }
  const letter = document.getElementById('settingsAvatar');
  if (letter) letter.style.display = '';
});

document.getElementById('admChangePassBtn')?.addEventListener('click', async () => {
  const oldP = document.getElementById('admOldPass')?.value || '';
  const newP = document.getElementById('admNewPass')?.value || '';
  const newP2 = document.getElementById('admNewPass2')?.value || '';
  if (newP.length < 4) return alert('Пароль не короче 4 символов');
  if (newP !== newP2) return alert('Пароли не совпадают');
  try {
    const r = await fetch((API_BASE || 'http://127.0.0.1:8000') + '/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_password: oldP, new_password: newP, login: 'admin' }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    alert('Пароль изменён');
    document.getElementById('admOldPass').value = '';
    document.getElementById('admNewPass').value = '';
    document.getElementById('admNewPass2').value = '';
  } catch (e) {
    alert('Не удалось сменить пароль: ' + (e.message || e));
  }
});
  document.getElementById('btnChatDelete')?.addEventListener('click', () => {
    const id = (typeof ChatState !== 'undefined' && ChatState.activeId) || null;
    if (id) deleteChatThread(id);
    else alert('Сначала откройте диалог');
  });
  console.log('[Admin] 🚀 Инициализация...');
  restoreAIPaths();
  setupEventListeners();
  setupFileInput();
  initSidebarBehavior();

  let fromBoot = false;
  try {
    fromBoot = await tryLoadFromBootstrap();
  } catch (e) {
    console.warn('[Admin] bootstrap error', e);
    fromBoot = false;
  }

  try {
    if (fromBoot && (allOperationsCache || []).length > 0) {
      console.log('[Admin] UI from bootstrap cache', allOperationsCache.length);
      await hydrateUiFromBootstrapCache();
      window.electronAPI?.bootstrap?.refresh?.(['operations', 'brigades', 'workers'])
        .then((c) => {
          if (applyBootstrapCache(c) && typeof updateDashboardCards === 'function') {
            updateDashboardCards(allOperationsCache, AdminState.brigades || []);
          }
        })
        .catch(() => {});
    } else {
      console.log('[Admin] bootstrap empty → loadAllData');
      await loadAllData();
    }
  } catch (e) {
    console.error('[Admin] load failed', e);
    showNotification('Ошибка', 'Не удалось загрузить данные: ' + (e.message || e), 'error');
  } finally {
    hideLoading();
  }

  restoreAiPanelSnapshot();
  try {
    await aiPanel.loadFeatureImportance?.();
  } catch (e) {
    console.warn('explain on init', e);
  }

  if (window._chatPollAdmin) clearInterval(window._chatPollAdmin);
window._chatPollAdmin = setInterval(() => {
  if (AdminState.currentTab === 'messages') {
    loadChatThreadsAdmin();
    if (ChatState.activeId) openChatThreadAdmin(ChatState.activeId);
  } else if (typeof loadChatThreadsAdmin === 'function') {
    loadChatThreadsAdmin(); // обновит notifDot
  }
  if (tab === 'settings') fillAdminSettings();
}, 8000);


  console.log('[Admin] ✅ Готово!');
  showNotification('Добро пожаловать!', 'Админ-панель загружена', 'success');
}


async function loadChatPeerOptionsAdmin() {
  setupPeerPicker();
  const API = (typeof API_CHAT !== 'undefined' && API_CHAT) || (typeof API_BASE !== 'undefined' && API_BASE) || 'http://127.0.0.1:8000';
  const items = [];

  items.push({
    key: 'admin:0',
    type: 'admin',
    id: 0,
    name: 'Администратор системы',
    meta: 'роль: admin',
  });

  let list = [];
  try {
    const r = await fetch(API + '/workers');
    if (r.ok) {
      const data = await r.json();
      list = Array.isArray(data) ? data : (data.items || data.workers || []);
    }
  } catch (e) {
    console.warn('[chat peers] /workers', e);
  }

  if (!list.length && Array.isArray(AdminState.workers) && AdminState.workers.length) {
    list = AdminState.workers;
  }

  list.forEach((w) => {
    const isBr = !!(w.is_brigadier || w.role === 'brigadier');
    items.push({
      key: 'worker:' + w.id,
      type: isBr ? 'brigadier' : 'worker',
      id: w.id,
      name: w.name || ('#' + w.id),
      meta:
        (isBr ? 'бригадир' : 'сотрудник') +
        (w.brigade_id != null ? ' · бр.' + w.brigade_id : '') +
        (w.login ? ' · ' + w.login : ''),
    });
  });

  try {
    const rb = await fetch(API + '/brigades');
    if (rb.ok) {
      const bd = await rb.json();
      const bl = Array.isArray(bd) ? bd : (bd.items || []);
      bl.forEach((b) => {
        items.push({
          key: 'brigade:' + b.id,
          type: 'brigade',
          id: b.id,
          name: b.name || ('Бригада ' + b.id),
          meta: 'бригада #' + b.id,
        });
      });
    }
  } catch (_) {}

  if (typeof PeerPicker === 'undefined') {
    window.PeerPicker = { items: [], filter: 'all', selected: null };
  }
  PeerPicker.items = items;
  PeerPicker.selected = null;
  const hv = document.getElementById('chatPeerValue');
  if (hv) hv.value = '';
  console.log('[chat peers] admin count=', items.length);
  renderPeerList();
}
// function setupEventListeners() {
//     const DOM = getDOM();
    
//     DOM.navItems?.forEach(item => {
//         item.addEventListener('click', (e) => {
//             e.preventDefault();
//             const tab = item.dataset.tab;
//             if (tab) switchTab(tab);
//         });
//     });
    
//     DOM.refreshBtn?.addEventListener('click', loadAllData);
//     DOM.logoutBtn?.addEventListener('click', logout);
//     DOM.runOptimizationBtn?.addEventListener('click', runOptimization);
//     DOM.importExcelBtn?.addEventListener('click', () => getDOM().fileInput?.click());
    
//     DOM.addOperationBtn?.addEventListener('click', () => openOperationModal());
//     DOM.editOperationBtn?.addEventListener('click', editSelectedOperation);
//     DOM.deleteOperationBtn?.addEventListener('click', deleteSelectedOperation);
//     DOM.searchOperations?.addEventListener('input', filterOperations);
//     DOM.filterStatus?.addEventListener('change', filterOperations);
//     DOM.filterBrigade?.addEventListener('change', filterOperations);
    
//     DOM.addBrigadeBtn?.addEventListener('click', () => openBrigadeModal());
//     DOM.addWorkerBtn?.addEventListener('click', () => openWorkerModal());
    
//     DOM.modalOverlay?.addEventListener('click', closeAllModals);
//     document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllModals(); });
// }
function setupEventListeners() {
  // Навигация
  document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
          e.preventDefault();
          const tab = item.dataset.tab;
          if (tab) switchTab(tab);
      });
  });

  // Закрытие модалок по Escape
  document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
          closeAllModals();
      }
  });

  // Поиск и сортировка бригад
  const brigadeSearch = document.getElementById('brigadeSearch');
  const brigadeSort = document.getElementById('brigadeSort');
  
  if (brigadeSearch) {
      brigadeSearch.addEventListener('input', filterAndRenderBrigades);
  }
  if (brigadeSort) {
      brigadeSort.addEventListener('change', filterAndRenderBrigades);
  }

  // Закрытие по клику на оверлей
  const overlay = document.getElementById('modalOverlay');
  if (overlay) {
      overlay.addEventListener('click', closeAllModals);
  }

  // Поиск и фильтрация рабочих
  const workerSearch = document.getElementById('workerSearch');
  const workerBrigadeFilter = document.getElementById('workerBrigadeFilter');
  const workerStatusFilter = document.getElementById('workerStatusFilter');
  const workerSort = document.getElementById('workerSort');
  
  if (workerSearch) workerSearch.addEventListener('input', filterAndRenderWorkers);
  if (workerBrigadeFilter) workerBrigadeFilter.addEventListener('change', filterAndRenderWorkers);
  if (workerStatusFilter) workerStatusFilter.addEventListener('change', filterAndRenderWorkers);
  if (workerSort) workerSort.addEventListener('change', filterAndRenderWorkers);
  
  // Основные кнопки
  document.getElementById('refreshBtn')?.addEventListener('click', () => {
      currentPage = 1;
      loadAllData();
  });
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  document.getElementById('runOptimizationBtn')?.addEventListener('click', runOptimization);
  document.getElementById('runAIOptimizationBtn')?.addEventListener('click', runOptimization);
  document.getElementById('trainModelBtn')?.addEventListener('click', trainAIModel);
  document.getElementById('importExcelBtn')?.addEventListener('click', () => {
  document.getElementById('fileInput')?.click();
  });
  
  // Операции
  document.getElementById('addOperationBtn')?.addEventListener('click', () => openOperationModal());
  document.getElementById('editOperationBtn')?.addEventListener('click', editSelectedOperation);
  document.getElementById('deleteOperationBtn')?.addEventListener('click', deleteSelectedOperation);
  
  // Фильтры операций
  document.getElementById('searchOperations')?.addEventListener('input', filterOperations);
  document.getElementById('filterStatus')?.addEventListener('change', filterOperations);
  document.getElementById('filterBrigade')?.addEventListener('change', filterOperations);
  
  // Сброс фильтров
  document.getElementById('resetFiltersBtn')?.addEventListener('click', resetFilters);
  
  // Пагинация
  document.getElementById('prevPage')?.addEventListener('click', prevPage);
  document.getElementById('nextPage')?.addEventListener('click', nextPage);
  
  // Бригады
  document.getElementById('addBrigadeBtn')?.addEventListener('click', () => openBrigadeModal());
  
  // Рабочие
  document.getElementById('addWorkerBtn')?.addEventListener('click', () => openWorkerModal());
  
  // Файл
  document.getElementById('fileInput')?.addEventListener('change', handleFileImport);
  
  // Модалки
  document.getElementById('modalOverlay')?.addEventListener('click', closeAllModals);

  document.getElementById('toggleCriticalPath')?.addEventListener('change', (e) => {
    graphFilters.highlightCritical = e.target.checked;
    if (!cy) return;
    if (e.target.checked) {
        markCriticalPathContinuous(
          AdminState.aiCriticalPath.length
            ? AdminState.aiCriticalPath
            : (AdminState.criticalPath || [])
        );
      } else {
        cy.edges('.critical').removeClass('critical');
        cy.nodes('.critical').removeClass('critical');
        cy.edges('.path-virtual.critical').remove();
      }
  });
  document.getElementById('toggleAdvantagePath')?.addEventListener('change', (e) => {
    graphFilters.highlightAdvantage = e.target.checked;
    highlightAdvantagePath(e.target.checked);
  });

}



function addFilterInfoToUI() {
  const toolbarRight = document.querySelector('.toolbar-right');
  if (toolbarRight) {
      // Проверяем, есть ли уже элемент
      let filterInfo = document.getElementById('filterInfo');
      if (!filterInfo) {
          filterInfo = document.createElement('span');
          filterInfo.id = 'filterInfo';
          filterInfo.style.marginLeft = '12px';
          filterInfo.style.fontSize = '13px';
          filterInfo.style.color = '#64748b';
          toolbarRight.appendChild(filterInfo);
      }
      updateFilterInfo();
  }
}


document.addEventListener('DOMContentLoaded', () => {
  // Добавляем кнопку сброса фильтров в тулбар, если её нет
  const toolbarLeft = document.querySelector('.toolbar-left');
  if (toolbarLeft && !document.getElementById('resetFiltersBtn')) {
      const resetBtn = document.createElement('button');
      resetBtn.id = 'resetFiltersBtn';
      resetBtn.className = 'btn btn-outline btn-sm';
      resetBtn.title = 'Сбросить фильтры';
      resetBtn.innerHTML = `
          <svg viewBox="0 0 20 20" fill="currentColor" width="16">
              <path d="M3 5h14M5 5l2-2h6l2 2M7 10v5M13 10v5" stroke="currentColor" stroke-width="1.5" fill="none"/>
          </svg>
          Сбросить
      `;
      toolbarLeft.appendChild(resetBtn);
      resetBtn.addEventListener('click', resetFilters);
  }
  
  addFilterInfoToUI();
});

function setupFileInput() {
    const DOM = getDOM();
    if (!DOM.fileInput) {
        const input = document.createElement('input');
        input.type = 'file';
        input.id = 'fileInput';
        input.accept = '.xlsx,.xls,.xlsb,.csv';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', handleFileImport);
    } else {
        DOM.fileInput.addEventListener('change', handleFileImport);
    }
}

// ================================================================
// ЗАГРУЗКА ДАННЫХ
// ================================================================

// async function loadAllData() {
//     // showLoading('Загрузка данных...');
    
//     // try {
//     //     const [ops, brigs, works, stats] = await Promise.all([
//     //         api.getOperations(),
//     //         api.getBrigades(),
//     //         api.getWorkers(),
//     //         api.getStatistics()
//     //     ]);
        
//     //     AdminState.operations = ops || [];
//     //     AdminState.brigades = brigs || [];
//     //     AdminState.workers = works || [];

//     showLoading('Загрузка данных...');
    
//     try {
//         // Загружаем первую страницу операций
//         await loadOperationsPage(1);
        
//         // Бригады и рабочие - все
//         const [brigs, works, stats] = await Promise.all([
//             api.getBrigades(),
//             api.getWorkers(),
//             api.getStatistics()
//         ]);
        
//         AdminState.brigades = brigs || [];
//         AdminState.workers = works || [];

//                 // ПЕРЕСЧИТЫВАЕМ ЗАГРУЗКУ ДЛЯ ВСЕХ БРИГАД
//         for (const brigade of AdminState.brigades) {
//             await api.post(`/brigades/${brigade.id}/recalculate-load`, {});
//         }
        
//                 // Обновляем данные бригад после пересчёта
//         const refreshedBrigades = await api.get('/brigades');
//         AdminState.brigades = refreshedBrigades || [];
        
//         console.log(`📊 Загружено: ${AdminState.operations.length} оп, ${AdminState.brigades.length} бригад, ${AdminState.workers.length} рабочих`);
        
//         updateStats(stats);
        
//         const cpm = await api.calculateCPM();
//         AdminState.criticalPath = cpm.critical_path || [];
//         updateCriticalPathUI(cpm);

//         populateWorkerBrigadeFilter();
//         updateWorkersCache();
        
//         populateFilters();
//         renderAll();
//         renderCharts();
//         await loadAIRecommendations();
        
//     } catch (error) {
//         console.error('❌ Ошибка загрузки:', error);
//         showNotification('Ошибка', 'Не удалось загрузить данные', 'error');
//     } finally {
//         hideLoading();
//     }
// }
async function loadAllData() {
  showLoading('Загрузка данных...');

  try {
    // 1) Операции
    const allOpsRaw = await api.getOperations();
    const allOps = Array.isArray(allOpsRaw)
      ? allOpsRaw
      : allOpsRaw?.items || allOpsRaw?.operations || [];

    allOperationsCache = allOps.slice().sort((a, b) => (a.id || 0) - (b.id || 0));
    window.allOperationsCache = allOperationsCache;
    filteredOperationsCache = [...allOperationsCache];
    window.filteredOperationsCache = filteredOperationsCache;
    totalOperations = filteredOperationsCache.length;
    AdminState.operations = allOperationsCache;

    if (typeof loadOperationsPageFromCache === 'function') {
      loadOperationsPageFromCache(1);
    }

    // 2) Бригады, рабочие, статистика — параллельно
    const [brigsRaw, worksRaw, stats] = await Promise.all([
      api.getBrigades(),
      api.getWorkers(),
      api.getStatistics().catch(() => null),
    ]);

    const brigs = Array.isArray(brigsRaw) ? brigsRaw : brigsRaw?.items || [];
    const works = Array.isArray(worksRaw) ? worksRaw : worksRaw?.items || [];
    AdminState.brigades = brigs;
    AdminState.workers = works;

    // 3) СРАЗУ обновить дашборд (не ждать recalculate / CPM)
    if (typeof updateDashboardCards === 'function') {
      updateDashboardCards(allOperationsCache, AdminState.brigades);
    }
    if (typeof updateStats === 'function') {
      updateStats(
        stats || {
          total_operations: allOperationsCache.length,
          completed: allOperationsCache.filter((o) => o.status === 'completed').length,
          in_progress: allOperationsCache.filter((o) => o.status === 'in_progress').length,
          pending: allOperationsCache.filter((o) => o.status === 'pending').length,
          active_brigades: AdminState.brigades.length,
        }
      );
    }

    if (typeof populateWorkerBrigadeFilter === 'function') populateWorkerBrigadeFilter();
    if (typeof updateWorkersCache === 'function') updateWorkersCache();
    if (typeof populateFilters === 'function') populateFilters();
    if (typeof renderAll === 'function') renderAll();
    if (typeof renderCharts === 'function') renderCharts();

    console.log(
      '[Admin] Загружено:',
      allOperationsCache.length,
      'оп,',
      AdminState.brigades.length,
      'бригад,',
      AdminState.workers.length,
      'рабочих'
    );

    // 4) CPM и AI — в фоне, не блокируют UI
    Promise.resolve()
      .then(async () => {
        try {
          const cpm = await api.calculateCPM();
          AdminState.criticalPath = cpm.critical_path || cpm.critical_path_ids || [];
          if (typeof restoreAIPaths === 'function') restoreAIPaths();
          const cpShow = AdminState.aiCriticalPath?.length
            ? AdminState.aiCriticalPath
            : AdminState.criticalPath;
          if (typeof updateCriticalPathUI === 'function') {
            updateCriticalPathUI({
              critical_path: cpShow,
              project_duration: cpm.project_duration || cpm.project_duration_days,
              critical_path_length: Array.isArray(cpShow) ? cpShow.length : 0,
            });
          }
        } catch (e) {
          console.warn('CPM:', e);
        }
        try {
          if (typeof loadAIRecommendations === 'function') await loadAIRecommendations();
        } catch (e) {
          console.warn('AI recs:', e);
        }
      });

    // 5) Пересчёт загрузки бригад — ТОЛЬКО в фоне, пачками (не блокирует дашборд)
    Promise.resolve().then(async () => {
      const list = AdminState.brigades || [];
      const CHUNK = 10;
      for (let i = 0; i < list.length; i += CHUNK) {
        const slice = list.slice(i, i + CHUNK);
        await Promise.allSettled(
          slice.map((b) =>
            api.post(`/brigades/${b.id}/recalculate-load`, {}).catch(() => null)
          )
        );
      }
      try {
        const refreshed = await api.getBrigades();
        AdminState.brigades = Array.isArray(refreshed) ? refreshed : refreshed?.items || list;
        if (typeof updateDashboardCards === 'function') {
          updateDashboardCards(allOperationsCache, AdminState.brigades);
        }
      } catch (_) {}
    });
  } catch (error) {
    console.error('❌ Ошибка загрузки:', error);
    if (typeof showNotification === 'function') {
      showNotification('Ошибка', 'Не удалось загрузить данные: ' + (error.message || error), 'error');
    }
  } finally {
    hideLoading();
  }
}

/**
 * После создания / правки / удаления операции:
 * свежий кэш → дашборд → графики → CPM → граф/гантт.
 * AI-снимок сбрасываем — иначе «старые» рекомендации.
 */
async function refreshAfterOperationsChange(options = {}) {
    const {
      invalidateAI = true,
      rerenderGraph = true,
      autoOptimize = false
    } = options;
  
    try {
      showLoading('Обновление данных...');
  
      // 1) операции
      const allOps = await api.getOperations();
      allOperationsCache = (allOps || []).sort((a, b) => a.id - b.id);
      window.allOperationsCache = allOperationsCache;
      AdminState.operations = allOperationsCache;
  
      // 2) фильтры таблицы
      if (typeof applyFilters === 'function') applyFilters();
      else {
        filteredOperationsCache = [...allOperationsCache];
        if (typeof loadOperationsPageFromCache === 'function') {
          loadOperationsPageFromCache(currentPage || 1);
        }
      }
  
      // 3) бригады
      try {
        for (const b of AdminState.brigades || []) {
          if (b?.id) await api.post(`/brigades/${b.id}/recalculate-load`, {});
        }
        AdminState.brigades = (await api.getBrigades()) || [];
      } catch (e) {
        console.warn('brigade load refresh', e);
      }
  
      // 4) дашборд
      if (typeof updateDashboardCards === 'function') {
        updateDashboardCards(allOperationsCache, AdminState.brigades || []);
      }
      if (typeof updateStats === 'function') {
        try {
          updateStats(await api.getStatistics());
        } catch (_) {
          updateStats({
            total: allOperationsCache.length,
            completed: allOperationsCache.filter((o) => o.status === 'completed').length,
            in_progress: allOperationsCache.filter((o) => o.status === 'in_progress').length
          });
        }
      }
      if (typeof renderCharts === 'function') renderCharts();
  
      // 5) CPM (один раз, после свежих ops)
      try {
        const cpm = await api.calculateCPM();
        const raw = cpm.critical_path || cpm.criticalPath || [];
        AdminState.criticalPath = raw
          .map((id) => Number(String(id).replace(/^T/i, '')))
          .filter((n) => !Number.isNaN(n));
  
        const cpShow = AdminState.aiCriticalPath?.length
          ? AdminState.aiCriticalPath
          : AdminState.criticalPath;
  
        if (typeof updateCriticalPathUI === 'function') {
          updateCriticalPathUI({
            critical_path: cpShow,
            project_duration: cpm.project_duration,
            critical_path_length: cpShow.length
          });
        }
        if (typeof renderDashboardAlerts === 'function' && typeof collectDashboardAlerts === 'function') {
          renderDashboardAlerts(
            collectDashboardAlerts(allOperationsCache, AdminState.brigades || [], cpShow)
          );
        }
      } catch (e) {
        console.warn('CPM refresh', e);
      }
  
      // 6) AI: сбросить UI-снимок (пути не трогаем)
      if (invalidateAI) {
        try {
          localStorage.removeItem('aiPanelSnapshot');
          if (window.aiPanel) {
            window.aiPanel.lastGaps = null;
            window.aiPanel.lastBridge = null;
            window.aiPanel.lastPlan = null;
            window.aiPanel._lastRecommendations = null;
            window.aiPanel._lastSummary = null;
          }
        } catch (e) {
          console.warn('invalidate AI', e);
        }
      }

          // 7) autoOptimize — полный admin runOptimization (пути + сводка + gaps)
    if (autoOptimize) {
        try {
          if (typeof runOptimization === 'function') {
            await runOptimization();
          } else if (window.aiPanel?.runOptimization) {
            await window.aiPanel.runOptimization(
              allOperationsCache,
              AdminState.brigades || []
            );
            persistAiPanelSnapshot?.();
            persistAIPaths?.();
          }
        } catch (e) {
          console.warn('autoOptimize', e);
        }
      }
  
       
      // 8) граф / гантт после данных и AI
      if (rerenderGraph) {
        if (typeof renderGraph === 'function') renderGraph();
        if (typeof renderGantt === 'function') renderGantt();
      }
  
      // 9) подсветка после layout
      setTimeout(() => {
        if (!window.cy) return;
        const cp = (
          AdminState.aiCriticalPath?.length
            ? AdminState.aiCriticalPath
            : AdminState.criticalPath || []
        )
          .map((id) => Number(String(id).replace(/^T/i, '')))
          .filter((n) => !Number.isNaN(n));
  
        if (graphFilters.highlightCritical !== false && cp.length && typeof markCriticalPathContinuous === 'function') {
          markCriticalPathContinuous(cp);
        }
        if (
          graphFilters.highlightAdvantage &&
          AdminState.aiAdvantagePath?.length &&
          typeof highlightAdvantagePath === 'function'
        ) {
          highlightAdvantagePath(true);
        }
        console.log('[refresh] cp nodes', cp.length, 'ai', AdminState.aiCriticalPath?.length || 0);
      }, 180);
  
      console.log('[refresh] ops=', allOperationsCache.length);
    } catch (e) {
      console.error('refreshAfterOperationsChange', e);
      showNotification('Ошибка', 'Не удалось обновить связанные экраны', 'error');
    } finally {
      hideLoading();
    }
  }
  
  window.refreshAfterOperationsChange = refreshAfterOperationsChange;
// Новая функция - загрузка страницы из кэша
function loadOperationsPageFromCache(page) {
  currentPage = page;
  
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredOperationsCache.length);
  
  // Берем срез из отфильтрованного кэша
  AdminState.operations = filteredOperationsCache.slice(startIndex, endIndex);
  
  renderOperationsTable();
  updatePagination();
  
  console.log(`📄 Страница ${page}: операции ${startIndex + 1}-${endIndex} из ${filteredOperationsCache.length} (фильтровано)`);
}

function applyFilters() {
  const DOM = getDOM();
  
  // Получаем значения фильтров
  const search = DOM.searchOperations?.value.toLowerCase().trim() || '';
  const status = DOM.filterStatus?.value || '';
  const brigade = DOM.filterBrigade?.value || '';
  
  // Сохраняем текущие фильтры
  currentFilters = { search, status, brigade };
  
  console.log(`🔍 Применяем фильтры:`, currentFilters);
  
  // Начинаем с оригинального кэша
  let filtered = [...allOperationsCache];
  
  // Применяем поиск
  if (search) {
      filtered = filtered.filter(op => 
          (op.name && op.name.toLowerCase().includes(search)) || 
          (op.op_number && op.op_number.toString().includes(search)) ||
          (op.drawing && op.drawing.toLowerCase().includes(search)) ||
          (op.location && op.location.toLowerCase().includes(search))
      );
      console.log(`   После поиска "${search}": ${filtered.length} операций`);
  }
  
  // Применяем фильтр по статусу
  if (status) {
      filtered = filtered.filter(op => op.status === status);
      console.log(`   После фильтра по статусу "${status}": ${filtered.length} операций`);
  }
  
  // Применяем фильтр по бригаде
  if (brigade) {
      filtered = filtered.filter(op => op.brigade_id == brigade);
      console.log(`   После фильтра по бригаде "${brigade}": ${filtered.length} операций`);
  }
  
  // Обновляем отфильтрованный кэш
  filteredOperationsCache = filtered;
  totalOperations = filteredOperationsCache.length;
  
  // Сбрасываем на первую страницу
  currentPage = 1;
  
  // Загружаем первую страницу
  loadOperationsPageFromCache(1);
  
  // Обновляем информацию о количестве
  updateFilterInfo();
}

function updateFilterInfo() {
  const filterInfo = document.getElementById('filterInfo');
  if (filterInfo) {
      const total = allOperationsCache.length;
      const filtered = filteredOperationsCache.length;
      
      if (filtered === total) {
          filterInfo.textContent = `Всего: ${total} операций`;
          filterInfo.style.color = '#64748b';
      } else {
          filterInfo.textContent = `Найдено: ${filtered} из ${total} операций`;
          filterInfo.style.color = '#0961f6';
      }
  }
}


function populateFilters() {
    const DOM = getDOM();
    if (DOM.filterBrigade) {
        DOM.filterBrigade.innerHTML = '<option value="">Все бригады</option>' +
            AdminState.brigades.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    }
}

function renderAll() {
    renderOperationsTable();
    renderBrigadesGrid();
    renderWorkersGrid();
    if (AdminState.currentTab === 'graph') renderGraph();
}

// ================================================================
// СТАТИСТИКА И ГРАФИКИ
// ================================================================

function updateStats(stats) {
    // Не перезаписываем карточки, если уже есть полный кэш операций
    if (window.allOperationsCache && window.allOperationsCache.length) {
        updateDashboardCards(window.allOperationsCache, AdminState.brigades || []);
        return;
    }
    const DOM = getDOM();
    if (DOM.totalOps) DOM.totalOps.textContent = stats?.total_operations ?? 0;
    if (DOM.completedOps) DOM.completedOps.textContent = stats?.completed_operations ?? 0;
    if (DOM.inProgressOps) DOM.inProgressOps.textContent = stats?.in_progress_operations ?? 0;
    if (DOM.activeBrigadesCount) DOM.activeBrigadesCount.textContent = stats?.active_brigades ?? 0;
}



function updateCriticalPathUI(cpm) {
    const DOM = getDOM();
    const cp = cpm.critical_path || [];
    
    if (DOM.criticalPathLength) {
        DOM.criticalPathLength.textContent = `${cp.length} оп.`;
    }
    
    if (DOM.criticalPathInfo && cp.length > 0) {
        // Собираем полные данные по операциям критического пути
        const cpOps = cp.map(opNum => {
            const op = allOperationsCache.find(o => o.op_number === opNum);
            return op || { op_number: opNum, name: '—', duration: 0, time_reserve: 0, brigade_id: null };
        });
        
        const totalDuration = cpOps.reduce((sum, op) => sum + (op.duration || 0), 0);
        const totalDays = (totalDuration / 8).toFixed(1);
        const totalReserve = cpOps.reduce((sum, op) => sum + (op.time_reserve || 0), 0);
        
        // Таблица операций критического пути
        const tableRows = cpOps.slice(0, 15).map((op, i) => {
            const brigade = AdminState.brigades.find(b => b.id === op.brigade_id);
            const dur = (op.duration || 0).toFixed(1);
            const res = (op.time_reserve || 0).toFixed(1);
            const isZeroReserve = (op.time_reserve || 0) === 0;
            
            return `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:6px 8px;font-size:12px;color:#64748b;">${i+1}</td>
                    <td style="padding:6px 8px;font-size:12px;font-weight:600;color:#0961f6;">#${op.op_number}</td>
                    <td style="padding:6px 8px;font-size:12px;color:#1e293b;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${op.name || ''}">${op.name || '—'}</td>
                    <td style="padding:6px 8px;font-size:12px;color:#374151;text-align:right;">${dur} ч</td>
                    <td style="padding:6px 8px;font-size:12px;text-align:right;">
                        <span style="color:${isZeroReserve ? '#ef4444' : '#10b981'};font-weight:500;">${res} ч</span>
                    </td>
                    <td style="padding:6px 8px;font-size:11px;color:#64748b;">${brigade?.name || '—'}</td>
                </tr>
            `;
        }).join('');
        
        const moreCount = cpOps.length > 15 ? `<p style="text-align:center;color:#64748b;font-size:12px;margin-top:8px;">... и ещё ${cpOps.length - 15} операций</p>` : '';
        
        DOM.criticalPathInfo.innerHTML = `
            <div style="margin-bottom:12px;">
                <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;">
                    <div style="background:#fef2f2;border-radius:8px;padding:10px 14px;flex:1;min-width:120px;">
                        <div style="font-size:20px;font-weight:700;color:#ef4444;">${totalDuration.toFixed(1)}</div>
                        <div style="font-size:11px;color:#7f1d1d;">часов всего</div>
                    </div>
                    <div style="background:#f0fdf4;border-radius:8px;padding:10px 14px;flex:1;min-width:120px;">
                        <div style="font-size:20px;font-weight:700;color:#22c55e;">${totalDays}</div>
                        <div style="font-size:11px;color:#166534;">раб. дней (при 8ч)</div>
                    </div>
                    <div style="background:#eff6ff;border-radius:8px;padding:10px 14px;flex:1;min-width:120px;">
                        <div style="font-size:20px;font-weight:700;color:#0961f6;">${cpOps.length}</div>
                        <div style="font-size:11px;color:#1e3a5f;">операций в пути</div>
                    </div>
                    <div style="background:#fffbeb;border-radius:8px;padding:10px 14px;flex:1;min-width:120px;">
                        <div style="font-size:20px;font-weight:700;color:#f59e0b;">${totalReserve.toFixed(1)}</div>
                        <div style="font-size:11px;color:#92400e;">ч резерва суммарно</div>
                    </div>
                </div>
                
                <table style="width:100%;border-collapse:collapse;font-family:system-ui,sans-serif;">
                    <thead>
                        <tr style="border-bottom:2px solid #e2e8f0;">
                            <th style="padding:8px;text-align:left;font-size:11px;color:#64748b;font-weight:600;">#</th>
                            <th style="padding:8px;text-align:left;font-size:11px;color:#64748b;font-weight:600;">Операция</th>
                            <th style="padding:8px;text-align:left;font-size:11px;color:#64748b;font-weight:600;">Название</th>
                            <th style="padding:8px;text-align:right;font-size:11px;color:#64748b;font-weight:600;">Длит.</th>
                            <th style="padding:8px;text-align:right;font-size:11px;color:#64748b;font-weight:600;">Резерв</th>
                            <th style="padding:8px;text-align:left;font-size:11px;color:#64748b;font-weight:600;">Бригада</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
                ${moreCount}
            </div>
        `;
    } else if (DOM.criticalPathInfo) {
        DOM.criticalPathInfo.innerHTML = '<p style="color:#6b7280;">Критический путь не определён</p>';
    }
}

function renderCharts() {
    const ops = window.allOperationsCache || AdminState.operations || [];
    const brigades = AdminState.brigades || [];
    updateDashboardCards(ops, brigades);
    renderProgressChart(ops);
    renderBrigadeLoadChart(brigades);
    renderDashboardAlerts(collectDashboardAlerts(ops, brigades, AdminState.criticalPath || []));
}


function renderProgressChart(ops) {
    const canvas = document.getElementById('progressCanvas');
    if (!canvas || typeof Chart === 'undefined') return;

    const list = ops || window.allOperationsCache || [];
    const total = list.length || 1;
    const completed = list.filter(o => o.status === 'completed').length;
    const inProgress = list.filter(o => o.status === 'in_progress').length;
    const blocked = list.filter(o => o.status === 'blocked').length;
    const pending = Math.max(0, list.length - completed - inProgress - blocked);

    const pctDone = ((completed / total) * 100).toFixed(1);
    const elBig = document.getElementById('progressPctBig');
    // if (elBig) elBig.textContent = pctDone + '%';

    const legend = document.getElementById('progressLegend');
    // if (legend) {
    //     const rows = [
    //         { c: '#22c55e', t: 'Завершено', n: completed, key: 'completed' },
    //         { c: '#3b82f6', t: 'В работе', n: inProgress, key: 'in_progress' },
    //         { c: '#94a3b8', t: 'Ожидает', n: pending, key: 'pending' },
    //         { c: '#f59e0b', t: 'Блок', n: blocked, key: 'blocked' }
    //     ];
    //     legend.innerHTML = rows.map(r =>
    //         `<div style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:4px 0;" data-status-filter="${r.key}">
    //             <span style="width:10px;height:10px;border-radius:50%;background:${r.c};flex-shrink:0;"></span>
    //             <span style="flex:1;">${r.t}</span>
    //             <span style="font-weight:600;font-variant-numeric:tabular-nums;">${r.n}</span>
    //             <span style="color:#64748b;min-width:44px;text-align:right;">${((r.n / total) * 100).toFixed(1)}%</span>
    //         </div>`
    //     ).join('');
    //     legend.querySelectorAll('[data-status-filter]').forEach(el => {
    //         el.onclick = () => goToOperationsWithStatus(el.getAttribute('data-status-filter'));
    //     });
    // }

    if (window._progressChart) {
        window._progressChart.destroy();
        window._progressChart = null;
    }

    window._progressChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: ['Завершено', 'В работе', 'Ожидает', 'Блок'],
            datasets: [{
                data: [completed, inProgress, pending, blocked],
                backgroundColor: ['#22c55e', '#3b82f6', '#94a3b8', '#f59e0b'],
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '74%',
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 1100,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label(ctx) {
                            const v = ctx.raw || 0;
                            return `${ctx.label}: ${v} (${((v / total) * 100).toFixed(1)}%)`;
                        }
                    }
                }
            },
            onClick(_e, elements) {
                if (!elements.length) return;
                const map = ['completed', 'in_progress', 'pending', 'blocked'];
                goToOperationsWithStatus(map[elements[0].index]);
            }
        }
    });

    // лёгкий «пульс» процента после отрисовки
    // elBig = document.getElementById('progressPctBig');
    if (elBig) {
        elBig.textContent = pctDone + '%';
        elBig.style.transform = 'scale(0.85)';
        elBig.style.opacity = '0.5';
        requestAnimationFrame(() => {
            elBig.style.transform = 'scale(1)';
            elBig.style.opacity = '1';
        });
    }

    renderStatusMiniBars({ completed, inProgress, pending, blocked, total });
}

function renderStatusMiniBars({ completed, inProgress, pending, blocked, total }) {
    const box = document.getElementById('statusMiniBars');
    if (!box) return;
    const t = total || 1;
    const items = [
        { key: 'completed', label: 'Завершено', n: completed, color: '#22c55e' },
        { key: 'in_progress', label: 'В работе', n: inProgress, color: '#3b82f6' },
        { key: 'pending', label: 'Ожидает', n: pending, color: '#94a3b8' },
        { key: 'blocked', label: 'Блок', n: blocked, color: '#f59e0b' }
    ];
    box.innerHTML = items.map(it => {
        const p = ((it.n / t) * 100).toFixed(1);
        return `
        <div style="cursor:pointer;" onclick="window.goToOperationsWithStatus('${it.key}')" title="Открыть операции">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
                <span style="font-weight:600;color:#1e293b;">${it.label}</span>
                <span style="color:#64748b;font-variant-numeric:tabular-nums;">${it.n} · ${p}%</span>
            </div>
            <div style="height:12px;background:#f1f5f9;border-radius:6px;overflow:hidden;">
                <div style="height:100%;width:${p}%;background:${it.color};border-radius:6px;transition:width .5s ease;"></div>
            </div>
        </div>`;
    }).join('');
}

window.goToOperationsWithStatus = function(status) {
    if (typeof switchTab === 'function') switchTab('operations');
    const sel = document.getElementById('filterStatus');
    if (sel) {
        sel.value = status || '';
        if (typeof filterOperations === 'function') filterOperations();
        else if (typeof applyFilters === 'function') applyFilters();
    }
    showNotification('Фильтр', status ? `Операции: ${status}` : 'Все статусы', 'info');
};

function renderBrigadeLoadChart(brigades) {
    const canvas = document.getElementById('brigadeLoadCanvas');
    if (!canvas || typeof Chart === 'undefined') return;

    const ops = window.allOperationsCache || [];
    const byBrigade = {};
    ops.forEach(op => {
        if (!op.brigade_id) return;
        if (!byBrigade[op.brigade_id]) byBrigade[op.brigade_id] = { total: 0, active: 0 };
        byBrigade[op.brigade_id].total++;
        if (op.status === 'in_progress' || op.status === 'pending') {
            byBrigade[op.brigade_id].active++;
        }
    });

    const top = [...(brigades || [])]
        .map(b => {
            const fromApi = Number(b.current_load);
            let load = (Number.isFinite(fromApi) && fromApi > 0) ? fromApi : 0;
            if (load === 0 && byBrigade[b.id]) {
                const cap = Math.max(1, Number(b.workers_count) || Number(b.max_workers) || 5);
                // грубая оценка: активные операции / ёмкость * 20 (подстрой под завод)
                load = Math.min(100, Math.round((byBrigade[b.id].active / cap) * 40 + byBrigade[b.id].total * 2));
            }
            return {
                name: String(b.name || ('Бр.' + b.id)).slice(0, 22),
                load: Math.min(100, Math.max(0, load)),
                id: b.id
            };
        })
        .filter(t => t.load > 0 || byBrigade[t.id])
        .sort((a, b) => b.load - a.load)
        .slice(0, 12);

    // если всё ещё пусто — покажи топ по числу операций
    if (!top.length) {
        const fallback = Object.entries(byBrigade)
            .map(([id, v]) => {
                const b = (brigades || []).find(x => String(x.id) === String(id));
                return {
                    name: String(b?.name || ('Бр.' + id)).slice(0, 22),
                    load: Math.min(100, v.active * 15 + v.total),
                    id
                };
            })
            .sort((a, b) => b.load - a.load)
            .slice(0, 12);
        top.push(...fallback);
    }

    if (window._brigadeChart) {
        window._brigadeChart.destroy();
        window._brigadeChart = null;
    }

    window._brigadeChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: top.map(t => t.name),
            datasets: [{
                label: 'Загрузка %',
                data: top.map(t => t.load),
                backgroundColor: top.map(t =>
                    t.load >= 90 ? '#ef4444' : t.load >= 70 ? '#f59e0b' : '#3b82f6'
                ),
                borderRadius: 4,
                barThickness: 14
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            animation: { duration: 700, easing: 'easeOutQuart' },
            scales: {
                x: { min: 0, max: 100, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } },
                y: { ticks: { font: { size: 11 } }, grid: { display: false } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `Загрузка: ${ctx.raw}%`
                    }
                }
            }
        }
    });
}



// ================================================================
// ИМПОРТ EXCEL
// ================================================================

async function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    console.log('📁 Importing file:', file.name);
    showLoading('Импорт Excel...');
    
    try {
        const result = await api.importExcel(file);
        console.log('✅ Import result:', result);
        showNotification('✅ Успех', `Импортировано: ${result.imported}, обновлено: ${result.updated}`, 'success');
        event.target.value = '';
        await loadAllData();
        switchTab('operations');
    } catch (error) {
        console.error('❌ Import error:', error);
        showNotification('❌ Ошибка', error.message, 'error');
        event.target.value = '';
    } finally {
        hideLoading();
    }
}

// ================================================================
// ОПЕРАЦИИ
// ================================================================

// ================================================================
// ТАБЛИЦА ОПЕРАЦИЙ (ПОЛНАЯ ВЕРСИЯ)
// ================================================================

// function renderOperationsTable() {
//     const DOM = getDOM();
//     const tbody = DOM.operationsTableBody;
//     if (!tbody) return;
    
//     let ops = [...AdminState.operations];
    
//     // Фильтрация
//     const search = DOM.searchOperations?.value.toLowerCase() || '';
//     const status = DOM.filterStatus?.value || '';
//     const brigade = DOM.filterBrigade?.value || '';
    
//     if (search) {
//         ops = ops.filter(op => 
//             op.name?.toLowerCase().includes(search) || 
//             op.op_number?.toString().includes(search) ||
//             op.drawing?.toLowerCase().includes(search)
//         );
//     }
//     if (status) ops = ops.filter(op => op.status === status);
//     if (brigade) ops = ops.filter(op => op.brigade_id == brigade);
    
//     if (!ops.length) {
//         tbody.innerHTML = `<tr><td colspan="14" style="text-align: center; padding: 40px;">Нет операций</td></tr>`;
//         return;
//     }
    
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);
    
//     const statusText = { 
//         pending: 'Ожидает', 
//         in_progress: 'В работе', 
//         completed: 'Завершено', 
//         blocked: 'Заблокировано' 
//     };
    
//     tbody.innerHTML = ops.map(op => {
//         // Определяем цвет строки по срокам
//         let rowColor = '';
//         let deadlineStatus = '';
        
//         if (op.status !== 'completed' && op.end_date) {
//             const endDate = new Date(op.end_date);
//             endDate.setHours(0, 0, 0, 0);
//             const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
            
//             if (daysLeft < 0) {
//                 rowColor = 'background: #fee2e2;'; // Красный - просрочено
//                 deadlineStatus = '🔴 Просрочено';
//             } else if (daysLeft <= 2) {
//                 rowColor = 'background: #fef3c7;'; // Жёлтый - срочно
//                 deadlineStatus = `🟡 ${daysLeft} дн.`;
//             } else if (daysLeft <= 5) {
//                 rowColor = 'background: #fef9c3;'; // Светло-жёлтый - приближается
//                 deadlineStatus = `🟡 ${daysLeft} дн.`;
//             } else {
//                 rowColor = ''; // Серый/белый - норма
//                 deadlineStatus = `⚪ ${daysLeft} дн.`;
//             }
//         } else if (op.status === 'completed') {
//             rowColor = 'background: #dcfce7;'; // Зелёный - выполнено
//             deadlineStatus = '✅ Выполнено';
//         } else {
//             deadlineStatus = '—';
//         }
        
//         return `
//             <tr data-id="${op.id}" onclick="selectOperation(${op.id})" style="cursor: pointer; ${rowColor}">
//                 <td>${op.id}</td>
//                 <td>${op.post || '—'}</td>
//                 <td><strong>${op.op_number}</strong></td>
//                 <td>${op.prev_ops?.join(', ') || '—'}</td>
//                 <td>${op.next_ops?.join(', ') || '—'}</td>
//                 <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${op.name}">${op.name}</td>
//                 <td>${op.drawing || '—'}</td>
//                 <td>${op.labor_hours || 0} ч</td>
//                 <td>${op.people_count || 1}</td>
//                 <td>${op.duration || 0} ч</td>
//                 <td>${getBrigadeName(op.brigade_id)}</td>
//                 <td>${op.location || '—'}</td>
//                 <td>${op.time_reserve || 0} ч</td>
//                 <td>
//                     <span class="status-badge ${op.status}">${statusText[op.status] || op.status}</span>
//                 </td>
//                 <td style="font-size: 12px;" title="${op.end_date || 'Нет срока'}">
//                     ${deadlineStatus}
//                     ${op.end_date ? `<br><small>${op.end_date}</small>` : ''}
//                 </td>
//                 <td>
//                     <button class="btn-icon" onclick="event.stopPropagation(); editOperation(${op.id})" title="Редактировать">✏️</button>
//                     <button class="btn-icon" onclick="event.stopPropagation(); deleteOperation(${op.id})" title="Удалить">🗑️</button>
//                 </td>
//             </tr>
//         `;
//     }).join('');
// }

function renderOperationsTable() {
  const DOM = getDOM();
  const tbody = DOM.operationsTableBody;
  if (!tbody) return;
  
  const ops = AdminState.operations;
  
  if (!ops || ops.length === 0) {
      // Проверяем, есть ли данные в оригинальном кэше
      const hasData = allOperationsCache.length > 0;
      const hasFilters = currentFilters.search || currentFilters.status || currentFilters.brigade;
      
      let emptyMessage = '';
      let emptyIcon = '';
      
      if (!hasData) {
          emptyMessage = 'Нет операций. Импортируйте данные из Excel или создайте новую операцию.';
          emptyIcon = `
              <svg viewBox="0 0 60 60" fill="none" width="48" height="48" style="margin:0 auto 16px;opacity:0.4;">
                  <rect x="10" y="15" width="40" height="30" rx="3" stroke="currentColor" stroke-width="2"/>
                  <path d="M20 25H40M20 32H35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
          `;
      } else if (hasFilters) {
          emptyMessage = 'Нет операций, соответствующих фильтрам.';
          emptyIcon = `
              <svg viewBox="0 0 60 60" fill="none" width="48" height="48" style="margin:0 auto 16px;opacity:0.4;">
                  <circle cx="30" cy="30" r="15" stroke="currentColor" stroke-width="2"/>
                  <path d="M20 20L40 40M40 20L20 40" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
          `;
      }
      
      tbody.innerHTML = `<tr><td colspan="16" style="text-align: center; padding: 60px; color: #64748b;">
          ${emptyIcon}
          <br>${emptyMessage}
          ${hasFilters ? `<br><button class="btn btn-outline btn-sm" onclick="resetFilters()" style="margin-top: 16px;">Сбросить фильтры</button>` : ''}
      </td></tr>`;
      return;
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const statusText = { 
      pending: '⏳ Ожидает', 
      in_progress: '🔄 В работе', 
      completed: '✅ Завершено', 
      blocked: '🚫 Заблокировано' 
  };
  
  // Вычисляем глобальный индекс для правильной нумерации строк
  const globalStartIndex = (currentPage - 1) * pageSize;
  
  tbody.innerHTML = ops.map((op, localIndex) => {
      const rowNumber = globalStartIndex + localIndex + 1;
      
      let deadlineClass = 'deadline-normal';
      let deadlineText = '—';
      
      if (op.status !== 'completed' && op.end_date) {
          const endDate = new Date(op.end_date);
          endDate.setHours(0, 0, 0, 0);
          const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
          
          if (daysLeft < 0) {
              deadlineClass = 'deadline-critical';
              deadlineText = `🔴 Просрочено (${Math.abs(daysLeft)} дн.)`;
          } else if (daysLeft <= 2) {
              deadlineClass = 'deadline-critical';
              deadlineText = `🔴 ${daysLeft} дн.`;
          } else if (daysLeft <= 5) {
              deadlineClass = 'deadline-warning';
              deadlineText = `🟡 ${daysLeft} дн.`;
          } else {
              deadlineClass = 'deadline-normal';
              deadlineText = `⚪ ${daysLeft} дн.`;
          }
      } else if (op.status === 'completed') {
          deadlineClass = 'deadline-completed';
          deadlineText = '✅ Выполнено';
      }
      
      const brigadeName = getBrigadeName(op.brigade_id);
      
      return `
          <tr data-id="${op.id}" data-op-number="${op.op_number}" onclick="selectOperation(${op.id})" style="cursor: pointer;">
              <td><span style="color:#64748b;font-weight:500;">#${rowNumber}</span></td>
              <td>${op.post || '—'}</td>
              <td><strong style="color:#0961f6;">${op.op_number}</strong></td>
              <td style="color:#64748b;">${op.prev_ops?.join(', ') || '—'}</td>
              <td style="color:#64748b;">${op.next_ops?.join(', ') || '—'}</td>
              <td style="max-width:250px;" title="${op.name}">${op.name}</td>
              <td style="color:#64748b;">${op.drawing || '—'}</td>
              <td>${op.labor_hours || 0} ч</td>
              <td>${op.people_count || 1}</td>
              <td>${op.duration || 0} ч</td>
              <td>${brigadeName}</td>
              <td style="color:#64748b;">${op.location || '—'}</td>
              <td>${op.time_reserve || 0} ч</td>
              <td>
                  <span class="status-badge ${op.status}">${statusText[op.status] || op.status}</span>
              </td>
              <td class="deadline-cell ${deadlineClass}">
                  ${deadlineText}
                  ${op.end_date ? `<br><small style="font-size:10px;">${op.end_date}</small>` : ''}
              </td>
              <td>
                  <div class="action-buttons">
                      <button class="btn-icon" onclick="event.stopPropagation(); editOperation(${op.id})" title="Редактировать">
                          <svg viewBox="0 0 20 20" fill="currentColor" width="16">
                              <path d="M14 2L18 6L7 17H3V13L14 2Z" stroke="currentColor" stroke-width="1.5" fill="none"/>
                          </svg>
                      </button>
                      <button class="btn-icon delete" onclick="event.stopPropagation(); deleteOperation(${op.id})" title="Удалить">
                          <svg viewBox="0 0 20 20" fill="currentColor" width="16">
                              <path d="M4 5H16M8 8V14M12 8V14M5 5L6 17H14L15 5H5Z" stroke="currentColor" stroke-width="1.5"/>
                          </svg>
                      </button>
                  </div>
              </td>
          </tr>
      `;
  }).join('');
}



// function filterOperations() { renderOperationsTable(); }

function filterOperations() {
  applyFilters();
  
  // Сбрасываем выделение
  AdminState.selectedOperation = null;
  const DOM = getDOM();
  if (DOM.editOperationBtn) DOM.editOperationBtn.disabled = true;
  if (DOM.deleteOperationBtn) DOM.deleteOperationBtn.disabled = true;
}


// Сброс фильтров
function resetFilters() {
  const DOM = getDOM();
  
  console.log('🔄 Сброс фильтров');
  
  // Очищаем поля фильтров
  if (DOM.searchOperations) DOM.searchOperations.value = '';
  if (DOM.filterStatus) DOM.filterStatus.value = '';
  if (DOM.filterBrigade) DOM.filterBrigade.value = '';
  
  // Сбрасываем текущие фильтры
  currentFilters = { search: '', status: '', brigade: '' };
  
  // Восстанавливаем отфильтрованный кэш из оригинального
  filteredOperationsCache = [...allOperationsCache];
  totalOperations = filteredOperationsCache.length;
  
  // Сбрасываем на первую страницу
  currentPage = 1;
  loadOperationsPageFromCache(1);
  
  updateFilterInfo();
  
  // Сбрасываем выделение
  AdminState.selectedOperation = null;
  if (DOM.editOperationBtn) DOM.editOperationBtn.disabled = true;
  if (DOM.deleteOperationBtn) DOM.deleteOperationBtn.disabled = true;
  
  showNotification('Фильтры сброшены', `Показаны все ${totalOperations} операций`, 'info');
}





function selectOperation(id) {
    AdminState.selectedOperation = AdminState.operations.find(o => o.id === id);
    const tbody = getDOM().operationsTableBody;
    tbody?.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
    tbody?.querySelector(`tr[data-id="${id}"]`)?.classList.add('selected');
    const DOM = getDOM();
    if (DOM.editOperationBtn) DOM.editOperationBtn.disabled = false;
    if (DOM.deleteOperationBtn) DOM.deleteOperationBtn.disabled = false;
}

function editSelectedOperation() { if (AdminState.selectedOperation) openOperationModal(AdminState.selectedOperation); }

// 
// Переменные пагинации
let currentPage = 1;
let pageSize = 25;
let totalOperations = 0;
let allOperationsCache = [];        // Оригинальный кэш ВСЕХ операций (никогда не меняется)
let filteredOperationsCache = [];   // Отфильтрованный кэш (меняется при фильтрации)
let currentFilters = {              // Текущие фильтры
    search: '',
    status: '',
    brigade: ''
};


async function loadOperationsPage(page) {
    showLoading('Загрузка операций...');
    
    try {
        // Если API поддерживает пагинацию
        const response = await api.get(`/operations?page=${page}&page_size=${pageSize}`);
        
        AdminState.operations = response.items || response;
        totalOperations = response.total || AdminState.operations.length;
        
        renderOperationsTable();
        updatePagination();
        
    } catch (error) {
        // Fallback - загружаем все и пагинируем на клиенте
        const allOps = await api.getOperations();
        totalOperations = allOps.length;
        
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        AdminState.operations = allOps.slice(start, end);
        
        renderOperationsTable();
        updatePagination();
    } finally {
        hideLoading();
    }
}

function updatePagination() {
  const totalPages = Math.ceil(totalOperations / pageSize);
  const pageInfo = document.getElementById('pageInfo');
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  
  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalOperations);
  
  if (pageInfo) {
      if (totalOperations > 0) {
          pageInfo.textContent = `Стр. ${currentPage} из ${totalPages} (${startIndex}-${endIndex} из ${totalOperations})`;
      } else {
          pageInfo.textContent = `Нет данных`;
      }
  }
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages || totalOperations === 0;
  
  updateFilterInfo();
}


// Обновленная функция перехода на следующую страницу
function nextPage() {
  const totalPages = Math.ceil(totalOperations / pageSize);
  if (currentPage < totalPages) {
      currentPage++;
      loadOperationsPageFromCache(currentPage);
      
      AdminState.selectedOperation = null;
      const DOM = getDOM();
      if (DOM.editOperationBtn) DOM.editOperationBtn.disabled = true;
      if (DOM.deleteOperationBtn) DOM.deleteOperationBtn.disabled = true;
  }
}


// function nextPage() {
//     const totalPages = Math.ceil(totalOperations / pageSize);
//     if (currentPage < totalPages) {
//         currentPage++;
//         loadOperationsPage(currentPage);
//     }
// }

function prevPage() {
  if (currentPage > 1) {
      currentPage--;
      loadOperationsPageFromCache(currentPage);
      
      AdminState.selectedOperation = null;
      const DOM = getDOM();
      if (DOM.editOperationBtn) DOM.editOperationBtn.disabled = true;
      if (DOM.deleteOperationBtn) DOM.deleteOperationBtn.disabled = true;
  }
}


// Функция для перехода на конкретную страницу
function goToPage(page) {
  const totalPages = Math.ceil(totalOperations / pageSize);
  if (page >= 1 && page <= totalPages) {
      currentPage = page;
      loadOperationsPageFromCache(currentPage);
  }
}

document.getElementById('btnChatSend')?.addEventListener('click', () => {
  if (typeof sendChatMessageAdmin === 'function') sendChatMessageAdmin();
});
document.getElementById('chatSearch')?.addEventListener('input', () => {
  if (typeof renderChatThreadListAdmin === 'function') renderChatThreadListAdmin();
});
document.getElementById('btnChatNew')?.addEventListener('click', async () => {
  await loadChatPeerOptionsAdmin();
  const m = document.getElementById('chatNewModal');
  if (m) {
    m.classList.add('is-open');
    m.style.display = 'flex';
    document.getElementById('chatPeerSearch')?.focus();
  }
});
document.getElementById('chatNewClose')?.addEventListener('click', () => {
  const m = document.getElementById('chatNewModal');
  if (m) m.style.display = 'none';
  m.classList.remove('is-open');
  m.style.display = 'none'; 
});
document.getElementById('chatNewSend')?.addEventListener('click', () => {
  if (typeof adminStartChatFromSelect === 'function') adminStartChatFromSelect();
});
document.getElementById('btnNotifPanel')?.addEventListener('click', () => {
  if (typeof switchTab === 'function') switchTab('messages');
});


document.getElementById('prevPage')?.addEventListener('click', prevPage);
document.getElementById('nextPage')?.addEventListener('click', nextPage);
document.getElementById('cardCompleted')?.addEventListener('click', () => {
    if (window.showPeriodComparisonModal) window.showPeriodComparisonModal();
});

document.getElementById('btnSaveSidebarSettings')?.addEventListener('click', () => {
    const mode = document.getElementById('settingSidebarMode')?.value || 'click';
    const startCol = !!document.getElementById('settingSidebarStartCollapsed')?.checked;
    localStorage.setItem('sidebarMode', mode);
    localStorage.setItem('sidebarCollapsed', startCol ? '1' : '0');
    initSidebarBehavior();
    showNotification('Настройки', 'Боковая панель обновлена', 'success');
  });

async function deleteSelectedOperation() {
    if (!AdminState.selectedOperation) return;
    const op = AdminState.selectedOperation;
    if (!confirm(`Удалить операцию #${op.op_number}?`)) return;
    try {
        await api.deleteOperation(op.id);
        AdminState.selectedOperation = null;
        showNotification('Успех', 'Операция удалена', 'success');
        await loadAllData();
    } catch (e) { showNotification('Ошибка', e.message, 'error'); }
}

function getBrigadeName(id) {
    if (!id) return '-';
    const b = AdminState.brigades.find(b => b.id === id);
    return b?.name || `Бригада ${id}`;
}

// ================================================================
// МОДАЛЬНОЕ ОКНО ОПЕРАЦИИ
// ================================================================

function openOperationModal(op = null) {
    closeAllModals();
    const DOM = getDOM();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'operationModal';
    modal.style.display = 'block';
    modal.style.width = '700px';
    modal.style.maxHeight = '85vh';
    modal.style.overflowY = 'auto';
    
    modal.innerHTML = `
        <div class="modal-header">
            <h3>${op ? 'Редактировать' : 'Добавить'} операцию</h3>
            <button class="modal-close" onclick="closeAllModals()">&times;</button>
        </div>
        <div class="modal-body">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label>Пост</label>
                    <input type="number" id="opPost" class="input" value="${op?.post || ''}">
                </div>
                <div class="form-group">
                    <label>Номер операции *</label>
                    <input type="number" id="opNumber" class="input" value="${op?.op_number || ''}" required>
                </div>
                <div class="form-group">
                    <label>Чертёж</label>
                    <input type="text" id="opDrawing" class="input" value="${op?.drawing || ''}">
                </div>
            </div>
            <div class="form-group">
                <label>Название *</label>
                <input type="text" id="opName" class="input" value="${op?.name || ''}" required>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label>Предшествующие (через запятую)</label>
                    <input type="text" id="opPrev" class="input" value="${(op?.prev_ops || []).join(', ')}" placeholder="101, 102">
                </div>
                <div class="form-group">
                    <label>Последующие (через запятую)</label>
                    <input type="text" id="opNext" class="input" value="${(op?.next_ops || []).join(', ')}" placeholder="104, 105">
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label>Трудоёмкость (ч)</label>
                    <input type="number" id="opLabor" class="input" step="0.1" value="${op?.labor_hours || 0}">
                </div>
                <div class="form-group">
                    <label>Кол-во человек</label>
                    <input type="number" id="opPeople" class="input" value="${op?.people_count || 1}" min="1">
                </div>
                <div class="form-group">
                    <label>Время (ч)</label>
                    <input type="number" id="opDuration" class="input" step="0.1" value="${op?.duration || 0}">
                </div>
                <div class="form-group">
                    <label>Резерв (ч)</label>
                    <input type="number" id="opReserve" class="input" step="0.1" value="${op?.time_reserve || 0}">
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label>Бригада</label>
                    <select id="opBrigade" class="input">
                        <option value="">Не назначена</option>
                        ${AdminState.brigades.map(b => `<option value="${b.id}" ${op?.brigade_id === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Место проведения</label>
                    <input type="text" id="opLocation" class="input" value="${op?.location || ''}">
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label>Статус</label>
                    <select id="opStatus" class="input">
                        <option value="pending" ${op?.status === 'pending' ? 'selected' : ''}>Ожидает</option>
                        <option value="in_progress" ${op?.status === 'in_progress' ? 'selected' : ''}>В работе</option>
                        <option value="completed" ${op?.status === 'completed' ? 'selected' : ''}>Завершено</option>
                        <option value="blocked" ${op?.status === 'blocked' ? 'selected' : ''}>Заблокировано</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Дата начала</label>
                    <input type="date" id="opStartDate" class="input" value="${op?.start_date || ''}">
                </div>
                <div class="form-group">
                    <label>Дата окончания (ДД)</label>
                    <input type="date" id="opEndDate" class="input" value="${op?.end_date || ''}">
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-outline" onclick="closeAllModals()">Отмена</button>
            <button class="btn btn-primary" onclick="saveOperation(${op?.id || 'null'})">Сохранить</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    DOM.modalOverlay.style.display = 'block';
}

async function saveOperation(id) {
  const data = {
      post: parseInt(document.getElementById('opPost')?.value) || null,
      op_number: parseInt(document.getElementById('opNumber')?.value),
      name: document.getElementById('opName')?.value?.trim(),
      drawing: document.getElementById('opDrawing')?.value?.trim() || '',
      labor_hours: parseFloat(document.getElementById('opLabor')?.value) || 0,
      people_count: parseInt(document.getElementById('opPeople')?.value) || 1,
      duration: parseFloat(document.getElementById('opDuration')?.value) || 0,
      time_reserve: parseFloat(document.getElementById('opReserve')?.value) || 0,
      brigade_id: parseInt(document.getElementById('opBrigade')?.value) || null,
      location: document.getElementById('opLocation')?.value?.trim() || '',
      status: document.getElementById('opStatus')?.value || 'pending',
      start_date: document.getElementById('opStartDate')?.value || null,
      end_date: document.getElementById('opEndDate')?.value || null,
      prev_ops: (document.getElementById('opPrev')?.value || '').split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)),
      next_ops: (document.getElementById('opNext')?.value || '').split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
  };
  
  if (!data.op_number || !data.name) { 
      alert('Номер и название обязательны'); 
      return; 
  }
  
  try {
      if (id && id !== 'null') {
          await api.updateOperation(parseInt(id), data);
          showNotification('Успех', 'Операция обновлена', 'success');
      } else {
          await api.createOperation(data);
          showNotification('Успех', 'Операция создана', 'success');
      }
      closeAllModals();

      // полная пересборка: дашборд, граф, гантт, CPM; AI-снимок сбросить
      await refreshAfterOperationsChange({
        invalidateAI: true,
        rerenderGraph: true,
        autoOptimize: false
      });
      // больше ничего — optimize внутри refresh

      showNotification(
        'Данные обновлены',
        'Дашборд, CPM и AI пересчитаны',
        'success'
      );

  } catch (e) {
      alert('Ошибка: ' + e.message); 
  }
}


async function deleteOperation(id) {
  if (!confirm('Удалить операцию?')) return;
  
  try {
      await api.deleteOperation(id);
      showNotification('Успех', 'Операция удалена', 'success');
      
      // Перезагружаем данные
      await refreshAfterOperationsChange({ invalidateAI: true, rerenderGraph: true });
      
      // Если текущая страница стала пустой, переходим на предыдущую
      const totalPages = Math.ceil(totalOperations / pageSize);
      if (currentPage > totalPages) {
          currentPage = Math.max(1, totalPages);
          loadOperationsPageFromCache(currentPage);
      }
      
  } catch (e) {
      showNotification('Ошибка', e.message, 'error');
  }
}


// Экспорт функций в глобальную область
window.goToPage = goToPage;
window.resetFilters = resetFilters;
window.nextPage = nextPage;
window.prevPage = prevPage;
window.filterOperations = filterOperations;
window.deleteOperation = deleteOperation;

window.runOptimization = runOptimization;
window.trainAIModel = trainAIModel;

window.goToOperation = function(opNumber) {
    opNumber = String(opNumber).replace(/^T/i, '');

    if (typeof switchTab === 'function') {
        switchTab('operations');
    }

    const all = window.allOperationsCache || (typeof AdminState !== 'undefined' ? AdminState.operations : []) || [];
    const op = all.find(o => String(o.op_number) === String(opNumber));

    const search = document.getElementById('searchOperations');
    if (search) {
        search.value = opNumber;
        if (typeof filterOperations === 'function') filterOperations();
        if (typeof applyFilters === 'function') applyFilters();
    }

    setTimeout(() => {
        const rows = document.querySelectorAll('#operationsTableBody tr, .operations-table tr, table tbody tr');
        let found = false;
        rows.forEach(tr => {
            tr.style.outline = '';
            tr.style.background = '';
            const text = tr.textContent || '';
            if (text.includes('#' + opNumber) || text.match(new RegExp('\\b' + opNumber + '\\b'))) {
                tr.style.outline = '2px solid #dc2626';
                tr.style.background = '#fef2f2';
                tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
                found = true;
            }
        });
        if (op && typeof selectOperation === 'function') {
            selectOperation(op.id);
        }
        if (!found && typeof showNotification === 'function') {
            showNotification('Операция', '#' + opNumber + (op ? ' — ' + op.name : ' не найдена на текущей странице'), 'info');
        }
    }, 350);
};

window.showBottleneckDetail = function(raw) {
    let d;
    try {
        d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
        d = { name: String(raw), message: '', suggestion: '' };
    }

    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.style.display = 'flex';

    const old = document.getElementById('bottleneckDetailModal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'bottleneckDetailModal';
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:12px;padding:24px;max-width:480px;width:90%;z-index:10001;box-shadow:0 20px 50px rgba(0,0,0,.25);';

    const opNum = String(d.task_id || '').replace(/^T/i, '');

    modal.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="margin:0;font-size:16px;">Узкое место</h3>
            <button type="button" id="bnCloseBtn" style="border:0;background:none;font-size:22px;cursor:pointer;line-height:1;">×</button>
        </div>
        <div style="font-size:13px;line-height:1.65;color:#334155;">
            <div><b>Объект:</b> ${d.name || '—'}</div>
            <div><b>Тип:</b> ${d.type || '—'}</div>
            <div><b>Уровень:</b> ${d.severity || '—'}</div>
            <div style="margin-top:12px;"><b>Проблема</b><br>${d.message || '—'}</div>
            <div style="margin-top:12px;color:#0961f6;"><b>Рекомендация</b><br>${d.suggestion || '—'}</div>
            ${opNum ? `
            <div style="margin-top:16px;">
                <button type="button" id="bnGoOpBtn" class="btn btn-primary btn-sm"
                    style="padding:8px 14px;border-radius:8px;border:0;background:#0961f6;color:#fff;cursor:pointer;">
                    Перейти к операции #${opNum}
                </button>
            </div>` : ''}
        </div>
    `;
    document.body.appendChild(modal);

    const close = () => {
        modal.remove();
        if (overlay) overlay.style.display = 'none';
    };
    document.getElementById('bnCloseBtn').onclick = close;
    if (overlay) overlay.onclick = close;

    const goBtn = document.getElementById('bnGoOpBtn');
    if (goBtn) {
        goBtn.onclick = () => {
            close();
            if (window.goToOperation) window.goToOperation(opNum);
        };
    }
};

window.showRecommendationDetail = function(rec) {
    if (!rec) return;
    if (typeof rec === 'string') {
        try { rec = JSON.parse(rec); } catch (e) { rec = { message: rec }; }
    }

    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.style.display = 'flex';

    const old = document.getElementById('recommendationDetailModal');
    if (old) old.remove();

    const typeLabels = {
        critical_path_task: 'Критический путь',
        near_critical: 'Почти критическая работа',
        bottleneck: 'Узкое место',
        dependency_bottleneck: 'Узкое место по зависимостям',
        brigade_overload: 'Перегрузка бригады',
        overload: 'Перегрузка',
        assign_operation: 'Назначение операции',
        parallelize: 'Параллелизация',
        delay_risk: 'Риск задержки'
    };

    const whatIs = {
        critical_path_task: 'Работа на критическом пути: любой срыв сразу сдвигает срок всего проекта. Резерва времени нет.',
        near_critical: 'Резерв времени очень мал. Небольшой сбой может сделать работу критической.',
        bottleneck: 'Ограничение, которое тормозит поток работ (ресурсы, зависимости, длительность).',
        dependency_bottleneck: 'Много входящих или исходящих связей — задержка здесь бьёт по многим следующим операциям.',
        brigade_overload: 'Бригада загружена выше нормы — риск срыва сроков и качества.',
        overload: 'Перегрузка ресурса или бригады.',
        assign_operation: 'Операция без бригады или выгоднее переназначить.',
        parallelize: 'Часть работ можно выполнять параллельно и сократить срок.',
        delay_risk: 'По прогнозу высока вероятность задержки.'
    };

    const type = rec.type || 'recommendation';
    const title = typeLabels[type] || type.replace(/_/g, ' ');
    const about = whatIs[type] || 'Рекомендация системы планирования по текущему плану и загрузке.';
    const name = rec.task_name || rec.operation_name || rec.brigade_name || rec.task_id || rec.op_number || '—';
    const message = rec.message || rec.reason || '—';
    const suggestion = rec.suggestion || 'Следовать тексту рекомендации; при необходимости открыть операцию и скорректировать план.';
    const opNum = String(rec.task_id || rec.op_number || '').replace(/^T/i, '');

    const modal = document.createElement('div');
    modal.id = 'recommendationDetailModal';
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:12px;padding:24px;max-width:520px;width:92%;z-index:10001;box-shadow:0 20px 50px rgba(0,0,0,.25);max-height:90vh;overflow:auto;';
    modal.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h3 style="margin:0;font-size:16px;">${title}</h3>
            <button type="button" id="recCloseBtn" style="border:0;background:none;font-size:22px;cursor:pointer;line-height:1;">×</button>
        </div>
        <div style="font-size:13px;line-height:1.65;color:#334155;">
            <div style="margin-bottom:12px;padding:10px 12px;background:#f8fafc;border-radius:8px;border-left:3px solid #0961f6;">
                <div style="font-size:11px;color:#64748b;margin-bottom:4px;">ЧТО ЭТО</div>
                ${about}
            </div>
            <div><b>Объект:</b> ${name}</div>
            ${rec.duration != null ? `<div><b>Длительность:</b> ${Number(rec.duration).toFixed(2)} дн.</div>` : ''}
            ${opNum ? `<div><b>Операция:</b> #${opNum}</div>` : ''}
            ${rec.brigade_id ? `<div><b>Бригада:</b> ${rec.brigade_id}</div>` : ''}
            <div style="margin-top:12px;"><b>Суть</b><br>${message}</div>
            <div style="margin-top:12px;color:#0961f6;"><b>Что сделать</b><br>${suggestion}</div>
            <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
                ${opNum ? `<button type="button" id="recGoOpBtn" style="padding:8px 14px;border-radius:8px;border:0;background:#0961f6;color:#fff;cursor:pointer;font-size:13px;">Перейти к операции #${opNum}</button>` : ''}
                <button type="button" id="recCloseBtn2" style="padding:8px 14px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;font-size:13px;">Закрыть</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const close = () => {
        modal.remove();
        if (overlay) overlay.style.display = 'none';
    };
    document.getElementById('recCloseBtn').onclick = close;
    document.getElementById('recCloseBtn2').onclick = close;
    if (overlay) overlay.onclick = close;

    const goBtn = document.getElementById('recGoOpBtn');
    if (goBtn && window.goToOperation) {
        goBtn.onclick = () => {
            close();
            window.goToOperation(opNum);
        };
    }
};

// ================================================================
// БРИГАДЫ (ПОЛНАЯ ПЕРЕРАБОТКА С ПОИСКОМ И СОРТИРОВКОЙ)
// ================================================================

// Кэш для бригад с количеством рабочих
let brigadesCache = [];

function updateBrigadesCache() {
    brigadesCache = AdminState.brigades.map(brigade => {
        const workers = AdminState.workers.filter(w => w.brigade_id === brigade.id);
        const brigadier = workers.find(w => w.is_brigadier);
        return {
            ...brigade,
            workers: workers,
            workers_count: workers.length,
            brigadier: brigadier
        };
    });
}

function filterAndSortBrigades() {
    const searchInput = document.getElementById('brigadeSearch');
    const sortSelect = document.getElementById('brigadeSort');
    
    const searchQuery = searchInput?.value?.toLowerCase()?.trim() || '';
    const sortBy = sortSelect?.value || 'default';
    
    // Обновляем кэш
    updateBrigadesCache();
    
    // Копируем массив
    let filtered = [...brigadesCache];
    
    // Поиск
    if (searchQuery) {
        filtered = filtered.filter(b => 
            b.name?.toLowerCase().includes(searchQuery) ||
            b.description?.toLowerCase().includes(searchQuery)
        );
    }
    
    // Сортировка
    const importanceOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    
    switch (sortBy) {
        case 'importance_desc':
            filtered.sort((a, b) => (importanceOrder[b.importance] || 0) - (importanceOrder[a.importance] || 0));
            break;
        case 'importance_asc':
            filtered.sort((a, b) => (importanceOrder[a.importance] || 0) - (importanceOrder[b.importance] || 0));
            break;
        case 'name_asc':
            filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
            break;
        case 'name_desc':
            filtered.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'ru'));
            break;
        case 'workers_desc':
            filtered.sort((a, b) => (b.workers_count || 0) - (a.workers_count || 0));
            break;
        case 'load_desc':
            filtered.sort((a, b) => (b.current_load || 0) - (a.current_load || 0));
            break;
    }
    
    return filtered;
}

function renderBrigadesGrid() {
    const grid = document.getElementById('brigadesGrid');
    const countSpan = document.getElementById('brigadeCount');
    
    if (!grid) return;
    
    const brigades = filterAndSortBrigades();
    
    if (countSpan) {
        countSpan.textContent = `Найдено: ${brigades.length} / ${AdminState.brigades.length}`;
    }
    
    if (brigades.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px; background: white; border-radius: 16px;">
                <svg viewBox="0 0 48 48" fill="none" width="48" height="48" style="margin: 0 auto 16px; opacity: 0.4;">
                    <circle cx="24" cy="24" r="20" stroke="#64748b" stroke-width="2"/>
                    <path d="M16 24h16M24 16v16" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <p style="color: #64748b;">Бригады не найдены</p>
                <button class="btn btn-outline btn-sm" onclick="document.getElementById('brigadeSearch').value=''; filterAndRenderBrigades();" style="margin-top: 16px;">
                    Сбросить поиск
                </button>
            </div>
        `;
        return;
    }
    
    const importanceColors = {
        critical: '#ef4444',
        high: '#f59e0b',
        medium: '#0961f6',
        low: '#10b981'
    };
    
    const importanceText = {
        critical: '🔥 Критическая',
        high: '⭐ Высокая',
        medium: '📌 Средняя',
        low: '🔹 Низкая'
    };
    
    grid.innerHTML = brigades.map(b => {
        const workers = AdminState.workers.filter(w => w.brigade_id === b.id);
        const brigadier = workers.find(w => w.is_brigadier);
        const importance = b.importance || 'medium';
        
        return `
            <div class="brigade-card" data-brigade-id="${b.id}" 
                 ondragover="event.preventDefault(); this.classList.add('drag-over')" 
                 ondragleave="this.classList.remove('drag-over')" 
                 ondrop="handleBrigadeDrop(event, ${b.id})">
                
                <!-- Важность -->
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                    <span style="padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 500;
                                 background: ${importanceColors[importance]}20; color: ${importanceColors[importance]};">
                        ${importanceText[importance]}
                    </span>
                </div>
                
                <!-- Заголовок -->
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <h3 style="margin: 0;">${b.name}</h3>
                    <div>
                        <button class="btn-icon" onclick="editBrigade(${b.id})" title="Редактировать">✏️</button>
                        <button class="btn-icon" onclick="deleteBrigade(${b.id})" title="Удалить">🗑️</button>
                    </div>
                </div>
                
                ${b.description ? `<p style="color: #666; margin: 8px 0;">${b.description}</p>` : ''}
                
                <!-- Статистика -->
                <div style="margin: 12px 0; padding: 12px; background: #f8f9fa; border-radius: 8px;">
                    <p style="margin: 0 0 8px 0;"><strong>👑 Бригадир:</strong> ${brigadier?.name || 'Не назначен'}</p>
                    <p style="margin: 0 0 8px 0;"><strong>👥 Состав:</strong> ${workers.length} / ${b.max_capacity || 10}</p>
                    <p style="margin: 0;"><strong>📊 Загрузка:</strong> ${Math.round(b.current_load || 0)}%</p>
                    <div class="progress-bar" style="margin: 8px 0;">
                        <div class="progress-fill" style="width: ${b.current_load || 0}%"></div>
                    </div>
                    <p style="margin: 8px 0 0 0;"><strong>⚡ Эффективность:</strong> ${Math.round((b.efficiency_rating || 1) * 100)}%</p>
                </div>
                
                <!-- Рабочие -->
                <div style="margin: 12px 0; padding: 12px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h4 style="margin: 0;">👥 Рабочие</h4>
                        <button class="btn-icon-sm" onclick="window.manageBrigadeWorkers(${b.id})" title="Добавить рабочего">➕</button>
                    </div>
                    ${workers.length ? workers.map(w => `
                        <div class="worker-item" draggable="true" 
                             ondragstart="handleWorkerDragStart(event, ${w.id})" 
                             ondragend="handleWorkerDragEnd(event)"
                             style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="worker-status" style="width: 8px; height: 8px; border-radius: 50%; background: ${w.status === 'online' ? '#10b981' : w.status === 'busy' ? '#f59e0b' : '#94a3b8'};"></span>
                                <span>${w.name}</span>
                                ${w.is_brigadier ? '<span style="color: #f59e0b;" title="Бригадир">👑</span>' : ''}
                            </div>
                            <div style="display: flex; gap: 4px;">
                                ${!w.is_brigadier ? 
                                    `<button class="btn-icon-sm" onclick="event.stopPropagation(); assignAsBrigadier(${w.id}, ${b.id})" title="Назначить бригадиром" style="color: #f59e0b;">👑</button>` 
                                    : ''}
                                <button class="btn-icon-sm" onclick="event.stopPropagation(); removeWorkerFromBrigade(${w.id})" title="Убрать из бригады" style="color: #ef4444;">✖</button>
                            </div>
                        </div>
                    `).join('') : '<p style="color: #999; margin: 0;">Нет рабочих</p>'}
                </div>
                
                <!-- ЗАДАЧИ БРИГАДЫ -->
                <div style="margin: 12px 0; padding: 12px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h4 style="margin: 0; font-size: 14px; font-weight: 600;">📋 Задачи</h4>
                        <button class="btn-icon-sm" onclick="openBrigadeTaskModal(${b.id})" title="Добавить задачу" style="color: #3b82f6;">➕</button>
                    </div>
                    <div id="tasks-${b.id}" class="brigade-tasks-list">
                        <button class="btn-ghost btn-sm" onclick="loadBrigadeTasks(${b.id})" style="width: 100%; padding: 8px; color: #64748b;">
                            📋 Загрузить задачи...
                        </button>
                    </div>
                </div>
                
                <!-- Кнопки -->
                <div style="display: flex; gap: 8px; margin-top: 12px;">
                  <button class="btn btn-outline btn-sm" onclick="openBrigadeTaskModal(${b.id})" style="flex: 1;">
                      + Task
                  </button>
                  <button class="btn btn-outline btn-sm" onclick="openScheduleModal(${b.id})" style="flex: 1;">
                      Schedule
                  </button>
              </div>
            </div>
        `;
    }).join('');
}

// Функция для вызова из HTML
function filterAndRenderBrigades() {
    renderBrigadesGrid();
}
function addWorkerToBrigade(brigadeId) {
    if (typeof manageBrigadeWorkers === 'function') {
      return manageBrigadeWorkers(brigadeId);
    }
    console.warn('manageBrigadeWorkers ещё не объявлена');
  }
  
  window.addWorkerToBrigade = addWorkerToBrigade;
  window.manageBrigadeWorkers = manageBrigadeWorkers;
  window.addSelectedToBrigade = addSelectedToBrigade;
  window.removeSelectedFromBrigade = removeSelectedFromBrigade;
// Глобальные функции
window.filterBrigades = filterAndRenderBrigades;
window.sortBrigades = filterAndRenderBrigades;
window.filterAndRenderBrigades = filterAndRenderBrigades;

// ================================================================
// МОДАЛЬНОЕ ОКНО ЗАДАЧИ РАСПИСАНИЯ
// ================================================================

function openScheduleTaskModal(brigadeId, task = null) {
  closeAllModals();
  const DOM = getDOM();
  const workers = AdminState.workers.filter(w => w.brigade_id === brigadeId);
  const today = new Date().toISOString().split('T')[0];
  
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'scheduleTaskModal';
  modal.style.display = 'block';
  modal.style.width = '550px';
  
  modal.innerHTML = `
      <div class="modal-header">
          <h3>${task ? 'Edit' : 'New'} Schedule Task</h3>
          <button class="modal-close" onclick="closeAllModals()">&times;</button>
      </div>
      <div class="modal-body">
          <input type="hidden" id="scheduleBrigadeId" value="${brigadeId}">
          ${task ? `<input type="hidden" id="scheduleTaskId" value="${task.id}">` : ''}
          
          <div class="form-group">
              <label>Title *</label>
              <input type="text" id="scheduleTitle" class="input" value="${task?.title || ''}" placeholder="Task title">
          </div>
          
          <div class="form-group">
              <label>Description</label>
              <textarea id="scheduleDesc" class="input" rows="3" placeholder="Task details...">${task?.description || ''}</textarea>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="form-group">
                  <label>Date *</label>
                  <input type="date" id="scheduleDate" class="input" value="${task?.scheduled_date || today}">
              </div>
              <div class="form-group">
                  <label>Priority</label>
                  <select id="schedulePriority" class="input">
                      <option value="low" ${task?.priority === 'low' ? 'selected' : ''}>Low</option>
                      <option value="medium" ${task?.priority === 'medium' ? 'selected' : ''} selected>Medium</option>
                      <option value="high" ${task?.priority === 'high' ? 'selected' : ''}>High</option>
                      <option value="critical" ${task?.priority === 'critical' ? 'selected' : ''}>Critical</option>
                  </select>
              </div>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="form-group">
                  <label>Estimated Hours</label>
                  <input type="number" id="scheduleHours" class="input" step="0.5" min="0" value="${task?.estimated_hours || 0}">
              </div>
              <div class="form-group">
                  <label>Due Date</label>
                  <input type="date" id="scheduleDueDate" class="input" value="${task?.due_date || ''}">
              </div>
          </div>
          
          <div class="form-group">
              <label>Assign To</label>
              <select id="scheduleAssigned" class="input">
                  <option value="">-- Unassigned --</option>
                  ${workers.map(w => `<option value="${w.id}" ${task?.assigned_worker_id === w.id ? 'selected' : ''}>${w.name} (${w.position || 'Worker'})</option>`).join('')}
              </select>
          </div>
      </div>
      <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeAllModals()">Cancel</button>
          <button class="btn btn-primary" onclick="saveScheduleTask(${task?.id || 'null'})">
              ${task ? 'Save' : 'Create'}
          </button>
      </div>
  `;
  
  document.body.appendChild(modal);
  DOM.modalOverlay.style.display = 'block';
  
  setTimeout(() => document.getElementById('scheduleTitle')?.focus(), 100);
}

// Сохранение задачи расписания
async function saveScheduleTask(taskId) {
  const brigadeId = parseInt(document.getElementById('scheduleBrigadeId')?.value);
  const data = {
      brigade_id: brigadeId,
      title: document.getElementById('scheduleTitle')?.value?.trim(),
      description: document.getElementById('scheduleDesc')?.value?.trim() || '',
      scheduled_date: document.getElementById('scheduleDate')?.value,
      due_date: document.getElementById('scheduleDueDate')?.value || null,
      priority: document.getElementById('schedulePriority')?.value || 'medium',
      assigned_worker_id: parseInt(document.getElementById('scheduleAssigned')?.value) || null,
      estimated_hours: parseFloat(document.getElementById('scheduleHours')?.value) || 0
  };
  
  if (!data.title) {
      alert('Enter task title');
      return;
  }
  
  try {
      if (taskId && taskId !== 'null') {
          await api.put(`/brigade-schedule/${taskId}`, data);
          showNotification('Success', 'Schedule task updated', 'success');
      } else {
          await api.post('/brigade-schedule', data);
          showNotification('Success', 'Schedule task created', 'success');
      }
      closeAllModals();
      
      // Reload schedule
      if (document.getElementById('scheduleContent')) {
          await loadScheduleForDate(brigadeId);
      }
  } catch (e) {
      alert('Error: ' + e.message);
  }
}

// Завершение задачи расписания
async function completeScheduleTask(taskId, brigadeId) {
  try {
      await api.put(`/brigade-schedule/${taskId}/complete`, {});
      showNotification('Success', 'Task completed', 'success');
      await loadScheduleForDate(brigadeId);
  } catch (e) {
      alert('Error: ' + e.message);
  }
}

// Удаление задачи расписания
async function deleteScheduleTask(taskId, brigadeId) {
  if (!confirm('Delete task?')) return;
  try {
      await api.delete(`/brigade-schedule/${taskId}`);
      await loadScheduleForDate(brigadeId);
  } catch (e) {
      alert('Error: ' + e.message);
  }
}
// Экспорт всех функций для использования в HTML onclick
// window.openBrigadeTaskModal = openBrigadeTaskModal;
// window.saveBrigadeTask = saveBrigadeTask;
// window.deleteBrigadeTask = deleteBrigadeTask;
// window.completeBrigadeTask = completeBrigadeTask;
// window.assignTaskToWorker = assignTaskToWorker;
// window.editBrigadeTask = editBrigadeTask;

// window.openScheduleModal = openScheduleModal;
// window.openScheduleTaskModal = openScheduleTaskModal;
// window.saveScheduleTask = saveScheduleTask;
// window.completeScheduleTask = completeScheduleTask;
// window.deleteScheduleTask = deleteScheduleTask;
// window.loadScheduleForDate = loadScheduleForDate;

window.loadBrigadeTasks = loadBrigadeTasks;
window.viewBrigadeSchedule = (id) => openScheduleModal(id);

// Экспорт функций
window.openScheduleTaskModal = openScheduleTaskModal;
window.saveScheduleTask = saveScheduleTask;
window.completeScheduleTask = completeScheduleTask;
window.deleteScheduleTask = deleteScheduleTask;
// Редактирование задачи бригады
async function editBrigadeTask(taskId) {
    try {
        // Получаем все задачи
        const tasks = await api.get('/brigade-tasks');
        const task = tasks.find(t => t.id === taskId);
        
        if (task) {
            openBrigadeTaskModal(task.brigade_id, task);
        } else {
            showNotification('Ошибка', 'Задача не найдена', 'error');
        }
    } catch (e) {
        alert('Ошибка: ' + e.message);
    }
}
// Загрузка задач бригады
async function loadBrigadeTasks(brigadeId) {
  const container = document.getElementById(`tasks-${brigadeId}`);
  if (!container) return;
  
  try {
      const tasks = await api.get(`/brigade-tasks?brigade_id=${brigadeId}`);
      const workers = AdminState.workers.filter(w => w.brigade_id === brigadeId);
      const stats = await api.get(`/brigades/${brigadeId}/statistics`);
      
      renderBrigadeTasksList(container, tasks, workers, stats, brigadeId);
      
  } catch (e) {
      console.error('Ошибка загрузки задач:', e);
      container.innerHTML = `<p style="color:#ef4444;padding:12px;">Ошибка загрузки задач</p>`;
  }
}

function renderBrigadeTasksList(container, tasks, workers, stats, brigadeId) {
  if (!tasks.length) {
      container.innerHTML = `
          <div class="empty-tasks-state">
              <svg viewBox="0 0 40 40" fill="none">
                  <rect x="6" y="8" width="28" height="24" rx="3" stroke="#cbd5e1" stroke-width="1.5"/>
                  <path d="M14 16h12M14 20h8" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <p>Нет активных задач</p>
              <button class="btn btn-outline btn-sm" onclick="openBrigadeTaskModal(${brigadeId})">
                  ➕ Добавить задачу
              </button>
          </div>
      `;
      return;
  }
  
  const priorityConfig = {
      critical: { label: '🔥 Критический', color: '#ef4444', bg: '#fef2f2' },
      high: { label: '⭐ Высокий', color: '#f59e0b', bg: '#fffbeb' },
      medium: { label: '📌 Средний', color: '#0961f6', bg: '#eff6ff' },
      low: { label: '🔹 Низкий', color: '#10b981', bg: '#f0fdf4' }
  };
  
  const statusConfig = {
      pending: { label: '⏳ Ожидает', color: '#64748b' },
      in_progress: { label: '🔄 В работе', color: '#0961f6' },
      completed: { label: '✅ Завершено', color: '#10b981' },
      blocked: { label: '🚫 Заблокировано', color: '#ef4444' }
  };
  
  const taskTypeConfig = {
      main: { label: '🔴 Основная', color: '#ef4444' },
      secondary: { label: '🟡 Побочная', color: '#f59e0b' },
      optional: { label: '🔵 Дополнительная', color: '#3b82f6' }
  };
  
  // Статистика
  const statsHtml = `
      <div class="tasks-stats-mini">
          <div class="stat-mini">
              <span class="stat-value">${stats.total_tasks}</span>
              <span class="stat-label">всего</span>
          </div>
          <div class="stat-mini completed">
              <span class="stat-value">${stats.completed_tasks}</span>
              <span class="stat-label">выполнено</span>
          </div>
          <div class="stat-mini active">
              <span class="stat-value">${stats.active_tasks}</span>
              <span class="stat-label">активных</span>
          </div>
          <div class="stat-mini overdue">
              <span class="stat-value">${stats.overdue_tasks}</span>
              <span class="stat-label">просрочено</span>
          </div>
      </div>
      <div class="efficiency-bar">
          <div class="efficiency-fill" style="width: ${stats.efficiency}%"></div>
          <span class="efficiency-text">Эффективность: ${stats.efficiency}%</span>
      </div>
  `;
  
  const tasksHtml = tasks.map(task => {
      const priority = priorityConfig[task.priority] || priorityConfig.medium;
      const status = statusConfig[task.status] || statusConfig.pending;
      const taskType = taskTypeConfig[task.task_type] || taskTypeConfig.main;
      const assignedWorker = workers.find(w => w.id === task.assigned_worker_id);
      const isOverdue = task.status !== 'completed' && task.due_date && new Date(task.due_date) < new Date();
      
      return `
          <div class="task-card ${isOverdue ? 'overdue' : ''} ${task.status}" data-task-id="${task.id}">
              <div class="task-header">
                  <div class="task-title-section">
                      <span class="task-type-badge" style="background: ${taskType.color}20; color: ${taskType.color};">
                          ${taskType.label}
                      </span>
                      <span class="task-priority" style="background: ${priority.bg}; color: ${priority.color};">
                          ${priority.label}
                      </span>
                  </div>
                  <div class="task-actions">
                      <button class="task-action-btn" onclick="editBrigadeTask(${task.id})" title="Редактировать">
                          <svg viewBox="0 0 14 14" fill="currentColor">
                              <path d="M11 2L13 4L6 11H4V9L11 2Z" stroke="currentColor" stroke-width="1.2" fill="none"/>
                          </svg>
                      </button>
                      <button class="task-action-btn delete" onclick="deleteBrigadeTask(${task.id}, ${brigadeId})" title="Удалить">
                          <svg viewBox="0 0 14 14" fill="currentColor">
                              <path d="M3 4h8M5 4v6M9 4v6M3 4l1 8h6l1-8" stroke="currentColor" stroke-width="1.2"/>
                          </svg>
                      </button>
                  </div>
              </div>
              
              <h4 class="task-title">${task.title}</h4>
              ${task.description ? `<p class="task-description">${task.description}</p>` : ''}
              
              <div class="task-meta">
                  <span class="task-status" style="color: ${status.color};">${status.label}</span>
                  ${task.estimated_hours ? `
                      <span class="task-hours">
                          <svg viewBox="0 0 12 12" fill="currentColor">
                              <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1" fill="none"/>
                              <path d="M6 3.5v2.5l1.5 1.5" stroke="currentColor" stroke-width="1" fill="none"/>
                          </svg>
                          ${task.estimated_hours} ч
                      </span>
                  ` : ''}
                  ${task.due_date ? `
                      <span class="task-due ${isOverdue ? 'overdue' : ''}">
                          <svg viewBox="0 0 12 12" fill="currentColor">
                              <rect x="2" y="3" width="8" height="7" rx="1" stroke="currentColor" stroke-width="1" fill="none"/>
                              <path d="M3 2v2M9 2v2M3 5h6" stroke="currentColor" stroke-width="1"/>
                          </svg>
                          ${formatDate(task.due_date)}
                      </span>
                  ` : ''}
              </div>
              
              <div class="task-footer">
                  <select class="task-worker-select" onchange="assignTaskToWorker(${task.id}, this.value)">
                      <option value="">Не назначен</option>
                      ${workers.map(w => `
                          <option value="${w.id}" ${task.assigned_worker_id === w.id ? 'selected' : ''}>
                              ${w.name}
                          </option>
                      `).join('')}
                  </select>
                  
                  ${task.status !== 'completed' ? `
                      <button class="task-complete-btn" onclick="completeBrigadeTask(${task.id}, ${brigadeId})">
                          ✅ Завершить
                      </button>
                  ` : ''}
              </div>
          </div>
      `;
  }).join('');
  
  container.innerHTML = `
      ${statsHtml}
      <div class="tasks-header-actions">
          <button class="btn btn-primary btn-sm" onclick="openBrigadeTaskModal(${brigadeId})">
              ➕ Новая задача
          </button>
          <button class="btn btn-outline btn-sm" onclick="openScheduleModal(${brigadeId})">
              📅 Расписание
          </button>
      </div>
      <div class="tasks-list">
          ${tasksHtml}
      </div>
  `;
}


// Модальное окно задачи
function openBrigadeTaskModal(brigadeId, task = null) {
  closeAllModals();
  const DOM = getDOM();
  const workers = AdminState.workers.filter(w => w.brigade_id === brigadeId);
  
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'brigadeTaskModal';
  modal.style.display = 'block';
  modal.style.width = '550px';
  
  modal.innerHTML = `
      <div class="modal-header">
          <h3>${task ? '✏️ Редактировать' : '➕ Новая'} задача</h3>
          <button class="modal-close" onclick="closeAllModals()">&times;</button>
      </div>
      <div class="modal-body">
          <input type="hidden" id="taskBrigadeId" value="${brigadeId}">
          
          <div class="form-group">
              <label>Название *</label>
              <input type="text" id="taskTitle" class="input" value="${task?.title || ''}" placeholder="Название задачи">
          </div>
          
          <div class="form-group">
              <label>Описание</label>
              <textarea id="taskDesc" class="input" rows="3" placeholder="Детали задачи...">${task?.description || ''}</textarea>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="form-group">
                  <label>Тип задачи</label>
                  <select id="taskType" class="input">
                      <option value="main" ${task?.task_type === 'main' ? 'selected' : ''}>🔴 Основная</option>
                      <option value="secondary" ${task?.task_type === 'secondary' ? 'selected' : ''}>🟡 Побочная</option>
                      <option value="optional" ${task?.task_type === 'optional' ? 'selected' : ''}>🔵 Дополнительная</option>
                  </select>
              </div>
              <div class="form-group">
                  <label>Приоритет</label>
                  <select id="taskPriority" class="input">
                      <option value="low" ${task?.priority === 'low' ? 'selected' : ''}>🔹 Низкий</option>
                      <option value="medium" ${task?.priority === 'medium' ? 'selected' : ''} selected>📌 Средний</option>
                      <option value="high" ${task?.priority === 'high' ? 'selected' : ''}>⭐ Высокий</option>
                      <option value="critical" ${task?.priority === 'critical' ? 'selected' : ''}>🔥 Критический</option>
                  </select>
              </div>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="form-group">
                  <label>Срок выполнения (ДД)</label>
                  <input type="date" id="taskDueDate" class="input" value="${task?.due_date || ''}">
              </div>
              <div class="form-group">
                  <label>Оценка времени (часы)</label>
                  <input type="number" id="taskHours" class="input" step="0.5" min="0" value="${task?.estimated_hours || 0}">
              </div>
          </div>
          
          <div class="form-group">
              <label>Назначить на</label>
              <select id="taskAssigned" class="input">
                  <option value="">— Не назначен —</option>
                  ${workers.map(w => `<option value="${w.id}" ${task?.assigned_worker_id === w.id ? 'selected' : ''}>${w.name} (${w.position || 'Рабочий'})</option>`).join('')}
              </select>
          </div>
          
          ${task ? `
              <div class="form-group">
                  <label>Статус</label>
                  <select id="taskStatus" class="input">
                      <option value="pending" ${task?.status === 'pending' ? 'selected' : ''}>⏳ Ожидает</option>
                      <option value="in_progress" ${task?.status === 'in_progress' ? 'selected' : ''}>🔄 В работе</option>
                      <option value="completed" ${task?.status === 'completed' ? 'selected' : ''}>✅ Завершено</option>
                      <option value="blocked" ${task?.status === 'blocked' ? 'selected' : ''}>🚫 Заблокировано</option>
                  </select>
              </div>
              ${task?.status === 'completed' ? `
                  <div class="form-group">
                      <label>Фактическое время (часы)</label>
                      <input type="number" id="taskActualHours" class="input" step="0.5" min="0" value="${task?.actual_hours || task?.estimated_hours || 0}">
                  </div>
              ` : ''}
          ` : ''}
      </div>
      <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeAllModals()">Отмена</button>
          <button class="btn btn-primary" onclick="saveBrigadeTask(${task?.id || 'null'})">
              ${task ? '💾 Сохранить' : '➕ Создать'}
          </button>
      </div>
  `;
  
  document.body.appendChild(modal);
  DOM.modalOverlay.style.display = 'block';
  
  setTimeout(() => document.getElementById('taskTitle')?.focus(), 100);
}


async function saveBrigadeTask(taskId) {
  const brigadeId = parseInt(document.getElementById('taskBrigadeId')?.value);
  const data = {
      brigade_id: brigadeId,
      title: document.getElementById('taskTitle')?.value?.trim(),
      description: document.getElementById('taskDesc')?.value?.trim() || '',
      task_type: document.getElementById('taskType')?.value || 'main',
      priority: document.getElementById('taskPriority')?.value || 'medium',
      assigned_worker_id: parseInt(document.getElementById('taskAssigned')?.value) || null,
      due_date: document.getElementById('taskDueDate')?.value || null,
      estimated_hours: parseFloat(document.getElementById('taskHours')?.value) || 0
  };
  
  if (!data.title) {
      alert('Введите название задачи');
      return;
  }
  
  if (taskId && taskId !== 'null') {
      const statusSelect = document.getElementById('taskStatus');
      if (statusSelect) {
          data.status = statusSelect.value;
      }
      const actualHours = document.getElementById('taskActualHours');
      if (actualHours) {
          data.actual_hours = parseFloat(actualHours.value) || 0;
      }
  }
  
  try {
      if (taskId && taskId !== 'null') {
          await api.put(`/brigade-tasks/${taskId}`, data);
          showNotification('✅ Успех', 'Задача обновлена', 'success');
      } else {
          await api.post('/brigade-tasks', data);
          showNotification('✅ Успех', 'Задача создана', 'success');
      }
      closeAllModals();
      await loadBrigadeTasks(brigadeId);
      await loadAllData();
  } catch (e) {
      alert('Ошибка: ' + e.message);
  }
}


window.editBrigadeTask = editBrigadeTask;

async function completeBrigadeTask(taskId, brigadeId) {
  try {
      await api.put(`/brigade-tasks/${taskId}`, { status: 'completed' });
      showNotification('✅ Успех', 'Задача завершена', 'success');
      await loadBrigadeTasks(brigadeId);
      await loadAllData();
  } catch (e) {
      alert('Ошибка: ' + e.message);
  }
}


async function deleteBrigadeTask(taskId, brigadeId) {
  if (!confirm('Удалить задачу?')) return;
  try {
      await api.delete(`/brigade-tasks/${taskId}`);
      await loadBrigadeTasks(brigadeId);
      await loadAllData();
  } catch (e) {
      alert('Ошибка: ' + e.message);
  }
}


async function assignTaskToWorker(taskId, workerId) {
  try {
      await api.put(`/brigade-tasks/${taskId}`, { assigned_worker_id: workerId ? parseInt(workerId) : null });
  } catch (e) {
      console.error(e);
  }
}

function openScheduleModal(brigadeId) {
  closeAllModals();
  const DOM = getDOM();
  const today = new Date().toISOString().split('T')[0];
  
  const modal = document.createElement('div');
  modal.className = 'modal schedule-modal';
  modal.id = 'scheduleModal';
  modal.style.display = 'block';
  modal.style.width = '700px';
  modal.style.maxHeight = '85vh';
  
  modal.innerHTML = `
      <div class="modal-header">
          <h3>📅 Расписание бригады</h3>
          <button class="modal-close" onclick="closeAllModals()">&times;</button>
      </div>
      <div class="modal-body">
          <div class="schedule-controls">
              <input type="date" id="scheduleDate" class="input" value="${today}" onchange="loadScheduleForDate(${brigadeId})">
              <button class="btn btn-primary btn-sm" onclick="openScheduleTaskModal(${brigadeId})">
                  ➕ Добавить в расписание
              </button>
          </div>
          <div id="scheduleContent">
              <div class="loading-spinner"></div>
          </div>
      </div>
      <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeAllModals()">Закрыть</button>
      </div>
  `;
  
  document.body.appendChild(modal);
  DOM.modalOverlay.style.display = 'block';
  
  loadScheduleForDate(brigadeId);
}
async function loadScheduleForDate(brigadeId) {
  const container = document.getElementById('scheduleContent');
  if (!container) return;
  
  const dateInput = document.getElementById('scheduleDate');
  const date = dateInput?.value || new Date().toISOString().split('T')[0];
  
  try {
      const tasks = await api.get(`/brigade-schedule/${brigadeId}?date=${date}`);
      const workers = AdminState.workers.filter(w => w.brigade_id === brigadeId);
      
      if (!tasks.length) {
          container.innerHTML = `
              <div class="empty-schedule">
                  <svg viewBox="0 0 40 40" fill="none">
                      <rect x="4" y="6" width="32" height="28" rx="3" stroke="#cbd5e1" stroke-width="1.5"/>
                      <path d="M10 4v4M30 4v4M6 12h28" stroke="#cbd5e1" stroke-width="1.5"/>
                      <circle cx="20" cy="20" r="3" stroke="#cbd5e1" stroke-width="1.5"/>
                      <path d="M20 23v4" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                  <p>Нет задач на ${formatDate(date)}</p>
                  <button class="btn btn-outline btn-sm" onclick="openScheduleTaskModal(${brigadeId})">
                      ➕ Добавить задачу
                  </button>
              </div>
          `;
          return;
      }
      
      const priorityConfig = {
          critical: { color: '#ef4444', bg: '#fef2f2' },
          high: { color: '#f59e0b', bg: '#fffbeb' },
          medium: { color: '#0961f6', bg: '#eff6ff' },
          low: { color: '#10b981', bg: '#f0fdf4' }
      };
      
      container.innerHTML = `
          <div class="schedule-tasks-list">
              ${tasks.map(task => {
                  const priority = priorityConfig[task.priority] || priorityConfig.medium;
                  const assignedWorker = workers.find(w => w.id === task.assigned_worker_id);
                  const isCompleted = task.status === 'completed';
                  
                  return `
                      <div class="schedule-task-item ${isCompleted ? 'completed' : ''}">
                          <div class="task-priority-indicator" style="background: ${priority.color};"></div>
                          <div class="task-content">
                              <div class="task-header">
                                  <h4>${task.title}</h4>
                                  <span class="task-time">${task.estimated_hours} ч</span>
                              </div>
                              ${task.description ? `<p>${task.description}</p>` : ''}
                              <div class="task-footer">
                                  <span>👤 ${assignedWorker?.name || 'Не назначен'}</span>
                                  <span>📋 ${task.status === 'completed' ? '✅ Выполнено' : '⏳ В работе'}</span>
                              </div>
                          </div>
                          <div class="task-actions">
                              ${!isCompleted ? `
                                  <button class="btn-icon-sm" onclick="completeScheduleTask(${task.id}, ${brigadeId})" title="Завершить">✅</button>
                              ` : ''}
                              <button class="btn-icon-sm" onclick="deleteScheduleTask(${task.id}, ${brigadeId})" title="Удалить">🗑️</button>
                          </div>
                      </div>
                  `;
              }).join('')}
          </div>
      `;
      
  } catch (e) {
      container.innerHTML = `<p style="color:#ef4444;">Ошибка загрузки расписания</p>`;
  }
}

// Экспорт функций
// window.loadBrigadeTasks = loadBrigadeTasks;
// window.openBrigadeTaskModal = openBrigadeTaskModal;
// window.saveBrigadeTask = saveBrigadeTask;
window.completeBrigadeTask = completeBrigadeTask;
// window.deleteBrigadeTask = deleteBrigadeTask;
// window.assignTaskToWorker = assignTaskToWorker;
window.openScheduleModal = openScheduleModal;
window.loadScheduleForDate = loadScheduleForDate;
// Исправленное назначение бригадира (ТОЛЬКО ОДИН)
async function assignAsBrigadier(workerId, brigadeId) {
    try {
        await api.post('/workers/assign-brigadier', { 
            worker_id: workerId, 
            brigade_id: brigadeId 
        });
        showNotification('👑 Успех', 'Бригадир назначен', 'success');
        await loadAllData();
    } catch (e) {
        showNotification('❌ Ошибка', e.message, 'error');
    }
}

// Исправленное удаление рабочего из бригады
async function removeWorkerFromBrigade(workerId) {
    try {
        await api.put(`/workers/${workerId}`, { 
            brigade_id: null, 
            is_brigadier: false 
        });
        showNotification('✅ Успех', 'Рабочий убран из бригады', 'success');
        await loadAllData();
    } catch (e) {
        showNotification('❌ Ошибка', e.message, 'error');
    }
}   

// Исправленное добавление рабочего в бригаду
// async function addWorkerToBrigade(brigadeId) {
//     const available = AdminState.workers.filter(w => !w.brigade_id);
//     if (!available.length) { 
//         alert('Нет свободных рабочих'); 
//         return; 
//     }
    
//     const workerId = prompt('Выберите рабочего (введите ID):\n' + 
//         available.map(w => `${w.id}: ${w.name} (${w.position || 'Рабочий'})`).join('\n'));
    
//     if (workerId) {
//         try {
//             await api.put(`/workers/${workerId}`, { brigade_id: brigadeId });
//             await loadAllData();
//             showNotification('✅ Успех', 'Рабочий добавлен', 'success');
//         } catch (e) {
//             alert('Ошибка: ' + e.message);
//         }
//     }
// }


function openBrigadeGroupsModal() {
    closeAllModals();
    const DOM = getDOM();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'brigadeGroupsModal';
    modal.style.display = 'block';
    modal.style.width = '600px';
    
    modal.innerHTML = `
        <div class="modal-header">
            <h3>👥 Группы бригад</h3>
            <button class="modal-close" onclick="closeAllModals()">&times;</button>
        </div>
        <div class="modal-body">
            <div style="margin-bottom:20px;">
                <button class="btn btn-primary btn-sm" onclick="createBrigadeGroup()">
                    + Создать группу
                </button>
            </div>
            <div id="brigadeGroupsList">
                Загрузка...
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-outline" onclick="closeAllModals()">Закрыть</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    DOM.modalOverlay.style.display = 'block';
    
    loadBrigadeGroups();
}

// ================================================================
// ГРУППЫ БРИГАД
// ================================================================

// Кэш групп бригад
let brigadeGroupsCache = [];

async function loadBrigadeGroups() {
  const container = document.getElementById('brigadeGroupsContainer');
  if (!container) return;
  
  try {
      showLoading('Загрузка групп бригад...');
      
      const groups = await api.get('/brigade-groups');
      
      // Загружаем бригады для каждой группы и считаем рабочих
      const enrichedGroups = [];
      
      for (const group of groups) {
          try {
              const brigades = await api.get(`/brigade-groups/${group.id}/brigades`);
              
              // Обогащаем бригады информацией о рабочих
              const enrichedBrigades = brigades.map(brigade => {
                  const workers = AdminState.workers.filter(w => w.brigade_id === brigade.id);
                  const brigadier = workers.find(w => w.is_brigadier);
                  
                  return {
                      ...brigade,
                      workers: workers,
                      workers_count: workers.length,
                      brigadier: brigadier,
                      max_capacity: brigade.max_capacity || 10
                  };
              });
              
              // Считаем общее количество рабочих в группе
              const totalWorkers = enrichedBrigades.reduce((sum, b) => sum + b.workers_count, 0);
              const totalCapacity = enrichedBrigades.reduce((sum, b) => sum + (b.max_capacity || 10), 0);
              
              enrichedGroups.push({
                  ...group,
                  brigades: enrichedBrigades,
                  brigades_count: enrichedBrigades.length,
                  total_workers: totalWorkers,
                  total_capacity: totalCapacity,
                  occupancy_rate: totalCapacity > 0 ? Math.round((totalWorkers / totalCapacity) * 100) : 0
              });
              
          } catch (e) {
              console.error(`Ошибка загрузки бригад для группы ${group.id}:`, e);
              enrichedGroups.push({
                  ...group,
                  brigades: [],
                  brigades_count: 0,
                  total_workers: 0,
                  total_capacity: 0,
                  occupancy_rate: 0
              });
          }
      }
      
      brigadeGroupsCache = enrichedGroups;
      
      if (!enrichedGroups.length) {
          renderEmptyGroupsState(container);
          return;
      }
      
      renderBrigadeGroupsGrid(container, enrichedGroups);
      
  } catch (error) {
      console.error('Failed to load brigade groups:', error);
      container.innerHTML = `
          <div class="groups-error-state">
              <svg viewBox="0 0 60 60" fill="none">
                  <circle cx="30" cy="30" r="20" stroke="#ef4444" stroke-width="2"/>
                  <path d="M20 20L40 40M40 20L20 40" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <h3>Ошибка загрузки групп</h3>
              <p>${error.message}</p>
              <button class="btn btn-primary" onclick="loadBrigadeGroups()">Повторить</button>
          </div>
      `;
  } finally {
      hideLoading();
  }
}

// Отрисовка пустого состояния
function renderEmptyGroupsState(container) {
  container.innerHTML = `
      <div class="groups-empty-state">
          <div class="empty-illustration">
              <svg viewBox="0 0 120 120" fill="none">
                  <circle cx="35" cy="35" r="20" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4 4"/>
                  <circle cx="85" cy="35" r="20" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4 4"/>
                  <circle cx="35" cy="85" r="20" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4 4"/>
                  <circle cx="85" cy="85" r="20" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4 4"/>
                  <path d="M55 35h10M35 55v10M85 55v10M55 85h10" stroke="#cbd5e1" stroke-width="2"/>
                  <circle cx="60" cy="60" r="15" stroke="#0961f6" stroke-width="2" stroke-dasharray="3 3"/>
                  <path d="M52 60h16M60 52v16" stroke="#0961f6" stroke-width="2" stroke-linecap="round"/>
              </svg>
          </div>
          <h3>Нет групп бригад</h3>
          <p>Создайте первую группу для объединения бригад и управления ими</p>
          <button class="btn btn-primary btn-lg" onclick="openCreateGroupModal()">
              <svg viewBox="0 0 20 20" fill="currentColor" width="18">
                  <path d="M10 4V16M4 10H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              Создать группу
          </button>
      </div>
  `;
}

// Отрисовка сетки групп бригад
function renderBrigadeGroupsGrid(container, groups) {
  let html = `
      <div class="groups-header">
          <div class="groups-stats">
              <div class="stat-badge">
                  <span class="stat-value">${groups.length}</span>
                  <span class="stat-label">групп</span>
              </div>
              <div class="stat-badge">
                  <span class="stat-value">${groups.reduce((sum, g) => sum + g.brigades_count, 0)}</span>
                  <span class="stat-label">бригад</span>
              </div>
              <div class="stat-badge">
                  <span class="stat-value">${groups.reduce((sum, g) => sum + g.total_workers, 0)}</span>
                  <span class="stat-label">рабочих</span>
              </div>
          </div>
          <button class="btn btn-primary" onclick="openCreateGroupModal()">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16">
                  <path d="M10 4V16M4 10H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              Новая группа
          </button>
      </div>
      <div class="groups-grid">
  `;
  
  groups.forEach(group => {
      html += renderSingleGroupCard(group);
  });
  
  html += '</div>';
  container.innerHTML = html;
}

// Отрисовка карточки группы
function renderSingleGroupCard(group) {
  const occupancyClass = group.occupancy_rate > 80 ? 'high' : 
                        group.occupancy_rate > 50 ? 'medium' : 'low';
  
  // Бригады с наибольшим количеством рабочих для превью
  const topBrigades = [...group.brigades]
      .sort((a, b) => b.workers_count - a.workers_count)
      .slice(0, 3);
  
  return `
      <div class="group-card" data-group-id="${group.id}">
          <!-- Заголовок карточки -->
          <div class="group-card-header">
              <div class="group-icon">
                  <svg viewBox="0 0 24 24" fill="none">
                      <!-- Иконка группы бригад - три бригады вместе -->
                      <circle cx="7" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/>
                      <circle cx="17" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/>
                      <circle cx="12" cy="16" r="4" stroke="currentColor" stroke-width="1.5"/>
                      <path d="M11 8L13 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                      <path d="M7 12L10 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                      <path d="M17 12L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
              </div>
              <div class="group-title-section">
                  <h3 class="group-name">${group.name}</h3>
                  ${group.description ? `<p class="group-description">${group.description}</p>` : ''}
              </div>
              <div class="group-actions">
                  <button class="action-btn" onclick="editBrigadeGroup(${group.id})" title="Редактировать">
                      <svg viewBox="0 0 18 18" fill="currentColor">
                          <path d="M13 2L16 5L7 14H4V11L13 2Z" stroke="currentColor" stroke-width="1.5" fill="none"/>
                      </svg>
                  </button>
                  <button class="action-btn danger" onclick="deleteBrigadeGroup(${group.id})" title="Удалить">
                      <svg viewBox="0 0 18 18" fill="currentColor">
                          <path d="M3 5H15M7 7V11M11 7V11M4 5L5 15H13L14 5H4Z" stroke="currentColor" stroke-width="1.5"/>
                      </svg>
                  </button>
              </div>
          </div>
          
          <!-- Статистика группы -->
          <div class="group-stats-panel">
              <div class="stat-item">
                  <div class="stat-icon brigades">
                      <svg viewBox="0 0 16 16" fill="currentColor">
                          <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
                          <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
                          <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
                          <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
                      </svg>
                  </div>
                  <div class="stat-content">
                      <span class="stat-number">${group.brigades_count}</span>
                      <span class="stat-text">бригад</span>
                  </div>
              </div>
              <div class="stat-item">
                  <div class="stat-icon workers">
                      <svg viewBox="0 0 16 16" fill="currentColor">
                          <circle cx="6" cy="5" r="2.5" stroke="currentColor" stroke-width="1.2" fill="none"/>
                          <circle cx="11" cy="5" r="2.5" stroke="currentColor" stroke-width="1.2" fill="none"/>
                          <path d="M2 14v-1.5c0-2 2-3 4-3h4c2 0 4 1 4 3V14" stroke="currentColor" stroke-width="1.2" fill="none"/>
                      </svg>
                  </div>
                  <div class="stat-content">
                      <span class="stat-number">${group.total_workers}</span>
                      <span class="stat-text">рабочих</span>
                  </div>
              </div>
              <div class="stat-item">
                  <div class="stat-icon capacity">
                      <svg viewBox="0 0 16 16" fill="currentColor">
                          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.2" fill="none"/>
                          <path d="M8 4v8M4 8h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                      </svg>
                  </div>
                  <div class="stat-content">
                      <span class="stat-number">${group.occupancy_rate}%</span>
                      <span class="stat-text">заполнено</span>
                  </div>
              </div>
          </div>
          
          <!-- Прогресс-бар заполненности -->
          <div class="group-capacity-bar">
              <div class="capacity-fill ${occupancyClass}" style="width: ${group.occupancy_rate}%"></div>
              <span class="capacity-label">${group.total_workers} / ${group.total_capacity} мест</span>
          </div>
          
          <!-- Список бригад -->
          <div class="group-brigades-section">
              <div class="section-header">
                  <h4>Бригады в группе</h4>
                  <span class="badge">${group.brigades_count}</span>
              </div>
              
              ${group.brigades.length > 0 ? `
                  <div class="brigades-list">
                      ${topBrigades.map(brigade => renderBrigadeInGroup(brigade)).join('')}
                      ${group.brigades.length > 3 ? `
                          <div class="more-brigades" onclick="manageGroupBrigades(${group.id})">
                              + ещё ${group.brigades.length - 3} бригад
                          </div>
                      ` : ''}
                  </div>
              ` : `
                  <div class="no-brigades">
                      <svg viewBox="0 0 40 40" fill="none">
                          <rect x="8" y="8" width="24" height="24" rx="4" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="3 3"/>
                          <path d="M16 20h8M20 16v8" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/>
                      </svg>
                      <p>Нет бригад</p>
                      <button class="btn-link" onclick="manageGroupBrigades(${group.id})">Добавить бригады</button>
                  </div>
              `}
          </div>
          
          <!-- Действия с группой -->
          <div class="group-card-footer">
              <button class="btn btn-outline btn-sm" onclick="manageGroupBrigades(${group.id})">
                  <svg viewBox="0 0 16 16" fill="currentColor">
                      <path d="M3 8h10M8 3v10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                  Управление
              </button>
              <button class="btn btn-outline btn-sm" onclick="viewGroupSchedule(${group.id})">
                  <svg viewBox="0 0 16 16" fill="currentColor">
                      <rect x="2" y="4" width="12" height="10" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
                      <path d="M5 2v3M11 2v3M3 7h10" stroke="currentColor" stroke-width="1.2"/>
                  </svg>
                  Расписание
              </button>
          </div>
      </div>
  `;
}


// Отрисовка бригады внутри группы
function renderBrigadeInGroup(brigade) {
  const brigadier = brigade.brigadier;
  const loadClass = brigade.current_load > 80 ? 'high' : 
                   brigade.current_load > 50 ? 'medium' : 'low';
  
  return `
      <div class="group-brigade-item" onclick="highlightBrigadeInGroup(${brigade.id})">
          <div class="brigade-info">
              <div class="brigade-name-section">
                  <span class="brigade-name">${brigade.name}</span>
                  ${brigadier ? `<span class="brigadier-badge" title="Бригадир: ${brigadier.name}">👑</span>` : ''}
              </div>
              <div class="brigade-meta">
                  <span class="workers-count">
                      <svg viewBox="0 0 12 12" fill="currentColor">
                          <circle cx="4" cy="4" r="2" stroke="currentColor" stroke-width="1" fill="none"/>
                          <circle cx="8" cy="4" r="2" stroke="currentColor" stroke-width="1" fill="none"/>
                      </svg>
                      ${brigade.workers_count} / ${brigade.max_capacity}
                  </span>
                  <span class="load-indicator ${loadClass}">
                      ${Math.round(brigade.current_load || 0)}%
                  </span>
              </div>
          </div>
          <div class="brigade-progress-mini">
              <div class="progress-fill-mini" style="width: ${brigade.current_load || 0}%"></div>
          </div>
      </div>
  `;
}

// Подсветка бригады при клике
function highlightBrigadeInGroup(brigadeId) {
  switchTab('brigades');
  
  setTimeout(() => {
      const brigadeCard = document.querySelector(`.brigade-card[data-brigade-id="${brigadeId}"]`);
      if (brigadeCard) {
          brigadeCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          brigadeCard.classList.add('highlight-pulse');
          setTimeout(() => brigadeCard.classList.remove('highlight-pulse'), 2000);
      }
  }, 100);
}


function openCreateGroupModal(group = null) {
    closeAllModals();
    const DOM = getDOM();
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'brigadeGroupModal';
    modal.style.display = 'block';
    modal.style.width = '500px';
    
    modal.innerHTML = `
        <div class="modal-header">
            <h3>${group ? 'Редактировать' : 'Создать'} группу бригад</h3>
            <button class="modal-close" onclick="closeAllModals()">&times;</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label>Название группы *</label>
                <input type="text" id="groupName" class="input" value="${group?.name || ''}" placeholder="Например: Сборочный комплекс">
            </div>
            <div class="form-group">
                <label>Описание</label>
                <textarea id="groupDesc" class="input" rows="3" placeholder="Описание группы...">${group?.description || ''}</textarea>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-outline" onclick="closeAllModals()">Отмена</button>
            <button class="btn btn-primary" onclick="saveBrigadeGroup(${group?.id || 'null'})">
                ${group ? 'Сохранить' : 'Создать'}
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
    DOM.modalOverlay.style.display = 'block';
}

// window.openCreateGroupModal = openCreateGroupModal;

// ================================================================
// СОХРАНЕНИЕ ГРУППЫ БРИГАД
// ================================================================

// Обновление групп бригад при создании/редактировании
async function saveBrigadeGroup(id) {
  const name = document.getElementById('groupName')?.value?.trim();
  const description = document.getElementById('groupDesc')?.value?.trim();
  
  if (!name) {
      alert('Введите название группы');
      return;
  }
  
  const data = { name, description };
  
  try {
      if (id && id !== 'null') {
          await api.put(`/brigade-groups/${id}`, data);
          showNotification('✅ Успех', 'Группа обновлена', 'success');
      } else {
          await api.post('/brigade-groups', data);
          showNotification('✅ Успех', 'Группа создана', 'success');
      }
      closeAllModals();
      
      // Обновляем список групп
      await loadBrigadeGroups();
      
  } catch (e) {
      alert('Ошибка: ' + e.message);
  }
}

// ================================================================
// ГЛОБАЛЬНЫЕ ФУНКЦИИ (ДОБАВИТЬ saveBrigadeGroup)
// ================================================================

// window.saveBrigadeGroup = saveBrigadeGroup;
window.editBrigadeGroup = async (id) => {
    const groups = await api.get('/brigade-groups');
    const group = groups.find(g => g.id === id);
    if (group) openCreateGroupModal(group);
};

// Вместо prompt - модальное окно выбора
// Добавление рабочего в бригаду (модальное окно)
// function addWorkerToBrigade(brigadeId) {
//     const available = AdminState.workers.filter(w => !w.brigade_id);
//     if (!available.length) { 
//         showNotification('Внимание', 'Нет свободных рабочих', 'warning'); 
//         return; 
//     }
    
//     closeAllModals();
//     const DOM = getDOM();
//     const modal = document.createElement('div');
//     modal.className = 'modal';
//     modal.id = 'workerSelectModal';
//     modal.style.display = 'block';
//     modal.style.width = '400px';
    
//     modal.innerHTML = `
//         <div class="modal-header">
//             <h3>Выберите рабочего</h3>
//             <button class="modal-close" onclick="closeAllModals()">&times;</button>
//         </div>
//         <div class="modal-body" style="max-height:400px;overflow-y:auto;">
//             ${available.map(w => `
//                 <div style="padding:10px;margin-bottom:8px;background:#f8f9fa;border-radius:8px;cursor:pointer;border:1px solid #e5e7eb;"
//                      onclick="selectWorkerForBrigade(${w.id}, ${brigadeId})">
//                     <strong>${w.name}</strong>
//                     <div style="font-size:12px;color:#666;">${w.position || 'Рабочий'}</div>
//                     ${w.skills?.length ? `<div style="margin-top:4px;">${w.skills.map(s => `<span style="background:#e5e7eb;padding:2px 6px;border-radius:12px;font-size:10px;margin-right:4px;">${s}</span>`).join('')}</div>` : ''}
//                 </div>
//             `).join('')}
//         </div>
//         <div class="modal-footer">
//             <button class="btn btn-outline" onclick="closeAllModals()">Отмена</button>
//         </div>
//     `;
    
//     document.body.appendChild(modal);
//     DOM.modalOverlay.style.display = 'block';
// }


// Выбор рабочего из модального окна
async function selectWorkerForBrigade(workerId, brigadeId) {
    try {
        await api.put(`/workers/${workerId}`, { brigade_id: brigadeId });
        closeAllModals();
        await loadAllData();
        showNotification('✅ Успех', 'Рабочий добавлен в бригаду', 'success');
    } catch (e) {
        closeAllModals();
        alert('Ошибка: ' + e.message);
    }
}

// Drag & Drop
window.handleWorkerDragStart = (e, workerId) => {
    AdminState.draggedWorkerId = workerId;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
};

window.handleWorkerDragEnd = (e) => {
    e.target.classList.remove('dragging');
    document.querySelectorAll('.brigade-card').forEach(c => c.classList.remove('drag-over'));
};

window.handleBrigadeDrop = async (e, brigadeId) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const workerId = AdminState.draggedWorkerId;
    if (!workerId) return;
    
    try {
        await api.put(`/workers/${workerId}`, { brigade_id: brigadeId });
        showNotification('✅ Успех', 'Рабочий переведён', 'success');
        await loadAllData();
    } catch (error) {
        showNotification('❌ Ошибка', error.message, 'error');
    }
    AdminState.draggedWorkerId = null;
};

// async function selectWorkerForBrigade(workerId, brigadeId) {
//     try {
//         await api.put(`/workers/${workerId}`, { brigade_id: brigadeId });
//         closeAllModals();
//         await loadAllData();
//         showNotification('✅ Успех', 'Рабочий добавлен в бригаду', 'success');
//     } catch (e) {
//         alert('Ошибка: ' + e.message);
//     }
// }

// window.addWorkerToBrigade = addWorkerToBrigade;
// window.selectWorkerForBrigade = selectWorkerForBrigade;

// async function selectWorkerForBrigade(workerId, brigadeId) {
//     try {
//         await api.put(`/workers/${workerId}`, { brigade_id: brigadeId });
//         closeAllModals();
//         await loadAllData();
//         showNotification('✅ Успех', 'Рабочий добавлен в бригаду', 'success');
//     } catch (e) {
//         alert('Ошибка: ' + e.message);
//     }
// }

// async function selectWorkerForBrigade(workerId, brigadeId) {
//     try {
//         await api.put(`/workers/${workerId}`, { brigade_id: brigadeId });
//         closeAllModals();  // Закрываем модалку
//         await loadAllData();
//         showNotification('✅ Успех', 'Рабочий добавлен в бригаду', 'success');
//     } catch (e) {
//         closeAllModals();  // Закрываем даже при ошибке
//         alert('Ошибка: ' + e.message);
//     }
// }

window.selectWorkerForBrigade = selectWorkerForBrigade;

// Удаление группы бригад
async function deleteBrigadeGroup(id) {
  if (!confirm('Удалить группу бригад? Бригады не будут удалены.')) return;
  
  try {
      await api.delete(`/brigade-groups/${id}`);
      showNotification('✅ Успех', 'Группа удалена', 'success');
      await loadBrigadeGroups();
  } catch (error) {
      alert('Ошибка: ' + error.message);
  }
}

// Экспорт функций
window.loadBrigadeGroups = loadBrigadeGroups;
window.renderBrigadeGroupsGrid = renderBrigadeGroupsGrid;
window.saveBrigadeGroup = saveBrigadeGroup;
// window.deleteBrigadeGroup = deleteBrigadeGroup;
window.highlightBrigadeInGroup = highlightBrigadeInGroup;


async function manageGroupBrigades(groupId) {
  closeAllModals();
  const DOM = getDOM();
  
  showLoading('Загрузка данных...');
  
  try {
      // Получаем все бригады и бригады группы
      const [allBrigades, groupBrigades] = await Promise.all([
          api.get('/brigades'),
          api.get(`/brigade-groups/${groupId}/brigades`)
      ]);
      
      console.log('📊 Все бригады:', allBrigades.length);
      console.log('📊 Бригады в группе:', groupBrigades.length);
      
      // Обогащаем бригады информацией о рабочих
      const enrichedAllBrigades = allBrigades.map(brigade => {
          const workers = AdminState.workers.filter(w => w.brigade_id === brigade.id);
          const brigadier = workers.find(w => w.is_brigadier);
          return {
              ...brigade,
              workers: workers,
              workers_count: workers.length,
              brigadier: brigadier,
              max_capacity: brigade.max_capacity || 10
          };
      });
      
      const enrichedGroupBrigades = groupBrigades.map(brigade => {
          const workers = AdminState.workers.filter(w => w.brigade_id === brigade.id);
          const brigadier = workers.find(w => w.is_brigadier);
          return {
              ...brigade,
              workers: workers,
              workers_count: workers.length,
              brigadier: brigadier,
              max_capacity: brigade.max_capacity || 10
          };
      });
      
      const groupBrigadeIds = enrichedGroupBrigades.map(b => b.id);
      const availableBrigades = enrichedAllBrigades.filter(b => !groupBrigadeIds.includes(b.id));
      
      console.log('✅ Бригады в группе:', groupBrigadeIds);
      console.log('✅ Доступные бригады:', availableBrigades.map(b => b.id));
      
      // Получаем информацию о группе
      const groups = await api.get('/brigade-groups');
      const group = groups.find(g => g.id === groupId);
      
      hideLoading();
      
      const modal = document.createElement('div');
      modal.className = 'modal group-management-modal';
      modal.id = 'manageGroupModal';
      modal.style.display = 'block';
      modal.style.width = '850px';
      modal.style.maxWidth = '95vw';
      modal.style.maxHeight = '85vh';
      
      modal.innerHTML = `
          <div class="modal-header group-modal-header">
              <div class="header-content">
                  <div class="group-icon-large">
                      <svg viewBox="0 0 24 24" fill="none">
                          <circle cx="7" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/>
                          <circle cx="17" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/>
                          <circle cx="12" cy="16" r="4" stroke="currentColor" stroke-width="1.5"/>
                          <path d="M11 8L13 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                      </svg>
                  </div>
                  <div>
                      <h3>${group?.name || 'Группа бригад'}</h3>
                      <p class="group-subtitle">Управление составом группы</p>
                  </div>
              </div>
              <button class="modal-close" onclick="closeAllModals()">&times;</button>
          </div>
          
          <div class="modal-body group-modal-body">
              <!-- Статистика -->
              <div class="group-summary-stats">
                  <div class="summary-stat">
                      <span class="summary-value">${enrichedGroupBrigades.length}</span>
                      <span class="summary-label">бригад в группе</span>
                  </div>
                  <div class="summary-stat">
                      <span class="summary-value">${enrichedGroupBrigades.reduce((sum, b) => sum + b.workers_count, 0)}</span>
                      <span class="summary-label">рабочих всего</span>
                  </div>
                  <div class="summary-stat">
                      <span class="summary-value">${enrichedGroupBrigades.reduce((sum, b) => sum + b.max_capacity, 0)}</span>
                      <span class="summary-label">мест всего</span>
                  </div>
              </div>
              
              <div class="management-columns">
                  <!-- Колонка: В группе -->
                  <div class="management-column">
                      <div class="column-header in-group">
                          <div class="header-left">
                              <span class="column-icon">✅</span>
                              <span>В группе</span>
                          </div>
                          <span class="column-count">${enrichedGroupBrigades.length}</span>
                      </div>
                      
                      <div class="brigades-list-container" id="inGroupList">
                          ${enrichedGroupBrigades.length ? enrichedGroupBrigades.map(brigade => `
                              <label class="brigade-select-item" data-brigade-id="${brigade.id}">
                                  <input type="checkbox" class="group-brigade-check" value="${brigade.id}">
                                  <div class="brigade-item-content">
                                      <div class="brigade-main-info">
                                          <span class="brigade-name">${brigade.name}</span>
                                          ${brigade.brigadier ? `<span class="brigadier-tag" title="Бригадир: ${brigade.brigadier.name}">👑</span>` : ''}
                                      </div>
                                      <div class="brigade-stats-row">
                                          <span class="workers-stat">
                                              <svg viewBox="0 0 12 12" fill="currentColor">
                                                  <circle cx="4" cy="4" r="2" stroke="currentColor" stroke-width="1" fill="none"/>
                                                  <circle cx="8" cy="4" r="2" stroke="currentColor" stroke-width="1" fill="none"/>
                                              </svg>
                                              ${brigade.workers_count} / ${brigade.max_capacity}
                                          </span>
                                          <span class="load-stat ${getLoadClass(brigade.current_load)}">
                                              ${Math.round(brigade.current_load || 0)}%
                                          </span>
                                      </div>
                                      <div class="progress-mini">
                                          <div class="progress-fill-mini" style="width: ${brigade.current_load || 0}%"></div>
                                      </div>
                                  </div>
                              </label>
                          `).join('') : `
                              <div class="empty-column-message">
                                  <svg viewBox="0 0 40 40" fill="none">
                                      <rect x="8" y="8" width="24" height="24" rx="4" stroke="#cbd5e1" stroke-width="1.5"/>
                                      <path d="M16 20h8" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/>
                                  </svg>
                                  <p>Нет бригад в группе</p>
                              </div>
                          `}
                      </div>
                      
                      ${enrichedGroupBrigades.length ? `
                          <button class="column-action-btn remove-btn" onclick="removeSelectedFromGroup(${groupId})">
                              <svg viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                              </svg>
                              Убрать выбранные
                          </button>
                      ` : ''}
                      
                      <button class="column-action-btn select-all-btn" onclick="selectAllInGroup()" style="margin-top: 8px; background: #f1f5f9; color: #475569;">
                          Выбрать все
                      </button>
                  </div>
                  
                  <!-- Колонка: Доступные -->
                  <div class="management-column">
                      <div class="column-header available">
                          <div class="header-left">
                              <span class="column-icon">➕</span>
                              <span>Доступные бригады</span>
                          </div>
                          <span class="column-count">${availableBrigades.length}</span>
                      </div>
                      
                      <div class="brigades-list-container" id="availableList">
                          ${availableBrigades.length ? availableBrigades.map(brigade => `
                              <label class="brigade-select-item" data-brigade-id="${brigade.id}">
                                  <input type="checkbox" class="available-brigade-check" value="${brigade.id}">
                                  <div class="brigade-item-content">
                                      <div class="brigade-main-info">
                                          <span class="brigade-name">${brigade.name}</span>
                                          ${brigade.brigadier ? `<span class="brigadier-tag" title="Бригадир: ${brigade.brigadier.name}">👑</span>` : ''}
                                      </div>
                                      <div class="brigade-stats-row">
                                          <span class="workers-stat">
                                              <svg viewBox="0 0 12 12" fill="currentColor">
                                                  <circle cx="4" cy="4" r="2" stroke="currentColor" stroke-width="1" fill="none"/>
                                                  <circle cx="8" cy="4" r="2" stroke="currentColor" stroke-width="1" fill="none"/>
                                              </svg>
                                              ${brigade.workers_count} / ${brigade.max_capacity}
                                          </span>
                                          <span class="load-stat ${getLoadClass(brigade.current_load)}">
                                              ${Math.round(brigade.current_load || 0)}%
                                          </span>
                                      </div>
                                      <div class="progress-mini">
                                          <div class="progress-fill-mini" style="width: ${brigade.current_load || 0}%"></div>
                                      </div>
                                  </div>
                              </label>
                          `).join('') : `
                              <div class="empty-column-message">
                                  <svg viewBox="0 0 40 40" fill="none">
                                      <rect x="8" y="8" width="24" height="24" rx="4" stroke="#cbd5e1" stroke-width="1.5"/>
                                      <path d="M16 20h8" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/>
                                  </svg>
                                  <p>Все бригады уже в группе</p>
                              </div>
                          `}
                      </div>
                      
                      ${availableBrigades.length ? `
                          <button class="column-action-btn add-btn" onclick="addSelectedToGroup(${groupId})">
                              <svg viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                              </svg>
                              Добавить выбранные
                          </button>
                      ` : ''}
                      
                      <button class="column-action-btn select-all-btn" onclick="selectAllAvailable()" style="margin-top: 8px; background: #f1f5f9; color: #475569;">
                          Выбрать все
                      </button>
                  </div>
              </div>
              
              <!-- Действия -->
              <div class="modal-actions-footer">
                  <button class="btn btn-outline btn-danger" onclick="disbandGroup(${groupId})">
                      <svg viewBox="0 0 16 16" fill="currentColor">
                          <path d="M2 4h12M5 4l1-2h4l1 2M6 8v4M10 8v4M4 4l1 10h6l1-10" stroke="currentColor" stroke-width="1.2"/>
                      </svg>
                      Расформировать группу
                  </button>
                  <div class="footer-right">
                      <button class="btn btn-outline" onclick="closeAllModals()">Отмена</button>
                      <button class="btn btn-primary" onclick="closeAllModals()">Готово</button>
                  </div>
              </div>
          </div>
      `;
      
      document.body.appendChild(modal);
      DOM.modalOverlay.style.display = 'block';
      
  } catch (error) {
      hideLoading();
      console.error('❌ Ошибка управления группой:', error);
      showNotification('Ошибка', error.message, 'error');
  }
}

async function manageBrigadeWorkers(brigadeId) {
    closeAllModals();
    showLoading('Загрузка состава...');
  
    try {
      const brigade = (AdminState.brigades || []).find(b => b.id === brigadeId)
        || (await api.getBrigades()).find(b => b.id === brigadeId);
      if (!brigade) throw new Error('Бригада не найдена');
  
      const allWorkers = AdminState.workers?.length
        ? AdminState.workers
        : await api.getWorkers();
  
      const inBrigade = allWorkers.filter(w => w.brigade_id === brigadeId);
      const available = allWorkers.filter(w => w.brigade_id !== brigadeId);
      const maxCap = brigade.max_capacity || 10;
      const load = Math.round(brigade.current_load || 0);
  
      hideLoading();
  
      const overlay = document.getElementById('modalOverlay');
      if (overlay) overlay.style.display = 'flex';
  
      document.getElementById('manageBrigadeWorkersModal')?.remove();
      const modal = document.createElement('div');
      modal.id = 'manageBrigadeWorkersModal';
      modal.className = 'modal group-management-modal';
      modal.style.cssText =
        'display:block;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'width:850px;max-width:95vw;max-height:85vh;background:#fff;border-radius:16px;' +
        'z-index:10001;box-shadow:0 25px 60px rgba(0,0,0,.25);overflow:hidden;' +
        'display:flex;flex-direction:column;';
  
      const row = (w, side) => {
        const cls = side === 'in' ? 'in-worker-check' : 'avail-worker-check';
        const sub = side === 'in'
          ? `${w.role || 'рабочий'}${w.is_brigadier ? ' · 👑 бригадир' : ''}`
          : `${w.role || 'рабочий'}${w.brigade_id ? ' · в другой бригаде' : ' · без бригады'}`;
        return `
          <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin:4px 0;
                        border-radius:10px;background:#fff;border:1px solid #eef2f7;cursor:pointer;">
            <input type="checkbox" class="${cls}" value="${w.id}">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:13px;color:#1e293b;">${w.name || '—'}</div>
              <div style="font-size:11px;color:#64748b;">${sub}</div>
            </div>
          </label>`;
      };
  
      modal.innerHTML = `
        <div style="padding:18px 22px;border-bottom:1px solid #eef2f7;display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:40px;height:40px;border-radius:12px;background:#0961f6;color:#fff;
                        display:flex;align-items:center;justify-content:center;font-weight:700;">
              ${(brigade.name || 'Б')[0]}
            </div>
            <div>
              <div style="font-weight:700;font-size:16px;color:#0f172a;">${brigade.name}</div>
              <div style="font-size:12px;color:#64748b;">Управление составом бригады</div>
            </div>
          </div>
          <button type="button" id="mbwClose" style="border:0;background:none;font-size:22px;cursor:pointer;color:#94a3b8;">×</button>
        </div>
  
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;padding:14px 22px;background:#f8fafc;border-bottom:1px solid #eef2f7;text-align:center;">
          <div><div style="font-size:22px;font-weight:700;color:#0961f6;">${inBrigade.length}</div><div style="font-size:11px;color:#64748b;letter-spacing:.04em;">В БРИГАДЕ</div></div>
          <div><div style="font-size:22px;font-weight:700;color:#0961f6;">${maxCap}</div><div style="font-size:11px;color:#64748b;letter-spacing:.04em;">МЕСТ МАКС.</div></div>
          <div><div style="font-size:22px;font-weight:700;color:#0961f6;">${load}%</div><div style="font-size:11px;color:#64748b;letter-spacing:.04em;">ЗАГРУЗКА</div></div>
        </div>
  
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px 22px;overflow:auto;flex:1;min-height:0;">
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:12px;display:flex;flex-direction:column;min-height:280px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <strong style="color:#166534;">В бригаде</strong>
              <span style="background:#fff;border-radius:20px;padding:2px 10px;font-size:12px;color:#166534;">${inBrigade.length}</span>
            </div>
            <div style="flex:1;overflow:auto;margin-bottom:10px;">
              ${inBrigade.length ? inBrigade.map(w => row(w, 'in')).join('') : '<p style="text-align:center;color:#94a3b8;padding:24px 8px;font-size:13px;">Нет сотрудников</p>'}
            </div>
            <button type="button" class="btn btn-outline btn-sm" style="border-color:#fecaca;color:#dc2626;"
                    onclick="removeSelectedFromBrigade(${brigadeId})">− Убрать выбранные</button>
            <button type="button" class="btn btn-outline btn-sm" style="margin-top:6px;"
                    onclick="document.querySelectorAll('.in-worker-check').forEach(c=>c.checked=true)">Выбрать все</button>
          </div>
  
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:12px;display:flex;flex-direction:column;min-height:280px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <strong style="color:#1d4ed8;">+ Доступные</strong>
              <span style="background:#fff;border-radius:20px;padding:2px 10px;font-size:12px;color:#1d4ed8;">${available.length}</span>
            </div>
            <input type="text" id="mbwSearch" class="input" placeholder="Поиск..." style="margin-bottom:8px;font-size:13px;">
            <div id="mbwAvailList" style="flex:1;overflow:auto;margin-bottom:10px;">
              ${available.length ? available.map(w => row(w, 'out')).join('') : '<p style="text-align:center;color:#94a3b8;padding:24px 8px;font-size:13px;">Нет доступных</p>'}
            </div>
            <button type="button" class="btn btn-primary btn-sm"
                    onclick="addSelectedToBrigade(${brigadeId})">+ Добавить выбранные</button>
            <button type="button" class="btn btn-outline btn-sm" style="margin-top:6px;"
                    onclick="document.querySelectorAll('.avail-worker-check').forEach(c=>c.checked=true)">Выбрать все</button>
          </div>
        </div>
  
        <div style="padding:14px 22px;border-top:1px solid #eef2f7;display:flex;justify-content:flex-end;gap:10px;">
          <button type="button" class="btn btn-outline" id="mbwCancel">Отмена</button>
          <button type="button" class="btn btn-primary" id="mbwDone">Готово</button>
        </div>`;
  
      document.body.appendChild(modal);
  
      const close = () => {
        modal.remove();
        if (overlay) overlay.style.display = 'none';
      };
      document.getElementById('mbwClose').onclick = close;
      document.getElementById('mbwCancel').onclick = close;
      document.getElementById('mbwDone').onclick = close;
  
      document.getElementById('mbwSearch').oninput = (e) => {
        const q = e.target.value.toLowerCase().trim();
        modal.querySelectorAll('#mbwAvailList label').forEach(lab => {
          const t = lab.textContent.toLowerCase();
          lab.style.display = !q || t.includes(q) ? 'flex' : 'none';
        });
      };
    } catch (e) {
      hideLoading();
      showNotification('Ошибка', e.message, 'error');
    }
  }
  
  window.manageBrigadeWorkers = manageBrigadeWorkers;

  async function addSelectedToBrigade(brigadeId) {
    const ids = [...document.querySelectorAll('.avail-worker-check:checked')]
      .map(c => parseInt(c.value, 10));
    if (!ids.length) {
      showNotification('Внимание', 'Выберите сотрудников', 'warning');
      return;
    }
    showLoading('Добавление...');
    let ok = 0;
    for (const id of ids) {
      try {
        await api.put(`/workers/${id}`, { brigade_id: brigadeId });
        ok++;
      } catch (_) {}
    }
    hideLoading();
    showNotification('Успех', `Добавлено: ${ok}`, 'success');
    await loadAllData();
    closeAllModals();
    setTimeout(() => manageBrigadeWorkers(brigadeId), 80);
  }
  window.addSelectedToBrigade = addSelectedToBrigade;
  
  async function removeSelectedFromBrigade(brigadeId) {
    const ids = [...document.querySelectorAll('.in-worker-check:checked')]
      .map(c => parseInt(c.value, 10));
    if (!ids.length) {
      showNotification('Внимание', 'Выберите сотрудников', 'warning');
      return;
    }
    showLoading('Удаление из бригады...');
    let ok = 0;
    for (const id of ids) {
      try {
        await api.put(`/workers/${id}`, { brigade_id: null });
        ok++;
      } catch (_) {}
    }
    hideLoading();
    showNotification('Успех', `Убрано: ${ok}`, 'success');
    await loadAllData();
    closeAllModals();
    setTimeout(() => manageBrigadeWorkers(brigadeId), 80);
  }
  window.removeSelectedFromBrigade = removeSelectedFromBrigade;
// Вспомогательные функции для выбора всех
function selectAllInGroup() {
  const checks = document.querySelectorAll('.group-brigade-check');
  checks.forEach(cb => cb.checked = true);
}
function selectAllAvailable() {
  const checks = document.querySelectorAll('.available-brigade-check');
  checks.forEach(cb => cb.checked = true);
}


// Вспомогательная функция для класса загрузки
function getLoadClass(load) {
  load = load || 0;
  if (load > 80) return 'high';
  if (load > 50) return 'medium';
  return 'low';
}

// Функции для работы с выбранными бригадами
async function addSelectedToGroup(groupId) {
  const checks = document.querySelectorAll('.available-brigade-check:checked');
  const ids = Array.from(checks).map(cb => parseInt(cb.value));
  
  console.log(`📤 Добавление бригад в группу ${groupId}:`, ids);
  
  if (!ids.length) { 
      showNotification('Внимание', 'Выберите бригады для добавления', 'warning'); 
      return; 
  }
  
  showLoading('Добавление бригад...');
  
  let successCount = 0;
  let errorCount = 0;
  
  try {
      for (const brigadeId of ids) {
          try {
              console.log(`  ➕ Добавление бригады ${brigadeId} в группу ${groupId}`);
              
              // Используем правильный формат запроса
              const response = await fetch(`${API_BASE}/brigade-groups/${groupId}/add-brigade?brigade_id=${brigadeId}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' }
              });
              
              if (response.ok) {
                  successCount++;
                  console.log(`  ✅ Бригада ${brigadeId} добавлена`);
              } else {
                  const error = await response.json().catch(() => ({}));
                  console.error(`  ❌ Ошибка добавления бригады ${brigadeId}:`, error);
                  errorCount++;
              }
          } catch (e) {
              console.error(`  ❌ Исключение при добавлении ${brigadeId}:`, e);
              errorCount++;
          }
      }
      
      if (successCount > 0) {
          showNotification('✅ Успех', `Добавлено ${successCount} бригад`, 'success');
      }
      if (errorCount > 0) {
          showNotification('⚠️ Внимание', `Не удалось добавить ${errorCount} бригад`, 'warning');
      }
      
      closeAllModals();
      
      // Обновляем данные
      await loadAllData();
      await loadBrigadeGroups();
      
      // Открываем модалку заново с обновлёнными данными
      setTimeout(() => manageGroupBrigades(groupId), 100);
      
  } catch (e) {
      hideLoading();
      console.error('❌ Общая ошибка:', e);
      showNotification('Ошибка', e.message, 'error');
  }
}



async function removeSelectedFromGroup(groupId) {
  const checks = document.querySelectorAll('.group-brigade-check:checked');
  const ids = Array.from(checks).map(cb => parseInt(cb.value));
  
  console.log(`📤 Удаление бригад из группы ${groupId}:`, ids);
  
  if (!ids.length) { 
      showNotification('Внимание', 'Выберите бригады для удаления', 'warning'); 
      return; 
  }
  
  showLoading('Удаление бригад...');
  
  let successCount = 0;
  let errorCount = 0;
  
  try {
      for (const brigadeId of ids) {
          try {
              console.log(`  ➖ Удаление бригады ${brigadeId} из группы ${groupId}`);
              
              const response = await fetch(`${API_BASE}/brigade-groups/${groupId}/remove-brigade?brigade_id=${brigadeId}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' }
              });
              
              if (response.ok) {
                  successCount++;
                  console.log(`  ✅ Бригада ${brigadeId} удалена`);
              } else {
                  const error = await response.json().catch(() => ({}));
                  console.error(`  ❌ Ошибка удаления бригады ${brigadeId}:`, error);
                  errorCount++;
              }
          } catch (e) {
              console.error(`  ❌ Исключение при удалении ${brigadeId}:`, e);
              errorCount++;
          }
      }
      
      if (successCount > 0) {
          showNotification('✅ Успех', `Убрано ${successCount} бригад`, 'success');
      }
      if (errorCount > 0) {
          showNotification('⚠️ Внимание', `Не удалось убрать ${errorCount} бригад`, 'warning');
      }
      
      closeAllModals();
      
      // Обновляем данные
      await loadAllData();
      await loadBrigadeGroups();
      
      // Открываем модалку заново
      setTimeout(() => manageGroupBrigades(groupId), 100);
      
  } catch (e) {
      hideLoading();
      console.error('❌ Общая ошибка:', e);
      showNotification('Ошибка', e.message, 'error');
  }
}



async function disbandGroup(groupId) {
  if (!confirm('Расформировать группу? Все бригады будут удалены из группы. Сама группа будет удалена.')) return;
  
  showLoading('Расформирование группы...');
  
  try {
      // Получаем все бригады группы
      const brigades = await api.get(`/brigade-groups/${groupId}/brigades`);
      console.log(`📤 Удаление ${brigades.length} бригад из группы ${groupId}`);
      
      // Удаляем все бригады из группы
      for (const b of brigades) {
          await fetch(`${API_BASE}/brigade-groups/${groupId}/remove-brigade?brigade_id=${b.id}`, {
              method: 'POST'
          });
      }
      
      // Удаляем саму группу
      await api.delete(`/brigade-groups/${groupId}`);
      
      showNotification('✅ Успех', 'Группа расформирована', 'success');
      closeAllModals();
      
      // Обновляем список групп
      await loadBrigadeGroups();
      
  } catch (e) {
      hideLoading();
      console.error('❌ Ошибка расформирования:', e);
      showNotification('Ошибка', e.message, 'error');
  }
}

// Вспомогательная функция
// function getLoadClass(load) {
//   load = load || 0;
//   if (load > 80) return 'high';
//   if (load > 50) return 'medium';
//   return 'low';
// }

// Экспорт функций




window.selectAllInGroup = selectAllInGroup;
window.selectAllAvailable = selectAllAvailable;


// Экспорт функций
// window.manageGroupBrigades = manageGroupBrigades;
window.addSelectedToGroup = addSelectedToGroup;
window.removeSelectedFromGroup = removeSelectedFromGroup;
window.disbandGroup = disbandGroup;

async function addBrigadeToGroup(groupId, brigadeId) {
    try {
        await api.post(`/brigade-groups/${groupId}/add-brigade?brigade_id=${brigadeId}`, {});
        showNotification('Успех', 'Бригада добавлена в группу', 'success');
        // Обновляем модальное окно
        closeAllModals();
        await manageGroupBrigades(groupId);
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

async function removeBrigadeFromGroup(groupId, brigadeId) {
    try {
        await api.post(`/brigade-groups/${groupId}/remove-brigade?brigade_id=${brigadeId}`, {});
        showNotification('Успех', 'Бригада удалена из группы', 'success');
        closeAllModals();
        await manageGroupBrigades(groupId);
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

function viewGroupSchedule(groupId) {
    showNotification('Инфо', 'Расписание группы будет доступно в следующем обновлении', 'info');
}

// Глобальные функции
window.openCreateGroupModal = openCreateGroupModal;
window.editBrigadeGroup = (id) => {
    // Получить группу и открыть модалку
    api.get(`/brigade-groups`).then(groups => {
        const group = groups.find(g => g.id === id);
        if (group) openCreateGroupModal(group);
    });
};
window.deleteBrigadeGroup = deleteBrigadeGroup;
window.manageGroupBrigades = manageGroupBrigades;
window.addBrigadeToGroup = addBrigadeToGroup;
window.removeBrigadeFromGroup = removeBrigadeFromGroup;
window.viewGroupSchedule = viewGroupSchedule;

// async function createBrigadeGroup() {
//     const name = prompt('Название группы:');
//     if (!name) return;
    
//     const description = prompt('Описание (опционально):') || '';
    
//     try {
//         await api.post('/brigade-groups', { name, description });
//         await loadBrigadeGroups();
//         showNotification('Успех', 'Группа создана', 'success');
//     } catch (e) {
//         alert('Ошибка: ' + e.message);
//     }
// }

// Создание группы бригад (вызывается из кнопок)
function createBrigadeGroup() {
    openCreateGroupModal(null);
}

// Глобальная ссылка
window.createBrigadeGroup = createBrigadeGroup;


// Drag & Drop функции
window.handleWorkerDragStart = (e, workerId) => {
    AdminState.draggedWorkerId = workerId;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
};

window.handleWorkerDragEnd = (e) => {
    e.target.classList.remove('dragging');
    document.querySelectorAll('.brigade-card').forEach(c => c.classList.remove('drag-over'));
};

// window.handleBrigadeDrop = async (e, brigadeId) => {
//     e.preventDefault();
//     e.currentTarget.classList.remove('drag-over');
//     const workerId = AdminState.draggedWorkerId;
//     if (!workerId) return;
    
//     try {
//         await api.transferWorker(workerId, brigadeId);
//         showNotification('✅ Успех', 'Рабочий переведён', 'success');
//         await loadAllData();
//     } catch (error) {
//         showNotification('❌ Ошибка', error.message, 'error');
//     }
//     AdminState.draggedWorkerId = null;
// };

window.assignBrigadier = async (workerId, brigadeId) => {
    try {
        await api.assignBrigadier(workerId, brigadeId);
        showNotification('👑 Успех', 'Бригадир назначен', 'success');
        await loadAllData();
    } catch (e) {
        showNotification('❌ Ошибка', e.message, 'error');
    }
};

window.removeWorkerFromBrigade = async (workerId) => {
    try {
        await api.updateWorkerBrigade(workerId, null);
        showNotification('✅ Успех', 'Рабочий убран из бригады', 'success');
        await loadAllData();
    } catch (e) {
        showNotification('❌ Ошибка', e.message, 'error');
    }
};

function openBrigadeModal(brigade = null) {
    closeAllModals();
    const DOM = getDOM();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'brigadeModal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-header">
            <h3>${brigade ? 'Редактировать' : 'Добавить'} бригаду</h3>
            <button class="modal-close" onclick="closeAllModals()">&times;</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label>Название *</label>
                <input type="text" id="brigadeName" class="input" value="${brigade?.name || ''}">
            </div>
            <div class="form-group">
                <label>Описание</label>
                <textarea id="brigadeDesc" class="input" rows="2">${brigade?.description || ''}</textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label>Макс. вместимость</label>
                    <input type="number" id="brigadeMax" class="input" value="${brigade?.max_capacity || 10}">
                </div>
                <div class="form-group">
                    <label>Эффективность</label>
                    <input type="number" id="brigadeEff" class="input" step="0.05" value="${brigade?.efficiency_rating || 1.0}">
                </div>
            </div>
            <div class="form-group">
                <label>Важность</label>
                <select id="brigadeImportance" class="input">
                    <option value="critical" ${brigade?.importance === 'critical' ? 'selected' : ''}>🔥 Критическая</option>
                    <option value="high" ${brigade?.importance === 'high' ? 'selected' : ''}>⭐ Высокая</option>
                    <option value="medium" ${brigade?.importance === 'medium' ? 'selected' : ''}>📌 Средняя</option>
                    <option value="low" ${brigade?.importance === 'low' ? 'selected' : ''}>🔹 Низкая</option>
                </select>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-outline" onclick="closeAllModals()">Отмена</button>
            <button class="btn btn-primary" onclick="saveBrigade(${brigade?.id || 'null'})">Сохранить</button>
        </div>
    `;
    document.body.appendChild(modal);
    DOM.modalOverlay.style.display = 'block';
}

async function saveBrigade(id) {
    const data = {
        name: document.getElementById('brigadeName')?.value,
        description: document.getElementById('brigadeDesc')?.value,
        max_capacity: parseInt(document.getElementById('brigadeMax')?.value) || 10,
        efficiency_rating: parseFloat(document.getElementById('brigadeEff')?.value) || 1.0,
        importance: document.getElementById('brigadeImportance')?.value || 'medium'
    };
    if (!data.name) { alert('Введите название'); return; }
    try {
        if (id && id !== 'null') await api.updateBrigade(parseInt(id), data);
        else await api.createBrigade(data);
        closeAllModals();
        await loadAllData();
        showNotification('Успех', 'Бригада сохранена', 'success');
    } catch (e) { alert('Ошибка: ' + e.message); }
}

// Глобальные функции
window.loadBrigadeTasks = loadBrigadeTasks;
window.openBrigadeTaskModal = openBrigadeTaskModal;
window.saveBrigadeTask = saveBrigadeTask;
window.deleteBrigadeTask = deleteBrigadeTask;
window.editBrigadeTask = (taskId) => {
    // Получить задачу и открыть модалку
    api.get('/brigade-tasks').then(tasks => {
        const task = tasks.find(t => t.id === taskId);
        if (task) openBrigadeTaskModal(task.brigade_id, task);
    });
};
window.assignTaskToWorker = assignTaskToWorker;
window.assignAsBrigadier = assignAsBrigadier;
window.removeWorkerFromBrigade = removeWorkerFromBrigade;
window.addWorkerToBrigade = addWorkerToBrigade;
window.viewBrigadeSchedule = (id) => showNotification('📅', 'Расписание будет доступно позже', 'info');

// ================================================================
// РАБОЧИЕ
// ================================================================

// ================================================================
// РАБОЧИЕ (ПОЛНАЯ ПЕРЕРАБОТКА)
// ================================================================

// Кэш рабочих с информацией о бригадах
let workersCache = [];

function updateWorkersCache() {
    workersCache = AdminState.workers.map(worker => {
        const brigade = AdminState.brigades.find(b => b.id === worker.brigade_id);
        return {
            ...worker,
            brigade_name: brigade?.name || 'Без бригады',
            brigade_importance: brigade?.importance || 'low'
        };
    });
}

function filterAndSortWorkers() {
    const searchInput = document.getElementById('workerSearch');
    const brigadeFilter = document.getElementById('workerBrigadeFilter');
    const statusFilter = document.getElementById('workerStatusFilter');
    const sortSelect = document.getElementById('workerSort');
    
    const searchQuery = searchInput?.value?.toLowerCase()?.trim() || '';
    const brigadeValue = brigadeFilter?.value || '';
    const statusValue = statusFilter?.value || '';
    const sortBy = sortSelect?.value || 'default';
    
    // Обновляем кэш
    updateWorkersCache();
    
    // Копируем массив
    let filtered = [...workersCache];
    
    // Поиск
    if (searchQuery) {
        filtered = filtered.filter(w => 
            w.name?.toLowerCase().includes(searchQuery) ||
            w.position?.toLowerCase().includes(searchQuery) ||
            w.login?.toLowerCase().includes(searchQuery)
        );
    }
    
    // Фильтр по бригаде
    if (brigadeValue) {
        filtered = filtered.filter(w => w.brigade_id == brigadeValue);
    }
    
    // Фильтр по статусу
    if (statusValue) {
        filtered = filtered.filter(w => w.status === statusValue);
    }
    
    // Сортировка
    switch (sortBy) {
        case 'name_asc':
            filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
            break;
        case 'name_desc':
            filtered.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'ru'));
            break;
        case 'brigade_asc':
            filtered.sort((a, b) => (a.brigade_name || '').localeCompare(b.brigade_name || '', 'ru'));
            break;
        case 'status_online':
            const statusOrder = { online: 1, busy: 2, offline: 3 };
            filtered.sort((a, b) => (statusOrder[a.status] || 4) - (statusOrder[b.status] || 4));
            break;
        case 'brigadier_first':
            filtered.sort((a, b) => (b.is_brigadier || 0) - (a.is_brigadier || 0));
            break;
    }
    
    return filtered;
}

function populateWorkerBrigadeFilter() {
    const filterSelect = document.getElementById('workerBrigadeFilter');
    if (!filterSelect) return;
    
    const currentValue = filterSelect.value;
    
    filterSelect.innerHTML = '<option value="">Все бригады</option>' +
        AdminState.brigades
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'))
            .map(b => `<option value="${b.id}">${b.name} (${b.workers_count || 0})</option>`)
            .join('');
    
    if (currentValue) {
        filterSelect.value = currentValue;
    }
}

function renderWorkersGrid() {
    const grid = document.getElementById('workersGrid');
    const countSpan = document.getElementById('workerCount');
    
    if (!grid) return;
    
    const workers = filterAndSortWorkers();
    
    if (countSpan) {
        countSpan.textContent = `Найдено: ${workers.length} / ${AdminState.workers.length}`;
    }
    
    if (workers.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px; background: white; border-radius: 16px;">
                <svg viewBox="0 0 48 48" fill="none" width="48" height="48" style="margin: 0 auto 16px; opacity: 0.4;">
                    <circle cx="24" cy="16" r="6" stroke="#64748b" stroke-width="2"/>
                    <path d="M10 38v-4c0-6 6-8 14-8s14 2 14 8v4" stroke="#64748b" stroke-width="2"/>
                </svg>
                <p style="color: #64748b;">Рабочие не найдены</p>
                <button class="btn btn-outline btn-sm" onclick="resetWorkerFilters()" style="margin-top: 16px;">
                    Сбросить фильтры
                </button>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = workers.map(w => {
        const statusColors = { online: '#10b981', busy: '#f59e0b', offline: '#94a3b8' };
        const statusText = { online: 'Онлайн', busy: 'Занят', offline: 'Офлайн' };
        
        return `
            <div class="worker-card" draggable="true" 
                 ondragstart="handleWorkerDragStart(event, ${w.id})" 
                 ondragend="handleWorkerDragEnd(event)"
                 style="background: white; border-radius: 16px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                
                <div style="display: flex; gap: 16px;">
                    <div class="worker-avatar" style="width: 56px; height: 56px; border-radius: 50%; background: ${w.is_brigadier ? '#f59e0b' : '#0961f6'}; display: flex; align-items: center; justify-content: center; color: white; font-size: 22px; font-weight: 600; flex-shrink: 0;">
                        ${w.name?.charAt(0) || 'Р'}
                    </div>
                    
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <h3 style="margin: 0; font-size: 16px;">${w.name}</h3>
                            ${w.is_brigadier ? '<span style="color: #f59e0b;" title="Бригадир">👑</span>' : ''}
                        </div>
                        
                        <div style="font-size: 13px; color: #64748b; margin-bottom: 8px;">
                            ${w.position || 'Рабочий'}
                        </div>
                        
                        <div style="display: flex; gap: 16px; margin-bottom: 8px;">
                            <span style="display: flex; align-items: center; gap: 4px;">
                                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColors[w.status]};"></span>
                                <span style="font-size: 12px;">${statusText[w.status]}</span>
                            </span>
                            <span style="font-size: 12px; color: #64748b;">
                                📋 ${w.brigade_name}
                            </span>
                        </div>
                        
                        ${w.skills?.length ? `
                            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;">
                                ${w.skills.map(s => `<span style="background: #e5e7eb; padding: 2px 8px; border-radius: 12px; font-size: 11px;">${s}</span>`).join('')}
                            </div>
                        ` : ''}
                        
                        <div style="font-size: 11px; color: #94a3b8;">
                            🆔 ${w.login}
                            ${w.phone ? ` | 📞 ${w.phone}` : ''}
                            ${w.email ? ` | 📧 ${w.email}` : ''}
                        </div>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <button class="btn-icon" onclick="editWorker(${w.id})" title="Редактировать">✏️</button>
                        <button class="btn-icon" onclick="deleteWorker(${w.id})" title="Удалить" style="color: #ef4444;">🗑️</button>
                        ${!w.brigade_id ? `
                            <button class="btn-icon" onclick="quickAssignWorker(${w.id})" title="Назначить в бригаду" style="color: #10b981;">👥</button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function resetWorkerFilters() {
    const searchInput = document.getElementById('workerSearch');
    const brigadeFilter = document.getElementById('workerBrigadeFilter');
    const statusFilter = document.getElementById('workerStatusFilter');
    const sortSelect = document.getElementById('workerSort');
    
    if (searchInput) searchInput.value = '';
    if (brigadeFilter) brigadeFilter.value = '';
    if (statusFilter) statusFilter.value = '';
    if (sortSelect) sortSelect.value = 'default';
    
    renderWorkersGrid();
}

function filterAndRenderWorkers() {
    renderWorkersGrid();
}

// Быстрое назначение рабочего в бригаду
function quickAssignWorker(workerId) {
    const available = AdminState.brigades;
    if (!available.length) {
        showNotification('Внимание', 'Нет доступных бригад', 'warning');
        return;
    }
    
    const worker = AdminState.workers.find(w => w.id === workerId);
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'quickAssignModal';
    modal.style.display = 'block';
    modal.style.width = '400px';
    
    modal.innerHTML = `
        <div class="modal-header">
            <h3>Назначить "${worker?.name}" в бригаду</h3>
            <button class="modal-close" onclick="closeAllModals()">&times;</button>
        </div>
        <div class="modal-body">
            <select id="quickBrigadeSelect" class="input" style="width: 100%;">
                <option value="">Выберите бригаду</option>
                ${available.map(b => `<option value="${b.id}">${b.name} (${b.workers_count || 0}/${b.max_capacity})</option>`).join('')}
            </select>
        </div>
        <div class="modal-footer">
            <button class="btn btn-outline" onclick="closeAllModals()">Отмена</button>
            <button class="btn btn-primary" onclick="confirmQuickAssign(${workerId})">Назначить</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    getDOM().modalOverlay.style.display = 'block';
}

async function confirmQuickAssign(workerId) {
    const select = document.getElementById('quickBrigadeSelect');
    const brigadeId = select?.value;
    
    if (!brigadeId) {
        alert('Выберите бригаду');
        return;
    }
    
    try {
        await api.put(`/workers/${workerId}`, { brigade_id: parseInt(brigadeId) });
        closeAllModals();
        await loadAllData();
        showNotification('✅ Успех', 'Рабочий назначен в бригаду', 'success');
    } catch (e) {
        alert('Ошибка: ' + e.message);
    }
}

// Глобальные функции
window.filterWorkers = filterAndRenderWorkers;
window.sortWorkers = filterAndRenderWorkers;
window.filterAndRenderWorkers = filterAndRenderWorkers;
window.resetWorkerFilters = resetWorkerFilters;
window.quickAssignWorker = quickAssignWorker;
window.confirmQuickAssign = confirmQuickAssign;

// function openWorkerModal(worker = null) {
//     closeAllModals();
//     const DOM = getDOM();
//     const modal = document.createElement('div');
//     modal.className = 'modal';
//     modal.id = 'workerModal';
//     modal.style.display = 'block';
    
//     // Упрощённая форма (без роли и статуса)
//     modal.innerHTML = `
//         <div class="modal-header">
//             <h3>${worker ? 'Редактировать' : 'Добавить'} рабочего</h3>
//             <button class="modal-close" onclick="closeAllModals()">&times;</button>
//         </div>
//         <div class="modal-body">
//             <form onsubmit="return false;">
//                 <div class="form-group">
//                     <label>ФИО *</label>
//                     <input type="text" id="workerName" class="input" value="${worker?.name || ''}" required>
//                 </div>
//                 <div class="form-group">
//                     <label>Должность</label>
//                     <input type="text" id="workerPosition" class="input" value="${worker?.position || 'Рабочий'}">
//                 </div>
//                 <div class="form-group">
//                     <label>Бригада</label>
//                     <select id="workerBrigade" class="input">
//                         <option value="">Без бригады</option>
//                         ${AdminState.brigades.map(b => `<option value="${b.id}" ${worker?.brigade_id === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
//                     </select>
//                 </div>
//                 <div class="form-group">
//                     <label>Навыки (через запятую)</label>
//                     <input type="text" id="workerSkills" class="input" value="${(worker?.skills || []).join(', ')}" placeholder="раскрой, пошив">
//                 </div>
//                 <div class="form-row">
//                     <div class="form-group">
//                         <label>Логин *</label>
//                         <input type="text" id="workerLogin" class="input" value="${worker?.login || ''}" required>
//                     </div>
//                     <div class="form-group">
//                         <label>${worker ? 'Новый пароль' : 'Пароль *'}</label>
//                         <input type="password" id="workerPass" class="input" placeholder="${worker ? 'Оставьте пустым' : ''}">
//                     </div>
//                 </div>
//                 <label style="display:flex;align-items:center;gap:8px;margin-top:12px;">
//                     <input type="checkbox" id="workerIsBrigadier" ${worker?.is_brigadier ? 'checked' : ''}>
//                     <span>👑 Назначить бригадиром</span>
//                 </label>
//             </form>
//         </div>
//         <div class="modal-footer">
//             <button class="btn btn-outline" onclick="closeAllModals()">Отмена</button>
//             <button class="btn btn-primary" onclick="saveWorker(${worker?.id || 'null'})">Сохранить</button>
//         </div>
//     `;
    
//     document.body.appendChild(modal);
//     DOM.modalOverlay.style.display = 'block';
// }

function openWorkerModal(worker = null) {
    closeAllModals();
    const DOM = getDOM();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'workerModal';
    modal.style.display = 'block';
    modal.style.width = '520px';
    modal.style.maxHeight = '85vh';
    modal.style.overflowY = 'auto';
    
    modal.innerHTML = `
        <div class="modal-header">
            <h3>${worker ? '✏️ Редактировать' : '➕ Добавить'} рабочего</h3>
            <button class="modal-close" onclick="closeAllModals()">&times;</button>
        </div>
        <div class="modal-body">
            <form onsubmit="return false;">
                <!-- ФИО -->
                <div class="form-group">
                    <label>ФИО *</label>
                    <input type="text" id="workerName" class="input" value="${worker?.name || ''}" placeholder="Иванов Иван Иванович" required>
                </div>
                
                <!-- Должность -->
                <div class="form-group">
                    <label>Должность</label>
                    <input type="text" id="workerPosition" class="input" value="${worker?.position || 'Рабочий'}" placeholder="Например: Слесарь-сборщик">
                </div>
                
                <!-- Бригада -->
                <div class="form-group">
                    <label>Бригада</label>
                    <select id="workerBrigade" class="input">
                        <option value="">Без бригады</option>
                        ${AdminState.brigades.map(b => `
                            <option value="${b.id}" ${worker?.brigade_id === b.id ? 'selected' : ''}>
                                ${b.name} (${b.workers_count || 0}/${b.max_capacity})
                            </option>
                        `).join('')}
                    </select>
                </div>
                
                <!-- Навыки -->
                <div class="form-group">
                    <label>Навыки (через запятую)</label>
                    <input type="text" id="workerSkills" class="input" value="${(worker?.skills || []).join(', ')}" placeholder="раскрой, сварка, контроль">
                </div>
                
                <!-- Логин и Телефон -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="form-group">
                        <label>Логин *</label>
                        <input type="text" id="workerLogin" class="input" value="${worker?.login || ''}" placeholder="ivanov" required>
                    </div>
                    <div class="form-group">
                        <label>📞 Телефон</label>
                        <input type="tel" id="workerPhone" class="input" value="${worker?.phone || ''}" placeholder="+7 (999) 123-45-67">
                    </div>
                </div>
                
                <!-- Email -->
                <div class="form-group">
                    <label>📧 Email</label>
                    <input type="email" id="workerEmail" class="input" value="${worker?.email || ''}" placeholder="ivanov@company.ru">
                </div>
                
                <!-- Пароль -->
                <div class="form-group">
                    <label>${worker ? '🔐 Новый пароль (оставьте пустым, если не меняете)' : '🔐 Пароль *'}</label>
                    <input type="password" id="workerPass" class="input" placeholder="${worker ? '••••••••' : 'Введите пароль'}" ${!worker ? 'required' : ''}>
                </div>
                
                <!-- Чекбокс бригадира -->
                <label style="display: flex; align-items: center; gap: 10px; margin-top: 16px; cursor: pointer;">
                    <input type="checkbox" id="workerIsBrigadier" ${worker?.is_brigadier ? 'checked' : ''} style="width: 18px; height: 18px;">
                    <span style="font-weight: 500;">👑 Назначить бригадиром</span>
                </label>
                
                ${worker ? `
                <div class="form-group" style="margin-top: 16px;">
                    <label>Статус</label>
                    <select id="workerStatus" class="input">
                        <option value="offline" ${worker?.status === 'offline' ? 'selected' : ''}>⚪ Офлайн</option>
                        <option value="online" ${worker?.status === 'online' ? 'selected' : ''}>🟢 Онлайн</option>
                        <option value="busy" ${worker?.status === 'busy' ? 'selected' : ''}>🟡 Занят</option>
                    </select>
                </div>
                ` : ''}
            </form>
        </div>
        <div class="modal-footer">
            <button class="btn btn-outline" onclick="closeAllModals()">Отмена</button>
            <button class="btn btn-primary" onclick="saveWorker(${worker?.id || 'null'})">
                ${worker ? '💾 Сохранить' : '➕ Создать'}
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
    DOM.modalOverlay.style.display = 'block';
    
    // Фокус на первое поле
    setTimeout(() => document.getElementById('workerName')?.focus(), 100);
}

async function saveWorker(id) {
    const data = {
        name: document.getElementById('workerName')?.value?.trim(),
        position: document.getElementById('workerPosition')?.value?.trim() || 'Рабочий',
        brigade_id: parseInt(document.getElementById('workerBrigade')?.value) || null,
        skills: (document.getElementById('workerSkills')?.value || '')
            .split(',')
            .map(s => s.trim())
            .filter(s => s),
        login: document.getElementById('workerLogin')?.value?.trim(),
        phone: document.getElementById('workerPhone')?.value?.trim() || null,
        email: document.getElementById('workerEmail')?.value?.trim() || null,
        is_brigadier: document.getElementById('workerIsBrigadier')?.checked || false
    };
    
    // Валидация
    if (!data.name) {
        alert('Введите ФИО');
        return;
    }
    if (!data.login) {
        alert('Введите логин');
        return;
    }
    
    // Пароль только для нового или если введён
    const passInput = document.getElementById('workerPass');
    if (passInput) {
        const pass = passInput.value;
        if (!id || id === 'null') {
            if (!pass) {
                alert('Введите пароль');
                return;
            }
            data.password = pass;
        } else if (pass) {
            data.password = pass;
        }
    }
    
    // Статус при редактировании
    if (id && id !== 'null') {
        const statusSelect = document.getElementById('workerStatus');
        if (statusSelect) {
            data.status = statusSelect.value;
        }
    }
    
    console.log('Saving worker:', data);
    
    try {
        if (id && id !== 'null') {
            await api.updateWorker(parseInt(id), data);
            showNotification('✅ Успех', 'Рабочий обновлён', 'success');
        } else {
            await api.createWorker(data);
            showNotification('✅ Успех', 'Рабочий создан', 'success');
        }
        closeAllModals();
        await loadAllData();
    } catch (error) {
        console.error('Save worker error:', error);
        alert('Ошибка: ' + error.message);
    }
}
// ================================================================
// ГРАФ, AI, УТИЛИТЫ
// ================================================================

function renderGraph() {
    const DOM = getDOM();
    const container = DOM.cyGraph;
    if (!container) {
        console.warn('Контейнер для графа не найден');
        return;
    }
  
    const loading = DOM.graphLoading;
    if (loading) loading.style.display = 'flex';
  
    try {
        if (cy) {
            cy.destroy();
            cy = null;
        }
  
        const elements = buildGraphElements();
        graphElements = elements;
        const nodeCount = elements.filter(e => !e.data.source).length;
  
        cy = cytoscape({
            container: container,
            elements: elements,
            style: getGraphStyle(),
            layout: { name: 'preset' },
            minZoom: 0.08,
            maxZoom: 2.5,
            // wheelSensitivity: 0.15,
            selectionType: 'single',
            boxSelectionEnabled: false,
            textureOnViewport: true,
            hideEdgesOnViewport: true,
            hideLabelsOnViewport: true,
            pixelRatio: 1,
            motionBlur: false

            
        });

        cy.on('tap', 'edge.bridge-proposal', (evt) => {
            const d = evt.target.data();
            const from = String(d.source).replace(/\D/g, '');
            const to = String(d.target).replace(/\D/g, '');
            if (from && to && confirm(`Применить связь #${from} → #${to}?`)) {
              window.applyBridgeLink({ from, to });
            }
          });
  
          applyGraphFilters();
          setupGraphEvents(cy);
          window.cy = cy;
          applyBridgeProposalsToGraph();
  
          const savedLayout =
            localStorage.getItem('graphLayout') ||
            document.getElementById('graphLayoutSelect')?.value ||
            'dagre:LR';
          const sel = document.getElementById('graphLayoutSelect');
          if (sel) sel.value = savedLayout;
          changeGraphLayout(savedLayout);

        setTimeout(() => {
            if (typeof restoreAIPaths === 'function') restoreAIPaths();
  
            const cp = (
              AdminState.aiCriticalPath?.length
                ? AdminState.aiCriticalPath
                : AdminState.criticalPath || []
            )
              .map((id) => Number(String(id).replace(/^T/i, '')))
              .filter((n) => !Number.isNaN(n));
  
            console.log('[graph] highlight cp', cp.length, cp.slice(0, 8));
  
            if (graphFilters.highlightCritical !== false && cp.length) {
              markCriticalPathContinuous(cp);
            }
            if (graphFilters.highlightAdvantage && AdminState.aiAdvantagePath?.length) {
              highlightAdvantagePath(true);
            }
          }, 120);

        if (nodeCount < 80 && typeof animateNodesAppearance === 'function') {
          animateNodesAppearance();
        }

        if (loading) loading.style.display = 'none';
        console.log(`✅ Граф: ${elements.length} элементов, узлов ~${nodeCount}`);
    } catch (e) {
        console.error('❌ Ошибка построения графа:', e);
        if (loading) {
            loading.innerHTML = `<div style="text-align:center;color:#ef4444;"><p>Ошибка загрузки графа</p><p style="font-size:12px;">${e.message}</p></div>`;
        }
    }
  }
  function applyBridgeProposalsToGraph() {
    if (!cy || !window.aiPanel?.lastBridge) return;
    cy.edges('.bridge-proposal').remove();
    const proposals = (aiPanel.lastBridge.proposals || []).slice(0, 40);
    const eles = [];
    proposals.forEach((p, i) => {
      const a = `op${p.from}`;
      const b = `op${p.to}`;
      if (cy.$id(a).empty() || cy.$id(b).empty()) return;
      // уже есть реальное ребро — не дублируем
      if (cy.edges(`[source = "${a}"][target = "${b}"]`).nonempty()) return;
      eles.push({
        group: 'edges',
        data: {
          id: `bridge-${p.from}-${p.to}-${i}`,
          source: a,
          target: b,
          label: `${Math.round((p.confidence || 0) * 100)}%`,
          kind: 'bridge'
        },
        classes: 'bridge-proposal'
      });
    });
    if (eles.length) cy.add(eles);
  }



function buildGraphElements() {
  const elements = [];

  // полные данные (как Операции / Гантт / CPM), не страница таблицы
  const ops = (window.allOperationsCache && window.allOperationsCache.length)
      ? window.allOperationsCache
      : (AdminState.operations || []);
  const brigades = AdminState.brigades || [];
  const cp = AdminState.criticalPath || [];
  
  // ===== 1. УЗЛЫ ОПЕРАЦИЙ =====
  ops.forEach(op => {
    const isCritical = cp.includes(op.op_number);
    const brigade = brigades.find(b => b.id === op.brigade_id);
    const brigadeGroup = typeof findBrigadeGroup === 'function' ? findBrigadeGroup(op.brigade_id) : null;

    let nodeStatus = op.status || 'pending';
    if (op.status === 'in_progress') nodeStatus = 'in_progress';

    const depsCompleted = typeof checkDependenciesCompleted === 'function'
        ? checkDependenciesCompleted(op)
        : true;
    const isBlocked = op.status === 'blocked' || (op.status === 'pending' && !depsCompleted);

    const statusIcon = {
        completed: '✅',
        in_progress: '🔄',
        pending: '⏳',
        blocked: '🔒'
    }[op.status] || '📋';

    const blockLabel = [
        `${statusIcon} #${op.op_number}`,
        truncate(op.name || '—', 16),
        `${op.duration || 0}ч · ${brigade?.name ? truncate(brigade.name, 10) : '—'}`
    ].join('\n');

    elements.push({
        data: {
            id: `op${op.op_number}`,
            label: `#${op.op_number}`,
            blockLabel: blockLabel,
            fullLabel: op.name || '—',
            op_number: op.op_number,
            name: op.name,
            status: nodeStatus,
            duration: Number(op.duration) || 1,
            labor_hours: op.labor_hours,
            people_count: op.people_count,
            brigade_id: op.brigade_id,
            brigade_name: brigade?.name || '—',
            time_reserve: op.time_reserve,
            isCritical: isCritical,
            isBlocked: isBlocked,
            prev_ops: op.prev_ops || [],
            next_ops: op.next_ops || []
        },
        classes: `operation ${nodeStatus} ${isCritical ? 'critical' : ''} ${isBlocked ? 'blocked' : ''}`
    });
});
  
  // ===== 2. УЗЛЫ БРИГАД =====
  if (graphFilters.showBrigades) {
      AdminState.brigades.forEach(brigade => {
          const workers = AdminState.workers.filter(w => w.brigade_id === brigade.id);
          const brigadeOps = ops.filter(o => o.brigade_id === brigade.id);
          
          // Статус бригады по загрузке
          let brigadeStatus = 'pending';
          const load = brigade.current_load || 0;
          if (load > 80) brigadeStatus = 'blocked';
          else if (load > 30) brigadeStatus = 'progress';
          else if (workers.length > 0) brigadeStatus = 'progress';
          
          const bgColor = getBrigadeColor(brigade);
          
          const label = [
              `👥 ${brigade.name}`,
              `${workers.length}/${brigade.max_capacity} чел.`,
              `📊 ${Math.round(load)}% загрузка`
          ].join('\n');
          
          elements.push({
              data: {
                  id: `brigade${brigade.id}`,
                  label: label,
                  type: 'brigade',
                  brigade_id: brigade.id,
                  name: brigade.name,
                  status: brigadeStatus,
                  workers_count: workers.length,
                  max_capacity: brigade.max_capacity,
                  current_load: load,
                  efficiency: brigade.efficiency_rating,
                  importance: brigade.importance,
                  operations_count: brigadeOps.length,
                  size: 65,
                  bgColor: bgColor
              },
              classes: `brigade ${brigadeStatus}`
          });
          
          // Связи бригады с операциями
          brigadeOps.forEach(op => {
              elements.push({
                  data: {
                      id: `brigade_link_${brigade.id}_${op.op_number}`,
                      source: `brigade${brigade.id}`,
                      target: `op${op.op_number}`,
                      type: 'assignment',
                      brigade_id: brigade.id,
                      op_number: op.op_number
                  },
                  classes: 'assignment'
              });
          });
      });
  }
  
  // ===== 3. УЗЛЫ ГРУПП БРИГАД =====
  if (graphFilters.showGroups) {
      const groups = window.brigadeGroupsData || [];
      groups.forEach(group => {
          const groupBrigades = group.brigades || [];
          const totalWorkers = groupBrigades.reduce((sum, b) => sum + (b.workers_count || 0), 0);
          
          const label = [
              `📦 ${group.name}`,
              `${groupBrigades.length} бригад`,
              `👥 ${totalWorkers} рабочих`
          ].join('\n');
          
          elements.push({
              data: {
                  id: `group${group.id}`,
                  label: label,
                  type: 'group',
                  group_id: group.id,
                  name: group.name,
                  brigades_count: groupBrigades.length,
                  workers_count: totalWorkers,
                  size: 75,
                  bgColor: '#8b5cf6'
              },
              classes: 'group'
          });
          
          // Связи группы с бригадами
          groupBrigades.forEach(brigade => {
              elements.push({
                  data: {
                      id: `group_link_${group.id}_${brigade.id}`,
                      source: `group${group.id}`,
                      target: `brigade${brigade.id}`,
                      type: 'membership'
                  },
                  classes: 'membership'
              });
          });
      });
  }
  
  // ===== 4. СВЯЗИ МЕЖДУ ОПЕРАЦИЯМИ =====
  ops.forEach(op => {
    (op.next_ops || []).forEach(targetId => {
        const tid = Number(targetId);
        const targetOp = ops.find(o => Number(o.op_number) === tid);
        if (!targetOp) return;
        // в data: target: `op${tid}`, id: `edge_${op.op_number}_${tid}`
        if (!targetOp) return;

        const sourceCompleted = op.status === 'completed';
        const sourceBlocked = op.status === 'blocked';
        const targetBlocked = targetOp.status === 'blocked';

        // легенда:
        // зелёная стрелка = путь открыт (источник завершён)
        // пунктир = путь заблокирован
        // янтарный = критический (вешает markCriticalPathContinuous)
        let edgeClass = 'dependency';
        if (sourceCompleted) edgeClass += ' path-open';
        if (sourceBlocked || targetBlocked || (!sourceCompleted && (op.status === 'pending'))) {
            // не завершённый «вход» в блоке/ожидании — пунктир
            if (!sourceCompleted) edgeClass += ' path-blocked';
        }

        elements.push({
            data: {
                id: `edge_${op.op_number}_${tid}`,
                source: `op${op.op_number}`,
                target: `op${tid}`,
                type: 'dependency',
                sourceCompleted: sourceCompleted
            },
            classes: edgeClass
        });
    });
});
  
  return elements;
}


function getGraphStyle() {
    return [
      {
        
            selector: 'node',
            style: {
              'shape': 'round-rectangle',
              'width': 120,
              'height': 52,
              'background-color': '#ffffff',
              'border-width': 1.5,
              'border-color': '#cbd5e1',
              'color': '#0f172a',
              'label': 'data(label)',
              'text-wrap': 'wrap',
              'text-max-width': 110,
              'text-valign': 'center',
              'text-halign': 'center',
              'font-size': 10,
              'font-family': 'system-ui, Segoe UI, sans-serif',
              'font-weight': 600,
              'overlay-padding': 4,
              'overlay-opacity': 0,
              'z-index': 10
            }
          },
          {
            selector: 'node.operation',
            style: {
              'background-color': '#f8fafc',
              'border-color': '#94a3b8',
              'label': 'data(blockLabel)'
            }
          },
          {
            selector: 'node.operation:selected',
            style: {
              'border-width': 3,
              'border-color': '#2563eb',
              'background-color': '#eff6ff',
              'z-index': 30
            }
          },
          {
            selector: 'node.operation.completed',
            style: {
              'background-color': '#ecfdf5',
              'border-color': '#10b981',
              'color': '#065f46'
            }
          },
          {
            selector: 'node.operation.in_progress',
            style: {
              'background-color': '#eff6ff',
              'border-color': '#3b82f6',
              'color': '#1e40af'
            }
          },
          {
            selector: 'node.operation.pending',
            style: {
              'background-color': '#f8fafc',
              'border-color': '#94a3b8'
            }
          },
          {
            selector: 'node.operation.blocked',
            style: {
              'background-color': '#fef2f2',
              'border-color': '#ef4444',
              'color': '#991b1b'
            }
          },
          // критический — «золотая» обводка как в skill-tree
          {
            selector: 'node.operation.critical',
            style: {
              'border-width': 3,
              'border-color': '#d97706',
              'background-color': '#fffbeb',
              'color': '#92400e'
            }
          },
          // выгодный путь
          {
            selector: 'node.operation.advantage',
            style: {
              'border-width': 3,
              'border-color': '#0284c7',
              'background-color': '#e0f2fe'
            }
          },
          {
            selector: 'node.brigade',
            style: {
              'shape': 'round-rectangle',
              'width': 100,
              'height': 40,
              'background-color': '#f5f3ff',
              'border-color': '#8b5cf6',
              'font-size': 9
            }
          },
          // ---- рёбра ----
          {
            selector: 'edge',
            style: {
              'curve-style': 'bezier',
              'width': 1.5,
              'line-color': '#94a3b8',
              'target-arrow-shape': 'triangle',
              'target-arrow-color': '#94a3b8',
              'arrow-scale': 0.85,
              'opacity': 0.65,
              'z-index': 1
            }
          },
          {
            selector: 'edge.dependency',
            style: {
                'curve-style': 'bezier',
                'width': 2,
                'line-color': '#94a3b8',
                'target-arrow-shape': 'triangle',
                'target-arrow-color': '#94a3b8',
                'opacity': 0.6
              }
          },

          {
            selector: 'edge.path-virtual',
            style: {
              'line-style': 'dashed',
              'opacity': 0.95,
              'width': 3,
              'z-index': 28
            }
          },
          {
            selector: 'edge.path-virtual.critical',
            style: {
              'line-color': '#d97706',
              'target-arrow-color': '#d97706',
              'target-arrow-shape': 'triangle'
            }
          },
          {
            selector: 'edge.path-virtual.advantage',
            style: {
              'line-color': '#0284c7',
              'target-arrow-color': '#0284c7',
              'target-arrow-shape': 'triangle'
            }
          },
          // зелёная стрелка — «Путь открыт»
    {
        selector: 'edge.path-open',
        style: {
          'width': 2.5,
          'line-color': '#10b981',
          'target-arrow-shape': 'triangle',
          'target-arrow-color': '#10b981',
          'line-style': 'solid',
          'opacity': 0.95,
          'z-index': 12
        }
      },
      // пунктир — «Путь заблокирован»
      {
        selector: 'edge.path-blocked',
        style: {
          'width': 1.8,
          'line-color': '#94a3b8',
          'target-arrow-shape': 'triangle',
          'target-arrow-color': '#94a3b8',
          'line-style': 'dashed',
          'opacity': 0.55,
          'z-index': 2
        }
      },
      // янтарный — «Критический путь»
      {
        selector: 'edge.critical',
        style: {
          'width': 4,
          'line-color': '#d97706',
          'target-arrow-shape': 'triangle',
          'target-arrow-color': '#d97706',
          'line-style': 'solid',
          'opacity': 1,
          'z-index': 25
        }
      },
          {
            selector: 'edge.critical',
            style: {
                'width': 4,
                'line-color': '#d97706',
                'opacity': 1,
                'z-index': 20
              }
          },
          {
            selector: 'edge.advantage',
            style: {
                'width': 3.5,
                'line-color': '#0284c7',
                'target-arrow-color': '#0284c7',
                'target-arrow-shape': 'triangle',
                'line-style': 'solid',
                'opacity': 1,
                'z-index': 20
              }
          },
          {
            selector: 'edge.bridge-proposal',
            style: {
              'curve-style': 'bezier',
              'line-style': 'dashed',
              'line-color': '#0961f6',
              'target-arrow-shape': 'triangle',
              'target-arrow-color': '#0961f6',
              'width': 2.5,
              'opacity': 0.9,
              'label': 'data(label)',
              'font-size': 9,
              'color': '#0961f6',
              'text-background-color': '#eff6ff',
              'text-background-opacity': 1,
              'text-background-padding': 2,
              'z-index': 30
            }
          },
          {
            selector: 'node.hidden, edge.hidden',
            style: { 'display': 'none' }
          },

          {
            selector: '.dimmed',
            style: {
              'opacity': 0.15,
              'z-index': 0
            }
          },
          { selector: '.dimmed', style: { 'opacity': 0.18, 'z-index': 0 } },
    { selector: 'node.path-hl', style: {
        'opacity': 1, 'border-width': 4, 'border-color': '#2563eb',
        'background-color': '#dbeafe', 'z-index': 40
    }},
    { selector: 'edge.path-hl', style: {
        'opacity': 1, 'width': 4, 'line-color': '#2563eb',
        'target-arrow-color': '#2563eb', 'target-arrow-shape': 'triangle',
        'curve-style': 'bezier', 'z-index': 35
    }},
        ];
        
  }

  function setupGraphEvents(cy) {
    cy.off('tap'); // сброс старых, чтобы не дублировать
  
    // клик по операции — путь + панель
    cy.on('tap', 'node.operation', function (evt) {
      evt.stopPropagation();
      const node = evt.target;
      highlightPathForNode(node);
      showNodeInfo(node.data());
    });
  
    // клик по пустому месту — всё как было
    cy.on('tap', function (evt) {
      if (evt.target === cy) {
        clearPathHighlight();
        if (typeof hideNodeInfo === 'function') hideNodeInfo();
      }
    });
  
    cy.on('dblclick', 'node.operation', function (evt) {
      cy.animate({ center: { eles: evt.target }, zoom: 1.5, duration: 350 });
    });
  }


function applyGraphFilters() {
  if (!cy) return;
  
  // Сначала показываем всё
  cy.elements().removeClass('hidden');
  
  // Скрываем завершённые если нужно
  if (!graphFilters.showCompleted) {
      cy.nodes('.completed').addClass('hidden');
      cy.edges('.completed').addClass('hidden');
  }
  
  // Показываем только критический путь
  if (graphFilters.showCriticalOnly) {
    cy.nodes('.operation').forEach((node) => {
      if (!node.hasClass('critical') && !node.data('isCritical')) {
        node.addClass('hidden');
      }
    });
    cy.edges().forEach((edge) => {
      if (!edge.hasClass('critical') && !edge.data('isCritical')) {
        edge.addClass('hidden');
      }
    });
}
  
  // Скрываем заблокированные
  if (!graphFilters.showBlocked) {
      cy.nodes('.blocked').addClass('hidden');
  }
  
  // Скрываем бригады
  if (!graphFilters.showBrigades) {
      cy.nodes('.brigade').addClass('hidden');
      cy.edges('.assignment').addClass('hidden');
  }
  
  // Скрываем группы
  if (!graphFilters.showGroups) {
      cy.nodes('.group').addClass('hidden');
      cy.edges('.membership').addClass('hidden');
  }
}

// function markCriticalPathContinuous(cpList) {
//     if (!cy || !cpList || !cpList.length) return [];
//     cy.edges('.critical').removeClass('critical').data('isCritical', false);
//     cy.nodes('.operation').removeClass('critical');
//     const gaps = [];
//     for (let i = 0; i < cpList.length; i++) {
//       const node = cy.$id(`op${cpList[i]}`);
//       if (node.nonempty()) node.addClass('critical').data('isCritical', true);
//     }
//     for (let i = 0; i < cpList.length - 1; i++) {
//       const a = `op${cpList[i]}`, b = `op${cpList[i + 1]}`;
//       let edge = cy.edges(`[source = "${a}"][target = "${b}"]`);
//       if (edge.empty()) edge = cy.edges(`[source = "${b}"][target = "${a}"]`);
//       if (edge.nonempty()) edge.addClass('critical').data('isCritical', true);
//       else gaps.push({ from: cpList[i], to: cpList[i + 1] });
//     }
//     if (gaps.length) {
//       showNotification('Разрыв критического пути',
//         gaps.slice(0, 4).map(g => `#${g.from} → #${g.to}`).join('; '), 'warning');
//     }
//     return gaps;
//   }
  
  function clearPathHighlight() {
    if (!cy) return;
    cy.elements().removeClass('path-hl path-dim dimmed');
    cy.elements().removeClass('selected');
  }
  
  /** Путь от корней до node + от node до листьев (все предки и потомки по dependency) */
  function collectPathThrough(node) {
    if (!cy || !node || node.empty()) return cy.collection();
    const pred = node.predecessors('node.operation, edge.dependency');
    const succ = node.successors('node.operation, edge.dependency');
    return pred.union(node).union(succ);
  }
  
  function highlightPathForNode(node) {
    if (!cy || !node || node.empty()) return;
    clearPathHighlight();
  
    const path = collectPathThrough(node);
    cy.elements().addClass('dimmed');
    path.removeClass('dimmed').addClass('path-hl');
    node.removeClass('dimmed').addClass('path-hl selected');
  
    cy.animate({
      fit: { eles: path.nodes().length ? path.nodes() : node, padding: 50 },
      duration: 280
    });
  }
window.clearPathHighlight = clearPathHighlight;
window.highlightPathForNode = highlightPathForNode;

  function findAdvantagePath() {
    if (!cy) return [];
    const ops = cy.nodes('.operation');
    if (ops.empty()) return [];
    const starts = ops.filter(n => n.incomers('edge.dependency').empty());
    const ends = ops.filter(n => n.outgoers('edge.dependency').empty());
    if (starts.empty() || ends.empty()) return [];
    const dist = {}, prev = {}, used = {};
    ops.forEach(n => { dist[n.id()] = Infinity; prev[n.id()] = null; });
    starts.forEach(n => { dist[n.id()] = Number(n.data('duration')) || 1; });
    const pq = ops.map(n => n.id());
    while (pq.length) {
      pq.sort((a, b) => dist[a] - dist[b]);
      const u = pq.shift();
      if (used[u]) continue;
      used[u] = true;
      if (dist[u] === Infinity) break;
      cy.$id(u).outgoers('edge.dependency').forEach(edge => {
        const v = edge.target().id();
        if (used[v]) return;
        const nd = dist[u] + (Number(edge.target().data('duration')) || 1);
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
      });
    }
    let bestEnd = null, bestD = Infinity;
    ends.forEach(n => {
      if (dist[n.id()] < bestD) { bestD = dist[n.id()]; bestEnd = n.id(); }
    });
    if (!bestEnd || bestD === Infinity) return [];
    const path = [];
    for (let cur = bestEnd; cur; cur = prev[cur]) path.push(Number(String(cur).replace(/^op/, '')));
    path.reverse();
    return path;
  }
  
//   function highlightAdvantagePath(on) {
//     if (!cy) return;
//     cy.edges('.advantage').removeClass('advantage');
//     cy.nodes('.advantage').removeClass('advantage');
//     if (!on) return;
//     const path = findAdvantagePath();
//     if (!path.length) {
//       showNotification('Выгодный путь', 'Нет пути start→end', 'warning');
//       return;
//     }
//     const gaps = [];
//     path.forEach((num, i) => {
//       const node = cy.$id(`op${num}`);
//       if (node.nonempty()) node.addClass('advantage');
//       if (i < path.length - 1) {
//         const a = `op${num}`, b = `op${path[i + 1]}`;
//         let edge = cy.edges(`[source = "${a}"][target = "${b}"]`);
//         if (edge.empty()) edge = cy.edges(`[source = "${b}"][target = "${a}"]`);
//         if (edge.nonempty()) edge.addClass('advantage');
//         else gaps.push({ from: num, to: path[i + 1] });
//       }
//     });
//     if (gaps.length) {
//       showNotification('Разрыв выгодного пути',
//         gaps.slice(0, 4).map(g => `#${g.from} → #${g.to}`).join('; '), 'warning');
//     } else {
//       showNotification('Выгодный путь', `${path.length} оп. · голубым`, 'success');
//     }
//   }
function ensurePathEdges(path, className) {
    if (!cy || !path || path.length < 2) return [];
    const gaps = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = `op${path[i]}`, b = `op${path[i + 1]}`;
      let edge = cy.edges(`[source = "${a}"][target = "${b}"]`);
      if (edge.empty()) edge = cy.edges(`[source = "${b}"][target = "${a}"]`);
      if (edge.nonempty()) {
        edge.addClass(className);
        continue;
      }
      // виртуальное ребро пути
      const id = `pathlink-${className}-${path[i]}-${path[i + 1]}`;
      if (cy.$id(a).empty() || cy.$id(b).empty()) {
        gaps.push({ from: path[i], to: path[i + 1] });
        continue;
      }
      if (cy.$id(id).empty()) {
        cy.add({
          group: 'edges',
          data: { id, source: a, target: b, kind: 'path-virtual' },
          classes: `${className} path-virtual`
        });
      } else {
        cy.$id(id).addClass(className);
      }
    }
    return gaps;
  }
  
  function markCriticalPathContinuous(cpList) {
    if (!cy) return [];
    const path = (cpList || [])
      .map((id) => Number(String(id).replace(/^T/i, '')))
      .filter((n) => !Number.isNaN(n));

    // сброс
    cy.nodes('.operation').removeClass('critical').data('isCritical', false);
    cy.edges('.critical').removeClass('critical').data('isCritical', false);
    cy.edges('.path-virtual.critical').remove();

    if (!path.length) {
      console.warn('[CP] пустой critical path');
      return [];
    }

    path.forEach((num) => {
      const node = cy.$id(`op${num}`);
      if (node.nonempty()) {
        node.addClass('critical');
        node.data('isCritical', true);
      } else {
        console.warn('[CP] нет узла op' + num);
      }
    });

    const gaps = ensurePathEdges(path, 'critical');
    // пометить рёбра
    for (let i = 0; i < path.length - 1; i++) {
      const a = `op${path[i]}`;
      const b = `op${path[i + 1]}`;
      cy.edges().filter((e) => e.data('source') === a && e.data('target') === b)
        .addClass('critical')
        .data('isCritical', true);
    }

    if (gaps.length) {
      showNotification(
        'Разрыв критического пути',
        gaps.slice(0, 4).map((g) => `#${g.from} → #${g.to}`).join('; '),
        'warning'
      );
    }
    console.log('[CP] подсвечено узлов', path.length, 'разрывов', gaps.length);
    return gaps;
  }
  
  function highlightAdvantagePath(on) {
    if (!cy) return;
    cy.edges('.advantage').removeClass('advantage');
    cy.nodes('.advantage').removeClass('advantage');
    cy.edges('.path-virtual.advantage').remove();
    if (!on) return;
  
    let path = AdminState.aiAdvantagePath || [];
    if (!path.length) path = findAdvantagePath();
    if (!path.length) {
      showNotification('Выгодный путь', 'Нет пути start→end по зависимостям', 'warning');
      return;
    }
    AdminState.aiAdvantagePath = path;
  
    path.forEach((num) => {
      const node = cy.$id(`op${num}`);
      if (node.nonempty()) node.addClass('advantage');
    });
    const gaps = ensurePathEdges(path, 'advantage');
  
    const toast = document.querySelector('.toast, .notification');
    showNotification(
      'Выгодный путь',
      `${path.length} оп.` + (gaps.length ? ` · разрывов: ${gaps.length}` : ''),
      gaps.length ? 'warning' : 'success'
    );
  }


function toggleCompleted(show) {
  graphFilters.showCompleted = show;
  applyGraphFilters();
}

function toggleCriticalOnly(show) {
  graphFilters.showCriticalOnly = show;
  applyGraphFilters();
}

function toggleBlocked(show) {
  graphFilters.showBlocked = show;
  applyGraphFilters();
}

function toggleBrigades(show) {
  graphFilters.showBrigades = show;
  // Перестраиваем граф для добавления/удаления бригад
  renderGraph();
}

function toggleGroups(show) {
  graphFilters.showGroups = show;
  renderGraph();
}

/**
 * Заменить ЦЕЛИКОМ function changeGraphLayout(...) в admin-main.js
 * (сейчас ~строка 5857)
 */
function changeGraphLayout(layoutValue) {
    if (!window.cy) return;
  
    const raw = String(layoutValue || 'dagre:LR');
    const parts = raw.split(':');
    const name = parts[0];
    const rankDir = parts[1] || 'LR';
    const cy = window.cy;
    const n = cy.nodes().length || 0;
  
    // какие layout реально доступны после cytoscape.use
    function hasLayout(layoutName) {
      try {
        // cytoscape хранит расширения в plain object
        const ext = cytoscape('core', 'layout') || {};
        // более надёжно: пробный layout на пустом наборе не делаем —
        // проверяем через прототип регистрацию
        const layouts = (cytoscape.prototype && cytoscape.prototype._private) ? null : null;
        void layouts;
        // fallback: список известных зарегистрированных через use
        const known = window.__cyRegisteredLayouts || {};
        if (known[layoutName]) return true;
        // dagre/breadthfirst/cose/circle/grid/random — встроенные или dagre
        if (['breadthfirst', 'cose', 'circle', 'grid', 'random', 'preset', 'null'].includes(layoutName)) {
          return true;
        }
        if (layoutName === 'dagre' && (window.cytoscapeDagre || true)) return true;
        // если плагин на window — считаем доступным
        const map = {
          fcose: window.cytoscapeFcose,
          'cose-bilkent': window.cytoscapeCoseBilkent,
          cola: window.cytoscapeCola,
          elk: window.cytoscapeElk,
          dagre: window.cytoscapeDagre
        };
        return !!map[layoutName];
      } catch (_) {
        return false;
      }
    }
  
    let options;
  
    if (name === 'dagre') {
      options = {
        name: 'dagre',
        rankDir: rankDir || 'LR',
        nodeSep: rankDir === 'TB' ? 50 : 60,
        rankSep: rankDir === 'TB' ? 80 : 100,
        edgeSep: 16,
        spacingFactor: 1.5,
        ranker: 'tight-tree',
        animate: n < 200,
        animationDuration: 500,
        fit: true,
        padding: 48
      };
    } else if (name === 'elk') {
      options = {
        name: 'elk',
        animate: n < 250,
        animationDuration: 600,
        fit: true,
        padding: 48,
        elk: {
          algorithm: 'layered',
          'elk.direction': 'RIGHT',
          'elk.spacing.nodeNode': 48,
          'elk.layered.spacing.nodeNodeBetweenLayers': 64,
          'elk.edgeRouting': 'ORTHOGONAL'
        }
      };
    } else if (name === 'fcose') {
      options = {
        name: 'fcose',
        animate: true,
        animationDuration: 800,
        quality: n > 300 ? 'draft' : 'default',
        randomize: false,
        nodeSeparation: 70,
        idealEdgeLength: 90,
        packing: true,
        fit: true,
        padding: 48
      };
    } else if (name === 'cose-bilkent') {
      options = {
        name: 'cose-bilkent',
        animate: n < 250 ? 'end' : false,
        animationDuration: 700,
        nodeRepulsion: 4500,
        idealEdgeLength: 90,
        edgeElasticity: 0.45,
        gravity: 0.25,
        numIter: n > 300 ? 1500 : 2500,
        tile: true,
        fit: true,
        padding: 48
      };
    } else if (name === 'cola') {
      if (n > 280 && typeof showNotification === 'function') {
        showNotification('Граф', 'Cola на ' + n + ' узлах может тормозить', 'warning');
      }
      options = {
        name: 'cola',
        animate: true,
        maxSimulationTime: n > 200 ? 1200 : 2500,
        edgeLength: 100,
        nodeSpacing: 24,
        randomize: false,
        fit: true,
        padding: 48
      };
    } else if (name === 'breadthfirst') {
      options = {
        name: 'breadthfirst',
        directed: true,
        spacingFactor: 1.5,
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 48
      };
    } else if (name === 'cose') {
      options = {
        name: 'cose',
        idealEdgeLength: 100,
        nodeOverlap: 20,
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 48
      };
    } else {
      options = {
        name: 'dagre',
        rankDir: 'LR',
        fit: true,
        padding: 48
      };
    }
  
    // проверка плагина до run
    const needPlugin = ['elk', 'fcose', 'cose-bilkent', 'cola'].includes(name);
    if (needPlugin && !hasLayout(name)) {
      console.warn('[graph] layout plugin missing:', name, {
        fcose: !!window.cytoscapeFcose,
        bilkent: !!window.cytoscapeCoseBilkent,
        cola: !!window.cytoscapeCola,
        elk: !!window.cytoscapeElk
      });
      if (typeof showNotification === 'function') {
        showNotification(
          'Граф',
          'Layout ' + name + ' не загружен (нет плагина/CDN). Ставлю dagre.',
          'warning'
        );
      }
      options = {
        name: 'dagre',
        rankDir: 'LR',
        fit: true,
        padding: 48,
        animate: false
      };
    }
  
    try {
      cy.layout(options).run();
      try { localStorage.setItem('graphLayout', raw); } catch (_) {}
    } catch (e) {
      console.error('[graph] layout failed', name, e);
      if (typeof showNotification === 'function') {
        showNotification('Граф', 'Layout ' + name + ' упал: ' + (e.message || e), 'error');
      }
      try {
        cy.layout({ name: 'dagre', rankDir: 'LR', fit: true, padding: 48 }).run();
      } catch (e2) {
        console.error('[graph] dagre fallback failed', e2);
      }
    }
  }
  
  window.changeGraphLayout = changeGraphLayout;
  

// ================================================================
// АНИМАЦИИ
// ================================================================

function animateNodesAppearance() {
    if (!cy) return;
  
    const nodes = cy.nodes();
    nodes.style({ opacity: 0 });
  
    nodes.forEach((node, i) => {
      node.delay(i * 12).animate({
        style: { opacity: 1 },
        duration: 280,
        easing: 'ease-out-cubic'
      });
    });
  
    cy.edges().style({ opacity: 0 });
    setTimeout(() => {
      cy.edges().animate({
        style: { opacity: 1 },
        duration: 400,
        easing: 'ease-out'
      });
    }, 150);
  }

  function pulseCriticalPath() {
    if (!cy) return;
    const crit = cy.nodes('.critical');
  
    crit.animate({
      style: { 'border-width': 6 },
      duration: 350,
      easing: 'ease-in-out-sine',
      complete: function() {
        this.animate({
          style: { 'border-width': 3 },
          duration: 350,
          easing: 'ease-in-out-sine'
        });
      }
    });
  }

  function highlightPath(opNumber) {
    const node = cy.$(`#op${opNumber}`);
    if (!node.length) return;
  
    const neighborhood = node.closedNeighborhood(); // узел + связанные
  
    cy.elements().animate({ style: { opacity: 0.25 }, duration: 200 });
    neighborhood.animate({ style: { opacity: 1 }, duration: 250 });
  
    cy.animate({
      fit: { eles: neighborhood, padding: 60 },
      duration: 400,
      easing: 'ease-out-cubic'
    });
  }


  function resetHighlight() {
    cy.elements().animate({
      style: { opacity: 1 },
      duration: 200
    });
  }


function getRenderOptions(elementCount) {
  const heavy = elementCount > 200;
  return {
    textureOnViewport: true,
    hideEdgesOnViewport: heavy,
    pixelRatio: heavy && window.devicePixelRatio > 1.5 ? 1 : 'auto',
    wheelSensitivity: 1,
    boxSelectionEnabled: false,
    selectionType: 'single',
    minZoom: 0.08,
    maxZoom: 2.5
  };
}

function showNodeInfo(nodeData) {
  const panel = document.getElementById('nodeInfoPanel');
  const nameEl = document.getElementById('nodeName');
  const detailsEl = document.getElementById('nodeDetails');
  
  if (!panel) return;
  
  const op = AdminState.operations.find(o => o.op_number === nodeData.op_number);
  if (!op) return;
  
  const statusText = {
      completed: '✅ Завершено',
      progress: '🔄 В работе',
      pending: '⏳ Ожидает',
      blocked: '🔒 Заблокировано'
  };
  
  const missingDeps = (op.prev_ops || []).filter(prevId => {
      const prevOp = AdminState.operations.find(o => o.op_number === prevId);
      return !prevOp || prevOp.status !== 'completed';
  });
  
  nameEl.textContent = `Операция #${op.op_number}`;
  detailsEl.innerHTML = `
      <div class="node-info-row">
          <span class="node-info-label">Название:</span>
          <span class="node-info-value">${op.name}</span>
      </div>
      <div class="node-info-row">
          <span class="node-info-label">Статус:</span>
          <span class="node-info-status ${nodeData.status}">${statusText[nodeData.status] || statusText.pending}</span>
      </div>
      <div class="node-info-row">
          <span class="node-info-label">Бригада:</span>
          <span class="node-info-value">${nodeData.brigade_name}</span>
      </div>
      <div class="node-info-row">
          <span class="node-info-label">Группа:</span>
          <span class="node-info-value">${nodeData.brigade_group}</span>
      </div>
      <div class="node-info-row">
          <span class="node-info-label">Длительность:</span>
          <span class="node-info-value">${op.duration} ч</span>
      </div>
      <div class="node-info-row">
          <span class="node-info-label">Трудоёмкость:</span>
          <span class="node-info-value">${op.labor_hours} чел/ч</span>
      </div>
      <div class="node-info-row">
          <span class="node-info-label">Исполнителей:</span>
          <span class="node-info-value">${op.people_count}</span>
      </div>
      ${op.end_date ? `
      <div class="node-info-row">
          <span class="node-info-label">Срок:</span>
          <span class="node-info-value">${formatDate(op.end_date)}</span>
      </div>
      ` : ''}
      <div class="node-info-row">
          <span class="node-info-label">Критический путь:</span>
          <span class="node-info-value">${nodeData.isCritical ? '✅ Да' : '❌ Нет'}</span>
      </div>
      
      ${missingDeps.length > 0 ? `
      <div style="margin-top: 16px; padding: 14px; background: #fef2f2; border-radius: 10px; border-left: 3px solid #ef4444;">
          <strong style="color: #dc2626;">⚠️ Операция заблокирована</strong>
          <p style="margin: 8px 0 0; font-size: 12px; color: #7f1d1d;">
              Не выполнены предшествующие операции: ${missingDeps.join(', ')}
          </p>
      </div>
      ` : ''}
      
      <div class="node-info-deps">
          <h5>📋 Требует выполнения:</h5>
          <div class="deps-list">
              ${(op.prev_ops || []).length > 0 ? op.prev_ops.map(prevId => {
                  const prevOp = AdminState.operations.find(o => o.op_number === prevId);
                  const isCompleted = prevOp && prevOp.status === 'completed';
                  return `<span class="dep-tag ${isCompleted ? '' : 'missing'}" onclick="highlightNode(${prevId})">#${prevId} ${isCompleted ? '✅' : '❌'}</span>`;
              }).join('') : '<span style="color: #94a3b8;">Нет (стартовая операция)</span>'}
          </div>
      </div>
      
      <div class="node-info-deps">
          <h5>➡️ Открывает доступ к:</h5>
          <div class="deps-list">
              ${(op.next_ops || []).length > 0 ? op.next_ops.map(nextId => {
                  return `<span class="dep-tag" onclick="highlightNode(${nextId})">#${nextId}</span>`;
              }).join('') : '<span style="color: #94a3b8;">Нет (конечная операция)</span>'}
          </div>
      </div>
      
      <div style="display: flex; gap: 10px; margin-top: 20px;">
          <button class="btn btn-primary btn-sm" style="flex: 1;" onclick="editOperation(${op.id})">
              ✏️ Редактировать
          </button>
          <button class="btn btn-outline btn-sm" style="flex: 1;" onclick="highlightNode(${op.op_number})">
              🎯 Центрировать
          </button>
      </div>
  `;
  
  panel.classList.add('active');
}


function showBrigadeInfo(data) {
  const panel = document.getElementById('nodeInfoPanel');
  const nameEl = document.getElementById('nodeName');
  const detailsEl = document.getElementById('nodeDetails');
  
  if (!panel) return;
  
  const brigade = AdminState.brigades.find(b => b.id === data.brigade_id);
  if (!brigade) return;
  
  const workers = AdminState.workers.filter(w => w.brigade_id === brigade.id);
  const brigadeOps = AdminState.operations.filter(op => op.brigade_id === brigade.id);
  
  const importanceText = {
      critical: '🔥 Критическая',
      high: '⭐ Высокая',
      medium: '📌 Средняя',
      low: '🔹 Низкая'
  };
  
  nameEl.textContent = `👥 ${brigade.name}`;
  detailsEl.innerHTML = `
      <div class="node-info-row">
          <span class="node-info-label">Важность:</span>
          <span class="node-info-value">${importanceText[brigade.importance] || 'Средняя'}</span>
      </div>
      <div class="node-info-row">
          <span class="node-info-label">Состав:</span>
          <span class="node-info-value">${workers.length} / ${brigade.max_capacity} чел.</span>
      </div>
      <div class="node-info-row">
          <span class="node-info-label">Загрузка:</span>
          <span class="node-info-value">${Math.round(brigade.current_load || 0)}%</span>
      </div>
      <div class="node-info-row">
          <span class="node-info-label">Эффективность:</span>
          <span class="node-info-value">${Math.round((brigade.efficiency_rating || 1) * 100)}%</span>
      </div>
      <div class="node-info-row">
          <span class="node-info-label">Операций:</span>
          <span class="node-info-value">${brigadeOps.length}</span>
      </div>
      
      <div class="node-info-deps">
          <h5>👤 Рабочие (${workers.length}):</h5>
          <div class="deps-list">
              ${workers.map(w => `
                  <span class="dep-tag">
                      ${w.name} ${w.is_brigadier ? '👑' : ''}
                  </span>
              `).join('')}
          </div>
      </div>
      
      <div class="node-info-deps">
          <h5>📋 Операции бригады (${brigadeOps.length}):</h5>
          <div class="deps-list">
              ${brigadeOps.slice(0, 5).map(op => `
                  <span class="dep-tag" onclick="highlightNode(${op.op_number})">
                      #${op.op_number}
                  </span>
              `).join('')}
              ${brigadeOps.length > 5 ? `<span class="dep-tag">+${brigadeOps.length - 5}</span>` : ''}
          </div>
      </div>
      
      <button class="btn btn-primary btn-sm" style="margin-top: 16px; width: 100%;" onclick="switchTab('brigades'); closeAllModals();">
          📋 Перейти к бригаде
      </button>
  `;
  
  panel.classList.add('active');
}

function focusOperationByNumber(opNumber) {
    if (!cy) return;
    const node = cy.$id(`op${opNumber}`);
    if (node.empty()) {
        showNotification('Граф', `Операция #${opNumber} не на графе`, 'warning');
        return;
    }
    node.select();
    highlightPathForNode(node);
    if (typeof showNodeInfoPanel === 'function') showNodeInfoPanel(node.data());
  }
  window.focusOperationByNumber = focusOperationByNumber;

function showGroupInfo(data) {
  const panel = document.getElementById('nodeInfoPanel');
  const nameEl = document.getElementById('nodeName');
  const detailsEl = document.getElementById('nodeDetails');
  
  if (!panel) return;
  
  nameEl.textContent = `📦 ${data.name}`;
  detailsEl.innerHTML = `
      <div class="node-info-row">
          <span class="node-info-label">Бригад в группе:</span>
          <span class="node-info-value">${data.brigades_count}</span>
      </div>
      <div class="node-info-row">
          <span class="node-info-label">Всего рабочих:</span>
          <span class="node-info-value">${data.workers_count}</span>
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top: 16px; width: 100%;" onclick="switchTab('brigade-groups'); closeAllModals();">
          📋 Перейти к группам
      </button>
  `;
  
  panel.classList.add('active');
}

function showEdgeInfo(data) {
  const panel = document.getElementById('nodeInfoPanel');
  const nameEl = document.getElementById('nodeName');
  const detailsEl = document.getElementById('nodeDetails');
  
  if (!panel) return;
  
  if (data.type === 'dependency') {
      const sourceOp = AdminState.operations.find(o => o.op_number === data.sourceOp);
      const targetOp = AdminState.operations.find(o => o.op_number === data.targetOp);
      
      nameEl.textContent = '🔗 Связь операций';
      detailsEl.innerHTML = `
          <div class="node-info-row">
              <span class="node-info-label">Тип:</span>
              <span class="node-info-value">Технологическая зависимость</span>
          </div>
          <div class="node-info-row">
              <span class="node-info-label">От:</span>
              <span class="node-info-value">#${data.sourceOp} ${sourceOp?.name || ''}</span>
          </div>
          <div class="node-info-row">
              <span class="node-info-label">К:</span>
              <span class="node-info-value">#${data.targetOp} ${targetOp?.name || ''}</span>
          </div>
          <div class="node-info-row">
              <span class="node-info-label">Критический путь:</span>
              <span class="node-info-value">${data.isCritical ? '✅ Да' : '❌ Нет'}</span>
          </div>
          <div class="node-info-row">
              <span class="node-info-label">Статус:</span>
              <span class="node-info-value">${data.sourceCompleted ? '✅ Путь открыт' : '🔒 Заблокирован'}</span>
          </div>
          
          ${!data.sourceCompleted ? `
          <div style="margin-top: 16px; padding: 14px; background: #fef2f2; border-radius: 10px;">
              <strong style="color: #dc2626;">⚠️ Путь заблокирован</strong>
              <p style="margin: 8px 0 0; font-size: 12px;">Операция #${data.sourceOp} ещё не завершена</p>
          </div>
          ` : ''}
          
          <div style="display: flex; gap: 10px; margin-top: 20px;">
              <button class="btn btn-outline btn-sm" style="flex: 1;" onclick="highlightNode(${data.sourceOp})">
                  🎯 К источнику
              </button>
              <button class="btn btn-outline btn-sm" style="flex: 1;" onclick="highlightNode(${data.targetOp})">
                  🎯 К цели
              </button>
          </div>
      `;
  } else if (data.type === 'assignment') {
      nameEl.textContent = '🔗 Назначение';
      detailsEl.innerHTML = `
          <div class="node-info-row">
              <span class="node-info-label">Тип:</span>
              <span class="node-info-value">Бригада → Операция</span>
          </div>
          <div class="node-info-row">
              <span class="node-info-label">Бригада ID:</span>
              <span class="node-info-value">${data.brigade_id}</span>
          </div>
          <div class="node-info-row">
              <span class="node-info-label">Операция:</span>
              <span class="node-info-value">#${data.op_number}</span>
          </div>
      `;
  } else {
      nameEl.textContent = '🔗 Связь';
      detailsEl.innerHTML = `<p>Тип: ${data.type || 'неизвестно'}</p>`;
  }
  
  panel.classList.add('active');
}

function hideNodeInfo() {
  const panel = document.getElementById('nodeInfoPanel');
  if (panel) panel.classList.remove('active');
}

function highlightNode(opNumber) {
    if (!cy) return;
    const node = cy.$id(`op${opNumber}`);
    if (node.empty()) {
      showNotification('Граф', `Операция #${opNumber} не найдена на графе`, 'warning');
      return;
    }
    // путь целиком + панель
    highlightPathForNode(node);
    showNodeInfo(node.data());
  }
  window.highlightNode = highlightNode;

function checkDependenciesCompleted(op) {
  if (!op.prev_ops || op.prev_ops.length === 0) return true;
  
  return op.prev_ops.every(prevId => {
      const prevOp = AdminState.operations.find(o => o.op_number === prevId);
      return prevOp && prevOp.status === 'completed';
  });
}

function findBrigadeGroup(brigadeId) {
  const groups = window.brigadeGroupsData || [];
  return groups.find(g => (g.brigades || []).some(b => b.id === brigadeId));
}

function getBrigadeColor(brigade) {
  const importance = brigade.importance || 'medium';
  const colors = {
      critical: '#ef4444',
      high: '#f59e0b',
      medium: '#3b82f6',
      low: '#10b981'
  };
  return colors[importance] || '#3b82f6';
}

function getStatusIcon(status) {
  const icons = {
      completed: '✅',
      in_progress: '🔄',
      pending: '⏳',
      blocked: '🔒'
  };
  return icons[status] || '📋';
}

function truncate(text, maxLen) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 2) + '…';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

// ================================================================
// ЭКСПОРТ В WINDOW
// ================================================================

window.renderGraph = renderGraph;
window.changeGraphLayout = changeGraphLayout;
window.toggleCompleted = toggleCompleted;
window.toggleCriticalOnly = toggleCriticalOnly;
window.toggleBlocked = toggleBlocked;
window.toggleBrigades = toggleBrigades;
window.toggleGroups = toggleGroups;
window.highlightNode = highlightNode;
window.hideNodeInfo = hideNodeInfo;
window.showNodeInfo = showNodeInfo;
window.switchTab = switchTab;          // ← добавить
window.closeAllModals = closeAllModals;
window.renderGantt = renderGantt;
window.changeGanttView = changeGanttView;


function captureOpsSnapshot(label) {
    const ops = window.allOperationsCache || [];
    const total = ops.length;
    const completed = ops.filter((o) => o.status === 'completed').length;
    const inProgress = ops.filter((o) => o.status === 'in_progress').length;
    const blocked = ops.filter((o) => o.status === 'blocked').length;
    return {
      label,
      ts: Date.now(),
      total,
      completed,
      inProgress,
      blocked,
      pct: total ? +(completed / total * 100).toFixed(1) : 0,
      criticalLen: (AdminState.aiCriticalPath || AdminState.criticalPath || []).length,
      gaps:
        window.aiPanel?.lastGaps?.count ??
        window.aiPanel?.lastGaps?.gaps?.length ??
        null,
    };
  }

function buildPeriodReportRows() {
    const loadSnap = (daysAgo) => {
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        const key = 'dash_snap_' + d.toISOString().slice(0, 10);
        try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
    };
    const today = loadSnap(0) || captureOpsSnapshot('today');
    const periods = [
        { label: 'Сутки', snap: loadSnap(1) },
        { label: 'Неделя', snap: loadSnap(7) },
        { label: 'Месяц', snap: loadSnap(30) },
        { label: 'Полгода', snap: loadSnap(180) },
        { label: 'Год', snap: loadSnap(365) },
    ];
    const fmt = (v) => (v === null || v === undefined) ? 'нет данных' : (v > 0 ? `+${v}` : String(v));
    return periods.map((p) => ({
        label: p.label,
        completed: p.snap ? fmt(today.completed - (p.snap.completed || 0)) : 'нет данных',
        inProgress: p.snap ? fmt(today.inProgress - (p.snap.inProgress || 0)) : 'нет данных',
        pctNow: today.pct,
        pctThen: p.snap && p.snap.pct != null ? p.snap.pct : '—',
    }));
}

function getOptimizeCompare() {
    try {
        return JSON.parse(localStorage.getItem('optimizeCompareLast') || 'null');
    } catch {
        return null;
    }
}

function renderReportsCompare() {
    const periodBox = document.getElementById('reportPeriodTable');
    const optBox = document.getElementById('reportOptimizeTable');

    if (periodBox) {
        const rows = buildPeriodReportRows();
        periodBox.innerHTML = `
          <table class="report-table" style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="text-align:left;color:#64748b;border-bottom:1px solid #e2e8f0;">
                <th style="padding:8px 6px;">Период</th>
                <th style="padding:8px 6px;">Δ Завершено</th>
                <th style="padding:8px 6px;">Δ В работе</th>
                <th style="padding:8px 6px;">% сейчас</th>
                <th style="padding:8px 6px;">% тогда</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((r) => `
                <tr style="border-bottom:1px solid #f1f5f9;">
                  <td style="padding:8px 6px;font-weight:600;">${r.label}</td>
                  <td style="padding:8px 6px;">${r.completed}</td>
                  <td style="padding:8px 6px;">${r.inProgress}</td>
                  <td style="padding:8px 6px;">${r.pctNow}%</td>
                  <td style="padding:8px 6px;">${r.pctThen}${r.pctThen !== '—' ? '%' : ''}</td>
                </tr>`).join('')}
            </tbody>
          </table>
          <p style="font-size:11px;color:#94a3b8;margin-top:8px;">
            Снимки дня пишутся при обновлении дашборда. Пока нет снимка за период — «нет данных».
          </p>`;
    }

    if (optBox) {
        const cmp = getOptimizeCompare();
        if (!cmp) {
            optBox.innerHTML = `<p style="color:#64748b;font-size:13px;">Ещё не было оптимизации в этой сессии. Нажмите «AI оптимизация».</p>`;
        } else {
            const b = cmp.before || {};
            const a = cmp.after || {};
            const d = cmp.delta || {};
            const fmtD = (v) => (v > 0 ? `+${v}` : String(v ?? '—'));
            optBox.innerHTML = `
              <div style="font-size:12px;color:#64748b;margin-bottom:8px;">
                Последняя оптимизация: ${new Date(cmp.date).toLocaleString('ru-RU')}
              </div>
              <table class="report-table" style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                  <tr style="text-align:left;color:#64748b;border-bottom:1px solid #e2e8f0;">
                    <th style="padding:8px 6px;">Метрика</th>
                    <th style="padding:8px 6px;">До</th>
                    <th style="padding:8px 6px;">После</th>
                    <th style="padding:8px 6px;">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 6px;">Завершено</td><td>${b.completed ?? '—'}</td><td>${a.completed ?? '—'}</td><td>${fmtD(d.completed)}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 6px;">В работе</td><td>${b.inProgress ?? '—'}</td><td>${a.inProgress ?? '—'}</td><td>${fmtD(d.inProgress)}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 6px;">Блок</td><td>${b.blocked ?? '—'}</td><td>${a.blocked ?? '—'}</td><td>${fmtD(d.blocked)}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 6px;">% выполнения</td><td>${b.pct ?? '—'}%</td><td>${a.pct ?? '—'}%</td><td>—</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 6px;">Крит. путь (длина)</td><td>${b.criticalLen ?? '—'}</td><td>${a.criticalLen ?? '—'}</td><td>${fmtD(d.criticalLen)}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 6px;">Разрывы</td><td>${b.gaps ?? '—'}</td><td>${a.gaps ?? '—'}</td><td>${fmtD(d.gaps)}</td></tr>
                  <tr><td style="padding:8px 6px;">Длительность проекта</td><td>—</td><td>${a.projectDuration != null ? Number(a.projectDuration).toFixed(1) + ' дн' : '—'}</td><td>—</td></tr>
                </tbody>
              </table>`;
        }
    }
}

window.renderReportsCompare = renderReportsCompare;
window.buildPeriodReportRows = buildPeriodReportRows;
async function runOptimization() {
    showLoading('AI оптимизация...');
    
    try {
        const opsForAI =
          (window.allOperationsCache && window.allOperationsCache.length
            ? window.allOperationsCache
            : null) ||
          (AdminState.operations && AdminState.operations.length
            ? AdminState.operations
            : null) ||
          [];

        if (!opsForAI.length) {
          // одна попытка подтянуть с API
          try {
            await loadAllData();
          } catch (_) {}
        }
        const ops2 =
          (window.allOperationsCache && window.allOperationsCache.length
            ? window.allOperationsCache
            : AdminState.operations) || [];

        if (!ops2.length) {
          showNotification(
            'Внимание',
            'Нет операций для оптимизации. Откройте «Операции» или импорт.',
            'warning'
          );
          return;
        }

        window.allOperationsCache = ops2;

        const beforeOpt = captureOpsSnapshot('before_optimize');

        const result = await aiPanel.runOptimization(
          ops2,
          AdminState.brigades || [],
          { availableWorkers: AdminState.workers?.length || 50 }
        );
        
        const DOM = getDOM();
        
        if (DOM.aiPlanSummary) {
            aiPanel.renderPlanSummary('aiPlanSummary', result.summary);
        }
        
        if (DOM.aiCriticalPathChart) {
            aiPanel.renderCriticalPathChart('aiCriticalPathChart', result.plan);
        }
        
        if (DOM.aiBottleneckList) {
            aiPanel.renderBottleneckAnalysis('aiBottleneckList', aiPanel.lastBottlenecks);
        }
        
        if (DOM.aiMlRiskPanel) {
            try {
                const mlRisk = await aiPanel.predictProjectRisk(result.plan);
                aiPanel.renderMlRisk('aiMlRiskPanel', mlRisk);
            } catch (riskErr) {
                console.warn('ML risk prediction failed:', riskErr);
                aiPanel.renderMlRisk('aiMlRiskPanel', { success: false, message: 'Прогноз риска недоступен' });
            }
        }

        if (DOM.aiAnomalyPanel) {
            try {
                const anomalyData = await aiPanel.detectAnomalies();
                aiPanel.renderAnomalies('aiAnomalyPanel', anomalyData);
            } catch (anomErr) {
                console.warn('Anomaly detection failed:', anomErr);
                aiPanel.renderAnomalies('aiAnomalyPanel', { success: false, message: 'Проверка аномалий недоступна' });
            }
        }
        
        persistAiPanelSnapshot();
        persistAIPaths();

        const plan = result.plan || result;

        if (plan && typeof aiPanel.renderGaps === 'function') {
            console.log('gaps payload', plan.gaps, plan.bridge_proposals);
            aiPanel.renderGaps(
                'aiGapsPanel',
                plan.gaps || aiPanel.lastGaps || null,
                plan.bridge_proposals || aiPanel.lastBridge || null
            );
        }

        // --- критический путь из AI (+ fallback CPM) ---
        const rawCp =
          result.summary?.criticalPath ||
          plan?.critical_path_ids ||
          plan?.critical_path ||
          [];

        let cpIds = (Array.isArray(rawCp) ? rawCp : [])
          .map((x) => {
            if (x == null) return NaN;
            if (typeof x === "object")
              x = x.id ?? x.op_number ?? x.task_id;
            return Number(String(x).replace(/^T/i, ""));
          })
          .filter((n) => !Number.isNaN(n));

        if (!cpIds.length) {
          try {
            const cpm = await api.calculateCPM();
            const fromCpm = cpm?.critical_path || cpm?.critical_path_ids || [];
            cpIds = (fromCpm || [])
              .map((x) => {
                if (x == null) return NaN;
                if (typeof x === "object")
                  x = x.id ?? x.op_number ?? x.task_id;
                return Number(String(x).replace(/^T/i, ""));
              })
              .filter((n) => !Number.isNaN(n));
            console.warn("[AI] path empty → CPM fallback", cpIds.length);
          } catch (e) {
            console.warn("[AI] CPM fallback failed", e);
          }
        }

        if (cpIds.length) {
          AdminState.aiCriticalPath = cpIds;
          AdminState.criticalPath = [...cpIds];
          if (result.summary) result.summary.criticalPath = cpIds;
          persistAIPaths();
        }

        // --- длительность ---
        if (!result.summary) result.summary = {};
        {
          let dur = Number(
            plan?.total_duration_days ??
              plan?.project_duration_days ??
              plan?.stats?.project_duration_days ??
              result.summary.projectDuration ??
              0
          );
          if (!(dur > 0) && cpIds.length) {
            const opsAll =
              window.allOperationsCache ||
              AdminState.operations ||
              [];
            const byNum = new Map();
            opsAll.forEach((o) => {
              const k = String(o.op_number ?? "").replace(/^T/i, "");
              if (k) byNum.set(k, o);
            });
            let hours = 0;
            cpIds.forEach((id) => {
              const o = byNum.get(String(id).replace(/^T/i, ""));
              if (!o) return;
              let h = Number(o.duration);
              if (!(h > 0) && o.labor_hours != null) {
                h =
                  Number(o.labor_hours) /
                  Math.max(1, Number(o.people_count) || 1);
              }
              if (!(h > 0) && o.planned_hours != null) {
                h = Number(o.planned_hours);
              }
              if (h > 0) hours += h;
            });
            // duration в БД часто в часах → дни
            dur = hours / 8;
          }
          result.summary.projectDuration = dur > 0 ? dur : 0;
          result.summary.criticalPath = cpIds.map(String);
        }

        // --- рекомендации из крит. пути, если AI пуст ---
        let recs = Array.isArray(result.recommendations)
          ? result.recommendations
          : [];
        if (!recs.length && cpIds.length) {
          const opsAll =
            window.allOperationsCache || AdminState.operations || [];
          const byNum = new Map(
            opsAll.map((o) => [
              String(o.op_number ?? "").replace(/^T/i, ""),
              o,
            ])
          );
          recs = cpIds.slice(0, 25).map((id) => {
            const key = String(id).replace(/^T/i, "");
            const o = byNum.get(key) || {};
            const h =
              Number(o.duration) ||
              (o.labor_hours != null
                ? Number(o.labor_hours) /
                  Math.max(1, Number(o.people_count) || 1)
                : 0);
            return {
              type: "critical_path_task",
              severity: "critical",
              task_name: o.name || `#${key}`,
              task_id: key,
              op_number: key,
              duration: h > 0 ? h / 8 : null,
              message: `Критический путь: ${o.name || "#" + key}`,
              suggestion:
                "Контроль сроков и ресурсов — срыв сдвигает весь проект",
            };
          });
          result.recommendations = recs;
        }

        aiPanel._lastRecommendations = recs;
        aiPanel._lastSummary = result.summary;
        aiPanel.renderPlanSummary?.("aiPlanSummary", result.summary);
        ["aiRecommendations", "aiRecommendationsDash"].forEach((id) => {
          if (document.getElementById(id)) {
            aiPanel.renderRecommendations(id, recs);
          }
        });
        persistAiPanelSnapshot?.();

        if (typeof renderGraph === 'function') renderGraph();
        // после renderGraph setTimeout сам подсветит

                // --- критический путь из AI ---
        // --- выгодный путь ---
        const scored = plan?.graph_analysis?.scored_paths
            || plan?.graph_analysis?.paths
            || [];
        if (Array.isArray(scored) && scored.length) {
            const best = scored[0].nodes || scored[0].path || scored[0];
            if (Array.isArray(best)) {
                AdminState.aiAdvantagePath = best
                    .map((x) => Number(String(x).replace(/^T/i, '')))
                    .filter((n) => !Number.isNaN(n));
            }
        }
        
        persistAIPaths();

        const cpShow = AdminState.aiCriticalPath.length
            ? AdminState.aiCriticalPath
            : (AdminState.criticalPath || []);

        // ОДИН вызов UI — не затирать вторым
        if (typeof updateCriticalPathUI === 'function') {
            updateCriticalPathUI({
                critical_path: cpShow,
                project_duration: result.summary?.projectDuration,
                critical_path_length: cpShow.length
            });
        }

        const ops = window.allOperationsCache || AdminState.operations || [];
        if (typeof updateDashboardCards === 'function') {
            updateDashboardCards(ops, AdminState.brigades || []);
        }
        if (typeof renderCharts === 'function') renderCharts();
        if (typeof collectDashboardAlerts === 'function' && typeof renderDashboardAlerts === 'function') {
            renderDashboardAlerts(
                collectDashboardAlerts(ops, AdminState.brigades || [], cpShow)
            );
        }

        if (typeof renderGraph === 'function') renderGraph();
        else if (cy && typeof markCriticalPathContinuous === 'function') {
            markCriticalPathContinuous(cpShow);
        }
        
        await loadAIRecommendations();
        
        // --- снимок ПОСЛЕ + сравнение ---
        const afterOpt = captureOpsSnapshot('after_optimize');
        if (result?.summary) {
            afterOpt.criticalLen = (result.summary.criticalPath || []).length || afterOpt.criticalLen;
            afterOpt.projectDuration = result.summary.projectDuration ?? result.summary.duration ?? null;
        }
        afterOpt.gaps = window.aiPanel?.lastGaps?.count
            ?? window.aiPanel?.lastGaps?.gaps?.length
            ?? afterOpt.gaps;

        const optCompare = {
            date: new Date().toISOString(),
            before: beforeOpt,
            after: afterOpt,
            delta: {
                completed: afterOpt.completed - beforeOpt.completed,
                inProgress: afterOpt.inProgress - beforeOpt.inProgress,
                blocked: afterOpt.blocked - beforeOpt.blocked,
                gaps: (afterOpt.gaps ?? 0) - (beforeOpt.gaps ?? 0),
                criticalLen: afterOpt.criticalLen - beforeOpt.criticalLen,
                projectDuration: (afterOpt.projectDuration ?? null),
            }
        };
        try {
            localStorage.setItem('optimizeCompareLast', JSON.stringify(optCompare));
            const hist = JSON.parse(localStorage.getItem('optimizeCompareHist') || '[]');
            hist.unshift(optCompare);
            localStorage.setItem('optimizeCompareHist', JSON.stringify(hist.slice(0, 60)));
        } catch (_) {}

        if (typeof renderReportsCompare === 'function') {
            renderReportsCompare();
        }

        const finalRecs =
                result.recommendations ||
                aiPanel._lastRecommendations ||
                [];
                if (finalRecs.length) {
                ["aiRecommendations", "aiRecommendationsDash"].forEach((id) => {
                    if (document.getElementById(id)) {
                    aiPanel.renderRecommendations(id, finalRecs);
                    }
                });
                }

        const cpLen = (AdminState.aiCriticalPath || result.summary?.criticalPath || []).length;
        const dur = Number(result.summary?.projectDuration) || 0;
        if (result.success && (cpLen > 0 || dur > 0)) {
            showNotification(
              'Успех',
              `Проект: ${dur.toFixed(1)} дн, Критических: ${cpLen}`,
              'success'
            );
        } else if (result.success) {
            showNotification(
              'AI',
              'Ответ получен, но критический путь пуст',
              'warning'
            );
        } else if (result.error) {
        } else if (result.error) {
            showNotification('Предупреждение', 
                `Оптимизация выполнена с ограничениями: ${result.error}`, 
                'warning');
        }
            
    } catch (e) { 
        console.error('Ошибка оптимизации:', e);
        showNotification('Ошибка', e.message || 'Не удалось выполнить оптимизацию', 'error'); 
    } finally { 
        hideLoading(); 
    }
}
async function loadAIRecommendations() {
    const DOM = getDOM();
    
    try {
        let modelStatus;
        try {
            modelStatus = await aiPanel.getModelStatus();
        } catch (e) {
            console.warn('AI model status unavailable:', e);
            modelStatus = aiPanel.getDefaultModelStatus();
        }
        
        if (DOM.aiModelStatus) {
            aiPanel.renderModelStatus('aiModelStatus', modelStatus);
        }
        
        let engineStatus = null;
        try {
            engineStatus = await aiPanel.getEngineStatus();
        } catch (e) {
            console.warn('AI engine status unavailable:', e);
        }
        
        if (DOM.aiEngineStatus) {
            if (engineStatus) {
                const hasPlan = engineStatus.engine?.has_plan;
                DOM.aiEngineStatus.innerHTML = hasPlan 
                    ? `<span style="color:#22c55e;font-weight:600;">✓ План построен</span> (${engineStatus.engine?.project_duration_days?.toFixed(1) || 0} дн)`
                    : `<span style="color:#6b7280;">План не построен</span>`;
            } else {
                DOM.aiEngineStatus.innerHTML = `<span style="color:#ef4444;">AI Engine недоступен</span>`;
            }
        }
        
        const systemStatusEl = document.getElementById('aiSystemStatus');
        if (systemStatusEl) {
            aiPanel.renderSystemStatus('aiSystemStatus', engineStatus, modelStatus);
        }
        
    } catch (e) {
        console.warn('AI recommendations load failed:', e);
    }
}

async function trainAIModel() {
    showLoading('Обучение модели...');
    
    try {
        const result = await aiPanel.trainDelayModel();
        
        if (result.status === 'success') {
            showNotification('Успех', 
                result.message || `Модель обучена на ${result.samples} примерах`, 
                'success');
        } else if (result.status === 'already_running') {
            showNotification('Информация', 
                result.message || 'Обучение уже выполняется', 
                'info');
        } else {
            showNotification('Предупреждение', 
                result.message || 'Недостаточно данных для обучения', 
                'warning');
        }
        
        try {
            const modelStatus = await aiPanel.getModelStatus();
            const DOM = getDOM();
            if (DOM.aiModelStatus) {
                aiPanel.renderModelStatus('aiModelStatus', modelStatus);
            }
            // NEW — полоски feature_importances_ после train
            await aiPanel.loadFeatureImportance?.();
        } catch (statusErr) {
            console.warn('Не удалось обновить статус моделей:', statusErr);
        }
        
    } catch (e) {
        console.error('Ошибка обучения модели:', e);
        showNotification('Ошибка', e.message || 'Не удалось обучить модель', 'error');
    } finally {
        hideLoading();
    }
}

function switchTab(tabId) {
    AdminState.currentTab = tabId;
    const DOM = getDOM();

    DOM.navItems?.forEach((i) =>
        i.classList.toggle('active', i.dataset.tab === tabId)
    );
    DOM.tabPanes?.forEach((p) =>
        p.classList.toggle('active', p.id === `${tabId}-tab`)
    );

    const titles = {
        dashboard: 'Дашборд',
        graph: 'Граф процессов',
        gantt: 'Диаграмма Ганта',
        operations: 'Операции',
        brigades: 'Бригады',
        'brigade-groups': 'Группы бригад',
        workers: 'Рабочие',
        ai: 'AI Оптимизация',
        reports: 'Отчёты',
        messages: 'Сообщения',
        settings: 'Настройки'
    };

    const title = titles[tabId] || tabId;

    if (DOM.pageTitle) DOM.pageTitle.textContent = title;

    // крошки: Главная / <текущая страница>
    const crumbs = document.getElementById('breadcrumbs');
    if (crumbs) {
        if (tabId === 'dashboard') {
            crumbs.innerHTML = `<span class="current">Главная</span>`;
        } else {
            crumbs.innerHTML = `
                <span>Главная</span>
                <span class="separator">/</span>
                <span class="current">${title}</span>`;
        }
    }

    if (tabId === 'graph') setTimeout(renderGraph, 100);
    if (tabId === 'gantt') setTimeout(() => {
        if (typeof renderGantt === 'function') renderGantt();
    }, 100);
    if (tabId === 'dashboard') {
      setTimeout(() => {
        if (typeof updateDashboardCards === 'function') {
          updateDashboardCards(allOperationsCache || AdminState.operations || [], AdminState.brigades || []);
        }
        if (typeof renderCharts === 'function') renderCharts();
      }, 50);
    }
    if (tabId === 'brigade-groups') loadBrigadeGroups();

    if (tabId === 'brigades') {
        setTimeout(() => {
            updateBrigadesCache();
            renderBrigadesGrid();
        }, 50);
    }

    if (tabId === 'workers') {
        setTimeout(() => {
            populateWorkerBrigadeFilter();
            updateWorkersCache();
            renderWorkersGrid();
        }, 50);
    }

    if (tabId === 'reports') {
        if (typeof renderReportsCompare === 'function') {
            renderReportsCompare();
        }
    }
    if (tabId === 'messages') {
      loadChatThreadsAdmin?.();
      fillChatTemplatesAdmin?.();
      loadChatPeerOptionsAdmin?.();
    }
}
const raw = document.getElementById('chatPeerValue')?.value || '';
document.getElementById('refreshBtn')?.addEventListener('click', () => loadAllData());
function showLoading(text = 'Загрузка...') {
    const DOM = getDOM();
    if (DOM.loadingOverlay) { DOM.loadingOverlay.style.display = 'flex'; if (DOM.loadingText) DOM.loadingText.textContent = text; }
}

function hideLoading() { const DOM = getDOM(); if (DOM.loadingOverlay) DOM.loadingOverlay.style.display = 'none'; }

function showNotification(title, msg, type = 'info') {
    const DOM = getDOM();
    if (!DOM.notificationsContainer) return;
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.innerHTML = `<div><strong>${title}</strong></div><div>${msg}</div><button onclick="this.parentElement.remove()" style="margin-left:auto;">&times;</button>`;
    DOM.notificationsContainer.appendChild(n);
    setTimeout(() => n.remove(), 5000);
}

// function closeAllModals() {
//     document.getElementById('operationModal')?.remove();
//     document.getElementById('brigadeModal')?.remove();
//     document.getElementById('workerModal')?.remove();
//     document.getElementById('brigadeGroupModal')?.remove();
//     document.getElementById('brigadeGroupsModal')?.remove();
//     document.getElementById('manageGroupModal')?.remove();
//     document.getElementById('brigadeTaskModal')?.remove();
//     document.getElementById('brigadeGroupsModal')?.remove();
//     const DOM = getDOM();
//     if (DOM.modalOverlay) DOM.modalOverlay.style.display = 'none';
// }

function closeAllModals() {
    // Удаляем все модальные окна по ID
    const modalIds = [
        'operationModal', 'brigadeModal', 'workerModal', 
        'brigadeGroupModal', 'brigadeGroupsModal', 'manageGroupModal', 
        'brigadeTaskModal', 'workerSelectModal'
    ];
    
    modalIds.forEach(id => {
        const modal = document.getElementById(id);
        if (modal) modal.remove();
    });
    
    // Также удаляем по классу (на случай если ID не задан)
    document.querySelectorAll('.modal').forEach(m => m.remove());
    
    const DOM = getDOM();
    if (DOM.modalOverlay) DOM.modalOverlay.style.display = 'none';
}

async function logout() { try { await window.electronAPI?.navigation?.logout(); } catch (e) {} }

// Глобальные функции
window.selectOperation = selectOperation;
window.editOperation = (id) => openOperationModal(AdminState.operations.find(o => o.id === id));
window.deleteOperation = async (id) => { if (confirm('Удалить?')) { await api.deleteOperation(id); await loadAllData(); } };
window.editBrigade = (id) => openBrigadeModal(AdminState.brigades.find(b => b.id === id));
window.deleteBrigade = async (id) => { if (confirm('Удалить?')) { await api.deleteBrigade(id); await loadAllData(); } };
window.editWorker = (id) => openWorkerModal(AdminState.workers.find(w => w.id === id));
window.deleteWorker = async (id) => { if (confirm('Удалить?')) { await api.deleteWorker(id); await loadAllData(); } };
window.saveOperation = saveOperation;
window.saveBrigade = saveBrigade;
window.saveWorker = saveWorker;
window.closeAllModals = closeAllModals;


// ================================================================
// ДИАГРАММА ГАНТА
// ================================================================
let ganttEditMode = false;
let ganttOrder = [];

function toggleGanttEditMode(on) {
  ganttEditMode = !!on;
  const box = document.getElementById('ganttChart');
  if (box) box.classList.toggle('gantt-readonly', !ganttEditMode);
  renderGantt();
}
window.toggleGanttEditMode = toggleGanttEditMode;

function daysBetween(startStr, endStr) {
  const a = new Date(startStr), b = new Date(endStr);
  return Math.max(1, Math.round((b - a) / 86400000));
}

async function persistGanttDates(opNumber, startStr, endStr) {
  const cache = window.allOperationsCache || AdminState.operations || [];
  const op = cache.find(o => o.op_number === opNumber);
  if (!op || !op.id) return;
  const durationHours = Math.max(1, daysBetween(startStr, endStr) * 8);
  op.start_date = startStr;
  op.end_date = endStr;
  op.duration = durationHours;
  try {
    await api.updateOperation(op.id, {
      start_date: startStr,
      end_date: endStr,
      duration: durationHours
    });
    showNotification('Сохранено', `#${opNumber}: ${startStr} → ${endStr}`, 'success');
  } catch (e) {
    showNotification('Ошибка', e.message || 'Не сохранено', 'error');
  }
}

function openGanttTaskModal(opNumber) {
  const cache = window.allOperationsCache || AdminState.operations || [];
  const op = cache.find(o => o.op_number === opNumber);
  if (!op) {
    showNotification('Гантт', `Операция #${opNumber} не найдена`, 'warning');
    return;
  }
  let start = (op.start_date || new Date().toISOString()).toString().slice(0, 10);
  let end = op.end_date ? String(op.end_date).slice(0, 10) : null;
  if (!end) {
    const d = new Date(start);
    d.setDate(d.getDate() + Math.max(1, Math.ceil((op.duration || 8) / 8)));
    end = d.toISOString().slice(0, 10);
  }

  document.getElementById('ganttTaskModal')?.remove();
  const overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.style.display = 'flex';

  const modal = document.createElement('div');
  modal.id = 'ganttTaskModal';
  modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:14px;padding:22px;width:min(420px,94vw);z-index:10002;box-shadow:0 20px 50px rgba(0,0,0,.25);';
  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h3 style="margin:0;font-size:16px;">#${op.op_number} · правка</h3>
      <button type="button" id="ganttModalClose" style="border:0;background:none;font-size:22px;cursor:pointer;">×</button>
    </div>
    <p style="margin:0 0 12px;font-size:13px;color:#64748b;">${op.name || '—'}</p>
    <label style="font-size:12px;color:#64748b;">Начало</label>
    <input type="date" id="ganttStart" class="input" value="${start}" style="width:100%;margin:4px 0 10px;">
    <label style="font-size:12px;color:#64748b;">Окончание</label>
    <input type="date" id="ganttEnd" class="input" value="${end}" style="width:100%;margin:4px 0 10px;">
    <label style="font-size:12px;color:#64748b;">Длительность (ч)</label>
    <input type="number" id="ganttDur" class="input" min="1" step="0.5" value="${op.duration || 8}" style="width:100%;margin:4px 0 14px;">
    <div style="display:flex;gap:8px;margin-bottom:14px;">
      <button type="button" class="btn btn-outline btn-sm" id="ganttMoveUp">↑ Выше</button>
      <button type="button" class="btn btn-outline btn-sm" id="ganttMoveDown">↓ Ниже</button>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button type="button" class="btn btn-outline" id="ganttModalCancel">Отмена</button>
      <button type="button" class="btn btn-primary" id="ganttModalSave">Сохранить</button>
    </div>`;
  document.body.appendChild(modal);

  const close = () => {
    modal.remove();
    if (overlay) overlay.style.display = 'none';
  };
  document.getElementById('ganttModalClose').onclick = close;
  document.getElementById('ganttModalCancel').onclick = close;
  document.getElementById('ganttModalSave').onclick = async () => {
    const s = document.getElementById('ganttStart').value;
    const e = document.getElementById('ganttEnd').value;
    op.duration = Number(document.getElementById('ganttDur').value) || 8;
    await persistGanttDates(op.op_number, s, e);
    close();
    renderGantt();
  };
  document.getElementById('ganttMoveUp').onclick = () => { moveGanttRow(op.op_number, -1); };
  document.getElementById('ganttMoveDown').onclick = () => { moveGanttRow(op.op_number, +1); };
}
window.openGanttTaskModal = openGanttTaskModal;

function moveGanttRow(opNumber, dir) {
  if (!ganttEditMode) {
    showNotification('Заблокировано', 'Включите «Редактирование»', 'warning');
    return;
  }
  const ops = window.allOperationsCache || AdminState.operations || [];
  if (!ganttOrder.length) ganttOrder = ops.map(o => o.op_number);
  const i = ganttOrder.indexOf(opNumber);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ganttOrder.length) return;
  [ganttOrder[i], ganttOrder[j]] = [ganttOrder[j], ganttOrder[i]];
  try { localStorage.setItem('ganttOrder', JSON.stringify(ganttOrder)); } catch (_) {}
  renderGantt();
}


function collectGanttPathOpNumbers(opNumber) {
    const ops = window.allOperationsCache || AdminState.operations || [];
    const byNum = {};
    ops.forEach(o => { byNum[Number(o.op_number)] = o; });
  
    const start = Number(opNumber);
    const path = new Set([start]);
  
    // предки
    const stack = [...(byNum[start]?.prev_ops || [])].map(Number);
    while (stack.length) {
      const n = Number(stack.pop());
      if (!n || path.has(n) || !byNum[n]) continue;
      path.add(n);
      (byNum[n].prev_ops || []).forEach(p => stack.push(Number(p)));
    }
  
    // потомки по next_ops + по «кто ссылается в prev_ops»
    let changed = true;
    while (changed) {
      changed = false;
      ops.forEach(o => {
        const n = Number(o.op_number);
        if (path.has(n)) return;
        const prevs = (o.prev_ops || []).map(Number);
        if (prevs.some(p => path.has(p))) {
          path.add(n);
          changed = true;
        }
      });
    }
    return path;
  }
  
  function clearGanttPathHighlight() {
    document.querySelectorAll('#ganttChart .bar-wrapper').forEach(el => {
      el.classList.remove('gantt-path-hl', 'gantt-path-dim', 'gantt-path-focus');
    });
    document.querySelectorAll('#ganttChart .arrow').forEach(a => {
      a.classList.remove('gantt-arrow-dim', 'gantt-arrow-hl');
    });
    clearGanttPathOverlay();
  }

 
  function highlightGanttPath(opNumber) {
    clearGanttPathHighlight();
  
    const path = collectGanttPathOpNumbers(opNumber);
    const focus = Number(opNumber);
  
    document.querySelectorAll('#ganttChart .bar-wrapper').forEach(el => {
      const num = Number(el.getAttribute('data-op'));
      if (num && path.has(num)) {
        el.classList.add('gantt-path-hl');
        if (num === focus) el.classList.add('gantt-path-focus');
      } else {
        el.classList.add('gantt-path-dim');
      }
    });
  
    // штатные стрелки Frappe приглушить
    document.querySelectorAll('#ganttChart .arrow').forEach(a => {
        a.classList.add('gantt-arrow-dim');
      });
    
      requestAnimationFrame(() => drawGanttPathLinks(path));
  
    if (path.size <= 1) {
      console.warn('[Gantt] Нет связанных prev_ops — только эта операция', focus);
    }
    // console.log('[path overlay]', {
    //     nodes: Object.keys(anchors).length,
    //     pathSize: pathSet.size
    //   });
  }

  window.highlightGanttPath = highlightGanttPath;
  window.clearGanttPathHighlight = clearGanttPathHighlight;

  function ensureGanttPathLayer() {
    const host = document.getElementById('ganttChart');
    if (!host) return null;
  
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
  
    let svg = document.getElementById('ganttPathOverlay');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = 'ganttPathOverlay';
      host.appendChild(svg);
    } else if (svg.parentNode !== host) {
      host.appendChild(svg);
    }
  
    // ПОВЕРХ графика — иначе фон строк перекрывает линии
    svg.style.cssText =
      'position:absolute;left:0;top:0;width:100%;height:100%;' +
      'pointer-events:none;z-index:15;overflow:visible;';
  
    const ganttSvg = host.querySelector('svg.gantt');
    const w = Math.max(host.scrollWidth, ganttSvg?.clientWidth || 0, host.clientWidth || 0);
    const h = Math.max(host.scrollHeight, ganttSvg?.clientHeight || 0, host.clientHeight || 0);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.style.width = w + 'px';
    svg.style.height = h + 'px';
    return svg;
  }
  
  function clearGanttPathOverlay() {
    const svg = document.getElementById('ganttPathOverlay');
    if (svg) svg.innerHTML = '';
  }
  
  function drawGanttPathLinks(pathSet) {
    const svg = ensureGanttPathLayer();
    if (!svg) return;
    svg.innerHTML = '';
  
    const host = document.getElementById('ganttChart');
    if (!host) return;
    const hostRect = host.getBoundingClientRect();
  
    const ganttSvg = host.querySelector('svg.gantt');
    const w = Math.max(host.scrollWidth, ganttSvg?.clientWidth || 0, host.clientWidth || 0);
    const h = Math.max(host.scrollHeight, ganttSvg?.clientHeight || 0, host.clientHeight || 0);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.style.width = w + 'px';
    svg.style.height = h + 'px';
  
    const anchors = {};
    document.querySelectorAll('#ganttChart .bar-wrapper.gantt-path-hl').forEach(el => {
      const num = Number(el.getAttribute('data-op'));
      if (!num) return;
      const bar = el.querySelector('.bar') || el;
      const r = bar.getBoundingClientRect();
      const x0 = r.left - hostRect.left + (host.scrollLeft || 0);
      const y0 = r.top - hostRect.top + (host.scrollTop || 0);
      anchors[num] = {
        L: { x: x0, y: y0 + r.height / 2 },
        R: { x: x0 + r.width, y: y0 + r.height / 2 },
        T: { x: x0 + r.width / 2, y: y0 },
        B: { x: x0 + r.width / 2, y: y0 + r.height },
        x0, y0,
        x1: x0 + r.width,
        y1: y0 + r.height
      };
    });
  
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <marker id="ganttPathArrow" markerWidth="10" markerHeight="8"
              refX="10" refY="4" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M0,0 L10,4 L0,8 Z" fill="#10b981"/>
      </marker>`;
    svg.appendChild(defs);
  
    const ARROW = 14;
    const gap = 10;
    const laneStep = 14;
    let edgeIndex = 0;
  
    function route(fromId, toId) {
      const A = anchors[fromId];
      const B = anchors[toId];
      if (!A || !B) return null;
  
      const lane = (edgeIndex % 6) * laneStep;
  
      // from левее to: справа → канал → слева
      if (A.x1 + gap * 2 < B.x0) {
        const xBus = A.x1 + gap + 12 + lane;
        const endX = B.x0 - gap - ARROW;
        return `M ${A.R.x} ${A.R.y} L ${xBus} ${A.R.y} L ${xBus} ${B.L.y} L ${endX} ${B.L.y}`;
      }
  
      // from правее to: слева → канал → справа
      if (B.x1 + gap * 2 < A.x0) {
        return `M ${A.L.x} ${A.L.y} L ${A.L.x - gap - lane} ${A.L.y} L ${A.L.x - gap - lane} ${B.R.y} L ${B.R.x + gap} ${B.R.y}`;
      }
  
      // пересечение по X: сверху или снизу
      if (A.T.y <= B.T.y) {
        const yBus = Math.min(A.T.y, B.T.y) - 16 - lane;
        return `M ${A.T.x} ${A.T.y} L ${A.T.x} ${yBus} L ${B.T.x} ${yBus} L ${B.T.x} ${B.T.y - gap}`;
      }
      const yBus = Math.max(A.B.y, B.B.y) + 16 + lane;
      return `M ${A.B.x} ${A.B.y} L ${A.B.x} ${yBus} L ${B.B.x} ${yBus} L ${B.B.x} ${B.B.y + gap}`;
    }
  
    const ops = window.allOperationsCache || [];
    ops.forEach(o => {
      const to = Number(o.op_number);
      if (!pathSet.has(to) || !anchors[to]) return;
      (o.prev_ops || []).forEach(p => {
        const from = Number(p);
        if (!pathSet.has(from) || !anchors[from]) return;
        const d = route(from, to);
        if (d) {
          appendLink(svg, d);
          edgeIndex++;
        }
      });
    });
  }
      
  
  function appendLink(svg, d) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', d);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#10b981');
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('opacity', '0.92');
    line.setAttribute('marker-end', 'url(#ganttPathArrow)');
    svg.appendChild(line);
  }

function renderGantt() {
    const container = document.getElementById('ganttChart');
    if (!container) return;
    container.innerHTML = '';
    container.classList.toggle('gantt-readonly', !ganttEditMode);
  
    const ops = (window.allOperationsCache && window.allOperationsCache.length)
        ? window.allOperationsCache
        : (AdminState.operations || []);
  
    if (!ops.length) {
      container.innerHTML = '<p style="text-align:center;color:#64748b;padding:60px;">Нет операций. Импортируйте Excel.</p>';
      return;
    }
  
    // порядок строк
    if (!ganttOrder.length) {
      ganttOrder = ops.map(o => o.op_number).sort((a, b) => a - b);
    }
    const byNum = Object.fromEntries(ops.map(o => [o.op_number, o]));
    const ordered = ganttOrder.map(n => byNum[n]).filter(Boolean)
        .concat(ops.filter(o => !ganttOrder.includes(o.op_number)));
  
    const tasks = ordered.map(op => {
      let start = op.start_date;
      let end = op.end_date;
      if (!start) {
        const base = new Date();
        base.setDate(base.getDate() + Math.floor((op.op_number || 0) * 0.2));
        start = base.toISOString().slice(0, 10);
      }
      if (!end) {
        const s = new Date(start);
        s.setDate(s.getDate() + Math.max(1, Math.ceil((op.duration || 8) / 8)));
        end = s.toISOString().slice(0, 10);
      }
      let progress = 0;
      if (op.status === 'completed') progress = 100;
      else if (op.status === 'in_progress') progress = 50;
  
      const isCritical = (AdminState.criticalPath || []).includes(op.op_number);
      const showDeps = document.getElementById('ganttShowDeps')?.checked !== false;
      const prev = showDeps ? (op.prev_ops || []).slice(-2) : [];
      const deps = prev.map(p => `op${p}`).join(', ');
  
      return {
        id: `op${op.op_number}`,
        name: truncate(op.name || ('#' + op.op_number), 28),
        start, end, progress, dependencies: deps,
        custom_class: isCritical ? 'gantt-critical' : `gantt-${op.status || 'pending'}`,
        _op_number: op.op_number,
        _op_id: op.id,
        _brigade: typeof getBrigadeName === 'function' ? getBrigadeName(op.brigade_id) : '—',
        _duration: op.duration || 0,
        _status: op.status || 'pending'
      };
    });
  
    ganttChart = new Gantt('#ganttChart', tasks, {
      view_mode: document.getElementById('ganttViewMode')?.value || 'Week',
      date_format: 'YYYY-MM-DD',
      language: 'ru',
      bar_height: 28,
      bar_corner_radius: 4,
      arrow_curve: 5,
      padding: 18,
      // в 0.6.x нет полноценного readonly — блокируем CSS + игнор в колбэках
      custom_popup_html: function (task) {
        const cache = window.allOperationsCache || [];
        const op = cache.find(o => o.op_number === task._op_number);
        const start = (op?.start_date || task.start || '').toString().slice(0, 10);
        const end = (op?.end_date || task.end || '').toString().slice(0, 10);
        const dur = op?.duration ?? task._duration;
        return `
          <div style="padding:12px 14px;background:#1e293b;color:#fff;border-radius:10px;font-size:12px;min-width:220px;">
            <div style="font-weight:700;margin-bottom:4px;">#${task._op_number} · ${task.name}</div>
            <div style="color:#94a3b8;line-height:1.55;">
              <div>📅 ${start} → ${end}</div>
              <div>👥 ${task._brigade}</div>
              <div>⏱ ${dur} ч · ${task.progress}%</div>
            </div>
            <button type="button" onclick="openGanttTaskModal(${task._op_number})"
              style="margin-top:10px;width:100%;padding:6px;border:0;border-radius:6px;background:#0961f6;color:#fff;cursor:pointer;font-size:12px;">
              ✎ Точная правка
            </button>
          </div>`;
      },
      on_click: function (task) {
        // одинарный клик — только путь (редактирование через dbl / кнопку)
        highlightGanttPath(task._op_number);
      },
      on_date_change: function (task, start, end) {
        if (!ganttEditMode) {
          showNotification('Заблокировано', 'Включите «Редактирование»', 'warning');
          renderGantt();
          return;
        }
        const s = start instanceof Date ? start.toISOString().slice(0, 10) : String(start).slice(0, 10);
        const e = end instanceof Date ? end.toISOString().slice(0, 10) : String(end).slice(0, 10);
        persistGanttDates(task._op_number, s, e); // внутри уже renderGantt()
      },
      on_progress_change: function (task, progress) {
        if (!ganttEditMode) return;
        // прогресс в Frappe часто % — при желании маппить в status
        task.progress = progress;
      }
    });

      // сразу после new Gantt(...)
  const bars = document.querySelectorAll('#ganttChart .bar-wrapper');
  const taskList = (ganttChart && ganttChart.tasks) ? ganttChart.tasks : tasks;
  bars.forEach((el, i) => {
    const task = taskList[i];
    if (!task) return;
    const num = task._op_number != null
      ? task._op_number
      : Number(String(task.id).replace(/\D/g, ''));
    el.setAttribute('data-op', String(num));
    el.setAttribute('data-id', task.id);
  });

    const host = document.getElementById('ganttChart');
    host.onclick = null; // не обязательно
    host.ondblclick = (e) => {
      const wrap = e.target.closest('.bar-wrapper');
      if (!wrap) return;
      const num = Number(wrap.getAttribute('data-op'));
      if (!num) return;
      if (!ganttEditMode) {
        showNotification('Заблокировано', 'Включите «Редактирование»', 'warning');
        return;
      }
      openGanttTaskModal(num);
    };

    const grid = document.querySelector('#ganttChart .grid');
  grid?.addEventListener('click', (e) => {
    if (e.target.closest('.bar-wrapper')) return;
    clearGanttPathHighlight();
  });
  clearGanttPathOverlay();

    // проставить data-op на каждую полоску
    requestAnimationFrame(() => {
        const bars = document.querySelectorAll('#ganttChart .bar-wrapper');
        // Frappe рисует bar-wrapper в том же порядке, что tasks
        bars.forEach((el, i) => {
          const task = ganttChart?.tasks?.[i] || tasks[i];
          if (!task) return;
          const num = task._op_number ?? Number(String(task.id).replace(/\D/g, ''));
          el.setAttribute('data-op', num);
          el.setAttribute('data-id', task.id);
        });
        // если клик уже был до rAF — ничего; следующий клик сработает
      });
    
      // Перемещаем стрелки за бары (в SVG первые в DOM = нижний слой)
    requestAnimationFrame(() => {
        const svg = document.querySelector('#ganttChart svg.gantt');
        if (svg) {
        const arrows = Array.from(svg.querySelectorAll('.arrow, .arrow-path, [class*="arrow"]'));
        arrows.reverse().forEach(arrow => svg.insertBefore(arrow, svg.firstChild));
        }
    });

     
        // Перемещаем стрелки зависимостей за блоки (первыми в SVG = нижний слой)
    requestAnimationFrame(() => {
      const svg = document.querySelector('#ganttChart svg.gantt');
      if (svg) {
        const arrows = Array.from(svg.querySelectorAll('.arrow, .arrow-path, [class*="arrow"]'));
        arrows.reverse().forEach(arrow => svg.insertBefore(arrow, svg.firstChild));
      }
    });

    // Перемещаем стрелки зависимостей за блоки (первыми в SVG = нижний слой)
    requestAnimationFrame(() => {
        const svg = document.querySelector('#ganttChart svg.gantt');
        if (svg) {
          const arrows = Array.from(svg.querySelectorAll('.arrow, .arrow-path, [class*="arrow"]'));
          arrows.reverse().forEach(arrow => svg.insertBefore(arrow, svg.firstChild));
        }
      });
  
      injectGanttStyles();
    }

function changeGanttView(mode) {
    if (ganttChart) {
        ganttChart.change_view_mode(mode);
    }
}

function injectGanttStyles() {
    let style = document.getElementById('gantt-custom-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'gantt-custom-styles';
      document.head.appendChild(style);
    }
    style.textContent = `
      .gantt .bar-wrapper.gantt-critical .bar { fill: #ef4444 !important; }
      .gantt .bar-wrapper.gantt-critical .bar-progress { fill: #b91c1c !important; }
      .gantt .bar-wrapper.gantt-completed .bar { fill: #10b981 !important; }
      .gantt .bar-wrapper.gantt-in_progress .bar { fill: #3b82f6 !important; }
      .gantt .bar-wrapper.gantt-pending .bar { fill: #94a3b8 !important; }
      .gantt .bar-wrapper.gantt-blocked .bar { fill: #f59e0b !important; }
      .gantt .bar-label { font-size: 11px; font-weight: 600; fill: #334155; }
  
      .gantt .arrow { stroke: #94a3b8; stroke-width: 1.4; opacity: 0.45; fill: none; pointer-events: none; }
  
      #ganttChart.gantt-readonly .bar-wrapper { pointer-events: auto !important; cursor: pointer !important; }
      #ganttChart.gantt-readonly .handle-group,
      #ganttChart.gantt-readonly .handle { pointer-events: none !important; display: none !important; }
  
      #ganttChart .bar-wrapper.gantt-path-dim {
        opacity: 0.12 !important;
        filter: grayscale(0.7);
      }
      #ganttChart .bar-wrapper.gantt-path-hl {
        opacity: 1 !important;
        filter: none !important;
      }
      #ganttChart .bar-wrapper.gantt-path-hl .bar {
        stroke: #2563eb !important;
        stroke-width: 3px !important;
        filter: drop-shadow(0 0 6px rgba(37,99,235,0.65)) !important;
      }
      #ganttChart .bar-wrapper.gantt-path-focus .bar {
        stroke: #1d4ed8 !important;
        stroke-width: 4px !important;
      }
      #ganttChart .arrow.gantt-arrow-dim {
        opacity: 0.06 !important;
        stroke: #cbd5e1 !important;
      }
      #ganttChart .arrow.gantt-arrow-hl {
        opacity: 1 !important;
        stroke: #10b981 !important;
        stroke-width: 2.8 !important;
      }
      #ganttPathOverlay { pointer-events: none; }

      #ganttChart { position: relative; }
      
      #ganttPathOverlay {
        z-index: 15 !important;
        pointer-events: none;
      }
    `;
  }


  
// ================================================================
// ДАШБОРД: % , периоды, графики, алерты
// ================================================================

function snapshotKey(date = new Date()) {
    return 'dash_snap_' + date.toISOString().slice(0, 10);
}

function saveAndCompareSnapshot(stats) {
    const todayKey = snapshotKey();
    localStorage.setItem(todayKey, JSON.stringify({ ...stats, ts: Date.now() }));
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yRaw = localStorage.getItem(snapshotKey(y));
    if (!yRaw) return null;
    try {
        const yesterday = JSON.parse(yRaw);
        return (stats.completed || 0) - (yesterday.completed || 0);
    } catch {
        return null;
    }
}

function getPeriodStats() {
    const todayRaw = localStorage.getItem(snapshotKey());
    const today = todayRaw ? JSON.parse(todayRaw) : null;
    const loadDaysAgo = (n) => {
        const d = new Date();
        d.setDate(d.getDate() - n);
        const raw = localStorage.getItem(snapshotKey(d));
        return raw ? JSON.parse(raw) : null;
    };
    const diff = (a, b, field) => {
        if (!a || !b) return null;
        return (a[field] || 0) - (b[field] || 0);
    };
    const d1 = loadDaysAgo(1), d7 = loadDaysAgo(7), d30 = loadDaysAgo(30);
    const d180 = loadDaysAgo(180), d365 = loadDaysAgo(365);
    return {
        day:   { label: 'Сутки',   completed: diff(today, d1, 'completed'), inProgress: diff(today, d1, 'inProgress') },
        week:  { label: 'Неделя',  completed: diff(today, d7, 'completed'), inProgress: diff(today, d7, 'inProgress') },
        month: { label: 'Месяц',   completed: diff(today, d30, 'completed'), inProgress: diff(today, d30, 'inProgress') },
        half:  { label: 'Полгода', completed: diff(today, d180, 'completed'), inProgress: diff(today, d180, 'inProgress') },
        year:  { label: 'Год',     completed: diff(today, d365, 'completed'), inProgress: diff(today, d365, 'inProgress') }
    };
}

window.showPeriodComparisonModal = function() {
    const data = getPeriodStats();
    const fmt = (v) => v === null ? 'нет данных' : (v > 0 ? `+${v}` : String(v));
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.style.display = 'flex';
    document.getElementById('periodCompareModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'periodCompareModal';
    modal.className = 'modal';
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:12px;padding:24px;max-width:420px;width:92%;z-index:10001;box-shadow:0 20px 50px rgba(0,0,0,.25);';
    modal.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h3 style="margin:0;font-size:16px;">Активность по периодам</h3>
            <button type="button" id="periodClose" style="border:0;background:none;font-size:22px;cursor:pointer;">×</button>
        </div>
        <p style="font-size:12px;color:#64748b;margin:0 0 12px;">Δ завершённых / в работе относительно снимка на дату. Снимки пишутся при обновлении дашборда.</p>
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
            <tr style="text-align:left;color:#64748b;"><th style="padding:6px 0;">Период</th><th>Завершено</th><th>В работе</th></tr>
            ${['day','week','month','half','year'].map(k => `
                <tr style="border-top:1px solid #e5e7eb;">
                    <td style="padding:8px 0;">${data[k].label}</td>
                    <td>${fmt(data[k].completed)}</td>
                    <td>${fmt(data[k].inProgress)}</td>
                </tr>`).join('')}
        </table>`;
    document.body.appendChild(modal);
    const close = () => { modal.remove(); if (overlay) overlay.style.display = 'none'; };
    document.getElementById('periodClose').onclick = close;
};

function updateDashboardCards(ops, brigades) {
    const list = ops || [];
    const total = list.length;
    const completed = list.filter(o => o.status === 'completed').length;
    const inProgress = list.filter(o => o.status === 'in_progress').length;
    const pct = (n) => total ? ((n / total) * 100).toFixed(1) : '0.0';

    const elTotal = document.getElementById('totalOps');
    const elDone = document.getElementById('completedOps');
    const elProg = document.getElementById('inProgressOps');
    const elBrig = document.getElementById('activeBrigadesCount');
    const elDoneTrend = document.getElementById('completedTrend');
    const elProgTrend = document.getElementById('inProgressTrend');
    const elOpsTrend = document.getElementById('opsTrend');

    if (elTotal) elTotal.textContent = total;
    if (elDone) elDone.textContent = completed;
    if (elProg) elProg.textContent = inProgress;
    if (elBrig) elBrig.textContent = (brigades || []).length;
    if (elOpsTrend) elOpsTrend.textContent = total ? `100%` : '—';
    if (elProgTrend) elProgTrend.textContent = `${pct(inProgress)}%`;

    const dayDelta = saveAndCompareSnapshot({ total, completed, inProgress, pending: total - completed - inProgress });
    if (elDoneTrend) {
        const p = pct(completed);
        if (dayDelta === null) {
            elDoneTrend.textContent = `${p}% · нет вчера`;
            elDoneTrend.style.color = '#64748b';
        } else if (dayDelta > 0) {
            elDoneTrend.textContent = `${p}% · ↑ +${dayDelta} за сутки`;
            elDoneTrend.style.color = '#16a34a';
        } else if (dayDelta < 0) {
            elDoneTrend.textContent = `${p}% · ↓ ${dayDelta} за сутки`;
            elDoneTrend.style.color = '#dc2626';
        } else {
            elDoneTrend.textContent = `${p}% · → 0 за сутки`;
            elDoneTrend.style.color = '#64748b';
        }
    }
}





function collectDashboardAlerts(ops, brigades, criticalPathIds = []) {
    const alerts = [];
    const list = ops || [];
    const br = brigades || [];
    const blocked = list.filter(o => o.status === 'blocked');
    if (blocked.length) {
        alerts.push({
            level: 'high',
            title: `Заблокировано: ${blocked.length}`,
            text: 'Открыть операции со статусом «Блок»',
            filterStatus: 'blocked'
        });
    }
    const overloaded = br.filter(b => (Number(b.current_load) || 0) >= 90);
    if (overloaded.length) {
        alerts.push({
            level: 'high',
            title: `Перегруз бригад: ${overloaded.length}`,
            text: overloaded.slice(0, 3).map(b => b.name).join(', ') + (overloaded.length > 3 ? '…' : ''),
            tab: 'brigades'
        });
    }
    const idle = br.filter(b => (Number(b.current_load) || 0) < 15);
    if (idle.length >= 5) {
        alerts.push({ level: 'low', title: `Простой: ${idle.length} бригад (<15%)`, text: 'Можно перекинуть работы с перегруженных.', tab: 'brigades' });
    }
    if ((criticalPathIds || []).length > 50) {
        alerts.push({ level: 'medium', title: `Крит. путь: ${criticalPathIds.length} работ`, text: 'Высокий риск срыва срока.', tab: 'ai' });
    }
    return alerts;
}

function renderDashboardAlerts(alerts) {
    const box = document.getElementById('dashboardAlerts');
    if (!box) return;
    if (!alerts || !alerts.length) {
        box.innerHTML = `<div style="font-size:12px;color:#16a34a;padding:8px 0;">Нет критических алертов</div>`;
        return;
    }
    const colors = { high: '#ef4444', medium: '#f59e0b', low: '#0961f6' };
    box.innerHTML = `<div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:8px;">Алерты</div>` + alerts.map(a => `
        <div style="border-left:3px solid ${colors[a.level]||'#64748b'};padding:8px 10px;margin-bottom:6px;background:#f8fafc;border-radius:6px;cursor:pointer;"
             onclick="${a.filterStatus
                 ? `window.goToOperationsWithStatus('${a.filterStatus}')`
                 : (a.tab === 'brigades'
                     ? `window.switchTab('brigades')`
                     : `window.switchTab('${a.tab || 'dashboard'}')`)}">
            <div style="font-weight:600;font-size:12px;">${a.title}</div>
            <div style="font-size:11px;color:#64748b;">${a.text}</div>
        </div>`).join('');
}

window.applyBridgeLink = async function (p) {
    try {
      showLoading('Применение связи...');
      const res = await fetch(`${API_BASE}/ai/gaps/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          links: [{ from: String(p.from), to: String(p.to) }],
          persist: true
        })
      });
      const data = await res.json().catch(() => ({}));
      console.log('[apply] response', data);
  
      if (!res.ok || data.status !== 'ok') {
        showNotification('Ошибка', data.detail || `HTTP ${res.status}`, 'error');
        return;
      }
      // показать полный ответ сервера
      const appliedN = Number(data.applied) || 0;
      const alreadyN = Number(data.already) || 0;
      const ok =
        appliedN > 0 ||
        alreadyN > 0 ||
        data.ok === true ||
        (data.status === "ok" &&
          (!data.missed || data.missed.length === 0) &&
          (data.ops_count > 0));

      showNotification(
        "Apply",
        `applied=${appliedN} already=${alreadyN}`,
        ok ? "success" : "warning"
      );
      if (!ok) return;

      // убрать карточку + loadAllData + renderGraph/Gantt — как сейчас ниже

      showNotification('Связь', `#${p.from} → #${p.to} (applied=${data.applied})`, 'success');
  
      // 1) сразу убрать из панели предложений
      if (window.aiPanel?.lastBridge?.proposals) {
        const key = `${p.from}|${p.to}`;
        const filter = (arr) =>
          (arr || []).filter((x) => `${x.from}|${x.to}` !== key);
        const br = aiPanel.lastBridge;
        aiPanel.lastBridge = {
          ...br,
          proposals: filter(br.proposals),
          auto_apply: filter(br.auto_apply),
          need_confirm: filter(br.need_confirm),
          count: filter(br.proposals).length
        };
        aiPanel.renderGaps('aiGapsPanel', aiPanel.lastGaps, aiPanel.lastBridge);
        persistAiPanelSnapshot?.();
      }
  
      // 2) свежие операции из БД → граф / гантт
      await loadAllData();
      if (typeof renderGraph === 'function') renderGraph();
      if (typeof renderGantt === 'function') renderGantt();
  
      // 3) пересчёт разрывов (не обязательно для появления ребра)
      try {
        const ops2 = window.allOperationsCache || [];
        await window.aiPanel.runOptimization(ops2, AdminState.brigades || []);
        // снова выкинуть уже применённую пару
        const key = `${p.from}|${p.to}`;
        const filter = (arr) =>
          (arr || []).filter((x) => `${x.from}|${x.to}` !== key);
        if (aiPanel.lastBridge) {
          aiPanel.lastBridge = {
            ...aiPanel.lastBridge,
            proposals: filter(aiPanel.lastBridge.proposals),
            auto_apply: filter(aiPanel.lastBridge.auto_apply),
            need_confirm: filter(aiPanel.lastBridge.need_confirm),
            count: filter(aiPanel.lastBridge.proposals).length
          };
        }
        aiPanel.renderGaps('aiGapsPanel', aiPanel.lastGaps, aiPanel.lastBridge);
        persistAiPanelSnapshot?.();
      } catch (e) {
        console.warn('re-optimize after apply', e);
      }
    } catch (e) {
      console.error(e);
      showNotification('Ошибка', e.message || String(e), 'error');
    } finally {
      hideLoading();
    }
  };

  window.applySelectedBridgeLinks = async function () {
    const boxes = [...document.querySelectorAll('#aiGapsPanel .bridge-check:checked')];
    if (!boxes.length) {
      showNotification('Связи', 'Ничего не выбрано', 'warning');
      return;
    }
    const links = boxes.map((el) => ({ from: el.dataset.from, to: el.dataset.to }));
    await window.applyBridgeLinksBatch(links);
  };
  
  window.applyAllBridgeLinks = async function () {
    const proposals = (window.aiPanel?.lastBridge?.proposals || [])
      .filter(p => (Number(p.confidence) || 0) >= 0.25)
      .slice(0, 20);
    if (!proposals.length) {
      showNotification('Связи', 'Нет предложений с confidence ≥ 25%', 'warning');
      return;
    }
    await window.applyBridgeLinksBatch(
      proposals.map((p) => ({ from: String(p.from), to: String(p.to) }))
    );
  };

  window.selectAllBridgeChecks = function (on = true) {
    document
      .querySelectorAll('#aiGapsPanel .bridge-check')
      .forEach((el) => { el.checked = !!on; });
  };

  window.applyAllBridgeLinks = async function () {
    const checked = [...document.querySelectorAll('#aiGapsPanel .bridge-check:checked')];
    if (checked.length) {
      await window.applyBridgeLinksBatch(
        checked.map((el) => ({ from: el.dataset.from, to: el.dataset.to }))
      );
      return;
    }
    // только уверенные, не больше 15 — иначе граф «плывёт»
    const proposals = (window.aiPanel?.lastBridge?.proposals || [])
      .filter((p) => (Number(p.confidence) || 0) >= 0.25)
      .slice(0, 15);
    if (!proposals.length) {
      showNotification(
        'Связи',
        'Нет предложений с confidence ≥ 25%. Отметьте вручную или снизьте порог.',
        'warning'
      );
      return;
    }
    await window.applyBridgeLinksBatch(
      proposals.map((p) => ({ from: String(p.from), to: String(p.to) }))
    );
  };

  // В admin-main.js (глобально):
window.checkAIDataQuality = async function () {
    if (!window.aiPanel?.checkDataQuality) {
      showNotification('ML', 'AIPanel.checkDataQuality не найден — обновите ai-panel.js', 'error');
      return;
    }
    showLoading('Анализ данных...');
    try {
      const data = await window.aiPanel.checkDataQuality();
      if (data?.ready_to_train) {
        showNotification('Данные ML', `Готово: ${data.trainable_samples} образцов`, 'success');
      } else {
        showNotification('Данные ML', data?.message || 'Недостаточно фактов', 'warning');
      }
    } finally {
      hideLoading();
    }
  };
  
  // trainAIModel — если вызывает старый путь, заменить на:
  window.trainAIModel = async function () {
    if (!window.aiPanel?.trainDelayModel) {
      showNotification('ML', 'aiPanel.trainDelayModel отсутствует', 'error');
      return;
    }
    await window.aiPanel.trainDelayModel();
  };
  
  
  window.applyBridgeLinksBatch = async function (links) {
    if (!links || !links.length) {
      showNotification('Связи', 'Список пуст', 'warning');
      return;
    }
    // нормализация
    links = links.map((l) => ({ from: String(l.from), to: String(l.to) }));

    try {
      showLoading(`Применение ${links.length} связей...`);
      const res = await fetch(`${API_BASE}/ai/gaps/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links, persist: true })
      });
      const data = await res.json().catch(() => ({}));
      console.log('[apply batch]', data);

      if (!res.ok || data.status !== 'ok') {
        showNotification('Ошибка', data.detail || `HTTP ${res.status}`, 'error');
        return;
      }

      // applied может быть числом ИЛИ массивом
      const appliedN = Array.isArray(data.applied)
        ? data.applied.length
        : Number(data.applied) || 0;
      const alreadyN = Array.isArray(data.already)
        ? data.already.length
        : Number(data.already) || 0;

      showNotification(
        'Связи',
        `Применено: ${appliedN}, уже были: ${alreadyN}, запрошено: ${links.length}`,
        appliedN + alreadyN > 0 ? 'success' : 'warning'
      );

      // убрать из панели все запрошенные пары
      if (window.aiPanel?.lastBridge) {
        const done = new Set(links.map((l) => `${l.from}|${l.to}`));
        const filter = (arr) => (arr || []).filter((x) => !done.has(`${x.from}|${x.to}`));
        const br = aiPanel.lastBridge;
        aiPanel.lastBridge = {
          ...br,
          proposals: filter(br.proposals),
          auto_apply: filter(br.auto_apply),
          need_confirm: filter(br.need_confirm),
          count: filter(br.proposals).length
        };
        aiPanel.renderGaps('aiGapsPanel', aiPanel.lastGaps, aiPanel.lastBridge);
        persistAiPanelSnapshot?.();
      }
  
      await loadAllData();
      if (typeof renderGraph === 'function') renderGraph();
      if (typeof renderGantt === 'function') renderGantt();

      // пересчёт разрывов с сервера
      try {
        const ops = window.allOperationsCache || AdminState.operations || [];
        const br = AdminState.brigades || [];
        const r = await window.aiPanel.runOptimization(ops, br);
        if (window.aiPanel.lastGaps != null) {
          window.aiPanel.renderGaps(
            'aiGapsPanel',
            window.aiPanel.lastGaps,
            window.aiPanel.lastBridge
          );
        }
        // сохранить снимок AI-панели (п.3)
        window.persistAiPanelSnapshot?.();
      } catch (e) {
        console.warn('re-optimize after apply', e);
      }

      restoreAIPaths();
      // НЕ вызывать restoreAiPanelSnapshot здесь — затрёт свежий optimize

      const ops = window.allOperationsCache || AdminState.operations || [];
      if (typeof updateDashboardCards === 'function') {
        updateDashboardCards(ops, AdminState.brigades || []);
      }
      if (typeof renderCharts === 'function') renderCharts();
  
  
    //   if (window.aiPanel?.lastBridge) {
    //     const key = (x) => `${x.from}|${x.to}`;
    //     const done = new Set(links.map(key));
    //     const filter = (arr) => (arr || []).filter((x) => !done.has(key(x)));
    //     const br = aiPanel.lastBridge;
    //     aiPanel.lastBridge = {
    //       ...br,
    //       proposals: filter(br.proposals),
    //       need_confirm: filter(br.need_confirm),
    //       auto_apply: filter(br.auto_apply),
    //       count: filter(br.proposals).length
    //     };
    //     aiPanel.renderGaps('aiGapsPanel', aiPanel.lastGaps, aiPanel.lastBridge);
    //   }
    } catch (e) {
      showNotification('Ошибка', e.message || String(e), 'error');
    } finally {
      hideLoading();
    }
  };

  function initSidebarBehavior() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebarToggle');
    if (!sidebar || !toggle) {
      console.warn('[Sidebar] #sidebar или #sidebarToggle не найдены');
      return;
    }
  
    // снять старые обработчики (повторный init)
    const fresh = toggle.cloneNode(true);
    toggle.parentNode.replaceChild(fresh, toggle);
  
    const mode = localStorage.getItem('sidebarMode') || 'click';
  
    const setCollapsed = (on) => {
      sidebar.classList.toggle('collapsed', on);
      document.body.classList.toggle('sidebar-collapsed', on);
      localStorage.setItem('sidebarCollapsed', on ? '1' : '0');
    };
  
    setCollapsed(localStorage.getItem('sidebarCollapsed') === '1');
  
    fresh.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setCollapsed(!sidebar.classList.contains('collapsed'));
    });
  
    if (mode === 'hover' || mode === 'both') {
      sidebar.onmouseenter = () => setCollapsed(false);
      sidebar.onmouseleave = () => {
        if (mode === 'hover') setCollapsed(true);
      };
    } else {
      sidebar.onmouseenter = null;
      sidebar.onmouseleave = null;
    }
  }
  window.initSidebarBehavior = initSidebarBehavior;
  
document.addEventListener('DOMContentLoaded', initAdmin);

function fillChatTemplatesAdmin() {
  const sel = document.getElementById('chatTemplate');
  if (!sel) return;
  const map = CHAT_TEMPLATES_ADMIN;
  sel.innerHTML =
    '<option value="">— шаблон —</option>' +
    Object.keys(map).map((k) => '<option value="' + k + '">' + k + '</option>').join('');
  sel.onchange = () => {
    if (map[sel.value]) document.getElementById('chatBody').value = map[sel.value];
  };
}

async function loadChatThreadsAdmin() {
  const r = await fetch(API_CHAT + '/chat/threads?role=admin&limit=100');
  if (!r.ok) return;
  const d = await r.json();
  ChatState.threads = d.items || [];
  renderChatThreadListAdmin();
  const n = ChatState.threads.reduce((s, t) => s + (t.unread || 0), 0);
  const dot = document.getElementById('notifDot');
  if (dot) {
    if (n > 0) {
      dot.style.display = 'block';
      dot.textContent = String(n);
    } else {
      dot.style.display = 'none';
    }
  }
}

function renderChatThreadListAdmin() {
  const box = document.getElementById('chatThreadList');
  if (!box) return;
  const q = (document.getElementById('chatSearch')?.value || '').toLowerCase();
  let list = ChatState.threads;
  if (q) {
    list = list.filter(
      (t) =>
        String(t.peer_name || '').toLowerCase().includes(q) ||
        String(t.subject || '').toLowerCase().includes(q)
    );
  }
  box.innerHTML = list.length
    ? list
        .map((t) => {
          const active = Number(t.id) === Number(ChatState.activeId) ? ' active' : '';
          const unread = t.unread ? '<span class="unread-pill">' + t.unread + '</span>' : '';
          return (
            '<div class="chat-thread-item' + active + '" data-id="' + t.id + '">' +
              '<div class="chat-thread-main">' +
                '<div class="chat-thread-name">' + escapeHtml(t.peer_name || t.subject || ('#' + t.id)) + unread + '</div>' +
                '<div class="chat-thread-preview">' + escapeHtml(t.last_preview || '') + '</div>' +
              '</div>' +
              '<button type="button" class="btn-text chat-del" data-del-id="' + t.id + '" title="Удалить">🗑</button>' +
            '</div>'
          );
        })
        .join('')
    : '<p class="muted" style="padding:12px">Нет диалогов</p>';
    box.querySelectorAll('.chat-thread-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-del-id]')) return;
        const id = el.getAttribute('data-id');
        if (id && typeof openChatThreadAdmin === 'function') openChatThreadAdmin(id);
        else if (id && typeof openChatThread === 'function') openChatThread(id);
      });
    });
    box.querySelectorAll('[data-del-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteChatThread(btn.getAttribute('data-del-id'));
      });
    });
  
}

function fillAdminSettings() {
  const auth = window.electronAPI?.storage?.get?.('auth')
    || JSON.parse(localStorage.getItem('auth') || '{}');
  const u = auth.user || auth || {};
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v != null ? String(v) : '';
  };
  set('settingsName', u.name || u.full_name || 'Администратор');
  set('settingsLogin', u.login || 'admin');
  set('settingsRole', u.role || 'admin');
  set('settingsEmail', u.email || '');
  set('settingsOnlineStatus', 'В сети');

  const letter = (u.name || 'А').charAt(0).toUpperCase();
  const av = document.getElementById('settingsAvatar');
  if (av) av.textContent = letter;

  const apiEl = document.getElementById('settingsApiUrl');
  if (apiEl) apiEl.textContent = (typeof API_BASE !== 'undefined' ? API_BASE : 'http://127.0.0.1:8000');

  // UI из localStorage
  const sel = (id, key, def) => {
    const el = document.getElementById(id);
    if (el) el.value = localStorage.getItem(key) || def;
  };
  sel('settingsLang', 'admin_lang', 'ru');
  sel('settingsSidebarMode', 'sidebarMode', 'click');
  sel('settingsDashDensity', 'admin_dash_density', 'comfortable');
  sel('themeSelect', 'admin_theme', 'light');
  const startCol = document.getElementById('settingSidebarStartCollapsed');
  if (startCol) startCol.checked = localStorage.getItem('sidebarCollapsed') === '1';

  applyAvatarFromStorageAdmin?.();
}

function saveAdminUiSettings() {
  localStorage.setItem('admin_lang', document.getElementById('settingsLang')?.value || 'ru');
  localStorage.setItem('sidebarMode', document.getElementById('settingsSidebarMode')?.value || 'click');
  localStorage.setItem('admin_dash_density', document.getElementById('settingsDashDensity')?.value || 'comfortable');
  localStorage.setItem('admin_theme', document.getElementById('themeSelect')?.value || 'light');
  const startCol = document.getElementById('settingSidebarStartCollapsed');
  if (startCol) localStorage.setItem('sidebarCollapsed', startCol.checked ? '1' : '0');

  ['notifApp', 'notifCritical', 'notifChat', 'notifAi'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) localStorage.setItem('admin_' + id, el.checked ? '1' : '0');
  });

  if (typeof initSidebarBehavior === 'function') initSidebarBehavior();
  showNotification?.('Настройки', 'Интерфейс сохранён', 'success');
}

function applyAvatarFromStorageAdmin() {
  const data = localStorage.getItem('adminAvatarDataUrl');
  const img = document.getElementById('settingsAvatarImg');
  const letter = document.getElementById('settingsAvatar');
  const top = document.getElementById('userAvatarImg'); // если есть в шапке
  if (data && img) {
    img.src = data;
    img.style.display = 'block';
    if (letter) letter.style.display = 'none';
    if (top) { top.src = data; top.style.display = 'block'; }
  }
}

async function openChatThreadAdmin(tid) {
  ChatState.activeId = Number(tid);
  renderChatThreadListAdmin();
  const t = ChatState.threads.find((x) => Number(x.id) === Number(tid));
  const nameEl = document.getElementById('chatPeerName');
  const metaEl = document.getElementById('chatPeerMeta');
  if (nameEl) nameEl.textContent = t?.peer_name || t?.subject || ('#' + tid);
  if (metaEl) metaEl.textContent = (t?.peer_type || '') + (t?.brigade_id != null ? ' · бр. ' + t.brigade_id : '');
  await fetch(API_CHAT + '/chat/threads/' + tid + '/read?role=admin', { method: 'POST' });
  const r = await fetch(API_CHAT + '/chat/threads/' + tid + '/messages');
  const d = r.ok ? await r.json() : { items: [] };
  const box = document.getElementById('chatMessages');
  if (!box) return;
  box.innerHTML = (d.items || [])
    .map((m) => {
      const isMe = m.sender_role === 'admin';
      return (
        '<div class="chat-bubble ' + (isMe ? 'me' : 'them') + '">' +
        escapeHtml(m.body) +
        '<div class="b-meta">' + escapeHtml(m.sender_name || m.sender_role) + ' · ' +
        escapeHtml((m.created_at || '').slice(0, 16)) + '</div></div>'
      );
    })
    .join('');
  box.scrollTop = box.scrollHeight;
  loadChatThreadsAdmin();
}

async function sendChatMessageAdmin() {
  const body = (document.getElementById('chatBody')?.value || '').trim();
  if (!body || !ChatState.activeId) return alert('Выберите диалог и введите текст');
  const template_key = document.getElementById('chatTemplate')?.value || null;
  const r = await fetch(API_CHAT + '/chat/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      thread_id: ChatState.activeId,
      body,
      sender_role: 'admin',
      sender_id: 0,
      sender_name: 'Администратор',
      template_key,
    }),
  });
  if (!r.ok) return alert('Ошибка ' + r.status);
  document.getElementById('chatBody').value = '';
  openChatThreadAdmin(ChatState.activeId);
}

async function adminStartChatFromSelect() {
  const raw = document.getElementById('chatPeerValue')?.value || '';
  const body =
    (document.getElementById('chatNewBody')?.value || '').trim() ||
    (document.getElementById('chatBody')?.value || '').trim();
  if (!raw) return alert('Выберите получателя в списке');
  if (!body) return alert('Введите текст сообщения');
  const [peer_type, idStr] = raw.split(':');
  const peer_id = Number(idStr);
  const item = (typeof PeerPicker !== 'undefined' ? PeerPicker.items : []).find((i) => i.key === raw);
  const peer_name = item?.name || raw;

  const r = await fetch((typeof API_CHAT !== 'undefined' ? API_CHAT : 'http://127.0.0.1:8000') + '/chat/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      peer_type: peer_type === 'admin' ? 'worker' : peer_type,
      peer_id: peer_type === 'admin' ? 0 : peer_id,
      peer_name,
      brigade_id: peer_type === 'brigade' ? peer_id : null,
      subject: body.slice(0, 80),
      body,
      sender_role: 'admin',
      sender_name: 'Администратор',
    }),
  });
  if (!r.ok) return alert('Ошибка ' + r.status);
  const d = await r.json();
  document.getElementById('chatNewBody') && (document.getElementById('chatNewBody').value = '');
  document.getElementById('chatNewModal') && (document.getElementById('chatNewModal').style.display = 'none');
  await loadChatThreadsAdmin();
  if (d.thread_id) openChatThreadAdmin(d.thread_id);
}



function setupPeerPicker() {
  const search = document.getElementById('chatPeerSearch');
  const filtersRoot = document.getElementById('chatPeerFilters') || document;

  if (search && !search.dataset.peerBound) {
    search.dataset.peerBound = '1';
    search.addEventListener('input', () => renderPeerList());
  }

  filtersRoot.querySelectorAll('[data-peer-filter]').forEach((chip) => {
    if (chip.dataset.peerBound) return;
    chip.dataset.peerBound = '1';
    chip.addEventListener('click', () => {
      filtersRoot.querySelectorAll('[data-peer-filter]').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      PeerPicker.filter = chip.getAttribute('data-peer-filter') || 'all';
      renderPeerList();
    });
  });
}



async function adminStartChat() {
  return adminStartChatFromSelect();
}

async function deleteChatThread(threadId) {
  if (!threadId) return;
  if (!confirm('Удалить этот диалог и все сообщения?')) return;
  const role =
    typeof CHAT_ROLE !== 'undefined'
      ? CHAT_ROLE
      : document.body?.dataset?.role || 'worker';
  const r = await fetch(
    (typeof API !== 'undefined' ? API : API_BASE || 'http://127.0.0.1:8000') +
      '/chat/threads/' +
      threadId +
      '?role=' +
      encodeURIComponent(role),
    { method: 'DELETE' }
  );
  if (!r.ok) {
    alert('Не удалось удалить: HTTP ' + r.status);
    return;
  }
  if (typeof ChatState !== 'undefined') {
    ChatState.activeId = null;
    ChatState.threads = (ChatState.threads || []).filter(
      (t) => Number(t.id) !== Number(threadId)
    );
  }
  if (typeof loadChatThreads === 'function') await loadChatThreads();
  else if (typeof loadChatThreadsAdmin === 'function') await loadChatThreadsAdmin();
  const box = document.getElementById('chatMessages');
  if (box) box.innerHTML = '';
  const nameEl = document.getElementById('chatPeerName');
  if (nameEl) nameEl.textContent = 'Выберите диалог';
}