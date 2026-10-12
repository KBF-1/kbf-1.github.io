/* Control de Embarques · Somos Logística CESANTONI.
   Ventas da de alta el pedido → Operación lo arma y documenta → Transporte lo despacha y lo monitorea. */
import * as API from './datos.js';
import { ESTATUS, ESTATUS_OPERACION, DOCUMENTOS, CHECKLIST, docsCompletos, docsAvance, tipoUnidad, excedeCapacidad, revisarChecklist, tarimas, norm, combinarFolios } from './reglas.js';
import { leerLibro, interpretar } from './acopio.js';
import { planear } from './ruta.js';
import { ubicacion } from './gps.js';
import { h, mount, toast, ocupado, fecha, kg, toneladas, pesos, modal, campo, entrada, selector, logos, cargarMapa, mapaEn, leerCoordenadas } from './ui.js';

const CFG = window.LC_CONFIG;
const main = document.getElementById('main'), nav = document.getElementById('nav'), cuenta = document.getElementById('cuenta');

/* Qué ve cada área. Transporte ve todo, igual que Administrador (solo las contraseñas son del Administrador). */
const TODO = ['ventas', 'operacion', 'transporte', 'monitoreo', 'ruta', 'catalogos', 'alertas', 'config'];
const VISTAS = { ventas: ['ventas', 'alertas'], operacion: ['operacion', 'alertas'], transporte: TODO, admin: TODO };
const MENU = {
  ventas: ['Ventas', 'Subir el Formato de Acopio'],
  operacion: ['Operación', 'Armado y documentos'],
  transporte: ['Transporte', 'Asignar unidad y salida'],
  monitoreo: ['Monitoreo', 'Unidades en ruta (GPS)'],
  ruta: ['Última Milla', 'Ruta más corta de reparto'],
  catalogos: ['Catálogos', 'Unidades y destinos'],
  alertas: ['Alertas', 'Avisos del sistema'],
  config: ['Configuración', 'Origen, GPS y contraseñas']
};

let sesion = null, temporizador = null;
logos(document.getElementById('logos'));

/* ================================================================== acceso */
API.alCambiar(async (s, aviso) => {
  sesion = s;
  if (!s) { await pantallaAcceso(aviso); return; }
  pintarCuenta();
  irA(location.hash.slice(1));
});
window.addEventListener('hashchange', () => { if (sesion) irA(location.hash.slice(1)); });
/* La sesión dura 12 horas aunque la página quede abierta. */
setInterval(() => { if (sesion && API.vencida()) API.salir().then(() => toast('Tu sesión venció (' + CFG.sesionHoras + ' horas). Vuelve a entrar.', true)); }, 60000);

async function pantallaAcceso(aviso) {
  nav.hidden = true; mount(cuenta);
  mount(main, h('p', { class: 'gris' }, 'Cargando…'));
  let listo = true;
  try { listo = await API.configurado(); }
  catch (e) {
    // Sin permiso para leer lc_config/inicio = faltan las reglas «lc_» en Firebase (o no hay conexión).
    if (/permission/i.test((e && e.code) || '')) aviso = 'Firebase no tiene publicadas las reglas de Control de Embarques (bloque «lc_» de firestore.rules). Publícalas y recarga la página.';
    else if (!aviso) aviso = 'No se pudo revisar la configuración (¿sin conexión?).';
  }
  if (!listo) { configuracionInicial(); return; }
  let area = localStorage.getItem('lc-area') || '';
  const clave = entrada({ type: 'password', autocomplete: 'current-password', required: true, id: 'clave' });
  const botones = h('div', { class: 'areas' }, ['ventas', 'operacion', 'transporte', 'admin'].map((k) =>
    h('button', { type: 'button', class: 'area' + (k === area ? ' activa' : ''), 'aria-pressed': String(k === area), onclick: (e) => {
      area = k; botones.querySelectorAll('.area').forEach((b) => { b.classList.remove('activa'); b.setAttribute('aria-pressed', 'false'); });
      e.currentTarget.classList.add('activa'); e.currentTarget.setAttribute('aria-pressed', 'true'); clave.focus();
    } }, CFG.areas[k].nombre)));
  const btn = h('button', { class: 'btn primario', type: 'submit' }, 'Entrar');
  const form = h('form', { class: 'tarjeta acceso', onsubmit: async (e) => {
    e.preventDefault();
    if (!area) { toast('Elige tu área.', true); return; }
    try { await ocupado(btn, () => API.entrar(area, clave.value), 'Entrando…'); localStorage.setItem('lc-area', area); }
    catch (err) { toast(API.amigable(err), true); clave.select(); }
  } },
  h('h1', null, 'Control de Embarques'),
  h('p', { class: 'gris' }, 'Elige tu área y escribe la contraseña de tu área. La sesión dura ' + CFG.sesionHoras + ' horas.'),
  aviso ? h('p', { class: 'aviso mal' }, aviso) : null,
  botones, campo('Contraseña', clave), btn,
  h('p', { class: 'gris chico centro' }, h('a', { href: 'pantalla.html', target: '_blank', rel: 'noopener' }, 'Abrir la Pantalla del almacén'), ' (no pide contraseña)'));
  mount(main, form);
}

function configuracionInicial() {
  const campos = {};
  const filas = ['admin', 'ventas', 'operacion', 'transporte'].map((k) => {
    campos[k] = entrada({ type: 'password', autocomplete: 'new-password', minlength: 6, required: true });
    return campo('Contraseña de ' + CFG.areas[k].nombre, campos[k]);
  });
  const btn = h('button', { class: 'btn primario', type: 'submit' }, 'Crear las cuatro áreas');
  mount(main, h('form', { class: 'tarjeta acceso', onsubmit: async (e) => {
    e.preventDefault();
    const claves = {};
    for (const k of Object.keys(campos)) {
      claves[k] = campos[k].value;
      if (claves[k].length < 6) { toast('Cada contraseña debe tener al menos 6 caracteres.', true); return; }
    }
    if (new Set(Object.values(claves)).size < 4) { toast('Usa una contraseña distinta para cada área.', true); return; }
    try { await ocupado(btn, () => API.configurar(claves), 'Creando…'); localStorage.setItem('lc-area', 'admin'); toast('Listo. Entraste como Administrador.'); location.reload(); }
    catch (err) { toast(API.amigable(err), true); }
  } },
  h('h1', null, 'Configuración inicial'),
  h('p', null, 'Es la primera vez que se abre el sistema. Define la contraseña de cada área; después cada área entra con la suya.'),
  h('div', { class: 'rejilla' }, filas), btn));
}

