const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'data', 'contabilidad.db'));

db.all('SELECT COUNT(*) as total FROM ventas', (err, rows) => {
  console.log('=== TOTAL REGISTROS EN VENTAS ===');
  console.log(rows);
});

db.all('SELECT MIN(fecha) as min_fecha, MAX(fecha) as max_fecha FROM ventas', (err, rows) => {
  console.log('=== RANGO DE FECHAS ===');
  console.log(rows);
});

db.all('SELECT fecha, efectivo, tarjeta, mixto_efectivo, mixto_tarjeta, total FROM ventas ORDER BY fecha LIMIT 10', (err, rows) => {
  console.log('\n=== PRIMEROS 10 REGISTROS ===');
  rows.forEach(r => console.log(JSON.stringify(r)));
});

db.all('SELECT fecha, efectivo, tarjeta, mixto_efectivo, mixto_tarjeta, total FROM ventas ORDER BY fecha DESC LIMIT 10', (err, rows) => {
  console.log('\n=== ÚLTIMOS 10 REGISTROS ===');
  rows.forEach(r => console.log(JSON.stringify(r)));
});

db.close();
