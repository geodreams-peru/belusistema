/**
 * migrate_excel_ventas.js
 * Importa los datos de la pestaña "cuentas" del Excel belu19-23.xlsx
 * hacia la tabla ventas de contabilidad.db
 *
 * Uso:
 *   node migrate_excel_ventas.js          → modo preview (no escribe nada)
 *   node migrate_excel_ventas.js --run    → ejecuta la migración
 */

const XLSX    = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const path    = require('path');

// ── Rutas ──
const EXCEL_PATH = path.join(__dirname, 'belu19-23.xlsx');
const DB_PATH    = path.join(__dirname, 'data', 'contabilidad.db');
const DRY_RUN    = !process.argv.includes('--run');

// ── Helpers ──
function excelDateToISO(serial) {
  // Excel: día 1 = 1900-01-01 (con bug leap-year 1900)
  const epoch = new Date(1899, 11, 30); // 1899-12-30
  const date  = new Date(epoch.getTime() + serial * 86400000);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

// ── Leer Excel ──
console.log('Leyendo Excel…');
const wb = XLSX.readFile(EXCEL_PATH);
const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('cuenta'));
if (!sheetName) { console.error('No se encontró pestaña CUENTAS'); process.exit(1); }

const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
console.log(`  Pestaña: "${sheetName}" — ${rows.length} filas`);

// ── Procesar filas ──
const registros = [];
let saltados = 0;

for (const row of rows) {
  const fechaRaw = row['FECHA'];
  if (!fechaRaw || typeof fechaRaw !== 'number') { saltados++; continue; }

  const fecha          = excelDateToISO(fechaRaw);
  const efectivo       = toNum(row[' EFECTIVO ']);
  const tarjeta        = toNum(row[' TARJETA ']);
  const mixto_efectivo = toNum(row[' MIXTO EFECTIVO ']);
  const mixto_tarjeta  = toNum(row[' MIXTO TARJETA ']);
  const total          = +(efectivo + tarjeta + mixto_efectivo + mixto_tarjeta).toFixed(2);

  registros.push({ fecha, efectivo, tarjeta, mixto_efectivo, mixto_tarjeta, total });
}

console.log(`  Registros válidos: ${registros.length}`);
console.log(`  Filas saltadas (sin fecha numérica): ${saltados}`);
console.log(`  Rango: ${registros[0]?.fecha} → ${registros[registros.length - 1]?.fecha}`);

// ── Preview ──
if (DRY_RUN) {
  console.log('\n═══ MODO PREVIEW (no se escribió nada) ═══');
  console.log('Primeros 5 registros:');
  registros.slice(0, 5).forEach(r => console.log(' ', JSON.stringify(r)));
  console.log('Últimos 5 registros:');
  registros.slice(-5).forEach(r => console.log(' ', JSON.stringify(r)));
  console.log(`\nPara ejecutar la migración real:\n  node migrate_excel_ventas.js --run`);
  process.exit(0);
}

// ── Insertar en BD ──
console.log('\n═══ EJECUTANDO MIGRACIÓN ═══');
const db = new sqlite3.Database(DB_PATH);

// Verificar que no haya duplicados por fecha
db.all('SELECT fecha FROM ventas', [], (err, existing) => {
  if (err) { console.error('Error leyendo BD:', err.message); process.exit(1); }

  const existingDates = new Set(existing.map(r => r.fecha));
  const nuevos = registros.filter(r => !existingDates.has(r.fecha));
  const duplicados = registros.length - nuevos.length;

  console.log(`  Registros nuevos a insertar: ${nuevos.length}`);
  console.log(`  Fechas que ya existen (se omiten): ${duplicados}`);

  if (nuevos.length === 0) {
    console.log('  Nada que insertar.');
    db.close();
    return;
  }

  db.serialize(() => {
    const stmt = db.prepare(
      `INSERT INTO ventas (fecha, hora, efectivo, tarjeta, mixto_efectivo, mixto_tarjeta, total, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let inserted = 0;
    for (const r of nuevos) {
      stmt.run(
        r.fecha,
        '12:00:00',
        r.efectivo,
        r.tarjeta,
        r.mixto_efectivo,
        r.mixto_tarjeta,
        r.total,
        'Importado desde Excel belu19-23.xlsx',
        function (err) {
          if (err) console.error(`  ✗ Error en ${r.fecha}:`, err.message);
          else inserted++;
        }
      );
    }

    stmt.finalize(() => {
      console.log(`\n  ✓ ${inserted} registros insertados correctamente`);
      db.close(() => {
        console.log('  ✓ Base de datos cerrada');
      });
    });
  });
});
