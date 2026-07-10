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
    currentTab: 'dashboard',
    selectedOperation: null,
    draggedWorkerId: null
};

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

// Глобальная переменная для графа
let cy = null;
let graphElements = [];
let graphFilters = {
    showCompleted: true,
    showCriticalOnly: false,
    showBlocked: true,
    showBrigades: true,
    showGroups: false
};

async function initAdmin() {
    console.log('[Admin] 🚀 Инициализация...');
    
    setupEventListeners();
    setupFileInput();
    await loadAllData();
    
    console.log('[Admin] ✅ Готово!');
    showNotification('Добро пожаловать!', 'Админ-панель загружена', 'success');
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
      // Загружаем ВСЕ операции сразу
      const allOps = await api.getOperations();
      
      // Сохраняем в оригинальный кэш (сортируем по ID)
      allOperationsCache = allOps.sort((a, b) => a.id - b.id);
      
      // Изначально отфильтрованный кэш = оригинальный
      filteredOperationsCache = [...allOperationsCache];
      totalOperations = filteredOperationsCache.length;
      
      // Загружаем первую страницу
      loadOperationsPageFromCache(1);
      
      // Бригады и рабочие - все
      const [brigs, works, stats] = await Promise.all([
          api.getBrigades(),
          api.getWorkers(),
          api.getStatistics()
      ]);
      
      AdminState.brigades = brigs || [];
      AdminState.workers = works || [];
      
      // Пересчитываем загрузку для всех бригад
      for (const brigade of AdminState.brigades) {
          await api.post(`/brigades/${brigade.id}/recalculate-load`, {});
      }
      
      // Обновляем данные бригад после пересчёта
      const refreshedBrigades = await api.get('/brigades');
      AdminState.brigades = refreshedBrigades || [];
      
      console.log(`📊 Загружено: ${allOperationsCache.length} оп, ${AdminState.brigades.length} бригад, ${AdminState.workers.length} рабочих`);
      
      updateStats(stats);
      
      const cpm = await api.calculateCPM();
      AdminState.criticalPath = cpm.critical_path || [];
      updateCriticalPathUI(cpm);
      
      populateWorkerBrigadeFilter();
      updateWorkersCache();
      populateFilters();
      renderAll();
      renderCharts();
      await loadAIRecommendations();
      
  } catch (error) {
      console.error('❌ Ошибка загрузки:', error);
      showNotification('Ошибка', 'Не удалось загрузить данные', 'error');
  } finally {
      hideLoading();
  }
}

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
    const DOM = getDOM();
    if (DOM.totalOps) DOM.totalOps.textContent = stats.total_operations || 0;
    if (DOM.completedOps) DOM.completedOps.textContent = stats.completed_operations || 0;
    if (DOM.inProgressOps) DOM.inProgressOps.textContent = stats.in_progress_operations || 0;
    if (DOM.activeBrigadesCount) DOM.activeBrigadesCount.textContent = stats.active_brigades || 0;
}

function updateCriticalPathUI(cpm) {
    const DOM = getDOM();
    if (DOM.criticalPathLength) DOM.criticalPathLength.textContent = `${cpm.critical_path?.length || 0} оп.`;
    if (DOM.criticalPathInfo && cpm.critical_path?.length) {
        const pathStr = cpm.critical_path.join(' → ');
        const totalDuration = AdminState.operations
            .filter(op => cpm.critical_path.includes(op.op_number))
            .reduce((sum, op) => sum + (op.duration || 0), 0);
        DOM.criticalPathInfo.innerHTML = `<p><strong>Длительность:</strong> ${totalDuration.toFixed(1)} ч</p><p><strong>Путь:</strong> ${pathStr}</p>`;
    }
}

function renderCharts() {
    const DOM = getDOM();
    if (AdminState.operations.length) renderProgressChart(DOM.progressCanvas, AdminState.operations);
    if (AdminState.brigades.length) renderBrigadeChart(DOM.brigadeLoadCanvas, AdminState.brigades);
}