function pintarCuenta() {
  mount(cuenta, h('span', { class: 'chip-area' }, CFG.areas[sesion.area].nombre),
    h('button', { class: 'btn chico', onclick: () => API.salir() }, 'Cerrar sesión'));
}
function pintarMenu(actual) {
  nav.hidden = false;
  mount(nav, VISTAS[sesion.area].map((v) => h('a', { href: '#' + v, class: v === actual ? 'activo' : '', 'aria-current': v === actual ? 'page' : null },
    h('b', null, MENU[v][0], v === 'alertas' ? h('span', { class: 'contador', id: 'n-alertas', hidden: true }) : null), h('small', null, MENU[v][1]))),
  h('a', { href: 'pantalla.html', target: '_blank', rel: 'noopener' }, h('b', null, 'Pantalla ↗'), h('small', null, 'Tablero del almacén')));
  API.alertas().then((a) => { const n = a.filter((x) => !x.leida).length, el = document.getElementById('n-alertas'); if (el && n) { el.hidden = false; el.textContent = n; } }).catch(() => {});
}
function irA(vista) {
  clearInterval(temporizador);
  const permitidas = VISTAS[sesion.area];
  if (!permitidas.includes(vista)) { location.replace('#' + permitidas[0]); return; }
  pintarMenu(vista);
  mount(main, h('p', { class: 'gris' }, 'Cargando…'));
  ({ ventas, operacion, transporte, monitoreo, ruta, catalogos, alertas, config })[vista]().catch(fallo);
}
function fallo(e) {
  const msg = API.amigable(e);
  if (/^SESION:/.test(msg)) { API.salir(); toast(msg.replace(/^SESION:\s*/, ''), true); return; }
  mount(main, h('div', { class: 'tarjeta' }, h('p', { class: 'aviso mal' }, msg), h('button', { class: 'btn', onclick: () => irA(location.hash.slice(1)) }, 'Reintentar')));
}
const err = (e) => { const m = API.amigable(e); toast(m.replace(/^SESION:\s*/, ''), true); if (/^SESION:/.test(m)) API.salir(); };
const puede = (...areas) => areas.includes(sesion.area);

/* ================================================================== piezas comunes */
const ORDEN = Object.keys(ESTATUS);
function pill(estatus) { const e = ESTATUS[estatus] || { nombre: estatus, color: 'gris' }; return h('span', { class: 'pill ' + e.color }, h('i', { 'aria-hidden': 'true' }), e.nombre); }
function docsChip(f) { const n = docsAvance(f.docs); return h('span', { class: 'docs ' + (n === 3 ? 'ok' : n ? 'medio' : 'no'), title: 'Documentos entregados' }, n + '/3'); }
const porFecha = (a, b) => (a.creado < b.creado ? 1 : -1);

