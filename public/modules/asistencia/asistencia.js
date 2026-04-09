/* ================================================================
   MÓDULO ASISTENCIA — Frontend
   ================================================================ */

const AAPI = '/api/asistencia';
const aFmt = n => 'S/. ' + (+n || 0).toFixed(2);

// ── Init ─────────────────────────────────────────────────────────
(function asistInit() {
  const hoy   = new Date();
  const hoyISO = hoy.toISOString().split('T')[0];
  const dia   = hoy.getDate();
  const y     = hoy.getFullYear();
  const m     = String(hoy.getMonth() + 1).padStart(2, '0');
  const ultDia = new Date(y, hoy.getMonth() + 1, 0).getDate();
  const qDesde = dia <= 15 ? `${y}-${m}-01` : `${y}-${m}-16`;
  const qHasta = dia <= 15 ? `${y}-${m}-15` : `${y}-${m}-${String(ultDia).padStart(2,'0')}`;

  const regMes  = document.getElementById('regMes');  if (regMes)  regMes.value  = m;
  const regAnio = document.getElementById('regAnio'); if (regAnio) regAnio.value = y;
  const regFecha = document.getElementById('regFecha'); if (regFecha) regFecha.value = hoyISO;

  const anioSel = document.getElementById('sueldoAnio');
  if (anioSel) {
    const y = new Date().getFullYear();
    for (let i = y; i >= y - 3; i--) anioSel.innerHTML += `<option value="${i}">${i}</option>`;
    document.getElementById('sueldoMes').value = new Date().getMonth() + 1;
    document.getElementById('sueldoQuincena').value = new Date().getDate() <= 15 ? '1' : '2';
  }

  const user = window.usuarioActual;
  if (user?.permisos?.asistencia_config) {
    document.querySelectorAll('.asist-admin-tab').forEach(el => {
      if (el.id === 'regForm') {
        return;
      }
      if (el.classList.contains('mod-tab')) {
        el.style.display = 'inline-flex';
      } else if (el.classList.contains('form-card')) {
        el.style.display = 'block';
      } else {
        el.style.display = 'inline-block';
      }
    });
  }

  // Reloj en tiempo real
  asistActualizarReloj();
  setInterval(asistActualizarReloj, 1000);

  // Teclado físico (para el panel marcar)
  document.addEventListener('keydown', e => {
    const loginModal = document.getElementById('kioscoLoginModal');
    if (loginModal && !loginModal.classList.contains('hide')) return;

    const ae = document.activeElement;
    const tag = (ae?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || ae?.isContentEditable) return;

    const marcaDocEl = document.getElementById('marcaDoc');
    if (!marcaDocEl) return;
    const secActiva = document.getElementById('asist-marcar');
    if (!secActiva?.classList.contains('active')) return;
    if (e.key >= '0' && e.key <= '9') { asistTecla(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace')   { asistTeclaBorrar(); e.preventDefault(); }
    else if (e.key === 'Delete')      { asistTeclaLimpiar(); e.preventDefault(); }
    else if (e.key === 'Enter')       { asistMarcar(); e.preventDefault(); }
  });

  asistTab('marcar');
  asistCargarPanelMarcar();
  asistCargarEmpleadosSelect();
})();

// ── Reloj ────────────────────────────────────────────────────────
function asistActualizarReloj() {
  const el = document.getElementById('asistReloj');
  const ef = document.getElementById('asistFechaTexto');
  if (!el) return;
  const ahora = new Date();
  const h = String(ahora.getHours()).padStart(2,'0');
  const m = String(ahora.getMinutes()).padStart(2,'0');
  const s = String(ahora.getSeconds()).padStart(2,'0');
  el.textContent = `${h}:${m}:${s}`;
  if (ef) {
    const dias  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    ef.textContent = `${dias[ahora.getDay()]}, ${ahora.getDate()} de ${meses[ahora.getMonth()]} de ${ahora.getFullYear()}`;
  }
}

// ── Tabs ─────────────────────────────────────────────────────────
function asistTab(tab) {
  document.querySelectorAll('.asist-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('#modTabsSlot .mod-tab').forEach(b => b.classList.remove('active'));
  const sec = document.getElementById('asist-' + tab);
  if (sec) sec.classList.add('active');
  document.querySelectorAll('#modTabsSlot .mod-tab').forEach(b => {
    if (b.getAttribute('onclick')?.includes(`'${tab}'`)) b.classList.add('active');
  });
  if (tab === 'marcar')    asistIniciarCamara();
  else                     asistDetenerCamara();
  if (tab === 'hoy')       asistCargarHoy();
  if (tab === 'empleados') asistCargarEmpleados();
  if (tab === 'registros') asistCargarRegistros();
  if (tab === 'sueldos')   asistCargarSueldos();
  if (tab === 'auditoria') asistCargarAuditoria();
  if (tab === 'config')    asistCargarConfig();
}

// ════════════════ TECLADO NUMÉRICO ════════════════

window.asistTecla = function(digito) {
  const el = document.getElementById('marcaDoc');
  if (!el || el.value.length >= 12) return;
  el.value += digito;
  if (!_camaraStream) asistIniciarCamara();
  asistDispararPreview();
};

window.asistTeclaBorrar = function() {
  const el = document.getElementById('marcaDoc');
  if (!el) return;
  el.value = el.value.slice(0, -1);
  asistDispararPreview();
};

window.asistTeclaLimpiar = function() {
  const el = document.getElementById('marcaDoc');
  if (el) el.value = '';
  const pv = document.getElementById('marcaPreview');
  if (pv) pv.innerHTML = '&nbsp;';
};

// ── Preview de empleado ───────────────────────────────────────────
let _previewTimer = null;
function asistDispararPreview() {
  clearTimeout(_previewTimer);
  const doc = document.getElementById('marcaDoc')?.value || '';
  const pv  = document.getElementById('marcaPreview');
  if (!pv) return;
  if (doc.length < 6) { pv.innerHTML = '&nbsp;'; return; }
  _previewTimer = setTimeout(() => asistBuscarPreview(doc), 350);
}

async function asistBuscarPreview(doc) {
  const pv = document.getElementById('marcaPreview');
  if (!pv) return;
  try {
    const data = await fetch(`${AAPI}/buscar?documento=${encodeURIComponent(doc)}`).then(r => r.json());
    if (data.encontrado) {
      const estados = {
        sin_registro: `🟡 Marcará <strong style="color:var(--success)">entrada</strong>`,
        con_entrada:  `🟢 Marcará <strong style="color:var(--warning)">salida</strong>`,
        completo:     `✅ Ya tiene entrada y salida hoy`
      };
      pv.innerHTML = `<span style="color:var(--success);font-weight:600">${data.nombre}</span>
        <span style="color:var(--text-muted)"> (${data.tipo_doc}) — </span>${estados[data.estado]||''}`;
    } else {
      pv.innerHTML = '<span style="color:var(--danger)">Documento no encontrado</span>';
    }
  } catch { pv.innerHTML = '&nbsp;'; }
}

// ════════════════ MARCAR ════════════════

window.asistMarcar = async function() {
  const doc = document.getElementById('marcaDoc')?.value.trim();
  if (!doc) return;

  try {
    const fotoBase64 = asistCapturarFoto();
    const res  = await fetch(`${AAPI}/marcar`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ documento: doc, foto_base64: fotoBase64 }) });
    const data = await res.json();
    const flash = document.getElementById('marcaFlash');

    if (data.ok) {
      const esEntrada = data.accion === 'entrada';
      const emoji = esEntrada ? '✅' : '🚪';
      if (flash) {
        flash.style.display = 'block';
        flash.style.background = esEntrada ? 'rgba(86,208,142,.15)' : 'rgba(197,168,111,.15)';
        flash.style.color      = esEntrada ? 'var(--success)' : 'var(--warning)';
        flash.style.border     = `1px solid ${esEntrada ? 'var(--success)' : 'var(--warning)'}`;
        flash.textContent = `${emoji} ${esEntrada ? 'Entrada' : 'Salida'} registrada — ${data.nombre}  •  ${data.hora}`;
        setTimeout(() => { if (flash) flash.style.display = 'none'; }, 4000);
      }
      asistTeclaLimpiar();
      asistCargarPanelMarcar(); // refrescar columna derecha
    } else {
      if (flash) {
        flash.style.display    = 'block';
        flash.style.background = 'rgba(255,107,107,.12)';
        flash.style.color      = 'var(--danger)';
        flash.style.border     = '1px solid var(--danger)';
        flash.textContent = '⚠ ' + (data.error || 'Error al registrar.');
        setTimeout(() => { if (flash) flash.style.display = 'none'; }, 4000);
      }
    }
  } catch(e) {
    const flash = document.getElementById('marcaFlash');
    if (flash) {
      flash.style.display = 'block';
      flash.style.background = 'rgba(255,107,107,.12)';
      flash.style.color = 'var(--danger)';
      flash.style.border = '1px solid var(--danger)';
      flash.textContent = '⚠ Error de conexión';
    }
  }
};

