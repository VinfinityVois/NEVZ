/**
 * NEVZ Brigadier Hub — CRUD employees / brigade works / transfer
 */
'use strict';

const API = 'http://127.0.0.1:8000';

const State = {
  userId: null,
  brigadeId: null,
  user: null,
  brigade: null,
  workers: [],
  brigades: [],
  operations: [],
  page: 'dashboard'
};

const PAGE_LABELS = {
  dashboard: 'Сводка',
  employees: 'Сотрудники',
  operations: 'Работы',
  assign: 'Назначения',
  reports: 'Отчёты',
  settings: 'Настройки'
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupSidebar();
  setupNav();
  setupEvents();

  const auth = window.electronAPI?.storage?.get('auth');
  const params = window.electronAPI?.app?.getStartupParams?.() || {};
  State.userId = auth?.user?.id || params.userId || null;
  State.brigadeId = auth?.user?.brigade_id ?? params.brigadeId ?? null;
  State.user = auth?.user || null;

  if (localStorage.getItem('brigSidebarCollapsed') === '1') {
    document.getElementById('hubSidebar')?.classList.add('collapsed');
  }

  paintUser();
  startClock();
  showPage('dashboard');
  await reloadAll();
  setInterval(checkHealth, 30000);
  checkHealth();
}

function setupSidebar() {
  const side = document.getElementById('hubSidebar');
  const toggle = document.getElementById('sidebarToggle');
  const setC = (on) => {
    side?.classList.toggle('collapsed', !!on);
    localStorage.setItem('brigSidebarCollapsed', on ? '1' : '0');
  };
  toggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    setC(!side.classList.contains('collapsed'));
  });
  side?.querySelector('.hub-logo')?.addEventListener('click', () => {
    if (side.classList.contains('collapsed')) setC(false);
  });
}

function setupNav() {
  document.querySelectorAll('.hub-nav-item').forEach((b) => {
    b.addEventListener('click', () => showPage(b.dataset.page));
  });
  document.getElementById('hubLogoutBtn')?.addEventListener('click', logout);
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
}

function showPage(page) {
  State.page = page;
  document.querySelectorAll('.hub-nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.page === page);
  });
  document.querySelectorAll('.hub-page').forEach((el) => {
    el.classList.toggle('active', el.id === 'page-' + page);
  });
  const lab = document.getElementById('hubPageLabel');
  if (lab) lab.textContent = PAGE_LABELS[page] || page;
  if (page === 'employees') renderEmployees();
  if (page === 'operations') renderOps();
  if (page === 'assign') fillAssignSelects();
  if (page === 'reports') renderReports();
  if (page === 'settings') fillSettings();
  if (page === 'dashboard') renderDashboard();
}

function setupEvents() {
  document.getElementById('refreshBtn')?.addEventListener('click', reloadAll);
  document.getElementById('btnAddWorker')?.addEventListener('click', () => openWorkerModal(null));
  document.getElementById('btnSaveWorker')?.addEventListener('click', saveWorker);
  document.getElementById('btnAddOp')?.addEventListener('click', () => openOpModal(null));
  document.getElementById('btnSaveOp')?.addEventListener('click', saveOp);
  document.getElementById('btnTransfer')?.addEventListener('click', doTransfer);
  document.getElementById('btnAssignOp')?.addEventListener('click', doAssignOp);
  document.getElementById('empSearch')?.addEventListener('input', renderEmployees);
  document.getElementById('opSearch')?.addEventListener('input', renderOps);
  document.getElementById('opStatusFilter')?.addEventListener('change', renderOps);
  document.getElementById('reportHorizon')?.addEventListener('change', renderReports);
  document.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', closeModals);
  });
  document.getElementById('modalOverlay')?.addEventListener('click', closeModals);
}

function paintUser() {
  const name = State.user?.name || 'Бригадир';
  const letter = name.charAt(0).toUpperCase();
  ['userName', 'userNameSide'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = name;
  });
  ['userAvatar', 'userAvatarSide'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = letter;
  });
  const bn = State.brigade?.name || (State.brigadeId != null ? 'Бригада #' + State.brigadeId : '—');
  const ub = document.getElementById('userBrigade');
  if (ub) ub.textContent = bn;
  const hb = document.getElementById('hubBrigadeLabel');
  if (hb) hb.textContent = bn;
}

async function reloadAll() {
  showLoading('Загрузка…');
  try {
    await Promise.all([loadBrigades(), loadWorkers(), loadOperations()]);
    // prefer brigade from user
    if (State.brigadeId != null) {
      State.brigade = State.brigades.find((b) => Number(b.id) === Number(State.brigadeId)) || State.brigade;
    }
    paintUser();
    renderDashboard();
    renderEmployees();
    renderOps();
    fillAssignSelects();
    fillSettings();
  } catch (e) {
    notify('Ошибка', String(e.message || e), 'error');
  } finally {
    hideLoading();
  }
}

