/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - ИМПОРТ EXCEL
 * ================================================================
 */

export class ExcelImporter {
    constructor() {
        this.supportedFormats = ['.xlsx', '.xls', '.xlsm', '.csv'];
        this.maxFileSize = 10 * 1024 * 1024; // 10 MB
    }

    /**
     * Импорт файла
     */
    async importFile(file) {
        // Валидация файла
        const validation = this.validateFile(file);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // Определяем тип файла
        const extension = this.getFileExtension(file.name);
        
        try {
            let data;
            
            if (extension === '.csv') {
                data = await this.parseCSV(file);
            } else {
                data = await this.parseExcel(file);
            }
            
            // Преобразование в операции
            const operations = this.convertToOperations(data);
            
            // Валидация операций
            const validationResult = this.validateOperations(operations);
            if (!validationResult.valid) {
                throw new Error(`Ошибки валидации:\n${validationResult.errors.join('\n')}`);
            }
            
            return {
                success: true,
                count: operations.length,
                operations: operations,
                warnings: validationResult.warnings
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Валидация файла
     */
    validateFile(file) {
        if (!file) {
            return { valid: false, error: 'Файл не выбран' };
        }
        
        const extension = this.getFileExtension(file.name);
        if (!this.supportedFormats.includes(extension)) {
            return { 
                valid: false, 
                error: `Неподдерживаемый формат. Поддерживаются: ${this.supportedFormats.join(', ')}` 
            };
        }
        
        if (file.size > this.maxFileSize) {
            return { 
                valid: false, 
                error: `Файл слишком большой. Максимальный размер: ${this.maxFileSize / 1024 / 1024} MB` 
            };
        }
        
        return { valid: true };
    }

    /**
     * Парсинг Excel файла
     */
    async parseExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // Берём первый лист
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                    
                    resolve(jsonData);
                } catch (error) {
                    reject(new Error(`Ошибка парсинга Excel: ${error.message}`));
                }
            };
            
            reader.onerror = () => reject(new Error('Ошибка чтения файла'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Парсинг CSV файла
     */
    async parseCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const lines = text.split('\n');
                    const data = lines.map(line => 
                        line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))
                    );
                    resolve(data);
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
        
        // Первая строка - заголовки
        const headers = rawData[0];
        const rows = rawData.slice(1);
        
        // Маппинг колонок
        const columnMap = this.detectColumns(headers);
        
        const operations = [];
        const warnings = [];
        
        rows.forEach((row, index) => {
            if (row.length === 0 || row.every(cell => !cell)) {
                return; // Пропускаем пустые строки
            }
            
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
                warnings.push(`Строка ${index + 2}: ${error.message}`);
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
            op_number: ['номер операции', 'операция', 'operation', 'op_number'],
            prev_ops: ['предшеств', 'предыдущ', 'prev', 'previous'],
            next_ops: ['послед', 'следующ', 'next', 'following'],
            name: ['наименование', 'название', 'name', 'операция'],
            drawing: ['чертеж', 'чертёж', 'drawing'],
            labor_hours: ['трудоемкость', 'трудоёмкость', 'labor', 'труд'],
            people_count: ['человек', 'люди', 'people', 'кол-во'],
            duration: ['время', 'длительность', 'duration', 'time'],
            brigade_id: ['бригада', 'brigade', 'brigade_id'],
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
        
        // Проверяем обязательные колонки
        const required = ['op_number', 'name'];
        required.forEach(field => {
            if (columnMap[field] === undefined) {
                throw new Error(`Не найдена колонка: ${field}`);
            }
        });
        
        return columnMap;
    }

    /**
     * Парсинг числа
     */
    parseNumber(value) {
        if (value === null || value === undefined || value === '') {
            return null;
        }
        
        if (typeof value === 'number') return value;
        
        // Заменяем запятую на точку
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
        
        // Разделители: запятая, точка с запятой, пробел
        const parts = str.split(/[,;\s]+/);
        
        return parts
            .map(p => parseInt(p.trim(), 10))
            .filter(n => !isNaN(n));
    }

    /**
     * Валидация операций
     */
    validateOperations(operations) {
        const errors = [];
        const warnings = [];
        
        // Проверка уникальности номеров
        const numbers = new Set();
        operations.forEach((op, index) => {
            if (numbers.has(op.op_number)) {
                errors.push(`Дублирующийся номер операции: ${op.op_number}`);
            }
            numbers.add(op.op_number);
            
            // Проверка обязательных полей
            if (!op.name) {
                errors.push(`Операция ${op.op_number}: отсутствует название`);
            }
            
            if (op.people_count < 1 || op.people_count > 11) {
                warnings.push(`Операция ${op.op_number}: количество человек = ${op.people_count} (рекомендуется 1-11)`);
            }
            
            if (op.duration < 0) {
                errors.push(`Операция ${op.op_number}: отрицательная длительность`);
            }
            
            if (op.labor_hours < 0) {
                errors.push(`Операция ${op.op_number}: отрицательная трудоёмкость`);
            }
        });
        
        // Проверка связей
        operations.forEach(op => {
            op.next_ops?.forEach(nextId => {
                if (!numbers.has(nextId)) {
                    warnings.push(`Операция ${op.op_number}: ссылка на несуществующую операцию ${nextId}`);
                }
            });
        });
        
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Получение расширения файла
     */
    getFileExtension(filename) {
        const lastDot = filename.lastIndexOf('.');
        if (lastDot === -1) return '';
        return filename.substring(lastDot).toLowerCase();
    }

    /**
     * Генерация шаблона Excel
     */
    generateTemplate() {
        const headers = [
            'Пост', 'Номер операции', 'Номер предшеств.', 'Номер послед.',
            'Наименование операции', 'Чертеж', 'Трудоемкость', 'Кол-во человек',
            'Время', 'Бригада', 'Место проведения работ', 'Резерв операции'
        ];
        
        const exampleRow = [
            1, 101, '', '102, 103',
            'Подготовка материалов', 'МБ-001', 8, 2,
            4, 1, 'Цех 1', 0
        ];
        
        const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Операции');
        
        XLSX.writeFile(wb, 'template_operations.xlsx');
    }
}