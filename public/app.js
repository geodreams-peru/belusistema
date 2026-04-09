/* ================================================================
   BELÚ SYSTEM — Router SPA principal
   ================================================================ */

let usuarioActual = null;
let modoKiosco = false;

// ── Configuración de módulos ─────────────────────────────────────
const MODULOS = {
  inicio:       { titulo: 'Inicio',           icono: '🏠', desc: 'Panel principal' },
  asistencia:   { titulo: 'Asistencia',        icono: '👥', desc: 'Gestión de empleados y asistencia' },
  compras:      { titulo: 'Compras',           icono: '🛒', desc: 'Registro de compras y gastos' },
  errores:      { titulo: 'Errores',           icono: '⚠️', desc: 'Registro de incidencias operativas' },
  contabilidad: { titulo: 'Contabilidad',      icono: '📊', desc: 'Ventas, gastos y balance financiero' },
  movimientos:  { titulo: 'Movimientos DKP',   icono: '📦', desc: 'Inventario y movimientos El Chino Criollo' }
};

// ── Inicialización ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await verificarSesion();
  iniciarReloj();
});

async function verificarSesion() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { activarModoKiosco(); return; }
    const data = await res.json();
    if (!data.ok)  { activarModoKiosco(); return; }
    usuarioActual = data.user;
    window.usuarioActual = data.user;   // accesible desde módulos cargados dinámicamente
    configurarUI();
  } catch {
    activarModoKiosco();
  }
}

function activarModoKiosco() {
  modoKiosco = true;
  usuarioActual = {
    id: 0,
    username: 'kiosco',
    nombre: 'Kiosco Asistencia',
    rol: 'kiosco',
    modulos: ['asistencia'],
    permisos: { asistencia_config: false }
  };
  window.usuarioActual = usuarioActual;
  document.body.classList.add('kiosco-mode');
  const btn = document.getElementById('btnKioscoLogin');
  if (btn) btn.style.display = 'inline-flex';
  const title = document.getElementById('pageTitle');
  if (title) title.textContent = 'Asistencia';
  inicializarLoginKiosco();
  cargarModulo('asistencia');
}

function inicializarLoginKiosco() {
  const form = document.getElementById('kioscoLoginForm');
  if (!form || form.dataset.ready === '1') return;
  form.dataset.ready = '1';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnKioscoSubmit');
    const err = document.getElementById('kioscoLoginError');
    if (err) err.classList.remove('show');
    if (btn) { btn.disabled = true; btn.textContent = 'Ingresando...'; }
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('kioscoUser')?.value?.trim() || '',
          password: document.getElementById('kioscoPass')?.value || ''
        })
      });
      const data = await res.json();
      if (data.ok) {
        window.location.href = '/';
        return;
      }
      if (err) {
        err.textContent = data.mensaje || 'Usuario o contraseña incorrectos.';
        err.classList.add('show');
      }
    } catch {
      if (err) {
        err.textContent = 'No se pudo conectar con el servidor.';
        err.classList.add('show');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }
    }
  });
}

window.abrirLoginModal = function () {
  const m = document.getElementById('kioscoLoginModal');
  if (!m) return;
  m.classList.remove('hide');
  setTimeout(() => document.getElementById('kioscoUser')?.focus(), 50);
};

window.cerrarLoginModal = function () {
  const m = document.getElementById('kioscoLoginModal');
  if (!m) return;
  m.classList.add('hide');
};