function renderProgressChart(canvas, ops) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth || 400;
    const h = canvas.height = 200;
    ctx.clearRect(0, 0, w, h);
    
    const counts = {
        completed: ops.filter(o => o.status === 'completed').length,
        in_progress: ops.filter(o => o.status === 'in_progress').length,
        pending: ops.filter(o => o.status === 'pending').length
    };
    const total = ops.length || 1;
    const data = [
        { label: 'Завершено', value: counts.completed, color: '#10b981' },
        { label: 'В работе', value: counts.in_progress, color: '#0961f6' },
        { label: 'Ожидает', value: counts.pending, color: '#f59e0b' }
    ].filter(d => d.value > 0);
    
    if (!data.length) return;
    
    let start = 0;
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 30;
    
    data.forEach(d => {
        const angle = (d.value / total) * 2 * Math.PI;
        ctx.beginPath();
        ctx.fillStyle = d.color;
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start, start + angle);
        ctx.closePath();
        ctx.fill();
        
        const mid = start + angle / 2;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(d.value / total * 100)}%`, cx + Math.cos(mid) * r * 0.7, cy + Math.sin(mid) * r * 0.7);
        start += angle;
    });
}

function renderBrigadeChart(canvas, brigades) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth || 500;
    const h = canvas.height = 200;
    ctx.clearRect(0, 0, w, h);
    
    const display = brigades.slice(0, 6);
    if (!display.length) return;
    
    const barW = Math.min(50, (w - 80) / display.length - 10);
    const maxLoad = Math.max(...display.map(b => b.current_load || 0), 100);
    
    display.forEach((b, i) => {
        const x = 50 + i * (barW + 15);
        const barH = ((b.current_load || 0) / maxLoad) * (h - 50);
        const y = h - 20 - barH;
        
        let color = '#10b981';
        if (b.current_load > 80) color = '#ef4444';
        else if (b.current_load > 60) color = '#f59e0b';
        else if (b.current_load > 30) color = '#0961f6';
        
        ctx.fillStyle = color;
        ctx.fillRect(x, y, barW, barH);
        ctx.fillStyle = '#414B4E';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(b.name.substring(0, 8), x + barW / 2, h - 5);
        ctx.fillText(`${Math.round(b.current_load || 0)}%`, x + barW / 2, y - 5);
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

// В setupEventListeners добавьте:
document.getElementById('prevPage')?.addEventListener('click', prevPage);
document.getElementById('nextPage')?.addEventListener('click', nextPage);



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
      
      // Перезагружаем данные
      const allOps = await api.getOperations();
      allOperationsCache = allOps.sort((a, b) => a.id - b.id);
      
      // Применяем текущие фильтры заново
      applyFilters();
      
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
      const allOps = await api.getOperations();
      allOperationsCache = allOps.sort((a, b) => a.id - b.id);
      
      // Применяем текущие фильтры заново
      applyFilters();
      
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
                        <button class="btn-icon-sm" onclick="addWorkerToBrigade(${b.id})" title="Добавить рабочего">➕</button>
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
function addWorkerToBrigade(brigadeId) {
    const available = AdminState.workers.filter(w => !w.brigade_id);
    if (!available.length) { 
        showNotification('Внимание', 'Нет свободных рабочих', 'warning'); 
        return; 
    }
    
    closeAllModals();
    const DOM = getDOM();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'workerSelectModal';
    modal.style.display = 'block';
    modal.style.width = '400px';
    
    modal.innerHTML = `
        <div class="modal-header">
            <h3>Выберите рабочего</h3>
            <button class="modal-close" onclick="closeAllModals()">&times;</button>
        </div>
        <div class="modal-body" style="max-height: 400px; overflow-y: auto;">
            ${available.map(w => `
                <div style="padding: 10px; margin-bottom: 8px; background: #f8f9fa; border-radius: 8px; cursor: pointer; border: 1px solid #e5e7eb;"
                     onclick="selectWorkerForBrigade(${w.id}, ${brigadeId})">
                    <strong>${w.name}</strong>
                    <div style="font-size: 12px; color: #666;">${w.position || 'Рабочий'}</div>
                    ${w.skills?.length ? `
                        <div style="margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px;">
                            ${w.skills.map(s => `<span style="background: #e5e7eb; padding: 2px 6px; border-radius: 12px; font-size: 10px;">${s}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>
        <div class="modal-footer">
            <button class="btn btn-outline" onclick="closeAllModals()">Отмена</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    DOM.modalOverlay.style.display = 'block';
}

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

window.handleBrigadeDrop = async (e, brigadeId) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const workerId = AdminState.draggedWorkerId;
    if (!workerId) return;
    
    try {
        await api.transferWorker(workerId, brigadeId);
        showNotification('✅ Успех', 'Рабочий переведён', 'success');
        await loadAllData();
    } catch (error) {
        showNotification('❌ Ошибка', error.message, 'error');
    }
    AdminState.draggedWorkerId = null;
};

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
      // Очищаем предыдущий граф
      if (cy) {
          cy.destroy();
          cy = null;
      }
      
      // Строим элементы графа
      const elements = buildGraphElements();
      graphElements = elements;
      
      // Создаём новый граф
      cy = cytoscape({
          container: container,
          elements: elements,
          style: getGraphStyle(),
          layout: {
              name: 'dagre',
              rankDir: 'LR',
              spacingFactor: 1.6,
              nodeSep: 60,
              rankSep: 100,
              edgeSep: 10,
              animate: true,
              animationDuration: 600,
              animationEasing: 'ease-out-cubic'
          },
          // Настройки взаимодействия
          zoom: 1,
          pan: { x: 0, y: 0 },
          minZoom: 0.1,
          maxZoom: 3,
          wheelSensitivity: 0.2,
          
          // Настройки выделения
          selectionType: 'single',
          boxSelectionEnabled: false,
          autounselectify: false,
          
          // Производительность
          textureOnViewport: true,
          pixelRatio: 'auto'
      });
      
      // Применяем фильтры
      applyGraphFilters();
      
      // Настройка событий
      setupGraphEvents(cy);
      
      // Сохраняем в window для доступа из консоли и контролов
      window.cy = cy;
      
      // Анимация появления узлов
      animateNodesAppearance();
      
      if (loading) loading.style.display = 'none';
      
      console.log(`✅ Граф построен: ${elements.length} элементов`);
      
  } catch (e) {
      console.error('❌ Ошибка построения графа:', e);
      if (loading) {
          loading.innerHTML = `
              <div style="text-align: center; color: #ef4444;">
                  <svg viewBox="0 0 48 48" fill="none" width="48" height="48" style="margin: 0 auto 16px;">
                      <circle cx="24" cy="24" r="20" stroke="#ef4444" stroke-width="2"/>
                      <path d="M16 16L32 32M32 16L16 32" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                  <p>Ошибка загрузки графа</p>
                  <p style="font-size: 12px; margin-top: 8px;">${e.message}</p>
                  <button class="btn btn-outline btn-sm" onclick="renderGraph()" style="margin-top: 16px;">
                      Попробовать снова
                  </button>
              </div>
          `;
      }
  }
}


function buildGraphElements() {
  const elements = [];
  
  // ===== 1. УЗЛЫ ОПЕРАЦИЙ =====
  AdminState.operations.forEach(op => {
      const isCritical = AdminState.criticalPath.includes(op.op_number);
      const brigade = AdminState.brigades.find(b => b.id === op.brigade_id);
      const brigadeGroup = findBrigadeGroup(op.brigade_id);
      
      // Определяем статус
      let nodeStatus = op.status;
      if (op.status === 'in_progress') nodeStatus = 'progress';
      
      // Проверяем зависимости
      const depsCompleted = checkDependenciesCompleted(op);
      const isBlocked = op.status === 'pending' && !depsCompleted;
      
      // Цвет узла
      let bgColor = '#94a3b8'; // pending
      if (op.status === 'completed') bgColor = '#10b981';
      else if (op.status === 'in_progress') bgColor = '#3b82f6';
      else if (isBlocked) bgColor = '#ef4444';
      
      // Размер узла
      const importance = brigade?.importance || 'medium';
      const importanceSizes = { critical: 80, high: 70, medium: 60, low: 50 };
      const baseSize = importanceSizes[importance] || 60;
      const durationBonus = Math.min(20, (op.duration || 1) * 1.5);
      const nodeSize = Math.round(baseSize + durationBonus);
      
      // Формируем label
      const shortName = truncate(op.name, 18);
      const label = [
          `${getStatusIcon(op.status)} #${op.op_number}`,
          shortName,
          `⏱ ${op.duration || 0}ч  👤 ${op.people_count || 1}`,
          `📦 ${brigade?.name || '—'}`
      ].join('\n');
      
      elements.push({
          data: {
              id: `op${op.op_number}`,
              label: label,
              // Метаданные
              op_number: op.op_number,
              name: op.name,
              status: nodeStatus,
              duration: op.duration,
              labor_hours: op.labor_hours,
              people_count: op.people_count,
              brigade_id: op.brigade_id,
              brigade_name: brigade?.name || '—',
              brigade_group: brigadeGroup?.name || '—',
              location: op.location,
              time_reserve: op.time_reserve,
              end_date: op.end_date,
              start_date: op.start_date,
              isCritical: isCritical,
              depsCompleted: depsCompleted,
              isBlocked: isBlocked,
              prev_ops: op.prev_ops || [],
              next_ops: op.next_ops || [],
              size: nodeSize,
              bgColor: bgColor
          },
          classes: `operation ${nodeStatus} ${isCritical ? 'critical' : ''} ${isBlocked ? 'blocked' : ''}`
      });
  });
  
  // ===== 2. УЗЛЫ БРИГАД =====
  if (graphFilters.showBrigades) {
      AdminState.brigades.forEach(brigade => {
          const workers = AdminState.workers.filter(w => w.brigade_id === brigade.id);
          const brigadeOps = AdminState.operations.filter(op => op.brigade_id === brigade.id);
          
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
  AdminState.operations.forEach(op => {
      (op.next_ops || []).forEach(targetId => {
          const sourceOp = AdminState.operations.find(o => o.op_number === op.op_number);
          const targetOp = AdminState.operations.find(o => o.op_number === targetId);
          
          if (sourceOp && targetOp) {
              const sourceCritical = AdminState.criticalPath.includes(op.op_number);
              const targetCritical = AdminState.criticalPath.includes(targetId);
              const isCriticalEdge = sourceCritical && targetCritical;
              const sourceCompleted = sourceOp.status === 'completed';
              
              let edgeClass = 'dependency';
              if (sourceCompleted) edgeClass += ' completed';
              if (isCriticalEdge) edgeClass += ' critical';
              
              elements.push({
                  data: {
                      id: `edge_${op.op_number}_${targetId}`,
                      source: `op${op.op_number}`,
                      target: `op${targetId}`,
                      type: 'dependency',
                      isCritical: isCriticalEdge,
                      sourceCompleted: sourceCompleted,
                      sourceOp: op.op_number,
                      targetOp: targetId
                  },
                  classes: edgeClass
              });
          }
      });
  });
  
  return elements;
}


function getGraphStyle() {
  return [
      // ===== БАЗОВЫЙ СТИЛЬ УЗЛОВ =====
      {
          selector: 'node',
          style: {
              'width': 'data(size)',
              'height': 'data(size)',
              'background-color': 'data(bgColor)',
              'background-opacity': 0.95,
              'label': 'data(label)',
              'color': '#ffffff',
              'font-size': '11px',
              'font-weight': '600',
              'text-valign': 'center',
              'text-halign': 'center',
              'text-wrap': 'wrap',
              'text-max-width': '90px',
              'shape': 'round-rectangle',
              'border-width': 3,
              'border-color': '#ffffff',
              'border-opacity': 0.9,
              'padding': '12px',
              'text-margin-y': 2,
              'transition-property': 'background-color, border-color, width, height',
              'transition-duration': '0.2s'
          }
      },
      
      // ===== ОПЕРАЦИИ =====
      {
          selector: 'node.operation',
          style: {
              'shape': 'round-rectangle',
              'border-radius': '12px'
          }
      },
      
      // Завершённые
      {
          selector: 'node.completed',
          style: {
              'background-color': '#10b981',
              'border-color': '#34d399',
              'background-opacity': 1
          }
      },
      
      // В процессе
      {
          selector: 'node.progress',
          style: {
              'background-color': '#3b82f6',
              'border-color': '#60a5fa',
              'background-opacity': 1
          }
      },
      
      // Заблокированные
      {
          selector: 'node.blocked',
          style: {
              'background-color': '#ef4444',
              'border-color': '#f87171',
              'background-opacity': 0.9
          }
      },
      
      // Критический путь
      {
          selector: 'node.critical',
          style: {
              'border-width': 4,
              'border-color': '#ef4444',
              'border-style': 'solid'
          }
      },
      
      // ===== БРИГАДЫ =====
      {
          selector: 'node.brigade',
          style: {
              'shape': 'ellipse',
              'border-radius': '40px 40px 40px 40px',
              'background-opacity': 0.9
          }
      },
      
      // ===== ГРУППЫ =====
      {
          selector: 'node.group',
          style: {
              'shape': 'round-rectangle',
              'border-radius': '20px',
              'background-color': '#8b5cf6',
              'border-color': '#c4b5fd',
              'border-width': 3
          }
      },
      
      // ===== ВЫДЕЛЕНИЕ =====
      {
          selector: 'node:selected',
          style: {
              'border-width': 5,
              'border-color': '#fbbf24',
              'overlay-opacity': 0.25,
              'overlay-color': '#fbbf24',
              'overlay-padding': 8
          }
      },
      
      // ===== РЁБРА: ЗАВЕРШЁННЫЕ =====
      {
          selector: 'edge.completed',
          style: {
              'width': 4,
              'line-color': '#10b981',
              'target-arrow-color': '#10b981',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'arrow-scale': 1.4,
              'line-style': 'solid',
              'opacity': 1
          }
      },
      
      // ===== РЁБРА: КРИТИЧЕСКИЕ =====
      {
          selector: 'edge.critical',
          style: {
              'width': 4,
              'line-color': '#ef4444',
              'target-arrow-color': '#ef4444',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'arrow-scale': 1.4,
              'line-style': 'solid',
              'opacity': 1
          }
      },
      
      // ===== РЁБРА: НЕЗАВЕРШЁННЫЕ (пунктир, полупрозрачные) =====
      {
          selector: 'edge.dependency',
          style: {
              'width': 2.5,
              'line-color': '#94a3b8',
              'target-arrow-color': '#94a3b8',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'arrow-scale': 1.2,
              'line-style': 'dashed',
              'line-dash-pattern': [8, 6],
              'opacity': 0.5,
              'transition-property': 'line-color, opacity',
              'transition-duration': '0.3s'
          }
      },
      
      // ===== РЁБРА: СВЯЗИ С БРИГАДАМИ =====
      {
          selector: 'edge.assignment',
          style: {
              'width': 2.5,
              'line-color': '#8b5cf6',
              'target-arrow-color': '#8b5cf6',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'arrow-scale': 1.2,
              'line-style': 'dashed',
              'line-dash-pattern': [6, 5],
              'opacity': 0.6
          }
      },
      
      // ===== РЁБРА: СВЯЗИ С ГРУППАМИ =====
      {
          selector: 'edge.membership',
          style: {
              'width': 2,
              'line-color': '#a78bfa',
              'target-arrow-color': '#a78bfa',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'arrow-scale': 1,
              'line-style': 'dotted',
              'opacity': 0.5
          }
      },
      
      // ===== РЁБРА: ВЫДЕЛЕНИЕ =====
      {
          selector: 'edge:selected',
          style: {
              'width': 5,
              'line-color': '#fbbf24',
              'target-arrow-color': '#fbbf24',
              'opacity': 1
          }
      },
      
      // ===== СКРЫТЫЕ ЭЛЕМЕНТЫ =====
      {
          selector: '.hidden',
          style: {
              'display': 'none'
          }
      },
      
      // ===== ПОДСВЕТКА ПРИ НАВЕДЕНИИ =====
      {
          selector: 'node.hover',
          style: {
              'border-width': 4,
              'border-color': '#fbbf24',
              'overlay-opacity': 0.2,
              'overlay-color': '#fbbf24',
              'overlay-padding': 6,
              'transition-duration': '0.15s'
          }
      },
      
      {
          selector: 'edge.hover',
          style: {
              'width': 5,
              'line-color': '#fbbf24',
              'target-arrow-color': '#fbbf24',
              'opacity': 1,
              'transition-duration': '0.15s'
          }
      }
  ];
}

function setupGraphEvents(cy) {
  // Клик по узлу
  cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const data = node.data();
      
      // Снимаем выделение с других
      cy.elements().removeClass('selected');
      node.addClass('selected');
      
      // Показываем информацию
      if (data.type === 'brigade') {
          showBrigadeInfo(data);
      } else if (data.type === 'group') {
          showGroupInfo(data);
      } else {
          showNodeInfo(data);
      }
  });
  
  // Клик по ребру
  cy.on('tap', 'edge', (evt) => {
      const edge = evt.target;
      const data = edge.data();
      
      cy.elements().removeClass('selected');
      edge.addClass('selected');
      
      showEdgeInfo(data);
  });
  
  // Клик по фону
  cy.on('tap', (evt) => {
      if (evt.target === cy) {
          cy.elements().removeClass('selected');
          hideNodeInfo();
      }
  });
  
  // Двойной клик — фокусировка
  cy.on('dblclick', 'node', (evt) => {
      const node = evt.target;
      cy.animate({
          center: { eles: node },
          zoom: 1.5,
          duration: 400,
          easing: 'ease-out-cubic'
      });
  });
  
  // Наведение
  cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      node.addClass('hover');
      
      // Подсвечиваем связанные рёбра
      node.connectedEdges().addClass('hover');
      node.connectedEdges().connectedNodes().addClass('hover');
  });
  
  cy.on('mouseout', 'node', (evt) => {
      cy.elements().removeClass('hover');
  });
  
  cy.on('mouseover', 'edge', (evt) => {
      evt.target.addClass('hover');
  });
  
  cy.on('mouseout', 'edge', (evt) => {
      evt.target.removeClass('hover');
  });
  
  // Зум колёсиком
  cy.on('zoom', () => {
      // Можно добавить индикатор зума
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
      cy.nodes().forEach(node => {
          if (!node.data('isCritical') && node.hasClass('operation')) {
              node.addClass('hidden');
          }
      });
      cy.edges().forEach(edge => {
          if (!edge.data('isCritical') && edge.hasClass('dependency')) {
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

function changeGraphLayout(layoutValue) {
  if (!cy) return;
  
  const [name, rankDir] = layoutValue.split(':');
  const options = { 
      name, 
      animate: true, 
      animationDuration: 500,
      animationEasing: 'ease-out-cubic'
  };
  
  if (name === 'dagre' && rankDir) {
      options.rankDir = rankDir;
      options.spacingFactor = 1.6;
      options.nodeSep = rankDir === 'LR' ? 60 : 50;
      options.rankSep = rankDir === 'LR' ? 100 : 80;
  } else if (name === 'breadthfirst') {
      options.directed = true;
      options.spacingFactor = 1.5;
  } else if (name === 'cose') {
      options.idealEdgeLength = 100;
      options.nodeOverlap = 20;
  }
  
  cy.layout(options).run();
}

// ================================================================
// АНИМАЦИИ
// ================================================================

function animateNodesAppearance() {
  if (!cy || typeof anime === 'undefined') return;
  
  const nodes = cy.nodes();
  nodes.style({
      'opacity': 0,
      'transform': 'scale(0.8)'
  });
  
  anime({
      targets: nodes,
      opacity: [0, 1],
      scale: [0.8, 1],
      delay: (el, i) => i * 5,
      duration: 400,
      easing: 'easeOutCubic',
      update: function(anim) {
          // Обновление не требуется, cytoscape сам обрабатывает
      }
  });
  
  // Анимация рёбер
  const edges = cy.edges();
  edges.style({ 'opacity': 0 });
  
  setTimeout(() => {
      edges.style({ 'opacity': 1, 'transition-duration': '0.5s' });
  }, 300);
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
  
  const node = cy.$(`#op${opNumber}`);
  if (node.length) {
      cy.animate({
          center: { eles: node },
          zoom: 1.4,
          duration: 400,
          easing: 'ease-out-cubic'
      });
      
      node.addClass('selected');
      setTimeout(() => node.removeClass('selected'), 1500);
      
      // Показываем информацию
      showNodeInfo(node.data());
  }
}

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


async function runOptimization() {
    showLoading('Оптимизация...');
    try {
        const result = await api.optimize();
        const DOM = getDOM();
        if (DOM.aiRecommendations) {
            DOM.aiRecommendations.innerHTML = result.recommendations?.map(r => `<div style="padding:12px;background:#f8f9fa;border-radius:8px;margin-bottom:8px;"><h4>#${r.operation_id}: ${r.operation_name}</h4><p>👥 ${r.recommended_people} чел | ⚡ ${r.efficiency}%</p></div>`).join('') || '<p>Нет рекомендаций</p>';
        }
        showNotification('Успех', `Экономия: ${result.summary?.time_saved_percent || 0}%`, 'success');
    } catch (e) { showNotification('Ошибка', e.message, 'error'); } finally { hideLoading(); }
}

async function loadAIRecommendations() {
    try {
        const result = await api.optimize();
        const DOM = getDOM();
        if (DOM.aiRecommendations) DOM.aiRecommendations.innerHTML = result.recommendations?.slice(0,3).map(r => `<div>#${r.operation_id} 👥 ${r.recommended_people}</div>`).join('') || '';
    } catch (e) {}
}

function switchTab(tabId) {
    AdminState.currentTab = tabId;
    const DOM = getDOM();
    
    DOM.navItems?.forEach(i => i.classList.toggle('active', i.dataset.tab === tabId));
    DOM.tabPanes?.forEach(p => p.classList.toggle('active', p.id === `${tabId}-tab`));
    
    const titles = { 
        dashboard: 'Дашборд', 
        graph: 'Граф', 
        operations: 'Операции', 
        brigades: 'Бригады',
        'brigade-groups': 'Группы бригад',
        workers: 'Рабочие', 
        ai: 'AI',
        reports: 'Отчёты',
        settings: 'Настройки'
    };
    
    if (DOM.pageTitle) DOM.pageTitle.textContent = titles[tabId] || tabId;
    
    if (tabId === 'graph') setTimeout(renderGraph, 100);
    if (tabId === 'dashboard') setTimeout(renderCharts, 100);
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
}

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

document.addEventListener('DOMContentLoaded', initAdmin);