// ── Panel derecho del marcar ──────────────────────────────────────
async function asistCargarPanelMarcar() {
  try {
    const data = await fetch(`${AAPI}/dashboard`).then(r => r.json());

    // Stats
    const presentes = (data.registros || []).length;
    const elPres = document.getElementById('marcaStatPresentes');
    const elTot  = document.getElementById('marcaStatTotal');
    if (elPres) elPres.textContent = presentes;
    if (elTot)  elTot.textContent  = data.total || 0;

    // Último registro
    const elUlt = document.getElementById('marcaUltimo');
    if (elUlt) {
      const regs = data.registros || [];
      // El primero en la lista es el más reciente (ORDER BY hora_entrada DESC)
      const ult = regs[0];
      if (ult) {
        const horaUlt = ult.hora_salida || ult.hora_entrada || '';
        elUlt.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0">
            <div style="display:flex;align-items:center;gap:10px">
              ${ult.foto
                ? `<img src="/uploads/fotos/${ult.foto}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid var(--primary)">`
                : `<div style="width:36px;height:36px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center">👤</div>`}
              <span style="font-weight:700;font-size:.95rem">${ult.nombre_completo}</span>
            </div>
            <div style="text-align:right">
              <div style="font-family:monospace;font-size:1.3rem;font-weight:700;color:var(--primary)">${horaUlt}</div>
              <div id="tiempoTranscurrido" style="font-size:.72rem;color:var(--text-muted)"></div>
            </div>
          </div>`;
        // Timer transcurrido
        asistIniciarTranscurrido(data.hoy + 'T' + (ult.hora_salida_raw || ult.hora_entrada_raw || horaUlt + ':00'));
      } else {
        elUlt.innerHTML = `<div style="text-align:center;padding:8px 0;color:var(--text-muted);font-size:.78rem">Sin registros hoy</div>`;
      }
    }

    // Leaderboard
    const elLb = document.getElementById('marcaLeaderboard');
    const elQL = document.getElementById('marcaQLabel');
    if (elQL && data.periodo) elQL.textContent = `Quincena ${data.periodo.desde} — ${data.periodo.hasta}`;
    if (elLb) {
      const lb = (data.leaderboard || []).filter(x => x.dias > 0).slice(0, 8);
      const maxDias = Math.max(...lb.map(x => x.dias), 1);
      const medallas = ['🥇','🥈','🥉'];
      elLb.innerHTML = lb.length
        ? lb.map((x, i) => `
            <div class="lb-item">
              <div style="display:flex;justify-content:space-between;align-items:center;font-size:.8rem">
                <span style="font-weight:600">
                  ${i < 3 ? `<span style="margin-right:4px">${medallas[i]}</span>` : `<span style="color:var(--text-muted);margin-right:6px">${i+1}.</span>`}
                  ${x.nombre}
                </span>
                <span style="font-weight:700;font-family:monospace;color:var(--primary)">${x.dias}<span style="font-weight:400;font-size:.75em;color:var(--text-muted)">d</span></span>
              </div>
              <div class="lb-bar-bg">
                <div class="lb-bar ${i===0?'lb-bar-1':i===1?'lb-bar-2':i===2?'lb-bar-3':'lb-bar-etc'}"
                     style="width:${(x.dias/maxDias*100).toFixed(1)}%"></div>
              </div>
            </div>`).join('')
        : '<p style="font-size:.8rem;color:var(--text-muted)">Sin datos en este período</p>';
    }

    // Marcas de hoy
    const elMarcas = document.getElementById('marcasHoyLista');
    const elBadge  = document.getElementById('marcaQtyBadge');
    const regsHoy  = data.registros || [];
    if (elBadge) elBadge.textContent = regsHoy.length;
    if (elMarcas) {
      elMarcas.innerHTML = regsHoy.length
        ? regsHoy.map(r => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);font-size:.78rem">
              <span style="font-weight:600">${r.nombre_completo}</span>
              <div style="display:flex;gap:5px;align-items:center">
                ${r.hora_entrada ? `<span style="padding:2px 7px;border-radius:12px;background:rgba(86,208,142,.15);color:var(--success);font-weight:600;font-size:.72rem">${r.hora_entrada}</span>` : ''}
                ${r.hora_salida  ? `<span style="padding:2px 7px;border-radius:12px;background:rgba(197,168,111,.15);color:var(--warning);font-weight:600;font-size:.72rem">${r.hora_salida}</span>`
                                 : `<span style="padding:2px 7px;border-radius:12px;background:rgba(143,163,255,.1);color:var(--text-muted);font-size:.72rem">Pendiente</span>`}
              </div>
            </div>`).join('')
        : '<p style="font-size:.78rem;color:var(--text-muted);text-align:center;padding:10px 0">Sin marcas hoy</p>';
    }
  } catch(e) { console.error('Panel marcar:', e); }
}

