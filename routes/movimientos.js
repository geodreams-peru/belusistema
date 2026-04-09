const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const router  = express.Router();

// ── DB propia del módulo ─────────────────────────────────────────
const DB_PATH = path.join(__dirname, '..', 'data', 'movimientos.db');
const db = new sqlite3.Database(DB_PATH, err => {
  if (err) { console.error('Movimientos DB error:', err.message); return; }
  console.log('  ✓ movimientos.db conectada');
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

function init() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS producto (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      precio REAL DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS compra (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      hora TEXT DEFAULT '',
      fecha_ingreso TEXT DEFAULT '',
      prov TEXT DEFAULT '',
      insumo TEXT NOT NULL,
      cant REAL DEFAULT 0,
      total REAL DEFAULT 0,
      nota TEXT DEFAULT ''
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS venta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      hora TEXT DEFAULT '',
      monto REAL DEFAULT 0,
      nota TEXT DEFAULT ''
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS movimiento (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      hora TEXT DEFAULT '',
      tipo TEXT DEFAULT 'Ingreso',
      producto_nombre TEXT NOT NULL,
      cant REAL DEFAULT 0,
      nota TEXT DEFAULT ''
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS gasto (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mes TEXT UNIQUE NOT NULL,
      agua REAL DEFAULT 0,
      luz REAL DEFAULT 0,
      personal REAL DEFAULT 0,
      otros REAL DEFAULT 0
    )`);
  });
}

// ── Auth middleware ──────────────────────────────────────────────
function auth(req, res, next) {
  const u = req.session?.user;
  if (!u) return res.status(401).json({ error: 'No autenticado' });
  if (!u.modulos.includes('movimientos')) return res.status(403).json({ error: 'Sin acceso' });
  next();
}
router.use(auth);

// Helper hora actual
const horaAhora = () => new Date().toTimeString().slice(0, 8);

// ════════════════ PRODUCTOS ════════════════

router.get('/productos', async (req, res) => {
  try {
    const productos = await all('SELECT * FROM producto ORDER BY nombre ASC');
    res.json({ ok: true, productos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/productos', async (req, res) => {
  try {
    const { id, nombre, precio } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    if (id) {
      await run('UPDATE producto SET nombre=?, precio=? WHERE id=?', [nombre, +precio || 0, id]);
    } else {
      const r = await run('INSERT INTO producto (nombre, precio) VALUES (?,?)', [nombre, +precio || 0]);
      return res.status(201).json({ ok: true, id: r.id });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/productos/:id', async (req, res) => {
  try {
    await run('DELETE FROM producto WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════ VENTAS ════════════════

router.get('/ventas', async (req, res) => {
  try {
    const { mes, desde, hasta } = req.query;
    let sql = 'SELECT * FROM venta';
    const p = [], cond = [];
    if (mes)   { cond.push("fecha LIKE ?"); p.push(mes + '%'); }
    if (desde) { cond.push("fecha >= ?");   p.push(desde); }
    if (hasta) { cond.push("fecha <= ?");   p.push(hasta); }
    if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
    sql += ' ORDER BY fecha DESC, hora DESC, id DESC';
    const ventas = await all(sql, p);
    const total  = ventas.reduce((s, v) => s + v.monto, 0);
    res.json({ ok: true, ventas, total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ventas', async (req, res) => {
  try {
    const { id, fecha, hora, monto, nota } = req.body;
    if (!fecha) return res.status(400).json({ error: 'Fecha requerida' });
    if (id) {
      await run('UPDATE venta SET fecha=?,hora=?,monto=?,nota=? WHERE id=?',
        [fecha, hora || horaAhora(), +monto || 0, nota || '', id]);
    } else {
      const r = await run('INSERT INTO venta (fecha,hora,monto,nota) VALUES (?,?,?,?)',
        [fecha, hora || horaAhora(), +monto || 0, nota || '']);
      return res.status(201).json({ ok: true, id: r.id });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/ventas/:id', async (req, res) => {
  try {
    await run('DELETE FROM venta WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════ COMPRAS ════════════════

router.get('/compras', async (req, res) => {
  try {
    const { mes, desde, hasta } = req.query;
    let sql = 'SELECT * FROM compra';
    const p = [], cond = [];
    if (mes)   { cond.push("fecha LIKE ?"); p.push(mes + '%'); }
    if (desde) { cond.push("fecha >= ?");   p.push(desde); }
    if (hasta) { cond.push("fecha <= ?");   p.push(hasta); }
    if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
    sql += ' ORDER BY fecha DESC, hora DESC, id DESC';
    const compras = await all(sql, p);
    const total   = compras.reduce((s, c) => s + c.total, 0);
    res.json({ ok: true, compras, total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/compras', async (req, res) => {
  try {
    const { id, fecha, hora, fecha_ingreso, prov, insumo, cant, total, nota, items } = req.body;
    if (!fecha) return res.status(400).json({ error: 'Fecha requerida' });
    if (id) {
      if (!insumo) return res.status(400).json({ error: 'Insumo requerido para editar' });
      await run('UPDATE compra SET fecha=?,hora=?,fecha_ingreso=?,prov=?,insumo=?,cant=?,total=?,nota=? WHERE id=?',
        [fecha, hora || horaAhora(), fecha_ingreso || '', prov || '', insumo, +cant || 0, +total || 0, nota || '', id]);
    } else {
      if (Array.isArray(items) && items.length) {
        const ids = [];
        for (const item of items) {
          if (!item?.insumo) continue;
          const r = await run('INSERT INTO compra (fecha,hora,fecha_ingreso,prov,insumo,cant,total,nota) VALUES (?,?,?,?,?,?,?,?)',
            [fecha, hora || horaAhora(), fecha_ingreso || '', prov || '', item.insumo, +item.cant || 0, +item.total || 0, item.nota || '']);
          ids.push(r.id);
        }
        return res.status(201).json({ ok: true, ids });
      }
      if (!insumo) return res.status(400).json({ error: 'Insumo requerido' });
      const r = await run('INSERT INTO compra (fecha,hora,fecha_ingreso,prov,insumo,cant,total,nota) VALUES (?,?,?,?,?,?,?,?)',
        [fecha, hora || horaAhora(), fecha_ingreso || '', prov || '', insumo, +cant || 0, +total || 0, nota || '']);
      return res.status(201).json({ ok: true, id: r.id });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/compras/:id', async (req, res) => {
  try {
    await run('DELETE FROM compra WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════ MOVIMIENTOS ════════════════

router.get('/movimientos', async (req, res) => {
  try {
    const { mes, desde, hasta } = req.query;
    let sql = 'SELECT * FROM movimiento';
    const p = [], cond = [];
    if (mes)   { cond.push("fecha LIKE ?"); p.push(mes + '%'); }
    if (desde) { cond.push("fecha >= ?");   p.push(desde); }
    if (hasta) { cond.push("fecha <= ?");   p.push(hasta); }
    if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
    sql += ' ORDER BY fecha DESC, hora DESC, id DESC';

    const [movimientos, productos] = await Promise.all([
      all(sql, p),
      all('SELECT * FROM producto')
    ]);

    const precios = {};
    productos.forEach(p => { precios[p.nombre] = p.precio; });

    // Enriquecer con valor monetario y resumen por producto
    const resumen = {};
    const movData = movimientos.map(m => {
      const precio = precios[m.producto_nombre] || 0;
      const valor  = +(m.cant * precio).toFixed(2);
      const prod   = m.producto_nombre || 'Sin nombre';
      if (!resumen[prod]) resumen[prod] = { ingreso: 0, devolucion: 0, val_ingreso: 0, val_devolucion: 0 };
      if (m.tipo === 'Devolución') {
        resumen[prod].devolucion    += m.cant;
        resumen[prod].val_devolucion += valor;
      } else {
        resumen[prod].ingreso    += m.cant;
        resumen[prod].val_ingreso += valor;
      }
      return { ...m, valor };
    });

    res.json({ ok: true, movimientos: movData, resumen, precios });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/movimientos', async (req, res) => {
  try {
    const { id, fecha, hora, tipo, producto_nombre, cant, nota } = req.body;
    if (!fecha || !producto_nombre) return res.status(400).json({ error: 'Fecha y producto requeridos' });
    if (id) {
      await run('UPDATE movimiento SET fecha=?,hora=?,tipo=?,producto_nombre=?,cant=?,nota=? WHERE id=?',
        [fecha, hora || horaAhora(), tipo || 'Ingreso', producto_nombre, +cant || 0, nota || '', id]);
    } else {
      const r = await run('INSERT INTO movimiento (fecha,hora,tipo,producto_nombre,cant,nota) VALUES (?,?,?,?,?,?)',
        [fecha, hora || horaAhora(), tipo || 'Ingreso', producto_nombre, +cant || 0, nota || '']);
      return res.status(201).json({ ok: true, id: r.id });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/movimientos/:id', async (req, res) => {
  try {
    await run('DELETE FROM movimiento WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════ GASTOS MENSUALES ════════════════

router.get('/gastos', async (req, res) => {
  try {
    const mes = req.query.mes || new Date().toISOString().slice(0, 7);
    const g   = await get('SELECT * FROM gasto WHERE mes=?', [mes]);
    res.json({ ok: true, gasto: g || { mes, agua: 0, luz: 0, personal: 0, otros: 0 } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/gastos', async (req, res) => {
  try {
    const { mes, agua = 0, luz = 0, personal = 0, otros = 0 } = req.body;
    if (!mes) return res.status(400).json({ error: 'Mes requerido (YYYY-MM)' });
    const existe = await get('SELECT id FROM gasto WHERE mes=?', [mes]);
    if (existe) {
      await run('UPDATE gasto SET agua=?,luz=?,personal=?,otros=? WHERE mes=?',
        [+agua, +luz, +personal, +otros, mes]);
    } else {
      await run('INSERT INTO gasto (mes,agua,luz,personal,otros) VALUES (?,?,?,?,?)',
        [mes, +agua, +luz, +personal, +otros]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════ BALANCE MENSUAL ════════════════

router.get('/balance', async (req, res) => {
  try {
    const mes = req.query.mes || new Date().toISOString().slice(0, 7);

    const [ventas, compras, movs, gasto, productos] = await Promise.all([
      all("SELECT * FROM venta WHERE fecha LIKE ?",     [mes + '%']),
      all("SELECT * FROM compra WHERE fecha LIKE ?",    [mes + '%']),
      all("SELECT * FROM movimiento WHERE fecha LIKE ?", [mes + '%']),
      get('SELECT * FROM gasto WHERE mes=?',            [mes]),
      all('SELECT * FROM producto')
    ]);

    const precios = {};
    productos.forEach(p => { precios[p.nombre] = p.precio; });

    const totalVentas  = ventas.reduce((s, v) => s + v.monto, 0);
    const totalCompras = compras.reduce((s, c) => s + c.total, 0);
    const comision     = totalVentas * 0.25;
    const totalGastos  = gasto ? gasto.agua + gasto.luz + gasto.personal + gasto.otros : 0;

    const valorMovs = movs.reduce((s, m) => {
      const v = m.cant * (precios[m.producto_nombre] || 0);
      return s + (m.tipo === 'Devolución' ? -v : v);
    }, 0);

    const utilidad = totalVentas - totalCompras - valorMovs - comision - totalGastos;

    // KPIs
    const ventasPorDia = {};
    ventas.forEach(v => { ventasPorDia[v.fecha] = (ventasPorDia[v.fecha] || 0) + v.monto; });
    const mejorDia     = Object.entries(ventasPorDia).sort((a, b) => b[1] - a[1])[0];

    const ingresosPorProd = {};
    movs.filter(m => m.tipo !== 'Devolución').forEach(m => {
      ingresosPorProd[m.producto_nombre] = (ingresosPorProd[m.producto_nombre] || 0) + m.cant;
    });
    const topProd = Object.entries(ingresosPorProd).sort((a, b) => b[1] - a[1])[0];

    res.json({
      ok: true, mes, totalVentas, totalCompras, valorMovs, comision, totalGastos, utilidad,
      gasto: gasto || { agua: 0, luz: 0, personal: 0, otros: 0 },
      kpi: {
        mejorDiaFecha: mejorDia?.[0] || '—',
        mejorDiaMonto: mejorDia?.[1] || 0,
        topProducto:   topProd?.[0] || '—',
        topProductoCant: topProd?.[1] || 0
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