function encabezado(titulo, texto, ...acciones) {
  return h('div', { class: 'encabezado' }, h('div', null, h('h1', null, titulo), texto ? h('p', { class: 'gris' }, texto) : null), h('div', { class: 'acciones' }, acciones));
}
function contadores(lista, claves) {
  return h('div', { class: 'contadores' }, claves.map((k) => h('div', { class: 'contador-c ' + ESTATUS[k].color }, h('b', null, lista.filter((f) => f.estatus === k).length), h('span', null, ESTATUS[k].nombre))));
}
/* Tabla con buscador. columnas: [[título, (f) => contenido, clase?]] */
function tabla(lista, columnas, alClic, vacio) {
  const cuerpo = h('tbody');
  const buscar = entrada({ type: 'search', placeholder: 'Buscar folio, cliente o destino…', 'aria-label': 'Buscar' });
  const pintar = () => {
    const q = norm(buscar.value);
    const vis = lista.filter((f) => !q || norm([f.folio, f.cliente, f.destino, f.transportista].join(' ')).includes(q));
    mount(cuerpo, vis.length ? vis.map((f) => h('tr', { class: alClic ? 'clic' : '', tabindex: alClic ? '0' : null,
      onclick: alClic ? (e) => { if (!e.target.closest('input,select,button,textarea,a')) alClic(f); } : null,
      onkeydown: alClic ? (e) => { if (e.key === 'Enter' && e.target.tagName === 'TR') alClic(f); } : null },
    columnas.map(([, fn, c]) => h('td', { class: c || null }, fn(f))))) : h('tr', null, h('td', { colspan: columnas.length, class: 'gris centro' }, vacio || 'Sin folios.')));
  };
  buscar.addEventListener('input', pintar);
  pintar();
  return h('div', null, h('div', { class: 'filtros' }, buscar),
    h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla' }, h('thead', null, h('tr', null, columnas.map(([t, , c]) => h('th', { class: c || null }, t)))), cuerpo)));
}
/* Ficha del folio: datos, documentos e historial. */
async function ficha(f) {
  const hist = h('ul', { class: 'historial' }, h('li', { class: 'gris' }, 'Cargando…'));
  modal('Folio ' + f.folio,
    h('div', { class: 'ficha' },
      dato('Estatus', pill(f.estatus)), dato('Cliente', f.cliente), dato('Destino', f.destino || '—'),
      dato('Tarimas', String(f.tarimas) + (f.resto ? ' (resto ' + f.resto + ')' : '')), dato('Peso', kg(f.peso_kg) + ' · ' + f.tipo_unidad),
      dato('Documentos', DOCUMENTOS.map(([k, n]) => (f.docs && f.docs[k] ? '✓ ' : '✗ ') + n).join('  ')),
      f.motivo ? dato('Motivo', f.motivo) : null,
      f.transportista ? dato('Transportista', f.transportista + (f.unidad ? ' · ' + f.unidad : '')) : null,
      f.cita ? dato('Cita', fecha(f.cita) + (f.anden ? ' · andén ' + f.anden : '')) : null,
      f.hojas && f.hojas.length ? dato('Hojas del acopio', f.hojas.join(', ')) : null),
    h('h3', null, 'Historial'), hist);
  try { const r = await API.historial(f.id); mount(hist, r.length ? r.map((x) => h('li', null, h('b', null, fecha(x.fecha)), ' · ', CFG.areas[x.area] ? CFG.areas[x.area].nombre : x.area, ' — ', x.texto)) : h('li', { class: 'gris' }, 'Sin movimientos.')); }
  catch (e) { mount(hist, h('li', { class: 'gris' }, API.amigable(e))); }
}
const dato = (t, v) => h('div', { class: 'dato' }, h('span', null, t), h('b', null, v));

/* ================================================================== VENTAS */
async function ventas() {
  const lista = (await API.folios()).sort(porFecha);
  const vista = h('div');
  const archivo = entrada({ type: 'file', accept: '.xlsx,.xlsm', id: 'acopio' });
  const previa = h('div');
  archivo.addEventListener('change', async () => {
    const f = archivo.files[0];
    if (!f) return;
    mount(previa, h('p', { class: 'gris' }, 'Leyendo ' + f.name + '…'));
    try { const r = interpretar(await leerLibro(new Uint8Array(await f.arrayBuffer()))); mostrarPrevia(previa, r.grupos, r.avisos, f.name); }
    catch (e) { mount(previa, h('p', { class: 'aviso mal' }, e.message)); }
  });
  mount(main, vista);
  mount(vista,
    encabezado('Ventas', 'Sube el Formato de Acopio: se separa por cliente y destino, se calculan tarimas y peso, y cada pedido queda como folio «Recibido».'),
    h('section', { class: 'tarjeta' },
      h('h2', null, 'Formato de Acopio'),
      campo('Archivo (.xlsx o .xlsm)', archivo, 'Se leen las hojas Base, CB360 y Exhibición. Antes de crear los folios puedes revisar y corregir todo.'),
      h('button', { class: 'btn chico', type: 'button', onclick: () => mostrarPrevia(previa, [], [], 'captura a mano') }, 'Capturar sin archivo'),
      previa),
    h('section', { class: 'tarjeta' }, h('h2', null, 'Folios'),
      tabla(lista, [
        ['Folio', (f) => h('b', null, f.folio)], ['Cliente', (f) => f.cliente], ['Destino', (f) => f.destino],
        ['Peso', (f) => kg(f.peso_kg), 'num'], ['Tipo', (f) => f.tipo_unidad], ['Docs', docsChip, 'centro'],
        ['Estatus', (f) => pill(f.estatus)], ['Alta', (f) => fecha(f.creado)]
      ], ficha)));
}
function mostrarPrevia(destino, grupos, avisos, nombre) {
  const filas = grupos.map((g) => Object.assign({ incluir: true }, g));
  const cuerpo = h('tbody'), total = h('p', { class: 'gris' });
  const btn = h('button', { class: 'btn primario', type: 'button' }, 'Crear folios');
  const recalcular = (r) => {
    const t = tarimas(r.tarimas);
    r.tarimas = t.total; r.resto = t.resto; r.tipo_unidad = tipoUnidad(r.peso_kg); r.folio = combinarFolios(r.folio);
  };
  const pintar = () => {
    mount(cuerpo, filas.map((r, i) => {
      const num = (k, paso) => entrada({ type: 'number', min: 0, step: paso, value: r[k], class: 'entrada corta', 'aria-label': k,
        onchange: (e) => { r[k] = Number(e.target.value) || 0; recalcular(r); pintar(); } });
      const txt = (k, ph) => entrada({ value: r[k], placeholder: ph, 'aria-label': k, onchange: (e) => { r[k] = e.target.value.trim(); if (k === 'folio') recalcular(r); pintar(); } });
      return h('tr', { class: r.incluir ? '' : 'apagado' },
        h('td', null, h('input', { type: 'checkbox', checked: r.incluir, 'aria-label': 'Incluir', onchange: (e) => { r.incluir = e.target.checked; pintar(); } })),
        h('td', null, txt('folio', '12345 o 12345/12346')), h('td', null, txt('cliente', '')), h('td', null, txt('destino', '')),
        h('td', { class: 'gris chico' }, (r.hojas || []).join(', ')),
        h('td', null, num('tarimas', 0.01)), h('td', { class: 'num' }, r.resto ? String(r.resto) : '—'), h('td', null, num('peso_kg', 1)),
        h('td', null, h('b', { class: r.tipo_unidad === 'FULL' ? 'tipo full' : 'tipo' }, r.tipo_unidad)),
        h('td', null, h('button', { class: 'btn-x', 'aria-label': 'Quitar renglón', onclick: () => { filas.splice(i, 1); pintar(); } }, '×')));
    }));
    const sel = filas.filter((r) => r.incluir);
    total.textContent = sel.length + ' folio(s) · ' + kg(sel.reduce((t, r) => t + r.peso_kg, 0)) + ' · ' + sel.reduce((t, r) => t + r.tarimas, 0).toFixed(2) + ' tarimas';
    btn.textContent = 'Crear ' + sel.length + ' folio(s)';
    btn.disabled = !sel.length;
  };
  btn.addEventListener('click', async () => {
    const sel = filas.filter((r) => r.incluir);
    const falta = sel.find((r) => !r.folio || !r.cliente);
    if (falta) { toast('Cada folio necesita número de folio y cliente.', true); return; }
    const dup = sel.map((r) => r.folio).find((f, i, a) => a.indexOf(f) !== i);
    if (dup) { toast('El folio ' + dup + ' está repetido en la lista.', true); return; }
    try {
      const r = await ocupado(btn, () => API.crearFolios(sel), 'Creando…');
      if (r.creados.length) toast(r.creados.length + ' folio(s) creados como Recibido.');
      if (r.repetidos.length) toast('Ya existían y no se tocaron: ' + r.repetidos.join(', '), true);
      ventas().catch(fallo);
    } catch (e) { err(e); }
  });
  pintar();
  mount(destino,
    h('h3', null, 'Revisión · ' + nombre),
    avisos.map((a) => h('p', { class: 'aviso' }, a)),
    h('p', { class: 'gris chico' }, 'Reglas: folios combinados con «/» y sin letra pegada; SENCILLO hasta 40 t, FULL arriba de 40 t. Corrige lo que haga falta.'),
    h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla compacta' },
      h('thead', null, h('tr', null, ['', 'Folio', 'Cliente', 'Destino', 'Hojas', 'Tarimas', 'Resto', 'Peso (kg)', 'Tipo', ''].map((t) => h('th', null, t)))), cuerpo)),
    h('div', { class: 'acciones' },
      h('button', { class: 'btn chico', type: 'button', onclick: () => { filas.push({ incluir: true, folio: '', cliente: '', destino: '', hojas: [], tarimas: 0, resto: 0, peso_kg: 0, tipo_unidad: 'SENCILLO' }); pintar(); } }, '+ Agregar renglón'),
      total, btn));
}

