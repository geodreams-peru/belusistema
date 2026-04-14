(function () {
  'use strict';
  const API = '/api/compras';
  const fmt = n => 'S/ ' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fmtN = n => Number(n || 0).toFixed(2);

  // ── TABS ─────────────────────────────────────────────────────────
  window.comprasTab = function (tab) {
    document.querySelectorAll('.compras-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('#modTabsSlot .mod-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('compras-' + tab).classList.add('active');
    event.target.classList.add('active');
    if (tab === 'dashboard') comprasCargarDashboard();
    if (tab === 'resumen')   comprasIniciarResumen();
  };

  // ── DASHBOARD ────────────────────────────────────────────────────
  window.comprasCargarDashboard = async function () {
    try {
      const dm = document.getElementById('cDashMesFiltro')?.value || String(new Date().getMonth()+1).padStart(2,'0');
      const dy = document.getElementById('cDashAnio')?.value || new Date().getFullYear();
      const mes = `${dy}-${dm}`;
      const d = await fetch(API + '/dashboard?mes=' + mes).then(r => r.json());
      document.getElementById('cDashHoy').textContent  = fmt(d.totalHoy);
      document.getElementById('cDashTotalMes').textContent  = fmt(d.totalMes);
      document.getElementById('cDashQty').textContent  = d.qtyMes;

      // Top proveedores
      const maxProv = d.topProvMes[0]?.total || 1;
      document.getElementById('cDashTopProv').innerHTML = d.topProvMes.length
        ? d.topProvMes.map(p => `
            <div style="margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;font-size:.88em;margin-bottom:4px">
                <span>${p.proveedor}</span><span style="color:var(--primary)">${fmt(p.total)}</span>
              </div>
              <div style="background:var(--bg-dark);border-radius:4px;height:6px">
                <div style="background:var(--primary);height:6px;border-radius:4px;width:${(p.total/maxProv*100).toFixed(1)}%"></div>
              </div>
            </div>`).join('')
        : '<p class="text-muted" style="font-size:.88em">Sin datos este mes</p>';

      // Por pago
      document.getElementById('cDashPorPago').innerHTML = d.porPago.length
        ? `<table style="width:100%;font-size:.9em"><tbody>` +
          d.porPago.map(p => `<tr>
            <td style="padding:6px 0;color:var(--text-muted)">${p.pago}</td>
            <td style="padding:6px 0;text-align:right;font-weight:600">${fmt(p.total)}</td>
          </tr>`).join('') + '</tbody></table>'
        : '<p class="text-muted" style="font-size:.88em">Sin datos este mes</p>';

      // Últimas compras
      document.getElementById('cDashUltimas').innerHTML = renderTablaCompras(d.ultimas, false);
    } catch (e) { console.error(e); }
  }

  // ── REGISTROS ────────────────────────────────────────────────────
  window.comprasCargar = async function () {
    const mes   = document.getElementById('cMes')?.value;
    const anio  = document.getElementById('cAnio')?.value;
    const prov  = document.getElementById('cFiltProv').value;
    const prod  = document.getElementById('cFiltProd').value;
    const pago  = document.getElementById('cFiltPago').value;

    const params = new URLSearchParams({ limit: 500 });
    if (mes && anio) {
      const ul = new Date(+anio, +mes, 0).getDate();
      params.set('desde', `${anio}-${mes}-01`);
      params.set('hasta', `${anio}-${mes}-${String(ul).padStart(2,'0')}`);
    }
    if (prov)  params.set('proveedor', prov);
    if (prod)  params.set('producto',  prod);
    if (pago)  params.set('pago', pago);

    try {
      const data = await fetch(`${API}?${params}`).then(r => r.json());
      document.getElementById('cTotalQty').textContent  = data.total + ' registros';
      document.getElementById('cTotalSuma').textContent = fmt(data.suma);
      document.getElementById('tablaCompras').innerHTML = renderTablaCompras(data.rows, true);
    } catch (e) { document.getElementById('tablaCompras').innerHTML = '<p class="text-center text-muted" style="padding:30px">Error al cargar.</p>'; }
  };

  function renderTablaCompras(rows, conAcciones) {
    if (!rows.length) return '<p class="text-center text-muted" style="padding:30px">Sin registros.</p>';
    const metaLotes = detectarLotesVisuales(rows);
    return `<table class="data-table">
      <thead><tr>
        <th>Fecha</th><th>Proveedor</th><th>Producto</th>
        <th>Pago</th><th>Peso</th><th>P. Unit</th>
        <th style="text-align:right">Total</th>
        <th>Pagado</th>
        <th>Nota</th>
        ${conAcciones ? '<th></th>' : ''}
      </tr></thead>
      <tbody>
        ${rows.map((c, idx) => {
          const lote = metaLotes[idx];
          const claseLote = lote.esLote
            ? `compras-lote-row compras-lote-${lote.color} ${lote.esInicio ? 'compras-lote-start' : ''} ${lote.esFin ? 'compras-lote-end' : ''}`
            : '';
          const tagLote = (lote.esLote && lote.esInicio)
            ? `<div class="compras-lote-tag">Lote</div>`
            : '';
          return `<tr class="${claseLote}">
          <td>${c.fecha}<br><span style="color:#888;font-size:.975em">${c.hora || '12:12:12'}</span>${tagLote}</td>
          <td>${esc(c.proveedor)}</td>
          <td>${esc(c.producto)}</td>
          <td><span class="badge ${c.pago === 'Efectivo' ? 'badge-success' : 'badge-info'}">${c.pago}</span></td>
          <td>${c.peso > 0 ? fmtN(c.peso) + ' kg' : '—'}</td>
          <td>${c.precio_unit > 0 ? fmt(c.precio_unit) : '—'}</td>
          <td style="text-align:right;font-weight:600;color:var(--primary)">${fmt(c.precio_final)}</td>
          <td style="text-align:center"><input type="checkbox" ${c.pagado ? 'checked' : ''} onchange="comprasTogglePagado('${c.id}',this.checked)" style="cursor:pointer;width:16px;height:16px"></td>
          <td style="max-width:200px;white-space:normal;font-size:.82em;color:var(--text-muted)">${esc(c.nota || '')}</td>
          ${conAcciones ? `<td style="white-space:nowrap">
            <button class="btn btn-secondary btn-xs" onclick="comprasEditar('${c.id}')">✏️</button>
            <button class="btn btn-danger btn-xs" onclick="comprasEliminar('${c.id}')">🗑</button>
          </td>` : ''}
        </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  }

  function detectarLotesVisuales(rows) {
    const out = rows.map(() => ({ esLote: false, esInicio: false, esFin: false, color: 0 }));
    if (rows.length < 2) return out;

    const grupos = [];
    let ini = 0;

    for (let i = 1; i < rows.length; i++) {
      if (!esMismoLoteConsecutivo(rows[i - 1], rows[i])) {
        grupos.push([ini, i - 1]);
        ini = i;
      }
    }
    grupos.push([ini, rows.length - 1]);

    let colorIx = 0;
    for (const [a, b] of grupos) {
      if (b - a + 1 < 2) continue;
      for (let i = a; i <= b; i++) {
        out[i].esLote = true;
        out[i].esInicio = i === a;
        out[i].esFin = i === b;
        out[i].color = colorIx % 3;
      }
      colorIx++;
    }
    return out;
  }

  function esMismoLoteConsecutivo(a, b) {
    if (!a || !b) return false;
    if ((a.fecha || '') !== (b.fecha || '')) return false;
    if (normTxt(a.proveedor) !== normTxt(b.proveedor)) return false;
    if (normTxt(a.pago) !== normTxt(b.pago)) return false;

    const ta = obtenerMarcaTiempo(a);
    const tb = obtenerMarcaTiempo(b);
    if (ta == null || tb == null) return false;

    // Compras de un mismo lote suelen guardarse con pocos segundos de diferencia.
    return Math.abs(ta - tb) <= 180000;
  }

  function obtenerMarcaTiempo(r) {
    const fecha = String(r.fecha || '').trim();
    const hora = normalizarHora(r.hora || '');
    if (fecha && hora) {
      const t = Date.parse(`${fecha}T${hora}`);
      if (Number.isFinite(t)) return t;
    }

    const created = String(r.created_at || '').trim();
    if (created) {
      const t2 = Date.parse(created.replace(' ', 'T'));
      if (Number.isFinite(t2)) return t2;
    }

    return null;
  }

  function normalizarHora(h) {
    const s = String(h || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return '';
    const hh = m[1].padStart(2, '0');
    const mm = m[2];
    const ss = (m[3] || '00').padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  function normTxt(s) {
    return String(s || '').trim().toLowerCase();
  }

  // ── FORMULARIO ───────────────────────────────────────────────────
  window.comprasNuevo = function () {
    document.getElementById('comprasFormTitulo').textContent = 'Nueva Compra';
    document.getElementById('cId').value = '';
    document.getElementById('cFecha').value = new Date().toISOString().slice(0, 10);
    document.getElementById('cPago').value = 'Efectivo';
    document.getElementById('cProveedor').value = '';
    document.getElementById('btnAgregarFila').style.display = '';
    const cont = document.getElementById('cFilasProductos');
    cont.innerHTML = '';
    comprasAgregarFila();
    document.getElementById('comprasForm').style.display = 'block';
    document.getElementById('comprasForm').scrollIntoView({ behavior: 'smooth' });
    cargarAutocompletado();
  };

  window.comprasEditar = async function (id) {
    try {
      const all = await fetch(`${API}?limit=9999`).then(r => r.json());
      const c = all.rows.find(x => x.id === id);
      if (!c) return;

      document.getElementById('comprasFormTitulo').textContent = 'Editar Compra';
      document.getElementById('cId').value        = c.id;
      document.getElementById('cFecha').value     = c.fecha;
      document.getElementById('cPago').value      = c.pago;
      document.getElementById('cProveedor').value = c.proveedor;
      document.getElementById('btnAgregarFila').style.display = 'none';
      const cont = document.getElementById('cFilasProductos');
      cont.innerHTML = '';
      comprasAgregarFila();
      const row = cont.querySelector('.cFila-producto');
      row.querySelector('.c-producto').value = c.producto;
      row.querySelector('.c-peso').value     = c.peso;
      row.querySelector('.c-unit').value     = c.precio_unit;
      row.querySelector('.c-final').value    = c.precio_final;
      row.querySelector('.c-nota').value     = c.nota || '';
      row.querySelector('.c-pagado').checked  = !!c.pagado;
      document.getElementById('comprasForm').style.display = 'block';
      document.getElementById('comprasForm').scrollIntoView({ behavior: 'smooth' });
      cargarAutocompletado();
    } catch(e) { alert('Error al cargar registro'); }
  };

  window.comprasGuardar = async function () {
    const id        = document.getElementById('cId').value;
    const fecha     = document.getElementById('cFecha').value;
    const pago      = document.getElementById('cPago').value;
    const proveedor = document.getElementById('cProveedor').value.trim();

    if (!fecha || !proveedor)
      return alert('Completá Fecha y Proveedor');

    const filas = Array.from(document.querySelectorAll('#cFilasProductos .cFila-producto'));
    const items = filas.map(f => ({
      producto:     f.querySelector('.c-producto').value.trim(),
      peso:         f.querySelector('.c-peso').value,
      precio_unit:  f.querySelector('.c-unit').value,
      precio_final: f.querySelector('.c-final').value,
      nota:         f.querySelector('.c-nota').value.trim(),
      pagado:       f.querySelector('.c-pagado').checked ? 1 : 0
    })).filter(x => x.producto && x.precio_final);

    if (!items.length)
      return alert('Ingresá al menos un producto con Producto y Precio final');

    try {
      if (id) {
        const body = { fecha, pago, proveedor, ...items[0] };
        const res  = await fetch(`${API}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json();
        if (!data.ok) return alert(data.error || 'Error al guardar');
      } else {
        for (const item of items) {
          const body = { fecha, pago, proveedor, ...item };
          const res  = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const data = await res.json();
          if (!data.ok) return alert(data.error || 'Error al guardar');
        }
      }
      comprasCancelar();
      comprasCargar();
    } catch(e) { alert('Error de red'); }
  };

  window.comprasAgregarFila = function () {
    const cont = document.getElementById('cFilasProductos');
    const div  = document.createElement('div');
    div.className = 'cFila-producto';
    div.innerHTML = `
      <input type="text" class="c-producto" list="cProdList" placeholder="Producto" autocomplete="off">
      <input type="number" class="c-peso" step="0.01" min="0" value="0">
      <input type="number" class="c-unit" step="0.01" min="0" value="0">
      <input type="number" class="c-final" step="0.01" min="0" placeholder="0.00">
      <input type="text" class="c-nota" placeholder="Nota...">
      <label style="text-align:center;cursor:pointer" title="Pagado"><input type="checkbox" class="c-pagado"></label>
      <button type="button" class="btn btn-danger btn-xs" onclick="comprasEliminarFila(this)" title="Eliminar">✕</button>
    `;
    cont.appendChild(div);
  };

  window.comprasEliminarFila = function (btn) {
    const cont = document.getElementById('cFilasProductos');
    if (cont.children.length <= 1) return;
    btn.closest('.cFila-producto').remove();
  };

  window.comprasCancelar = function () {
    document.getElementById('comprasForm').style.display = 'none';
  };

  window.comprasEliminar = async function (id) {
    if (!confirm('¿Eliminar esta compra?')) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) return alert(data.error || 'No se pudo eliminar');
      comprasCargar();
    } catch(e) { alert('Error de red'); }
  };

  window.comprasTogglePagado = async function (id, checked) {
    try {
      const res = await fetch(`${API}/${id}/pagado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagado: checked ? 1 : 0 })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo actualizar');
    } catch(e) { console.error(e); }
  };

  async function cargarAutocompletado() {
    const [provs, prods] = await Promise.all([
      fetch(`${API}/proveedores`).then(r => r.json()).catch(() => []),
      fetch(`${API}/productos`).then(r => r.json()).catch(() => [])
    ]);
    const sel = document.getElementById('cProveedor');
    const current = sel.value;
    sel.innerHTML = '<option value="">-- Seleccionar --</option>' + provs.map(p => `<option value="${esc(p.nombre)}">${esc(p.nombre)}</option>`).join('');
    if (current) sel.value = current;
    document.getElementById('cProdList').innerHTML = prods.map(p => `<option value="${esc(p)}">`).join('');
  }

  // ── PROVEEDORES CRUD ─────────────────────────────────────────────
  window.comprasAbrirProveedores = async function () {
    document.getElementById('provModal').style.display = 'flex';
    await comprasListarProveedores();
  };

  window.comprasCerrarProveedores = function () {
    document.getElementById('provModal').style.display = 'none';
  };

  async function comprasListarProveedores() {
    const provs = await fetch(`${API}/proveedores`).then(r => r.json()).catch(() => []);
    const lista = document.getElementById('provLista');
    if (!provs.length) { lista.innerHTML = '<p class="text-muted" style="font-size:.9em">No hay proveedores.</p>'; return; }
    lista.innerHTML = provs.map(p => `
      <div class="prov-item" data-id="${p.id}">
        <span>${esc(p.nombre)}</span>
        <button class="btn btn-secondary btn-xs" onclick="comprasEditarProveedor(${p.id},'${esc(p.nombre).replace(/'/g,"\\'")}')">✏️</button>
        <button class="btn btn-danger btn-xs" onclick="comprasEliminarProveedor(${p.id},'${esc(p.nombre).replace(/'/g,"\\'")}')">🗑</button>
      </div>
    `).join('');
  }

  window.comprasCrearProveedor = async function () {
    const inp = document.getElementById('provNuevoNombre');
    const nombre = inp.value.trim();
    if (!nombre) return;
    const res = await fetch(`${API}/proveedores`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nombre}) });
    const data = await res.json();
    if (!data.ok) return alert(data.error || 'Error');
    inp.value = '';
    await comprasListarProveedores();
    await cargarAutocompletado();
  };

  window.comprasEditarProveedor = async function (id, actual) {
    const nuevo = prompt('Nuevo nombre para "' + actual + '":', actual);
    if (!nuevo || nuevo.trim() === actual) return;
    const res = await fetch(`${API}/proveedores/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nombre:nuevo.trim()}) });
    const data = await res.json();
    if (!data.ok) return alert(data.error || 'Error');
    await comprasListarProveedores();
    await cargarAutocompletado();
  };

  window.comprasEliminarProveedor = async function (id, nombre) {
    if (!confirm('¿Eliminar proveedor "' + nombre + '"?')) return;
    const res = await fetch(`${API}/proveedores/${id}`, { method:'DELETE' });
    const data = await res.json();
    if (!data.ok) return alert(data.error || 'Error');
    await comprasListarProveedores();
    await cargarAutocompletado();
  };

  // ── RESUMEN ──────────────────────────────────────────────────────
  function comprasIniciarResumen() {
    const ahora = new Date();
    const m = String(ahora.getMonth() + 1).padStart(2, '0');
    const y = String(ahora.getFullYear());
    const rMes  = document.getElementById('rMes');  if (rMes)  rMes.value  = m;
    const rAnio = document.getElementById('rAnio'); if (rAnio) rAnio.value = y;
  }

  window.comprasCargarResumen = async function () {
    const mes     = document.getElementById('rMes')?.value;
    const anio    = document.getElementById('rAnio')?.value;
    const agrupar = document.getElementById('rAgrupar').value;

    try {
      const params = new URLSearchParams({ agrupar });
      if (mes && anio) {
        const ul = new Date(+anio, +mes, 0).getDate();
        params.set('desde', `${anio}-${mes}-01`);
        params.set('hasta', `${anio}-${mes}-${String(ul).padStart(2,'0')}`);
      }
      const rows = await fetch(`${API}/resumen?${params}`).then(r => r.json());

      if (!rows.length) {
        document.getElementById('tablaResumen').innerHTML = '<p class="text-center text-muted" style="padding:30px">Sin datos para el período.</p>';
        return;
      }

      const totalGeneral = rows.reduce((s, r) => s + r.total, 0);
      const label = agrupar === 'producto' ? 'Producto' : 'Proveedor';

      document.getElementById('tablaResumen').innerHTML = `
        <table class="data-table">
          <thead><tr>
            <th>${label}</th>
            <th style="text-align:center">Cantidad</th>
            <th style="text-align:right">Total</th>
            <th style="text-align:right">%</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `<tr>
              <td>${esc(r.nombre)}</td>
              <td style="text-align:center">${r.qty}</td>
              <td style="text-align:right;font-weight:600;color:var(--primary)">${fmt(r.total)}</td>
              <td style="text-align:right;color:var(--text-muted)">${(r.total/totalGeneral*100).toFixed(1)}%</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr style="border-top:2px solid var(--border)">
            <td><strong>TOTAL</strong></td>
            <td style="text-align:center"><strong>${rows.reduce((s,r)=>s+r.qty,0)}</strong></td>
            <td style="text-align:right"><strong style="color:var(--primary)">${fmt(totalGeneral)}</strong></td>
            <td></td>
          </tr></tfoot>
        </table>`;
    } catch(e) { document.getElementById('tablaResumen').innerHTML = '<p class="text-center text-muted" style="padding:30px">Error al cargar.</p>'; }
  };

  // ── UTIL ─────────────────────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── INIT ─────────────────────────────────────────────────────────
  (function comprasInit() {
    const hoy = new Date().toISOString().slice(0, 10);
    const el  = document.getElementById('comprasFechaHoy');
    if (el) el.textContent = new Date().toLocaleDateString('es-PE', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

    // Filtros: por defecto mes actual
    const y = hoy.slice(0,4), m = hoy.slice(5,7);
    const cMes  = document.getElementById('cMes');  if (cMes)  cMes.value  = m;
    const cAnio = document.getElementById('cAnio'); if (cAnio) cAnio.value = y;
    const cdm = document.getElementById('cDashMesFiltro');  if (cdm) cdm.value = m;
    const cda = document.getElementById('cDashAnio'); if (cda) cda.value = y;
    comprasIniciarResumen();
    comprasCargarDashboard();
    comprasCargar();
  })();
})();
