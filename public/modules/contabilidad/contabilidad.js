/* ================================================================
   MÓDULO CONTABILIDAD — Frontend
   ================================================================ */

const API = '/api/contabilidad';
const fmt = n => 'S/. ' + (+n || 0).toFixed(2);

// ── Tabs internos ────────────────────────────────────────────────
function contaTab(tab) {
  document.querySelectorAll('.conta-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('#modTabsSlot .mod-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('conta-' + tab)?.classList.add('active');
  document.querySelectorAll('#modTabsSlot .mod-tab').forEach(b => {
    if (b.getAttribute('onclick')?.includes(tab)) b.classList.add('active');
  });
  if (tab === 'ventas')    contaCargarVentas();
  if (tab === 'gastos')    contaCargarGastosFijos();
  if (tab === 'balance')   contaCargarBalance();
  if (tab === 'dashboard') contaDashboard();
}

// ── Limpiar filtros (vuelve al mes corriente) ───────────────────
function contaLimpiarFiltro(seccion) {
  const ahora     = new Date();
  const mesPad    = String(ahora.getMonth() + 1).padStart(2, '0');
  const mesNoPad  = String(ahora.getMonth() + 1);
  const anioActual = String(ahora.getFullYear());
  const mesMap  = { dashboard:'dashMes',  ventas:'ventaMes',  gastos:'gastoMes',  balance:'balMes'  };
  const anioMap = { dashboard:'dashAnio', ventas:'ventaAnio', gastos:'gastoAnio', balance:'balAnio' };
  const mesEl  = document.getElementById(mesMap[seccion]);
  const anioEl = document.getElementById(anioMap[seccion]);
  if (mesEl)  mesEl.value  = seccion === 'gastos' ? mesNoPad : mesPad;
  if (anioEl) anioEl.value = anioActual;
  // gastos ya no tiene filtro tipo
  if (seccion === 'dashboard') contaDashboard();
  if (seccion === 'ventas')    contaCargarVentas();
  if (seccion === 'gastos')    contaCargarGastosFijos();
  if (seccion === 'balance')   contaCargarBalance();
}

// ── Calcula primer y último día del mes actual ───────────────────
function contaMesActual() {
  const ahora = new Date();
  const y  = ahora.getFullYear();
  const m  = String(ahora.getMonth() + 1).padStart(2, '0');
  const ul = new Date(y, ahora.getMonth() + 1, 0).getDate();
  return {
    mesDesde: `${y}-${m}-01`,
    mesHasta: `${y}-${m}-${String(ul).padStart(2, '0')}`,
    mesStr:   `${y}-${m}`
  };
}

// ════════════════ DASHBOARD ════════════════

async function contaDashboard() {
  const params = contaMesSelectParams('dashMes', 'dashAnio');
  try {
    const [rv, rb] = await Promise.all([
      fetch(`${API}/ventas${params}`).then(r => r.json()),
      fetch(`${API}/balance${params}`).then(r => r.json())
    ]);

    document.getElementById('dashTotalVentas').textContent = fmt(rv.totales?.total);
    document.getElementById('dashCantVentas').textContent  = `${rv.ventas?.length || 0} registros`;
    document.getElementById('dashTotalGastos').textContent = fmt(rb.totalGastos);
    document.getElementById('dashCantGastos').textContent  = `${Object.keys(rb.porTipo || {}).length} categorías`;
    document.getElementById('dashNomina').textContent      = fmt(0);
    document.getElementById('dashUtilidad').textContent    = fmt(rb.utilidad);
    document.getElementById('dashMargen').textContent      = `Margen: ${rb.margen}%`;
    document.getElementById('dashEfectivo').textContent    = fmt(rv.totales?.efectivo);
    document.getElementById('dashTarjeta').textContent     = fmt(rv.totales?.tarjeta);
    document.getElementById('dashMixto').textContent       = fmt(rv.totales?.mixto);

    const util = document.getElementById('dashUtilidad');
    util.className = rb.utilidad >= 0 ? 'card-value text-success' : 'card-value text-danger';
  } catch { /* silencioso */ }
}

// ════════════════ VENTAS ════════════════

async function contaCargarVentas() {
  const params = contaMesSelectParams('ventaMes', 'ventaAnio');
  const tbody = document.getElementById('tablaVentas');
  tbody.innerHTML = '<p class="text-center text-muted" style="padding:30px">Cargando...</p>';
  try {
    const data = await fetch(`${API}/ventas${params}`).then(r => r.json());
    if (!data.ventas?.length) {
      tbody.innerHTML = '<p class="text-center text-muted" style="padding:30px">Sin registros</p>';
      return;
    }
    tbody.innerHTML = `
      <table>
        <thead><tr>
          <th>Fecha</th><th>Efectivo</th><th>Tarjeta</th><th>Mixto</th><th>Total</th><th>Notas</th><th></th>
        </tr></thead>
        <tbody>
          ${data.ventas.map(v => `
            <tr>
              <td>${v.fecha}<br><span style="color:#888;font-size:.975em">${v.hora || '12:12:12'}</span></td>
              <td>${fmt(v.efectivo)}</td>
              <td>${fmt(v.tarjeta)}</td>
              <td>${fmt(v.mixto_efectivo + v.mixto_tarjeta)}</td>
              <td><strong class="text-primary">${fmt(v.total)}</strong></td>
              <td class="text-muted" style="font-size:.82em">${v.notas || '—'}</td>
              <td style="white-space:nowrap">
                <button class="btn btn-secondary btn-sm btn-icon" onclick="contaEditarVenta(${v.id})" title="Editar">✏️</button>
                <button class="btn btn-danger btn-sm btn-icon" onclick="contaEliminarVenta(${v.id})" title="Eliminar">🗑️</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch { tbody.innerHTML = '<p class="text-center text-muted" style="padding:30px">Error al cargar</p>'; }
}

function contaPreviewTotal() {
  const t = ['ventaEfectivo','ventaTarjeta','ventaMixtoEf','ventaMixtoTj']
    .reduce((s, id) => s + (+document.getElementById(id)?.value || 0), 0);
  document.getElementById('ventaPreviewTotal').textContent = fmt(t);
}

async function contaGuardarVenta() {
  const id     = document.getElementById('ventaEditId').value;
  const fecha  = document.getElementById('ventaFecha').value;
  if (!fecha) return alert('Ingresá la fecha.');

  const body = {
    fecha,
    efectivo:      +document.getElementById('ventaEfectivo').value || 0,
    tarjeta:       +document.getElementById('ventaTarjeta').value  || 0,
    mixto_efectivo:+document.getElementById('ventaMixtoEf').value  || 0,
    mixto_tarjeta: +document.getElementById('ventaMixtoTj').value  || 0,
    notas:         document.getElementById('ventaNotas').value
  };

  const total = body.efectivo + body.tarjeta + body.mixto_efectivo + body.mixto_tarjeta;
  if (total <= 0) return alert('El total debe ser mayor a 0.');

  const url    = id ? `${API}/ventas/${id}` : `${API}/ventas`;
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await res.json();
  if (data.ok) { contaCancelarVenta(); contaCargarVentas(); contaDashboard(); }
  else alert(data.error || 'Error al guardar');
}

async function contaEditarVenta(id) {
  const data = await fetch(`${API}/ventas?desde=&hasta=`).then(r => r.json());
  const v    = data.ventas.find(x => x.id === id);
  if (!v) return;
  document.getElementById('ventaEditId').value      = id;
  document.getElementById('ventaFecha').value       = v.fecha;
  document.getElementById('ventaEfectivo').value    = v.efectivo;
  document.getElementById('ventaTarjeta').value     = v.tarjeta;
  document.getElementById('ventaMixtoEf').value     = v.mixto_efectivo;
  document.getElementById('ventaMixtoTj').value     = v.mixto_tarjeta;
  document.getElementById('ventaNotas').value       = v.notas || '';
  document.getElementById('ventaFormTitulo').textContent = 'Editar Venta';
  document.getElementById('btnCancelarVenta').style.display = '';
  contaPreviewTotal();
}

async function contaEliminarVenta(id) {
  if (!confirm('¿Eliminar esta venta?')) return;
  const res = await fetch(`${API}/ventas/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.ok) { contaCargarVentas(); contaDashboard(); }
  else alert(data.error);
}

function contaCancelarVenta() {
  document.getElementById('ventaEditId').value      = '';
  document.getElementById('ventaFecha').value       = '';
  document.getElementById('ventaEfectivo').value    = 0;
  document.getElementById('ventaTarjeta').value     = 0;
  document.getElementById('ventaMixtoEf').value     = 0;
  document.getElementById('ventaMixtoTj').value     = 0;
  document.getElementById('ventaNotas').value       = '';
  document.getElementById('ventaFormTitulo').textContent = 'Nueva Venta';
  document.getElementById('btnCancelarVenta').style.display = 'none';
  document.getElementById('ventaPreviewTotal').textContent = 'S/. 0.00';
}

// ════════════════ GASTOS FIJOS MENSUALES ════════════════

let _gastosItemsCache = [];

async function contaCargarGastosFijos() {
  const mes  = document.getElementById('gastoMes')?.value || (new Date().getMonth() + 1);
  const anio = document.getElementById('gastoAnio')?.value || new Date().getFullYear();
  const tbody = document.getElementById('tablaGastosFijos');
  tbody.innerHTML = '<p class="text-center text-muted" style="padding:30px">Cargando...</p>';

  try {
    // Fetch items, valores guardados, compras y sueldos en paralelo
    const mesStr = String(mes).padStart(2, '0');
    const ul = new Date(+anio, +mes, 0).getDate();
    const desde = `${anio}-${mesStr}-01`;
    const hasta = `${anio}-${mesStr}-${String(ul).padStart(2, '0')}`;

    const [itemsRes, valoresRes, comprasRes, sueldos1Res, sueldos2Res] = await Promise.all([
      fetch(`${API}/gastos-items`).then(r => r.json()),
      fetch(`${API}/gastos-mensual?mes=${mes}&anio=${anio}`).then(r => r.json()),
      fetch(`/api/compras/resumen?desde=${desde}&hasta=${hasta}&agrupar=proveedor`).then(r => r.json()).catch(() => []),
      fetch(`/api/asistencia/sueldos?anio=${anio}&mes=${mes}&quincena=1`).then(r => r.json()).catch(() => ({ resultados: [] })),
      fetch(`/api/asistencia/sueldos?anio=${anio}&mes=${mes}&quincena=2`).then(r => r.json()).catch(() => ({ resultados: [] })),
    ]);

    const items = itemsRes.items || [];
    _gastosItemsCache = items;
    const valores = (valoresRes.valores || []);
    const valMap = {};
    valores.forEach(v => { valMap[v.item_id] = v.monto; });

    // Compras por proveedor (case insensitive map)
    const comprasMap = {};
    (Array.isArray(comprasRes) ? comprasRes : []).forEach(c => {
      comprasMap[c.nombre.toUpperCase().trim()] = +c.total || 0;
    });
    const totalCompras = Object.values(comprasMap).reduce((s, v) => s + v, 0);

    // Sueldos
    const sueldo1Total = (sueldos1Res.resultados || []).reduce((s, r) => s + (+r.sueldo || 0), 0);
    const sueldo2Total = (sueldos2Res.resultados || []).reduce((s, r) => s + (+r.sueldo || 0), 0);

    // Proveedores ya asignados a items de compras (para calcular "otros")
    const provAsignados = new Set();
    items.filter(i => i.origen === 'compras').forEach(i => {
      (i.origen_param || '').split(',').forEach(p => provAsignados.add(p.trim().toUpperCase()));
    });

    // Calcular valor auto de cada item
    function calcAuto(item) {
      if (item.origen === 'compras') {
        const provs = (item.origen_param || '').split(',').map(p => p.trim().toUpperCase());
        return provs.reduce((s, p) => s + (comprasMap[p] || 0), 0);
      }
      if (item.origen === 'compras_otros') {
        let total = 0;
        Object.entries(comprasMap).forEach(([prov, monto]) => {
          if (!provAsignados.has(prov)) total += monto;
        });
        return total;
      }
      if (item.origen === 'asistencia') {
        return item.origen_param === '1' ? sueldo1Total : sueldo2Total;
      }
      return null; // manual
    }

    let totalGeneral = 0;
    const autoSaveQueue = [];

    tbody.innerHTML = `<table class="data-table">
      <thead><tr>
        <th style="width:40px">#</th>
        <th>Ítem</th>
        <th style="width:50px">Origen</th>
        <th style="width:140px">Monto (S/.)</th>
        <th style="width:90px">Acciones</th>
      </tr></thead>
      <tbody>${items.map((item, idx) => {
        const autoVal = calcAuto(item);
        const guardado = valMap[item.id];
        const esAuto = item.origen !== 'manual';
        let monto;
        if (esAuto && autoVal !== null) {
          monto = autoVal;
          // Auto-save si el valor cambió o no existía
          if (guardado === undefined || guardado === null || Math.abs(guardado - autoVal) > 0.001) {
            autoSaveQueue.push({ item_id: item.id, monto: autoVal });
          }
        } else if (guardado !== undefined && guardado !== null) {
          monto = guardado;
        } else {
          monto = item.valor_default || 0;
        }
        totalGeneral += +monto || 0;

        const origenBadge = {
          manual: '',
          compras: '<span style="padding:2px 6px;border-radius:4px;font-size:.7rem;background:rgba(143,163,255,.15);color:var(--primary)">Compras</span>',
          compras_otros: '<span style="padding:2px 6px;border-radius:4px;font-size:.7rem;background:rgba(143,163,255,.15);color:var(--primary)">Compras</span>',
          asistencia: '<span style="padding:2px 6px;border-radius:4px;font-size:.7rem;background:rgba(86,208,142,.15);color:var(--success)">Sueldos</span>',
        };

        return `<tr>
          <td style="color:var(--text-muted);font-size:.82em">${idx + 1}</td>
          <td><strong>${item.nombre}</strong></td>
          <td>${origenBadge[item.origen] || ''}</td>
          <td>
            <input type="number" step="0.01" min="0"
              value="${(+monto || 0).toFixed(2)}"
              data-item-id="${item.id}"
              onchange="contaGuardarMontoMensual(${item.id}, this.value)"
              style="width:120px;text-align:right;font-weight:600;padding:4px 8px;font-size:.88rem">
          </td>
          <td style="white-space:nowrap">
            <button class="btn btn-secondary btn-sm btn-icon" onclick="contaEditarItem(${item.id})" title="Editar">✏️</button>
            <button class="btn btn-danger btn-sm btn-icon" onclick="contaEliminarItem(${item.id},'${item.nombre.replace(/'/g, "\\'")}')"
              title="Eliminar">🗑️</button>
          </td>
        </tr>`;
      }).join('')}
      <tr style="border-top:2px solid var(--primary);background:rgba(143,163,255,.05)">
        <td colspan="3" style="text-align:right;font-weight:700;font-size:.95rem;padding:10px 12px">TOTAL GASTOS</td>
        <td style="font-weight:700;font-size:1.05rem;color:var(--danger);padding:10px 12px">${fmt(totalGeneral)}</td>
        <td></td>
      </tr></tbody></table>`;

    // Auto-guardar valores calculados de compras/asistencia
    if (autoSaveQueue.length) {
      Promise.all(autoSaveQueue.map(s =>
        fetch(`${API}/gastos-mensual`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: s.item_id, mes: +mes, anio: +anio, monto: s.monto })
        })
      )).catch(e => console.error('Auto-save gastos:', e));
    }

  } catch(e) {
    console.error('Gastos fijos:', e);
    tbody.innerHTML = '<p class="text-center text-muted" style="padding:30px">Error al cargar</p>';
  }
}

async function contaGuardarMontoMensual(itemId, valor) {
  const mes  = document.getElementById('gastoMes')?.value || (new Date().getMonth() + 1);
  const anio = document.getElementById('gastoAnio')?.value || new Date().getFullYear();
  try {
    await fetch(`${API}/gastos-mensual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, mes: +mes, anio: +anio, monto: +valor || 0 })
    });
    // Recalcular total sin recargar toda la tabla
    let total = 0;
    document.querySelectorAll('#tablaGastosFijos input[data-item-id]').forEach(inp => {
      total += +inp.value || 0;
    });
    const totalRow = document.querySelector('#tablaGastosFijos tr:last-child td:nth-child(2)');
    if (totalRow) totalRow.textContent = fmt(total);
  } catch(e) { console.error('Error guardando monto:', e); }
}