/* ================================================================== OPERACIÓN */
async function operacion() {
  const todos = await API.folios();
  const lista = todos.filter((f) => ESTATUS_OPERACION.includes(f.estatus)).sort((a, b) => ORDEN.indexOf(a.estatus) - ORDEN.indexOf(b.estatus) || porFecha(a, b));
  mount(main,
    encabezado('Operación', 'Armado físico y documentos. No se puede pasar a «Listo para transporte» mientras falte Factura, Carta Porte o Remisión.'),
    contadores(lista, ESTATUS_OPERACION),
    h('section', { class: 'tarjeta' }, tabla(lista, [
      ['Folio', (f) => h('b', null, f.folio)], ['Cliente', (f) => f.cliente], ['Destino', (f) => f.destino],
      ['Tarimas', (f) => String(f.tarimas), 'num'], ['Peso', (f) => kg(f.peso_kg), 'num'],
      ['Documentos', (f) => h('div', { class: 'docs-check' }, DOCUMENTOS.map(([k, n]) => h('label', null,
        h('input', { type: 'checkbox', checked: !!(f.docs && f.docs[k]), disabled: f.estatus === 'LISTO' && f.docs[k], title: f.estatus === 'LISTO' ? 'Para quitar un documento, primero regresa el folio de Listo' : null,
          onchange: async (e) => { try { await API.marcarDocumento(f, k, e.target.checked); f.docs[k] = e.target.checked; operacion().catch(fallo); } catch (x) { e.target.checked = !e.target.checked; err(x); } } }), n)))],
      ['Estatus', (f) => estatusOperacion(f)]
    ], ficha, 'No hay folios pendientes de armar.')));
}
function estatusOperacion(f) {
  const completos = docsCompletos(f.docs);
  const sel = selector(ESTATUS_OPERACION.map((k) => [k, ESTATUS[k].nombre + (k === 'LISTO' && !completos ? ' (faltan documentos)' : ''), k === 'LISTO' && !completos ? { disabled: true } : null]), f.estatus, { 'aria-label': 'Estatus de ' + f.folio });
  const motivo = entrada({ placeholder: 'Motivo (obligatorio si está Parado)', value: f.motivo || '', 'aria-label': 'Motivo' });
  const caja = h('div', { class: 'estatus-op' }, pill(f.estatus), sel);
  const guardar = h('button', { class: 'btn chico primario' }, 'Guardar');
  const conMotivo = () => ['PARADO', 'INCOMPLETO'].includes(sel.value);
  sel.addEventListener('change', () => {
    if (conMotivo()) { caja.append(motivo, guardar); motivo.focus(); }
    else { motivo.remove(); guardar.remove(); cambiar(); }
  });
  guardar.addEventListener('click', cambiar);
  async function cambiar() {
    if (sel.value === 'PARADO' && !motivo.value.trim()) { toast('Escribe el motivo por el que está parado.', true); motivo.focus(); return; }
    try { await ocupado(guardar, () => API.cambiarEstatus(f, sel.value, motivo.value)); toast(f.folio + ': ' + ESTATUS[sel.value].nombre); operacion().catch(fallo); }
    catch (e) { sel.value = f.estatus; err(e); }
  }
  return caja;
}

/* ================================================================== TRANSPORTE */
async function transporte() {
  const [todos, unidades, desp] = await Promise.all([API.folios(), API.catalogo('unidades'), API.despachos()]);
  let filtro = sessionStorage.getItem('lc-filtro-tr') || 'listos';
  const grupos = {
    listos: ['Listos para transporte', (f) => f.estatus === 'LISTO'],
    ruta: ['En ruta', (f) => f.estatus === 'EN_RUTA'],
    proceso: ['En almacén', (f) => ESTATUS_OPERACION.includes(f.estatus) && f.estatus !== 'LISTO'],
    entregados: ['Entregados', (f) => f.estatus === 'ENTREGADO'],
    todos: ['Todos', () => true]
  };
  const zona = h('div');
  const pintar = () => {
    sessionStorage.setItem('lc-filtro-tr', filtro);
    const lista = todos.filter(grupos[filtro][1]).sort((a, b) => String(a.cita || '9').localeCompare(String(b.cita || '9')) || porFecha(a, b));
    mount(zona,
      h('div', { class: 'pestanas', role: 'tablist' }, Object.entries(grupos).map(([k, [t, fn]]) => h('button', { role: 'tab', 'aria-selected': String(k === filtro), class: k === filtro ? 'activa' : '', onclick: () => { filtro = k; pintar(); } }, t + ' (' + todos.filter(fn).length + ')'))),
      h('section', { class: 'tarjeta' }, tabla(lista, [
        ['Folio', (f) => h('b', null, f.folio)], ['Cliente', (f) => f.cliente], ['Destino', (f) => f.destino],
        ['Peso', (f) => h('span', null, kg(f.peso_kg), h('br'), h('small', { class: 'gris' }, f.tipo_unidad)), 'num'],
        ['Transportista', (f) => f.transportista ? h('span', null, f.transportista, h('br'), h('small', { class: 'gris' }, f.unidad)) : h('span', { class: 'gris' }, 'Sin asignar')],
        ['Cita', (f) => f.cita ? fecha(f.cita) + (f.anden ? ' · A' + f.anden : '') : '—'],
        ['Tarifa', (f) => desp[f.id] && desp[f.id].tarifa ? pesos(desp[f.id].tarifa) : '—', 'num'],
        ['Checklist', (f) => { const r = revisarChecklist(desp[f.id] && desp[f.id].checklist); return h('span', { class: 'docs ' + (r.pasa ? 'ok' : r.contestado ? 'no' : 'medio') }, r.pasa ? 'Aprobado' : r.contestado ? 'Reprobado' : 'Pendiente'); }],
        ['Estatus', (f) => pill(f.estatus)]
      ], (f) => panelDespacho(f, unidades, desp[f.id] || {}), 'No hay folios en esta vista.')));
  };
  mount(main, encabezado('Transporte', 'Asigna transportista y unidad, captura la cita y la tarifa, contesta el checklist y manda a ruta.',
    h('a', { class: 'btn', href: '#catalogos' }, 'Catálogo de unidades')), zona);
  pintar();
}

