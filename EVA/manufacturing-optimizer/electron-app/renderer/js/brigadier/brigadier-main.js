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
const PeerPicker = { items: [], filter: 'all', selected: null };

function peerEsc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

function renderPeerList() {
  const box = document.getElementById('chatPeerList');
  if (!box) {
    console.warn('[chat] нет #chatPeerList');
    return;
  }
  const q = (document.getElementById('chatPeerSearch')?.value || '').toLowerCase().trim();
  let list = PeerPicker.items.slice();
  if (PeerPicker.filter !== 'all') list = list.filter((x) => x.type === PeerPicker.filter);
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
            '"><span class="p-name">' +
            peerEsc(x.name) +
            '</span><span class="p-meta">' +
            peerEsc(x.meta || '') +
            '</span></div>'
          );
        })
        .join('')
    : '<p class="muted" style="padding:8px">Никого не найдено</p>';
  box.querySelectorAll('.peer-item').forEach((el) => {
    el.onclick = () => {
      PeerPicker.selected = el.getAttribute('data-key');
      const val = document.getElementById('chatPeerValue');
      if (val) val.value = PeerPicker.selected;
      renderPeerList();
    };
  });
}

async function loadChatPeerOptions() {
  setupPeerPicker();
  const myId = Number(State.userId);
  const items = [
    { key: 'admin:0', type: 'admin', id: 0, name: 'Администратор', meta: 'служба поддержки' },
  ];

  let workers = Array.isArray(State.workers) ? State.workers.slice() : [];
  if (workers.length < 1) {
    try {
      const url =
        State.brigadeId != null
          ? API + '/workers?brigade_id=' + encodeURIComponent(State.brigadeId)
          : API + '/workers';
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        workers = Array.isArray(data) ? data : data.items || [];
      }
    } catch (e) {
      console.warn(e);
    }
  }

  workers.forEach((w) => {
    if (Number(w.id) === myId) return;
    items.push({
      key: 'worker:' + w.id,
      type: w.is_brigadier ? 'brigadier' : 'worker',
      id: w.id,
      name: w.name || '#' + w.id,
      meta:
        (w.is_brigadier ? 'бригадир' : 'сотрудник') +
        (w.brigade_id != null ? ' · бр.' + w.brigade_id : ''),
    });
  });

  PeerPicker.items = items;
  PeerPicker.selected = null;
  const hv = document.getElementById('chatPeerValue');
  if (hv) hv.value = '';
  console.log('[chat peers] brig count=', items.length);
  renderPeerList();
}

async function startChatFromPicker() {
  const raw = document.getElementById('chatPeerValue')?.value || '';
  const body = (document.getElementById('chatNewBody')?.value || '').trim();
  if (!raw) return alert('Выберите получателя в списке');
  if (!body) return alert('Введите текст');

  const [ptype, idStr] = raw.split(':');
  const peer_id = Number(idStr);
  const item = PeerPicker.items.find((i) => i.key === raw);

  const peerTitle = item?.name || (ptype === 'admin' ? 'Администратор' : raw);
  const nameEl = document.getElementById('chatPeerName');
  const metaEl = document.getElementById('chatPeerMeta');
  if (nameEl) nameEl.textContent = peerTitle;
  if (metaEl) metaEl.textContent = ptype === 'admin' ? 'администратор' : (item?.meta || '');

  try {
    const r = await fetch(API + '/chat/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        peer_type: 'worker',
        peer_id: ptype === 'admin' ? Number(State.userId) : peer_id,
        peer_name: ptype === 'admin' ? 'Администратор' : (item?.name || raw),
        brigade_id: State.brigadeId,
        subject: body.slice(0, 80),
        body: (ptype === 'admin' ? '[к администратору] ' : '') + body,
        sender_role: 'brigadier',
        sender_id: Number(State.userId),
        sender_name: State.user?.name || 'Бригадир',
      }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();

    const modal = document.getElementById('chatNewModal');
    if (modal) {
      modal.classList.remove('is-open');
      modal.style.display = 'none';
    }
    const ta = document.getElementById('chatNewBody');
    if (ta) ta.value = '';

    await loadChatThreads();
    if (d.thread_id) openChatThread(d.thread_id);
  } catch (e) {
    alert(String(e.message || e));
  }
}
function bindChatNewUi() {
  const btnNew = document.getElementById('btnChatNew');
  const btnSend = document.getElementById('chatNewSend');
  const btnClose = document.getElementById('chatNewClose');
  if (btnNew && !btnNew.dataset.bound) {
    btnNew.dataset.bound = '1';
    btnNew.addEventListener('click', async () => {
      await loadChatPeerOptions();
      const m = document.getElementById('chatNewModal');
      if (m) {
        m.classList.add('is-open');
        m.style.display = 'flex';
        document.getElementById('chatPeerSearch')?.focus();
      }
    });
  }
  if (btnClose && !btnClose.dataset.bound) {
    btnClose.dataset.bound = '1';
    btnClose.addEventListener('click', () => {
      const m = document.getElementById('chatNewModal');
      if (m) {
        m.classList.remove('is-open');
        m.style.display = 'none';
      }
    });
  }
  if (btnSend && !btnSend.dataset.bound) {
    btnSend.dataset.bound = '1';
    btnSend.addEventListener('click', () => startChatFromPicker());
  }
}
const PAGE_LABELS = {
  dashboard: 'Сводка',
  employees: 'Сотрудники',
  operations: 'Работы',
  schedule: 'Расписание',
  docs: 'Документы',
  assign: 'Назначения',
  ai: 'AI-оптимизация',
  reports: 'Отчёты',
  messages: 'Сообщения',
  settings: 'Настройки'
};
const CHAT_ROLE = 'brigadier';
const ChatState = { threads: [], activeId: null };

