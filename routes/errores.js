const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path    = require('path');

const router = express.Router();

// ─── BASE DE DATOS ───────────────────────────────────────────────
const DB_PATH = path.join(__dirname, '../data/errores.db');
const db = new sqlite3.Database(DB_PATH, err => {
  if (err) { console.error('✗ errores.db error:', err.message); return; }
  console.log('  ✓ errores.db conectada');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS errores (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha       TEXT NOT NULL,
    nombre      TEXT NOT NULL,
    seccion     TEXT NOT NULL DEFAULT '',
    descripcion TEXT NOT NULL,
    solucion    TEXT DEFAULT '',
    resuelto    INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now','localtime'))
  )`);
  // Agregar columna hora si no existe
  db.run(`ALTER TABLE errores ADD COLUMN hora TEXT DEFAULT '12:12:12'`, () => {});
});

// ─── MIDDLEWARES ─────────────────────────────────────────────────
function auth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'No autenticado' });
  if (!req.session.user.modulos.includes('errores')) return res.status(403).json({ error: 'Sin acceso' });
  next();
}

// ─── HELPERS ─────────────────────────────────────────────────────
const run = (sql, p=[]) => new Promise((res,rej) => db.run(sql, p, function(e){ e ? rej(e) : res(this); }));
const all = (sql, p=[]) => new Promise((res,rej) => db.all(sql, p, (e,r) => e ? rej(e) : res(r)));
const get = (sql, p=[]) => new Promise((res,rej) => db.get(sql,  p, (e,r) => e ? rej(e) : res(r)));

// ─── RUTAS ───────────────────────────────────────────────────────

// GET /api/errores/stats
router.get('/stats', auth, async (req, res) => {
  try {
    const mes = new Date().toISOString().slice(0,7);
    const [total, sinResolver, porSeccion, ultimosMes] = await Promise.all([
      get('SELECT COUNT(*) as c FROM errores'),
      get('SELECT COUNT(*) as c FROM errores WHERE resuelto=0'),
      all(`SELECT seccion, COUNT(*) as qty FROM errores WHERE fecha LIKE ?
           GROUP BY seccion ORDER BY qty DESC`, [`${mes}%`]),
      get(`SELECT COUNT(*) as c FROM errores WHERE fecha LIKE ?`, [`${mes}%`])
    ]);
    res.json({ total: total.c, sinResolver: sinResolver.c, porSeccion, ultimosMes: ultimosMes.c });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/errores?desde=&hasta=&nombre=&seccion=&resuelto=
router.get('/', auth, async (req, res) => {
  try {
    const { desde, hasta, nombre, seccion, resuelto } = req.query;
    let sql = 'SELECT * FROM errores WHERE 1=1';
    const p = [];
    if (desde)              { sql += ' AND fecha >= ?'; p.push(desde); }
    if (hasta)              { sql += ' AND fecha <= ?'; p.push(hasta); }
    if (nombre)             { sql += ' AND LOWER(nombre) LIKE ?'; p.push(`%${nombre.toLowerCase()}%`); }
    if (seccion)            { sql += ' AND seccion = ?'; p.push(seccion); }
    if (resuelto !== undefined && resuelto !== '') { sql += ' AND resuelto = ?'; p.push(Number(resuelto)); }
    sql += ' ORDER BY fecha DESC, id DESC';
    const rows = await all(sql, p);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/errores
router.post('/', auth, async (req, res) => {
  try {
    const { fecha, nombre, seccion='', descripcion, solucion='' } = req.body;
    if (!fecha || !nombre || !descripcion)
      return res.status(400).json({ error: 'Campos requeridos: fecha, nombre, descripcion' });
    const hora = new Date().toTimeString().slice(0, 8);
    const r = await run(
      'INSERT INTO errores (fecha,hora,nombre,seccion,descripcion,solucion) VALUES (?,?,?,?,?,?)',
      [fecha, hora, nombre.trim(), seccion.trim(), descripcion.trim(), solucion.trim()]
    );
    res.json({ ok: true, id: r.lastID });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/errores/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { fecha, nombre, seccion, descripcion, solucion, resuelto } = req.body;
    await run(
      'UPDATE errores SET fecha=?,nombre=?,seccion=?,descripcion=?,solucion=?,resuelto=? WHERE id=?',
      [fecha, nombre.trim(), seccion?.trim()||'', descripcion.trim(), solucion?.trim()||'', resuelto?1:0, req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/errores/:id/resolver  (marcar como resuelto/pendiente)
router.patch('/:id/resolver', auth, async (req, res) => {
  try {
    const { resuelto, solucion='' } = req.body;
    await run('UPDATE errores SET resuelto=?,solucion=? WHERE id=?',
      [resuelto?1:0, solucion.trim(), req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/errores/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await run('DELETE FROM errores WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