function panelDespacho(f, unidades, d) {
  const uSel = selector([['', 'Elige una unidad…']].concat(unidades.sort((a, b) => (a.transportista + a.nombre).localeCompare(b.transportista + b.nombre))
    .map((u) => [u.id, u.transportista + ' · ' + u.nombre + ' · ' + u.tipo + ' · ' + toneladas(u.capacidad_kg)])), d.unidad_id || '');
  const transportista = entrada({ value: f.transportista || '' }), operador = entrada({ value: d.operador || '' }), placas = entrada({ value: d.placas || '' });
  const cita = entrada({ type: 'datetime-local', value: f.cita || '' }), anden = entrada({ value: f.anden || '', maxlength: 10 });
  const tarifa = entrada({ type: 'number', min: 0, step: '0.01', value: d.tarifa || '' });
  const avisoPeso = h('p', { class: 'aviso', hidden: true });
  const unidad = () => unidades.find((u) => u.id === uSel.value);
  const revisarPeso = () => {
    const u = unidad();
    avisoPeso.hidden = !(u && excedeCapacidad(f.peso_kg, u.capacidad_kg));
    if (u) avisoPeso.textContent = '⚠ El folio pesa ' + kg(f.peso_kg) + ' y la unidad ' + u.nombre + ' aguanta ' + kg(u.capacidad_kg) + '. Excede por ' + kg(f.peso_kg - u.capacidad_kg) + '.';
  };
  uSel.addEventListener('change', () => { const u = unidad(); if (u) { transportista.value = u.transportista; placas.value = u.placas || placas.value; } revisarPeso(); });
  revisarPeso();
  const guardar = h('button', { class: 'btn primario' }, 'Guardar asignación');
  guardar.addEventListener('click', async () => {
    const u = unidad();
    let alerta = '';
    if (u && excedeCapacidad(f.peso_kg, u.capacidad_kg)) {
      if (!confirm('El peso excede la capacidad de la unidad. ¿Guardar de todos modos? Se registrará una alerta.')) return;
      alerta = 'Folio ' + f.folio + ' asignado a ' + u.nombre + ' con sobrepeso: ' + kg(f.peso_kg) + ' contra ' + kg(u.capacidad_kg) + ' de capacidad.';
    }
    const publico = { transportista: transportista.value.trim(), unidad: u ? u.nombre + ' (' + u.tipo + ')' : '', cita: cita.value, anden: anden.value.trim() };
    const privado = { unidad_id: u ? u.id : '', samsara_id: u ? u.samsara_id || '' : '', operador: operador.value.trim(), placas: placas.value.trim().toUpperCase(), tarifa: Number(tarifa.value) || 0 };
    try { await ocupado(guardar, () => API.guardarDespacho(f, publico, privado, alerta)); toast('Asignación guardada.'); dlg.cerrar(); transporte().catch(fallo); } catch (e) { err(e); }
  });

  // Checklist pre-salida
  const resp = Object.assign({}, d.checklist || {});
  const lista = h('div', { class: 'checklist' }, CHECKLIST.map(([k, n]) => h('div', { class: 'ck' }, h('span', null, n),
    h('div', { class: 'ok-mal', role: 'radiogroup', 'aria-label': n }, [['ok', 'Bien'], ['mal', 'Falla']].map(([v, t]) => h('label', { class: v },
      h('input', { type: 'radio', name: 'ck-' + k, value: v, checked: resp[k] === v, onchange: () => { resp[k] = v; } }), h('span', null, t)))))));
  const guardarCk = h('button', { class: 'btn' }, 'Guardar checklist');
  guardarCk.addEventListener('click', async () => {
    const r = revisarChecklist(resp);
    if (!r.contestado) { toast('Contesta los 8 puntos.', true); return; }
    try { await ocupado(guardarCk, () => API.guardarChecklist(f, resp, r)); d.checklist = Object.assign({}, resp); toast(r.pasa ? 'Checklist aprobado.' : 'Checklist reprobado: se registró una alerta.', !r.pasa); transporte().catch(fallo); dlg.cerrar(); } catch (e) { err(e); }
  });

  const acciones = [];
  if (f.estatus === 'LISTO') {
    const salir = h('button', { class: 'btn primario' }, 'Salir a ruta (activar GPS)');
    salir.addEventListener('click', async () => {
      const r = revisarChecklist(d.checklist);
      if (!f.transportista) { toast('Primero guarda la asignación de transportista y unidad.', true); return; }
      if (!r.pasa && !confirm(r.contestado ? 'El checklist está reprobado. ¿Salir de todos modos? Se registrará una alerta.' : 'No se ha contestado el checklist pre-salida. ¿Salir de todos modos? Se registrará una alerta.')) return;
      try { await ocupado(salir, () => API.salirARuta(f, r)); toast(f.folio + ' en ruta. Monitoreo activo.'); dlg.cerrar(); transporte().catch(fallo); } catch (e) { err(e); }
    });
    acciones.push(salir);
  } else if (f.estatus === 'EN_RUTA') {
    const ent = h('button', { class: 'btn primario' }, 'Marcar entregado');
    ent.addEventListener('click', async () => { try { await ocupado(ent, () => API.entregar(f)); toast(f.folio + ' entregado.'); dlg.cerrar(); transporte().catch(fallo); } catch (e) { err(e); } });
    acciones.push(h('a', { class: 'btn', href: '#monitoreo', onclick: () => dlg.cerrar() }, 'Ver en Monitoreo'), ent);
  } else if (f.estatus !== 'ENTREGADO') {
    acciones.push(h('p', { class: 'aviso' }, 'Este folio sigue en almacén (' + ESTATUS[f.estatus].nombre + '). Puedes asignarlo, pero sale a ruta hasta que Operación lo marque «Listo para transporte».'));
  }

  const dlg = modal('Despacho · ' + f.folio,
    h('div', { class: 'ficha' }, dato('Cliente', f.cliente), dato('Destino', f.destino || '—'), dato('Peso', kg(f.peso_kg) + ' · ' + f.tipo_unidad), dato('Tarimas', String(f.tarimas)), dato('Documentos', docsAvance(f.docs) + '/3'), dato('Estatus', pill(f.estatus))),
    h('h3', null, 'Asignación'),
    !unidades.length ? h('p', { class: 'aviso' }, 'Aún no hay unidades en el catálogo. ', h('a', { href: '#catalogos', onclick: () => dlg.cerrar() }, 'Agregar unidades')) : null,
    h('div', { class: 'rejilla' },
      h('div', { class: 'todo' }, campo('Unidad', uSel)), h('div', { class: 'todo' }, avisoPeso),
      campo('Transportista', transportista), campo('Operador', operador), campo('Placas', placas),
      campo('Fecha y hora de cita', cita), campo('Andén', anden), campo('Tarifa negociada (MXN)', tarifa, 'Solo la ven Transporte y Administrador.')),
    h('div', { class: 'acciones' }, guardar),
    h('h3', null, 'Checklist pre-salida'),
    d.checklist_fecha ? h('p', { class: 'gris chico' }, 'Última revisión: ' + fecha(d.checklist_fecha)) : null,
    lista, h('div', { class: 'acciones' }, guardarCk),
    acciones.length ? h('div', { class: 'acciones separado' }, acciones) : null,
    h('p', null, h('button', { class: 'enlace', onclick: () => { dlg.cerrar(); ficha(f); } }, 'Ver historial del folio')));
}