document.addEventListener('DOMContentLoaded', init);
bindChatNewUi();

async function init() {
      // DEBUG — видно сразу на странице
  const _dbg = document.createElement('div');
//   _dbg.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:99999;background:#111;color:#0f0;padding:6px 10px;font:12px monospace;';
  _dbg.textContent = 'URL: ' + location.search;
  document.body.appendChild(_dbg);
  setupSidebar();
  setupNav();
  setupEvents();
  // bindChatNewUi();

  const auth = window.electronAPI?.storage?.get('auth');
  const params = window.electronAPI?.app?.getStartupParams?.() || {};
  let q = {};
  try {
    const sp = new URLSearchParams(window.location.search || '');
    q = {
      userId: sp.get('userId'),
      brigadeId: sp.get('brigadeId'),
    };
  } catch (_) {}

  const rawUserId = auth?.user?.id ?? params.userId ?? q.userId;
  const rawBrigadeId = auth?.user?.brigade_id ?? params.brigadeId ?? q.brigadeId;

  State.userId = rawUserId != null && rawUserId !== '' && rawUserId !== 'null'
    ? Number(rawUserId) || rawUserId
    : null;
  State.brigadeId = rawBrigadeId != null && rawBrigadeId !== '' && rawBrigadeId !== 'null'
    ? Number(rawBrigadeId) || rawBrigadeId
    : null;
  State.user = auth?.user || null;

  console.log('[Brigadier init]', { userId: State.userId, brigadeId: State.brigadeId, hasAuth: !!auth?.user });

  if (State.userId) {
    try {
      const r = await fetch(API + '/auth/worker/' + State.userId + '/dashboard');
      if (r.ok) {
        const d = await r.json();
        if (d.worker) State.user = { ...State.user, ...d.worker };
        if (d.brigade) State.brigade = d.brigade;
      }
    } catch (_) {}
  }

  if (localStorage.getItem('brigSidebarCollapsed') === '1') {
    document.getElementById('hubSidebar')?.classList.add('collapsed');
  }

  if (window._chatPoll) clearInterval(window._chatPoll);
window._chatPoll = setInterval(() => {
  if (State.page === 'messages' || document.querySelector('.hub-nav-item.active[data-page="messages"]')) {
    loadChatThreads();
    if (ChatState.activeId) openChatThread(ChatState.activeId);
  } else {
    loadChatThreads();
  }
}, 8000);

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
  if (page === 'messages') loadChatThreads();
}


function avatarKey() {
    return 'brig_avatar_' + (State.userId || 'x');
  }
  
  function applyAvatarFromStorage() {
    const data = localStorage.getItem(avatarKey());
    const map = [
      ['settingsAvatarImg', 'settingsAvatar'],
      ['userAvatarImg', 'userAvatar'],
      ['userAvatarSideImg', 'userAvatarSide'],
    ];
    map.forEach(([imgId, avId]) => {
      const img = document.getElementById(imgId);
      const av = document.getElementById(avId);
      if (data && img) {
        img.src = data;
        img.style.display = 'block';
        if (av) av.style.display = 'none';
      } else {
        if (img) img.style.display = 'none';
        if (av) av.style.display = '';
      }
    });
  }
  
  function onAvatarFile(e) {
    const f = e?.target?.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      localStorage.setItem(avatarKey(), reader.result);
      applyAvatarFromStorage();
      notify('Фото', 'Аватар сохранён', 'success');
    };
    reader.readAsDataURL(f);
  }
  
  function deleteAvatar() {
    localStorage.removeItem(avatarKey());
    applyAvatarFromStorage();
    notify('Фото', 'Удалено', 'success');
  }

