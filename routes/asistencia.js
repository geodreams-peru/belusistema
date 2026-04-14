const express    = require('express');
const sqlite3    = require('sqlite3').verbose();
const path       = require('path');
const multer     = require('multer');
const cron       = require('node-cron');
const nodemailer = require('nodemailer');
const { DateTime } = require('luxon');
const fs         = require('fs');
const router     = express.Router();

// ── Config ───────────────────────────────────────────────────────
const TZ = 'America/Lima';
const DB_PATH    = path.join(__dirname, '..', 'data', 'asistencia.db');
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'fotos');
const CARGOS     = ['Mozo/Azafata', 'Ayudante de cocina', 'Planchero', 'Armado', 'Caja', 'Admin'];
const FOTOS_ASIST_DIR = path.join(__dirname, '..', 'uploads', 'fotos_asistencia');
const RESPALDO_DESTINO = 'beluchicharroneria@gmail.com';
const RESPALDO_HORA = '18:00';
const RESPALDO_DB_FILES = ['asistencia.db', 'compras.db', 'contabilidad.db', 'errores.db', 'movimientos.db'];
fs.mkdirSync(FOTOS_ASIST_DIR, { recursive: true });

// ── DB ───────────────────────────────────────────────────────────
const db = new sqlite3.Database(DB_PATH, err => {
  if (err) { console.error('Asistencia DB error:', err.message); return; }
  console.log('  ✓ asistencia.db conectada');
  initDB();
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

function initDB() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS empleados (
      id INTEGER PRIMARY KEY,
      documento VARCHAR(20) NOT NULL UNIQUE,
      tipo_doc VARCHAR(10) NOT NULL DEFAULT 'DNI',
      nombre VARCHAR(100) NOT NULL,
      apellido VARCHAR(100) NOT NULL,
      cargo VARCHAR(80) DEFAULT '',
      celular VARCHAR(20) DEFAULT '',
      email VARCHAR(120) DEFAULT '',
      foto VARCHAR(200) DEFAULT '',
      onp BOOLEAN DEFAULT 0,
      activo BOOLEAN DEFAULT 1,
      nota_baja VARCHAR(500) DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS registros (
      id INTEGER PRIMARY KEY,
      empleado_id INTEGER NOT NULL,
      fecha DATE NOT NULL,
      hora_entrada DATETIME,
      hora_salida DATETIME,
      observacion VARCHAR(200) DEFAULT '',
      FOREIGN KEY (empleado_id) REFERENCES empleados(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY,
      tabla VARCHAR(50),
      registro_id INTEGER,
      accion VARCHAR(40),
      detalle VARCHAR(500),
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS configuracion (
      id INTEGER PRIMARY KEY,
      sueldo_minimo FLOAT DEFAULT 1025.0,
      hora_ingreso VARCHAR(5) DEFAULT '06:30',
      tolerancia_min INTEGER DEFAULT 5,
      descuento_tardanza FLOAT DEFAULT 2.0,
      email_smtp VARCHAR(100) DEFAULT 'smtp.gmail.com',
      email_puerto INTEGER DEFAULT 587,
      email_usuario VARCHAR(120) DEFAULT '',
      email_password VARCHAR(200) DEFAULT '',
      email_activo BOOLEAN DEFAULT 0,
      backup_diario_activo BOOLEAN DEFAULT 0,
      backup_diario_ultimo_envio VARCHAR(10) DEFAULT ''
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS sueldo_ajustes (
      id INTEGER PRIMARY KEY,
      empleado_id INTEGER NOT NULL,
      periodo_desde DATE NOT NULL,
      periodo_hasta DATE NOT NULL,
      feriados INTEGER DEFAULT 0,
      prestamo FLOAT DEFAULT 0.0,
      bono FLOAT DEFAULT 0.0,
      nota TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (empleado_id) REFERENCES empleados(id)
    )`);
    db.run(`ALTER TABLE sueldo_ajustes ADD COLUMN nota TEXT DEFAULT ""`, () => {}); // ignorar si ya existe
    db.run(`ALTER TABLE registros ADD COLUMN foto_entrada TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE registros ADD COLUMN foto_salida TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE configuracion ADD COLUMN backup_diario_activo BOOLEAN DEFAULT 0`, () => {});
    db.run(`ALTER TABLE configuracion ADD COLUMN backup_diario_ultimo_envio VARCHAR(10) DEFAULT ''`, () => {});
    db.run(`INSERT OR IGNORE INTO configuracion (id) VALUES (1)`);
  });
}

// ── Guardar foto de asistencia ───────────────────────────────────
function saveAsistPhoto(doc, fecha, tipo, base64Data) {
  if (!base64Data) return '';
  try {
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const filename = `${doc}_${fecha}_${tipo}.jpg`;
    const filepath = path.join(FOTOS_ASIST_DIR, filename);
    fs.writeFileSync(filepath, buffer);
    return filename;
  } catch (e) {
    console.error('Error guardando foto asistencia:', e.message);
    return '';
  }
}

// ── Helpers de fecha ─────────────────────────────────────────────
const nowLima = () => DateTime.now().setZone(TZ);
const hoyISO  = () => nowLima().toISODate();
const ahoraSQL = () => nowLima().toFormat('yyyy-LL-dd HH:mm:ss');

function getRespaldoAdjuntos() {
  const faltantes = [];
  const attachments = RESPALDO_DB_FILES.flatMap(filename => {
    const filePath = path.join(__dirname, '..', 'data', filename);
    if (!fs.existsSync(filePath)) {
      faltantes.push(filename);
      return [];
    }
    return [{ filename, path: filePath }];
  });
  return { attachments, faltantes };
}

function createMailTransport(cfg) {
  if (!cfg?.email_activo) throw new Error('Email desactivado en Configuración.');
  if (!cfg?.email_usuario || !cfg?.email_password) throw new Error('Faltan credenciales SMTP.');

  return nodemailer.createTransport({
    host: cfg.email_smtp,
    port: +cfg.email_puerto,
    secure: +cfg.email_puerto === 465,
    auth: { user: cfg.email_usuario, pass: cfg.email_password }
  });
}

async function enviarCorreoRespaldo({ prueba = false } = {}) {
  const cfg = await get('SELECT * FROM configuracion WHERE id=1');

  if (!prueba && !cfg?.backup_diario_activo) {
    return { skipped: true, reason: 'Respaldo diario desactivado.' };
  }

  const { attachments, faltantes } = getRespaldoAdjuntos();
  if (faltantes.length) {
    throw new Error(`Faltan archivos .db: ${faltantes.join(', ')}`);
  }

  const transporter = createMailTransport(cfg);
  const fecha = hoyISO();
  const subject = prueba
    ? `BELÚ SYSTEM — Prueba respaldo DB ${fecha}`
    : `BELÚ SYSTEM — Respaldo diario DB ${fecha}`;

  await transporter.sendMail({
    from: cfg.email_usuario,
    to: RESPALDO_DESTINO,
    subject,
    text: prueba
      ? 'Prueba de respaldo diario. Se adjuntan las 5 bases de datos del sistema.'
      : 'Respaldo diario. Se adjuntan las 5 bases de datos del sistema.',
    attachments
  });

  if (!prueba) {
    await run('UPDATE configuracion SET backup_diario_ultimo_envio=? WHERE id=1', [fecha]);
  }

  await audit('configuracion', 1, prueba ? 'correo_respaldo_prueba' : 'correo_respaldo_diario',
    `${prueba ? 'Prueba enviada' : 'Respaldo enviado'} a ${RESPALDO_DESTINO} con ${attachments.length} adjuntos.`);

  return { ok: true, destino: RESPALDO_DESTINO, archivos: attachments.map(a => a.filename), fecha };
}

function weekday(dt) { return (dt.weekday + 6) % 7; } // 0=Lun..6=Dom

function periodoParams(anio, mes, quincena) {
  const hoy = nowLima();
  anio     = +anio     || hoy.year;
  mes      = +mes      || hoy.month;
  quincena = +quincena || (hoy.day <= 15 ? 1 : 2);
  const desde = DateTime.fromObject({ year: anio, month: mes, day: quincena === 1 ? 1 : 16 }, { zone: TZ });
  const hasta  = quincena === 1
    ? DateTime.fromObject({ year: anio, month: mes, day: 15 }, { zone: TZ })
    : DateTime.fromObject({ year: anio, month: mes, day: 1 }, { zone: TZ }).endOf('month').startOf('day');
  return { anio, mes, quincena, desde: desde.toISODate(), hasta: hasta.toISODate() };
}

function duracion(entrada, salida) {
  if (!entrada || !salida) return '—';
  const e = DateTime.fromSQL(entrada, { zone: TZ });
  const s = DateTime.fromSQL(salida,  { zone: TZ });
  if (!e.isValid || !s.isValid) return '—';
  const seg = Math.max(0, s.diff(e, 'seconds').seconds);
  const h   = Math.floor(seg / 3600);
  const m   = Math.floor((seg % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

// ── Multer (fotos) ───────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const doc = String(req.body.documento || '').trim();
    const ext = file.originalname.split('.').pop().toLowerCase();
    cb(null, `${doc}.${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['png','jpg','jpeg','webp'].includes(file.originalname.split('.').pop().toLowerCase());
    cb(null, ok);
  }
});

// ── Auth middleware ──────────────────────────────────────────────
function auth(req, res, next) {
  const u = req.session?.user;
  if (!u) return res.status(401).json({ error: 'No autenticado' });
  if (!u.modulos.includes('asistencia')) return res.status(403).json({ error: 'Sin acceso' });
  next();
}
function authAdmin(req, res, next) {
  const u = req.session?.user;
  if (!u) return res.status(401).json({ error: 'No autenticado' });
  if (!u.modulos.includes('asistencia')) return res.status(403).json({ error: 'Sin acceso' });
  if (!u.permisos?.asistencia_config) return res.status(403).json({ error: 'Solo administradores' });
  next();
}

const RUTAS_PUBLICAS = new Set([
  'GET:/dashboard',
  'GET:/buscar',
  'POST:/marcar'
]);

router.use((req, res, next) => {
  const key = `${req.method}:${req.path}`;
  if (RUTAS_PUBLICAS.has(key)) return next();
  return auth(req, res, next);
});

// ── Audit ────────────────────────────────────────────────────────
async function audit(tabla, id, accion, detalle) {
  await run('INSERT INTO audit_log (tabla,registro_id,accion,detalle,timestamp) VALUES (?,?,?,?,?)',
    [tabla, id, accion, detalle, ahoraSQL()]);
}

// ════════════════ DASHBOARD ════════════════

router.get('/dashboard', async (req, res) => {
  try {
    const hoy   = hoyISO();
    const total = (await get('SELECT COUNT(*) AS t FROM empleados WHERE activo=1'))?.t || 0;
    const regs  = await all(`
      SELECT r.*, e.nombre, e.apellido, e.cargo, e.foto, e.documento
      FROM registros r JOIN empleados e ON e.id=r.empleado_id
      WHERE r.fecha=? ORDER BY r.hora_entrada DESC`, [hoy]);

    const registros = regs.map(r => ({
      ...r,
      nombre_completo: `${r.nombre} ${r.apellido}`,
      duracion: duracion(r.hora_entrada, r.hora_salida),
      hora_entrada: r.hora_entrada ? r.hora_entrada.slice(11, 16) : null,
      hora_salida:  r.hora_salida  ? r.hora_salida.slice(11, 16)  : null
    }));

    // Leaderboard quincenal
    const now = nowLima();
    const q   = periodoParams(now.year, now.month, now.day <= 15 ? 1 : 2);
    const activos = await all('SELECT * FROM empleados WHERE activo=1 ORDER BY apellido,nombre');
    const lb = [];
    for (const e of activos) {
      const r = await get('SELECT COUNT(*) AS d FROM registros WHERE empleado_id=? AND fecha>=? AND fecha<=? AND hora_entrada IS NOT NULL',
        [e.id, q.desde, q.hasta]);
      lb.push({ nombre: `${e.nombre} ${e.apellido}`, dias: r?.d || 0 });
    }
    lb.sort((a, b) => b.dias - a.dias);

    res.json({ ok: true, hoy, total, registros, leaderboard: lb, periodo: q });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════ BUSCAR EMPLEADO (preview teclado) ════════════════

router.get('/buscar', async (req, res) => {
  try {
    const doc = String(req.query.documento || '').trim();
    if (!doc) return res.json({ encontrado: false });
    const emp = await get('SELECT * FROM empleados WHERE documento=? AND activo=1', [doc]);
    if (!emp) return res.json({ encontrado: false });
    const hoy = hoyISO();
    const reg = await get('SELECT hora_entrada, hora_salida FROM registros WHERE empleado_id=? AND fecha=?', [emp.id, hoy]);
    let estado = 'sin_registro';
    if (reg?.hora_entrada && reg?.hora_salida) estado = 'completo';
    else if (reg?.hora_entrada) estado = 'con_entrada';
    res.json({ encontrado: true, nombre: `${emp.nombre} ${emp.apellido}`, tipo_doc: emp.tipo_doc, estado, foto: emp.foto });
  } catch(e) { res.json({ encontrado: false }); }
});

// ════════════════ MARCAR ENTRADA/SALIDA ════════════════

router.post('/marcar', async (req, res) => {
  try {
    const doc = String(req.body.documento || '').trim();
    if (!doc) return res.status(400).json({ error: 'Ingresá el documento.' });

    const emp = await get('SELECT * FROM empleados WHERE documento=? AND activo=1', [doc]);
    if (!emp) return res.status(404).json({ error: `Documento ${doc} no encontrado.` });

    const hoy   = hoyISO();
    const ahora = ahoraSQL();
    let   reg   = await get('SELECT * FROM registros WHERE empleado_id=? AND fecha=?', [emp.id, hoy]);

    if (!reg) {
      // Primera marca → entrada
      const fotoEntrada = saveAsistPhoto(doc, hoy, 'entrada', req.body.foto_base64);
      const r = await run('INSERT INTO registros (empleado_id,fecha,hora_entrada,foto_entrada) VALUES (?,?,?,?)', [emp.id, hoy, ahora, fotoEntrada]);
      await audit('registros', r.id, 'entrada', `Entrada: ${emp.nombre} ${emp.apellido} a las ${ahora.slice(11,16)}`);
      return res.json({ ok: true, accion: 'entrada', nombre: `${emp.nombre} ${emp.apellido}`, hora: ahora.slice(11, 16), foto: emp.foto || '' });
    }

    if (!reg.hora_salida) {
      // Candado anti doble-marcación inmediata: mínimo 5 minutos entre entrada y salida
      let entradaDT = DateTime.fromSQL(reg.hora_entrada, { zone: TZ });
      if (!entradaDT.isValid) {
        entradaDT = DateTime.fromISO(String(reg.hora_entrada || '').replace(' ', 'T'), { zone: TZ });
      }
      const ahoraDT = DateTime.fromSQL(ahora, { zone: TZ });
      const minDiff = entradaDT.isValid && ahoraDT.isValid
        ? ahoraDT.diff(entradaDT, 'minutes').minutes
        : 999;
      if (minDiff < 5) {
        const faltan = Math.ceil(5 - minDiff);
        return res.status(400).json({
          error: `Esperá al menos 5 minutos entre una marca y otra. Faltan ${faltan} min.`
        });
      }

      // Segunda marca → salida
      const fotoSalida = saveAsistPhoto(doc, hoy, 'salida', req.body.foto_base64);
      await run('UPDATE registros SET hora_salida=?,foto_salida=? WHERE id=?', [ahora, fotoSalida, reg.id]);
      await audit('registros', reg.id, 'salida', `Salida: ${emp.nombre} ${emp.apellido} a las ${ahora.slice(11,16)}`);
      return res.json({ ok: true, accion: 'salida', nombre: `${emp.nombre} ${emp.apellido}`, hora: ahora.slice(11, 16), foto: emp.foto || '' });
    }

    return res.status(400).json({ error: `${emp.nombre} ${emp.apellido} ya tiene entrada y salida registradas hoy.` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════ EMPLEADOS ════════════════

router.get('/empleados', async (req, res) => {
  try {
    const { activo = '1' } = req.query;
    const empleados = await all('SELECT * FROM empleados WHERE activo=? ORDER BY apellido,nombre', [+activo]);
    res.json({ ok: true, empleados: empleados.map(e => ({ ...e, nombre_completo: `${e.nombre} ${e.apellido}` })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/empleados/:id', async (req, res) => {
  try {
    const e = await get('SELECT * FROM empleados WHERE id=?', [req.params.id]);
    if (!e) return res.status(404).json({ error: 'Empleado no encontrado' });
    res.json({ ok: true, empleado: { ...e, nombre_completo: `${e.nombre} ${e.apellido}` } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/empleados', upload.single('foto'), async (req, res) => {
  try {
    const { id, documento, tipo_doc = 'DNI', nombre, apellido, cargo, celular, email, onp = 0 } = req.body;
    if (!documento || !nombre || !apellido) return res.status(400).json({ error: 'Documento, nombre y apellido son requeridos.' });

    const foto = req.file ? req.file.filename : (req.body.foto_actual || '');

    if (id) {
      await run(`UPDATE empleados SET documento=?,tipo_doc=?,nombre=?,apellido=?,cargo=?,celular=?,email=?,foto=?,onp=? WHERE id=?`,
        [documento.trim(), tipo_doc, nombre.trim(), apellido.trim(), cargo || '', celular || '', email || '', foto, onp ? 1 : 0, id]);
      await audit('empleados', id, 'editar', `Empleado ${nombre} ${apellido} actualizado.`);
      return res.json({ ok: true, id: +id });
    }

    const existe = await get('SELECT id FROM empleados WHERE documento=?', [documento.trim()]);
    if (existe) return res.status(400).json({ error: `El documento ${documento} ya está registrado.` });

    const r = await run(`INSERT INTO empleados (documento,tipo_doc,nombre,apellido,cargo,celular,email,foto,onp) VALUES (?,?,?,?,?,?,?,?,?)`,
      [documento.trim(), tipo_doc, nombre.trim(), apellido.trim(), cargo || '', celular || '', email || '', foto, onp ? 1 : 0]);
    await audit('empleados', r.id, 'crear', `Nuevo empleado: ${nombre} ${apellido}.`);
    res.status(201).json({ ok: true, id: r.id });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(400).json({ error: 'El documento ya está registrado.' });
    res.status(500).json({ error: e.message });
  }
});

router.post('/empleados/:id/baja', authAdmin, async (req, res) => {
  try {
    const { nota_baja = '' } = req.body;
    await run('UPDATE empleados SET activo=0, nota_baja=? WHERE id=?', [nota_baja, req.params.id]);
    await audit('empleados', req.params.id, 'baja', `Baja: ${nota_baja}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/empleados/:id/reactivar', authAdmin, async (req, res) => {
  try {
    await run('UPDATE empleados SET activo=1, nota_baja="" WHERE id=?', [req.params.id]);
    await audit('empleados', req.params.id, 'reactivar', 'Empleado reactivado.');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════ REGISTROS ════════════════

router.get('/registros', async (req, res) => {
  try {
    const { desde, hasta, empleado_id } = req.query;
    const hoy = hoyISO();
    const d   = desde || hoy;
    const h   = hasta || hoy;
    const cfg = await get('SELECT hora_ingreso, tolerancia_min FROM configuracion WHERE id=1') || {};
    const horaIngreso = String(cfg.hora_ingreso || '06:30').slice(0, 5);
    const tolerancia  = +cfg.tolerancia_min || 5;
    const hmToMin = (hm) => {
      const m = String(hm || '').trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const hh = +m[1], mm = +m[2];
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
      return hh * 60 + mm;
    };
    const entradaToMin = (raw) => {
      const s = String(raw || '').trim();
      const m = s.match(/(?:^|\s|T)(\d{1,2}):(\d{2})(?::\d{2})?/);
      if (!m) return null;
      const hh = +m[1], mm = +m[2];
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
      return hh * 60 + mm;
    };
    const limiteMin = (hmToMin(horaIngreso) ?? 390) + tolerancia;
    let sql   = `SELECT r.*, e.nombre, e.apellido, e.cargo, e.documento, e.foto
                 FROM registros r JOIN empleados e ON e.id=r.empleado_id
                 WHERE r.fecha>=? AND r.fecha<=?`;
    const p   = [d, h];
    if (empleado_id) { sql += ' AND r.empleado_id=?'; p.push(+empleado_id); }
    sql += ' ORDER BY r.fecha DESC, e.apellido, e.nombre';
    const rows = await all(sql, p);
    const registros = rows.map(r => ({
      ...r,
      nombre_completo: `${r.nombre} ${r.apellido}`,
      duracion: duracion(r.hora_entrada, r.hora_salida),
      entrada_fmt: r.hora_entrada ? r.hora_entrada.slice(11, 16) : null,
      salida_fmt:  r.hora_salida  ? r.hora_salida.slice(11, 16)  : null,
      estado_llegada: (() => {
        if (!r.hora_entrada) return 'A TIEMPO';
        const entradaMin = entradaToMin(r.hora_entrada);
        if (entradaMin === null) return 'A TIEMPO';
        return entradaMin > limiteMin ? 'TARDANZA' : 'A TIEMPO';
      })()
    }));
    res.json({ ok: true, registros });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/registros', authAdmin, async (req, res) => {
  try {
    const { id, empleado_id, fecha, hora_entrada, hora_salida, observacion } = req.body;
    if (!empleado_id || !fecha) return res.status(400).json({ error: 'Empleado y fecha requeridos.' });

    const fmtDT = (h) => h ? `${fecha} ${h}:00` : null;

    if (id) {
      await run('UPDATE registros SET empleado_id=?,fecha=?,hora_entrada=?,hora_salida=?,observacion=? WHERE id=?',
        [+empleado_id, fecha, fmtDT(hora_entrada), fmtDT(hora_salida), observacion || '', id]);
      await audit('registros', id, 'editar', `Registro ${id} editado manualmente.`);
      return res.json({ ok: true });
    }

    const existe = await get('SELECT id FROM registros WHERE empleado_id=? AND fecha=?', [+empleado_id, fecha]);
    if (existe) return res.status(400).json({ error: 'Ya existe un registro para ese empleado en esa fecha.' });

    const r = await run('INSERT INTO registros (empleado_id,fecha,hora_entrada,hora_salida,observacion) VALUES (?,?,?,?,?)',
      [+empleado_id, fecha, fmtDT(hora_entrada), fmtDT(hora_salida), observacion || '']);
    await audit('registros', r.id, 'manual', `Registro manual para empleado ${empleado_id} en ${fecha}.`);
    res.status(201).json({ ok: true, id: r.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/registros/:id', authAdmin, async (req, res) => {
  try {
    const motivo = String(req.body.motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'Debe indicar el motivo de eliminación.' });
    await run('DELETE FROM registros WHERE id=?', [req.params.id]);
    await audit('registros', req.params.id, 'eliminar', `Registro ${req.params.id} eliminado. Motivo: ${motivo}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════ SUELDOS ════════════════

router.get('/sueldos', async (req, res) => {
  try {
    const { anio, mes, quincena } = req.query;
    const periodo = periodoParams(anio, mes, quincena);
    const cfg     = await get('SELECT * FROM configuracion WHERE id=1') || {};
    const activos = await all('SELECT * FROM empleados WHERE activo=1 ORDER BY apellido,nombre');

    const sueldoMinimo  = +cfg.sueldo_minimo || 1025;
    const valorDia      = +(sueldoMinimo / 30).toFixed(2);
    const horaIngreso   = cfg.hora_ingreso || '06:30';
    const tolerancia    = +cfg.tolerancia_min || 5;
    const descTardanza  = +cfg.descuento_tardanza || 2;

    const resultados = [];
    for (const emp of activos) {
      const regs = await all(`SELECT * FROM registros WHERE empleado_id=? AND fecha>=? AND fecha<=? AND hora_entrada IS NOT NULL`,
        [emp.id, periodo.desde, periodo.hasta]);
      const ajuste = await get('SELECT * FROM sueldo_ajustes WHERE empleado_id=? AND periodo_desde=? AND periodo_hasta=?',
        [emp.id, periodo.desde, periodo.hasta]);

      // Días trabajados (con entrada Y salida)
      const completos   = regs.filter(r => r.hora_entrada && r.hora_salida);
      const fechasTrabs = new Set(completos.map(r => r.fecha));
      const diasTrab    = fechasTrabs.size;

      // Tardanzas
      const hIngreso = DateTime.fromFormat(horaIngreso, 'HH:mm', { zone: TZ });
      let tardCount = 0;
      for (const r of completos) {
        const entrada  = DateTime.fromSQL(r.hora_entrada, { zone: TZ });
        const limite   = DateTime.fromISO(r.fecha, { zone: TZ })
          .set({ hour: hIngreso.hour, minute: hIngreso.minute, second: 0 })
          .plus({ minutes: tolerancia });
        if (entrada > limite) tardCount++;
      }

      // Descansos y faltas por semana
      const desde = DateTime.fromISO(periodo.desde, { zone: TZ });
      const hasta  = DateTime.fromISO(periodo.hasta,  { zone: TZ });
      const hoy    = nowLima().startOf('day');
      const hastaCalc = hasta < hoy ? hasta : hoy;

      let diasAdicionales = 0, descansos = 0, faltas = 0;
      let lun = desde.minus({ days: weekday(desde) });
      while (lun <= hastaCalc) {
        const diasSem = [];
        for (let i = 0; i < 7; i++) {
          const d = lun.plus({ days: i });
          if (d >= desde && d <= hastaCalc) diasSem.push(d.toISODate());
        }
        if (diasSem.length === 7) {
          const trabSem   = diasSem.filter(d => fechasTrabs.has(d)).length;
          const ausencias = 7 - trabSem;
          if (trabSem === 7)     diasAdicionales += 2;
          else if (ausencias === 1) descansos++;
          else if (ausencias >= 2)  faltas += Math.min(ausencias - 1, 2);
        }
        lun = lun.plus({ days: 7 });
      }

      const feriados   = +ajuste?.feriados  || 0;
      const prestamo   = +ajuste?.prestamo  || 0;
      const bono       = +ajuste?.bono      || 0;
      const tardMonto  = +(tardCount * descTardanza).toFixed(2);
      const faltsMonto = +(faltas * 20).toFixed(2);
      const subtotal   = +((diasTrab + diasAdicionales + feriados + descansos) * valorDia - faltsMonto - tardMonto).toFixed(2);
      const onpMonto   = emp.onp ? +(subtotal * 0.13).toFixed(2) : 0;
      const sueldo     = +(subtotal - onpMonto - prestamo + bono).toFixed(2);
      const nota       = ajuste?.nota || '';

      resultados.push({
        emp: { ...emp, nombre_completo: `${emp.nombre} ${emp.apellido}` },
        dias_trabajados: diasTrab, diasAdicionales, descansos, faltas, feriados,
        tardanza_count: tardCount, tardanza_monto: tardMonto,
        faltas_monto: faltsMonto, subtotal, bono, prestamo,
        onp_monto: onpMonto, sueldo, nota
      });
    }

    res.json({ ok: true, periodo, resultados, valorDia });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Boleta detallada por empleado ──────────────────────────────
router.get('/sueldos/boleta', async (req, res) => {
  try {
    const { emp_id, desde, hasta } = req.query;
    if (!emp_id || !desde || !hasta) return res.status(400).json({ error: 'Faltan parámetros.' });

    const cfg = await get('SELECT * FROM configuracion WHERE id=1') || {};
    const sueldoMinimo = +cfg.sueldo_minimo || 1025;
    const valorDia     = +(sueldoMinimo / 30).toFixed(2);
    const descTardanza = +cfg.descuento_tardanza || 2;
    const horaIngreso  = cfg.hora_ingreso || '06:30';
    const tolerancia   = +cfg.tolerancia_min || 5;

    const emp    = await get('SELECT * FROM empleados WHERE id=?', [+emp_id]);
    const ajuste = await get('SELECT * FROM sueldo_ajustes WHERE empleado_id=? AND periodo_desde=? AND periodo_hasta=?', [+emp_id, desde, hasta]);
    const regs   = await all('SELECT * FROM registros WHERE empleado_id=? AND fecha>=? AND fecha<=? ORDER BY fecha', [+emp_id, desde, hasta]);

    // calcular tardanzas por registro
    const hIngreso = DateTime.fromFormat(horaIngreso, 'HH:mm', { zone: TZ });
    const registros = regs.map(r => {
      let tarde = false;
      if (r.hora_entrada) {
        const entrada = DateTime.fromSQL(r.hora_entrada, { zone: TZ });
        const limite  = DateTime.fromISO(r.fecha, { zone: TZ })
          .set({ hour: hIngreso.hour, minute: hIngreso.minute, second: 0 })
          .plus({ minutes: tolerancia });
        tarde = entrada > limite;
      }
      return {
        fecha:        r.fecha,
        hora_entrada: r.hora_entrada ? r.hora_entrada.slice(11, 16) : null,
        hora_salida:  r.hora_salida  ? r.hora_salida.slice(11, 16)  : null,
        observacion:  r.observacion  || '',
        tarde
      };
    });

    res.json({ ok: true, emp, ajuste, registros, valorDia, descTardanza, periodo: { desde, hasta } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/sueldos/ajuste', authAdmin, async (req, res) => {
  try {
    const { empleado_id, periodo_desde, periodo_hasta, feriados = 0, prestamo = 0, bono = 0, nota = '' } = req.body;
    if (!empleado_id || !periodo_desde || !periodo_hasta) return res.status(400).json({ error: 'Faltan campos.' });

    const existe = await get('SELECT id FROM sueldo_ajustes WHERE empleado_id=? AND periodo_desde=? AND periodo_hasta=?',
      [+empleado_id, periodo_desde, periodo_hasta]);
    if (existe) {
      await run('UPDATE sueldo_ajustes SET feriados=?,prestamo=?,bono=?,nota=?,updated_at=? WHERE id=?',
        [+feriados, +prestamo, +bono, nota, ahoraSQL(), existe.id]);
    } else {
      await run('INSERT INTO sueldo_ajustes (empleado_id,periodo_desde,periodo_hasta,feriados,prestamo,bono,nota,updated_at) VALUES (?,?,?,?,?,?,?,?)',
        [+empleado_id, periodo_desde, periodo_hasta, +feriados, +prestamo, +bono, nota, ahoraSQL()]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════ AUDITORÍA ════════════════

router.get('/auditoria', authAdmin, async (req, res) => {
  try {
    const logs = await all('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 200');
    res.json({ ok: true, logs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════ CONFIGURACIÓN ════════════════

router.get('/config', authAdmin, async (req, res) => {
  try {
    const cfg = await get('SELECT * FROM configuracion WHERE id=1');
    res.json({ ok: true, config: cfg || {}, cargos: CARGOS });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/config', authAdmin, async (req, res) => {
  try {
    const { sueldo_minimo, hora_ingreso, tolerancia_min, descuento_tardanza,
            email_smtp, email_puerto, email_usuario, email_password, email_activo,
            backup_diario_activo } = req.body;
    const actual = await get('SELECT * FROM configuracion WHERE id=1');
    const passwordFinal = String(email_password || '').trim() ? email_password : (actual?.email_password || '');
    await run(`UPDATE configuracion SET sueldo_minimo=?,hora_ingreso=?,tolerancia_min=?,descuento_tardanza=?,
               email_smtp=?,email_puerto=?,email_usuario=?,email_password=?,email_activo=?,backup_diario_activo=? WHERE id=1`,
      [+sueldo_minimo||1025, hora_ingreso||'06:30', +tolerancia_min||5, +descuento_tardanza||2,
       email_smtp||'smtp.gmail.com', +email_puerto||587, email_usuario||'', passwordFinal, email_activo?1:0, backup_diario_activo?1:0]);
    await audit('configuracion', 1, 'actualizar', 'Configuración actualizada.');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════ EMAIL QUINCENA ════════════════

router.post('/correo/quincena', authAdmin, async (req, res) => {
  try {
    const { anio, mes, quincena } = req.body;
    const periodo = periodoParams(anio, mes, quincena);
    const cfg     = await get('SELECT * FROM configuracion WHERE id=1');

    if (!cfg?.email_activo)    return res.status(400).json({ error: 'Email desactivado en Configuración.' });
    if (!cfg?.email_usuario)   return res.status(400).json({ error: 'Faltan credenciales SMTP.' });

    const transporter = nodemailer.createTransport({
      host: cfg.email_smtp, port: +cfg.email_puerto,
      secure: +cfg.email_puerto === 465,
      auth: { user: cfg.email_usuario, pass: cfg.email_password }
    });

    const empleados = await all(`SELECT * FROM empleados WHERE activo=1 AND email IS NOT NULL AND TRIM(email) != ''`);
    let enviados = 0; const errores = [];

    for (const emp of empleados) {
      try {
        await transporter.sendMail({
          from: cfg.email_usuario, to: emp.email,
          subject: `BELÚ — Asistencia ${periodo.desde} al ${periodo.hasta}`,
          html: `<p>Hola <strong>${emp.nombre} ${emp.apellido}</strong>,<br>
                 Adjunto tu resumen de asistencia del período <strong>${periodo.desde}</strong> al <strong>${periodo.hasta}</strong>.<br><br>
                 BELÚ Chicharronería.</p>`
        });
        enviados++;
      } catch (er) { errores.push(`${emp.nombre} ${emp.apellido}: ${er.message}`); }
    }
    res.json({ ok: true, enviados, errores });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/correo/respaldo/prueba', authAdmin, async (_req, res) => {
  try {
    const result = await enviarCorreoRespaldo({ prueba: true });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════ LIMPIEZA DE FOTOS ASISTENCIA ════════════════
// Día 18: elimina fotos del 1 al 15 del mes actual
// Día 3: elimina fotos del 16 al último día del mes anterior
function cleanupAsistPhotos() {
  const now = nowLima();
  const dia = now.day;
  if (dia !== 3 && dia !== 18) return;
  try {
    const files = fs.readdirSync(FOTOS_ASIST_DIR).filter(f => f.endsWith('.jpg'));
    if (!files.length) return;
    let deleted = 0;
    for (const f of files) {
      // formato: DOC_YYYY-MM-DD_tipo.jpg
      const match = f.match(/(\d{4})-(\d{2})-(\d{2})_/);
      if (!match) continue;
      const fDay = parseInt(match[3], 10);
      const fMonth = parseInt(match[2], 10);
      const fYear = parseInt(match[1], 10);
      let borrar = false;
      if (dia === 18) {
        // Borrar fotos del 1 al 15 del mes actual
        borrar = fYear === now.year && fMonth === now.month && fDay >= 1 && fDay <= 15;
      } else if (dia === 3) {
        // Borrar fotos del 16+ del mes anterior
        const mesAnt = now.month === 1 ? 12 : now.month - 1;
        const anioAnt = now.month === 1 ? now.year - 1 : now.year;
        borrar = fYear === anioAnt && fMonth === mesAnt && fDay >= 16;
      }
      if (borrar) {
        fs.unlinkSync(path.join(FOTOS_ASIST_DIR, f));
        deleted++;
      }
    }
    if (deleted > 0) console.log(`  ✓ Fotos de asistencia limpiadas (${deleted} archivos)`);
  } catch (e) {
    console.error('Error limpiando fotos asistencia:', e.message);
  }
}
cleanupAsistPhotos();
setInterval(cleanupAsistPhotos, 60 * 60 * 1000);

cron.schedule('0 18 * * *', async () => {
  try {
    const cfg = await get('SELECT * FROM configuracion WHERE id=1');
    if (!cfg?.backup_diario_activo || !cfg?.email_activo) return;
    if (cfg.backup_diario_ultimo_envio === hoyISO()) return;

    const result = await enviarCorreoRespaldo();
    if (!result?.skipped) {
      console.log(`  ✓ Respaldo diario enviado a ${result.destino}`);
    }
  } catch (e) {
    console.error('Error enviando respaldo diario:', e.message);
  }
}, { timezone: TZ });

console.log(`  ✓ Respaldo diario programado a las ${RESPALDO_HORA} (${TZ})`);

module.exports = router;
