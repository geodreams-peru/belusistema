const XLSX = require('xlsx');
const path = require('path');

// Leer el Excel
const wb = XLSX.readFile(path.join(__dirname, 'belu19-23.xlsx'));

// Mostrar nombres de pestañas
console.log('=== PESTAÑAS DISPONIBLES ===');
console.log(wb.SheetNames);

// Buscar la pestaña CUENTAS
const sheetName = wb.SheetNames.find(n => n.toUpperCase().includes('CUENTA'));
if (!sheetName) {
  console.log('No se encontró pestaña CUENTAS');
  process.exit(1);
}

console.log(`\n=== Pestaña encontrada: "${sheetName}" ===`);
const ws = wb.Sheets[sheetName];

// Rango usado
const range = XLSX.utils.decode_range(ws['!ref']);
console.log(`Rango: ${ws['!ref']} (filas: ${range.e.r - range.s.r + 1}, cols: ${range.e.c - range.s.c + 1})`);

// Leer como JSON
const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
console.log(`\nTotal filas de datos: ${data.length}`);
console.log('\n=== COLUMNAS (headers) ===');
if (data.length > 0) console.log(Object.keys(data[0]));

// Primeras 15 filas
console.log('\n=== PRIMERAS 15 FILAS ===');
data.slice(0, 15).forEach((row, i) => console.log(`[${i}]`, JSON.stringify(row)));

// Últimas 5 filas
console.log('\n=== ÚLTIMAS 5 FILAS ===');
data.slice(-5).forEach((row, i) => console.log(`[${data.length - 5 + i}]`, JSON.stringify(row)));