function setupEvents() {
  document.getElementById('btnNotifPanel')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleNotifPanel();
  });
  document.getElementById('btnNotifClose')?.addEventListener('click', () => {
    const p = document.getElementById('notifPanel');
    if (p) p.style.display = 'none';
  });
  document.addEventListener('click', (e) => {
    const wrap = document.querySelector('.notif-wrap');
    const p = document.getElementById('notifPanel');
    if (p && wrap && !wrap.contains(e.target)) p.style.display = 'none';
  });
  document.getElementById('reqTemplate')?.addEventListener('change', applyReqTemplate);

  document.getElementById('settingsSaveUiBtn')?.addEventListener('click', saveBrigUiSettings);

  document.getElementById('bgChangePassBtn')?.addEventListener('click', changeBrigPassword);
  document.getElementById('bgQrRefreshBtn')?.addEventListener('click', () => loadPersonalQr(true));
  document.getElementById('bgSendReportBtn')?.addEventListener('click', sendBrigReport);
  document.getElementById('avatarChangeBtn')?.addEventListener('click', () => document.getElementById('avatarFileInput')?.click());
  document.getElementById('avatarFileInput')?.addEventListener('change', (e) => {
    if (typeof onAvatarFile === 'function') onAvatarFile(e);
  });
  document.getElementById('avatarDeleteBtn')?.addEventListener('click', () => {
    if (typeof deleteAvatar === 'function') deleteAvatar();
  });

  document.getElementById('btnSaveEvent')?.addEventListener('click', saveCalendarEvent);
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

  document.getElementById('btnChatSend')?.addEventListener('click', sendChatMessage);
  document.getElementById('chatSearch')?.addEventListener('input', renderChatThreadList);
  document.getElementById('btnNotifPanel')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showPage('messages');
    loadChatThreads();
  });
  fillChatTemplates();
}

function saveBrigUiSettings() {
    localStorage.setItem('brig_lang', document.getElementById('settingsLang')?.value || 'ru');
    localStorage.setItem('brigSidebarMode', document.getElementById('settingsSidebarMode')?.value || 'click');
    localStorage.setItem('brig_dash_density', document.getElementById('settingsDashDensity')?.value || 'comfortable');
    localStorage.setItem('brig_notif_app', document.getElementById('notifApp')?.checked ? '1' : '0');
    localStorage.setItem('brig_notif_crit', document.getElementById('notifCritical')?.checked ? '1' : '0');
    localStorage.setItem('brig_dash_team', document.getElementById('dashShowTeam')?.checked ? '1' : '0');
    localStorage.setItem('brig_dash_crit', document.getElementById('dashShowCrit')?.checked ? '1' : '0');
    applyDashPrefs();
    notify('Сохранено', 'Настройки интерфейса записаны', 'success');
  }
  
  function loadBrigUiSettings() {
    const setSel = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    const setChk = (id, key, def) => {
      const el = document.getElementById(id);
      if (el) el.checked = (localStorage.getItem(key) ?? def) === '1';
    };
    setSel('settingsLang', localStorage.getItem('brig_lang') || 'ru');
    setSel('settingsSidebarMode', localStorage.getItem('brigSidebarMode') || 'click');
    setSel('settingsDashDensity', localStorage.getItem('brig_dash_density') || 'comfortable');
    setChk('notifApp', 'brig_notif_app', '1');
    setChk('notifCritical', 'brig_notif_crit', '1');
    setChk('dashShowTeam', 'brig_dash_team', '1');
    setChk('dashShowCrit', 'brig_dash_crit', '1');
    applyDashPrefs();
  }
  
  function applyDashPrefs() {
    const dens = localStorage.getItem('brig_dash_density') || 'comfortable';
    document.body.classList.toggle('dash-compact', dens === 'compact');
    const team = document.getElementById('dashTeamList')?.closest('.card');
    const crit = document.getElementById('dashCriticalList')?.closest('.card');
    if (team) team.style.display = localStorage.getItem('brig_dash_team') === '0' ? 'none' : '';
    if (crit) crit.style.display = localStorage.getItem('brig_dash_crit') === '0' ? 'none' : '';
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

  applyAvatarFromStorage();
}

async function reloadAll() {
    showLoading('Загрузка…');
    try {
      // 1) Профиль + mates + ops бригады с API dashboard
      if (State.userId) {
        try {
          const r = await fetch(API + '/auth/worker/' + State.userId + '/dashboard');
          if (r.ok) {
            const d = await r.json();
            if (d.worker) {
              State.user = { ...(State.user || {}), ...d.worker };
              if (d.worker.brigade_id != null && d.worker.brigade_id !== '') {
                State.brigadeId = d.worker.brigade_id;
              }
            }
            if (d.brigade) {
              State.brigade = d.brigade;
              if (d.brigade.id != null) State.brigadeId = d.brigade.id;
            }
            if (Array.isArray(d.mates) && d.mates.length) {
              State.workers = d.mates;
            }
            if (Array.isArray(d.operations) && d.operations.length) {
              State.operations = d.operations;
            }
          } else {
            console.warn('[brigadier] dashboard HTTP', r.status);
          }
        } catch (e) {
          console.warn('[brigadier] dashboard', e);
        }
      }
  
      // 2) Добиваем справочники
      await Promise.all([loadBrigades(), loadWorkers(), loadOperations()]);
  
      if (State.brigadeId != null) {
        State.brigade = State.brigades.find((b) => Number(b.id) === Number(State.brigadeId)) || State.brigade;
      }
  
      // если workers пуст — хотя бы текущий пользователь
      if ((!State.workers || !State.workers.length) && State.user) {
        State.workers = [State.user];
      }
  
      console.log('[brigadier reloadAll]', {
        userId: State.userId,
        brigadeId: State.brigadeId,
        workers: (State.workers || []).length,
        ops: (State.operations || []).length,
        user: State.user?.name,
      });
  
      paintUser();
      renderDashboard();
      renderEmployees();
      renderOps();
      fillAssignSelects();
      fillSettings();
      await loadChatThreads();
    } catch (e) {
      console.error(e);
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
    const filtered = list.filter((w) => Number(w.brigade_id) === bid);
    // если фильтр пустой, но API что-то вернул — не прячем всё молча
    list = filtered.length ? filtered : list;
  }
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
            State.user = { ...State.user, ...d.worker };
            if (d.worker.brigade_id != null) State.brigadeId = d.worker.brigade_id;
          }
          State.brigade = d.brigade || State.brigade;
          if (State.brigade?.id != null) State.brigadeId = State.brigade.id;
      }
    } catch (_) {}
  }

}

