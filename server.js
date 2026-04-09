require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARES ────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'belu_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000 // 8 horas
  }
}));

// ─── RUTAS ──────────────────────────────────────────────────────
const authRoutes         = require('./routes/auth');
const contabilidadRoutes = require('./routes/contabilidad');
const movimientosRoutes  = require('./routes/movimientos');
const asistenciaRoutes   = require('./routes/asistencia');
const comprasRoutes      = require('./routes/compras');
const erroresRoutes      = require('./routes/errores');
app.use('/api/auth',         authRoutes);
app.use('/api/contabilidad', contabilidadRoutes);
app.use('/api/movimientos',  movimientosRoutes);
app.use('/api/asistencia',   asistenciaRoutes);
app.use('/api/compras',      comprasRoutes);
app.use('/api/errores',      erroresRoutes);

// ─── PROTECCIÓN DE RUTAS SPA ────────────────────────────────────
// Login page — acceso libre
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// App principal — requiere sesión
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fallback para cualquier ruta no reconocida
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── INICIO ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✦ BELÚ SYSTEM corriendo en http://localhost:${PORT}`);
  console.log(`  ✦ Entorno: ${process.env.NODE_ENV || 'development'}\n`);
});