async function loadBrigades() {
  const r = await fetch(API + '/brigades');
  if (!r.ok) throw new Error('brigades ' + r.status);
  const data = await r.json();
  State.brigades = Array.isArray(data) ? data : data.items || data.brigades || [];
}

async function loadWorkers() {
  // try several endpoints
  let list = [];
  const tries = [
    API + '/workers',
    API + '/auth/workers',
    API + '/employees'
  ];
  for (const url of tries) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        list = Array.isArray(d) ? d : d.workers || d.items || [];
        if (list.length || r.status === 200) break;
      }
    } catch (_) {}
  }
  // filter to my brigade + allow seeing all for transfer
  State.workers = list;
  if (!list.length && State.userId) {
    // fallback dashboard mates
    try {
      const r = await fetch(API + '/auth/worker/' + State.userId + '/dashboard');
      if (r.ok) {
        const d = await r.json();
        State.workers = d.mates || [];
        if (d.worker) {
          State.workers = [d.worker, ...State.workers.filter((w) => w.id !== d.worker.id)];
        }
        State.brigade = d.brigade || State.brigade;
      }
    } catch (_) {}
  }
}

async function loadOperations() {
  const r = await fetch(API + '/operations');
  if (!r.ok) throw new Error('operations ' + r.status);
  const d = await r.json();
  let ops = Array.isArray(d) ? d : d.operations || d.items || [];
  // focus brigade if set
  if (State.brigadeId != null) {
    const mine = ops.filter((o) => Number(o.brigade_id) === Number(State.brigadeId));
    State.operations = mine.length ? mine : ops;
  } else {
    State.operations = ops;
  }
}

function brigadeName(id) {
  const b = State.brigades.find((x) => Number(x.id) === Number(id));
  return b?.name || (id != null ? '#' + id : '—');
}

function renderDashboard() {
  const workers = State.workers.filter(
    (w) => State.brigadeId == null || Number(w.brigade_id) === Number(State.brigadeId)
  );
  const ops = State.operations;
  const inP = ops.filter((o) => st(o) === 'in_progress').length;
  const pend = ops.filter((o) => ['pending', 'ready'].includes(st(o))).length;
  const done = ops.filter((o) => ['completed', 'done'].includes(st(o))).length;
  setText('kpiWorkers', workers.length);
  setText('kpiInProgress', inP);
  setText('kpiPending', pend);
  setText('kpiDone', done);

  const mem = document.getElementById('dashMembers');
  if (mem) {
    mem.innerHTML = workers.length
      ? workers
          .map(
            (w) =>
              '<span class="member-chip' +
              (String(w.role) === 'brigadier' ? ' lead' : '') +
              '">' +
              esc(w.name || w.login) +
              (String(w.role) === 'brigadier' ? ' ★' : '') +
              '</span>'
          )
          .join('')
      : '<p class="muted">Нет сотрудников</p>';
  }
  const list = document.getElementById('dashOpsList');
  if (list) {
    list.innerHTML = ops.slice(0, 12)
      .map(
        (o) =>
          '<div class="dash-op-row"><span>#' +
          (o.op_number ?? o.id) +
          ' ' +
          esc(o.name || '') +
          '</span><span class="muted">' +
          statusRu(st(o)) +
          '</span></div>'
      )
      .join('') || '<p class="muted">Нет операций</p>';
  }
}