// ── Configurar UI según permisos ─────────────────────────────────
function configurarUI() {
  // Datos del usuario en sidebar
  document.getElementById('userName').textContent  = usuarioActual.nombre;
  document.getElementById('userRol').textContent   = labelRol(usuarioActual.rol);
  document.getElementById('userAvatar').textContent = usuarioActual.nombre.charAt(0).toUpperCase();

  // Ocultar/bloquear módulos sin acceso
  const modulos = usuarioActual.modulos;
  document.querySelectorAll('.nav-link[data-modulo]').forEach(btn => {
    const mod = btn.dataset.modulo;
    if (mod === 'inicio') return;
    if (!modulos.includes(mod)) {
      btn.classList.add('locked');
      btn.setAttribute('disabled', true);
      btn.onclick = null;
    }
  });

  // Grid de bienvenida con módulos disponibles
  const grid = document.getElementById('welcomeGrid');
  grid.innerHTML = '';
  modulos.forEach(mod => {
    if (mod === 'inicio') return;
    const cfg = MODULOS[mod];
    if (!cfg) return;
    const card = document.createElement('div');
    card.className = 'module-card';
    card.onclick = () => cargarModulo(mod);
    card.innerHTML = `
      <div class="module-card-icon">${cfg.icono}</div>
      <div class="module-card-title">${cfg.titulo}</div>
      <div class="module-card-desc">${cfg.desc}</div>
    `;
    grid.appendChild(card);
  });
}

// ── Módulos ya cargados ──────────────────────────────────────────
const modulosCargados = new Set();

// ── Navegación entre módulos ─────────────────────────────────────
async function cargarModulo(modulo) {
  if (!usuarioActual) return;
  if (modulo !== 'inicio' && !usuarioActual.modulos.includes(modulo)) return;

  // Ocultar todas las secciones
  document.querySelectorAll('.module-section').forEach(s => s.classList.remove('active'));

  // Actualizar nav
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-link[data-modulo="${modulo}"]`);
  if (navBtn) navBtn.classList.add('active');

  // Título
  const cfg = MODULOS[modulo];
  document.getElementById('pageTitle').textContent = cfg ? cfg.titulo : modulo;

  const seccion = document.getElementById(`mod-${modulo}`);
  if (!seccion) return;

  const slot = document.getElementById('modTabsSlot');

  // Cargar HTML + JS del módulo si es la primera vez
  if (modulo !== 'inicio' && !modulosCargados.has(modulo)) {
    seccion.innerHTML = '<p class="text-muted text-center" style="padding:40px">Cargando módulo...</p>';
    try {
      const html = await fetch(`/modules/${modulo}/view.html`).then(r => r.text());
      seccion.innerHTML = html;

      // Mover tabs al slot ANTES de cargar el script (para que el init los encuentre)
      if (slot) {
        slot.querySelectorAll('.mod-tabs').forEach(t => t.style.display = 'none');
        const tabs = seccion.querySelector('.mod-tabs');
        if (tabs) {
          tabs.id = `_tabs_${modulo}`;
          tabs.style.marginBottom = '0';
          slot.appendChild(tabs);
        }
      }

      await cargarScript(`/modules/${modulo}/${modulo}.js`);
      modulosCargados.add(modulo);
    } catch {
      seccion.innerHTML = '<p class="text-muted text-center" style="padding:40px">Error al cargar el módulo.</p>';
    }
  } else if (slot) {
    // Módulo ya cargado: solo mostrar sus tabs y ocultar los demás
    slot.querySelectorAll('.mod-tabs').forEach(t => t.style.display = 'none');
    const tabs = document.getElementById(`_tabs_${modulo}`);
    if (tabs) tabs.style.display = '';
  }

  seccion.classList.add('active');
}

function cargarScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src + '?v=' + Date.now();
    s.onload  = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

// ── Cerrar sesión ────────────────────────────────────────────────
async function cerrarSesion() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } finally {
    window.location.href = '/login';
  }
}

// ── Reloj ────────────────────────────────────────────────────────
function iniciarReloj() {
  const el = document.getElementById('dateTime');
  function actualizar() {
    const now = new Date();
    el.textContent = now.toLocaleString('es-PE', {
      weekday: 'long', year: 'numeric',
      month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }
  actualizar();
  setInterval(actualizar, 60000);
}

// ── Helper ───────────────────────────────────────────────────────
function labelRol(rol) {
  const labels = {
    superadmin:       'Super Administrador',
    asistencia_admin: 'Admin Asistencia',
    asistencia_user:  'Visor Asistencia',
    compras_errores:  'Operaciones BELÚ',
    contabilidad:     'Contabilidad',
    movimientos:      'Operaciones DKP'
  };
  return labels[rol] || rol;
}
