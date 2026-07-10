/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - ПАРСЕР EXCEL (JAVASCRIPT)
 * ================================================================
 */

export class ExcelParser {
    constructor() {
        this.supportedFormats = ['.xlsx', '.xls', '.xlsm', '.csv'];
    }

    /**
     * Парсинг файла
     */
    async parseFile(file) {
        const extension = this.getFileExtension(file.name);
        
        if (!this.supportedFormats.includes(extension)) {
            throw new Error(`Неподдерживаемый формат: ${extension}`);
        }
        
        if (extension === '.csv') {
            return await this.parseCSV(file);
        } else {
            return await this.parseExcel(file);
        }
    }

    /**
     * Парсинг Excel
     */
    async parseExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                    
                    const operations = this.convertToOperations(jsonData);
                    resolve(operations);
                } catch (error) {
                    reject(new Error(`Ошибка парсинга Excel: ${error.message}`));
                }
            };
            
            reader.onerror = () => reject(new Error('Ошибка чтения файла'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Парсинг CSV
     */
    async parseCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const lines = text.split('\n');
                    const data = lines
                        .filter(line => line.trim())
                        .map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')));
                    
                    const operations = this.convertToOperations(data);
                    resolve(operations);
                } catch (error) {
                    reject(new Error(`Ошибка парсинга CSV: ${error.message}`));
                }
            };
            
            reader.onerror = () => reject(new Error('Ошибка чтения файла'));
            reader.readAsText(file, 'UTF-8');
        });
    }

    /**
     * Конвертация в операции
     */
    convertToOperations(rawData) {
        if (!rawData || rawData.length < 2) {
            throw new Error('Файл пуст или содержит только заголовки');
        }
        
        const headers = rawData[0];
        const rows = rawData.slice(1);
        const columnMap = this.detectColumns(headers);
        
        const operations = [];
        
        rows.forEach((row, index) => {
            if (row.length === 0 || row.every(cell => !cell)) return;
            
            try {
                const operation = {
                    id: operations.length + 1,
                    post: this.parseNumber(row[columnMap.post]),
                    op_number: this.parseNumber(row[columnMap.op_number]),
                    prev_ops: this.parseList(row[columnMap.prev_ops]),
                    next_ops: this.parseList(row[columnMap.next_ops]),
                    name: String(row[columnMap.name] || ''),
                    drawing: String(row[columnMap.drawing] || ''),
                    labor_hours: this.parseNumber(row[columnMap.labor_hours]) || 0,
                    people_count: this.parseNumber(row[columnMap.people_count]) || 1,
                    duration: this.parseNumber(row[columnMap.duration]) || 0,
                    brigade_id: this.parseNumber(row[columnMap.brigade_id]),
                    location: String(row[columnMap.location] || ''),
                    time_reserve: this.parseNumber(row[columnMap.time_reserve]) || 0,
                    status: 'pending'
                };
                
                operations.push(operation);
            } catch (error) {
                console.warn(`Ошибка в строке ${index + 2}:`, error);
            }
        });
        
        return operations;
    }

    /**
     * Определение колонок
     */
    detectColumns(headers) {
        const columnMap = {};
        
        const patterns = {
            post: ['пост', 'post', 'участок'],
            op_number: ['номер', 'операция', 'operation', 'op_number', '№'],
            prev_ops: ['предшеств', 'предыдущ', 'prev', 'previous'],
            next_ops: ['послед', 'следующ', 'next', 'following'],
            name: ['наименование', 'название', 'name', 'операция'],
            drawing: ['чертеж', 'чертёж', 'drawing'],
            labor_hours: ['трудоемкость', 'трудоёмкость', 'labor', 'труд'],
            people_count: ['человек', 'люди', 'people', 'кол-во'],
            duration: ['время', 'длительность', 'duration', 'time'],
            brigade_id: ['бригада', 'brigade'],
            location: ['место', 'расположение', 'location', 'цех'],
            time_reserve: ['резерв', 'запас', 'reserve', 'буфер']
        };
        
        headers.forEach((header, index) => {
            if (!header) return;
            
            const headerLower = String(header).toLowerCase();
            
            Object.entries(patterns).forEach(([key, patternList]) => {
                if (patternList.some(p => headerLower.includes(p))) {
                    columnMap[key] = index;
                }
            });
        });
        
        return columnMap;
    }

    /**
     * Парсинг числа
     */
    parseNumber(value) {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'number') return value;
        
        const normalized = String(value).replace(',', '.');
        const parsed = parseFloat(normalized);
        return isNaN(parsed) ? null : parsed;
    }

    /**
     * Парсинг списка
     */
    parseList(value) {
        if (!value) return [];
        if (typeof value === 'number') return [value];
        
        const str = String(value);
        const parts = str.split(/[,;\s]+/);
        
        return parts
            .map(p => parseInt(p.trim(), 10))
            .filter(n => !isNaN(n));
    }

    /**
     * Получение расширения файла
     */
    getFileExtension(filename) {
        const lastDot = filename.lastIndexOf('.');
        return lastDot === -1 ? '' : filename.substring(lastDot).toLowerCase();
    }

    /**
     * Экспорт операций в Excel
     */
    exportToExcel(operations, filename = 'operations.xlsx') {
        const headers = [
            'Пост', 'Номер операции', 'Номер предшеств.', 'Номер послед.',
            'Наименование операции', 'Чертеж', 'Трудоемкость', 'Кол-во человек',
            'Время', 'Бригада', 'Место проведения работ', 'Резерв операции'
        ];
        
        const rows = operations.map(op => [
            op.post || '',
            op.op_number || '',
            (op.prev_ops || []).join(', '),
            (op.next_ops || []).join(', '),
            op.name || '',
            op.drawing || '',
            op.labor_hours || 0,
            op.people_count || 1,
            op.duration || 0,
            op.brigade_id || '',
            op.location || '',
            op.time_reserve || 0
        ]);
        
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Операции');
        XLSX.writeFile(wb, filename);
    }
}