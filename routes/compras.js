const express  = require('express');
const sqlite3  = require('sqlite3').verbose();
const path     = require('path');
const fs       = require('fs');

const router = express.Router();

// ─── BASE DE DATOS ───────────────────────────────────────────────
const DB_PATH = path.join(__dirname, '../data/compras.db');
const db = new sqlite3.Database(DB_PATH, err => {
  if (err) { console.error('✗ compras.db error:', err.message); return; }
  console.log('  ✓ compras.db conectada');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS compras (
    id           TEXT PRIMARY KEY,
    fecha        TEXT NOT NULL,
    proveedor    TEXT NOT NULL,
    producto     TEXT NOT NULL,
    pago         TEXT NOT NULL DEFAULT 'Efectivo',
    peso         REAL DEFAULT 0,
    precio_unit  REAL DEFAULT 0,
    precio_final REAL NOT NULL,
    nota         TEXT DEFAULT '',
    pagado       INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS proveedores (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre  TEXT UNIQUE NOT NULL
  )`);

  // Agregar columna pagado si no existe (migración)
  db.run(`ALTER TABLE compras ADD COLUMN pagado INTEGER DEFAULT 0`, err => {
    if (!err) {
      // Marcar todos los existentes como pagados
      db.run(`UPDATE compras SET pagado = 1 WHERE pagado IS NULL OR pagado = 0`);
      console.log('  ✓ compras: columna pagado agregada, existentes marcados como pagados');
    }
  });

  // Agregar columna hora si no existe
  db.run(`ALTER TABLE compras ADD COLUMN hora TEXT DEFAULT '12:12:12'`, () => {});

  // Migrar proveedores existentes de compras a tabla proveedores
  db.run(`INSERT OR IGNORE INTO proveedores (nombre) SELECT DISTINCT proveedor FROM compras WHERE proveedor != ''`);
});

// ─── MIDDLEWARES ─────────────────────────────────────────────────
function auth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'No autenticado' });
  if (!req.session.user.modulos.includes('compras')) return res.status(403).json({ error: 'Sin acceso' });
  next();
}
function authAdmin(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'No autenticado' });
  if (!req.session.user.modulos.includes('compras')) return res.status(403).json({ error: 'Sin acceso' });
  if (!req.session.user.permisos?.compras_admin) return res.status(403).json({ error: 'Se requiere permiso admin' });
  next();
}

// ─── HELPERS ─────────────────────────────────────────────────────
const run  = (sql, p=[]) => new Promise((res,rej) => db.run(sql, p, function(e){ e ? rej(e) : res(this); }));
const all  = (sql, p=[]) => new Promise((res,rej) => db.all(sql, p, (e,r) => e ? rej(e) : res(r)));
const get  = (sql, p=[]) => new Promise((res,rej) => db.get(sql,  p, (e,r) => e ? rej(e) : res(r)));

// ─── IMPORTAR CSV (una sola vez) ─────────────────────────────────
const CSV_PATH = path.join(__dirname, '../data/compras_import.csv');
async function importarCSV() {
  try {
    const existing = await get('SELECT COUNT(*) as c FROM compras');
    if (existing.c > 0) return; // ya importado

    if (!fs.existsSync(CSV_PATH)) return;

    const lines = fs.readFileSync(CSV_PATH, 'utf8').split('\n');
    const stmt = db.prepare(`INSERT OR IGNORE INTO compras
      (id, fecha, proveedor, producto, pago, peso, precio_unit, precio_final, nota)
      VALUES (?,?,?,?,?,?,?,?,?)`);

    let ok = 0;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // parseo respetando comillas y comas dentro de strings
      const cols = [];
      let cur = '', inQuote = false;
      for (const ch of line) {
        if (ch === '"') { inQuote = !inQuote; }
        else if (ch === ',' && !inQuote) { cols.push(cur); cur = ''; }
        else cur += ch;
      }
      cols.push(cur);

      if (cols.length < 8) continue;
      const [id, fecha, proveedor, producto, pago, pesoRaw, precioUnitRaw, precioFinalRaw, ...notaParts] = cols;
      const nota = notaParts.join(',');

      const toFloat = s => parseFloat((s || '0').replace(',', '.')) || 0;

      stmt.run(
        id.trim(), fecha.trim(), proveedor.trim(), producto.trim(),
        pago.trim() || 'Efectivo',
        toFloat(pesoRaw), toFloat(precioUnitRaw), toFloat(precioFinalRaw),
        nota.trim()
      );
      ok++;
    }
    stmt.finalize();
    console.log(`  ✓ compras: ${ok} registros importados desde CSV`);
  } catch(e) {
    console.error('  ✗ Error importando CSV:', e.message);
  }
}
importarCSV();

// ─── RUTAS ───────────────────────────────────────────────────────

// GET /api/compras/dashboard?mes=YYYY-MM (opcional)
router.get('/dashboard', auth, async (req, res) => {
  try {
    const hoy  = new Date().toISOString().slice(0,10);
    const mes  = req.query.mes || hoy.slice(0,7); // YYYY-MM

    const [totalHoy, totalMes, topProvMes, porPago, ultimas] = await Promise.all([
      get(`SELECT COALESCE(SUM(precio_final),0) as total FROM compras WHERE fecha=?`, [hoy]),
      get(`SELECT COALESCE(SUM(precio_final),0) as total, COUNT(*) as qty FROM compras WHERE fecha LIKE ?`, [`${mes}%`]),
      all(`SELECT proveedor, SUM(precio_final) as total FROM compras WHERE fecha LIKE ?
           GROUP BY proveedor ORDER BY total DESC LIMIT 5`, [`${mes}%`]),
      all(`SELECT pago, SUM(precio_final) as total FROM compras WHERE fecha LIKE ?
           GROUP BY pago ORDER BY total DESC`, [`${mes}%`]),
      all(`SELECT * FROM compras WHERE fecha LIKE ? ORDER BY fecha DESC, hora DESC, created_at DESC LIMIT 10`, [`${mes}%`])
    ]);

    res.json({ totalHoy: totalHoy.total, totalMes: totalMes.total, qtyMes: totalMes.qty,
               topProvMes, porPago, ultimas });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/compras?desde=&hasta=&proveedor=&producto=&pago=
router.get('/', auth, async (req, res) => {
  try {
    const { desde, hasta, proveedor, producto, pago, limit = 500, offset = 0 } = req.query;
    let sql = 'SELECT * FROM compras WHERE 1=1';
    const p = [];
    if (desde)     { sql += ' AND fecha >= ?'; p.push(desde); }
    if (hasta)     { sql += ' AND fecha <= ?'; p.push(hasta); }
    if (proveedor) { sql += ' AND LOWER(proveedor) LIKE ?'; p.push(`%${proveedor.toLowerCase()}%`); }
    if (producto)  { sql += ' AND LOWER(producto)  LIKE ?'; p.push(`%${producto.toLowerCase()}%`); }
    if (pago)      { sql += ' AND pago = ?'; p.push(pago); }
    sql += ' ORDER BY fecha DESC, hora DESC, created_at DESC LIMIT ? OFFSET ?';
    p.push(Number(limit), Number(offset));

    const [rows, total] = await Promise.all([
      all(sql, p),
      get('SELECT COUNT(*) as c, COALESCE(SUM(precio_final),0) as s FROM compras WHERE 1=1' +
          (desde ? ' AND fecha >= ?' : '') + (hasta ? ' AND fecha <= ?' : '') +
          (proveedor ? ' AND LOWER(proveedor) LIKE ?' : '') +
          (producto  ? ' AND LOWER(producto)  LIKE ?' : '') +
          (pago ? ' AND pago = ?' : ''),
        p.slice(0, -2))
    ]);
    res.json({ rows, total: total.c, suma: total.s });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/compras
router.post('/', auth, async (req, res) => {
  try {
    const { fecha, proveedor, producto, pago='Efectivo', peso=0, precio_unit=0, precio_final, nota='', pagado=0 } = req.body;
    if (!fecha || !proveedor || !producto || precio_final === undefined)
      return res.status(400).json({ error: 'Campos requeridos: fecha, proveedor, producto, precio_final' });

    const id = Date.now().toString();
    const hora = new Date().toTimeString().slice(0, 8);
    await run(`INSERT INTO compras (id,fecha,hora,proveedor,producto,pago,peso,precio_unit,precio_final,nota,pagado)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, fecha, hora, proveedor.trim(), producto.trim(), pago, Number(peso), Number(precio_unit), Number(precio_final), nota.trim(), pagado ? 1 : 0]);

    // guardar proveedor si nuevo
    db.run(`INSERT OR IGNORE INTO proveedores (nombre) VALUES (?)`, [proveedor.trim()]);

    res.json({ ok: true, id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/compras/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { fecha, proveedor, producto, pago, peso, precio_unit, precio_final, nota, pagado } = req.body;
    await run(`UPDATE compras SET fecha=?,proveedor=?,producto=?,pago=?,peso=?,precio_unit=?,precio_final=?,nota=?,pagado=?
               WHERE id=?`,
      [fecha, proveedor.trim(), producto.trim(), pago, Number(peso), Number(precio_unit), Number(precio_final), nota||'', pagado ? 1 : 0, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/compras/:id/pagado
router.patch('/:id/pagado', auth, async (req, res) => {
  try {
    const { pagado } = req.body;
    await run(`UPDATE compras SET pagado=? WHERE id=?`, [pagado ? 1 : 0, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/compras/:id  (solo admin)
router.delete('/:id', authAdmin, async (req, res) => {
  try {
    await run('DELETE FROM compras WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/compras/proveedores  (lista del catálogo)
router.get('/proveedores', auth, async (req, res) => {
  try {
    const rows = await all(`SELECT id, nombre FROM proveedores ORDER BY nombre`);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/compras/proveedores  (crear proveedor)
router.post('/proveedores', auth, async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Nombre requerido' });
    await run(`INSERT INTO proveedores (nombre) VALUES (?)`, [nombre.trim()]);
    const row = await get(`SELECT id, nombre FROM proveedores WHERE nombre = ?`, [nombre.trim()]);
    res.json({ ok: true, proveedor: row });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Proveedor ya existe' });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/compras/proveedores/:id  (editar proveedor)
router.put('/proveedores/:id', auth, async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Nombre requerido' });
    const old = await get(`SELECT nombre FROM proveedores WHERE id = ?`, [req.params.id]);
    await run(`UPDATE proveedores SET nombre = ? WHERE id = ?`, [nombre.trim(), req.params.id]);
    // Actualizar nombre en compras existentes
    if (old) await run(`UPDATE compras SET proveedor = ? WHERE proveedor = ?`, [nombre.trim(), old.nombre]);
    res.json({ ok: true });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Proveedor ya existe' });
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/compras/proveedores/:id  (eliminar proveedor)
router.delete('/proveedores/:id', authAdmin, async (req, res) => {
  try {
    await run(`DELETE FROM proveedores WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/compras/productos  (para autocomplete)
router.get('/productos', auth, async (req, res) => {
  try {
    const rows = await all(`SELECT DISTINCT producto as nombre FROM compras ORDER BY producto`);
    res.json(rows.map(r => r.nombre));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/compras/resumen?desde=&hasta=  (agrupado por proveedor y producto)
router.get('/resumen', auth, async (req, res) => {
  try {
    const { desde, hasta, agrupar = 'proveedor' } = req.query;
    const p = [];
    let where = 'WHERE 1=1';
    if (desde) { where += ' AND fecha >= ?'; p.push(desde); }
    if (hasta) { where += ' AND fecha <= ?'; p.push(hasta); }

    const campo = agrupar === 'producto' ? 'producto' : 'proveedor';
    const rows = await all(
      `SELECT ${campo} as nombre, COUNT(*) as qty, SUM(precio_final) as total
       FROM compras ${where} GROUP BY ${campo} ORDER BY total DESC`, p);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