// ── CRUD Items ──
function contaNuevoItem() {
  document.getElementById('gastoItemId').value = '';
  document.getElementById('gastoItemNombre').value = '';
  document.getElementById('gastoItemDefault').value = '0';
  document.getElementById('gastoItemOrigen').value = 'manual';
  document.getElementById('gastoItemParam').value = '';
  document.getElementById('gastoItemModalTitulo').textContent = 'Nuevo Ítem';
  contaToggleOrigenParam();
  document.getElementById('gastoItemModal').classList.remove('hide');
}

function contaEditarItem(id) {
  const item = _gastosItemsCache.find(i => i.id === id);
  if (!item) return;
  document.getElementById('gastoItemId').value = id;
  document.getElementById('gastoItemNombre').value = item.nombre;
  document.getElementById('gastoItemDefault').value = item.valor_default || 0;
  document.getElementById('gastoItemOrigen').value = item.origen;
  document.getElementById('gastoItemParam').value = item.origen_param || '';
  document.getElementById('gastoItemModalTitulo').textContent = 'Editar Ítem';
  contaToggleOrigenParam();
  document.getElementById('gastoItemModal').classList.remove('hide');
}

function contaCancelarItem() {
  document.getElementById('gastoItemModal').classList.add('hide');
}

function contaToggleOrigenParam() {
  const origen = document.getElementById('gastoItemOrigen').value;
  const group = document.getElementById('gastoItemParamGroup');
  const label = document.getElementById('gastoItemParamLabel');
  if (origen === 'compras') {
    group.style.display = '';
    label.textContent = 'Proveedor(es)';
  } else if (origen === 'asistencia') {
    group.style.display = '';
    label.textContent = 'Quincena (1 o 2)';
  } else {
    group.style.display = 'none';
  }
}

