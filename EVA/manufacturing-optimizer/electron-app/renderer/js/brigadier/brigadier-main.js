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
  page: 'dashboard',
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  calSelected: null
};

const PAGE_LABELS = {
  dashboard: 'Сводка',
  employees: 'Сотрудники',
  operations: 'Работы',
  schedule: 'Расписание',
  docs: 'Документы',
  assign: 'Назначения',
  ai: 'AI-оптимизация',
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
  if (page === 'schedule') renderCalendar();
  if (page === 'docs') renderDocsArchive();
  if (page === 'ai') refreshAi();
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

  document.getElementById('btnAiRefresh')?.addEventListener('click', refreshAi);
  document.getElementById('calPrev')?.addEventListener('click', () => { State.calMonth--; renderCalendar(); });
  document.getElementById('calNext')?.addEventListener('click', () => { State.calMonth++; renderCalendar(); });
  document.getElementById('btnAddEvent')?.addEventListener('click', addCalendarEvent);
  document.getElementById('btnSaveDoc')?.addEventListener('click', saveDocReport);
  document.getElementById('btnNewDocReport')?.addEventListener('click', () => {
    document.getElementById('docTitle')?.focus();
  });
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
  if (State.brigadeId != null && State.brigadeId !== '') {
    const bid = Number(State.brigadeId);
    list = list.filter((w) => Number(w.brigade_id) === bid);
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
  if (State.brigadeId != null && State.brigadeId !== '') {
    const bid = Number(State.brigadeId);
    const mine = ops.filter((o) => Number(o.brigade_id) === bid);
    if (mine.length) ops = mine;
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
  const u = State.user || {};
  setVal('bgName', u.name);
  setVal('bgLogin', u.login);
  setVal('bgPosition', u.position || u.job_title || '');
  setVal('bgBrigade', State.brigade?.name || brigadeName(State.brigadeId) || '');
  setVal('bgEmail', u.email || '');
  setVal('bgPhone', u.phone || '');
  loadPersonalQr(false);
}

async function loadPersonalQr(force) {
  const canvas = document.getElementById('bgQrCanvas');
  const wrap = document.getElementById('bgQrWrap');
  const uid = State.user?.id;
  if (!uid) return;

  try {
    let res = await fetch(
      API + '/auth/qr/my?worker_id=' + encodeURIComponent(uid) + (force ? '&refresh=1' : '')
    );
    if (!res.ok) {
      res = await fetch(API + '/auth/qr/create', { method: 'POST' });
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const token = data.token || data.qr_token || data.payload || data.code;
    if (!token) throw new Error('нет token');

    if (typeof QRCode !== 'undefined' && QRCode.toCanvas && canvas) {
      canvas.style.display = 'block';
      await QRCode.toCanvas(canvas, String(token), {
        width: 160,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
    } else if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 160, 160);
      ctx.fillStyle = '#334155';
      ctx.font = '11px sans-serif';
      ctx.fillText(String(token).slice(0, 18), 8, 80);
    }
    if (wrap) wrap.title = 'token: ' + String(token).slice(0, 12) + '…';
  } catch (e) {
    console.warn('[brig QR]', e);
    alert('QR: ' + (e.message || e));
  }
}

async function changeBrigPassword() {
  const oldP = document.getElementById('bgOldPass')?.value || '';
  const newP = document.getElementById('bgNewPass')?.value || '';
  if (newP.length < 4) {
    alert('Новый пароль не короче 4 символов');
    return;
  }
  const uid = State.user?.id;
  if (!uid) return;
  try {
    // как в auth_api: POST /auth/password
    const res = await fetch(API + '/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: uid,
        old_password: oldP,
        new_password: newP,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
    alert('Пароль изменён');
    const a = document.getElementById('bgOldPass');
    const b = document.getElementById('bgNewPass');
    if (a) a.value = '';
    if (b) b.value = '';
  } catch (e) {
    alert('Пароль: ' + (e.message || e));
  }
}

function sendBrigReport() {
  const text = (document.getElementById('bgReportText')?.value || '').trim();
  if (!text) {
    alert('Напишите причину');
    return;
  }
  const key = 'brig_reports_' + (State.user?.id || 'x');
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  list.unshift({
    at: new Date().toISOString(),
    user_id: State.user?.id,
    name: State.user?.name,
    text,
  });
  localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
  document.getElementById('bgReportText').value = '';
  alert('Репорт сохранён (локально). Админ увидит после эндпоинта /auth/report.');
}

document.getElementById('bgQrRefreshBtn')?.addEventListener('click', () => loadPersonalQr(true));
document.getElementById('bgChangePassBtn')?.addEventListener('click', changeBrigPassword);
document.getElementById('bgReportBtn')?.addEventListener('click', sendBrigReport);

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

/* ---- AI / calendar / docs ---- */
async function refreshAi() {
    setText('aiStatus', '…');
    try {
      const r = await fetch(API + '/ai/status');
      const d = r.ok ? await r.json() : {};
      setText('aiStatus', d.status || (r.ok ? 'ok' : 'нет'));
      let recs = [], gaps = 0;
      try {
        const r2 = await fetch(API + '/ai/build-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (r2.ok) {
          const p = await r2.json();
          recs = p.recommendations || p.plan?.recommendations || [];
          gaps = p.gaps?.count || (p.gaps?.gaps || []).length || 0;
        }
      } catch (_) {}
      setText('aiRecCount', recs.length);
      setText('aiGapCount', gaps);
      const list = document.getElementById('aiRecList');
      if (list) {
        list.innerHTML = recs.length
          ? recs.slice(0, 20).map((x) => {
              const t = typeof x === 'string' ? x : (x.title || x.message || JSON.stringify(x));
              return '<div class="dash-op-row"><span>' + esc(t) + '</span></div>';
            }).join('')
          : '<p class="muted">Нет рекомендаций</p>';
      }
    } catch (e) {
      setText('aiStatus', 'ошибка');
    }
  }
  
  function eventsKey() { return 'brig_events_' + (State.brigadeId || State.userId || 'x'); }
  function docsKey() { return 'brig_docs_' + (State.brigadeId || State.userId || 'x'); }
  function loadEvents() { try { return JSON.parse(localStorage.getItem(eventsKey()) || '[]'); } catch (_) { return []; } }
  function saveEvents(list) { localStorage.setItem(eventsKey(), JSON.stringify(list)); }
  function loadDocs() { try { return JSON.parse(localStorage.getItem(docsKey()) || '[]'); } catch (_) { return []; } }
  function saveDocs(list) { localStorage.setItem(docsKey(), JSON.stringify(list)); }
  
  function renderCalendar() {
    const grid = document.getElementById('calGrid');
    const label = document.getElementById('calMonthLabel');
    if (!grid) return;
    while (State.calMonth < 0) { State.calMonth += 12; State.calYear--; }
    while (State.calMonth > 11) { State.calMonth -= 12; State.calYear++; }
    if (label) {
      label.textContent = new Date(State.calYear, State.calMonth, 1)
        .toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    }
    const first = new Date(State.calYear, State.calMonth, 1);
    const startPad = (first.getDay() + 6) % 7;
    const daysIn = new Date(State.calYear, State.calMonth + 1, 0).getDate();
    const events = loadEvents();
    const heads = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    let html = heads.map((h) => '<div class="cal-cell head">' + h + '</div>').join('');
    for (let i = 0; i < startPad; i++) html += '<div class="cal-cell muted"></div>';
    const today = new Date();
    for (let d = 1; d <= daysIn; d++) {
      const key = State.calYear + '-' + String(State.calMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const has = events.some((e) => e.date === key);
      const isToday = today.getFullYear() === State.calYear && today.getMonth() === State.calMonth && today.getDate() === d;
      const sel = State.calSelected === key ? ' selected' : '';
      html += '<div class="cal-cell' + (isToday ? ' today' : '') + sel + '" data-day="' + key + '"><div>' + d + '</div>' +
        (has ? '<span class="ev-dot"></span>' : '') + '</div>';
    }
    grid.innerHTML = html;
    grid.querySelectorAll('[data-day]').forEach((el) => {
      el.addEventListener('click', () => {
        State.calSelected = el.dataset.day;
        renderCalendar();
        renderDayEvents();
      });
    });
    if (!State.calSelected) {
      State.calSelected = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    }
    renderDayEvents();
  }
  
  function renderDayEvents() {
    const list = document.getElementById('dayEventsList');
    const cnt = document.getElementById('dayEventsCount');
    if (!list) return;
    const day = State.calSelected;
    const events = loadEvents().filter((e) => e.date === day);
    if (cnt) cnt.textContent = String(events.length);
    list.innerHTML = events.length
      ? events.map((e) => '<div class="dash-op-row"><span>' + esc(e.title) + '</span><span class="muted">' + esc(e.time || '') + '</span></div>').join('')
      : '<p class="muted">Нет событий на ' + esc(day || '') + '</p>';
  }
  
  function addCalendarEvent() {
    const day = State.calSelected || new Date().toISOString().slice(0, 10);
    const title = prompt('Событие на ' + day + ':', 'Планерка бригады');
    if (!title) return;
    const time = prompt('Время (напр. 08:00):', '08:00') || '';
    const list = loadEvents();
    list.push({ id: Date.now(), date: day, title: title.trim(), time, brigade_id: State.brigadeId });
    saveEvents(list);
    renderCalendar();
    notify('Календарь', 'Событие добавлено', 'success');
  }
  
  function saveDocReport() {
    const title = (document.getElementById('docTitle')?.value || '').trim();
    const body = (document.getElementById('docBody')?.value || '').trim();
    const type = document.getElementById('docType')?.value || 'shift';
    if (!title || !body) return notify('Отчёт', 'Заполните заголовок и текст', 'warning');
    const list = loadDocs();
    list.unshift({
      id: Date.now(), title, body, type,
      at: new Date().toISOString(),
      author: State.user?.name,
      brigade_id: State.brigadeId,
    });
    saveDocs(list.slice(0, 100));
    const t = document.getElementById('docTitle'); if (t) t.value = '';
    const b = document.getElementById('docBody'); if (b) b.value = '';
    renderDocsArchive();
    notify('Отчёт', 'Сохранён в архив бригады', 'success');
  }
  
  function renderDocsArchive() {
    const el = document.getElementById('docsArchiveList');
    if (!el) return;
    const list = loadDocs();
    el.innerHTML = list.length
      ? list.map((d) =>
          '<div class="doc-item"><strong>' + esc(d.title) + '</strong>' +
          '<div class="meta">' + esc(d.type) + ' · ' + new Date(d.at).toLocaleString('ru-RU') + ' · ' + esc(d.author || '') + '</div>' +
          '<div style="margin-top:6px;font-size:13px;">' + esc(d.body).slice(0, 280) + '</div></div>'
        ).join('')
      : '<p class="muted">Пока нет отчётов</p>';
  }

  function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v == null ? '' : String(v);
  }