function renderEmployees() {
  const q = (document.getElementById('empSearch')?.value || '').toLowerCase();
  let rows = State.workers.slice();
  // show brigade first, then others
  rows.sort((a, b) => {
    const am = Number(a.brigade_id) === Number(State.brigadeId) ? 0 : 1;
    const bm = Number(b.brigade_id) === Number(State.brigadeId) ? 0 : 1;
    return am - bm || String(a.name || '').localeCompare(String(b.name || ''), 'ru');
  });
  if (q) {
    rows = rows.filter(
      (w) =>
        String(w.name || '').toLowerCase().includes(q) ||
        String(w.login || '').toLowerCase().includes(q)
    );
  }
  const tb = document.getElementById('employeesTbody');
  if (!tb) return;
  tb.innerHTML = rows
    .map((w) => {
      const role = String(w.role || 'worker');
      return (
        '<tr data-id="' +
        w.id +
        '">' +
        '<td>' +
        w.id +
        '</td>' +
        '<td>' +
        esc(w.name || '') +
        '</td>' +
        '<td>' +
        esc(w.login || '') +
        '</td>' +
        '<td><span class="badge-role ' +
        role +
        '">' +
        role +
        '</span></td>' +
        '<td>' +
        esc(brigadeName(w.brigade_id)) +
        '</td>' +
        '<td>' +
        (w.is_active === 0 || w.is_active === false ? 'неактивен' : 'активен') +
        '</td>' +
        '<td class="row-actions">' +
        '<button type="button" class="btn btn-outline" data-edit-w="' +
        w.id +
        '">Изменить</button>' +
        '<button type="button" class="btn btn-outline" data-del-w="' +
        w.id +
        '">Удалить</button>' +
        '</td></tr>'
      );
    })
    .join('') || '<tr><td colspan="7" class="muted">Нет данных</td></tr>';

  tb.querySelectorAll('[data-edit-w]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const w = State.workers.find((x) => Number(x.id) === Number(btn.dataset.editW));
      openWorkerModal(w);
    });
  });
  tb.querySelectorAll('[data-del-w]').forEach((btn) => {
    btn.addEventListener('click', () => deleteWorker(btn.dataset.delW));
  });
}

function renderOps() {
  const q = (document.getElementById('opSearch')?.value || '').toLowerCase();
  const sf = document.getElementById('opStatusFilter')?.value || 'all';
  let rows = State.operations.slice();
  if (sf !== 'all') rows = rows.filter((o) => st(o) === sf);
  if (q) {
    rows = rows.filter(
      (o) =>
        String(o.name || '').toLowerCase().includes(q) ||
        String(o.op_number || o.id).includes(q)
    );
  }
  const tb = document.getElementById('opsTbody');
  if (!tb) return;
  tb.innerHTML = rows
    .map(
      (o) =>
        '<tr>' +
        '<td>' +
        (o.op_number ?? o.id) +
        '</td>' +
        '<td>' +
        esc(o.name || '') +
        '</td>' +
        '<td>' +
        statusRu(st(o)) +
        '</td>' +
        '<td>' +
        (o.duration ?? '—') +
        '</td>' +
        '<td>' +
        (o.post ?? '—') +
        '</td>' +
        '<td>' +
        esc(brigadeName(o.brigade_id)) +
        '</td>' +
        '<td class="row-actions">' +
        '<button type="button" class="btn btn-outline" data-edit-o="' +
        o.id +
        '">Изменить</button>' +
        '<button type="button" class="btn btn-outline" data-del-o="' +
        o.id +
        '">Удалить</button>' +
        '</td></tr>'
    )
    .join('') || '<tr><td colspan="7" class="muted">Нет операций</td></tr>';

  tb.querySelectorAll('[data-edit-o]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const o = State.operations.find((x) => Number(x.id) === Number(btn.dataset.editO));
      openOpModal(o);
    });
  });
  tb.querySelectorAll('[data-del-o]').forEach((btn) => {
    btn.addEventListener('click', () => deleteOp(btn.dataset.delO));
  });
}

function fillBrigadeSelect(sel, selected) {
  if (!sel) return;
  sel.innerHTML =
    '<option value="">—</option>' +
    State.brigades
      .map(
        (b) =>
          '<option value="' +
          b.id +
          '"' +
          (Number(b.id) === Number(selected) ? ' selected' : '') +
          '>' +
          esc(b.name || '#' + b.id) +
          '</option>'
      )
      .join('');
}

function fillAssignSelects() {
  const tw = document.getElementById('transferWorker');
  const tb = document.getElementById('transferBrigade');
  const ao = document.getElementById('assignOp');
  const ab = document.getElementById('assignBrigade');
  if (tw) {
    tw.innerHTML = State.workers
      .map((w) => '<option value="' + w.id + '">' + esc(w.name || w.login) + ' (#' + w.id + ')</option>')
      .join('');
  }
  fillBrigadeSelect(tb, State.brigadeId);
  fillBrigadeSelect(ab, State.brigadeId);
  if (ao) {
    ao.innerHTML = State.operations
      .map(
        (o) =>
          '<option value="' + o.id + '">#' + (o.op_number ?? o.id) + ' ' + esc(o.name || '') + '</option>'
      )
      .join('');
  }
}

