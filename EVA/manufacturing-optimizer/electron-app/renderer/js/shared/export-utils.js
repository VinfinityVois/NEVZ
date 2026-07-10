/**
 * ================================================================
 * MANUFACTURING OPTIMIZER - УТИЛИТЫ ЭКСПОРТА
 * ================================================================
 */

/**
 * Экспорт данных в CSV
 */
export function exportToCSV(data, filename = 'export.csv') {
    if (!data || !data.length) {
        console.warn('Нет данных для экспорта');
        return;
    }
    
    // Получаем заголовки из первого объекта
    const headers = Object.keys(data[0]);
    
    // Создаём CSV строки
    const csvRows = [];
    
    // Заголовки
    csvRows.push(headers.join(','));
    
    // Данные
    for (const row of data) {
        const values = headers.map(header => {
            const value = row[header];
            // Экранируем запятые и кавычки
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value ?? '';
        });
        csvRows.push(values.join(','));
    }
    
    // Создаём и скачиваем файл
    const csvString = csvRows.join('\n');
    downloadFile(csvString, filename, 'text/csv;charset=utf-8;');
}

/**
 * Экспорт данных в JSON
 */
export function exportToJSON(data, filename = 'export.json') {
    const jsonString = JSON.stringify(data, null, 2);
    downloadFile(jsonString, filename, 'application/json');
}

/**
 * Экспорт данных в TXT
 */
export function exportToTXT(data, filename = 'export.txt') {
    let text;
    
    if (typeof data === 'string') {
        text = data;
    } else if (Array.isArray(data)) {
        text = data.map(item => {
            if (typeof item === 'object') {
                return Object.entries(item).map(([k, v]) => `${k}: ${v}`).join('\n');
            }
            return String(item);
        }).join('\n\n');
    } else if (typeof data === 'object') {
        text = Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n');
    } else {
        text = String(data);
    }
    
    downloadFile(text, filename, 'text/plain;charset=utf-8;');
}

/**
 * Скачивание файла
 */
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
}

/**
 * Копирование текста в буфер обмена
 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        console.error('Ошибка копирования:', error);
        
        // Fallback для старых браузеров
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        
        return true;
    }
}

/**
 * Генерация отчёта по операциям
 */
export function generateOperationsReport(operations, brigades) {
    const report = {
        generated_at: new Date().toISOString(),
        summary: {
            total_operations: operations.length,
            completed: operations.filter(op => op.status === 'completed').length,
            in_progress: operations.filter(op => op.status === 'in_progress').length,
            pending: operations.filter(op => op.status === 'pending').length,
            blocked: operations.filter(op => op.status === 'blocked').length
        },
        total_duration: operations.reduce((sum, op) => sum + (op.duration || 0), 0),
        total_labor_hours: operations.reduce((sum, op) => sum + (op.labor_hours || 0), 0),
        brigades_summary: brigades.map(b => ({
            name: b.name,
            load: b.current_load,
            capacity: b.max_capacity,
            efficiency: b.efficiency_rating
        })),
        operations: operations.map(op => ({
            number: op.op_number,
            name: op.name,
            status: op.status,
            duration: op.duration,
            labor: op.labor_hours,
            brigade: op.brigade_id
        }))
    };
    
    return report;
}

/**
 * Печать страницы
 */
export function printElement(element) {
    const printWindow = window.open('', '_blank');
    
    const styles = document.querySelectorAll('link[rel="stylesheet"], style');
    let stylesHtml = '';
    styles.forEach(style => {
        if (style.tagName === 'LINK') {
            stylesHtml += `<link rel="stylesheet" href="${style.href}">`;
        } else {
            stylesHtml += `<style>${style.innerHTML}</style>`;
        }
    });
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>Manufacturing Optimizer - Печать</title>
                ${stylesHtml}
                <style>
                    body { padding: 20px; background: white; }
                    .no-print { display: none; }
                </style>
            </head>
            <body>
                ${typeof element === 'string' ? element : element.outerHTML}
            </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
}