async function contaGuardarItem() {
  const id = document.getElementById('gastoItemId').value;
  const nombre = document.getElementById('gastoItemNombre').value.trim();
  if (!nombre) return alert('Nombre requerido.');
  const body = {
    nombre,
    valor_default: +document.getElementById('gastoItemDefault').value || 0,
    origen: document.getElementById('gastoItemOrigen').value,
    origen_param: document.getElementById('gastoItemParam').value.trim()
  };
  const url = id ? `${API}/gastos-items/${id}` : `${API}/gastos-items`;
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (data.ok) { contaCancelarItem(); contaCargarGastosFijos(); }
  else alert(data.error || 'Error al guardar');
}

function contaEliminarItem(id, nombre) {
  document.getElementById('gastoDeleteItemId').value = id;
  document.getElementById('gastoDeleteItemNombre').textContent = nombre;
  document.getElementById('gastoDeleteItemModal').classList.remove('hide');
}

function contaCancelarDeleteItem() {
  document.getElementById('gastoDeleteItemModal').classList.add('hide');
}

async function contaConfirmarDeleteItem() {
  const id = document.getElementById('gastoDeleteItemId').value;
  const res = await fetch(`${API}/gastos-items/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.ok) { contaCancelarDeleteItem(); contaCargarGastosFijos(); }
  else alert(data.error || 'Error al eliminar');
}

// ════════════════ BALANCE ════════════════

async function contaCargarBalance() {
  const params = contaFiltroBalanceMensual();
  try {
    const d = await fetch(`${API}/balance${params}`).then(r => r.json());
    const utilidad = (+d.totalVentas || 0) - (+d.totalGastos || 0);
    const margen   = (+d.totalVentas || 0) > 0 ? ((utilidad / +d.totalVentas) * 100).toFixed(1) : 0;

    document.getElementById('balVentasBrutas').textContent = fmt(d.totalVentas);
    document.getElementById('balIGV').textContent          = fmt(d.igv);
    document.getElementById('balVentasNetas').textContent  = fmt(d.ventasNetas);
    document.getElementById('balTotalGastos').textContent  = fmt(d.totalGastos);
    document.getElementById('balUtilidad').textContent     = fmt(utilidad);
    document.getElementById('balMargen').textContent       = `Margen: ${margen}%`;
    document.getElementById('balUtilidad').className       = utilidad >= 0 ? 'text-success' : 'text-danger';

    const total = d.totalGastos || 1;
    document.getElementById('balPorTipo').innerHTML = Object.entries(d.porTipo || {}).map(([k, v]) => `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-soft)">
        <span class="text-muted">${k}</span>
        <strong class="text-danger">${fmt(v)}</strong>
      </div>`).join('') || '<p class="text-muted">Sin gastos</p>';

    document.getElementById('balComposicion').innerHTML = Object.entries(d.porTipo || {}).map(([k, v]) => {
      const pct = ((v / total) * 100).toFixed(1);
      return `
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span class="text-muted" style="font-size:.85em">${k}</span>
            <span style="font-size:.85em">${pct}%</span>
          </div>
          <div style="height:6px;background:var(--border);border-radius:3px">
            <div style="height:6px;width:${pct}%;background:var(--danger);border-radius:3px;transition:.4s ease"></div>
          </div>
        </div>`;
    }).join('') || '<p class="text-muted">Sin gastos</p>';
  } catch { /* silencioso */ }
}

function contaFiltroBalanceMensual() {
  const m = Number(document.getElementById('balMes')?.value);
  const y = Number(document.getElementById('balAnio')?.value);
  if (!y || !m) return '';
  const desde = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
  const ultimoDia = new Date(y, m, 0).getDate();
  const hasta = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  return `?desde=${desde}&hasta=${hasta}`;
}

// ── Helper: params desde select de mes + año ────────────────────
function contaMesSelectParams(mesId, anioId) {
  const mes  = document.getElementById(mesId)?.value;
  const anio = document.getElementById(anioId)?.value || new Date().getFullYear();
  if (!mes || !anio) return '';
  const ul = new Date(+anio, +mes, 0).getDate();
  return `?desde=${anio}-${mes}-01&hasta=${anio}-${mes}-${String(ul).padStart(2,'0')}`;
}

// ── Helper (legado) ──────────────────────────────────────────────
function contaFiltroParams(desdeId, hastaId) {
  const desde = document.getElementById(desdeId)?.value;
  const hasta = document.getElementById(hastaId)?.value;
  const p = [];
  if (desde) p.push(`desde=${desde}`);
  if (hasta) p.push(`hasta=${hasta}`);
  return p.length ? '?' + p.join('&') : '';
}

// ── Inicialización cuando el módulo carga ────────────────────────
(function contaInit() {
  // Fecha de hoy por defecto en formularios
  const hoy = new Date().toISOString().split('T')[0];
  const ventaFEl = document.getElementById('ventaFecha');
  if (ventaFEl) ventaFEl.value = hoy;

  // Filtros al mes corriente
  const ahora     = new Date();
  const mesActual  = String(ahora.getMonth() + 1).padStart(2, '0');
  const mesNoPad   = String(ahora.getMonth() + 1);
  const anioActual = String(ahora.getFullYear());
  ['dashMes','ventaMes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = mesActual; });
  { const el = document.getElementById('gastoMes'); if (el) el.value = mesNoPad; }
  ['dashAnio','ventaAnio','gastoAnio'].forEach(id => { const el = document.getElementById(id); if (el) el.value = anioActual; });

  const balMes = document.getElementById('balMes');
  const balAnio = document.getElementById('balAnio');
  if (balMes) balMes.value = mesActual;
  if (balAnio) balAnio.value = anioActual;

  contaDashboard();
})();
