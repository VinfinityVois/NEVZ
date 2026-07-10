/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - ГЕНЕРАЦИЯ ОТЧЁТОВ
 * ================================================================
 */

export class ReportsGenerator {
    constructor() {
        this.reportTemplates = {
            efficiency: 'Отчёт по эффективности',
            timeline: 'Временная диаграмма',
            resources: 'Использование ресурсов',
            'ai-analysis': 'AI анализ'
        };
    }

    /**
     * Генерация отчёта по эффективности
     */
    generateEfficiencyReport(operations, brigades, workers) {
        const report = {
            title: 'Отчёт по эффективности производства',
            generatedAt: new Date().toISOString(),
            summary: {
                totalOperations: operations.length,
                completed: operations.filter(op => op.status === 'completed').length,
                inProgress: operations.filter(op => op.status === 'in_progress').length,
                pending: operations.filter(op => op.status === 'pending').length,
                blocked: operations.filter(op => op.status === 'blocked').length
            },
            brigadesEfficiency: brigades.map(brigade => {
                const brigadeOps = operations.filter(op => op.brigade_id === brigade.id);
                const completedOps = brigadeOps.filter(op => op.status === 'completed');
                
                const avgEfficiency = completedOps.length > 0
                    ? completedOps.reduce((sum, op) => {
                        const efficiency = op.duration / (op.actual_duration || op.duration);
                        return sum + efficiency;
                    }, 0) / completedOps.length
                    : 0;
                
                return {
                    id: brigade.id,
                    name: brigade.name,
                    operationsCount: brigadeOps.length,
                    completedCount: completedOps.length,
                    avgEfficiency: Math.round(avgEfficiency * 100) / 100,
                    rating: brigade.efficiency_rating
                };
            }),
            workersEfficiency: workers.map(worker => {
                const workerOps = operations.filter(op => 
                    op.assigned_workers && op.assigned_workers.includes(worker.id)
                );
                
                return {
                    id: worker.id,
                    name: worker.name,
                    brigade: worker.brigade_id,
                    operationsCompleted: workerOps.filter(op => op.status === 'completed').length,
                    totalLaborHours: workerOps.reduce((sum, op) => sum + (op.labor_hours || 0), 0)
                };
            })
        };
        
        return report;
    }

    /**
     * Генерация временной диаграммы
     */
    generateTimelineReport(operations, criticalPath) {
        const timeline = [];
        let currentTime = 0;
        
        // Сортируем операции по раннему старту
        const sortedOps = [...operations].sort((a, b) => {
            return (a.early_start || 0) - (b.early_start || 0);
        });
        
        sortedOps.forEach(op => {
            const start = op.early_start || 0;
            const end = (op.early_start || 0) + (op.duration || 0);
            
            timeline.push({
                operationId: op.op_number,
                operationName: op.name,
                start: start,
                end: end,
                duration: op.duration,
                isCritical: criticalPath.includes(op.op_number),
                brigade: op.brigade_id,
                status: op.status
            });
            
            if (end > currentTime) {
                currentTime = end;
            }
        });
        
        return {
            title: 'Временная диаграмма проекта',
            generatedAt: new Date().toISOString(),
            projectDuration: currentTime,
            criticalPathLength: criticalPath.length,
            timeline: timeline,
            summary: {
                totalOperations: operations.length,
                projectStart: 0,
                projectEnd: currentTime,
                criticalPath: criticalPath.join(' → ')
            }
        };
    }

    /**
     * Генерация отчёта по ресурсам
     */
    generateResourcesReport(operations, brigades, workers) {
        const resourceUsage = {};
        const totalLabor = operations.reduce((sum, op) => sum + (op.labor_hours || 0), 0);
        
        brigades.forEach(brigade => {
            const brigadeOps = operations.filter(op => op.brigade_id === brigade.id);
            const brigadeLabor = brigadeOps.reduce((sum, op) => sum + (op.labor_hours || 0), 0);
            
            resourceUsage[`brigade_${brigade.id}`] = {
                type: 'brigade',
                id: brigade.id,
                name: brigade.name,
                operationsCount: brigadeOps.length,
                laborHours: brigadeLabor,
                laborPercent: totalLabor > 0 ? (brigadeLabor / totalLabor) * 100 : 0,
                workersCount: workers.filter(w => w.brigade_id === brigade.id).length,
                maxCapacity: brigade.max_capacity,
                utilizationRate: brigadeLabor / (workers.filter(w => w.brigade_id === brigade.id).length * 40) // 40-часовая неделя
            };
        });
        
        return {
            title: 'Отчёт по использованию ресурсов',
            generatedAt: new Date().toISOString(),
            totalLaborHours: totalLabor,
            resourceUsage: Object.values(resourceUsage),
            recommendations: this.generateResourceRecommendations(resourceUsage)
        };
    }

