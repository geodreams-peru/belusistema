// Script de migración desde Google Sheet → bases SQLite de BELU_SYSTEM
// Descarga las pestañas Gastos, Ventas y Proveedores del Sheet y las importa
// con deduplicación (idempotente: puede ejecutarse varias veces sin duplicar).
//
// Uso: node migrate_from_sheet.js
//      node migrate_from_sheet.js --solo-compras
//      node migrate_from_sheet.js --solo-ventas

const https = require('https');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const SHEET_ID = '1WfgUNa-uhz-4N97FLg1uGaVXk91CDjm6cz5qROmkea0';

// --- Utilidades ---

function fetchCSV(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  return new Promise((resolve, reject) => {
    function doGet(u, redirects) {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doGet(res.headers.location, redirects + 1);
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode !== 200 || data.startsWith('<!')) {
            return reject(new Error(`HTTP ${res.statusCode} - no CSV`));
          }
          resolve(data);
        });
      }).on('error', reject);
    }
    doGet(url, 0);
  });
}

function parseCSV(text) {
  const rows = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = [];
    let inQuote = false, field = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') { inQuote = false; }
        else { field += ch; }
      } else {
        if (ch === '"') { inQuote = true; }
        else if (ch === ',') { row.push(field); field = ''; }
        else { field += ch; }
      }
    }
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Convierte "41,4" → 41.4 y "0" → 0
function parseNum(s) {
  if (!s || s.trim() === '') return 0;
  return parseFloat(s.replace(',', '.')) || 0;
}

function dbRun(db, sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function (err) { err ? rej(err) : res(this); }));
}
function dbGet(db, sql, params = []) {
  return new Promise((res, rej) => db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
}
function dbAll(db, sql, params = []) {
  return new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));
}

// --- Importar Compras (pestaña Gastos → compras.db) ---

async function importCompras() {
  console.log('\n=== COMPRAS (pestaña Gastos → compras.db) ===');
  console.log('Descargando pestaña Gastos del Sheet...');
  const csv = await fetchCSV('Gastos');
  const rows = parseCSV(csv);
  const header = rows[0];
  const data = rows.slice(1);
  console.log(`Filas descargadas: ${data.length}`);
  console.log(`Header: ${header.join(' | ')}`);

  // Guardar CSV local como backup
  fs.writeFileSync(path.resolve(__dirname, 'data/sheet_gastos.csv'), csv, 'utf8');

  const db = new sqlite3.Database(path.resolve(__dirname, 'data/compras.db'));

  const before = await dbGet(db, 'SELECT COUNT(*) as c FROM compras');
  console.log(`Registros antes: ${before.c}`);

  let inserted = 0, skipped = 0;
  for (const row of data) {
    const [id, fecha, proveedor, producto, pago, peso, precioUnit, precioFinal, nota] = row;
    if (!id || !fecha) { skipped++; continue; }

    // Deduplicar por ID
    const exists = await dbGet(db, 'SELECT 1 FROM compras WHERE id = ?', [id]);
    if (exists) { skipped++; continue; }

    await dbRun(db, `INSERT INTO compras (id, fecha, proveedor, producto, pago, peso, precio_unit, precio_final, nota)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, fecha, proveedor || '', producto || '', pago || 'Efectivo',
       parseNum(peso), parseNum(precioUnit), parseNum(precioFinal), nota || '']);
    inserted++;
  }

  const after = await dbGet(db, 'SELECT COUNT(*) as c FROM compras');
  const range = await dbGet(db, 'SELECT MIN(fecha) as minf, MAX(fecha) as maxf FROM compras');
  console.log(`Insertados: ${inserted} | Omitidos (duplicados/vacíos): ${skipped}`);
  console.log(`Registros después: ${after.c}`);
  console.log(`Rango fechas: ${range.minf} → ${range.maxf}`);

  db.close();
}

// --- Importar Ventas (pestaña Ventas → contabilidad.db) ---

async function importVentas() {
  console.log('\n=== VENTAS (pestaña Ventas → contabilidad.db) ===');
  console.log('Descargando pestaña Ventas del Sheet...');
  const csv = await fetchCSV('Ventas');
  const rows = parseCSV(csv);
  const header = rows[0];
  const data = rows.slice(1);
  console.log(`Filas descargadas: ${data.length}`);
  console.log(`Header: ${header.join(' | ')}`);

  fs.writeFileSync(path.resolve(__dirname, 'data/sheet_ventas.csv'), csv, 'utf8');

  const db = new sqlite3.Database(path.resolve(__dirname, 'data/contabilidad.db'));

  const before = await dbGet(db, 'SELECT COUNT(*) as c FROM ventas');
  console.log(`Registros antes: ${before.c}`);

  // Header: Fecha, Efectivo, Tarjeta, Yape, Mixto, IngresoExtra, GastoEfectivoCheck, Nota
  // DB:     fecha, efectivo, tarjeta, mixto_efectivo, mixto_tarjeta, total, notas
  let inserted = 0, skipped = 0;
  for (const row of data) {
    const [fecha, efectivo, tarjeta, yape, mixto, ingresoExtra, gastoCheck, nota] = row;
    if (!fecha) { skipped++; continue; }

    const efVal = parseNum(efectivo);
    const tarVal = parseNum(tarjeta);
    const yapeVal = parseNum(yape);
    const mixtoVal = parseNum(mixto);
    const total = efVal + tarVal + yapeVal + mixtoVal;

    // Deduplicar por fecha + total
    const exists = await dbGet(db,
      'SELECT 1 FROM ventas WHERE fecha = ? AND ABS(total - ?) < 0.01', [fecha, total]);
    if (exists) { skipped++; continue; }

    await dbRun(db, `INSERT INTO ventas (fecha, efectivo, tarjeta, mixto_efectivo, mixto_tarjeta, total, notas)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fecha, efVal, tarVal, yapeVal, mixtoVal, total, nota || '']);
    inserted++;
  }

  const after = await dbGet(db, 'SELECT COUNT(*) as c FROM ventas');
  const range = await dbGet(db, 'SELECT MIN(fecha) as minf, MAX(fecha) as maxf FROM ventas');
  console.log(`Insertados: ${inserted} | Omitidos (duplicados/vacíos): ${skipped}`);
  console.log(`Registros después: ${after.c}`);
  console.log(`Rango fechas: ${range.minf} → ${range.maxf}`);

  db.close();
}

// --- Main ---

(async () => {
  const args = process.argv.slice(2);
  const soloCompras = args.includes('--solo-compras');
  const soloVentas = args.includes('--solo-ventas');

  try {
    if (!soloVentas) await importCompras();
    if (!soloCompras) await importVentas();
    console.log('\n✓ Migración completada.');
  } catch (e) {
    console.error('\n✗ ERROR:', e.message);
    process.exitCode = 1;
  }
})();