/* ================================================================== MONITOREO */
async function monitoreo() {
  const [todos, desp, destinos, gps, general] = await Promise.all([API.folios(), API.despachos(), API.catalogo('destinos'), API.config('gps'), API.config('general')]);
  const origen = general.lat ? general : CFG.origen;
  const enRuta = todos.filter((f) => f.estatus === 'EN_RUTA');
  const mapaDiv = h('div', { class: 'mapa' }), lista = h('div', { class: 'unidades' });
  mount(main, encabezado('Monitoreo', 'Ubicación de las unidades en ruta. Se actualiza cada minuto.'),
    !gps.puente ? h('p', { class: 'aviso' }, 'El puente de Samsara no está configurado: todas las ubicaciones son SIMULADAS. Ver Configuración.') : null,
    h('div', { class: 'monitor' }, mapaDiv, lista));
  if (!enRuta.length) { mount(lista, h('p', { class: 'gris' }, 'No hay unidades en ruta.')); }
  let L = null, mapa = null, capa = null;
  try { L = await cargarMapa(); mapa = mapaEn(L, mapaDiv, origen); capa = L.layerGroup().addTo(mapa); L.marker([origen.lat, origen.lng], { title: origen.nombre }).addTo(mapa).bindTooltip(origen.nombre); }
  catch (e) { mount(mapaDiv, h('p', { class: 'gris centro' }, e.message)); }
  const coordsDe = (f) => destinos.find((d) => norm(d.nombre) === norm(f.destino));
  const actualizar = async () => {
    if (!enRuta.length) return;
    const token = await API.tokenGps();
    const pos = await Promise.all(enRuta.map((f) => ubicacion({ puente: gps.puente, token, samsaraId: (desp[f.id] || {}).samsara_id, origen, destino: coordsDe(f), salida: f.salida })));
    if (capa) capa.clearLayers();
    const puntos = [];
    mount(lista, enRuta.map((f, i) => {
      const p = pos[i], d = desp[f.id] || {}, real = p.fuente === 'real';
      if (capa && p.lat !== null) {
        puntos.push([p.lat, p.lng]);
        L.circleMarker([p.lat, p.lng], { radius: 9, color: real ? '#17693F' : '#D77129', fillOpacity: 0.85 }).addTo(capa).bindTooltip(f.folio + ' · ' + (f.transportista || ''));
      }
      return h('article', { class: 'unidad' },
        h('div', { class: 'unidad-cab' }, h('b', null, f.folio), h('span', { class: 'fuente ' + (real ? 'real' : 'sim') }, real ? 'GPS REAL' : 'SIMULADO')),
        h('p', null, f.cliente, ' → ', f.destino || 'sin destino'),
        h('p', { class: 'gris chico' }, [f.transportista, f.unidad, d.operador, d.placas].filter(Boolean).join(' · ')),
        h('p', null, h('b', null, p.velocidad + ' km/h'), ' · ', fecha(p.hora), p.faltan_km !== undefined && !real ? ' · faltan ~' + p.faltan_km + ' km' : '', p.lugar ? ' · ' + p.lugar : ''),
        !real && p.motivo ? h('p', { class: 'gris chico' }, p.motivo) : null,
        !coordsDe(f) && !real ? h('p', { class: 'gris chico' }, 'El destino no tiene coordenadas; captúralas en Catálogos para simular el avance.') : null);
    }));
    if (mapa && puntos.length) mapa.fitBounds(L.latLngBounds(puntos.concat([[origen.lat, origen.lng]])).pad(0.2), { maxZoom: 11 });
  };
  await actualizar();
  temporizador = setInterval(() => actualizar().catch(() => {}), 60000);
}

/* ================================================================== ÚLTIMA MILLA */
async function ruta() {
  const [todos, destinos, general, rutas] = await Promise.all([API.folios(), API.catalogo('destinos'), API.config('general'), API.catalogo('rutas')]);
  const origen = general.lat ? general : CFG.origen;
  const candidatos = todos.filter((f) => !['ENTREGADO', 'EN_RUTA'].includes(f.estatus)).sort((a, b) => a.destino.localeCompare(b.destino));
  const elegidos = new Set();
  const coords = new Map(destinos.map((d) => [norm(d.nombre), d]));
  const regresa = h('input', { type: 'checkbox', id: 'regresa' });
  const resultado = h('div');
  const filas = candidatos.map((f) => {
    const d = coords.get(norm(f.destino));
    const c = entrada({ value: d ? d.lat + ', ' + d.lng : '', placeholder: 'lat, lng', class: 'entrada corta-l', 'aria-label': 'Coordenadas de ' + f.destino,
      onchange: async (e) => {
        const p = leerCoordenadas(e.target.value);
        if (!p) { toast('Escribe latitud y longitud, por ejemplo 19.4326, -99.1332 (en Google Maps: clic derecho sobre el lugar).', true); return; }
        try { const id = await API.guardarEn('destinos', d ? d.id : null, { nombre: f.destino, lat: p.lat, lng: p.lng }); coords.set(norm(f.destino), { id, nombre: f.destino, lat: p.lat, lng: p.lng }); e.target.value = p.lat + ', ' + p.lng; toast('Coordenadas guardadas para ' + f.destino + '.'); } catch (x) { err(x); }
      } });
    return h('tr', null, h('td', null, h('input', { type: 'checkbox', 'aria-label': 'Incluir ' + f.folio, onchange: (e) => (e.target.checked ? elegidos.add(f.id) : elegidos.delete(f.id)) })),
      h('td', null, h('b', null, f.folio)), h('td', null, f.cliente), h('td', null, f.destino), h('td', null, kg(f.peso_kg)), h('td', null, pill(f.estatus)), h('td', null, c));
  });
  const calcular = h('button', { class: 'btn primario' }, 'Calcular ruta más corta');
  calcular.addEventListener('click', async () => {
    const sel = candidatos.filter((f) => elegidos.has(f.id));
    if (sel.length < 1) { toast('Elige al menos un folio.', true); return; }
    const sin = sel.filter((f) => !coords.get(norm(f.destino)));
    if (sin.length) { toast('Faltan coordenadas de: ' + [...new Set(sin.map((f) => f.destino))].join(', '), true); return; }
    // Varios folios al mismo destino = una sola parada.
    const paradas = [];
    sel.forEach((f) => { const d = coords.get(norm(f.destino)); let p = paradas.find((x) => norm(x.nombre) === norm(f.destino)); if (!p) paradas.push(p = { nombre: f.destino, lat: d.lat, lng: d.lng, folios: [] }); p.folios.push(f.folio); });
    const plan = planear(origen, paradas, regresa.checked);
    await pintarRuta(resultado, origen, plan, regresa.checked, sel);
  });
  mount(main, encabezado('Última Milla', 'Orden de paradas para repartir varios folios en un mismo viaje.'),
    h('p', { class: 'aviso' }, 'Aproximación por distancia en línea recta: no es la distancia real por carretera. El cálculo se hace aquí mismo; no usa Samsara ni se manda a otro sistema.'),
    h('section', { class: 'tarjeta' },
      h('p', { class: 'gris chico' }, 'Sale de: ', h('b', null, origen.nombre), ' (' + origen.lat + ', ' + origen.lng + '). Las coordenadas de cada destino se capturan una vez y se reutilizan.'),
      h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla compacta' }, h('thead', null, h('tr', null, ['', 'Folio', 'Cliente', 'Destino', 'Peso', 'Estatus', 'Coordenadas'].map((t) => h('th', null, t)))),
        h('tbody', null, filas.length ? filas : h('tr', null, h('td', { colspan: 7, class: 'gris centro' }, 'No hay folios pendientes.'))))),
      h('div', { class: 'acciones' }, h('label', { class: 'casilla' }, regresa, ' Regresar al origen al terminar'), calcular)),
    resultado,
    rutas.length ? h('section', { class: 'tarjeta' }, h('h2', null, 'Rutas guardadas'), h('ul', { class: 'historial' },
      rutas.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 20).map((r) => h('li', null, h('b', null, fecha(r.fecha)), ' · ', r.paradas.map((p) => p.nombre).join(' → '), ' · ~' + Math.round(r.km) + ' km en línea recta')))) : null);
}
async function pintarRuta(destino, origen, plan, regresa, folios) {
  const mapaDiv = h('div', { class: 'mapa' });
  const guardar = h('button', { class: 'btn' }, 'Guardar ruta');
  guardar.addEventListener('click', async () => {
    try { await ocupado(guardar, () => API.guardarEn('rutas', null, { fecha: new Date().toISOString(), origen: { nombre: origen.nombre, lat: origen.lat, lng: origen.lng }, regresa, km: plan.km, paradas: plan.orden.map((p) => ({ nombre: p.nombre, lat: p.lat, lng: p.lng, folios: p.folios })), folios: folios.map((f) => f.folio), aproximacion: 'linea_recta' })); toast('Ruta guardada.'); } catch (e) { err(e); }
  });
  mount(destino, h('section', { class: 'tarjeta' },
    h('div', { class: 'cabecera' }, h('h2', null, 'Ruta sugerida · ~' + plan.km.toFixed(1) + ' km'), h('span', { class: 'pill amarillo' }, h('i'), 'Aproximación (línea recta)')),
    h('p', { class: 'origen' }, 'Sale de ', h('b', null, origen.nombre)),
    h('ol', { class: 'paradas' }, plan.orden.map((p, i) => h('li', null, h('b', null, p.nombre), ' · folios ', p.folios.join(', '), h('span', { class: 'gris' }, ' · ' + plan.tramos[i].toFixed(1) + ' km')))),
    regresa ? h('p', { class: 'origen' }, 'Regresa a ', h('b', null, origen.nombre), h('span', { class: 'gris' }, ' · ' + plan.tramos[plan.tramos.length - 1].toFixed(1) + ' km')) : null,
    mapaDiv, h('div', { class: 'acciones' }, guardar)));
  try {
    const L = await cargarMapa(), m = mapaEn(L, mapaDiv, origen);
    const pts = [[origen.lat, origen.lng]].concat(plan.orden.map((p) => [p.lat, p.lng]));
    if (regresa) pts.push([origen.lat, origen.lng]);
    L.polyline(pts, { color: '#D77129', weight: 3, dashArray: '6 6' }).addTo(m);
    L.marker([origen.lat, origen.lng]).addTo(m).bindTooltip(origen.nombre);
    plan.orden.forEach((p, i) => L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'num-parada', html: String(i + 1), iconSize: [26, 26] }) }).addTo(m).bindTooltip(p.nombre));
    m.fitBounds(L.latLngBounds(pts).pad(0.15));
  } catch (e) { mount(mapaDiv, h('p', { class: 'gris centro' }, e.message)); }
}

