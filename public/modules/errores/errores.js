(function () {
  'use strict';
  const API = '/api/errores';

  // ── TABS ─────────────────────────────────────────────────────────
  window.erroresTab = function (tab) {
    document.querySelectorAll('.errores-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('#modTabsSlot .mod-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('errores-' + tab).classList.add('active');
    event.target.classList.add('active');
    if (tab === 'stats') erroresCargarStats();
  };

  // ── CARGAR LISTA ─────────────────────────────────────────────────
  window.erroresCargar = async function () {
    const params = new URLSearchParams();
    const desde    = document.getElementById('eDesde').value;
    const hasta    = document.getElementById('eHasta').value;
    const nombre   = document.getElementById('eFiltNombre').value;
    const seccion  = document.getElementById('eFiltSeccion').value;
    const resuelto = document.getElementById('eFiltResuelto').value;
    if (desde)    params.set('desde', desde);
    if (hasta)    params.set('hasta', hasta);
    if (nombre)   params.set('nombre', nombre);
    if (seccion)  params.set('seccion', seccion);
    if (resuelto !== '') params.set('resuelto', resuelto);

    try {
      const rows = await fetch(`${API}?${params}`).then(r => r.json());
      const el   = document.getElementById('tablaErrores');
      if (!rows.length) {
        el.innerHTML = '<p class="text-center text-muted" style="padding:30px">Sin registros.</p>';
        return;
      }
      el.innerHTML = `<table class="data-table">
        <thead><tr>
          <th>Fecha</th><th>Nombre</th><th>Sección</th>
          <th>Descripción</th><th>Solución</th><th>Estado</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map(e => `<tr>
            <td style="white-space:nowrap">${e.fecha}<br><span style="color:#888;font-size:.975em">${e.hora || '12:12:12'}</span></td>
            <td style="white-space:nowrap">${esc(e.nombre)}</td>
            <td>${esc(e.seccion) || '—'}</td>
            <td style="max-width:220px;white-space:normal;font-size:.85em">${esc(e.descripcion)}</td>
            <td style="max-width:180px;white-space:normal;font-size:.85em;color:var(--text-muted)">${esc(e.solucion) || '—'}</td>
            <td>
              <span class="${e.resuelto ? 'badge-resuelto' : 'badge-pendiente'}">
                ${e.resuelto ? '✓ Resuelto' : '⚠ Pendiente'}
              </span>
            </td>
            <td style="white-space:nowrap">
              <button class="btn btn-secondary btn-xs" onclick="erroresEditar(${e.id})">✏️</button>
              ${!e.resuelto
                ? `<button class="btn btn-success btn-xs" onclick="erroresResolver(${e.id})">✓</button>`
                : ''}
              <button class="btn btn-danger btn-xs" onclick="erroresEliminar(${e.id})">🗑</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    } catch(e) {
      document.getElementById('tablaErrores').innerHTML = '<p class="text-center text-muted" style="padding:30px">Error al cargar.</p>';
    }
  };

  // ── STATS ─────────────────────────────────────────────────────────
  async function erroresCargarStats() {
    try {
      const s = await fetch(`${API}/stats`).then(r => r.json());
      document.getElementById('eStTotal').textContent     = s.total;
      document.getElementById('eStPendientes').textContent = s.sinResolver;
      document.getElementById('eStMes').textContent       = s.ultimosMes;

      const max = s.porSeccion[0]?.qty || 1;
      document.getElementById('eStPorSeccion').innerHTML = s.porSeccion.length
        ? s.porSeccion.map(p => `
            <div style="margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;font-size:.88em;margin-bottom:4px">
                <span>${esc(p.seccion) || 'Sin sección'}</span>
                <span style="color:var(--danger);font-weight:600">${p.qty}</span>
              </div>
              <div style="background:var(--bg-dark);border-radius:4px;height:6px">
                <div style="background:var(--danger);height:6px;border-radius:4px;width:${(p.qty/max*100).toFixed(1)}%"></div>
              </div>
            </div>`).join('')
        : '<p class="text-muted" style="font-size:.88em">Sin errores registrados este mes</p>';
    } catch(e) { console.error(e); }
  }

  // ── FORMULARIO ───────────────────────────────────────────────────
  window.erroresNuevo = function () {
    document.getElementById('erroresFormTitulo').textContent = 'Nuevo Error';
    document.getElementById('eId').value = '';
    document.getElementById('eFecha').value = new Date().toISOString().slice(0,10);
    document.getElementById('eSeccion').value = '';
    document.getElementById('eNombre').value = '';
    document.getElementById('eDescripcion').value = '';
    document.getElementById('eSolucion').value = '';
    document.getElementById('eResuelto').checked = false;
    document.getElementById('erroresForm').style.display = 'block';
    document.getElementById('erroresForm').scrollIntoView({ behavior: 'smooth' });
  };

  window.erroresEditar = async function (id) {
    try {
      const rows = await fetch(API).then(r => r.json());
      const e = rows.find(x => x.id === id);
      if (!e) return;
      document.getElementById('erroresFormTitulo').textContent = 'Editar Error';
      document.getElementById('eId').value            = e.id;
      document.getElementById('eFecha').value         = e.fecha;
      document.getElementById('eSeccion').value       = e.seccion || '';
      document.getElementById('eNombre').value        = e.nombre;
      document.getElementById('eDescripcion').value   = e.descripcion;
      document.getElementById('eSolucion').value      = e.solucion || '';
      document.getElementById('eResuelto').checked    = !!e.resuelto;
      document.getElementById('erroresForm').style.display = 'block';
      document.getElementById('erroresForm').scrollIntoView({ behavior: 'smooth' });
    } catch(e) { alert('Error al cargar registro'); }
  };

  window.erroresGuardar = async function () {
    const id = document.getElementById('eId').value;
    const body = {
      fecha:       document.getElementById('eFecha').value,
      nombre:      document.getElementById('eNombre').value.trim(),
      seccion:     document.getElementById('eSeccion').value,
      descripcion: document.getElementById('eDescripcion').value.trim(),
      solucion:    document.getElementById('eSolucion').value.trim(),
      resuelto:    document.getElementById('eResuelto').checked
    };
    if (!body.fecha || !body.nombre || !body.descripcion)
      return alert('Completá los campos requeridos: Fecha, Nombre, Descripción');
    try {
      const url    = id ? `${API}/${id}` : API;
      const method = id ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data   = await res.json();
      if (!data.ok) return alert(data.error || 'Error al guardar');
      erroresCancelar();
      erroresCargar();
    } catch(e) { alert('Error de red'); }
  };

  window.erroresCancelar = function () {
    document.getElementById('erroresForm').style.display = 'none';
  };

  window.erroresResolver = async function (id) {
    const solucion = prompt('¿Cómo se resolvió? (opcional)') ?? '';
    if (solucion === null) return; // canceló
    try {
      await fetch(`${API}/${id}/resolver`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resuelto: true, solucion })
      });
      erroresCargar();
    } catch(e) { alert('Error de red'); }
  };

  window.erroresEliminar = async function (id) {
    if (!confirm('¿Eliminar este registro?')) return;
    try {
      const res  = await fetch(`${API}/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) return alert(data.error || 'No se pudo eliminar');
      erroresCargar();
    } catch(e) { alert('Error de red'); }
  };

  // ── UTIL ─────────────────────────────────────────────────────────
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── INIT ─────────────────────────────────────────────────────────
  (function erroresInit() {
    const hoy = new Date().toISOString().slice(0,10);
    const y = hoy.slice(0,4), m = hoy.slice(5,7);
    document.getElementById('eDesde').value = `${y}-${m}-01`;
    document.getElementById('eHasta').value = hoy;
    erroresCargar();
  })();
})();
