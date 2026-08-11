/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - AI ПАНЕЛЬ (AI Engine Integration)
 * ================================================================
 */

export class AIPanel {
    constructor() {
        this.optimizationInProgress = false;
        this.trainingInProgress = false;
        this.lastPlan = null;
        this.lastBottlenecks = [];
        this.API_BASE = 'http://127.0.0.1:8000';
    }

    /**
     * Форматирование одной рекомендации в читаемый текст
     */
    
    /**
     * Локальная генерация рекомендаций (fallback)
     */
   

    /**
     * Форматирование одной рекомендации в читаемый текст
     */
        /**
     * Запуск оптимизации через AI Engine
     */
    async runOptimization(operations, brigades, options = {}) {
        if (this.optimizationInProgress) {
            console.warn('Оптимизация уже выполняется');
            return { success: false, error: 'Оптимизация уже выполняется' };
        }
        this.optimizationInProgress = true;
        
        try {
            const activeOps = (operations || []).filter(op => op.status !== 'completed');
            
            const planData = {
                tasks: activeOps.map(op => ({
                    id: `T${op.op_number}`,
                    name: op.name,
                    duration_days: Math.max(0.1, ((op.duration || (op.labor_hours && op.people_count ? op.labor_hours / op.people_count : 0)) || 1)) / 8.0,
                    dependencies: (op.prev_ops || []).map(p => `T${p}`),
                    priority: op.priority === 'critical' ? 1 : op.priority === 'high' ? 2 : 3,
                    brigade_id: op.brigade_id ? String(op.brigade_id) : null,
                    required_skills: []
                })),
                brigades: (brigades || []).map(b => ({
                    id: String(b.id),
                    name: b.name,
                    capacity: (b.max_capacity || 10) * 8,
                    skills: []
                })),
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
            
            this.lastPlan = result.plan;
            
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
            
            if (recommendations.length === 0 && result.plan?.critical_path_ids) {
                const cpTasks = result.plan.tasks?.filter(t => 
                    result.plan.critical_path_ids.includes(t.id)
                ) || [];
                
                // Карта длительностей из исходных данных (на случай если AI Engine не вернул duration_days)
                const durationMap = new Map(activeOps.map(op => [
                    `T${op.op_number}`, 
                    Math.max(0.1, ((op.duration || (op.labor_hours && op.people_count ? op.labor_hours / op.people_count : 0)) || 1)) / 8.0
                ]));
                
                recommendations = cpTasks.map(t => ({
                    type: 'critical_path_task',
                    task_name: t.name || t.id || 'Без названия',
                    op_number: String(t.id || '').replace('T',''),
                    duration: t.duration_days || durationMap.get(t.id) || 0.1
                }));
                
                const unassigned = activeOps.filter(op => !op.brigade_id);
                for (const op of unassigned.slice(0, 5)) {
                    const availableBrigade = brigades.find(b => (b.current_load || 0) < 80);
                    if (availableBrigade) {
                        recommendations.push({
                            type: 'assign_operation',
                            operation_id: op.id,
                            op_number: op.op_number,
                            operation_name: op.name,
                            to_brigade_id: availableBrigade.id,
                            to_brigade_name: availableBrigade.name,
                            current_duration: op.duration,
                            people_count: op.people_count,
                            priority: op.priority || 'MEDIUM',
                            reason: `Операция не назначена на бригаду. Бригада '${availableBrigade.name}' имеет свободные ресурсы.`
                        });
                    }
                }
            }
            
            return {
                success: result.success !== false,
                plan: result.plan,
                recommendations: recommendations,
                summary: {
                    totalOperations: result.plan?.tasks?.length || 0,
                    projectDuration: result.plan?.project_duration_days || 0,
                    criticalPath: result.plan?.critical_path_ids || [],
                    leveled: result.plan?.leveled || false
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

    /**
     * Локальная генерация рекомендаций (fallback)
     */
        /**
     * Обучение модели задержек
     */
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
            const response = await fetch('http://127.0.0.1:8000/ai/models/status');
            if (!response.ok) return this.getDefaultModelStatus();
            return await response.json();
        } catch (error) {
            return this.getDefaultModelStatus();
        }
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
            const response = await fetch(`${this.API_BASE}/ai/status`, {
                signal: AbortSignal.timeout(5000)
            });
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
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
                ${planDays ? `
                <div style="flex:1;min-width:100px;background:#eff6ff;border:1px solid #0961f630;border-radius:8px;padding:8px 10px;text-align:center;">
                    <div style="font-size:11px;color:#64748b;margin-bottom:2px;">📅 План</div>
                    <div style="font-size:13px;font-weight:700;color:#0961f6;">${planDays.toFixed(1)} дн</div>
                </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Рендер SVG-графика критического пути
     */
    
    /**
     * Рендер SVG-графика критического пути
     */
    renderCriticalPathChart(containerId, plan) {
        const container = document.getElementById(containerId);
        if (!container) return;
    
        if (!plan || !plan.critical_path_ids || plan.critical_path_ids.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:24px;color:#6b7280;font-size:13px;">
                    Запустите оптимизацию для построения графика
                </div>`;
            return;
        }
    
        const tasks = plan.tasks || [];
        const cpIds = new Set(plan.critical_path_ids);
        const critical = tasks.filter(t => cpIds.has(t.id) || t.is_critical);
    
        if (critical.length === 0) {
            container.innerHTML = `<div style="padding:16px;color:#6b7280;">Критический путь: ${plan.critical_path_ids.join(' → ')}</div>`;
            return;
        }
    
        const items = critical.map(t => {
            const name = t.name || t.id;
            const dur = t.duration_days ?? t.duration ?? '—';
            return `
                <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fef2f2;border-left:3px solid #ef4444;border-radius:6px;margin-bottom:6px;">
                    <span style="font-weight:700;color:#dc2626;min-width:48px;">${t.id}</span>
                    <span style="flex:1;font-size:13px;color:#111827;">${name}</span>
                    <span style="font-size:12px;color:#64748b;">${dur} дн.</span>
                </div>`;
        }).join('');
    
        container.innerHTML = `
            <div style="margin-bottom:8px;font-size:12px;color:#64748b;">
                Критических работ: <b>${critical.length}</b> · Длительность проекта: <b>${plan.total_duration_days ?? plan.project_duration_days ?? '—'} дн.</b>
            </div>
            ${items}`;
    }

    /**
     * Рендер анализа узких мест
     */
    renderBottleneckAnalysis(containerId, bottlenecks) {
        const container = document.getElementById(containerId);
        if (!container) return;
    
        if (!bottlenecks || bottlenecks.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:24px;color:#6b7280;">
                    Узких мест не обнаружено
                </div>`;
            return;
        }
    
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const severityColors = {
            critical: '#dc2626',
            high: '#ef4444',
            medium: '#f59e0b',
            low: '#0961f6'
        };
        const severityLabels = {
            critical: 'Критический',
            high: 'Высокий',
            medium: 'Средний',
            low: 'Низкий'
        };
    
        const sorted = [...bottlenecks].sort(
            (a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)
        );
    
        const rows = sorted.map((bn, i) => {
            const sev = bn.severity || 'medium';
            const color = severityColors[sev] || '#6b7280';
            const label = severityLabels[sev] || sev;
            const name = bn.task_name || bn.brigade_name || bn.task_id || `Пункт ${i + 1}`;
            const msg = bn.message || bn.reason || '—';
            const sug = bn.suggestion || '—';
    
            return `
                <tr style="border-bottom:1px solid #e5e7eb;">
                    <td style="padding:10px 12px;white-space:nowrap;">
                        <span style="background:${color};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">
                            ${label}
                        </span>
                    </td>
                    <td style="padding:10px 12px;font-weight:600;color:#111827;max-width:200px;">${name}</td>
                    <td style="padding:10px 12px;color:#4b5563;font-size:13px;">${msg}</td>
                    <td style="padding:10px 12px;color:#0961f6;font-size:12px;">${sug}</td>
                </tr>`;
        }).join('');
    
        container.innerHTML = `
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead>
                        <tr style="background:#f8fafc;text-align:left;">
                            <th style="padding:10px 12px;color:#64748b;font-weight:600;">Уровень</th>
                            <th style="padding:10px 12px;color:#64748b;font-weight:600;">Объект</th>
                            <th style="padding:10px 12px;color:#64748b;font-weight:600;">Проблема</th>
                            <th style="padding:10px 12px;color:#64748b;font-weight:600;">Рекомендация</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
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
        
        container.innerHTML = `
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <div style="flex:1;min-width:80px;background:#f0f9ff;border-radius:8px;padding:10px;text-align:center;">
                    <div style="font-size:18px;font-weight:700;color:#0961f6;">${summary.totalOperations || 0}</div>
                    <div style="font-size:11px;color:#6b7280;">Операций</div>
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
        `;
    }


/**
 * Форматирование одной рекомендации в читаемый HTML
 */
formatRecommendation(rec) {
    if (!rec) return '';

    // Готовый текст
    if (rec.message || rec.suggestion) {
        let html = '';
        if (rec.message) {
            html += `<div style="font-weight:600;margin-bottom:2px;">${rec.message}</div>`;
        }
        if (rec.suggestion) {
            html += `<div style="color:#64748b;">💡 ${rec.suggestion}</div>`;
        }
        if (rec.task_id || rec.op_number) {
            html += `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">Задача: ${rec.task_id || rec.op_number}</div>`;
        }
        return html || JSON.stringify(rec);
    }

    // По типу
    switch (rec.type) {
        case 'critical_path_task':
            return `<strong>🔥 ${rec.task_name || rec.op_number || rec.task_id || 'Задача'}</strong>
                    <div style="color:#64748b;">На критическом пути${rec.duration ? ` · ${Number(rec.duration).toFixed(1)} дн.` : ''}</div>`;

        case 'assign_operation':
            return `<strong>🎯 ${rec.operation_name || rec.op_number || ''}</strong>
                    <div>Назначить на бригаду <b>${rec.to_brigade_name || rec.to_brigade_id}</b></div>
                    ${rec.reason ? `<div style="color:#64748b;font-size:11px;">${rec.reason}</div>` : ''}`;

        case 'bottleneck':
        case 'dependency_bottleneck':
        case 'critical_path_task':
        case 'brigade_overload':
        case 'near_critical':
        case 'long_task':
            return `<strong>${rec.task_name || rec.brigade_name || rec.task_id || 'Узкое место'}</strong>
                    <div>${rec.message || rec.reason || 'Требует внимания'}</div>
                    ${rec.suggestion ? `<div style="color:#0961f6;">💡 ${rec.suggestion}</div>` : ''}`;

        case 'overload':
            return `<strong>⚠️ Перегрузка бригады</strong>
                    <div>${rec.message || ''}</div>
                    ${rec.suggestion ? `<div style="color:#0961f6;">💡 ${rec.suggestion}</div>` : ''}`;

        default:
            return rec.reason || rec.message || rec.suggestion ||
                   (typeof rec === 'string' ? rec : JSON.stringify(rec));
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
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2" style="margin-bottom:8px;">
                        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
                    </svg>
                    <p>Нет рекомендаций. Запустите оптимизацию.</p>
                </div>`;
            return;
        }
        
        const typeConfig = {
            assign_operation: { color: '#0961f6', icon: '🎯', label: 'Назначения' },
            critical_path_task: { color: '#dc2626', icon: '🔥', label: 'Критический путь' },
            reorder: { color: '#f59e0b', icon: '🔄', label: 'Изменение порядка' },
            split: { color: '#8b5cf6', icon: '✂️', label: 'Разделение' },
            add_resource: { color: '#10b981', icon: '➕', label: 'Ресурсы' },
            reduce_scope: { color: '#ef4444', icon: '📉', label: 'Сокращение' },
            parallelize: { color: '#06b6d4', icon: '⚡', label: 'Параллелизация' },
            delay_risk: { color: '#f97316', icon: '⚠️', label: 'Риски задержки' }
        };
        
        // Группируем по типу
        const groups = {};
        recommendations.forEach(rec => {
            const type = rec.type || 'recommendation';
            if (!groups[type]) groups[type] = [];
            groups[type].push(rec);
        });
        
        const groupKeys = Object.keys(groups);
        
        container.innerHTML = groupKeys.map((type, gi) => {
            const cfg = typeConfig[type] || { color: '#0961f6', icon: '📌', label: type.replace(/_/g, ' ') };
            const items = groups[type];
            const groupId = `rec-group-${type}`;
            
            const itemsHtml = items.map((rec, i) => {
                const formatted = this.formatRecommendation(rec);
                return `
                    <div style="padding:8px 10px;background:#f8f9fa;border-radius:6px;margin-bottom:5px;border-left:3px solid ${cfg.color};font-size:12px;line-height:1.4;">
                        ${formatted}
                    </div>
                `;
            }).join('');
            
            return `
                <div style="margin-bottom:8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                    <div onclick="document.getElementById('${groupId}').style.display=document.getElementById('${groupId}').style.display==='none'?'block':'none'; this.querySelector('.rec-chevron').style.transform=document.getElementById('${groupId}').style.display==='none'?'rotate(-90deg)':'rotate(0deg)';"
                         style="padding:8px 12px;background:#f8fafc;cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none;">
                        <span style="font-size:14px;">${cfg.icon}</span>
                        <span style="font-weight:600;font-size:12px;color:#374151;flex:1;text-transform:capitalize;">${cfg.label}</span>
                        <span style="background:${cfg.color}15;color:${cfg.color};padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;">${items.length}</span>
                        <svg class="rec-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" style="transition:transform 0.2s;">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </div>
                    <div id="${groupId}" style="padding:8px;display:block;">
                        ${itemsHtml}
                    </div>
                </div>
            `;
        }).join('');
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