/* ================================================================== CATÁLOGOS */
async function catalogos() {
  const [unidades, destinos] = await Promise.all([API.catalogo('unidades'), API.catalogo('destinos')]);
  const editarUnidad = (u) => {
    u = u || {};
    const c = { transportista: entrada({ value: u.transportista || '', required: true }), nombre: entrada({ value: u.nombre || '', required: true, placeholder: 'Económico o nombre' }),
      tipo: selector(['SENCILLO', 'FULL', 'TORTON', 'RABON', 'CAMIONETA 3.5'].map((t) => [t, t]), u.tipo || 'SENCILLO'),
      capacidad_kg: entrada({ type: 'number', min: 0, step: 1, value: u.capacidad_kg || '', required: true }), placas: entrada({ value: u.placas || '' }),
      samsara_id: entrada({ value: u.samsara_id || '', placeholder: 'Id del vehículo en Samsara (opcional)' }) };
    const btn = h('button', { class: 'btn primario', type: 'submit' }, 'Guardar');
    const dlg = modal(u.id ? 'Editar unidad' : 'Nueva unidad', h('form', { onsubmit: async (e) => {
      e.preventDefault();
      const datos = { transportista: c.transportista.value.trim(), nombre: c.nombre.value.trim(), tipo: c.tipo.value, capacidad_kg: Number(c.capacidad_kg.value) || 0, placas: c.placas.value.trim().toUpperCase(), samsara_id: c.samsara_id.value.trim() };
      try { await ocupado(btn, () => API.guardarEn('unidades', u.id, datos)); dlg.cerrar(); catalogos().catch(fallo); } catch (x) { err(x); }
    } }, h('div', { class: 'rejilla' }, campo('Transportista', c.transportista), campo('Unidad', c.nombre), campo('Tipo', c.tipo), campo('Capacidad (kg)', c.capacidad_kg),
      campo('Placas', c.placas), campo('Vehículo Samsara', c.samsara_id, 'Si está vacío, el Monitoreo usa datos simulados.')), h('div', { class: 'acciones' }, btn)));
  };
  mount(main, encabezado('Catálogos', 'Unidades por transportista y coordenadas de destinos.'),
    h('section', { class: 'tarjeta' }, h('div', { class: 'cabecera' }, h('h2', null, 'Unidades'), h('button', { class: 'btn primario', onclick: () => editarUnidad() }, '+ Nueva unidad')),
      h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla' }, h('thead', null, h('tr', null, ['Transportista', 'Unidad', 'Tipo', 'Capacidad', 'Placas', 'Samsara', ''].map((t) => h('th', null, t)))),
        h('tbody', null, unidades.length ? unidades.sort((a, b) => (a.transportista + a.nombre).localeCompare(b.transportista + b.nombre)).map((u) => h('tr', null,
          h('td', null, u.transportista), h('td', null, h('b', null, u.nombre)), h('td', null, u.tipo), h('td', { class: 'num' }, kg(u.capacidad_kg)), h('td', null, u.placas || '—'),
          h('td', null, u.samsara_id ? h('span', { class: 'fuente real' }, 'Vinculada') : h('span', { class: 'gris' }, 'Simulado')),
          h('td', null, h('button', { class: 'btn chico', onclick: () => editarUnidad(u) }, 'Editar'), ' ',
            h('button', { class: 'btn chico', onclick: async () => { if (confirm('¿Borrar la unidad ' + u.nombre + '?')) { try { await API.borrarDe('unidades', u.id); catalogos().catch(fallo); } catch (x) { err(x); } } } }, 'Borrar'))))
          : h('tr', null, h('td', { colspan: 7, class: 'gris centro' }, 'Sin unidades.')))))),
    h('section', { class: 'tarjeta' }, h('h2', null, 'Destinos con coordenadas'),
      h('p', { class: 'gris chico' }, 'Se capturan en Última Milla la primera vez que aparece un destino. Aquí se corrigen.'),
      h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla compacta' }, h('thead', null, h('tr', null, ['Destino', 'Coordenadas', ''].map((t) => h('th', null, t)))),
        h('tbody', null, destinos.length ? destinos.sort((a, b) => a.nombre.localeCompare(b.nombre)).map((d) => h('tr', null, h('td', null, d.nombre),
          h('td', null, entrada({ value: d.lat + ', ' + d.lng, class: 'entrada corta-l', 'aria-label': 'Coordenadas', onchange: async (e) => { const p = leerCoordenadas(e.target.value); if (!p) { toast('Coordenadas no válidas.', true); return; } try { await API.guardarEn('destinos', d.id, { nombre: d.nombre, lat: p.lat, lng: p.lng }); toast('Guardado.'); } catch (x) { err(x); } } })),
          h('td', null, h('button', { class: 'btn chico', onclick: async () => { if (confirm('¿Borrar ' + d.nombre + '?')) { try { await API.borrarDe('destinos', d.id); catalogos().catch(fallo); } catch (x) { err(x); } } } }, 'Borrar'))))
          : h('tr', null, h('td', { colspan: 3, class: 'gris centro' }, 'Sin destinos.')))))));
}