// ── Timer "hace X tiempo" ─────────────────────────────────────────
let _transcurridoInterval = null;
function asistIniciarTranscurrido(isoStr) {
  clearInterval(_transcurridoInterval);
  if (!isoStr) return;
  const ms = new Date(isoStr).getTime();
  if (isNaN(ms)) return;
  function tick() {
    const el = document.getElementById('tiempoTranscurrido');
    if (!el) return;
    const diff = Math.floor((Date.now() - ms) / 1000);
    if (diff < 0) { el.textContent = ''; return; }
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    el.textContent = 'hace ' + (h > 0 ? `${h}h ` : '') + `${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
  }
  tick();
  _transcurridoInterval = setInterval(tick, 1000);
}

// ════════════════ CÁMARA ASISTENCIA ════════════════

let _camaraStream = null;

async function asistIniciarCamara() {
  // Esperar a que el DOM esté listo
  await new Promise(r => setTimeout(r, 300));
  const video = document.getElementById('camaraVideo');
  const offMsg = document.getElementById('camaraOff');
  if (!video) { console.warn('Cámara: elemento video no encontrado'); return; }
  if (_camaraStream) return;
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia no disponible');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' }
    });
    _camaraStream = stream;
    video.srcObject = stream;
    await video.play();
    if (offMsg) offMsg.style.display = 'none';
  } catch (e) {
    console.error('Cámara:', e);
    if (offMsg) { offMsg.innerHTML = '<span style="font-size:1.8em">⚠️</span><span>No se pudo acceder a la cámara.<br><small style="font-size:.75rem;color:var(--text-muted)">Verificá permisos del navegador.</small></span>'; }
  }
}

function asistDetenerCamara() {
  if (_camaraStream) {
    _camaraStream.getTracks().forEach(t => t.stop());
    _camaraStream = null;
  }
  const video = document.getElementById('camaraVideo');
  if (video) video.srcObject = null;
  const offMsg = document.getElementById('camaraOff');
  if (offMsg) { offMsg.style.display = 'flex'; offMsg.innerHTML = '<span style="font-size:1.8em">📷</span>Cámara detenida'; }
}

function asistCapturarFoto() {
  const video = document.getElementById('camaraVideo');
  const canvas = document.getElementById('camaraCanvas');
  if (!video || !canvas || !_camaraStream) return '';
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, 320, 240);
  return canvas.toDataURL('image/jpeg', 0.5);
}

// Auto-detener cámara si la sección ya no es visible
setInterval(() => {
  if (_camaraStream) {
    const video = document.getElementById('camaraVideo');
    if (!video || video.offsetParent === null) asistDetenerCamara();
  }
}, 3000);

// ════════════════ HOY ════════════════

async function asistCargarHoy() {
  try {
    const data = await fetch(`${AAPI}/dashboard`).then(r => r.json());
    const elT = document.getElementById('asistTotal');
    const elP = document.getElementById('asistPresentes');
    const elF = document.getElementById('asistFechaHoy');
    const elPer = document.getElementById('asistPeriodo');
    if (elT) elT.textContent = data.total;
    if (elP) elP.textContent = data.registros?.length || 0;
    if (elF) elF.textContent = new Date().toLocaleDateString('es-PE', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    if (elPer) elPer.textContent = `${data.periodo?.desde} al ${data.periodo?.hasta}`;

    const t = document.getElementById('tablaHoy');
    if (!t) return;
    if (!data.registros?.length) { t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Sin registros hoy</p>'; }
    else t.innerHTML = `<table class="data-table">
      <thead><tr><th>Empleado</th><th>Cargo</th><th>Entrada</th><th>📷</th><th>Salida</th><th>📷</th><th>Duración</th></tr></thead>
      <tbody>${data.registros.map(r => `<tr>
        <td style="display:flex;align-items:center;gap:8px">
          ${r.foto ? `<img src="/uploads/fotos/${r.foto}" style="width:30px;height:30px;border-radius:50%;object-fit:cover">` : '<div style="width:30px;height:30px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center">👤</div>'}
          <strong>${r.nombre_completo}</strong>
        </td>
        <td style="color:var(--text-muted);font-size:.85em">${r.cargo || '—'}</td>
        <td style="color:var(--success)">${r.hora_entrada || '—'}</td>
        <td>${r.foto_entrada ? `<img src="/uploads/fotos_asistencia/${r.foto_entrada}" style="width:36px;height:28px;border-radius:4px;object-fit:cover;cursor:pointer" onclick="window.open(this.src,'_blank')" title="Foto entrada">` : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td style="color:var(--warning)">${r.hora_salida  || '—'}</td>
        <td>${r.foto_salida ? `<img src="/uploads/fotos_asistencia/${r.foto_salida}" style="width:36px;height:28px;border-radius:4px;object-fit:cover;cursor:pointer" onclick="window.open(this.src,'_blank')" title="Foto salida">` : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td style="color:var(--text-muted)">${r.duracion}</td>
      </tr>`).join('')}</tbody></table>`;

    const lb = document.getElementById('leaderboard');
    if (!lb) return;
    const maxDias = Math.max(...(data.leaderboard?.map(x => x.dias) || [1]), 1);
    lb.innerHTML = (data.leaderboard || []).map(x => `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <span style="min-width:160px;font-size:.88em">${x.nombre}</span>
        <div style="flex:1;height:8px;background:var(--border);border-radius:5px">
          <div style="height:8px;width:${(x.dias/maxDias*100).toFixed(0)}%;background:var(--primary);border-radius:5px;transition:.4s ease"></div>
        </div>
        <span style="min-width:30px;text-align:right;font-size:.85em;color:var(--text-muted)">${x.dias}d</span>
      </div>`).join('');
  } catch { /* silencioso */ }
}

// ════════════════ EMPLEADOS ════════════════

async function asistCargarEmpleados() {
  const inactivos = document.getElementById('mostrarInactivos')?.checked ? '0' : '1';
  const t = document.getElementById('tablaEmpleados');
  t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Cargando...</p>';
  try {
    const data = await fetch(`${AAPI}/empleados?activo=${inactivos}`).then(r => r.json());
    if (!data.empleados?.length) { t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Sin empleados</p>'; return; }
    const esAdmin = window.usuarioActual?.permisos?.asistencia_config;
    t.innerHTML = `<table class="data-table">
      <thead><tr><th>Foto</th><th>Nombre</th><th>Doc.</th><th>Cargo</th><th>Celular</th><th>Estado</th>${esAdmin ? '<th></th>' : ''}</tr></thead>
      <tbody>${data.empleados.map(e => `<tr>
        <td>${e.foto ? `<img src="/uploads/fotos/${e.foto}" style="width:38px;height:38px;border-radius:50%;object-fit:cover">` : '<div style="width:38px;height:38px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center">👤</div>'}</td>
        <td><strong>${e.nombre_completo}</strong></td>
        <td style="color:var(--text-muted);font-size:.85em">${e.tipo_doc}: ${e.documento}</td>
        <td style="color:var(--text-muted);font-size:.85em">${e.cargo || '—'}</td>
        <td style="color:var(--text-muted);font-size:.85em">${e.celular || '—'}</td>
        <td><span style="padding:3px 10px;border-radius:6px;font-size:.78em;background:${e.activo?'rgba(86,208,142,.15)':'rgba(255,107,107,.15)'};color:${e.activo?'var(--success)':'var(--danger)'}">
          ${e.activo ? 'Activo' : 'Inactivo'}
        </span></td>
        ${esAdmin ? `<td style="white-space:nowrap">
          <button class="btn btn-secondary btn-sm" onclick="asistEditarEmpleado(${e.id})">✏️</button>
          ${e.activo
            ? `<button class="btn btn-danger btn-sm" onclick="asistBajaEmpleado(${e.id},'${e.nombre_completo}')">🚫</button>`
            : `<button class="btn btn-success btn-sm" onclick="asistReactivarEmpleado(${e.id})">✅</button>`}
        </td>` : ''}
      </tr>`).join('')}</tbody></table>`;
  } catch { t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Error</p>'; }
}

async function asistCargarEmpleadosSelect() {
  try {
    const data = await fetch(`${AAPI}/empleados?activo=1`).then(r => r.json());
    ['regEmpSelect'].forEach(id => {
      const sel = document.getElementById(id); if (!sel) return;
      sel.innerHTML = '<option value="">-- Seleccioná --</option>' +
        (data.empleados || []).map(e => `<option value="${e.id}">${e.nombre_completo}</option>`).join('');
    });
    const filtro = document.getElementById('regEmpleado');
    if (filtro) {
      filtro.innerHTML = '<option value="">Todos los empleados</option>' +
        (data.empleados || []).map(e => `<option value="${e.id}">${e.nombre_completo}</option>`).join('');
    }
  } catch { /* silencioso */ }
}

function asistNuevoEmpleado() {
  document.getElementById('empForm').style.display = '';
  document.getElementById('empFormTitulo').textContent = 'Nuevo Empleado';
  document.getElementById('empId').value = '';
  ['empDocumento','empNombre','empApellido','empCelular','empEmail'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('empTipoDoc').value = 'DNI';
  document.getElementById('empCargo').value   = '';
  document.getElementById('empOnp').checked   = false;
}

async function asistEditarEmpleado(id) {
  const data = await fetch(`${AAPI}/empleados/${id}`).then(r => r.json());
  const e = data.empleado; if (!e) return;
  document.getElementById('empForm').style.display = '';
  document.getElementById('empFormTitulo').textContent = 'Editar Empleado';
  document.getElementById('empId').value        = e.id;
  document.getElementById('empTipoDoc').value   = e.tipo_doc;
  document.getElementById('empDocumento').value = e.documento;
  document.getElementById('empNombre').value    = e.nombre;
  document.getElementById('empApellido').value  = e.apellido;
  document.getElementById('empCargo').value     = e.cargo || '';
  document.getElementById('empCelular').value   = e.celular || '';
  document.getElementById('empEmail').value     = e.email || '';
  document.getElementById('empOnp').checked     = !!e.onp;
  document.getElementById('empFotoActual').value = e.foto || '';
  document.getElementById('empForm').scrollIntoView({ behavior:'smooth' });
}

async function asistGuardarEmpleado() {
  const id = document.getElementById('empId').value;
  const formData = new FormData();
  if (id) formData.append('id', id);
  formData.append('documento',   document.getElementById('empDocumento').value.trim());
  formData.append('tipo_doc',    document.getElementById('empTipoDoc').value);
  formData.append('nombre',      document.getElementById('empNombre').value.trim());
  formData.append('apellido',    document.getElementById('empApellido').value.trim());
  formData.append('cargo',       document.getElementById('empCargo').value);
  formData.append('celular',     document.getElementById('empCelular').value);
  formData.append('email',       document.getElementById('empEmail').value);
  formData.append('onp',         document.getElementById('empOnp').checked ? '1' : '0');
  formData.append('foto_actual', document.getElementById('empFotoActual').value);
  const fotoFile = document.getElementById('empFoto').files[0];
  if (fotoFile) formData.append('foto', fotoFile);

  const res  = await fetch(`${AAPI}/empleados`, { method:'POST', body: formData });
  const data = await res.json();
  if (data.ok) { asistCancelarEmpleado(); asistCargarEmpleados(); asistCargarEmpleadosSelect(); }
  else alert(data.error || 'Error al guardar');
}

async function asistBajaEmpleado(id, nombre) {
  const nota = prompt(`Motivo de baja para ${nombre}:`);
  if (nota === null) return;
  const res = await fetch(`${AAPI}/empleados/${id}/baja`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ nota_baja: nota }) });
  const d   = await res.json();
  if (d.ok) asistCargarEmpleados(); else alert(d.error);
}

async function asistReactivarEmpleado(id) {
  if (!confirm('¿Reactivar este empleado?')) return;
  const res = await fetch(`${AAPI}/empleados/${id}/reactivar`, { method:'POST', headers:{'Content-Type':'application/json'}, body: '{}' });
  const d   = await res.json();
  if (d.ok) asistCargarEmpleados();
}

function asistCancelarEmpleado() { document.getElementById('empForm').style.display = 'none'; }

// ════════════════ REGISTROS ════════════════

async function asistCargarRegistros() {
  const ahora = new Date();
  const mesActual = String(ahora.getMonth() + 1).padStart(2, '0');
  const anioActual = String(ahora.getFullYear());
  const regMesEl = document.getElementById('regMes');
  const regAnioEl = document.getElementById('regAnio');
  const mes  = regMesEl?.value || mesActual;
  const anio = regAnioEl?.value || anioActual;
  if (regMesEl && !regMesEl.value) regMesEl.value = mes;
  if (regAnioEl && !regAnioEl.value) regAnioEl.value = anio;
  const empId = document.getElementById('regEmpleado').value;
  const desde = `${anio}-${mes}-01`;
  const hasta = `${anio}-${mes}-${String(new Date(+anio, +mes, 0).getDate()).padStart(2,'0')}`;
  const t      = document.getElementById('tablaRegistros');
  t.innerHTML  = '<p class="text-center text-muted" style="padding:30px">Cargando...</p>';
  let qs = `?desde=${desde}&hasta=${hasta}`;
  if (empId) qs += `&empleado_id=${empId}`;
  try {
    const data    = await fetch(`${AAPI}/registros${qs}`).then(r => r.json());
    if (data?.ok === false) {
      t.innerHTML = `<p class="text-center text-muted" style="padding:30px">${data.error || 'Error al cargar registros'}</p>`;
      return;
    }
    const esAdmin = window.usuarioActual?.permisos?.asistencia_config;
    if (!data.registros?.length) { t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Sin registros</p>'; return; }
    t.innerHTML = `<table class="data-table">
      <thead><tr><th style="min-width:105px">Fecha</th><th>Empleado</th><th>Entrada</th><th>📷</th><th>Salida</th><th>📷</th><th>Estado</th><th>Duración</th><th>Obs.</th>${esAdmin?'<th></th>':''}</tr></thead>
      <tbody>${data.registros.map(r => `<tr>
        <td style="white-space:nowrap">${r.fecha}</td>
        <td><strong>${r.nombre_completo}</strong></td>
        <td style="color:var(--success)">${r.hora_entrada || '—'}</td>
        <td>${r.foto_entrada ? `<img src="/uploads/fotos_asistencia/${r.foto_entrada}" style="width:36px;height:28px;border-radius:4px;object-fit:cover;cursor:pointer" onclick="window.open(this.src,'_blank')" title="Foto entrada">` : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td style="color:var(--warning)">${r.hora_salida  || '—'}</td>
        <td>${r.foto_salida ? `<img src="/uploads/fotos_asistencia/${r.foto_salida}" style="width:36px;height:28px;border-radius:4px;object-fit:cover;cursor:pointer" onclick="window.open(this.src,'_blank')" title="Foto salida">` : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td>
          <span style="padding:2px 8px;border-radius:12px;font-weight:700;font-size:.75rem;background:${r.estado_llegada === 'TARDANZA' ? 'rgba(255,107,107,.15)' : 'rgba(86,208,142,.15)'};color:${r.estado_llegada === 'TARDANZA' ? 'var(--danger)' : 'var(--success)'}">${r.estado_llegada || 'A TIEMPO'}</span>
        </td>
        <td style="color:var(--text-muted)">${r.duracion}</td>
        <td style="color:var(--text-muted);font-size:.82em">${r.observacion||'—'}</td>
        ${esAdmin ? `<td style="white-space:nowrap">
          <button class="btn btn-secondary btn-sm" onclick="asistEditarRegistro(${r.id})">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="asistEliminarRegistro(${r.id})">🗑️</button>
        </td>` : ''}
      </tr>`).join('')}</tbody></table>`;
  } catch { t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Error</p>'; }
}

function asistNuevoRegistro() {
  const m = document.getElementById('regModal');
  if (m) m.classList.remove('hide');
  document.getElementById('regFormTitulo').textContent = 'Registro Manual';
  ['regId','regEntrada','regSalida','regObs'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('regFecha').value = new Date().toISOString().split('T')[0];
}

async function asistEditarRegistro(id) {
  try {
    await asistCargarEmpleadosSelect();
    const d   = await fetch(`${AAPI}/registros?desde=2020-01-01&hasta=2030-12-31`).then(r => r.json());
    const reg = d.registros?.find(r => r.id === id);
    if (!reg) {
      alert('No se encontró el registro a editar.');
      return;
    }
    const m = document.getElementById('regModal');
    if (m) m.classList.remove('hide');
    document.getElementById('regFormTitulo').textContent = 'Editar Registro';
    document.getElementById('regId').value        = id;
    document.getElementById('regEmpSelect').value = String(reg.empleado_id || '');
    document.getElementById('regFecha').value     = reg.fecha || '';
    document.getElementById('regEntrada').value   = reg.entrada_fmt || (reg.hora_entrada ? String(reg.hora_entrada).slice(11, 16) : '');
    document.getElementById('regSalida').value    = reg.salida_fmt  || (reg.hora_salida  ? String(reg.hora_salida).slice(11, 16)  : '');
    document.getElementById('regObs').value       = reg.observacion  || '';
  } catch (e) {
    alert('No se pudo abrir el registro para editar.');
  }
}

async function asistGuardarRegistro() {
  const body = {
    id:           document.getElementById('regId').value || undefined,
    empleado_id:  document.getElementById('regEmpSelect').value,
    fecha:        document.getElementById('regFecha').value,
    hora_entrada: document.getElementById('regEntrada').value,
    hora_salida:  document.getElementById('regSalida').value,
    observacion:  document.getElementById('regObs').value
  };
  if (!body.empleado_id || !body.fecha) return alert('Seleccioná empleado y fecha.');
  const res  = await fetch(`${AAPI}/registros`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await res.json();
  if (data.ok) { asistCancelarRegistro(); asistCargarRegistros(); }
  else alert(data.error);
}

async function asistEliminarRegistro(id) {
  const m = document.getElementById('regDeleteModal');
  if (m) m.classList.remove('hide');
  document.getElementById('regDeleteId').value = id;
  document.getElementById('regDeleteMotivo').value = '';
  document.getElementById('btnConfirmarDelete').disabled = false;
  setTimeout(() => document.getElementById('regDeleteMotivo')?.focus(), 200);
}

function asistCancelarDelete() {
  const m = document.getElementById('regDeleteModal');
  if (m) m.classList.add('hide');
}

async function asistConfirmarDelete() {
  const id = document.getElementById('regDeleteId').value;
  const motivo = document.getElementById('regDeleteMotivo').value.trim();
  if (!motivo) { alert('Debés escribir el motivo para poder eliminar.'); return; }
  document.getElementById('btnConfirmarDelete').disabled = true;
  const res  = await fetch(`${AAPI}/registros/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motivo })
  });
  const data = await res.json();
  if (data.ok) { asistCancelarDelete(); asistCargarRegistros(); }
  else { alert(data.error); document.getElementById('btnConfirmarDelete').disabled = false; }
}

