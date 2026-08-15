/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - AI ПАНЕЛЬ (AI Engine Integration)
 * ================================================================
 */
/**
 * fetch с повторными попытками и таймаутом
 */


async function fetchWithRetry(url, options = {}, retries = 5, delayMs = 1000) {
    const timeout = options.timeout || 5000;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });

            clearTimeout(timer);

            if (response.ok) return response;

            // 404 на не-последней попытке = ждём перезапуска uvicorn
            if (response.status === 404 && attempt < retries) {
                await response.text(); // освобождаем body, закрываем соединение
                console.warn(`[AI Panel] ${url} → 404 (попытка ${attempt}/${retries}), повтор через ${delayMs}мс...`);
                await new Promise(r => setTimeout(r, delayMs));
                continue;
            }

            return response;

        } catch (error) {
            if (attempt === retries) throw error;
            console.warn(`[AI Panel] ${url} → ошибка (попытка ${attempt}/${retries}): ${error.message}`);
            await new Promise(r => setTimeout(r, delayMs));
        }
    }

    throw new Error(`Не удалось получить ответ от ${url} после ${retries} попыток`);
}

export class AIPanel {
    constructor() {
        this.lastGaps = null;
        this.lastBridge = null;
        this.optimizationInProgress = false;
        this.trainingInProgress = false;
        this.lastPlan = null;
        this.lastBottlenecks = [];
        this.API_BASE = 'http://127.0.0.1:8000';
    }

    
    async runOptimization(operations, brigades, options = {}) {
        if (this.optimizationInProgress) {
            console.warn('Оптимизация уже выполняется');
            return { success: false, error: 'Оптимизация уже выполняется' };
        }
        this.optimizationInProgress = true;
        
        try {
            const allOps = operations || [];
            const activeOps = allOps.filter(op => op.status !== 'completed');
            
            const skipped = {
              completed: allOps.filter(op => op.status === 'completed').length,
              noNumber: allOps.filter(op => op.op_number == null || op.op_number === '').length,
              noDuration: allOps.filter(op => {
                const d = op.duration || (op.labor_hours && op.people_count ? op.labor_hours / op.people_count : 0);
                return !(d > 0) && op.status !== 'completed';
              }).length,
              noName: allOps.filter(op => !op.name && op.status !== 'completed').length
            };
            
            const filterReport = {
              loaded: allOps.length,
              inPlan: activeOps.length,
              skippedTotal: allOps.length - activeOps.length,
              reasons: skipped
            };
            console.log('📊 Фильтр операций:', filterReport);
            
            const planData = {
                tasks: activeOps.map(op => ({
                    id: String(op.op_number),
                    op_number: String(op.op_number),
                    name: op.name,
                    duration_days: Math.max(0.1, ((op.duration || (op.labor_hours && op.people_count ? op.labor_hours / op.people_count : 0)) || 1)) / 8.0,
                    dependencies: (op.prev_ops || []).map(p => String(p)),
                    prev_ops: (op.prev_ops || []).map(p => String(p)),
                    next_ops: (op.next_ops || []).map(p => String(p)),
                    post: op.post != null ? op.post : null,
                    drawing: op.drawing || '',
                    status: op.status || 'pending',
                    priority: op.priority === 'critical' ? 1 : op.priority === 'high' ? 2 : 3,
                    brigade_id: op.brigade_id ? String(op.brigade_id) : null,
                    required_skills: []
                })),
                brigades: (brigades || []).map(b => {
                    const workersCount = (typeof AdminState !== 'undefined' && AdminState.workers)
                      ? AdminState.workers.filter(w => w.brigade_id === b.id).length
                      : (b.workers_count || 0);
                    const seats = b.max_capacity || b.capacity || Math.max(workersCount, 4);
                    return {
                      id: String(b.id),
                      name: b.name,
                      capacity: Number(seats) * 8,
                      max_capacity: Number(seats),
                      current_load: Number(b.current_load) || 0,
                      skills: []
                    };
                  }),
                resources: [],
                do_leveling: true,
                horizon: 'month'
            };

            console.log('📤 Отправка запроса на /ai/build-plan:', planData);

            const response = await fetch(`${this.API_BASE}/ai/build-plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(planData)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`AI Engine error ${response.status}: ${errorText}`);
            }
            
            const result = await response.json();
            console.log('📥 Ответ от /ai/build-plan:', result);

            // API раньше отдавал plan «голым» — поддерживаем оба формата
            const plan = result.plan || result;
            this.lastPlan = plan;
            this.lastGaps = plan?.gaps ?? result.gaps ?? null;
            this.lastBridge = plan?.bridge_proposals ?? result.bridge_proposals ?? null;
            console.log('gaps payload', this.lastGaps, this.lastBridge);

            
            
            try {
                const bnResponse = await fetch(`${this.API_BASE}/ai/bottlenecks`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        plan: result.plan,
                        brigades: planData.brigades
                    })
                });
                
                if (bnResponse.ok) {
                    const bnResult = await bnResponse.json();
                    this.lastBottlenecks = bnResult.bottlenecks || [];
                } else {
                    this.lastBottlenecks = [];
                }
            } catch (bnErr) {
                console.warn('Bottleneck analysis failed:', bnErr);
                this.lastBottlenecks = [];
            }
            
            let recommendations = result.recommendations || [];

            // Если рекомендаций нет — берём из узких мест
            if (recommendations.length === 0) {
                const bns = (this.lastBottlenecks && this.lastBottlenecks.length)
                    ? this.lastBottlenecks
                    : (result.plan && result.plan.bottlenecks) ? result.plan.bottlenecks : [];
                recommendations = bns.map(bn => ({
                    type: bn.type || 'bottleneck',
                    severity: bn.severity || 'medium',
                    message: bn.message || bn.reason || 'Узкое место',
                    suggestion: bn.suggestion || '',
                    task_id: bn.task_id,
                    task_name: bn.task_name,
                    brigade_id: bn.brigade_id
                }));
            }
            if (recommendations.length === 0 && result.plan && result.plan.critical_path_ids) {
                const cp = (result.plan.tasks || []).filter(t => result.plan.critical_path_ids.includes(t.id));
                recommendations = cp.slice(0, 20).map(t => ({
                    type: 'critical_path_task',
                    task_name: t.name || t.id,
                    task_id: t.id,
                    op_number: String(t.id || '').replace(/^T/i, ''),
                    duration: t.duration_days ?? t.duration
                }));
            }
            
            return {
                success: result.success !== false,
                plan: plan,
                recommendations: recommendations,
                summary: {
                    totalOperations: plan?.tasks?.length || activeOps.length,
                    loadedOperations: filterReport.loaded,
                    skippedOperations: filterReport.skippedTotal,
                    filterReport,
                    projectDuration:
                      plan?.project_duration_days
                      ?? plan?.total_duration_days
                      ?? 0,
                    criticalPath:
                      plan?.critical_path_ids
                      || plan?.critical_path
                      || [],
                    leveled: !!(plan?.leveled
                        || plan?.leveling?.leveled
                        || plan?.stats?.leveling_applied)
                }
            };
            
        } catch (error) {
            console.error('AI Engine недоступен, пробуем fallback:', error);
            
            try {
                const legacyResult = await this.fallbackOptimize(operations, brigades);
                return this.processOptimizationResult(legacyResult);
            } catch (legacyErr) {
                console.error('Fallback тоже не сработал:', legacyErr);
                
                const localRecs = this.generateLocalRecommendations(operations, brigades);
                
                return {
                    success: true,
                    plan: null,
                    recommendations: localRecs,
                    summary: {
                        totalOperations: (operations || []).length,
                        projectDuration: 0,
                        criticalPath: [],
                        leveled: false,
                        error: error.message
                    }
                };
            }
        } finally {
            this.optimizationInProgress = false;
        }
    }

    

    async fallbackOptimize(operations, brigades) {
        const res = await fetch('http://127.0.0.1:8000/optimize', { method: 'POST' });
        return res.json();
    }

    processOptimizationResult(result) {
        return {
            success: true,
            plan: null,
            recommendations: result.recommendations || [],
            summary: {
                totalOperations: result.summary?.total_operations || 0,
                projectDuration: 0,
                criticalPath: [],
                timeSaved: result.summary?.total_time_saved || 0,
                timeSavedPercent: result.summary?.time_saved_percent || 0
            }
        };
    }

    async trainDelayModel() {
        if (this.trainingInProgress) {
            console.warn('Обучение уже выполняется');
            return { status: 'already_running', message: 'Обучение уже выполняется' };
        }
        this.trainingInProgress = true;
        
        try {
            try {
                const syncRes = await fetch(`${this.API_BASE}/ai/sync-training-data`, { 
                    method: 'POST',
                    signal: AbortSignal.timeout(5000)
                });
                if (syncRes.ok) {
                    console.log('✅ Данные синхронизированы');
                }
            } catch (syncErr) {
                console.warn('Синхронизация пропущена:', syncErr);
            }
            
            const response = await fetch(`${this.API_BASE}/ai/train/delay-model-from-db`, {
                method: 'POST',
                signal: AbortSignal.timeout(60000)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Training error ${response.status}: ${errorText}`);
            }
            
            const result = await response.json();
            
            return {
                status: result.success ? 'success' : 'failed',
                message: result.message || (result.success ? 'Модель обучена' : 'Ошибка обучения'),
                samples: result.samples || 0,
                modelAvailable: result.model_available || false
            };
            
        } catch (error) {
            console.error('Ошибка обучения модели:', error);
            
            try {
                const legacy = await fetch(`${this.API_BASE}/train`, { method: 'POST' });
                const legacyResult = await legacy.json();
                return { 
                    status: legacyResult.status || 'success', 
                    message: 'Legacy model trained', 
                    samples: legacyResult.samples_available || 0 
                };
            } catch (legacyErr) {
                return {
                    status: 'error',
                    message: error.message,
                    samples: 0
                };
            }
        } finally {
            this.trainingInProgress = false;
        }
    }

    /**
     * Получение статуса моделей
     */
    async getModelStatus() {
        try {
            const response = await fetchWithRetry(
                `${this.API_BASE}/ai/models/status`,
                { timeout: 5000 },
                5,
                1200
            );
            if (!response.ok) return this.getDefaultModelStatus();
            return await response.json();
        } catch (error) {
            console.warn('[AI Panel] Статус моделей недоступен, fallback:', error.message);
            return this.getDefaultModelStatus();
        }
    }

        /**
     * Ожидание готовности сервера перед первым запросом
     */
        async waitForServer(maxWaitMs = 15000) {
            const start = Date.now();
            while (Date.now() - start < maxWaitMs) {
                try {
                    const res = await fetch(`${this.API_BASE}/health`, {
                        signal: AbortSignal.timeout(2000)
                    });
                    if (res.ok) {
                        console.log('[AI Panel] Сервер готов');
                        return true;
                    }
                } catch (_) {}
                await new Promise(r => setTimeout(r, 800));
            }
            console.warn('[AI Panel] Сервер не ответил за', maxWaitMs, 'мс');
            return false;
        }

    getDefaultModelStatus() {
        return {
            predictor_available: false,
            delay_model_loaded: false,
            anomaly_model_loaded: false
        };
    }

    /**
     * Получение статуса AI Engine
     */
    async getEngineStatus() {
        try {
            const response = await fetchWithRetry(
                `${this.API_BASE}/ai/status`,
                { timeout: 5000 },
                5,
                1200
            );
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.warn('[AI Panel] AI Engine недоступен:', error.message);
            return null;
        }
    }
    /**
     * Рендер статуса системы (AI Engine + ML Модели)
     */
    renderSystemStatus(containerId, engineStatus, modelStatus) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const engineOk = engineStatus?.status === 'ok';
        const engineColor = engineOk ? '#22c55e' : '#ef4444';
        const predictorOk = modelStatus?.predictor_available;
        const predictorColor = predictorOk ? '#22c55e' : '#f59e0b';
        const planDays = engineStatus?.engine?.project_duration_days;

        container.innerHTML = `
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <div style="flex:1;min-width:100px;background:${engineColor}08;border:1px solid ${engineColor}30;border-radius:8px;padding:8px 10px;text-align:center;">
                    <div style="font-size:11px;color:#64748b;margin-bottom:2px;">🤖 AI Engine</div>
                    <div style="font-size:13px;font-weight:700;color:${engineColor};">${engineOk ? 'Работает' : 'Нет'}</div>
                </div>
                <div style="flex:1;min-width:100px;background:${predictorColor}08;border:1px solid ${predictorColor}30;border-radius:8px;padding:8px 10px;text-align:center;">
                    <div style="font-size:11px;color:#64748b;margin-bottom:2px;">🧠 ML</div>
                    <div style="font-size:13px;font-weight:700;color:${predictorColor};">${predictorOk ? 'Готовы' : 'Нет'}</div>
                </div>
                ${planDays != null ? `
                <div style="flex:1;min-width:100px;background:#eff6ff;border:1px solid #0961f630;border-radius:8px;padding:8px 10px;text-align:center;">
                    <div style="font-size:11px;color:#64748b;margin-bottom:2px;">📅 План</div>
                    <div style="font-size:13px;font-weight:700;color:#0961f6;">${planDays.toFixed(1)} дн</div>
                </div>
                ` : ''}
            </div>
        `;
    }

    renderCriticalPathChart(containerId, plan) {
        const container = document.getElementById(containerId);
        if (!container) return;
    
        const ids = plan?.critical_path_ids || [];
        const tasks = plan?.tasks || [];
        const byId = Object.fromEntries(tasks.map(t => [t.id, t]));
    
        if (!ids.length) {
            container.innerHTML = `
                <div style="padding:16px;color:#6b7280;font-size:13px;text-align:center;">
                    Запустите AI для построения критического пути
                </div>`;
            return;
        }
    
        const top = ids.slice(0, 15);
        const rest = ids.slice(15);
        let duration = plan.total_duration_days ?? plan.project_duration_days ?? '—';
        if (typeof duration === 'number' && !isNaN(duration)) {
            duration = Math.round(duration * 100) / 100; // 7.49, не 7.48749...
        }
    
        const row = (id) => {
            const t = byId[id] || {};
            const name = t.name || id;
            const dur = t.duration_days ?? t.duration ?? '—';
            const opNum = String(id).replace(/^T/i, '');
            return `
                <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid #fecaca;cursor:pointer;background:#fff;"
                     onmouseover="this.style.background='#fef2f2'"
                     onmouseout="this.style.background='#fff'"
                     onclick="window.goToOperation && window.goToOperation('${opNum}')">
                    <span style="font-weight:700;color:#dc2626;min-width:48px;font-size:12px;">${id}</span>
                    <span style="flex:1;font-size:12px;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
                    <span style="font-size:11px;color:#64748b;">${typeof dur === 'number' ? dur.toFixed(2) : dur} дн</span>
                </div>`;
        };
    
        container.innerHTML = `
            <div style="font-size:12px;color:#64748b;margin-bottom:8px;">
                <b>${ids.length}</b> крит. · <b>${duration}</b> дн.
                <span style="color:#94a3b8;margin-left:6px;">клик → Операции</span>
            </div>
            <div style="max-height:300px;overflow-y:auto;border:1px solid #fecaca;border-radius:8px;">
                ${top.map(row).join('')}
                ${rest.length ? `
                    <details>
                        <summary style="padding:8px 10px;cursor:pointer;font-size:12px;color:#64748b;background:#fef2f2;">
                            Ещё ${rest.length}…
                        </summary>
                        ${rest.map(row).join('')}
                    </details>` : ''}
            </div>`;
    }

    /**
     * Рендер анализа узких мест
     */
    renderBottleneckAnalysis(containerId, bottlenecks) {
        const container = document.getElementById(containerId);
        if (!container) return;
    
        if (!bottlenecks || !bottlenecks.length) {
            container.innerHTML = `<div style="text-align:center;padding:24px;color:#6b7280;">Узких мест не обнаружено</div>`;
            return;
        }
    
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const severityColors = { critical: '#dc2626', high: '#ef4444', medium: '#f59e0b', low: '#0961f6' };
        const severityLabels = { critical: 'Критический', high: 'Высокий', medium: 'Средний', low: 'Низкий' };
    
        const sorted = [...bottlenecks].sort(
            (a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)
        );
    
        const counts = {};
        sorted.forEach(b => {
            const s = b.severity || 'medium';
            counts[s] = (counts[s] || 0) + 1;
        });
    
        const rows = sorted.map((bn, i) => {
            const sev = bn.severity || 'medium';
            const color = severityColors[sev] || '#6b7280';
            const label = severityLabels[sev] || sev;
            const name = bn.task_name || bn.brigade_name || bn.task_id || `Пункт ${i + 1}`;
            const msg = (bn.message || bn.reason || '—').replace(/"/g, '&quot;');
            const sug = (bn.suggestion || '—').replace(/"/g, '&quot;');
            const payload = encodeURIComponent(JSON.stringify({
                severity: sev,
                name: name,
                message: bn.message || bn.reason || '',
                suggestion: bn.suggestion || '',
                task_id: bn.task_id || '',
                type: bn.type || '',
                brigade_id: bn.brigade_id || ''
            }));
    
            return `
                <tr data-sev="${sev}" style="border-bottom:1px solid #e5e7eb;cursor:pointer;"
                    onclick="window.showBottleneckDetail && window.showBottleneckDetail(decodeURIComponent('${payload}'))">
                    <td style="padding:8px 10px;white-space:nowrap;">
                        <span style="background:${color};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${label}</span>
                    </td>
                    <td style="padding:8px 10px;font-weight:600;max-width:160px;">${name}</td>
                    <td style="padding:8px 10px;color:#4b5563;font-size:12px;">${msg}</td>
                    <td style="padding:8px 10px;color:#0961f6;font-size:12px;">${sug}</td>
                </tr>`;
        }).join('');
    
        container.innerHTML = `
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
                <button data-sev="all" class="bn-filter"
                    style="padding:4px 10px;border-radius:12px;border:1px solid #e5e7eb;background:#111827;color:#fff;font-size:11px;cursor:pointer;">
                    Все (${sorted.length})
                </button>
                ${['critical','high','medium','low'].filter(s => counts[s]).map(s => `
                    <button data-sev="${s}" class="bn-filter"
                        style="padding:4px 10px;border-radius:12px;border:1px solid #e5e7eb;background:#fff;font-size:11px;cursor:pointer;">
                        ${severityLabels[s]} (${counts[s]})
                    </button>`).join('')}
            </div>
            <div style="overflow:auto;max-height:360px;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead>
                        <tr style="background:#f8fafc;text-align:left;position:sticky;top:0;">
                            <th style="padding:8px 10px;color:#64748b;">Уровень</th>
                            <th style="padding:8px 10px;color:#64748b;">Объект</th>
                            <th style="padding:8px 10px;color:#64748b;">Проблема</th>
                            <th style="padding:8px 10px;color:#64748b;">Рекомендация</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    
        container.querySelectorAll('.bn-filter').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const sev = btn.dataset.sev;
                container.querySelectorAll('.bn-filter').forEach(b => {
                    b.style.background = b === btn ? '#111827' : '#fff';
                    b.style.color = b === btn ? '#fff' : '#111';
                });
                container.querySelectorAll('tbody tr').forEach(tr => {
                    tr.style.display = (sev === 'all' || tr.dataset.sev === sev) ? '' : 'none';
                });
            };
        });
    }
    renderGaps(containerId, gapsReport, bridge) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const gaps = gapsReport?.gaps || [];
        const proposals = bridge?.proposals || [];
        if (!gaps.length && !proposals.length) {
          el.innerHTML = `<div style="padding:16px;color:#16a34a;font-size:13px;">Разрывов не найдено</div>`;
          return;
        }
        const gapRows = gaps.slice(0, 40).map(g => `
          <div style="padding:8px 10px;border-bottom:1px solid #fee2e2;font-size:12px;cursor:pointer;"
               onclick="window.goToOperation&&window.goToOperation('${g.op_number||''}')">
            <b style="color:#dc2626;">${g.type}</b> · #${g.op_number||'—'} ${g.name||''}
            <div style="color:#64748b;">${g.message||''}</div>
          </div>`).join('');
          const propRows = proposals.slice(0, 40).map((p, idx) => {
            const payload = encodeURIComponent(JSON.stringify(p));
            return `<div style="padding:8px 10px;border-bottom:1px solid #dbeafe;font-size:12px;">
              <label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;">
                <input type="checkbox" class="bridge-check" data-from="${p.from}" data-to="${p.to}"
                       ${p.auto_apply ? 'checked' : ''} style="margin-top:3px;" />
                <span>
                  <b>#${p.from}</b> → <b>#${p.to}</b>
                  <span style="color:#0961f6;font-weight:600;"> ${Math.round((p.confidence||0)*100)}%</span>
                  <div style="color:#64748b;">${(p.reasons||[]).join(' · ')}</div>
                  <button type="button" style="margin-top:4px;font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid #0961f6;background:#eff6ff;cursor:pointer;"
                    onclick='event.preventDefault();window.applyBridgeLink&&window.applyBridgeLink(JSON.parse(decodeURIComponent("${payload}")))'>Применить</button>
                </span>
              </label>
            </div>`;
          }).join('');
        el.innerHTML = `
          <div style="font-size:12px;color:#64748b;margin-bottom:8px;">
            Разрывов: <b>${gapsReport?.total ?? gaps.length}</b> · предложений: <b>${proposals.length}</b>
            · авто: <b>${(bridge?.auto_apply||[]).length}</b>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="border:1px solid #fecaca;border-radius:8px;max-height:280px;overflow:auto;">
              <div style="padding:8px;background:#fef2f2;font-weight:600;font-size:12px;">Разрывы</div>
              ${gapRows || '—'}
            </div>
            <div style="border:1px solid #bfdbfe;border-radius:8px;max-height:280px;overflow:auto;">
              <div style="padding:8px;background:#eff6ff;font-weight:600;font-size:12px;">Предложенные связи</div>
              ${propRows || '—'}
            </div>
          </div>`;
      }
    /**
     * Рендер сводки плана
     */
    renderPlanSummary(containerId, summary) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const pd = parseFloat(summary.projectDuration);
        const hasDuration = !isNaN(pd) && pd > 0;
        const loaded = summary.loadedOperations ?? summary.totalOperations ?? 0;
        const inPlan = summary.totalOperations ?? 0;
        const skipped = summary.skippedOperations ?? Math.max(0, loaded - inPlan);
        const fr = summary.filterReport?.reasons || {};
        
        container.innerHTML = `
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <div style="flex:1;min-width:80px;background:#f0f9ff;border-radius:8px;padding:10px;text-align:center;">
              <div style="font-size:18px;font-weight:700;color:#0961f6;">${inPlan}</div>
              <div style="font-size:11px;color:#6b7280;">В плане</div>
            </div>
            <div style="flex:1;min-width:80px;background:#fef2f2;border-radius:8px;padding:10px;text-align:center;">
              <div style="font-size:18px;font-weight:700;color:#ef4444;">${summary.criticalPath?.length || 0}</div>
              <div style="font-size:11px;color:#6b7280;">Критических</div>
            </div>
            <div style="flex:1;min-width:80px;background:#f0fdf4;border-radius:8px;padding:10px;text-align:center;">
              <div style="font-size:18px;font-weight:700;color:#22c55e;">${hasDuration ? pd.toFixed(1) : '—'}</div>
              <div style="font-size:11px;color:#6b7280;">Дней проект</div>
            </div>
            <div style="flex:1;min-width:80px;background:#fffbeb;border-radius:8px;padding:10px;text-align:center;">
              <div style="font-size:18px;font-weight:700;color:#f59e0b;">${summary.leveled ? 'Да' : 'Нет'}</div>
              <div style="font-size:11px;color:#6b7280;">Leveling</div>
            </div>
          </div>
          <div style="font-size:12px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;line-height:1.45;">
            <b>Загружено:</b> ${loaded} → <b>в плане:</b> ${inPlan}
            ${skipped ? ` → <b>не в плане:</b> ${skipped}` : ''}
            ${skipped ? `<div style="margin-top:4px;color:#64748b;">
              завершено: ${fr.completed ?? '—'} · без номера: ${fr.noNumber ?? '—'} · без длительности: ${fr.noDuration ?? '—'}
            </div>` : ''}
          </div>
        `;
    }
    /**
     * Локальная генерация рекомендаций (fallback)
     */
    generateLocalRecommendations(operations, brigades) {
        const recs = [];
        const ops = operations || [];
        const brigs = brigades || [];
        
        // Перегрузка бригад
        const load = {};
        ops.forEach(op => {
            if (op.brigade_id && op.status !== 'completed') {
                load[op.brigade_id] = (load[op.brigade_id] || 0) + (op.labor_hours || 0);
            }
        });
        brigs.forEach(b => {
            const cap = (b.max_capacity || 10) * 8 * 20;
            const l = load[b.id] || 0;
            if (l > cap * 0.9) {
                recs.push({
                    type: 'brigade_overload',
                    severity: l > cap ? 'critical' : 'high',
                    message: `Бригада "${b.name}" перегружена`,
                    suggestion: `Распределите ${Math.round(l - cap)} ч на другие бригады`,
                    brigade_id: b.id
                });
            }
        });
        
        // Приоритетные операции
        ops.filter(o => o.status !== 'completed' && (o.priority === 'critical' || !(o.prev_ops?.length)))
            .forEach(o => {
                recs.push({
                    type: o.priority === 'critical' ? 'critical_path_task' : 'near_critical',
                    severity: o.priority === 'critical' ? 'critical' : 'medium',
                    message: `Приоритетная операция: ${o.name}`,
                    suggestion: 'Убедитесь в наличии ресурсов',
                    task_id: `T${o.op_number}`,
                    op_number: String(o.op_number)
                });
            });
        
        return recs;
    }

/**
 * Форматирование одной рекомендации в читаемый HTML
 */
    formatRecommendation(rec) {
        if (!rec) return '';
        if (rec.message || rec.suggestion) {
            let html = '';
            if (rec.message) html += `<div style="font-weight:600;margin-bottom:2px;">${rec.message}</div>`;
            if (rec.suggestion) html += `<div style="color:#64748b;">💡 ${rec.suggestion}</div>`;
            if (rec.task_id || rec.op_number) html += `<div style="font-size:11px;color:#94a3b8;">Задача: ${rec.task_id || rec.op_number}</div>`;
            return html;
        }
        switch (rec.type) {
            case 'critical_path_task':
                return `<strong>🔥 ${rec.task_name || rec.op_number || rec.task_id || 'Задача'}</strong>
                        <div style="color:#64748b;">Критический путь${rec.duration != null ? ' · ' + Number(rec.duration).toFixed(2) + ' дн.' : ''}</div>`;
            case 'assign_operation':
                return `<strong>🎯 ${rec.operation_name || rec.op_number || ''}</strong>
                        <div>Назначить: <b>${rec.to_brigade_name || rec.to_brigade_id}</b></div>`;
            default:
                return `<strong>${rec.task_name || rec.brigade_name || rec.task_id || 'Пункт'}</strong>
                        <div>${rec.message || rec.reason || ''}</div>
                        ${rec.suggestion ? `<div style="color:#0961f6;">💡 ${rec.suggestion}</div>` : ''}`;
        }
    }

    /**
     * Рендер рекомендаций
     */
    renderRecommendations(containerId, recommendations) {
        const container = document.getElementById(containerId);
        if (!container) return;
    
        if (!recommendations || recommendations.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:24px;color:#6b7280;font-size:13px;">
                    <p>Нет рекомендаций. Запустите оптимизацию.</p>
                </div>`;
            return;
        }
    
        const typeConfig = {
            assign_operation: { color: '#0961f6', icon: '🎯', label: 'Назначения' },
            critical_path_task: { color: '#dc2626', icon: '🔥', label: 'Критический путь' },
            bottleneck: { color: '#ef4444', icon: '⚠️', label: 'Узкие места' },
            dependency_bottleneck: { color: '#f97316', icon: '🔗', label: 'Зависимости' },
            near_critical: { color: '#f59e0b', icon: '⚡', label: 'Почти критические' },
            brigade_overload: { color: '#ea580c', icon: '👥', label: 'Перегрузка бригад' },
            overload: { color: '#ea580c', icon: '👥', label: 'Перегрузка' },
            reorder: { color: '#f59e0b', icon: '🔄', label: 'Изменение порядка' },
            parallelize: { color: '#06b6d4', icon: '⚡', label: 'Параллелизация' },
            delay_risk: { color: '#f97316', icon: '⚠️', label: 'Риски задержки' }
        };
    
        const groups = {};
        recommendations.forEach(rec => {
            const type = rec.type || 'recommendation';
            if (!groups[type]) groups[type] = [];
            groups[type].push(rec);
        });
    
        container.innerHTML = Object.keys(groups).map((type, gi) => {
            const cfg = typeConfig[type] || { color: '#0961f6', icon: '📌', label: type.replace(/_/g, ' ') };
            const items = groups[type];
            const groupId = `rec-group-${containerId}-${type}-${gi}`;
    
            const itemsHtml = items.map((rec, i) => {
                const formatted = this.formatRecommendation(rec);
                const payload = encodeURIComponent(JSON.stringify(rec));
                return `
                    <div class="rec-item"
                         data-payload="${payload}"
                         style="padding:8px 10px;background:#f8f9fa;border-radius:6px;margin-bottom:5px;border-left:3px solid ${cfg.color};font-size:12px;line-height:1.4;cursor:pointer;"
                         title="Нажмите для подробностей">
                        ${formatted}
                    </div>`;
            }).join('');
    
            return `
                <div style="margin-bottom:8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                    <div class="rec-group-header"
                         data-group="${groupId}"
                         style="padding:8px 12px;background:#f8fafc;cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none;">
                        <span style="font-size:14px;">${cfg.icon}</span>
                        <span style="font-weight:600;font-size:12px;color:#374151;flex:1;">${cfg.label}</span>
                        <span style="background:${cfg.color}15;color:${cfg.color};padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;">${items.length}</span>
                        <svg class="rec-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" style="transition:transform 0.2s;">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </div>
                    <div id="${groupId}" class="rec-group-body" style="padding:8px;display:block;">
                        ${itemsHtml}
                    </div>
                </div>`;
        }).join('');
    
        // Свернуть / развернуть группу
        container.querySelectorAll('.rec-group-header').forEach(header => {
            header.addEventListener('click', () => {
                const id = header.getAttribute('data-group');
                const body = document.getElementById(id);
                const chevron = header.querySelector('.rec-chevron');
                if (!body) return;
                const open = body.style.display !== 'none';
                body.style.display = open ? 'none' : 'block';
                if (chevron) chevron.style.transform = open ? 'rotate(-90deg)' : 'rotate(0deg)';
            });
        });
    
        // Клик по рекомендации → модалка
        container.querySelectorAll('.rec-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                try {
                    const raw = decodeURIComponent(el.getAttribute('data-payload') || '{}');
                    const rec = JSON.parse(raw);
                    if (window.showRecommendationDetail) {
                        window.showRecommendationDetail(rec);
                    }
                } catch (err) {
                    console.warn('rec detail', err);
                }
            });
        });
    }

    /**
     * Рендер статуса моделей
     */
    renderModelStatus(containerId, status) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const items = [
            { key: 'predictor_available', label: 'Предиктор длительности', icon: '📊' },
            { key: 'delay_model_loaded', label: 'Модель задержек', icon: '⏱️' },
            { key: 'anomaly_model_loaded', label: 'Детектор аномалий', icon: '🔍' }
        ];
        
        container.innerHTML = items.map(item => {
            const active = status?.[item.key] || false;
            return `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;">
                    <span style="font-size:13px;color:#374151;">${item.icon} ${item.label}</span>
                    <span style="font-size:12px;font-weight:600;padding:2px 8px;border-radius:12px;${active ? 'background:#dcfce7;color:#166534;' : 'background:#f3f4f6;color:#6b7280;'}">
                        ${active ? 'Активна' : 'Не загружена'}
                    </span>
                </div>
            `;
        }).join('');
    }
}