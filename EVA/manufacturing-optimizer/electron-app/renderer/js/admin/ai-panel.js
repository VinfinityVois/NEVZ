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
    }

    /**
     * Запуск оптимизации через AI Engine
     */
    async runOptimization(operations, brigades, options = {}) {
        if (this.optimizationInProgress) {
            console.warn('Оптимизация уже выполняется');
            return;
        }
        this.optimizationInProgress = true;
        
        try {
            const planData = {
                tasks: (operations || []).filter(op => op.status !== 'completed').map(op => ({
                    id: `T${op.op_number}`,
                    name: op.name,
                    duration_days: op.duration || 1,
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

            const response = await fetch('http://127.0.0.1:8000/ai/build-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(planData)
            });
            
            if (!response.ok) throw new Error(`AI Engine error: ${response.status}`);
            const result = await response.json();
            
            this.lastPlan = result.plan;
            
            const bnResponse = await fetch('http://127.0.0.1:8000/ai/bottlenecks', {
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
            }
            
            return {
                success: result.success,
                plan: result.plan,
                recommendations: result.recommendations || [],
                summary: {
                    totalOperations: result.plan?.tasks?.length || 0,
                    projectDuration: result.plan?.project_duration_days || 0,
                    criticalPath: result.plan?.critical_path_ids || [],
                    leveled: result.plan?.leveled || false
                }
            };
            
        } catch (error) {
            console.error('AI Engine недоступен, fallback на legacy:', error);
            const result = await window.electronAPI?.ai?.optimize({
                operations: (operations || []).filter(op => op.status !== 'completed'),
                available_workers: options.availableWorkers || 50
            }) || await this.fallbackOptimize(operations, brigades);
            return this.processOptimizationResult(result);
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
     * Обучение модели задержек
     */
    async trainDelayModel() {
        if (this.trainingInProgress) {
            console.warn('Обучение уже выполняется');
            return { status: 'already_running' };
        }
        this.trainingInProgress = true;
        
        try {
            await fetch('http://127.0.0.1:8000/ai/sync-training-data', { method: 'POST' });
            
            const response = await fetch('http://127.0.0.1:8000/ai/train/delay-model-from-db', {
                method: 'POST'
            });
            
            if (!response.ok) throw new Error(`Training error: ${response.status}`);
            const result = await response.json();
            
            return {
                status: result.status,
                message: result.message,
                samples: result.samples || 0,
                modelAvailable: result.model_available || false
            };
            
        } catch (error) {
            console.error('Ошибка обучения модели:', error);
            try {
                const legacy = await window.electronAPI?.ai?.trainModel({}) 
                    || await (await fetch('http://127.0.0.1:8000/train', { method: 'POST' })).json();
                return { status: legacy.status, message: 'Legacy model trained', samples: legacy.samples_available || 0 };
            } catch (e) {
                throw error;
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
            const response = await fetch('http://127.0.0.1:8000/ai/status');
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            return null;
        }
    }

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
        
        container.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
                <div style="background:#f0f9ff;border-radius:8px;padding:12px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:#0961f6;">${summary.totalOperations}</div>
                    <div style="font-size:12px;color:#6b7280;">Операций</div>
                </div>
                <div style="background:#fef2f2;border-radius:8px;padding:12px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:#ef4444;">${summary.criticalPath.length}</div>
                    <div style="font-size:12px;color:#6b7280;">Критических</div>
                </div>
                <div style="background:#f0fdf4;border-radius:8px;padding:12px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:#22c55e;">${summary.projectDuration.toFixed(1)}</div>
                    <div style="font-size:12px;color:#6b7280;">Дней проект</div>
                </div>
                <div style="background:#fffbeb;border-radius:8px;padding:12px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:#f59e0b;">${summary.leveled ? 'Да' : 'Нет'}</div>
                    <div style="font-size:12px;color:#6b7280;">Leveling</div>
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
            container.innerHTML = '<p style="color:#6b7280;">Нет рекомендаций</p>';
            return;
        }
        
        container.innerHTML = recommendations.map((rec, i) => `
            <div style="padding:12px;background:#f8f9fa;border-radius:8px;margin-bottom:8px;border-left:3px solid #0961f6;">
                <div style="font-weight:600;color:#111827;font-size:13px;margin-bottom:4px;">${i+1}. ${rec.type || 'Рекомендация'}</div>
                <p style="color:#4b5563;font-size:12px;margin:0;">${rec.message || rec.description || JSON.stringify(rec)}</p>
            </div>
        `).join('');
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