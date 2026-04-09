const express = require('express');
const router = express.Router();

// ─── USUARIOS DEL SISTEMA ────────────────────────────────────────
// En el futuro esto puede migrarse a SQLite con contraseñas encriptadas.
// Por ahora, configuración directa para arrancar.
const USUARIOS = [
  {
    id: 1,
    username: 'superadmin',
    password: 'belu2026',
    nombre: 'Administrador General',
    rol: 'superadmin',
    modulos: ['asistencia', 'compras', 'errores', 'contabilidad', 'movimientos'],
    permisos: { asistencia_config: true, compras_admin: true }
  },
  {
    id: 2,
    username: 'jefe_asistencia',
    password: 'asist2026',
    nombre: 'Jefe de Asistencia',
    rol: 'asistencia_admin',
    modulos: ['asistencia'],
    permisos: { asistencia_config: true }
  },
  {
    id: 3,
    username: 'ver_asistencia',
    password: 'ver2026',
    nombre: 'Visor Asistencia',
    rol: 'asistencia_user',
    modulos: ['asistencia'],
    permisos: { asistencia_config: false }
  },
  {
    id: 4,
    username: 'compras_errores',
    password: 'compras2026',
    nombre: 'Operaciones BELÚ',
    rol: 'compras_errores',
    modulos: ['compras', 'errores'],
    permisos: {}
  },
  {
    id: 5,
    username: 'contabilidad',
    password: 'conta2026',
    nombre: 'Contabilidad BELÚ',
    rol: 'contabilidad',
    modulos: ['contabilidad'],
    permisos: {}
  },
  {
    id: 6,
    username: 'movimientos',
    password: 'dkp2026',
    nombre: 'Operaciones DKP',
    rol: 'movimientos',
    modulos: ['movimientos'],
    permisos: {}
  }
];

// ─── LOGIN ───────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ ok: false, mensaje: 'Usuario y contraseña requeridos.' });
  }

  const usuario = USUARIOS.find(
    u => u.username === username.trim() && u.password === password
  );

  if (!usuario) {
    return res.status(401).json({ ok: false, mensaje: 'Usuario o contraseña incorrectos.' });
  }

  // Guardar sesión (sin la contraseña)
  req.session.user = {
    id: usuario.id,
    username: usuario.username,
    nombre: usuario.nombre,
    rol: usuario.rol,
    modulos: usuario.modulos,
    permisos: usuario.permisos
  };

  return res.json({
    ok: true,
    user: req.session.user,
    redirect: '/'
  });
});

// ─── LOGOUT ──────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true, redirect: '/login' });
  });
});

// ─── SESIÓN ACTIVA ───────────────────────────────────────────────
router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ ok: false, mensaje: 'No autenticado.' });
  }
  res.json({ ok: true, user: req.session.user });
});

module.exports = router;
