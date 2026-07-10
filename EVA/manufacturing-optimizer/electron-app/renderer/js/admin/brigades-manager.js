/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - BRIGADES MANAGER
 * ================================================================
 * Полнофункциональное управление бригадами
 */

export class BrigadesManager {
    constructor() {
        this.brigades = [];
        this.workers = [];
        this.api = null;
        this.onUpdate = null;
        this.container = null;
    }

    /**
     * Установка API клиента
     */
    setApi(api) {
        this.api = api;
    }

    /**
     * Установка контейнера
     */
    setContainer(containerId) {
        this.container = document.getElementById(containerId);
    }

    /**
     * Загрузка данных
     */
    async loadData() {
        if (!this.api) {
            console.error('API not set');
            return;
        }

        try {
            const [brigades, workers] = await Promise.all([
                this.api.get('/brigades'),
                this.api.get('/workers')
            ]);

            this.brigades = brigades || [];
            this.workers = workers || [];

            this.render();
            
            if (this.onUpdate) {
                this.onUpdate(this.brigades);
            }

            return this.brigades;
        } catch (error) {
            console.error('Failed to load brigades:', error);
            throw error;
        }
    }

    /**
     * Отрисовка бригад
     */
    render() {
        if (!this.container) {
            console.error('Container not set');
            return;
        }

        if (this.brigades.length === 0) {
            this.container.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 60 60" fill="none">
                        <circle cx="30" cy="25" r="10" stroke="#414B4E" stroke-width="2"/>
                        <path d="M10 50V45C10 35 20 30 30 30C40 30 50 35 50 45V50" stroke="#414B4E" stroke-width="2"/>
                    </svg>
                    <p>Нет бригад</p>
                    <button class="btn btn-primary" onclick="window.brigadesManager.showCreateModal()">
                        + Создать первую бригаду
                    </button>
                </div>
            `;
            return;
        }

        const html = `
            <div class="brigades-header">
                <h3>Управление бригадами</h3>
                <button class="btn btn-primary" onclick="window.brigadesManager.showCreateModal()">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="16">
                        <path d="M10 4V16M4 10H16" stroke="currentColor" stroke-width="1.5"/>
                    </svg>
                    Создать бригаду
                </button>
            </div>
            <div class="brigades-grid">
                ${this.brigades.map(brigade => this.renderBrigadeCard(brigade)).join('')}
            </div>
        `;

        this.container.innerHTML = html;
    }

    /**
     * Отрисовка карточки бригады
     */
    renderBrigadeCard(brigade) {
        const brigadeWorkers = this.workers.filter(w => w.brigade_id === brigade.id);
        const onlineWorkers = brigadeWorkers.filter(w => w.status === 'online').length;
        const busyWorkers = brigadeWorkers.filter(w => w.status === 'busy').length;
        const loadPercentage = Math.round(brigade.current_load || 0);
        const efficiency = Math.round((brigade.efficiency_rating || 1) * 100);

        const loadColor = loadPercentage > 80 ? '#ef4444' : 
                         loadPercentage > 60 ? '#f59e0b' : 
                         loadPercentage > 30 ? '#0961f6' : '#10b981';

        return `
            <div class="brigade-card" data-id="${brigade.id}">
                <div class="brigade-card-header">
                    <div class="brigade-avatar">${brigade.name.charAt(0)}</div>
                    <div class="brigade-info">
                        <h4>${brigade.name}</h4>
                        <span class="brigade-id">ID: ${brigade.id}</span>
                    </div>
                    <div class="brigade-actions">
                        <button class="btn-icon" onclick="window.brigadesManager.showEditModal(${brigade.id})" title="Редактировать">
                            <svg viewBox="0 0 20 20" fill="currentColor" width="16">
                                <path d="M14 2L18 6L7 17H3V13L14 2Z" stroke="currentColor" stroke-width="1.5" fill="none"/>
                            </svg>
                        </button>
                        <button class="btn-icon" onclick="window.brigadesManager.deleteBrigade(${brigade.id})" title="Удалить">
                            <svg viewBox="0 0 20 20" fill="currentColor" width="16">
                                <path d="M4 5H16M8 8V14M12 8V14M5 5L6 17H14L15 5H5Z" stroke="currentColor" stroke-width="1.5"/>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div class="brigade-stats">
                    <div class="stat-row">
                        <span class="stat-label">Рабочие</span>
                        <span class="stat-value">
                            ${brigadeWorkers.length} / ${brigade.max_capacity}
                            <span class="stat-detail">(${onlineWorkers} онлайн, ${busyWorkers} занято)</span>
                        </span>
                    </div>
                    
                    <div class="stat-row">
                        <span class="stat-label">Загрузка</span>
                        <span class="stat-value" style="color: ${loadColor}">${loadPercentage}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${loadPercentage}%; background: ${loadColor}"></div>
                    </div>
                    
                    <div class="stat-row">
                        <span class="stat-label">Эффективность</span>
                        <span class="stat-value">${efficiency}%</span>
                    </div>
                </div>
                
                <div class="brigade-workers">
                    <div class="workers-header">
                        <span>Состав бригады</span>
                        <button class="btn-ghost btn-sm" onclick="window.brigadesManager.showAddWorkerModal(${brigade.id})">
                            + Добавить
                        </button>
                    </div>
                    <div class="workers-list">
                        ${brigadeWorkers.length > 0 ? 
                            brigadeWorkers.slice(0, 5).map(w => this.renderWorkerBadge(w)).join('') :
                            '<span class="no-workers">Нет рабочих</span>'
                        }
                        ${brigadeWorkers.length > 5 ? 
                            `<span class="more-workers">+${brigadeWorkers.length - 5} ещё</span>` : ''}
                    </div>
                </div>
                
                <div class="brigade-operations">
                    <button class="btn btn-outline btn-sm" onclick="window.brigadesManager.viewBrigadeOperations(${brigade.id})">
                        📋 Операции бригады
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="window.brigadesManager.showWorkloadModal(${brigade.id})">
                        📊 Управление загрузкой
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Отрисовка бейджа рабочего
     */
    renderWorkerBadge(worker) {
        const statusColors = {
            online: '#10b981',
            offline: '#6b7280',
            busy: '#f59e0b',
            away: '#ef4444'
        };

        return `
            <div class="worker-badge" onclick="window.brigadesManager.showWorkerInfo(${worker.id})">
                <span class="worker-status" style="background: ${statusColors[worker.status] || '#6b7280'}"></span>
                <span class="worker-name">${worker.name}</span>
                <span class="worker-role">${this.getRoleText(worker.role)}</span>
            </div>
        `;
    }

    /**
     * Показать модальное окно создания бригады
     */
    showCreateModal() {
        const modal = document.getElementById('brigadeModal');
        const title = document.getElementById('brigadeModalTitle');
        const form = document.getElementById('brigadeForm');
        
        if (!modal) {
            this.createBrigadeModal();
            return;
        }
        
        title.textContent = 'Создать бригаду';
        form.reset();
        form.dataset.id = '';
        
        document.getElementById('modalOverlay').style.display = 'block';
        modal.style.display = 'block';
    }

    /**
     * Показать модальное окно редактирования
     */
    showEditModal(brigadeId) {
        const brigade = this.brigades.find(b => b.id === brigadeId);
        if (!brigade) return;
        
        const modal = document.getElementById('brigadeModal');
        const title = document.getElementById('brigadeModalTitle');
        const form = document.getElementById('brigadeForm');
        
        if (!modal) {
            this.createBrigadeModal();
            return;
        }
        
        title.textContent = `Редактировать: ${brigade.name}`;
        form.dataset.id = brigadeId;
        
        document.getElementById('brigadeName').value = brigade.name || '';
        document.getElementById('brigadeMaxCapacity').value = brigade.max_capacity || 10;
        document.getElementById('brigadeEfficiency').value = brigade.efficiency_rating || 1.0;
        
        document.getElementById('modalOverlay').style.display = 'block';
        modal.style.display = 'block';
    }

    /**
     * Создать модальное окно бригады
     */
    createBrigadeModal() {
        const modalHtml = `
            <div class="modal" id="brigadeModal" style="display: none;">
                <div class="modal-header">
                    <h3 id="brigadeModalTitle">Создать бригаду</h3>
                    <button class="modal-close" onclick="window.brigadesManager.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="brigadeForm">
                        <div class="form-group">
                            <label for="brigadeName">Название бригады *</label>
                            <input type="text" id="brigadeName" class="input" required placeholder="Например: Бригада раскроя">
                        </div>
                        <div class="form-group">
                            <label for="brigadeMaxCapacity">Максимальная вместимость</label>
                            <input type="number" id="brigadeMaxCapacity" class="input" min="1" max="20" value="10">
                            <small>Максимальное количество рабочих в бригаде</small>
                        </div>
                        <div class="form-group">
                            <label for="brigadeEfficiency">Коэффициент эффективности</label>
                            <input type="number" id="brigadeEfficiency" class="input" min="0" max="2" step="0.05" value="1.0">
                            <small>1.0 = 100% эффективности</small>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="window.brigadesManager.closeModal()">Отмена</button>
                    <button class="btn btn-primary" onclick="window.brigadesManager.saveBrigade()">Сохранить</button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    /**
     * Сохранить бригаду
     */
    async saveBrigade() {
        const modal = document.getElementById('brigadeModal');
        const form = document.getElementById('brigadeForm');
        const brigadeId = form.dataset.id;
        
        const data = {
            name: document.getElementById('brigadeName').value.trim(),
            max_capacity: parseInt(document.getElementById('brigadeMaxCapacity').value) || 10,
            efficiency_rating: parseFloat(document.getElementById('brigadeEfficiency').value) || 1.0
        };
        
        if (!data.name) {
            alert('Введите название бригады');
            return;
        }
        
        try {
            if (brigadeId) {
                await this.api.put(`/brigades/${brigadeId}`, data);
                this.showNotification('Успех', 'Бригада обновлена', 'success');
            } else {
                await this.api.post('/brigades', data);
                this.showNotification('Успех', 'Бригада создана', 'success');
            }
            
            this.closeModal();
            await this.loadData();
        } catch (error) {
            console.error('Failed to save brigade:', error);
            this.showNotification('Ошибка', 'Не удалось сохранить бригаду', 'error');
        }
    }

    /**
     * Удалить бригаду
     */
    async deleteBrigade(brigadeId) {
        const brigade = this.brigades.find(b => b.id === brigadeId);
        if (!brigade) return;
        
        const workersCount = this.workers.filter(w => w.brigade_id === brigadeId).length;
        
        let message = `Удалить бригаду "${brigade.name}"?`;
        if (workersCount > 0) {
            message += `\n\n⚠️ В бригаде ${workersCount} рабочих. Они останутся без бригады.`;
        }
        
        if (!confirm(message)) return;
        
        try {
            await this.api.delete(`/brigades/${brigadeId}`);
            this.showNotification('Успех', 'Бригада удалена', 'success');
            await this.loadData();
        } catch (error) {
            console.error('Failed to delete brigade:', error);
            this.showNotification('Ошибка', 'Не удалось удалить бригаду', 'error');
        }
    }

    /**
     * Показать информацию о рабочем
     */
    showWorkerInfo(workerId) {
        const worker = this.workers.find(w => w.id === workerId);
        if (!worker) return;
        
        alert(`
Рабочий: ${worker.name}
Роль: ${this.getRoleText(worker.role)}
Статус: ${this.getStatusText(worker.status)}
Бригада: ${this.brigades.find(b => b.id === worker.brigade_id)?.name || 'Нет'}
Навыки: ${(worker.skills || []).join(', ') || 'Не указаны'}
        `);
    }

    /**
     * Показать модальное окно добавления рабочего
     */
    showAddWorkerModal(brigadeId) {
        // Вызываем метод из WorkersManager
        if (window.workersManager) {
            window.workersManager.showCreateModal(brigadeId);
        }
    }

    /**
     * Просмотр операций бригады
     */
    viewBrigadeOperations(brigadeId) {
        // Переключаемся на вкладку операций с фильтром
        document.querySelector('[data-tab="operations"]')?.click();
        
        // Устанавливаем фильтр по бригаде
        setTimeout(() => {
            const filterSelect = document.getElementById('filterBrigade');
            if (filterSelect) {
                filterSelect.value = brigadeId;
                filterSelect.dispatchEvent(new Event('change'));
            }
        }, 200);
    }

    /**
     * Показать модальное окно управления загрузкой
     */
    showWorkloadModal(brigadeId) {
        const brigade = this.brigades.find(b => b.id === brigadeId);
        if (!brigade) return;
        
        const currentLoad = brigade.current_load || 0;
        
        const modalHtml = `
            <div class="modal-overlay" style="display: block;" onclick="this.remove()"></div>
            <div class="modal" style="display: block;">
                <div class="modal-header">
                    <h3>Управление загрузкой: ${brigade.name}</h3>
                    <button class="modal-close" onclick="document.querySelector('.modal-overlay').remove(); document.querySelector('.modal').remove();">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Текущая загрузка: ${currentLoad}%</label>
                        <input type="range" id="workloadSlider" min="0" max="100" value="${currentLoad}" step="5">
                        <div style="display: flex; justify-content: space-between;">
                            <span>0%</span>
                            <span id="workloadValue">${currentLoad}%</span>
                            <span>100%</span>
                        </div>
                    </div>
                    <div class="workload-info">
                        <p>Загрузка бригады влияет на скорость выполнения операций:</p>
                        <ul>
                            <li>0-30%: Низкая загрузка, эффективность +10%</li>
                            <li>30-60%: Оптимальная загрузка</li>
                            <li>60-80%: Высокая загрузка, эффективность -5%</li>
                            <li>80-100%: Критическая загрузка, эффективность -15%</li>
                        </ul>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="document.querySelector('.modal-overlay').remove(); document.querySelector('.modal').remove();">Отмена</button>
                    <button class="btn btn-primary" onclick="window.brigadesManager.updateWorkload(${brigadeId})">Применить</button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        const slider = document.getElementById('workloadSlider');
        const value = document.getElementById('workloadValue');
        slider.addEventListener('input', () => {
            value.textContent = slider.value + '%';
        });
    }

    /**
     * Обновить загрузку бригады
     */
    async updateWorkload(brigadeId) {
        const slider = document.getElementById('workloadSlider');
        const newLoad = parseInt(slider.value);
        
        try {
            await this.api.put(`/brigades/${brigadeId}`, { current_load: newLoad });
            this.showNotification('Успех', `Загрузка обновлена: ${newLoad}%`, 'success');
            document.querySelector('.modal-overlay')?.remove();
            document.querySelector('.modal')?.remove();
            await this.loadData();
        } catch (error) {
            console.error('Failed to update workload:', error);
            this.showNotification('Ошибка', 'Не удалось обновить загрузку', 'error');
        }
    }

    /**
     * Закрыть модальное окно
     */
    closeModal() {
        document.getElementById('modalOverlay').style.display = 'none';
        document.getElementById('brigadeModal').style.display = 'none';
    }

    /**
     * Показать уведомление
     */
    showNotification(title, message, type) {
        if (window.showNotification) {
            window.showNotification(title, message, type);
        } else {
            console.log(`[${type}] ${title}: ${message}`);
        }
    }

    /**
     * Получить текст роли
     */
    getRoleText(role) {
        const roles = {
            worker: 'Рабочий',
            brigadier: 'Бригадир',
            supervisor: 'Начальник',
            admin: 'Админ'
        };
        return roles[role] || role;
    }

    /**
     * Получить текст статуса
     */
    getStatusText(status) {
        const statuses = {
            online: 'Онлайн',
            offline: 'Офлайн',
            busy: 'Занят',
            away: 'Отошёл'
        };
        return statuses[status] || status;
    }

    /**
     * Получить все бригады
     */
    getAll() {
        return this.brigades;
    }

    /**
     * Получить бригаду по ID
     */
    getById(id) {
        return this.brigades.find(b => b.id === id);
    }

    /**
     * Получить рабочих бригады
     */
    getWorkers(brigadeId) {
        return this.workers.filter(w => w.brigade_id === brigadeId);
    }
}

// Создаём глобальный экземпляр
window.brigadesManager = new BrigadesManager();