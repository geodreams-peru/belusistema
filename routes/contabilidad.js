const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const router  = express.Router();

// ── Base de datos propia del módulo ─────────────────────────────
const DB_PATH = path.join(__dirname, '..', 'data', 'contabilidad.db');
const db = new sqlite3.Database(DB_PATH, err => {
  if (err) { console.error('Contabilidad DB error:', err.message); return; }
  console.log('  ✓ contabilidad.db conectada');
  init();
});

function run(sql, p = []) {
  return new Promise((res, rej) => db.run(sql, p, function(e) { e ? rej(e) : res({ id: this.lastID, changes: this.changes }); }));
}
function get(sql, p = []) {
  return new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
}
function all(sql, p = []) {
  return new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
}

// DBs auxiliares para auto-cálculo de gastos
const comprasDb = new sqlite3.Database(path.join(__dirname, '..', 'data', 'compras.db'));
const asisDb    = new sqlite3.Database(path.join(__dirname, '..', 'data', 'asistencia.db'));
function allExt(extDb, sql, p = []) {
  return new Promise((res, rej) => extDb.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
}

function init() {
  db.run(`CREATE TABLE IF NOT EXISTS ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    efectivo REAL DEFAULT 0,
    tarjeta REAL DEFAULT 0,
    mixto_efectivo REAL DEFAULT 0,
    mixto_tarjeta REAL DEFAULT 0,
    total REAL NOT NULL,
    notas TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS gastos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    tipo TEXT NOT NULL,
    descripcion TEXT,
    monto REAL NOT NULL,
    notas TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // Agregar columna hora si no existe
  db.run(`ALTER TABLE ventas ADD COLUMN hora TEXT DEFAULT '12:12:12'`, () => {});
  db.run(`ALTER TABLE gastos ADD COLUMN hora TEXT DEFAULT '12:12:12'`, () => {});

  // ── Gastos fijos mensuales ──
  db.run(`CREATE TABLE IF NOT EXISTS gastos_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    valor_default REAL DEFAULT 0,
    origen TEXT DEFAULT 'manual',
    origen_param TEXT DEFAULT '',
    orden INTEGER DEFAULT 0
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS gastos_mensuales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    anio INTEGER NOT NULL,
    monto REAL DEFAULT 0,
    UNIQUE(item_id, mes, anio),
    FOREIGN KEY (item_id) REFERENCES gastos_items(id)
  )`);
  // Seed items si la tabla está vacía
  db.get('SELECT COUNT(*) AS c FROM gastos_items', (err, row) => {
    if (err || (row && row.c > 0)) return;
    const items = [
      ['ALQUILER EN DOLARES', 0, 'manual', '', 1],
      ['ALQUILER EN SOLES', 0, 'manual', '', 2],
      ['EPS RIMAC', 1722.8, 'manual', '', 3],
      ['SCTR SALUD', 0, 'manual', '', 4],
      ['SCTR PENSION', 0, 'manual', '', 5],
      ['SEGURO VIDA LEY', 0, 'manual', '', 6],
      ['RENTA 3ra', 0, 'manual', '', 7],
      ['DIVIDENDOS', 0, 'manual', '', 8],
      ['ESSALUD', 0, 'manual', '', 9],
      ['ONP', 0, 'manual', '', 10],
      ['FRACCIONAMIENTO', 0, 'manual', '', 11],
      ['LUZ DEL SUR', 0, 'manual', '', 12],
      ['CALIDDA', 0, 'manual', '', 13],
      ['AGUA', 0, 'manual', '', 14],
      ['CEL DE BELÚ', 0, 'manual', '', 15],
      ['HONORARIOS CONTADOR', 600, 'manual', '', 16],
      ['INTERNET', 99, 'manual', '', 17],
      ['TARJETA DE CREDITO', 0, 'manual', '', 18],
      ['CHANCHO LA LONJA', 0, 'compras', 'LA LONJA', 19],
      ['CHANCHO ELOY', 0, 'compras', 'ELOY', 20],
      ['TAMALES', 0, 'compras', 'TAMALES', 21],
      ['PAN', 0, 'compras', 'PAN,YONAMINE PAN', 22],
      ['CAFE TC', 0, 'compras', 'CAFE TC', 23],
      ['LECHE', 0, 'compras', 'LECHE LEONOR', 24],
      ['VERDURAS', 0, 'compras', 'Emilio,Cesar Verduras', 25],
      ['OTROS GASTOS EN GENERAL', 0, 'compras_otros', '', 26],
      ['SUELDO PERSONAL 1Q', 0, 'asistencia', '1', 27],
      ['SUELDO PERSONAL 2Q', 0, 'asistencia', '2', 28],
      ['SUELDO ADMIN 1', 5000, 'manual', '', 29],
      ['SUELDO ADMIN 2', 2800, 'manual', '', 30],
    ];
    const stmt = db.prepare('INSERT INTO gastos_items (nombre,valor_default,origen,origen_param,orden) VALUES (?,?,?,?,?)');
    items.forEach(i => stmt.run(i));
    stmt.finalize();
  });
}

// ── Middleware: requiere sesión con acceso a contabilidad ────────
function auth(req, res, next) {
  const u = req.session?.user;
  if (!u) return res.status(401).json({ error: 'No autenticado' });
  if (!u.modulos.includes('contabilidad')) return res.status(403).json({ error: 'Sin acceso' });
  next();
}
router.use(auth);

// ════════════════ VENTAS ════════════════

router.get('/ventas', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    let sql = 'SELECT * FROM ventas';
    const p = [];
    const cond = [];
    if (desde) { cond.push('fecha >= ?'); p.push(desde); }
    if (hasta) { cond.push('fecha <= ?'); p.push(hasta); }
    if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
    sql += ' ORDER BY fecha DESC';

    const ventas = await all(sql, p);
    const totales = ventas.reduce((acc, v) => {
      acc.total   += v.total;
      acc.efectivo += v.efectivo;
      acc.tarjeta  += v.tarjeta;
      acc.mixto    += v.mixto_efectivo + v.mixto_tarjeta;
      return acc;
    }, { total: 0, efectivo: 0, tarjeta: 0, mixto: 0 });

    res.json({ ok: true, ventas, totales });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ventas', async (req, res) => {
  try {
    const { fecha, efectivo = 0, tarjeta = 0, mixto_efectivo = 0, mixto_tarjeta = 0, notas } = req.body;
    if (!fecha) return res.status(400).json({ error: 'Fecha requerida' });
    const total = +efectivo + +tarjeta + +mixto_efectivo + +mixto_tarjeta;
    const hora = new Date().toTimeString().slice(0, 8);
    const r = await run(
      'INSERT INTO ventas (fecha,hora,efectivo,tarjeta,mixto_efectivo,mixto_tarjeta,total,notas) VALUES (?,?,?,?,?,?,?,?)',
      [fecha, hora, +efectivo, +tarjeta, +mixto_efectivo, +mixto_tarjeta, total, notas || null]
    );
    res.status(201).json({ ok: true, id: r.id, total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/ventas/:id', async (req, res) => {
  try {
    const { fecha, efectivo = 0, tarjeta = 0, mixto_efectivo = 0, mixto_tarjeta = 0, notas } = req.body;
    if (!fecha) return res.status(400).json({ error: 'Fecha requerida' });
    const total = +efectivo + +tarjeta + +mixto_efectivo + +mixto_tarjeta;
    const r = await run(
      'UPDATE ventas SET fecha=?,efectivo=?,tarjeta=?,mixto_efectivo=?,mixto_tarjeta=?,total=?,notas=? WHERE id=?',
      [fecha, +efectivo, +tarjeta, +mixto_efectivo, +mixto_tarjeta, total, notas || null, req.params.id]
    );
    if (!r.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true, total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/ventas/:id', async (req, res) => {
  try {
    const r = await run('DELETE FROM ventas WHERE id=?', [req.params.id]);
    if (!r.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════ GASTOS ════════════════

router.get('/gastos', async (req, res) => {
  try {
    const { desde, hasta, tipo } = req.query;
    let sql = 'SELECT * FROM gastos';
    const p = [];
    const cond = [];
    if (desde) { cond.push('fecha >= ?'); p.push(desde); }
    if (hasta) { cond.push('fecha <= ?'); p.push(hasta); }
    if (tipo)  { cond.push('tipo = ?');  p.push(tipo); }
    if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
    sql += ' ORDER BY fecha DESC';

    const gastos = await all(sql, p);
    const total = gastos.reduce((s, g) => s + g.monto, 0);
    const porTipo = gastos.reduce((acc, g) => {
      acc[g.tipo] = (acc[g.tipo] || 0) + g.monto;
      return acc;
    }, {});

    res.json({ ok: true, gastos, total, porTipo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/gastos', async (req, res) => {
  try {
    const { fecha, tipo, descripcion, monto, notas } = req.body;
    if (!fecha || !tipo || !monto) return res.status(400).json({ error: 'fecha, tipo y monto son requeridos' });
    const hora = new Date().toTimeString().slice(0, 8);
    const r = await run(
      'INSERT INTO gastos (fecha,hora,tipo,descripcion,monto,notas) VALUES (?,?,?,?,?,?)',
      [fecha, hora, tipo, descripcion || null, +monto, notas || null]
    );
    res.status(201).json({ ok: true, id: r.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/gastos/:id', async (req, res) => {
  try {
    const { fecha, tipo, descripcion, monto, notas } = req.body;
    if (!fecha || !tipo || !monto) return res.status(400).json({ error: 'fecha, tipo y monto son requeridos' });
    const r = await run(
      'UPDATE gastos SET fecha=?,tipo=?,descripcion=?,monto=?,notas=? WHERE id=?',
      [fecha, tipo, descripcion || null, +monto, notas || null, req.params.id]
    );
    if (!r.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/gastos/:id', async (req, res) => {
  try {
    const r = await run('DELETE FROM gastos WHERE id=?', [req.params.id]);
    if (!r.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════ BALANCE ════════════════

router.get('/balance', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const cond = [];
    const p = [];
    if (desde) { cond.push('fecha >= ?'); p.push(desde); }
    if (hasta) { cond.push('fecha <= ?'); p.push(hasta); }
    const where = cond.length ? ' WHERE ' + cond.join(' AND ') : '';

    const ventas = await all('SELECT * FROM ventas' + where + ' ORDER BY fecha DESC', p);
    const totalVentas = ventas.reduce((s, v) => s + v.total, 0);
    const igv         = totalVentas * 0.105;
    const ventasNetas = totalVentas - igv;

    // Gastos from new gastos_mensuales system + auto-calc from compras/asistencia
    let totalGastos = 0;
    const porTipo = {};
    if (desde) {
      const parts = desde.split('-');
      const mes = +parts[1];
      const anio = +parts[0];
      const mesStr = String(mes).padStart(2, '0');
      const ul = new Date(anio, mes, 0).getDate();
      const desdeMes = `${anio}-${mesStr}-01`;
      const hastaMes = `${anio}-${mesStr}-${String(ul).padStart(2, '0')}`;

      const items = await all('SELECT * FROM gastos_items ORDER BY orden');
      const valores = await all('SELECT * FROM gastos_mensuales WHERE mes = ? AND anio = ?', [mes, anio]);
      const valMap = {};
      valores.forEach(v => { valMap[v.item_id] = v.monto; });

      // Auto-calc: compras por proveedor
      let comprasMap = {};
      try {
        const comprasRows = await allExt(comprasDb,
          `SELECT proveedor as nombre, SUM(precio_final) as total FROM compras WHERE fecha >= ? AND fecha <= ? GROUP BY proveedor`,
          [desdeMes, hastaMes]);
        comprasRows.forEach(c => { comprasMap[c.nombre.toUpperCase().trim()] = +c.total || 0; });
      } catch(e) { /* compras DB not ready */ }

      // Auto-calc: sueldos por quincena
      // Simplified: sum from gastos_mensuales if saved, otherwise 0
      const provAsignados = new Set();
      items.filter(i => i.origen === 'compras').forEach(i => {
        (i.origen_param || '').split(',').forEach(p => provAsignados.add(p.trim().toUpperCase()));
      });

      items.forEach(item => {
        let monto;
        if (valMap[item.id] !== undefined) {
          monto = valMap[item.id];
        } else if (item.origen === 'compras') {
          const provs = (item.origen_param || '').split(',').map(p => p.trim().toUpperCase());
          monto = provs.reduce((s, p) => s + (comprasMap[p] || 0), 0);
        } else if (item.origen === 'compras_otros') {
          monto = 0;
          Object.entries(comprasMap).forEach(([prov, val]) => {
            if (!provAsignados.has(prov)) monto += val;
          });
        } else {
          monto = item.valor_default || 0;
        }
        totalGastos += +monto;
        const cat = item.origen === 'manual' ? item.nombre : item.origen;
        porTipo[cat] = (porTipo[cat] || 0) + +monto;
      });
    }

    const utilidad = totalVentas - totalGastos;
    const margen   = totalVentas > 0 ? ((utilidad / totalVentas) * 100).toFixed(1) : 0;

    res.json({ ok: true, totalVentas, igv, ventasNetas, totalGastos, utilidad, margen, porTipo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════ GASTOS ITEMS (FIJOS MENSUALES) ════════════════

router.get('/gastos-items', async (req, res) => {
  try {
    const items = await all('SELECT * FROM gastos_items ORDER BY orden');
    res.json({ ok: true, items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/gastos-items', async (req, res) => {
  try {
    const { nombre, valor_default = 0, origen = 'manual', origen_param = '' } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const maxOrden = (await get('SELECT MAX(orden) as m FROM gastos_items'))?.m || 0;
    const r = await run('INSERT INTO gastos_items (nombre,valor_default,origen,origen_param,orden) VALUES (?,?,?,?,?)',
      [nombre.trim(), +valor_default, origen, origen_param, maxOrden + 1]);
    res.status(201).json({ ok: true, id: r.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/gastos-items/:id', async (req, res) => {
  try {
    const { nombre, valor_default = 0, origen = 'manual', origen_param = '' } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const r = await run('UPDATE gastos_items SET nombre=?,valor_default=?,origen=?,origen_param=? WHERE id=?',
      [nombre.trim(), +valor_default, origen, origen_param, req.params.id]);
    if (!r.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/gastos-items/:id', async (req, res) => {
  try {
    await run('DELETE FROM gastos_mensuales WHERE item_id=?', [req.params.id]);
    const r = await run('DELETE FROM gastos_items WHERE id=?', [req.params.id]);
    if (!r.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Valores mensuales guardados ──
router.get('/gastos-mensual', async (req, res) => {
  try {
    const { mes, anio } = req.query;
    if (!mes || !anio) return res.status(400).json({ error: 'mes y anio requeridos' });
    const valores = await all('SELECT * FROM gastos_mensuales WHERE mes=? AND anio=?', [+mes, +anio]);
    res.json({ ok: true, valores });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/gastos-mensual', async (req, res) => {
  try {
    const { item_id, mes, anio, monto } = req.body;
    if (!item_id || !mes || !anio) return res.status(400).json({ error: 'item_id, mes y anio requeridos' });
    const existe = await get('SELECT id FROM gastos_mensuales WHERE item_id=? AND mes=? AND anio=?', [+item_id, +mes, +anio]);
    if (existe) {
      await run('UPDATE gastos_mensuales SET monto=? WHERE id=?', [+monto || 0, existe.id]);
    } else {
      await run('INSERT INTO gastos_mensuales (item_id,mes,anio,monto) VALUES (?,?,?,?)', [+item_id, +mes, +anio, +monto || 0]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