function openWorkerModal(w) {
  document.getElementById('workerModalTitle').textContent = w ? 'Изменить сотрудника' : 'Новый сотрудник';
  document.getElementById('wId').value = w?.id || '';
  document.getElementById('wName').value = w?.name || '';
  document.getElementById('wLogin').value = w?.login || '';
  document.getElementById('wPass').value = '';
  document.getElementById('wPassHint').textContent = w ? '(оставьте пустым, чтобы не менять)' : '(новый)';
  document.getElementById('wRole').value = w?.role || 'worker';
  fillBrigadeSelect(document.getElementById('wBrigade'), w?.brigade_id ?? State.brigadeId);
  document.getElementById('wEmail').value = w?.email || '';
  document.getElementById('wPhone').value = w?.phone || '';
  document.getElementById('wPosition').value = w?.position || '';
  showModal('workerModal');
}

function openOpModal(o) {
  document.getElementById('opModalTitle').textContent = o ? 'Изменить работу' : 'Новая работа';
  document.getElementById('oId').value = o?.id || '';
  document.getElementById('oName').value = o?.name || '';
  document.getElementById('oDuration').value = o?.duration ?? 1;
  document.getElementById('oPost').value = o?.post ?? '';
  document.getElementById('oStatus').value = st(o) || 'pending';
  fillBrigadeSelect(document.getElementById('oBrigade'), o?.brigade_id ?? State.brigadeId);
  showModal('opModal');
}

function showModal(id) {
  document.getElementById('modalOverlay').style.display = 'block';
  document.getElementById(id).style.display = 'block';
}
function closeModals() {
  document.getElementById('modalOverlay').style.display = 'none';
  document.getElementById('workerModal').style.display = 'none';
  document.getElementById('opModal').style.display = 'none';
}