async function loadOperations() {
    const r = await fetch(API + '/operations');
    if (!r.ok) throw new Error('operations HTTP ' + r.status);
    const data = await r.json();
    let ops = Array.isArray(data) ? data : (data.items || data.operations || []);
    if (State.brigadeId != null && State.brigadeId !== '') {
      const bid = Number(State.brigadeId);
      const mine = ops.filter((o) => Number(o.brigade_id) === bid);
      if (mine.length) ops = mine;
    }
    State.operations = ops || [];
  }

function brigadeName(id) {
  const b = State.brigades.find((x) => Number(x.id) === Number(id));
  return b?.name || (id != null ? '#' + id : '—');
}

function renderDashboard() {
    const ws = State.workers || [];
    const ops = State.operations || [];
  
    setText('kpiWorkers', ws.length);
    setText('kpiInProgress', ops.filter((o) => st(o) === 'in_progress').length);
    setText('kpiPending', ops.filter((o) => st(o) === 'pending' || st(o) === 'ready').length);
    setText('kpiDone', ops.filter((o) => st(o) === 'completed' || st(o) === 'done').length);
  
    // Работы бригады
    const opsBox = document.getElementById('dashOpsList');
    if (opsBox) {
      const show = ops.slice(0, 12);
      opsBox.innerHTML = show.length
        ? show
            .map(
              (o) =>
                '<div class="dash-op-row"><span>#' +
                o.id +
                ' ' +
                esc(o.name || '') +
                '</span><span class="badge-st ' +
                st(o) +
                '">' +
                statusRu(st(o)) +
                (o.end_date ? ' · ' + esc(o.end_date) : '') +
                '</span></div>'
            )
            .join('')
        : '<p class="muted">Нет работ</p>';
    }
  
    // Состав
    const teamBox = document.getElementById('dashMembers');
    if (teamBox) {
      teamBox.innerHTML = ws.length
        ? ws
            .slice(0, 12)
            .map(
              (w) =>
                '<div class="team-row"><span>' +
                esc(w.name || '') +
                '</span><span class="muted">' +
                (w.is_brigadier ? 'бригадир' : 'сотрудник') +
                '</span></div>'
            )
            .join('')
        : '<p class="muted">Нет сотрудников</p>';
    }
  
    if (typeof renderDeadlines === 'function') {
      renderDeadlines(ops);
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
    const workers = State.workers || [];
    const brigades = State.brigades || [];
    const ops = State.operations || [];
  
    // мини-карточки выбора
    renderMiniPick('trWorkerMini', workers.map((w) => ({
      id: w.id,
      title: w.name || w.login || ('#' + w.id),
      sub: (w.is_brigadier ? 'Бригадир' : 'Сотрудник') + ' · ' + (w.login || ''),
      letter: (w.name || '?').charAt(0).toUpperCase(),
    })), 'trWorker', 'trPickBadge', 'сотрудник');
  
    renderMiniPick('trBrigadeMini', brigades.slice(0, 40).map((b) => ({
      id: b.id,
      title: b.name || ('Бригада #' + b.id),
      sub: 'id ' + b.id,
      letter: 'Б',
    })), 'trBrigade', null, 'бригада');
  
    renderMiniPick('asOpMini', ops.slice(0, 48).map((o) => ({
      id: o.id,
      title: o.name || ('Оп. ' + o.id),
      sub: '#' + o.id + ' · ' + statusRu(st(o)),
      letter: '#',
    })), 'asOp', 'asPickBadge', 'операция');
  
    renderMiniPick('asBrigadeMini', brigades.slice(0, 40).map((b) => ({
      id: b.id,
      title: b.name || ('Бригада #' + b.id),
      sub: 'id ' + b.id,
      letter: 'Б',
    })), 'asBrigade', null, 'бригада');
  
    // предвыбор своей бригады
    if (State.brigadeId != null) {
      setHiddenPick('trBrigade', State.brigadeId);
      setHiddenPick('asBrigade', State.brigadeId);
      highlightMini('trBrigadeMini', State.brigadeId);
      highlightMini('asBrigadeMini', State.brigadeId);
    }
    syncAssignButtons();
    // renderAssignCards();
  }
  
  function renderMiniPick(containerId, items, hiddenId, badgeId, kind) {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = items.length
      ? items.map((it) =>
          '<button type="button" class="mini-card" data-pick-id="' + it.id + '">' +
          '<span class="mini-av">' + esc(it.letter) + '</span>' +
          '<span class="mini-txt"><strong>' + esc(it.title) + '</strong><span class="muted">' + esc(it.sub) + '</span></span>' +
          '</button>'
        ).join('')
      : '<p class="muted">Нет данных</p>';
  
    box.querySelectorAll('.mini-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-pick-id');
        setHiddenPick(hiddenId, id);
        box.querySelectorAll('.mini-card').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        if (badgeId) {
          const t = btn.querySelector('strong')?.textContent || id;
          setText(badgeId, t);
        }
        syncAssignButtons();
      });
    });
  }
  
  function setHiddenPick(hiddenId, val) {
    const el = document.getElementById(hiddenId);
    if (el) el.value = val == null ? '' : String(val);
  }
  
  function highlightMini(containerId, id) {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.querySelectorAll('.mini-card').forEach((b) => {
      b.classList.toggle('selected', String(b.getAttribute('data-pick-id')) === String(id));
    });
  }
  
  function syncAssignButtons() {
    const trOk = !!(document.getElementById('trWorker')?.value && document.getElementById('trBrigade')?.value);
    const asOk = !!(document.getElementById('asOp')?.value && document.getElementById('asBrigade')?.value);
    const trBtn = document.getElementById('btnTransfer');
    const asBtn = document.getElementById('btnAssignOp');
    if (trBtn) trBtn.disabled = !trOk;
    if (asBtn) asBtn.disabled = !asOk;
  }

  function renderAssignCards() {
    const wc = document.getElementById('assignWorkerCards');
    const oc = document.getElementById('assignOpCards');
    const workers = State.workers || [];
    const ops = State.operations || [];
  
    if (wc) {
      wc.innerHTML = workers.length
        ? workers.map((w) => {
            const role = w.is_brigadier ? 'Бригадир' : 'Сотрудник';
            return (
              '<article class="card person-card">' +
              '<div class="person-card-top">' +
              '<div class="person-avatar">' + esc((w.name || '?').charAt(0).toUpperCase()) + '</div>' +
              '<div><div class="person-name">' + esc(w.name || '') + '</div>' +
              '<div class="muted">' + esc(role) + ' · ' + esc(w.login || '') + '</div></div></div>' +
              '<div class="person-meta">Бригада: ' + esc(brigadeName(w.brigade_id)) + '</div>' +
              '<div class="person-actions">' +
              '<button type="button" class="btn btn-outline btn-sm" data-pick-transfer="' + w.id + '">Перенести</button>' +
              '</div></article>'
            );
          }).join('')
        : '<p class="muted">Нет сотрудников</p>';
  
      wc.querySelectorAll('[data-pick-transfer]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-pick-transfer');
          setHiddenPick('trWorker', id);
          highlightMini('trWorkerMini', id);
          const w = workers.find((x) => String(x.id) === String(id));
          if (w) setText('trPickBadge', w.name || id);
          syncAssignButtons();
          notify('Перенос', 'Сотрудник выбран', 'info');
        });
      });
    }
  
    if (oc) {
      oc.innerHTML = ops.length
        ? ops.map((o) => {
            const s = st(o);
            return (
              '<article class="card person-card">' +
              '<div class="person-card-top">' +
              '<div class="person-avatar op">#</div>' +
              '<div><div class="person-name">' + esc(o.name || ('Оп. ' + o.id)) + '</div>' +
              '<div class="muted">#' + o.id + ' · ' + statusRu(s) + '</div></div></div>' +
              '<div class="person-meta">Бригада: ' + esc(brigadeName(o.brigade_id)) + '</div>' +
              '<div class="person-actions">' +
              '<button type="button" class="btn btn-outline btn-sm" data-pick-op="' + o.id + '">Назначить</button>' +
              '</div></article>'
            );
          }).join('')
        : '<p class="muted">Нет работ</p>';
  
      oc.querySelectorAll('[data-pick-op]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-pick-op');
          setHiddenPick('asOp', id);
          highlightMini('asOpMini', id);
          const o = ops.find((x) => String(x.id) === String(id));
          if (o) setText('asPickBadge', o.name || id);
          syncAssignButtons();
          notify('Назначение', 'Работа выбрана', 'info');
        });
      });
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
  const wid = document.getElementById('trWorker')?.value;
  const bid = document.getElementById('trBrigade')?.value;
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
  const oid = document.getElementById('asOp')?.value;
  const bid = document.getElementById('asBrigade')?.value;
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
    const ops = (State && State.operations) ? State.operations : [];
    setText('repTotal', ops.length);
    setText('repProg', ops.filter((o) => st(o) === 'in_progress').length);
    setText('repDone', ops.filter((o) => st(o) === 'completed' || st(o) === 'done').length);
    const box = document.getElementById('reportDetails');
    if (!box) return;
    const by = {};
    ops.forEach((o) => {
      const s = statusRu(st(o));
      by[s] = (by[s] || 0) + 1;
    });
    box.innerHTML = Object.keys(by).length
      ? Object.keys(by).map((k) => '<div class="dash-op-row"><span>' + esc(k) + '</span><strong>' + by[k] + '</strong></div>').join('')
      : '<p class="muted">Нет данных</p>';
  }
  function fillSettings() {
    const u = State.user || {};
    setVal('settingsName', u.name || '');
    setVal('settingsLogin', u.login || '');
    setVal('settingsId', u.id != null ? String(u.id) : '');
    setVal('settingsRole', u.role || (u.is_brigadier ? 'brigadier' : 'worker') || 'brigadier');
    setVal('settingsBrigade', State.brigade?.name || brigadeName(State.brigadeId) || '');
    setVal('settingsEmail', u.email || '');
    setVal('settingsPhone', u.phone || '');
    setVal('settingsPosition', u.position || u.job_title || '');
    const av = document.getElementById('settingsAvatar');
    if (av) av.textContent = (u.name || 'Б').charAt(0).toUpperCase();
    applyAvatarFromStorage?.();
    loadPersonalQr(false);

    loadBrigUiSettings();   
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

async function sendBrigReport() {
    const subject = (document.getElementById('bgSubject')?.value || '').trim();
    const text = (document.getElementById('rptBody')?.value || '').trim();
    const template_key = document.getElementById('reqTemplate')?.value || null;
    if (!text) return notify('Запрос', 'Напишите текст', 'warning');
    try {
      const r = await fetch(API + '/admin-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: State.userId,
          worker_name: State.user?.name,
          brigade_id: State.brigadeId,
          template_key,
          subject: subject || 'Запрос бригадира',
          body: text,
        }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      notify('Запрос', 'Отправлен администратору', 'success');
      const s = document.getElementById('bgSubject'); if (s) s.value = '';
      const b = document.getElementById('rptBody'); if (b) b.value = '';
    } catch (e) {
      notify('Ошибка', String(e.message || e), 'error');
    }
  }

// document.getElementById('bgQrRefreshBtn')?.addEventListener('click', () => loadPersonalQr(true));
// document.getElementById('bgChangePassBtn')?.addEventListener('click', changeBrigPassword);
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
    if (el) el.value = v == null ? '' : String(v);
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
    const dateEl = document.getElementById('evDate');
    const timeEl = document.getElementById('evTime');
    const titleEl = document.getElementById('evTitle');
    if (dateEl) dateEl.value = day;
    if (titleEl) titleEl.focus();
  }
  
  function saveCalendarEvent() {
    const dateEl = document.getElementById('evDate');
    const timeEl = document.getElementById('evTime');
    const titleEl = document.getElementById('evTitle');
    const day = (dateEl?.value || State.calSelected || new Date().toISOString().slice(0, 10));
    const title = (titleEl?.value || '').trim();
    const time = (timeEl?.value || '').trim();
    if (!title) {
      notify('Календарь', 'Введите название события', 'warning');
      return;
    }
    const list = loadEvents();
    list.push({
      id: Date.now(),
      date: day,
      title,
      time,
      brigade_id: State.brigadeId,
    });
    saveEvents(list);
    State.calSelected = day;
    if (titleEl) titleEl.value = '';
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

  function toggleNotifPanel() {
    const p = document.getElementById('notifPanel');
    if (!p) return;
    const open = p.style.display === 'none' || !p.style.display;
    p.style.display = open ? 'flex' : 'none';
    if (open) loadInbox(true);
  }
  
  const REQ_TEMPLATES = {
    profile: {
      subject: 'Обновление данных профиля',
      body: 'Прошу исправить ФИО / email / телефон / должность. Текущие данные устарели.',
    },
    password: {
      subject: 'Проблема со входом / паролем',
      body: 'Не удаётся сменить или использовать пароль. Прошу проверить учётную запись.',
    },
    brigade: {
      subject: 'Ошибка состава бригады',
      body: 'Неверный список сотрудников или привязка к бригаде. Прошу сверить с фактическим составом.',
    },
    ops: {
      subject: 'Сроки / статусы операций',
      body: 'В работах указаны неверные сроки или статусы. Нужна корректировка администратора.',
    },
    access: {
      subject: 'Запрос доступа',
      body: 'Нужны дополнительные права или доступ к разделу для сменных задач.',
    },
  };
  
  function applyReqTemplate() {
    const t = REQ_TEMPLATES[document.getElementById('reqTemplate')?.value];
    if (!t) return;
    const s = document.getElementById('bgSubject');
    const b = document.getElementById('rptBody');
    if (s) s.value = t.subject;
    if (b) b.value = t.body;
  }
  
  function renderDeadlines(ops) {
    const list = document.getElementById('dashDeadlinesList');
    const badge = document.getElementById('deadlineBadge');
    if (!list) return;
    const today = new Date().toISOString().slice(0, 10);
    const soonLimit = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    const rows = (ops || [])
      .filter((o) => o.end_date)
      .map((o) => {
        const done = ['completed', 'done'].includes(String(o.status || '').toLowerCase());
        const overdue = !done && o.end_date < today;
        const soon = !done && !overdue && o.end_date <= soonLimit;
        return { ...o, overdue, soon, done };
      })
      .sort((a, b) => String(a.end_date).localeCompare(String(b.end_date)))
      .slice(0, 15);
  
    if (badge) badge.textContent = String(rows.filter((r) => r.overdue || r.soon).length);
    list.innerHTML = rows.length
      ? rows.map((o) => {
          const mark = o.overdue ? 'просрочено' : o.soon ? 'скоро' : o.done ? 'готово' : 'план';
          const cls = o.overdue ? 'bad' : o.soon ? 'warn' : 'ok';
          return (
            '<div class="dash-op-row">' +
            '<span>#' + o.id + ' ' + esc(o.name || '') + '</span>' +
            '<span class="badge-st ' + cls + '">' +
            esc(o.end_date) + ' · ' + mark + ' · ' + statusRu(st(o)) +
            '</span></div>'
          );
        }).join('')
      : '<p class="muted">Нет операций с end_date</p>';
  }
  
  async function loadInbox(intoPanel) {
    if (!State.userId) return;
    const url =
      API +
      '/notifications/inbox?worker_id=' +
      encodeURIComponent(State.userId) +
      (State.brigadeId != null ? '&brigade_id=' + encodeURIComponent(State.brigadeId) : '');
    try {
      const r = await fetch(url);
      if (!r.ok) return;
      const d = await r.json();
      const items = d.items || [];
      const unread = d.unread || 0;
  
      const dot = document.getElementById('notifDot');
      if (dot) {
        if (unread > 0) {
          dot.style.display = 'block';
          dot.textContent = unread > 99 ? '99+' : String(unread);
        } else {
          dot.style.display = 'none';
        }
      }
  
      const html = items.length
        ? items
            .slice(0, 30)
            .map(
              (n) =>
                '<div class="inbox-item' +
                (n.read_at ? '' : ' unread') +
                '" data-nid="' +
                n.id +
                '">' +
                '<strong>' +
                esc(n.title) +
                '</strong>' +
                '<div class="muted">' +
                esc(n.created_at || '') +
                (n.kind ? ' · ' + esc(n.kind) : '') +
                '</div>' +
                '<div class="inbox-body">' +
                esc(n.body) +
                '</div></div>'
            )
            .join('')
        : '<p class="muted">Нет уведомлений</p>';
  
      const panel = document.getElementById('notifPanelList');
      if (panel && (intoPanel || panel)) {
        panel.innerHTML = html;
        panel.querySelectorAll('.inbox-item').forEach((el) => {
          el.addEventListener('click', async () => {
            const id = el.getAttribute('data-nid');
            await fetch(API + '/notifications/' + id + '/read', { method: 'POST' });
            el.classList.remove('unread');
            loadInbox(true);
          });
        });
      }
    } catch (e) {
      console.warn('inbox', e);
    }
  }

  const CHAT_TEMPLATES_BRIG = {
    profile: 'Прошу обновить данные профиля (ФИО / email / телефон).',
    password: 'Проблема со входом или сменой пароля.',
    brigade: 'Ошибка состава бригады — прошу сверить список.',
    ops: 'Неверные сроки или статусы операций — нужна правка.',
    access: 'Нужны дополнительные права доступа.',
  };
  
  function fillChatTemplates() {
    const sel = document.getElementById('chatTemplate');
    if (!sel) return;
    const map = CHAT_TEMPLATES_BRIG;
    sel.innerHTML =
      '<option value="">— шаблон —</option>' +
      Object.keys(map).map((k) => '<option value="' + k + '">' + k + '</option>').join('');
    sel.onchange = () => {
      if (map[sel.value]) document.getElementById('chatBody').value = map[sel.value];
    };
  }
  
  async function loadChatThreads() {
    if (!State.userId) return;
    const params = new URLSearchParams({
      role: CHAT_ROLE,
      worker_id: String(State.userId),
      limit: '100',
    });
    if (State.brigadeId != null) params.set('brigade_id', String(State.brigadeId));
    try {
      const r = await fetch(API + '/chat/threads?' + params.toString());
      if (!r.ok) return;
      const d = await r.json();
      ChatState.threads = d.items || [];
      renderChatThreadList();
      const n = ChatState.threads.reduce((s, t) => s + (t.unread || 0), 0);
      const dot = document.getElementById('notifDot');
      if (dot) {
        if (n > 0) {
          dot.style.display = 'block';
          dot.textContent = n > 99 ? '99+' : String(n);
        } else {
          dot.style.display = 'none';
        }
      }
    } catch (e) {
      console.warn('chat threads', e);
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
          String(t.peer_name || '').toLowerCase().includes(q) ||
          String(t.subject || '').toLowerCase().includes(q) ||
          String(t.last_preview || '').toLowerCase().includes(q)
      );
    }
    box.innerHTML = list.length
      ? list
          .map((t) => {
            const active = Number(t.id) === Number(ChatState.activeId) ? ' active' : '';
            const unread = t.unread ? '<span class="unread-pill">' + t.unread + '</span>' : '';
            return (
              '<div class="chat-thread-item' + active + '" data-tid="' + t.id + '">' +
              '<div class="t-title">' + esc(t.subject || t.peer_name || ('#' + t.id)) + '</div>' +
              '<div class="t-prev">' + esc(t.last_preview || '') + '</div>' +
              '<div class="t-meta"><span>' + esc((t.updated_at || '').slice(0, 16)) + '</span>' + unread + '</div></div>'
            );
          })
          .join('')
      : '<p class="muted" style="padding:12px">Нет диалогов</p>';
    box.querySelectorAll('.chat-thread-item').forEach((el) => {
      el.addEventListener('click', () => openChatThread(el.getAttribute('data-tid')));
    });
    <button type="button" class="btn-text chat-del" data-del-id="THREAD_ID" title="Удалить">🗑</button>
    box.querySelectorAll('[data-del-id]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        deleteChatThread(btn.getAttribute('data-del-id'));
      };
    });
  }
  
  async function openChatThread(tid) {
    ChatState.activeId = Number(tid);
    renderChatThreadList();
    const t = ChatState.threads.find((x) => Number(x.id) === Number(tid));
    setText('chatPeerName', t?.subject || t?.peer_name || ('Диалог #' + tid));
    setText('chatPeerMeta', (t?.peer_type || '') + (t?.brigade_id != null ? ' · бр. ' + t.brigade_id : ''));
    await fetch(API + '/chat/threads/' + tid + '/read?role=' + CHAT_ROLE, { method: 'POST' });
    const r = await fetch(API + '/chat/threads/' + tid + '/messages');
    const d = r.ok ? await r.json() : { items: [] };
    const box = document.getElementById('chatMessages');
    if (!box) return;
    box.innerHTML = (d.items || [])
      .map((m) => {
        const isMe = m.sender_role !== 'admin';
        return (
          '<div class="chat-bubble ' + (isMe ? 'me' : 'them') + '">' +
          esc(m.body) +
          '<div class="b-meta">' + esc(m.sender_name || m.sender_role) + ' · ' +
          esc((m.created_at || '').slice(0, 16)) + '</div></div>'
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
    try {
      if (!ChatState.activeId) {
        const r = await fetch(API + '/chat/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            peer_type: 'worker',
            peer_id: State.userId,
            peer_name: State.user?.name,
            brigade_id: State.brigadeId,
            subject: body.slice(0, 80),
            body,
            sender_role: 'brigadier',
            sender_id: State.userId,
            sender_name: State.user?.name,
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
          sender_role: 'brigadier',
          sender_id: State.userId,
          sender_name: State.user?.name,
          template_key,
        }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      document.getElementById('chatBody').value = '';
      openChatThread(ChatState.activeId);
    } catch (e) {
      notify('Чат', String(e.message || e), 'error');
    }
  }

  // async function startChatFromPicker() {
  //   const raw = document.getElementById('chatPeerValue')?.value || '';
  //   const body = (document.getElementById('chatNewBody')?.value || '').trim();
  //   if (!raw) return alert('Выберите получателя');
  //   if (!body) return alert('Введите текст');
  //   const [ptype, idStr] = raw.split(':');
  //   const peer_id = Number(idStr);
  //   const item = PeerPicker.items.find((i) => i.key === raw);
  //   try {
  //     const r = await fetch(API + '/chat/start', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({
  //         peer_type: 'worker',
  //         peer_id: ptype === 'admin' ? Number(State.userId) : peer_id,
  //         peer_name:
  //           ptype === 'admin'
  //             ? (State.user?.name || 'Бригадир') + ' → Админ'
  //             : item?.name || raw,
  //         brigade_id: State.brigadeId,
  //         subject: body.slice(0, 80),
  //         body: (ptype === 'admin' ? '[к администратору] ' : '') + body,
  //         sender_role: 'brigadier',
  //         sender_id: Number(State.userId),
  //         sender_name: State.user?.name || 'Бригадир',
  //       }),
  //     });
  //     if (!r.ok) throw new Error('HTTP ' + r.status);
  //     const d = await r.json();
  //     const modal = document.getElementById('chatNewModal');
  //     if (modal) modal.style.display = 'none';
  //     const ta = document.getElementById('chatNewBody');
  //     if (ta) ta.value = '';
  //     await loadChatThreads();
  //     if (d.thread_id) openChatThread(d.thread_id);
  //   } catch (e) {
  //     alert(String(e.message || e));
  //   }
  // }
  
  // document.getElementById('btnChatNew')?.addEventListener('click', async () => {
  //   await loadChatPeerOptions();
  //   const m = document.getElementById('chatNewModal');
  //   if (m) {
  //     m.style.display = 'flex';
  //     document.getElementById('chatPeerSearch')?.focus();
  //   }
  // });
  document.getElementById('chatNewClose')?.addEventListener('click', () => {
    const m = document.getElementById('chatNewModal');
    if (m) m.style.display = 'none';
  });
  document.getElementById('chatNewSend')?.addEventListener('click', () => startChatFromPicker());

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

    document.getElementById('btnChatDelete')?.addEventListener('click', () => {
      if (ChatState.activeId) deleteChatThread(ChatState.activeId);
    });
  }