function asistCancelarRegistro() {
  const m = document.getElementById('regModal');
  if (m) m.classList.add('hide');
}

// ════════════════ SUELDOS ════════════════

async function asistCargarSueldos() {
  const anio     = document.getElementById('sueldoAnio').value;
  const mes      = document.getElementById('sueldoMes').value;
  const quincena = document.getElementById('sueldoQuincena').value;
  const t        = document.getElementById('tablaSueldos');
  t.innerHTML    = '<p class="text-center text-muted" style="padding:30px">Calculando...</p>';
  try {
    const data = await fetch(`${AAPI}/sueldos?anio=${anio}&mes=${mes}&quincena=${quincena}`).then(r => r.json());
    const esAdmin = !!window.usuarioActual?.permisos?.asistencia_config;
    if (!data.resultados?.length) { t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Sin empleados activos</p>'; return; }
    const p = data.periodo;
    t.innerHTML = `
      <div style="padding:14px 20px;border-bottom:1px solid var(--border);font-size:.85em;color:var(--text-muted)">
        Período: <strong>${p.desde}</strong> al <strong>${p.hasta}</strong> &nbsp;•&nbsp; Valor día: <strong>${aFmt(data.valorDia)}</strong>
      </div>
      <table class="data-table" style="font-size:.98em">
        <thead><tr>
          <th style="white-space:nowrap;padding:8px 5px">Empleado</th>
          <th title="Dias trabajados" style="white-space:nowrap;padding:8px 4px">Días</th>
          <th title="Dias adicionales por semana completa" style="white-space:nowrap;padding:8px 4px">Adic.</th>
          <th title="Dias feriados trabajados" style="white-space:nowrap;padding:8px 4px">Feriados</th>
          <th title="Dias descansado" style="white-space:nowrap;padding:8px 4px">Desc.</th>
          <th title="Faltas/Descuento" style="white-space:nowrap;padding:8px 4px">Faltas</th>
          <th title="Tardanzas de la quincena" style="white-space:nowrap;padding:8px 4px">Tardanzas</th>
          <th title="1er total" style="white-space:nowrap;padding:8px 4px">Subtotal</th>
          <th title="Descuento por ONP" style="white-space:nowrap;padding:8px 4px">ONP</th>
          <th title="Premio adicional" style="white-space:nowrap;padding:8px 4px">Bono</th>
          <th title="Prestamo en quincena" style="white-space:nowrap;padding:8px 4px">Préstamo</th>
          <th title="Total final" style="white-space:nowrap;padding:8px 4px">SUELDO</th>
          <th title="Nota" style="padding:8px 4px;min-width:160px">Nota</th>
          <th style="padding:8px 4px"></th>
        </tr></thead>
        <tbody>${data.resultados.map(r => `<tr data-empid="${r.emp.id}" data-subtotal="${r.subtotal}" data-onp="${r.onp_monto}">
          <td style="white-space:nowrap;padding:6px 5px"><strong>${r.emp.nombre_completo}</strong><br><span style="color:var(--text-muted);font-size:.72em">${r.emp.cargo||''}</span></td>
          <td style="text-align:center;white-space:nowrap;padding:6px 4px">${r.dias_trabajados}</td>
          <td style="text-align:center;color:var(--success);white-space:nowrap;padding:6px 4px">${r.diasAdicionales}</td>
          <td style="white-space:nowrap;padding:4px 4px;text-align:center">
            ${esAdmin
              ? `<input type="number" id="sueldoFeriados_${r.emp.id}" min="0" step="1" value="${parseInt(r.feriados || 0, 10)}"
                  style="width:40px;height:20px;padding:0 1px;border:none;border-bottom:1px solid var(--border);border-radius:0;background:transparent;box-shadow:none;text-align:center;font-size:.78em;line-height:1.1">`
              : `<span style="color:var(--info)">${r.feriados || 0}</span>`}
          </td>
          <td style="text-align:center;color:var(--text-muted);white-space:nowrap;padding:6px 4px">${r.descansos}</td>
          <td style="text-align:center;color:var(--danger);white-space:nowrap;padding:6px 4px">${r.faltas} <small>(${aFmt(r.faltas_monto)})</small></td>
          <td style="text-align:center;color:var(--warning);white-space:nowrap;padding:6px 4px">${r.tardanza_count} <small>(${aFmt(r.tardanza_monto)})</small></td>
          <td style="white-space:nowrap;padding:6px 4px">${aFmt(r.subtotal)}</td>
          <td style="color:var(--danger);white-space:nowrap;padding:6px 4px">${r.onp_monto > 0 ? aFmt(r.onp_monto) : '—'}</td>
          <td style="white-space:nowrap;padding:4px 4px">
            ${esAdmin
              ? `<input type="number" id="sueldoBono_${r.emp.id}" min="0" step="0.01" value="${+r.bono > 0 ? (+r.bono).toFixed(2) : ''}"
                  oninput="asistRecalcularSueldo(${r.emp.id},${r.subtotal},${r.onp_monto})"
                  style="width:54px;height:20px;padding:0 1px;border:none;border-bottom:1px solid var(--border);border-radius:0;background:transparent;box-shadow:none;text-align:right;font-size:.78em;line-height:1.1">`
              : `<span style="color:var(--success)">${r.bono > 0 ? aFmt(r.bono) : '—'}</span>`}
          </td>
          <td style="white-space:nowrap;padding:4px 4px">
            ${esAdmin
              ? `<input type="number" id="sueldoPrestamo_${r.emp.id}" min="0" step="0.01" value="${+r.prestamo > 0 ? (+r.prestamo).toFixed(2) : ''}"
                  oninput="asistRecalcularSueldo(${r.emp.id},${r.subtotal},${r.onp_monto})"
                  style="width:54px;height:20px;padding:0 1px;border:none;border-bottom:1px solid var(--border);border-radius:0;background:transparent;box-shadow:none;text-align:right;font-size:.78em;line-height:1.1">`
              : `<span style="color:var(--danger)">${r.prestamo > 0 ? aFmt(r.prestamo) : '—'}</span>`}
          </td>
          <td style="white-space:nowrap;padding:6px 4px"><strong id="sueldoTotal_${r.emp.id}" style="color:${r.sueldo >= 0 ? 'var(--success)' : 'var(--danger)'};font-size:.96em">${aFmt(r.sueldo)}</strong></td>
          <td style="padding:4px 4px;vertical-align:top">
            ${esAdmin
              ? `<textarea id="sueldoNota_${r.emp.id}" rows="2" placeholder="—"
                  style="width:155px;padding:3px 5px;border:1px solid var(--border);border-radius:4px;background:transparent;font-size:.78em;line-height:1.35;resize:none;font-family:inherit;color:inherit">${(r.nota||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>`
              : `<span style="color:var(--text-muted);font-size:.82em;white-space:pre-wrap">${(r.nota||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') || '—'}</span>`}
          </td>
          <td style="white-space:nowrap;padding:4px 4px">
            ${esAdmin
              ? `<button class="btn btn-primary btn-sm" style="padding:4px 6px;min-height:20px;font-size:.78em" title="Guardar ajustes" onclick="asistGuardarAjusteFila(${r.emp.id},'${p.desde}','${p.hasta}')">💾</button>
                 <button class="btn btn-sm" style="padding:4px 6px;min-height:20px;font-size:.78em;background:var(--bg-darker);border:1px solid var(--border)" title="Imprimir boleta" onclick="asistImprimirBoleta(${r.emp.id},'${p.desde}','${p.hasta}')">🖨️</button>`
              : ''}
          </td>
        </tr>`).join('')}</tbody>
      </table>`;
  } catch (e) { t.innerHTML = `<p class="text-center text-muted" style="padding:30px">Error: ${e.message}</p>`; }
}

function asistRecalcularSueldo(empId, subtotal, onpMonto) {
  const bono     = parseFloat(document.getElementById(`sueldoBono_${empId}`)?.value     || '0') || 0;
  const prestamo = parseFloat(document.getElementById(`sueldoPrestamo_${empId}`)?.value || '0') || 0;
  const sueldo   = +(subtotal - onpMonto - prestamo + bono).toFixed(2);
  const el = document.getElementById(`sueldoTotal_${empId}`);
  if (el) {
    el.textContent = aFmt(sueldo);
    el.style.color = sueldo >= 0 ? 'var(--success)' : 'var(--danger)';
  }
}

async function asistImprimirBoleta(empId, desde, hasta) {
  const data = await fetch(`${AAPI}/sueldos/boleta?emp_id=${empId}&desde=${desde}&hasta=${hasta}`).then(r => r.json());
  if (!data.ok) { alert('Error al cargar boleta'); return; }

  const { emp, ajuste, registros, valorDia, descTardanza, periodo } = data;
  const feriados   = +ajuste?.feriados  || 0;
  const prestamo   = +ajuste?.prestamo  || 0;
  const bono       = +ajuste?.bono      || 0;
  const nota       = ajuste?.nota       || '';

  const diasTrab   = new Set(registros.filter(r => r.hora_entrada && r.hora_salida).map(r => r.fecha)).size;
  const tardCount  = registros.filter(r => r.tarde).length;

  // recalcular igual que backend
  const tardMonto  = +(tardCount * descTardanza).toFixed(2);
  // descansos y faltas: aproximar desde el backend (usamos los registros como referencia)
  // Para la boleta usamos los valores del endpoint /sueldos directamente via la fila guardada
  // Re-fetch la fila calculada del resumen
  const resFila = document.getElementById(`sueldoTotal_${empId}`);
  const sueldoMostrado = resFila?.textContent || '';

  // Meses en español
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const DIAS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const fDesde = new Date(desde + 'T12:00:00');
  const fHasta = new Date(hasta + 'T12:00:00');
  const mesNombre = MESES[fDesde.getMonth()];
  const anio      = fDesde.getFullYear();
  const qNum      = fDesde.getDate() <= 15 ? '1ª' : '2ª';
  const hoy = new Date();
  const fechaImpresion = `${hoy.getDate()} de ${MESES[hoy.getMonth()]} de ${hoy.getFullYear()}`;

  const fmt = n => 'S/. ' + (+n || 0).toFixed(2);

  // Calendario 2 columnas (mitad izquierda / mitad derecha) para reducir altura
  const mkCel = r => {
    if (!r) return `<td colspan="4"></td>`;
    const fd = new Date(r.fecha + 'T12:00:00');
    const ec = !r.hora_entrada ? ['F','#c53030'] : r.tarde ? ['T','#b7791f'] : ['✓','#276749'];
    return `<td class="cc">${fd.getDate()} ${DIAS[fd.getDay()]}</td>` +
           `<td class="cc cn">${r.hora_entrada||'—'}</td>` +
           `<td class="cc cn">${r.hora_salida||'—'}</td>` +
           `<td class="cc cn" style="color:${ec[1]};font-weight:700;border-right:1px solid #bbb">${ec[0]}</td>`;
  };
  const mid = Math.ceil(registros.length / 2);
  const col1 = registros.slice(0, mid);
  const col2 = registros.slice(mid);
  let calFilas = '';
  for (let i = 0; i < col1.length; i++) {
    calFilas += `<tr>${mkCel(col1[i])}${i < col2.length ? mkCel(col2[i]) : '<td colspan="4"></td>'}</tr>`;
  }

  // Obtener subtotal y sueldo desde los inputs/celdas actuales
  const bonoInput    = parseFloat(document.getElementById(`sueldoBono_${empId}`)?.value || '0') || bono;
  const prestamoInput= parseFloat(document.getElementById(`sueldoPrestamo_${empId}`)?.value || '0') || prestamo;

  const fila = document.querySelector(`#tablaSueldos tr[data-empid="${empId}"]`);
  const subtotalVal = fila ? parseFloat(fila.dataset.subtotal || '0') : 0;
  const onpVal      = fila ? parseFloat(fila.dataset.onp      || '0') : 0;
  const sueldoFinal = +(subtotalVal - onpVal - prestamoInput + bonoInput).toFixed(2);

  const htmlA4 = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Boleta ${emp.nombre} ${emp.apellido}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{font-family:Arial,sans-serif;font-size:13px;color:#111;background:#fff}
  @page{size:A4;margin:10mm 17.28mm}
  @media print{.no-print{display:none!important} .wrap{padding:0}}
  .wrap{width:100%;padding:6px 8px}
  /* Header */
  .hdr{display:flex;align-items:center;justify-content:space-between;border-bottom:2.5px solid #111;padding-bottom:5px;margin-bottom:5px}
  .hdr-left h1{font-size:1.35em;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
  .hdr-left p{font-size:.88em;color:#555;margin-top:1px}
  .hdr-right{text-align:right;font-size:.88em;color:#555;line-height:1.6}
  .badge{background:#111;color:#fff;padding:3px 0;font-size:.95em;font-weight:700;letter-spacing:.07em;text-align:center;margin-bottom:6px}
  /* Info empleado */
  .ig{display:grid;grid-template-columns:repeat(4,1fr);gap:3px 12px;margin-bottom:7px;font-size:.92em;border:1px solid #ddd;padding:5px 8px;border-radius:3px}
  .ig .lbl{font-size:.8em;color:#777;display:block}
  .ig .val{font-weight:700}
  /* Sección títulos */
  .sh{font-size:.82em;text-transform:uppercase;letter-spacing:.05em;color:#555;font-weight:700;border-bottom:1px solid #ccc;padding-bottom:2px;margin-bottom:4px}
  /* Calendario 2 columnas dentro de la misma tabla */
  table.cal{width:100%;border-collapse:collapse;font-size:.9em;margin-bottom:7px}
  table.cal th{background:#efefef;padding:3px 5px;text-align:center;font-size:.83em;border:1px solid #ddd}
  table.cal td.cc{padding:3px 6px}
  table.cal td.cn{text-align:center}
  table.cal td.div{border-right:2px solid #bbb;padding-right:8px}
  table.cal tr:nth-child(even){background:#fafafa}
  /* Liquidación en 2 cols paralelas */
  .liq-wrap{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:7px}
  table.liq{width:100%;border-collapse:collapse;font-size:.9em}
  table.liq td{padding:3px 5px}
  table.liq td:last-child{text-align:right;white-space:nowrap}
  table.liq tr.sep td{border-top:1px solid #ccc;padding-top:4px}
  table.liq tr.total td{border-top:2px solid #111;font-weight:800;font-size:1.08em;padding-top:4px}
  table.liq tr.total td:last-child{color:#276749}
  .nota-box{background:#fffbe6;border:1px solid #e9c83e;border-radius:3px;padding:4px 8px;font-size:.88em;color:#555;margin-bottom:7px}
  /* Firmas al final */
  .firma-wrap{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:14px;padding-top:8px;border-top:1px solid #ddd;align-items:start}
  .firma-box{text-align:center}
  .firma-linea{border-top:1.5px solid #333;margin-top:36px;padding-top:5px;font-size:.88em;color:#333;font-weight:700}
  .firma-campo{text-align:left;margin-top:6px;font-size:.85em;border-bottom:1px solid #888;padding-bottom:2px;color:#333}
  .huella-rect{width:80px;height:100px;border:1.5px solid #333;border-radius:4px;margin:8px auto 0;background:#f9f9f9}
  .pie{text-align:center;margin-top:8px;font-size:.78em;color:#aaa}
  /* botones pantalla */
  .btn-imp{display:inline-block;margin:0 5px 10px 0;padding:6px 16px;background:#111;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:.92em}
  .btn-80{background:#555}
</style></head><body>
<div class="wrap">
  <div class="no-print" style="margin-bottom:10px">
    <button class="btn-imp" onclick="window.print()">🖨️ Imprimir A4</button>
    <button class="btn-imp btn-80" onclick="imprimirTicket()">🖨️ Imprimir 80mm</button>
    <button class="btn-imp" style="background:#888" onclick="window.close()">✕ Cerrar</button>
  </div>

  <div class="hdr">
    <div class="hdr-left">
      <h1>🐷 Belu Chicharronería</h1>
      <p>Boleta de Liquidación de Sueldo</p>
    </div>
    <div class="hdr-right">
      Emitido: ${fechaImpresion}<br>
      ${emp.tipo_doc}: <strong>${emp.documento}</strong>
    </div>
  </div>

  <div class="badge">BOLETA DE PAGO — ${qNum} QUINCENA DE ${mesNombre.toUpperCase()} ${anio}</div>

  <div class="ig">
    <div><span class="lbl">Trabajador</span><span class="val">${emp.nombre} ${emp.apellido}</span></div>
    <div><span class="lbl">Cargo</span><span class="val">${emp.cargo || '—'}</span></div>
    <div><span class="lbl">Período</span><span class="val">${desde} → ${hasta}</span></div>
    <div><span class="lbl">Régimen ONP</span><span class="val">${emp.onp ? 'Sí (13%)' : 'No'}</span></div>
  </div>

  <div class="sh">📅 Registro de Asistencia</div>
  <table class="cal">
    <thead><tr>
      <th>Día</th><th>Entrada</th><th>Salida</th><th class="div">Est.</th>
      <th>Día</th><th>Entrada</th><th>Salida</th><th>Est.</th>
    </tr></thead>
    <tbody>${calFilas}</tbody>
  </table>

  <div class="sh">💵 Liquidación</div>
  <div class="liq-wrap">
    <table class="liq">
      <tr><td>Días trabajados (${diasTrab}) × ${fmt(valorDia)}</td><td>${fmt(diasTrab * valorDia)}</td></tr>
      ${feriados > 0 ? `<tr><td>Feriados (${feriados}) × ${fmt(valorDia)}</td><td>+ ${fmt(feriados * valorDia)}</td></tr>` : ''}
      <tr><td>Tardanzas (${tardCount}) × S/. ${descTardanza}</td><td style="color:#c53030">− ${fmt(tardMonto)}</td></tr>
      <tr class="sep"><td><strong>SUBTOTAL</strong></td><td><strong>${fmt(subtotalVal||0)}</strong></td></tr>
    </table>
    <table class="liq">
      ${onpVal > 0 ? `<tr><td>Descuento ONP (13%)</td><td style="color:#c53030">− ${fmt(onpVal)}</td></tr>` : '<tr><td style="color:#999">Sin descuento ONP</td><td>—</td></tr>'}
      ${prestamoInput > 0 ? `<tr><td>Préstamo</td><td style="color:#c53030">− ${fmt(prestamoInput)}</td></tr>` : ''}
      ${bonoInput > 0 ? `<tr><td>Bono</td><td style="color:#276749">+ ${fmt(bonoInput)}</td></tr>` : ''}
      <tr class="total"><td>SUELDO NETO</td><td>${fmt(sueldoFinal)}</td></tr>
    </table>
  </div>

  ${nota ? `<div class="nota-box"><strong>Nota:</strong> ${nota}</div>` : ''}

  <div class="firma-wrap">
    <div class="firma-box">
      <div class="firma-linea">Firma del Embajador Belu</div>
      <div class="firma-campo">Fecha: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
    </div>
    <div class="firma-box">
      <div style="font-size:.88em;color:#333;font-weight:700;margin-bottom:4px">Huella Digital</div>
      <div class="huella-rect"></div>
    </div>
  </div>
  <div class="pie">Belu Chicharronería — Documento generado el ${fechaImpresion}</div>
</div>
<div id="ticket80" style="display:none"></div>
<script>
function imprimirTicket() {
  const t = document.getElementById('ticket80');
  t.innerHTML = ${JSON.stringify(`
  <style>
    @page { size: 80mm auto; margin: 2mm 3mm; }
    body { font-family: 'Courier New', monospace; font-size: 11px; width:72mm; }
    .t-center { text-align:center; } .t-right { text-align:right; }
    .sep { border-top:1px dashed #999; margin:4px 0; }
    .bold { font-weight:bold; } .big { font-size:1.1em; }
    table { width:100%; border-collapse:collapse; font-size:10px; }
    td, th { padding:1px 2px; }
  </style>
  <div class="t-center bold" style="font-size:1.2em">BELU CHICHARRONERIA</div>
  <div class="t-center" style="font-size:.85em">BOLETA DE PAGO</div>
  <div class="t-center" style="font-size:.85em">${qNum} Quincena ${mesNombre} ${anio}</div>
  <div class="sep"></div>
  <div><b>${emp.nombre} ${emp.apellido}</b></div>
  <div style="font-size:.85em">${emp.cargo || ''}</div>
  <div style="font-size:.85em">${emp.tipo_doc}: ${emp.documento}</div>
  <div class="sep"></div>
  <table>
    <tr><th>Fecha</th><th>Ent.</th><th>Sal.</th><th>Est.</th></tr>
    ${registros.map(r2 => `<tr><td>${r2.fecha.slice(5)}</td><td>${r2.hora_entrada||'—'}</td><td>${r2.hora_salida||'—'}</td><td>${!r2.hora_entrada?'F':r2.tarde?'T':'OK'}</td></tr>`).join('')}
  </table>
  <div class="sep"></div>
  <table>
    <tr><td>Días trab. (${diasTrab})</td><td class="t-right">${fmt(diasTrab * valorDia)}</td></tr>
    ${feriados > 0 ? `<tr><td>Feriados (${feriados})</td><td class="t-right">+${fmt(feriados * valorDia)}</td></tr>` : ''}
    <tr><td>Tardanzas (${tardCount})</td><td class="t-right">-${fmt(tardMonto)}</td></tr>
    <tr class="bold"><td>SUBTOTAL</td><td class="t-right">${fmt(subtotalVal||0)}</td></tr>
    ${onpVal > 0 ? `<tr><td>ONP 13%</td><td class="t-right">-${fmt(onpVal)}</td></tr>` : ''}
    ${prestamoInput > 0 ? `<tr><td>Préstamo</td><td class="t-right">-${fmt(prestamoInput)}</td></tr>` : ''}
    ${bonoInput > 0 ? `<tr><td>Bono</td><td class="t-right">+${fmt(bonoInput)}</td></tr>` : ''}
  </table>
  <div class="sep"></div>
  <div class="bold big t-center">NETO: ${fmt(sueldoFinal)}</div>
  <div class="sep"></div>
  ${nota ? `<div style="font-size:.85em">Nota: ${nota}</div><div class="sep"></div>` : ''}
  <div style="margin-top:28px">Firma: ____________________</div>
  <div style="margin-top:18px">DNI:   ____________________</div>
  <div style="margin-top:14px;font-size:.8em;text-align:center">${fechaImpresion}</div>
  `)};
  const w = window.open('', '_blank', 'width=330,height=700');
  w.document.write('<html><body>' + t.innerHTML + '</body></html>');
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 400);
}
<\/script>
</body></html>`;

  const win = window.open('', '_blank', 'width=800,height=900');
  win.document.write(htmlA4);
  win.document.close();
  win.focus();
}

async function asistGuardarAjusteFila(empId, desde, hasta) {
  const ferEl  = document.getElementById(`sueldoFeriados_${empId}`);
  const bonoEl = document.getElementById(`sueldoBono_${empId}`);
  const presEl = document.getElementById(`sueldoPrestamo_${empId}`);
  const notaEl  = document.getElementById(`sueldoNota_${empId}`);
  const feriados = parseInt(ferEl?.value || '0', 10) || 0;
  const bono = parseFloat(bonoEl?.value || '0') || 0;
  const prestamo = parseFloat(presEl?.value || '0') || 0;
  const nota = notaEl?.value || '';

  const res = await fetch(`${AAPI}/sueldos/ajuste`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      empleado_id: empId,
      periodo_desde: desde,
      periodo_hasta: hasta,
      feriados,
      prestamo,
      bono,
      nota
    })
  });
  const data = await res.json();
  if (data.ok) asistCargarSueldos();
  else alert(data.error || 'No se pudo guardar el ajuste.');
}

async function asistAjuste(empId, nombre, desde, hasta, feriados, prestamo, bono) {
  const nuevoFer  = prompt(`${nombre}\nFeriados trabajados (actual: ${feriados}):`, feriados);
  if (nuevoFer === null) return;
  const nuevoPres = prompt('Préstamo a descontar:', prestamo);
  if (nuevoPres === null) return;
  const nuevoBono = prompt('Bono:', bono);
  if (nuevoBono === null) return;
  const res  = await fetch(`${AAPI}/sueldos/ajuste`, { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ empleado_id: empId, periodo_desde: desde, periodo_hasta: hasta,
      feriados: +nuevoFer||0, prestamo: +nuevoPres||0, bono: +nuevoBono||0 }) });
  const data = await res.json();
  if (data.ok) asistCargarSueldos(); else alert(data.error);
}

// ════════════════ AUDITORÍA ════════════════

async function asistCargarAuditoria() {
  const t = document.getElementById('tablaAuditoria');
  t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Cargando...</p>';
  try {
    const data = await fetch(`${AAPI}/auditoria`).then(r => r.json());
    if (!data.logs?.length) { t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Sin registros</p>'; return; }
    t.innerHTML = `<table class="data-table">
      <thead><tr><th>Fecha/Hora</th><th>Tabla</th><th>Acción</th><th>Detalle</th></tr></thead>
      <tbody>${data.logs.map(l => `<tr>
        <td style="color:var(--text-muted);font-size:.82em;white-space:nowrap">${(l.timestamp||'').slice(0,16)}</td>
        <td style="font-size:.82em">${l.tabla||'—'}</td>
        <td><span style="padding:2px 8px;border-radius:5px;font-size:.78em;background:var(--bg-darker)">${l.accion||'—'}</span></td>
        <td style="font-size:.83em;color:var(--text-muted)">${l.detalle||'—'}</td>
      </tr>`).join('')}</tbody></table>`;
  } catch { t.innerHTML = '<p class="text-center text-muted" style="padding:30px">Error</p>'; }
}

// ════════════════ CONFIGURACIÓN ════════════════

async function asistCargarConfig() {
  try {
    const data = await fetch(`${AAPI}/config`).then(r => r.json());
    const cfg  = data.config || {};
    document.getElementById('cfgSueldo').value        = cfg.sueldo_minimo || 1025;
    document.getElementById('cfgHoraIngreso').value   = cfg.hora_ingreso || '06:30';
    document.getElementById('cfgTolerancia').value    = cfg.tolerancia_min || 5;
    document.getElementById('cfgDescTard').value      = cfg.descuento_tardanza || 2;
    document.getElementById('cfgSmtp').value          = cfg.email_smtp || 'smtp.gmail.com';
    document.getElementById('cfgPuerto').value        = cfg.email_puerto || 587;
    document.getElementById('cfgEmailUser').value     = cfg.email_usuario || '';
    document.getElementById('cfgEmailPass').value     = '';  // nunca mostrar contraseña guardada
    document.getElementById('cfgEmailActivo').checked = !!cfg.email_activo;
    cfgRecalcular();
    cfgActualizarResumen();
    // Inicializar selects de correo quincenal
    const anioSel = document.getElementById('cfgQAnio');
    if (anioSel && !anioSel.options.length) {
      const y = new Date().getFullYear();
      for (let i = y; i >= y - 2; i--) anioSel.innerHTML += `<option value="${i}">${i}</option>`;
      document.getElementById('cfgQMes').value     = new Date().getMonth() + 1;
      document.getElementById('cfgQQuincena').value = new Date().getDate() <= 15 ? '1' : '2';
    }
  } catch { /* silencioso */ }
}

function cfgRecalcular() {
  const s   = parseFloat(document.getElementById('cfgSueldo')?.value) || 0;
  const dia  = Math.round(s / 30 * 100) / 100;
  const hora = Math.round(dia / 8 * 100) / 100;
  const diaEl  = document.getElementById('cfgValorDia');
  const horaEl = document.getElementById('cfgValorHora');
  if (diaEl)  diaEl.value  = dia.toFixed(2);
  if (horaEl) horaEl.value = hora.toFixed(2);
}

function cfgActualizarResumen() {
  const hora = document.getElementById('cfgHoraIngreso')?.value || '06:30';
  const tol  = document.getElementById('cfgTolerancia')?.value  || '5';
  const tolNum = parseInt(tol, 10) || 0;
  const desc = parseFloat(document.getElementById('cfgDescTard')?.value) || 0;
  const rHora = document.getElementById('cfgResHora');
  const rTol  = document.getElementById('cfgResTol');
  const rDesde = document.getElementById('cfgResDesde');
  const rDesc = document.getElementById('cfgResDesc');
  const [hh, mm] = String(hora).split(':').map(n => parseInt(n, 10));
  const baseMin = (Number.isFinite(hh) ? hh : 6) * 60 + (Number.isFinite(mm) ? mm : 30);
  const desdeMin = (baseMin + tolNum + 1) % (24 * 60);
  const desdeHH = String(Math.floor(desdeMin / 60)).padStart(2, '0');
  const desdeMM = String(desdeMin % 60).padStart(2, '0');
  if (rHora) rHora.textContent = hora;
  if (rTol)  rTol.textContent  = tol;
  if (rDesde) rDesde.textContent = `${desdeHH}:${desdeMM}`;
  if (rDesc) rDesc.textContent = desc.toFixed(2);
}

async function asistEnviarCorreos() {
  const anio     = document.getElementById('cfgQAnio')?.value;
  const mes      = document.getElementById('cfgQMes')?.value;
  const quincena = document.getElementById('cfgQQuincena')?.value;
  const msgEl    = document.getElementById('cfgCorreoMsg');
  if (msgEl) msgEl.textContent = 'Enviando...';
  try {
    const res  = await fetch(`${AAPI}/correo/quincena`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anio: +anio, mes: +mes, quincena: +quincena })
    });
    const data = await res.json();
    if (data.ok) {
      if (msgEl) msgEl.innerHTML = `<span style="color:var(--success)">✓ Enviados: ${data.enviados}</span>${data.errores?.length ? ` | Errores: ${data.errores.length}` : ''}`;
    } else {
      if (msgEl) msgEl.innerHTML = `<span style="color:var(--danger)">✗ ${data.error}</span>`;
    }
  } catch { if (msgEl) msgEl.innerHTML = `<span style="color:var(--danger)">✗ Error de red</span>`; }
}

async function asistGuardarConfig() {
  const body = {
    sueldo_minimo:      +document.getElementById('cfgSueldo').value || 1025,
    hora_ingreso:        document.getElementById('cfgHoraIngreso').value,
    tolerancia_min:     +document.getElementById('cfgTolerancia').value || 5,
    descuento_tardanza: +document.getElementById('cfgDescTard').value || 2,
    email_smtp:          document.getElementById('cfgSmtp').value,
    email_puerto:       +document.getElementById('cfgPuerto').value || 587,
    email_usuario:       document.getElementById('cfgEmailUser').value,
    email_password:      document.getElementById('cfgEmailPass').value,
    email_activo:        document.getElementById('cfgEmailActivo').checked
  };
  const res  = await fetch(`${AAPI}/config`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await res.json();
  const msg  = document.getElementById('cfgMsg');
  if (data.ok) { msg.textContent = '✓ Configuración guardada'; setTimeout(() => msg.textContent = '', 3000); }
  else alert(data.error);
}
