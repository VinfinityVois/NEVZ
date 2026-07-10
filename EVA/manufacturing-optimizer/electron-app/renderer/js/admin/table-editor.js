/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - TABLE EDITOR
 * ================================================================
 * Полнофункциональный редактор таблицы операций
 */

export class TableEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.hot = null;
        this.data = [];
        this.total = 0;
        this.page = 1;
        this.pageSize = 50;
        this.searchQuery = '';
        this.statusFilter = '';
        this.onChange = null;
        this.onSelection = null;
        this.api = null;
    }

    /**
     * Установка API клиента
     */
    setApi(api) {
        this.api = api;
    }

    /**
     * Загрузка данных с сервера
     */
    async loadData() {
        if (!this.api) {
            console.error('API not set');
            return;
        }
        
        try {
            const params = new URLSearchParams({
                page: this.page,
                page_size: this.pageSize,
                search: this.searchQuery,
                status: this.statusFilter
            });
            
            const response = await this.api.get(`/operations?${params}`);
            this.data = response.items || [];
            this.total = response.total || 0;
            
            if (this.hot) {
                this.hot.loadData(this.data);
            }
            
            this.updatePagination();
            
            return response;
        } catch (error) {
            console.error('Failed to load data:', error);
            throw error;
        }
    }

    /**
     * Инициализация таблицы
     */
    init() {
        if (!this.container) {
            console.error('Container not found');
            return;
        }

        this.hot = new Handsontable(this.container, {
            data: this.data,
            colHeaders: ['ID', 'Пост', 'Номер', 'Название', 'Трудоёмкость', 'Люди', 'Время', 'Бригада', 'Место', 'Резерв', 'Статус'],
            columns: [
                { data: 'id', readOnly: true, width: 50 },
                { data: 'post', width: 60, type: 'numeric' },
                { data: 'op_number', width: 70, type: 'numeric' },
                { data: 'name', width: 200 },
                { data: 'labor_hours', width: 100, type: 'numeric', numericFormat: { pattern: '0.00' } },
                { data: 'people_count', width: 70, type: 'numeric' },
                { data: 'duration', width: 80, type: 'numeric', numericFormat: { pattern: '0.00' } },
                { data: 'brigade_id', width: 80, type: 'numeric' },
                { data: 'location', width: 120 },
                { data: 'time_reserve', width: 80, type: 'numeric', numericFormat: { pattern: '0.00' } },
                { 
                    data: 'status', 
                    width: 120,
                    editor: 'select',
                    selectOptions: ['pending', 'in_progress', 'completed', 'blocked'],
                    renderer: (instance, td, row, col, prop, value) => {
                        Handsontable.renderers.TextRenderer.apply(this, arguments);
                        
                        const statusColors = {
                            pending: '#414B4E',
                            in_progress: '#0961f6',
                            completed: '#10b981',
                            blocked: '#f59e0b'
                        };
                        
                        const statusText = {
                            pending: 'Ожидает',
                            in_progress: 'В работе',
                            completed: 'Завершено',
                            blocked: 'Заблокировано'
                        };
                        
                        td.style.backgroundColor = statusColors[value] || '#414B4E';
                        td.style.color = 'white';
                        td.style.fontWeight = 'bold';
                        td.textContent = statusText[value] || value;
                        
                        return td;
                    }
                }
            ],
            rowHeaders: true,
            height: 'calc(100vh - 300px)',
            width: '100%',
            licenseKey: 'non-commercial-and-evaluation',
            stretchH: 'all',
            autoWrapRow: true,
            manualRowResize: true,
            manualColumnResize: true,
            contextMenu: [
                'row_above',
                'row_below',
                'remove_row',
                '---------',
                'copy',
                'cut',
                'paste',
                '---------',
                'undo',
                'redo'
            ],
            filters: true,
            dropdownMenu: true,
            multiColumnSorting: true,
            search: true,
            
            afterChange: async (changes, source) => {
                if (source === 'edit' || source === 'paste') {
                    await this.handleChanges(changes);
                }
            },
            
            afterSelection: (row, col, row2, col2) => {
                const selected = this.getSelectedData();
                if (this.onSelection) {
                    this.onSelection(selected);
                }
            }
        });

        console.log('✅ TableEditor initialized');
    }

    /**
     * Обработка изменений
     */
    async handleChanges(changes) {
        if (!changes || !this.api) return;
        
        for (const change of changes) {
            const [row, prop, oldVal, newVal] = change;
            if (oldVal === newVal) continue;
            
            const operation = this.hot.getSourceDataAtRow(row);
            if (!operation || !operation.id) continue;
            
            try {
                const updateData = { [prop]: newVal };
                await this.api.put(`/operations/${operation.id}`, updateData);
                console.log(`Updated operation ${operation.id}: ${prop} = ${newVal}`);
                
                if (this.onChange) {
                    this.onChange(changes, this.data);
                }
            } catch (error) {
                console.error('Failed to update operation:', error);
                // Откатываем изменение
                this.hot.setDataAtCell(row, prop, oldVal);
                alert('Не удалось сохранить изменение');
            }
        }
    }

    /**
     * Получить выбранные данные
     */
    getSelectedData() {
        if (!this.hot) return [];
        
        const selected = this.hot.getSelected();
        if (!selected || selected.length === 0) return [];
        
        const [row, , row2] = selected[0];
        const data = [];
        for (let r = row; r <= row2; r++) {
            const rowData = this.hot.getSourceDataAtRow(r);
            if (rowData) data.push(rowData);
        }
        return data;
    }

    /**
     * Добавить новую строку
     */
    async addRow(rowData = null) {
        if (!this.api) return;
        
        const newRow = rowData || {
            post: 1,
            op_number: await this.getNextOpNumber(),
            name: 'Новая операция',
            labor_hours: 0,
            people_count: 1,
            duration: 0,
            status: 'pending',
            time_reserve: 0,
            prev_ops: [],
            next_ops: []
        };
        
        try {
            const created = await this.api.post('/operations', newRow);
            await this.loadData();
            return created;
        } catch (error) {
            console.error('Failed to create operation:', error);
            throw error;
        }
    }

    /**
     * Удалить выбранные строки
     */
    async deleteSelected() {
        const selected = this.getSelectedData();
        if (selected.length === 0) return;
        
        if (!confirm(`Удалить ${selected.length} операций?`)) return;
        
        const ids = selected.map(op => op.id).filter(id => id);
        
        try {
            await this.api.post('/operations/batch-delete', ids);
            await this.loadData();
        } catch (error) {
            console.error('Failed to delete operations:', error);
            throw error;
        }
    }

    /**
     * Получить следующий номер операции
     */
    async getNextOpNumber() {
        if (!this.api) return 1000;
        
        try {
            const response = await this.api.get('/operations/all');
            const ops = response || [];
            const maxNum = ops.reduce((max, op) => Math.max(max, op.op_number || 0), 0);
            return maxNum + 1;
        } catch {
            return 1000;
        }
    }

    /**
     * Поиск
     */
    async search(query) {
        this.searchQuery = query;
        this.page = 1;
        await this.loadData();
    }

    /**
     * Фильтр по статусу
     */
    async filterByStatus(status) {
        this.statusFilter = status;
        this.page = 1;
        await this.loadData();
    }

    /**
     * Пагинация
     */
    async goToPage(page) {
        const totalPages = Math.ceil(this.total / this.pageSize);
        if (page < 1 || page > totalPages) return;
        
        this.page = page;
        await this.loadData();
    }

    async nextPage() {
        const totalPages = Math.ceil(this.total / this.pageSize);
        if (this.page < totalPages) {
            this.page++;
            await this.loadData();
        }
    }

    async prevPage() {
        if (this.page > 1) {
            this.page--;
            await this.loadData();
        }
    }

    updatePagination() {
        const totalPages = Math.ceil(this.total / this.pageSize);
        const pageInfo = document.getElementById('pageInfo');
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        
        if (pageInfo) {
            pageInfo.textContent = `Страница ${this.page} из ${totalPages} (всего ${this.total})`;
        }
        if (prevBtn) prevBtn.disabled = this.page <= 1;
        if (nextBtn) nextBtn.disabled = this.page >= totalPages;
    }

    /**
     * Экспорт в CSV/Excel
     */
    async exportData(format = 'xlsx') {
        if (!this.api) return;
        
        try {
            const url = `/operations/export?format=${format}`;
            window.open(`http://127.0.0.1:8000${url}`, '_blank');
        } catch (error) {
            console.error('Export failed:', error);
        }
    }

    /**
     * Импорт из Excel
     */
    async importFile(file) {
        if (!this.api) return;
        
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const response = await fetch('http://127.0.0.1:8000/operations/import', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            await this.loadData();
            return result;
        } catch (error) {
            console.error('Import failed:', error);
            throw error;
        }
    }

    /**
     * Обновить отображение
     */
    refresh() {
        if (this.hot) {
            this.hot.render();
        }
    }

    /**
     * Уничтожить
     */
    destroy() {
        if (this.hot) {
            this.hot.destroy();
            this.hot = null;
        }
    }
}