async function saveWorker() {
  const id = document.getElementById('wId').value;
  const body = {
    name: document.getElementById('wName').value.trim(),
    login: document.getElementById('wLogin').value.trim(),
    role: document.getElementById('wRole').value,
    brigade_id: numOrNull(document.getElementById('wBrigade').value),
    email: document.getElementById('wEmail').value.trim() || null,
    phone: document.getElementById('wPhone').value.trim() || null,
    position: document.getElementById('wPosition').value.trim() || null
  };
  const pass = document.getElementById('wPass').value;
  if (pass) body.password = pass;
  if (!body.name || !body.login) {
    notify('Проверка', 'ФИО и логин обязательны', 'warning');
    return;
  }
  if (!id && !pass) {
    notify('Проверка', 'Укажите пароль для нового сотрудника', 'warning');
    return;
  }
  showLoading('Сохранение…');
  try {
    const url = id ? API + '/workers/' + id : API + '/workers';
    // try alternate paths
    let r = await fetch(url, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok && !id) {
      r = await fetch(API + '/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    closeModals();
    await loadWorkers();
    renderEmployees();
    renderDashboard();
    fillAssignSelects();
    notify('Готово', id ? 'Сотрудник обновлён' : 'Сотрудник создан', 'success');
  } catch (e) {
    notify('Ошибка', String(e.message || e) + ' — проверьте эндпоинты /workers', 'error');
  } finally {
    hideLoading();
  }
}

async function deleteWorker(id) {
  if (!confirm('Удалить сотрудника #' + id + '?')) return;
  showLoading('Удаление…');
  try {
    let r = await fetch(API + '/workers/' + id, { method: 'DELETE' });
    if (!r.ok) r = await fetch(API + '/auth/workers/' + id, { method: 'DELETE' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await loadWorkers();
    renderEmployees();
    renderDashboard();
    notify('Удалено', 'Сотрудник #' + id, 'success');
  } catch (e) {
    notify('Ошибка', String(e.message || e), 'error');
  } finally {
    hideLoading();
  }
}

async function saveOp() {
  const id = document.getElementById('oId').value;
  const body = {
    name: document.getElementById('oName').value.trim(),
    duration: parseFloat(document.getElementById('oDuration').value) || 1,
    post: document.getElementById('oPost').value.trim() || null,
    status: document.getElementById('oStatus').value,
    brigade_id: numOrNull(document.getElementById('oBrigade').value)
  };
  if (!body.name) {
    notify('Проверка', 'Название обязательно', 'warning');
    return;
  }
  showLoading('Сохранение…');
  try {
    const url = id ? API + '/operations/' + id : API + '/operations';
    const r = await fetch(url, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    closeModals();
    await loadOperations();
    renderOps();
    renderDashboard();
    fillAssignSelects();
    notify('Готово', id ? 'Работа обновлена' : 'Работа создана', 'success');
  } catch (e) {
    notify('Ошибка', String(e.message || e), 'error');
  } finally {
    hideLoading();
  }
}

async function deleteOp(id) {
  if (!confirm('Удалить операцию #' + id + '?')) return;
  showLoading('Удаление…');
  try {
    const r = await fetch(API + '/operations/' + id, { method: 'DELETE' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await loadOperations();
    renderOps();
    renderDashboard();
    notify('Удалено', 'Операция #' + id, 'success');
  } catch (e) {
    notify('Ошибка', String(e.message || e), 'error');
  } finally {
    hideLoading();
  }
}

async function doTransfer() {
  const wid = document.getElementById('transferWorker')?.value;
  const bid = document.getElementById('transferBrigade')?.value;
  if (!wid || !bid) {
    notify('Проверка', 'Выберите сотрудника и бригаду', 'warning');
    return;
  }
  showLoading('Перенос…');
  try {
    let r = await fetch(API + '/workers/' + wid, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brigade_id: Number(bid) })
    });
    if (!r.ok) {
      r = await fetch(API + '/brigades/' + bid + '/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: Number(wid) })
      });
    }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await loadWorkers();
    renderEmployees();
    renderDashboard();
    fillAssignSelects();
    notify('Готово', 'Сотрудник перенесён в бригаду #' + bid, 'success');
  } catch (e) {
    notify('Ошибка', String(e.message || e), 'error');
  } finally {
    hideLoading();
  }
}

async function doAssignOp() {
  const oid = document.getElementById('assignOp')?.value;
  const bid = document.getElementById('assignBrigade')?.value;
  if (!oid || !bid) {
    notify('Проверка', 'Выберите операцию и бригаду', 'warning');
    return;
  }
  showLoading('Назначение…');
  try {
    const r = await fetch(API + '/operations/' + oid, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brigade_id: Number(bid) })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await loadOperations();
    renderOps();
    renderDashboard();
    notify('Готово', 'Операция назначена бригаде #' + bid, 'success');
  } catch (e) {
    notify('Ошибка', String(e.message || e), 'error');
  } finally {
    hideLoading();
  }
}

function renderReports() {
  const ops = State.operations;
  const done = ops.filter((o) => ['completed', 'done'].includes(st(o))).length;
  const total = ops.length || 1;
  const pct = Math.round((done / total) * 100);
  setText('repPercent', pct + '%');
  setText('repDone', done);
  setText('repTotal', ops.length);
  const box = document.getElementById('reportDetails');
  if (box) {
    const by = {};
    ops.forEach((o) => {
      const s = statusRu(st(o));
      by[s] = (by[s] || 0) + 1;
    });
    box.innerHTML =
      Object.keys(by)
        .map((k) => '<div class="dash-op-row"><span>' + k + '</span><strong>' + by[k] + '</strong></div>')
        .join('') || 'Нет данных';
  }
}

function fillSettings() {
  setVal('bgName', State.user?.name);
  setVal('bgLogin', State.user?.login);
  setVal('bgBrigade', State.brigade?.name || brigadeName(State.brigadeId));
}

async function checkHealth() {
  const cs = document.getElementById('connectionStatus');
  try {
    const r = await fetch(API + '/health');
    const ok = r.ok;
    cs?.classList.toggle('offline', !ok);
    const t = cs?.querySelector('.status-text');
    if (t) t.textContent = ok ? 'Подключено' : 'Нет связи';
    setText('dashOnline', ok ? 'в сети' : 'нет API');
  } catch (_) {
    cs?.classList.add('offline');
    setText('dashOnline', 'нет API');
  }
}

function startClock() {
  const tick = () => {
    const n = new Date();
    setText(
      'currentDate',
      n.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    );
    setText(
      'currentTime',
      n.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
  };
  tick();
  setInterval(tick, 1000);
}

async function logout() {
  try {
    await window.electronAPI?.navigation?.logout?.();
  } catch (_) {}
}

function st(o) {
  return String(o?.status || 'pending').toLowerCase();
}
function statusRu(s) {
  return (
    {
      pending: 'Ожидает',
      ready: 'Готово',
      in_progress: 'В работе',
      completed: 'Завершено',
      done: 'Завершено',
      blocked: 'Блок'
    }[s] || s
  );
}
function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}
function setVal(id, v) {
  const el = document.getElementById(id);
  if (el) el.value = v ?? '';
}
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function notify(title, message, type) {
  const box = document.getElementById('notificationsContainer');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'notification ' + (type || 'info');
  el.innerHTML =
    '<div class="notification-title">' +
    esc(title) +
    '</div><div class="notification-message">' +
    esc(message) +
    '</div>';
  box.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}
function showLoading(t) {
  const o = document.getElementById('loadingOverlay');
  const tx = document.getElementById('loadingText');
  if (tx) tx.textContent = t || '…';
  if (o) o.style.display = 'flex';
}
function hideLoading() {
  const o = document.getElementById('loadingOverlay');
  if (o) o.style.display = 'none';
}
