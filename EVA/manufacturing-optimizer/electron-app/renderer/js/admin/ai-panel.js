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
    formatRecommendation(rec) {
        if (!rec || typeof rec !== 'object') {
            return String(rec);
        }

        const type = rec.type || 'recommendation';

        switch (type) {
            case 'assign_operation':
                const opName = rec.operation_name || `Операция #${rec.op_number || rec.operation_id}`;
                const brigadeName = rec.to_brigade_name || `Бригада #${rec.to_brigade_id}`;
                const reason = rec.reason || 'Операция не назначена на бригаду';
                const people = rec.people_count ? ` (${rec.people_count} чел.)` : '';
                const duration = rec.current_duration ? `, длительность ${rec.current_duration} ч` : '';
                return `<strong>🎯 Назначить операцию</strong><br>
                        <span style="color:#0961f6;font-weight:600;">${opName}</span>${people}${duration}<br>
                        <span style="color:#059669;">→ ${brigadeName}</span><br>
                        <span style="color:#6b7280;font-size:11px;">💡 ${reason}</span>`;

                        case 'critical_path_task':
                const taskName = rec.task_name || rec.name || rec.operation_name || `Операция #${rec.op_number || '?'}`;
                const durVal = parseFloat(rec.duration);
                const durationDays = (!isNaN(durVal) && durVal > 0) ? durVal.toFixed(1) : 'не указана';
                return `<strong>🔥 ${taskName}</strong><br>
                        <span style="color:#6b7280;font-size:11px;">Длительность: <strong style="color:#dc2626;">${durationDays}</strong> ${durVal > 0 ? 'дн' : ''}</span>`;

            case 'reorder':
                return `<strong>🔄 Изменить порядок</strong><br>
                        ${rec.message || rec.description || 'Рекомендуется изменить последовательность операций'}`;

            case 'split':
                return `<strong>✂️ Разделить задачу</strong><br>
                        ${rec.message || rec.description || 'Рекомендуется разделить задачу на части'}`;

            case 'add_resource':
                return `<strong>➕ Добавить ресурсы</strong><br>
                        ${rec.message || rec.description || 'Требуется увеличить ресурсы'}`;

            case 'reduce_scope':
                return `<strong>📉 Сократить объём</strong><br>
                        ${rec.message || rec.description || 'Рекомендуется сократить объём работ'}`;

            case 'parallelize':
                return `<strong>⚡ Параллелизация</strong><br>
                        ${rec.message || rec.description || 'Операции можно выполнять параллельно'}`;

            case 'delay_risk':
                return `<strong>⚠️ Риск задержки</strong><br>
                        ${rec.message || rec.description || 'Высокий риск задержки'}`;

            default:
                if (rec.message || rec.description) {
                    return `<strong>📌 ${rec.type || 'Рекомендация'}</strong><br>
                            ${rec.message || rec.description}`;
                }
                const keyFields = ['name', 'task_name', 'operation_name', 'brigade_name', 'reason', 'suggestion'];
                const parts = [];
                for (const key of keyFields) {
                    if (rec[key]) {
                        parts.push(`${key}: ${rec[key]}`);
                    }
                }
                if (parts.length > 0) {
                    return `<strong>📌 ${type}</strong><br>${parts.join('<br>')}`;
                }
                return `<strong>📌 ${type}</strong><br>
                        <code style="font-size:11px;background:#f3f4f6;padding:4px;border-radius:4px;">
                            ${JSON.stringify(rec, null, 2).substring(0, 200)}
                        </code>`;
        }
    }

    /**
     * Локальная генерация рекомендаций (fallback)
     */
    generateLocalRecommendations(operations, brigades) {
        const recs = [];
        const activeOps = (operations || []).filter(op => op.status !== 'completed');

        const criticalOps = activeOps.filter(op => (op.time_reserve || 0) === 0);
        for (const op of criticalOps.slice(0, 5)) {
            recs.push({
                type: 'critical_path_task',
                task_name: op.name,
                duration: (op.duration || 0) / 8
            });
        }

        const unassigned = activeOps.filter(op => !op.brigade_id);
        for (const op of unassigned.slice(0, 5)) {
            const brigade = brigades.find(b => (b.current_load || 0) < 80);
            if (brigade) {
                recs.push({
                    type: 'assign_operation',
                    operation_id: op.id,
                    op_number: op.op_number,
                    operation_name: op.name,
                    to_brigade_id: brigade.id,
                    to_brigade_name: brigade.name,
                    current_duration: op.duration,
                    people_count: op.people_count,
                    priority: op.priority || 'MEDIUM',
                    reason: `Операция не назначена на бригаду. Бригада '${brigade.name}' имеет свободные ресурсы.`
                });
            }
        }

        return recs;
    }

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
        if (!container || !plan || !plan.tasks) return;
        
        const tasks = plan.tasks || [];
        const criticalIds = new Set(plan.critical_path_ids || []);
        
        if (tasks.length === 0) {
            container.innerHTML = '<p style="color:#6b7280;">Нет данных для построения графика</p>';
            return;
        }

        const sortedTasks = [...tasks].sort((a, b) => (a.start_day || 0) - (b.start_day || 0));
        const maxDay = Math.max(...tasks.map(t => (t.start_day || 0) + (t.duration_days || 1)));
        const dayWidth = Math.min(40, Math.max(20, 600 / (maxDay || 1)));
        const barHeight = 28;
        const rowHeight = 40;
        const leftMargin = 160;
        const topMargin = 20;
        
        const svgWidth = leftMargin + (maxDay * dayWidth) + 60;
        const svgHeight = topMargin + (sortedTasks.length * rowHeight) + 40;
        
        let svg = `<svg width="100%" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" style="font-family:system-ui,sans-serif;font-size:12px;">`;
        
        for (let d = 0; d <= maxDay; d += 5) {
            const x = leftMargin + d * dayWidth;
            svg += `<line x1="${x}" y1="${topMargin}" x2="${x}" y2="${svgHeight - 30}" stroke="#e5e7eb" stroke-width="1"/>`;
            svg += `<text x="${x}" y="${topMargin - 5}" fill="#9ca3af" font-size="10">Д${d}</text>`;
        }
        
        sortedTasks.forEach((task, i) => {
            const y = topMargin + i * rowHeight;
            const start = task.start_day || 0;
            const duration = task.duration_days || 1;
            const x = leftMargin + start * dayWidth;
            const width = Math.max(dayWidth * 0.5, duration * dayWidth);
            const isCritical = criticalIds.has(task.id);
            
            const color = isCritical ? '#ef4444' : task.leveled ? '#f59e0b' : '#0961f6';
            const label = task.name?.length > 18 ? task.name.substring(0, 18) + '...' : (task.name || task.id);
            
            svg += `<text x="${leftMargin - 8}" y="${y + barHeight/2 + 4}" text-anchor="end" fill="#374151" font-size="11">${label}</text>`;
            svg += `<rect x="${x}" y="${y}" width="${width}" height="${barHeight}" rx="4" fill="${color}" opacity="0.85"/>`;
            
            if (width > 30) {
                svg += `<text x="${x + width/2}" y="${y + barHeight/2 + 4}" text-anchor="middle" fill="white" font-size="10" font-weight="500">${duration}д</text>`;
            }
            
            if (isCritical) {
                svg += `<circle cx="${x - 8}" cy="${y + barHeight/2}" r="3" fill="#ef4444"/>`;
            }
        });
        
        const legendY = svgHeight - 20;
        svg += `<rect x="${leftMargin}" y="${legendY}" width="12" height="12" rx="2" fill="#ef4444"/>`;
        svg += `<text x="${leftMargin + 18}" y="${legendY + 10}" fill="#374151" font-size="11">Критический путь</text>`;
        svg += `<rect x="${leftMargin + 130}" y="${legendY}" width="12" height="12" rx="2" fill="#0961f6"/>`;
        svg += `<text x="${leftMargin + 148}" y="${legendY + 10}" fill="#374151" font-size="11">Обычная задача</text>`;
        svg += `<rect x="${leftMargin + 260}" y="${legendY}" width="12" height="12" rx="2" fill="#f59e0b"/>`;
        svg += `<text x="${leftMargin + 278}" y="${legendY + 10}" fill="#374151" font-size="11">Сдвинута (leveling)</text>`;
        
        svg += '</svg>';
        container.innerHTML = svg;
    }

    /**
     * Рендер анализа узких мест
     */
    renderBottleneckAnalysis(containerId, bottlenecks) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (!bottlenecks || bottlenecks.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:24px;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" style="margin-bottom:12px;">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <p style="color:#6b7280;">Узких мест не обнаружено. Производство работает оптимально!</p>
                </div>`;
            return;
        }
        
        const severityColors = { high: '#ef4444', medium: '#f59e0b', low: '#0961f6' };
        const severityLabels = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };
        
        container.innerHTML = bottlenecks.map((bn, i) => {
            const color = severityColors[bn.severity] || '#6b7280';
            const label = severityLabels[bn.severity] || bn.severity;
            const taskName = bn.task_name || bn.task_id || `Задача ${i+1}`;
            
            return `
                <div style="border-left:4px solid ${color};padding:12px 16px;margin-bottom:10px;background:#f9fafb;border-radius:8px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                        <span style="background:${color};color:white;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">${label}</span>
                        <strong style="color:#111827;font-size:14px;">${taskName}</strong>
                    </div>
                    <p style="color:#4b5563;font-size:13px;margin:0 0 6px 0;">${bn.reason || 'Узкое место в производстве'}</p>
                    ${bn.suggestion ? `<p style="color:#0961f6;font-size:12px;margin:0;font-weight:500;">💡 ${bn.suggestion}</p>` : ''}
                    ${bn.impact_days ? `<p style="color:#6b7280;font-size:11px;margin:4px 0 0 0;">Влияние: +${bn.impact_days.toFixed(1)} дн.</p>` : ''}
                </div>
            `;
        }).join('');
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