    /**
     * Генерация AI анализа
     */
    generateAIAnalysisReport(operations, criticalPath, optimizationResults) {
        const bottlenecks = [];
        
        criticalPath.forEach(opNumber => {
            const op = operations.find(o => o.op_number === opNumber);
            if (op && op.duration > 5) {
                bottlenecks.push({
                    operationId: op.op_number,
                    operationName: op.name,
                    duration: op.duration,
                    issue: 'Длительная операция на критическом пути',
                    recommendation: `Рассмотреть возможность увеличения ресурсов`
                });
            }
        });
        
        return {
            title: 'AI Анализ производства',
            generatedAt: new Date().toISOString(),
            criticalPathAnalysis: {
                pathLength: criticalPath.length,
                totalDuration: operations
                    .filter(op => criticalPath.includes(op.op_number))
                    .reduce((sum, op) => sum + (op.duration || 0), 0),
                bottlenecks: bottlenecks
            },
            optimizationPotential: optimizationResults?.summary || null,
            recommendations: optimizationResults?.recommendations || []
        };
    }

    /**
     * Генерация рекомендаций по ресурсам
     */
    generateResourceRecommendations(resourceUsage) {
        const recommendations = [];
        
        Object.values(resourceUsage).forEach(resource => {
            if (resource.utilizationRate > 0.8) {
                recommendations.push({
                    resource: resource.name,
                    issue: 'Высокая загрузка',
                    recommendation: 'Рассмотреть возможность добавления ресурсов или перераспределения задач',
                    priority: 'high'
                });
            } else if (resource.utilizationRate < 0.3 && resource.operationsCount > 0) {
                recommendations.push({
                    resource: resource.name,
                    issue: 'Низкая загрузка',
                    recommendation: 'Можно взять дополнительные задачи',
                    priority: 'low'
                });
            }
        });
        
        return recommendations;
    }

    /**
     * Экспорт отчёта в HTML
     */
    exportToHTML(report) {
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${report.title}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    h1 { color: #0961f6; }
                    h2 { color: #414B4E; margin-top: 30px; }
                    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    .summary { background: #f8f9fa; padding: 20px; border-radius: 8px; }
                    .critical { color: #ef4444; font-weight: bold; }
                    .success { color: #10b981; }
                    .warning { color: #f59e0b; }
                </style>
            </head>
            <body>
                <h1>${report.title}</h1>
                <p>Сгенерировано: ${new Date(report.generatedAt).toLocaleString('ru-RU')}</p>
        `;
        
        // Добавляем содержимое в зависимости от типа отчёта
        html += this.renderReportContent(report);
        
        html += `
            </body>
            </html>
        `;
        
        return html;
    }

    /**
     * Рендеринг содержимого отчёта
     */
    renderReportContent(report) {
        let content = '';
        
        if (report.summary) {
            content += `
                <div class="summary">
                    <h2>Сводка</h2>
                    ${Object.entries(report.summary).map(([key, value]) => 
                        `<p><strong>${key}:</strong> ${value}</p>`
                    ).join('')}
                </div>
            `;
        }
        
        return content;
    }

    /**
     * Скачивание отчёта
     */
    downloadReport(report, format = 'html') {
        let content;
        let mimeType;
        let extension;
        
        if (format === 'html') {
            content = this.exportToHTML(report);
            mimeType = 'text/html';
            extension = 'html';
        } else if (format === 'json') {
            content = JSON.stringify(report, null, 2);
            mimeType = 'application/json';
            extension = 'json';
        }
        
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `report_${report.title.replace(/\s+/g, '_')}_${Date.now()}.${extension}`;
        link.click();
        URL.revokeObjectURL(url);
    }
}