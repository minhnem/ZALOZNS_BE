/**
 * Utility: Excel Helper
 * Hỗ trợ trích xuất dữ liệu linh hoạt và chuẩn hóa ngày tháng từ file Excel
 */

// Làm sạch key để so khớp không phân biệt dấu, khoảng trắng, gạch nối, hoa/thường
export function cleanKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[\s\-_.,;:()/*]/g, '');
}

// Trích xuất giá trị ô linh hoạt theo nhiều tên cột có thể có
export function getCellValue(row, ...keys) {
  if (!row || typeof row !== 'object') return '';
  const rowKeys = Object.keys(row);
  for (const expected of keys) {
    const cleanExp = cleanKey(expected);
    for (const actual of rowKeys) {
      if (cleanKey(actual) === cleanExp) {
        const val = row[actual];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return val;
        }
      }
    }
  }
  return '';
}

// Chuyển đổi ngày tháng từ Excel (số serial, chuỗi DD/MM/YYYY, YYYY-MM-DD, hoặc Date)
export function parseExcelDate(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? null : dateVal;
  
  if (typeof dateVal === 'number') {
    // Excel serial number (ngày tính từ 1899-12-30)
    const utcDays = Math.round(dateVal - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    return isNaN(dateInfo.getTime()) ? null : dateInfo;
  }
  
  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    if (!trimmed) return null;

    // Định dạng DD/MM/YYYY hoặc DD-MM-YYYY hoặc DD.MM.YYYY
    const dmy = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (dmy) {
      const day = parseInt(dmy[1], 10);
      const month = parseInt(dmy[2], 10) - 1;
      const year = parseInt(dmy[3], 10);
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }

    // Định dạng YYYY-MM-DD
    const ymd = trimmed.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
    if (ymd) {
      const year = parseInt(ymd[1], 10);
      const month = parseInt(ymd[2], 10) - 1;
      const day = parseInt(ymd[3], 10);
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  
  return null;
}
