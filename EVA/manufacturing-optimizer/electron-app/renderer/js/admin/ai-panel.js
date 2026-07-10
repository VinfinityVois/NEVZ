/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - AI ПАНЕЛЬ
 * ================================================================
 */

export class AIPanel {
    constructor() {
        this.optimizationInProgress = false;
        this.trainingInProgress = false;
    }

    /**
     * Запуск оптимизации
     */
    async runOptimization(operations, options = {}) {
        if (this.optimizationInProgress) {
            console.warn('Оптимизация уже выполняется');
            return;
        }

        this.optimizationInProgress = true;
        
        try {
            const availableWorkers = options.availableWorkers || 50;
            const targetEfficiency = options.targetEfficiency || 0.8;
            
            const result = await window.electronAPI.ai.optimize({
                operations: operations.filter(op => op.status !== 'completed'),
                available_workers: availableWorkers,
                target_efficiency: targetEfficiency
            });
            
            return this.processOptimizationResult(result);
            
        } catch (error) {
            console.error('Ошибка оптимизации:', error);
            throw error;
        } finally {
            this.optimizationInProgress = false;
        }
    }

    /**
     * Обработка результатов оптимизации
     */
    processOptimizationResult(result) {
        return {
            summary: {
                totalOperations: result.summary?.total_operations || 0,
                optimizedOperations: result.summary?.optimized_operations || 0,
                originalTime: result.summary?.original_total_time || 0,
                optimizedTime: result.summary?.optimized_total_time || 0,
                timeSaved: result.summary?.total_time_saved || 0,
                timeSavedPercent: result.summary?.time_saved_percent || 0
            },
            recommendations: (result.recommendations || []).map(rec => ({
                operationId: rec.operation_id,
                operationName: rec.operation_name,
                recommendedPeople: rec.recommended_people,
                predictedDuration: rec.predicted_duration,
                efficiency: rec.efficiency,
                timeSaved: rec.time_saved
            }))
        };
    }

    /**
     * Обучение модели
     */
    async trainModel(trainingData) {
        if (this.trainingInProgress) {
            console.warn('Обучение уже выполняется');
            return;
        }

        this.trainingInProgress = true;
        
        try {
            const result = await window.electronAPI.ai.trainModel(trainingData);
            
            return {
                status: result.status,
                metrics: {
                    mae: result.metrics?.mae,
                    r2: result.metrics?.r2,
                    accuracy: result.metrics?.accuracy
                },
                samplesTrained: result.samples_trained
            };
            
        } catch (error) {
            console.error('Ошибка обучения:', error);
            throw error;
        } finally {
            this.trainingInProgress = false;
        }
    }

    /**
     * Предсказание длительности
     */
    async predictDuration(laborHours, peopleCount, brigadeLoad, timeReserve) {
        try {
            const result = await window.electronAPI.ai.predict({
                labor_hours: laborHours,
                people_count: peopleCount,
                brigade_load: brigadeLoad,
                time_reserve: timeReserve
            });
            
            return result.predicted_duration;
            
        } catch (error) {
            console.error('Ошибка предсказания:', error);
            // Fallback формула
            return laborHours / peopleCount;
        }
    }

    /**
     * Получение статистики модели
     */
    async getModelStatistics() {
        try {
            return await window.electronAPI.ai.getStatistics();
        } catch (error) {
            console.error('Ошибка получения статистики:', error);
            return null;
        }
    }

    /**
     * Генерация рекомендаций по бригадам
     */
    generateBrigadeRecommendations(operations, brigades) {
        const recommendations = [];
        
        brigades.forEach(brigade => {
            const brigadeOps = operations.filter(op => op.brigade_id === brigade.id);
            const totalLabor = brigadeOps.reduce((sum, op) => sum + (op.labor_hours || 0), 0);
            const totalDuration = brigadeOps.reduce((sum, op) => sum + (op.duration || 0), 0);
            
            // Расчёт оптимальной загрузки
            const currentLoad = brigade.current_load || 0;
            const maxCapacity = brigade.max_capacity || 10;
            
            if (currentLoad > 80) {
                recommendations.push({
                    type: 'warning',
                    brigadeId: brigade.id,
                    brigadeName: brigade.name,
                    message: `Бригада перегружена (${currentLoad}%). Рекомендуется перераспределить задачи.`,
                    action: 'redistribute'
                });
            }
            
            if (currentLoad < 30 && brigadeOps.length > 0) {
                recommendations.push({
                    type: 'info',
                    brigadeId: brigade.id,
                    brigadeName: brigade.name,
                    message: `Бригада недозагружена (${currentLoad}%). Можно взять дополнительные задачи.`,
                    action: 'add_tasks'
                });
            }
        });
        
        return recommendations;
    }

    /**
     * Анализ узких мест
     */
    analyzeBottlenecks(operations, criticalPath) {
        const bottlenecks = [];
        
        criticalPath.forEach(opNumber => {
            const op = operations.find(o => o.op_number === opNumber);
            if (op) {
                // Операции с высокой трудоёмкостью на критическом пути
                if (op.duration > 5) {
                    bottlenecks.push({
                        operationId: op.op_number,
                        operationName: op.name,
                        duration: op.duration,
                        reason: 'Длительная операция на критическом пути',
                        suggestion: `Увеличить количество людей с ${op.people_count} до ${Math.min(11, Math.ceil(op.people_count * 1.5))}`
                    });
                }
                
                // Операции с малым резервом
                if (op.time_reserve < 1) {
                    bottlenecks.push({
                        operationId: op.op_number,
                        operationName: op.name,
                        duration: op.duration,
                        reason: 'Малый резерв времени',
                        suggestion: 'Уделить особое внимание, не допускать задержек'
                    });
                }
            }
        });
        
        return bottlenecks;
    }

    /**
     * Расчёт эффективности
     */
    calculateEfficiency(plannedDuration, actualDuration) {
        if (actualDuration === 0) return 0;
        return plannedDuration / actualDuration;
    }

    /**
     * Оптимизация последовательности
     */
    optimizeSequence(operations) {
        // Группировка по постам
        const byPost = {};
        operations.forEach(op => {
            if (!byPost[op.post]) byPost[op.post] = [];
            byPost[op.post].push(op);
        });
        
        // Поиск параллельных операций
        const parallelizable = [];
        Object.entries(byPost).forEach(([post, ops]) => {
            const independentOps = ops.filter(op => 
                !op.prev_ops || op.prev_ops.length === 0
            );
            if (independentOps.length > 1) {
                parallelizable.push({
                    post: parseInt(post),
                    operations: independentOps.map(op => op.op_number),
                    message: `На посту ${post} можно выполнять параллельно ${independentOps.length} операций`
                });
            }
        });
        
        return parallelizable;
    }
}