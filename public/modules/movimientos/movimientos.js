/* ================================================================
   MÓDULO MOVIMIENTOS DKP — Frontend
   ================================================================ */

const DKPAPI = '/api/movimientos';
const dkpFmt = n => 'S/. ' + (+n || 0).toFixed(2);
let dkpMesActual = new Date().toISOString().slice(0, 7);

// ── Inicialización ───────────────────────────────────────────────
(function dkpInit() {
  const hoy = new Date().toISOString().split('T')[0];
  ['dkpVentaFecha','dkpCompraFecha','dkpCompraFechaIng','dkpMovFecha'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = hoy;
  });
  const [dkpY, dkpM] = dkpMesActual.split('-');
  const dkpMesSel = document.getElementById('dkpMes');
  const dkpAnioEl = document.getElementById('dkpAnio');
  if (dkpMesSel) dkpMesSel.value = dkpM;
  if (dkpAnioEl) dkpAnioEl.value = dkpY;

  dkpActualizarCardsToolbar('balance');
  dkpCargarBalance();
  dkpCargarProductosSelect();
})();

// ── Tabs ─────────────────────────────────────────────────────────
function dkpTab(tab) {
  document.querySelectorAll('.dkp-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('#modTabsSlot .mod-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('dkp-' + tab)?.classList.add('active');
  document.querySelectorAll('#modTabsSlot .mod-tab').forEach(b => {
    if (b.getAttribute('onclick')?.includes(`'${tab}'`)) b.classList.add('active');
  });
  if (tab === 'ventas')   dkpCargarVentas();
  if (tab === 'compras')  dkpCargarCompras();
  if (tab === 'movs')     dkpCargarMovimientos();
  if (tab === 'catalogo') dkpCargarProductos();
  if (tab === 'balance')  dkpCargarBalance();
  dkpActualizarCardsToolbar(tab);
}

function dkpActualizarCardsToolbar(tab) {
  const cardsVentas = document.getElementById('dkpCardsVentas');
  const cardsCompras = document.getElementById('dkpCardsCompras');
  const cardsMovs = document.getElementById('dkpCardsMovs');
  const cardsBalance = document.getElementById('dkpCardsBalance');
  if (!cardsVentas || !cardsCompras || !cardsMovs || !cardsBalance) return;

  cardsVentas.style.display  = tab === 'ventas' ? 'grid' : 'none';
  cardsCompras.style.display = tab === 'compras' ? 'grid' : 'none';
  cardsMovs.style.display    = tab === 'movs' ? 'grid' : 'none';
  cardsBalance.style.display = tab === 'balance' ? 'grid' : 'none';
}

function dkpCambiarMes() {
  const mes  = document.getElementById('dkpMes')?.value;
  const anio = document.getElementById('dkpAnio')?.value;
  if (mes && anio) dkpMesActual = `${anio}-${mes}`;
  dkpCargarBalance();
  dkpCargarVentas();
  dkpCargarCompras();
  dkpCargarMovimientos();
}

// ════════════════ BALANCE ════════════════

async function dkpCargarBalance() {
  try {
    const d = await fetch(`${DKPAPI}/balance?mes=${dkpMesActual}`).then(r => r.json());
    document.getElementById('balVentas').textContent   = dkpFmt(d.totalVentas);
    document.getElementById('balCompras').textContent  = dkpFmt(d.totalCompras);
    document.getElementById('balMovs').textContent     = dkpFmt(d.valorMovs);
    const balComisionEl = document.getElementById('balComision');
    if (balComisionEl) balComisionEl.textContent = dkpFmt(d.comision);
    document.getElementById('balUtilidad').textContent = dkpFmt(d.utilidad);
    document.getElementById('balUtilidad').className   = d.utilidad >= 0 ? 'text-success' : 'text-danger';
    const balUtilCardTop = document.getElementById('balUtilCardTop');
    if (balUtilCardTop) balUtilCardTop.className = d.utilidad >= 0 ? 'card card-success' : 'card card-danger';
    document.getElementById('balMesLabel').textContent = `(${dkpMesActual})`;

    // KPIs cabecera
    document.getElementById('kpiFecha').textContent    = d.kpi.mejorDiaFecha;
    document.getElementById('kpiMonto').textContent    = dkpFmt(d.kpi.mejorDiaMonto);
    document.getElementById('kpiProd').textContent     = d.kpi.topProducto;
    document.getElementById('kpiProdCant').textContent = `${(+d.kpi.topProductoCant || 0).toFixed(2)} kg`;
    document.getElementById('kpiUtilidad').textContent = dkpFmt(d.utilidad);
    document.getElementById('kpiUtilidad').className   = 'card-value ' + (d.utilidad >= 0 ? 'text-success' : 'text-danger');
    document.getElementById('kpiUtilCard').className   = 'card ' + (d.utilidad >= 0 ? 'card-success' : 'card-danger');

    // Rellenar gastos editables
    const g = d.gasto;
    document.getElementById('gAgua').value     = g.agua     || 0;
    document.getElementById('gLuz').value      = g.luz      || 0;
    document.getElementById('gPersonal').value = g.personal || 0;
    document.getElementById('gOtros').value    = g.otros    || 0;
  } catch { /* silencioso */ }
}

async function dkpGuardarGastos() {
  const body = {
    mes:      dkpMesActual,
    agua:     +document.getElementById('gAgua').value    || 0,
    luz:      +document.getElementById('gLuz').value     || 0,
    personal: +document.getElementById('gPersonal').value || 0,
    otros:    +document.getElementById('gOtros').value   || 0
  };
  const r = await fetch(`${DKPAPI}/gastos`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(r => r.json());
  if (r.ok) {
    const msg = document.getElementById('gastoMsg');
    msg.textContent = '✓ Guardado';
    setTimeout(() => msg.textContent = '', 2500);
    dkpCargarBalance();
  }
}

function dkpActualizarGastos() {
  // Recalcula la utilidad visual en tiempo real (sin guardar)
}

// ════════════════ VENTAS ════════════════

async function dkpCargarVentas() {
  const t = document.getElementById('tablaDkpVentas');
  t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Cargando...</p>';
  try {
    const d = await fetch(`${DKPAPI}/ventas?mes=${dkpMesActual}`).then(r => r.json());
    document.getElementById('dkpVentasTotalMonto').textContent = dkpFmt(d.total || 0);
    if (!d.ventas?.length) { t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Sin registros</p>'; return; }
    t.innerHTML = `<table>
      <thead><tr><th>Fecha</th><th>Monto</th><th>Nota</th><th></th></tr></thead>
      <tbody>${d.ventas.map(v => `<tr>
        <td>${v.fecha}<br><span style="color:#888;font-size:.975em">${v.hora || '12:12:12'}</span></td>
        <td><strong class="text-primary">${dkpFmt(v.monto)}</strong></td>
        <td class="text-muted" style="font-size:.82em">${v.nota || '—'}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-secondary btn-sm btn-icon" onclick="dkpEditarVenta(${v.id})">✏️</button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="dkpEliminarVenta(${v.id})">🗑️</button>
        </td></tr>`).join('')}</tbody>
    </table>`;
  } catch { t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Error</p>'; }
}

async function dkpGuardarVenta() {
  const id = document.getElementById('dkpVentaId').value;
  const body = { id: id || undefined, fecha: document.getElementById('dkpVentaFecha').value,
    monto: +document.getElementById('dkpVentaMonto').value || 0,
    nota:  document.getElementById('dkpVentaNota').value };
  if (!body.fecha) return alert('Ingresá la fecha.');
  if (!body.monto) return alert('Ingresá el monto.');
  const r = await fetch(`${DKPAPI}/ventas`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(r => r.json());
  if (r.ok) { dkpCancelarVenta(); dkpCargarVentas(); dkpCargarBalance(); }
  else alert(r.error);
}

async function dkpEditarVenta(id) {
  const d = await fetch(`${DKPAPI}/ventas?mes=`).then(r => r.json());
  const v = d.ventas.find(x => x.id === id); if (!v) return;
  document.getElementById('dkpVentaId').value     = id;
  document.getElementById('dkpVentaFecha').value  = v.fecha;
  document.getElementById('dkpVentaMonto').value  = v.monto;
  document.getElementById('dkpVentaNota').value   = v.nota || '';
  document.getElementById('dkpVentaTitulo').textContent = 'Editar Venta';
  document.getElementById('btnDkpVentaCancel').style.display = '';
}

async function dkpEliminarVenta(id) {
  if (!confirm('¿Eliminar?')) return;
  const r = await fetch(`${DKPAPI}/ventas/${id}`, { method:'DELETE' }).then(r => r.json());
  if (r.ok) { dkpCargarVentas(); dkpCargarBalance(); }
}

function dkpCancelarVenta() {
  ['dkpVentaId','dkpVentaMonto','dkpVentaNota'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('dkpVentaFecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('dkpVentaTitulo').textContent = 'Nueva Venta';
  document.getElementById('btnDkpVentaCancel').style.display = 'none';
}

// ════════════════ COMPRAS ════════════════

async function dkpCargarCompras() {
  const t = document.getElementById('tablaDkpCompras');
  t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Cargando...</p>';
  try {
    const d = await fetch(`${DKPAPI}/compras?mes=${dkpMesActual}`).then(r => r.json());
    document.getElementById('dkpComprasTotalGasto').textContent = dkpFmt(d.total || 0);
    if (!d.compras?.length) { t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Sin registros</p>'; return; }
    t.innerHTML = `<table>
      <thead><tr><th>Fecha</th><th>Proveedor</th><th>Insumo</th><th>Cant</th><th>Total</th><th>Nota</th><th></th></tr></thead>
      <tbody>${d.compras.map(c => `<tr>
        <td>${c.fecha}<br><span style="color:#888;font-size:.975em">${c.hora || '12:12:12'}</span></td><td class="text-muted">${c.prov || '—'}</td>
        <td>${c.insumo}</td><td class="text-muted">${c.cant} kg</td>
        <td><strong class="text-danger">${dkpFmt(c.total)}</strong></td>
        <td class="text-muted" style="font-size:.82em">${c.nota || '—'}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-secondary btn-sm btn-icon" onclick="dkpEditarCompra(${c.id})">✏️</button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="dkpEliminarCompra(${c.id})">🗑️</button>
        </td></tr>`).join('')}</tbody>
    </table>`;
  } catch { t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Error</p>'; }
}

function dkpCompraFilaHtml() {
  return `
    <input type="text" class="dkp-compra-insumo" placeholder="Producto comprado" required>
    <input type="number" class="dkp-compra-cant" step="0.01" min="0" value="0">
    <input type="number" class="dkp-compra-total" step="0.01" min="0" value="0">
    <input type="text" class="dkp-compra-nota" placeholder="Opcional...">
    <button type="button" class="btn btn-danger btn-xs" onclick="dkpCompraEliminarFila(this)">✕</button>
  `;
}

function dkpCompraResetFormulario() {
  document.getElementById('dkpCompraId').value = '';
  document.getElementById('dkpCompraFecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('dkpCompraFechaIng').value = new Date().toISOString().split('T')[0];
  document.getElementById('dkpCompraProv').value = '';
  const filas = document.getElementById('dkpCompraFilas');
  filas.innerHTML = '';
  dkpCompraAgregarFila();
  document.getElementById('dkpCompraTitulo').textContent = 'Nueva Compra';
  document.getElementById('dkpBtnAddCompraFila').style.display = '';
}

function dkpAbrirCompraModal() {
  dkpCompraResetFormulario();
  document.getElementById('dkpCompraModal').style.display = 'flex';
}

function dkpCerrarCompraModal() {
  document.getElementById('dkpCompraModal').style.display = 'none';
}

function dkpCompraAgregarFila() {
  const filas = document.getElementById('dkpCompraFilas');
  const row = document.createElement('div');
  row.className = 'dkp-compra-fila';
  row.innerHTML = dkpCompraFilaHtml();
  filas.appendChild(row);
}

function dkpCompraEliminarFila(btn) {
  const filas = document.getElementById('dkpCompraFilas');
  if (filas.children.length <= 1) return;
  btn.closest('.dkp-compra-fila').remove();
}

window.dkpAbrirCompraModal = dkpAbrirCompraModal;
window.dkpCerrarCompraModal = dkpCerrarCompraModal;
window.dkpCompraAgregarFila = dkpCompraAgregarFila;
window.dkpCompraEliminarFila = dkpCompraEliminarFila;

async function dkpGuardarCompra() {
  const id = document.getElementById('dkpCompraId').value;
  const fecha = document.getElementById('dkpCompraFecha').value;
  const fecha_ingreso = document.getElementById('dkpCompraFechaIng').value;
  const prov = document.getElementById('dkpCompraProv').value;

  const filas = Array.from(document.querySelectorAll('#dkpCompraFilas .dkp-compra-fila'));
  const items = filas.map(f => ({
    insumo: f.querySelector('.dkp-compra-insumo').value.trim(),
    cant: +f.querySelector('.dkp-compra-cant').value || 0,
    total: +f.querySelector('.dkp-compra-total').value || 0,
    nota: f.querySelector('.dkp-compra-nota').value.trim()
  })).filter(i => i.insumo);

  if (!fecha || !items.length) return alert('Completá fecha y al menos un insumo.');

  const body = { fecha, fecha_ingreso, prov };
  if (id) {
    body.id = id;
    Object.assign(body, items[0]);
  } else {
    body.items = items;
  }

  const r = await fetch(`${DKPAPI}/compras`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(r => r.json());
  if (r.ok) { dkpCancelarCompra(); dkpCargarCompras(); dkpCargarBalance(); }
  else alert(r.error);
}

async function dkpEditarCompra(id) {
  const d = await fetch(`${DKPAPI}/compras?mes=`).then(r => r.json());
  const c = d.compras.find(x => x.id === id); if (!c) return;
  document.getElementById('dkpCompraModal').style.display = 'flex';
  document.getElementById('dkpCompraTitulo').textContent = 'Editar Compra';
  document.getElementById('dkpCompraId').value        = id;
  document.getElementById('dkpCompraFecha').value     = c.fecha;
  document.getElementById('dkpCompraFechaIng').value  = c.fecha_ingreso || '';
  document.getElementById('dkpCompraProv').value      = c.prov || '';
  const filas = document.getElementById('dkpCompraFilas');
  filas.innerHTML = '';
  dkpCompraAgregarFila();
  const row = filas.querySelector('.dkp-compra-fila');
  row.querySelector('.dkp-compra-insumo').value = c.insumo || '';
  row.querySelector('.dkp-compra-cant').value = c.cant || 0;
  row.querySelector('.dkp-compra-total').value = c.total || 0;
  row.querySelector('.dkp-compra-nota').value = c.nota || '';
  document.getElementById('dkpBtnAddCompraFila').style.display = 'none';
}

async function dkpEliminarCompra(id) {
  if (!confirm('¿Eliminar?')) return;
  const r = await fetch(`${DKPAPI}/compras/${id}`, { method:'DELETE' }).then(r => r.json());
  if (r.ok) { dkpCargarCompras(); dkpCargarBalance(); }
}

function dkpCancelarCompra() {
  dkpCompraResetFormulario();
  dkpCerrarCompraModal();
}

// ════════════════ MOVIMIENTOS ════════════════

async function dkpCargarMovimientos() {
  const t = document.getElementById('tablaDkpMovs');
  t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Cargando...</p>';
  try {
    const d = await fetch(`${DKPAPI}/movimientos?mes=${dkpMesActual}`).then(r => r.json());
    const totalIngreso = (d.movimientos || [])
      .filter(m => m.tipo !== 'Devolución')
      .reduce((s, m) => s + (+m.valor || 0), 0);
    const totalDevolucion = (d.movimientos || [])
      .filter(m => m.tipo === 'Devolución')
      .reduce((s, m) => s + (+m.valor || 0), 0);
    const diferenciaPagar = totalIngreso - totalDevolucion;

    document.getElementById('dkpMovIngresoTotal').textContent = dkpFmt(totalIngreso);
    document.getElementById('dkpMovDevolucionTotal').textContent = dkpFmt(totalDevolucion);
    document.getElementById('dkpMovDiferenciaPagar').textContent = dkpFmt(diferenciaPagar);
    document.getElementById('dkpMovDiferenciaPagar').className = diferenciaPagar >= 0
      ? 'card-value text-success'
      : 'card-value text-danger';

    // Resumen por producto
    const res = document.getElementById('dkpResumen');
    if (Object.keys(d.resumen || {}).length) {
      res.innerHTML = Object.entries(d.resumen).map(([prod, r]) => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border-soft)">
          <strong style="font-size:.92em">${prod}</strong>
          <div style="display:flex;gap:18px;margin-top:5px;font-size:.82em">
            <span class="text-success">↑ ${r.ingreso.toFixed(2)} kg (${dkpFmt(r.val_ingreso)})</span>
            <span class="text-danger">↓ ${r.devolucion.toFixed(2)} kg (${dkpFmt(r.val_devolucion)})</span>
          </div>
        </div>`).join('');
    } else {
      res.innerHTML = '<p class="text-muted" style="font-size:.88em">Sin movimientos este mes</p>';
    }

    if (!d.movimientos?.length) { t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Sin registros</p>'; return; }
    t.innerHTML = `<table>
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Cant</th><th>Valor</th><th></th></tr></thead>
      <tbody>${d.movimientos.map(m => `<tr>
        <td>${m.fecha}<br><span style="color:#888;font-size:.975em">${m.hora || '12:12:12'}</span></td>
        <td><span style="padding:3px 10px;border-radius:6px;font-size:.8em;background:${m.tipo==='Ingreso'?'rgba(86,208,142,.15)':'rgba(255,107,107,.15)'};color:${m.tipo==='Ingreso'?'var(--success)':'var(--danger)'}">${m.tipo}</span></td>
        <td>${m.producto_nombre}</td>
        <td class="text-muted">${m.cant} kg</td>
        <td><strong>${dkpFmt(m.valor)}</strong></td>
        <td style="white-space:nowrap">
          <button class="btn btn-secondary btn-sm btn-icon" onclick="dkpEditarMov(${m.id})">✏️</button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="dkpEliminarMov(${m.id})">🗑️</button>
        </td></tr>`).join('')}</tbody>
    </table>`;
  } catch { t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Error</p>'; }
}

async function dkpGuardarMov() {
  const id = document.getElementById('dkpMovId').value;
  const body = { id: id || undefined,
    fecha:           document.getElementById('dkpMovFecha').value,
    tipo:            document.getElementById('dkpMovTipo').value,
    producto_nombre: document.getElementById('dkpMovProducto').value,
    cant:    +document.getElementById('dkpMovCant').value || 0,
    nota:            document.getElementById('dkpMovNota').value };
  if (!body.fecha || !body.producto_nombre) return alert('Completá fecha y producto.');
  const r = await fetch(`${DKPAPI}/movimientos`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(r => r.json());
  if (r.ok) { dkpCancelarMov(); dkpCargarMovimientos(); dkpCargarBalance(); }
  else alert(r.error);
}

async function dkpEditarMov(id) {
  const d = await fetch(`${DKPAPI}/movimientos?mes=`).then(r => r.json());
  const m = d.movimientos.find(x => x.id === id); if (!m) return;
  document.getElementById('dkpMovId').value       = id;
  document.getElementById('dkpMovFecha').value    = m.fecha;
  document.getElementById('dkpMovTipo').value     = m.tipo;
  document.getElementById('dkpMovProducto').value = m.producto_nombre;
  document.getElementById('dkpMovCant').value     = m.cant;
  document.getElementById('dkpMovNota').value     = m.nota || '';
  document.getElementById('dkpMovTitulo').textContent = 'Editar Movimiento';
  document.getElementById('btnDkpMovCancel').style.display = '';
}

async function dkpEliminarMov(id) {
  if (!confirm('¿Eliminar?')) return;
  const r = await fetch(`${DKPAPI}/movimientos/${id}`, { method:'DELETE' }).then(r => r.json());
  if (r.ok) { dkpCargarMovimientos(); dkpCargarBalance(); }
}

function dkpCancelarMov() {
  ['dkpMovId','dkpMovCant','dkpMovNota'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('dkpMovFecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('dkpMovTitulo').textContent = 'Nuevo Movimiento';
  document.getElementById('btnDkpMovCancel').style.display = 'none';
}

// ════════════════ CATÁLOGO ════════════════

async function dkpCargarProductos() {
  const t = document.getElementById('tablaDkpProductos');
  t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Cargando...</p>';
  try {
    const d = await fetch(`${DKPAPI}/productos`).then(r => r.json());
    if (!d.productos?.length) { t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Sin productos</p>'; return; }
    t.innerHTML = `<table>
      <thead><tr><th>Nombre</th><th>Precio/kg</th><th></th></tr></thead>
      <tbody>${d.productos.map(p => `<tr>
        <td>${p.nombre}</td>
        <td><strong class="text-primary">${dkpFmt(p.precio)}</strong></td>
        <td style="white-space:nowrap">
          <button class="btn btn-secondary btn-sm btn-icon" onclick="dkpEditarProducto(${p.id})">✏️</button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="dkpEliminarProducto(${p.id})">🗑️</button>
        </td></tr>`).join('')}</tbody>
    </table>`;
  } catch { t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Error</p>'; }
}

async function dkpCargarProductosSelect() {
  try {
    const d   = await fetch(`${DKPAPI}/productos`).then(r => r.json());
    const sel = document.getElementById('dkpMovProducto');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Seleccioná --</option>' +
      (d.productos || []).map(p => `<option value="${p.nombre}">${p.nombre} (S/.${p.precio}/kg)</option>`).join('');
  } catch { /* silencioso */ }
}

async function dkpGuardarProducto() {
  const id = document.getElementById('dkpProdId').value;
  const body = { id: id || undefined,
    nombre: document.getElementById('dkpProdNombre').value,
    precio: +document.getElementById('dkpProdPrecio').value || 0 };
  if (!body.nombre) return alert('Ingresá el nombre.');
  const r = await fetch(`${DKPAPI}/productos`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(r => r.json());
  if (r.ok) { dkpCancelarProducto(); dkpCargarProductos(); dkpCargarProductosSelect(); }
  else alert(r.error);
}

async function dkpEditarProducto(id) {
  const d = await fetch(`${DKPAPI}/productos`).then(r => r.json());
  const p = d.productos.find(x => x.id === id); if (!p) return;
  document.getElementById('dkpProdId').value     = id;
  document.getElementById('dkpProdNombre').value = p.nombre;
  document.getElementById('dkpProdPrecio').value = p.precio;
  document.getElementById('dkpProdTitulo').textContent = 'Editar Producto';
  document.getElementById('btnDkpProdCancel').style.display = '';
}

async function dkpEliminarProducto(id) {
  if (!confirm('¿Eliminar producto?')) return;
  const r = await fetch(`${DKPAPI}/productos/${id}`, { method:'DELETE' }).then(r => r.json());
  if (r.ok) { dkpCargarProductos(); dkpCargarProductosSelect(); }
}

function dkpCancelarProducto() {
  ['dkpProdId','dkpProdNombre','dkpProdPrecio'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('dkpProdTitulo').textContent = 'Nuevo Producto';
  document.getElementById('btnDkpProdCancel').style.display = 'none';
}