/* ================================================================== ALERTAS */
async function alertas() {
  const lista = await API.alertas();
  const TIPOS = { checklist: 'Checklist reprobado', sin_checklist: 'Salida sin checklist', capacidad: 'Sobrepeso', parado: 'Folio parado' };
  mount(main, encabezado('Alertas', 'Avisos automáticos del sistema. El envío por correo está simulado: se registra aquí, todavía no se manda.'),
    h('section', { class: 'tarjeta' }, lista.length ? h('ul', { class: 'alertas' }, lista.map((a) => h('li', { class: a.leida ? 'leida' : '' },
      h('div', null, h('span', { class: 'pill ' + (a.leida ? 'gris' : 'rojo') }, h('i'), TIPOS[a.tipo] || a.tipo), ' ', h('b', null, a.texto)),
      h('div', { class: 'gris chico' }, fecha(a.fecha), ' · ', CFG.areas[a.area] ? CFG.areas[a.area].nombre : a.area, ' · correo: ', a.correo || 'simulado'),
      a.leida ? null : h('button', { class: 'btn chico', onclick: async () => { try { await API.marcarLeida(a.id); alertas().catch(fallo); } catch (e) { err(e); } } }, 'Marcar leída'))))
      : h('p', { class: 'gris' }, 'Sin alertas.')));
}

/* ================================================================== CONFIGURACIÓN */
async function config() {
  const [general, gps] = await Promise.all([API.config('general'), API.config('gps')]);
  const o = general.lat ? general : CFG.origen;
  const nombre = entrada({ value: o.nombre }), coord = entrada({ value: o.lat + ', ' + o.lng });
  const puente = entrada({ type: 'url', value: gps.puente || '', placeholder: 'https://…cloudfunctions.net/samsara' });
  const g1 = h('button', { class: 'btn primario' }, 'Guardar origen'), g2 = h('button', { class: 'btn primario' }, 'Guardar puente');
  g1.addEventListener('click', async () => { const p = leerCoordenadas(coord.value); if (!p) { toast('Coordenadas no válidas.', true); return; } try { await ocupado(g1, () => API.guardarConfig('general', { nombre: nombre.value.trim() || 'Origen', lat: p.lat, lng: p.lng })); toast('Origen guardado.'); } catch (e) { err(e); } });
  g2.addEventListener('click', async () => { try { await ocupado(g2, () => API.guardarConfig('gps', { puente: puente.value.trim() })); toast(puente.value.trim() ? 'Puente guardado.' : 'Puente quitado: el Monitoreo queda simulado.'); } catch (e) { err(e); } });
  const secciones = [
    encabezado('Configuración'),
    h('section', { class: 'tarjeta' }, h('h2', null, 'Origen de las rutas'), h('p', { class: 'gris chico' }, 'Desde dónde salen las unidades (Última Milla y simulación del Monitoreo). En Google Maps: clic derecho sobre el lugar y copia las coordenadas.'),
      h('div', { class: 'rejilla' }, campo('Nombre', nombre), campo('Coordenadas (lat, lng)', coord)), h('div', { class: 'acciones' }, g1)),
    h('section', { class: 'tarjeta' }, h('h2', null, 'GPS de Samsara'),
      h('p', { class: 'gris chico' }, 'El token de Samsara no puede ir en esta página (es pública). Va en un puente (Cloud Function) que guarda el token y responde la ubicación. Ver docs/samsara-puente en el repositorio. Si el puente falla o está vacío, el Monitoreo usa datos simulados.'),
      campo('URL del puente', puente), h('div', { class: 'acciones' }, g2))
  ];
  if (puede('admin')) {
    const area = selector(['ventas', 'operacion', 'transporte', 'admin'].map((k) => [k, CFG.areas[k].nombre]), 'ventas');
    const actualC = entrada({ type: 'password', autocomplete: 'off' }), nueva = entrada({ type: 'password', autocomplete: 'new-password', minlength: 6 });
    const g3 = h('button', { class: 'btn primario' }, 'Cambiar contraseña');
    g3.addEventListener('click', async () => {
      if (nueva.value.length < 6) { toast('La nueva contraseña debe tener al menos 6 caracteres.', true); return; }
      try { await ocupado(g3, () => API.cambiarClave(area.value, actualC.value, nueva.value)); toast('Contraseña de ' + CFG.areas[area.value].nombre + ' cambiada. Las sesiones abiertas siguen hasta que venzan.'); actualC.value = nueva.value = ''; } catch (e) { err(e); }
    });
    secciones.push(h('section', { class: 'tarjeta' }, h('h2', null, 'Contraseñas por área'),
      h('div', { class: 'rejilla' }, campo('Área', area), h('span'), campo('Contraseña actual', actualC), campo('Contraseña nueva', nueva)), h('div', { class: 'acciones' }, g3)));
  }
  mount(main, secciones);
}
