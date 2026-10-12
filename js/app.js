/* Control de Embarques · Somos Logística CESANTONI.
   Ventas da de alta el pedido → Operación lo arma y documenta → Transporte lo despacha y lo monitorea. */
import * as API from './datos.js?v=7';
import { ESTATUS, ESTATUS_OPERACION, DOCUMENTOS, CHECKLIST, docsCompletos, docsAvance, tipoUnidad, excedeCapacidad, revisarChecklist, norm, combinarFolios, esLigaCorta } from './reglas.js?v=7';
import { revisarPartida, EMBALAJES, ADHESIVOS, REVISION } from './embalajes.js?v=7';
import { leerLibro, interpretar, combinar } from './acopio.js?v=7';
import { planear } from './ruta.js?v=7';
import { ubicacion } from './gps.js?v=7';
import { h, mount, toast, ocupado, fecha, kg, toneladas, pesos, modal, campo, entrada, selector, logos, cargarMapa, mapaEn, leerCoordenadas } from './ui.js?v=7';

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
  config: ['Configuración', 'Usuarios, origen y GPS']
};

let sesion = null, temporizador = null;
logos(document.getElementById('logos'));

/* ================================================================== acceso */
API.alCambiar(async (s, aviso, pendiente, correoPendiente) => {
  sesion = s;
  if (pendiente === 'verificar') { pantallaVerificar(correoPendiente); return; }
  if (!s) { await pantallaAcceso(aviso); return; }
  pintarCuenta();
  irA(location.hash.slice(1));
});
window.addEventListener('hashchange', () => { if (sesion) irA(location.hash.slice(1)); });
/* La sesión dura 12 horas aunque la página quede abierta. */
setInterval(() => { if (sesion && API.vencida()) API.salir().then(() => toast('Tu sesión venció (' + CFG.sesionHoras + ' horas). Vuelve a entrar.', true)); }, 60000);

async function pantallaAcceso(aviso) {
  nav.hidden = true; mount(cuenta);
  let guardado = '';
  try { guardado = localStorage.getItem('lc-ultimo-correo') || ''; } catch (e) { /* sin almacenamiento */ }
  let modo = 'entrar';
  const correo = entrada({ type: 'email', autocomplete: 'username', required: true, id: 'correo', value: guardado, placeholder: 'nombre@cesantoni.com.mx' });
  const clave = entrada({ type: 'password', autocomplete: 'current-password', required: true, id: 'clave', minlength: 8 });
  const clave2 = entrada({ type: 'password', autocomplete: 'new-password', id: 'clave2', minlength: 8 });
  const campo2 = campo('Repite la contraseña', clave2);
  const btn = h('button', { class: 'btn primario', type: 'submit' }, 'Entrar');
  const titulo = h('p', { class: 'gris' });
  const cambiar = h('button', { type: 'button', class: 'enlace' });
  const olvideBtn = h('button', { type: 'button', class: 'enlace', onclick: async () => {
    try { await API.olvide(correo.value); toast('Te mandamos un correo para cambiar tu contraseña. Revisa también Correo no deseado.'); } catch (x) { toast(API.amigable(x), true); }
  } }, 'Olvidé mi contraseña');
  const pintarModo = () => {
    const nuevo = modo === 'crear';
    campo2.hidden = !nuevo; clave2.required = nuevo;
    clave.autocomplete = nuevo ? 'new-password' : 'current-password';
    btn.textContent = nuevo ? 'Crear mi contraseña' : 'Entrar';
    titulo.textContent = nuevo
      ? 'Primera vez: escribe tu correo de trabajo y elige una contraseña (mínimo 8 caracteres). Te llegará un correo para confirmar que es tuyo.'
      : 'Entra con tu correo de trabajo y tu contraseña. Tu área (Ventas, Operación o Transporte) se reconoce por tu correo. La sesión dura ' + CFG.sesionHoras + ' horas.';
    cambiar.textContent = nuevo ? 'Ya tengo contraseña' : 'Primera vez: crear mi contraseña';
    olvideBtn.hidden = nuevo;
  };
  cambiar.addEventListener('click', () => { modo = modo === 'crear' ? 'entrar' : 'crear'; pintarModo(); correo.focus(); });
  const form = h('form', { class: 'tarjeta acceso', onsubmit: async (e) => {
    e.preventDefault();
    try { localStorage.setItem('lc-ultimo-correo', correo.value.trim().toLowerCase()); } catch (x) { /* sin almacenamiento */ }
    try {
      if (modo === 'crear') {
        if (clave.value !== clave2.value) { toast('Las contraseñas no coinciden.', true); return; }
        await ocupado(btn, () => API.crearCuenta(correo.value, clave.value), 'Creando…');
      } else await ocupado(btn, () => API.entrar(correo.value, clave.value), 'Entrando…');
    } catch (x) { toast(API.amigable(x), true); }
  } },
  h('h1', null, 'Control de Embarques'), titulo,
  aviso ? h('p', { class: 'aviso mal' }, aviso) : null,
  campo('Correo', correo), campo('Contraseña', clave), campo2, btn,
  h('p', { class: 'enlaces' }, cambiar, olvideBtn),
  h('p', { class: 'gris chico centro' }, h('a', { href: 'pantalla.html', target: '_blank', rel: 'noopener' }, 'Abrir la Pantalla del almacén'), ' (no pide acceso)'));
  pintarModo();
  mount(main, form);
}
/* Cuenta creada pero el correo aún no se confirma. */
function pantallaVerificar(correo) {
  nav.hidden = true;
  mount(cuenta, h('button', { class: 'btn chico', onclick: () => API.salir() }, 'Salir'));
  const listo = h('button', { class: 'btn primario', type: 'button' }, 'Ya lo confirmé');
  listo.addEventListener('click', async () => {
    try { const ok = await ocupado(listo, () => API.yaVerifique(), 'Revisando…'); if (!ok) toast('Todavía no aparece confirmado. Da clic en la liga del correo y vuelve a intentar.', true); } catch (x) { toast(API.amigable(x), true); }
  });
  const reenviar = h('button', { class: 'btn', type: 'button' }, 'Reenviar correo');
  reenviar.addEventListener('click', async () => { try { await ocupado(reenviar, () => API.reenviarVerificacion(), 'Enviando…'); toast('Correo reenviado.'); } catch (x) { toast(API.amigable(x), true); } });
  mount(main, h('div', { class: 'tarjeta acceso' }, h('h1', null, 'Confirma tu correo'),
    h('p', null, 'Te mandamos un correo a ', h('b', null, correo), ' para confirmar que es tuyo. Da clic en la liga que trae y luego aquí en «Ya lo confirmé».'),
    h('p', { class: 'gris chico' }, 'Remitente: noreply@proveedores-cesantoni.firebaseapp.com. Si no llega en unos minutos, revisa Correo no deseado o Cuarentena. Esto solo se hace una vez.'),
    h('div', { class: 'acciones' }, listo, reenviar)));
}

function pintarCuenta() {
  mount(cuenta, h('span', { class: 'quien', title: sesion.correo }, sesion.nombre && sesion.area !== 'admin' ? sesion.nombre : sesion.correo), h('span', { class: 'chip-area' }, CFG.areas[sesion.area].nombre),
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
/* Nacional (Formato de Acopio: bodegas y obras) o Última Milla (Cuadro de Envío: domicilio del cliente). */
const esUM = (f) => f.tipo_envio === 'ULTIMA_MILLA';
const envioChip = (f) => h('span', { class: 'envio ' + (esUM(f) ? 'um' : 'nac') }, esUM(f) ? 'Última Milla' : 'Nacional');
const FILTROS_ENVIO = [['todos', 'Todos'], ['NACIONAL', 'Nacional'], ['ULTIMA_MILLA', 'Última Milla']];
const leerFiltro = () => { try { return sessionStorage.getItem('lc-envio') || 'todos'; } catch (e) { return 'todos'; } };

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
  let envio = leerFiltro();
  const chips = h('div', { class: 'segmento', role: 'group', 'aria-label': 'Tipo de envío' });
  const pintarChips = () => mount(chips, FILTROS_ENVIO.map(([k, t]) => h('button', { type: 'button', class: k === envio ? 'activa' : '', 'aria-pressed': String(k === envio),
    onclick: () => { envio = k; try { sessionStorage.setItem('lc-envio', k); } catch (e) { /* sin almacenamiento */ } pintarChips(); pintar(); } },
  t + ' (' + lista.filter((f) => k === 'todos' || (f.tipo_envio || 'NACIONAL') === k).length + ')')));
  const pintar = () => {
    const q = norm(buscar.value);
    const vis = lista.filter((f) => (envio === 'todos' || (f.tipo_envio || 'NACIONAL') === envio) && (!q || norm([f.folio, f.cliente, f.destino, f.transportista].join(' ')).includes(q)));
    mount(cuerpo, vis.length ? vis.map((f) => h('tr', { class: alClic ? 'clic' : '', tabindex: alClic ? '0' : null,
      onclick: alClic ? (e) => { if (!e.target.closest('input,select,button,textarea,a')) alClic(f); } : null,
      onkeydown: alClic ? (e) => { if (e.key === 'Enter' && e.target.tagName === 'TR') alClic(f); } : null },
    columnas.map(([, fn, c]) => h('td', { class: c || null }, fn(f))))) : h('tr', null, h('td', { colspan: columnas.length, class: 'gris centro' }, vacio || 'Sin folios.')));
  };
  buscar.addEventListener('input', pintar);
  pintarChips();
  pintar();
  return h('div', null, h('div', { class: 'filtros' }, chips, buscar),
    h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla' }, h('thead', null, h('tr', null, columnas.map(([t, , c]) => h('th', { class: c || null }, t)))), cuerpo)));
}
/* Ficha del folio: datos, documentos e historial. */
async function ficha(f) {
  const hist = h('ul', { class: 'historial' }, h('li', { class: 'gris' }, 'Cargando…'));
  modal('Folio ' + f.folio,
    h('div', { class: 'ficha' },
      dato('Estatus', pill(f.estatus)), dato('Envío', envioChip(f)), dato('Cliente', f.cliente), dato('Destino', f.destino || '—'),
      f.m2 ? dato('Metros', f.m2 + ' m²') : null,
      dato('Tarimas', String(f.tarimas) + (f.resto ? ' + ' + f.resto + ' cajas sueltas' : '')), dato('Peso', kg(f.peso_kg) + ' · ' + f.tipo_unidad),
      f.clasificacion ? dato('Clasificación', f.clasificacion) : null,
      dato('Documentos', DOCUMENTOS.map(([k, n]) => (f.docs && f.docs[k] ? '✓ ' : '✗ ') + n).join('  ')),
      f.motivo ? dato('Motivo', f.motivo) : null,
      f.transportista ? dato('Transportista', f.transportista + (f.unidad ? ' · ' + f.unidad : '')) : null,
      f.cita ? dato('Cita', fecha(f.cita) + (f.anden ? ' · andén ' + f.anden : '')) : null,
      f.hojas && f.hojas.length ? dato('Hojas del acopio', f.hojas.join(', ')) : null),
    f.entrega ? [h('h3', null, 'Entrega (Última Milla)'), bloqueEntrega(f)] : null,
    f.paradas && f.paradas.length ? [h('h3', null, 'Destinos de envío'), h('div', { class: 'tabla-scroll' }, tablaParadas(f.paradas))] : null,
    f.material && f.material.length ? [h('h3', null, 'Material (' + f.material.length + ' partidas)'), tablaMaterial(f.material)] : null,
    h('h3', null, 'Historial'), hist);
  try { const r = await API.historial(f.id); mount(hist, r.length ? r.map((x) => h('li', null, h('b', null, fecha(x.fecha)), ' · ', CFG.areas[x.area] ? CFG.areas[x.area].nombre : x.area, x.por ? ' (' + x.por + ')' : '', ' — ', x.texto)) : h('li', { class: 'gris' }, 'Sin movimientos.')); }
  catch (e) { mount(hist, h('li', { class: 'gris' }, API.amigable(e))); }
}
const dato = (t, v) => h('div', { class: 'dato' }, h('span', null, t), h('b', null, v));
/* Datos de entrega de Última Milla: dirección, quién recibe, teléfonos, descarga y liga de Google Maps. */
const direccion = (e) => [[e.calle, e.no_ext && 'No. ' + e.no_ext, e.no_int && 'Int. ' + e.no_int].filter(Boolean).join(' '), e.colonia && 'Col. ' + e.colonia,
  e.cp && 'CP ' + e.cp, [e.localidad, e.municipio !== e.localidad ? e.municipio : ''].filter(Boolean).join(', ')].filter(Boolean).join(', ');
const ligaMaps = (f) => (f.entrega && f.entrega.maps) || (typeof f.lat === 'number' ? 'https://www.google.com/maps/search/?api=1&query=' + f.lat + ',' + f.lng : '');
function bloqueEntrega(f) {
  const e = f.entrega || {}, liga = ligaMaps(f);
  const marcas = [e.flete_directo && 'Pago de flete directo', e.gran_formato && 'Gran formato', e.adhesivos && 'Adhesivos', e.almacen_distinto && 'Material de almacén distinto al 2100'].filter(Boolean);
  return h('div', { class: 'entrega' },
    h('div', { class: 'ficha' },
      dato('Recibe', e.recibe || f.cliente), dato('Teléfonos', [e.telefono, e.telefono2].filter(Boolean).join(' · ') || '—'),
      dato('Dirección', direccion(e) || '—'), dato('Descarga', e.descarga ? (e.descarga === 'MANUAL' ? 'Manual' : 'Montacargas') : '—'),
      e.embarque || e.orden || e.factura ? dato('Embarque · Orden · Factura', [e.embarque, e.orden, e.factura].map((x) => x || '—').join(' · ')) : null,
      dato('Ubicación', typeof f.lat === 'number' ? f.lat.toFixed(5) + ', ' + f.lng.toFixed(5) : 'Sin coordenadas')),
    marcas.length ? h('p', { class: 'marcas' }, marcas.map((m) => h('span', { class: 'pill amarillo' }, h('i'), m))) : null,
    e.observaciones ? h('p', { class: 'aviso' }, 'Observaciones: ' + e.observaciones) : null,
    liga ? h('p', null, h('a', { class: 'btn chico', href: liga, target: '_blank', rel: 'noopener' }, 'Abrir en Google Maps ↗')) : null);
}
/* Desglose del material por partida, revisado contra Pesos y Embalajes. */
function tablaMaterial(material) {
  let fuera = 0;
  const filas = material.map((m) => {
    const r = revisarPartida(m), e = r.embalaje;
    if (r.fuera_de_rango) fuera++;
    const difTar = e && !e.adhesivo && r.tarimas_calc !== undefined && (r.tarimas_calc !== m.tarimas || r.restos_calc !== m.restos);
    return h('tr', { class: r.fuera_de_rango ? 'alerta' : '' },
      h('td', null, m.destino || '—'), h('td', null, h('b', null, m.producto), h('br'), h('small', { class: 'gris' }, [m.sku, m.lote && 'lote ' + m.lote, m.oc && 'OC ' + m.oc].filter(Boolean).join(' · '))),
      h('td', { class: 'num' }, String(m.cantidad) + ' ' + (m.um || '')), h('td', { class: 'num' }, String(m.tarimas)), h('td', { class: 'num' }, m.restos ? String(m.restos) : '—'),
      h('td', { class: 'num' }, kg(m.kg)), h('td', { class: 'num' }, m.m2 ? String(m.m2) : '—'),
      h('td', { class: 'chico' }, !e ? h('span', { class: 'gris' }, 'Sin formato en la tabla')
        : e.adhesivo ? [e.paquetes_tarima + ' paquetes por tarima']
          : [h('b', null, e.formato), h('br'), e.cajas_tarima + ' cj/tarima · tarima ' + e.tarima + ' · ' + e.altura_cm + ' cm · estiba ' + e.estiba,
            r.kg_min !== undefined ? [h('br'), 'Peso esperado ' + kg(r.kg_min) + ' – ' + kg(r.kg_max)] : null,
            r.fuera_de_rango ? [h('br'), h('b', { class: 'rojo' }, '⚠ Kilos fuera del rango de la tabla')] : null,
            difTar ? [h('br'), h('span', { class: 'amarillo' }, 'Según la tabla: ' + r.tarimas_calc + ' tarimas + ' + r.restos_calc + ' cajas')] : null]));
  });
  return h('div', null, fuera ? h('p', { class: 'aviso mal' }, fuera + ' partida(s) con kilos fuera del rango de Pesos y Embalajes.') : null,
    h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla compacta material' },
      h('thead', null, h('tr', null, ['Destino', 'Producto', 'Cantidad', 'Tarimas', 'Restos', 'Kg', 'm²', 'Embalaje (' + REVISION + ')'].map((t) => h('th', null, t)))),
      h('tbody', null, filas))));
}
/* Lugares de entrega del folio: cada destino de envío del acopio («sucursal · ciudad»), o el destino escrito a mano. */
const lugaresDe = (f) => (f.paradas && f.paradas.length
  ? [...new Set(f.paradas.map((p) => [p.sucursal, p.ciudad].filter(Boolean).join(' · ')))]
  : [f.destino]).filter(Boolean);

/* ================================================================== VENTAS */
async function ventas() {
  const lista = (await API.folios()).sort(porFecha);
  const vista = h('div');
  const archivo = entrada({ type: 'file', accept: '.xlsx,.xlsm', id: 'acopio', multiple: true });
  const previa = h('div');
  archivo.addEventListener('change', async () => {
    const archivos = [...archivo.files];
    if (!archivos.length) return;
    mount(previa, h('p', { class: 'gris' }, 'Leyendo ' + archivos.length + ' archivo(s)…'));
    const grupos = [], avisos = [];
    for (const f of archivos) {
      try {
        const r = interpretar(await leerLibro(new Uint8Array(await f.arrayBuffer())));
        r.grupos.forEach((g) => grupos.push(Object.assign(g, { archivo: f.name })));
        r.avisos.forEach((a) => avisos.push(f.name + ': ' + a));
      } catch (e) { avisos.push(f.name + ': ' + e.message); }
    }
    mostrarPrevia(previa, grupos, avisos, archivos.length === 1 ? archivos[0].name : archivos.length + ' archivos');
    archivo.value = '';
  });
  mount(main, vista);
  mount(vista,
    encabezado('Ventas', 'Sube Formatos de Acopio (Nacional: bodegas y obras) o Cuadros de Envío (Última Milla: domicilio del cliente). Cada archivo es un folio y queda como «Recibido».'),
    h('section', { class: 'tarjeta' },
      h('h2', null, 'Formato de Acopio o Cuadro de Envío'),
      campo('Archivos (.xlsm o .xlsx)', archivo, 'Puedes elegir varios a la vez, de los dos tipos. Del acopio se leen Base, CB360 y Exhibición con el material partida por partida; del Cuadro de Envío, la dirección, teléfonos, liga de Google Maps, peso y metros. Antes de crear los folios puedes revisar, corregir y juntar acopios que viajan en la misma unidad.'),
      h('button', { class: 'btn chico', type: 'button', onclick: () => mostrarPrevia(previa, [], [], 'captura a mano') }, 'Capturar sin archivo'),
      previa),
    h('section', { class: 'tarjeta' }, h('h2', null, 'Folios'),
      tabla(lista, [
        ['Folio', (f) => h('b', null, f.folio)], ['Envío', envioChip], ['Cliente', (f) => f.cliente], ['Destino', (f) => f.destino],
        ['Tarimas', (f) => String(f.tarimas), 'num'], ['Peso', (f) => kg(f.peso_kg), 'num'], ['Tipo', (f) => f.tipo_unidad], ['Docs', docsChip, 'centro'],
        ['Estatus', (f) => pill(f.estatus)], ['Alta', (f) => fecha(f.creado)]
      ], ficha)));
}
/* Detalle por destino de envío (sucursal). */
function tablaParadas(paradas) {
  if (!paradas || !paradas.length) return null;
  return h('table', { class: 'tabla compacta paradas-t' },
    h('thead', null, h('tr', null, ['Destino envío', 'Sucursal', 'Ciudad', 'Tarimas', 'Restos (cajas)', 'Peso', 'm²'].map((t) => h('th', null, t)))),
    h('tbody', null, paradas.map((p) => h('tr', null, h('td', null, p.codigo || '—'), h('td', null, p.sucursal), h('td', null, p.ciudad),
      h('td', { class: 'num' }, String(p.tarimas)), h('td', { class: 'num' }, (Number(p.restos_liso) || 0) + (Number(p.restos_deco) || 0) ? (p.restos_liso || 0) + ' liso · ' + (p.restos_deco || 0) + ' deco' : '—'),
      h('td', { class: 'num' }, kg(p.peso_kg)), h('td', { class: 'num' }, p.m2 ? String(p.m2) : '—')))));
}
function mostrarPrevia(destino, grupos, avisos, nombre) {
  const filas = grupos.map((g) => Object.assign({ incluir: true }, g));
  const cuerpo = h('tbody'), total = h('p', { class: 'gris' });
  const btn = h('button', { class: 'btn primario', type: 'button' }, 'Crear folios');
  const juntar = h('button', { class: 'btn', type: 'button', title: 'Para folios que viajan en la misma unidad' }, 'Juntar marcados en un embarque');
  const recalcular = (r) => { r.tipo_unidad = tipoUnidad(r.peso_kg); r.folio = combinarFolios(r.folio); };
  const pintar = () => {
    mount(cuerpo, filas.flatMap((r, i) => {
      const num = (k, paso) => entrada({ type: 'number', min: 0, step: paso, value: r[k], class: 'entrada corta', 'aria-label': k,
        onchange: (e) => { r[k] = Number(e.target.value) || 0; recalcular(r); pintar(); } });
      const txt = (k, ph) => entrada({ value: r[k], placeholder: ph, 'aria-label': k, onchange: (e) => { r[k] = e.target.value.trim(); if (k === 'folio') recalcular(r); pintar(); } });
      const fila = h('tr', { class: r.incluir ? '' : 'apagado' },
        h('td', null, h('input', { type: 'checkbox', checked: r.incluir, 'aria-label': 'Incluir', onchange: (e) => { r.incluir = e.target.checked; pintar(); } })),
        h('td', null, txt('folio', '12345 o 12345/12346'), r.clasificacion ? h('small', { class: 'gris' }, 'Clasificación ' + r.clasificacion) : null),
        h('td', null, txt('cliente', '')), h('td', null, txt('destino', '')),
        h('td', null, num('tarimas', 0.01)), h('td', null, num('resto', 1)), h('td', null, num('peso_kg', 1)),
        h('td', null, h('b', { class: r.tipo_unidad === 'FULL' ? 'tipo full' : 'tipo' }, r.tipo_unidad)),
        h('td', null, h('button', { class: 'btn-x', 'aria-label': 'Quitar renglón', onclick: () => { filas.splice(i, 1); pintar(); } }, '×')));
      const det = (r.paradas && r.paradas.length) || r.entrega ? h('tr', { class: 'detalle' + (r.incluir ? '' : ' apagado') }, h('td'), h('td', { colspan: 8 },
        h('small', { class: 'gris' }, [envioChip(r), ' ', [r.archivo, (r.hojas || []).length ? 'hojas ' + r.hojas.join(', ') : '', r.material && r.material.length ? r.material.length + ' partidas' : '', r.m2 ? r.m2 + ' m²' : ''].filter(Boolean).join(' · ')]),
        r.entrega ? bloqueEntrega(r) : null,
        tablaParadas(r.paradas),
        r.material && r.material.length ? h('details', { class: 'desglose' }, h('summary', null, 'Ver material (' + r.material.length + ' partidas)'), tablaMaterial(r.material)) : null)) : null;
      return [fila, det].filter(Boolean);
    }));
    const sel = filas.filter((r) => r.incluir);
    total.textContent = sel.length + ' folio(s) · ' + kg(sel.reduce((t, r) => t + (Number(r.peso_kg) || 0), 0)) + ' · ' + sel.reduce((t, r) => t + (Number(r.tarimas) || 0), 0) + ' tarimas';
    btn.textContent = 'Crear ' + sel.length + ' folio(s)';
    btn.disabled = !sel.length;
    juntar.hidden = sel.length < 2;
  };
  juntar.addEventListener('click', () => {
    const sel = filas.filter((r) => r.incluir);
    if (sel.length < 2) return;
    if (sel.some(esUM)) { toast('Solo se juntan folios Nacionales. Los de Última Milla se ordenan en Última Milla.', true); return; }
    const uno = Object.assign({ incluir: true, archivo: sel.map((r) => r.archivo).filter(Boolean).join(' + ') }, combinar(sel));
    const pos = filas.indexOf(sel[0]);
    sel.forEach((r) => filas.splice(filas.indexOf(r), 1));
    filas.splice(pos, 0, uno);
    toast('Embarque ' + uno.folio + ': ' + kg(uno.peso_kg) + ' · ' + uno.tipo_unidad);
    pintar();
  });
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
    h('p', { class: 'gris chico' }, 'Reglas: folios combinados con «/» y sin letra pegada; SENCILLO hasta 40 t, FULL arriba de 40 t. Restos = cajas sueltas que no completan tarima. Corrige lo que haga falta.'),
    h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla compacta' },
      h('thead', null, h('tr', null, ['', 'Folio', 'Cliente', 'Destino', 'Tarimas', 'Restos (cajas)', 'Peso (kg)', 'Tipo', ''].map((t) => h('th', null, t)))), cuerpo)),
    h('div', { class: 'acciones' },
      h('button', { class: 'btn chico', type: 'button', onclick: () => { filas.push({ incluir: true, folio: '', cliente: '', destino: '', hojas: [], tarimas: 0, resto: 0, peso_kg: 0, tipo_unidad: 'SENCILLO' }); pintar(); } }, '+ Agregar renglón'),
      juntar, total, btn));
}

/* ================================================================== OPERACIÓN */
async function operacion() {
  const todos = await API.folios();
  const lista = todos.filter((f) => ESTATUS_OPERACION.includes(f.estatus)).sort((a, b) => ORDEN.indexOf(a.estatus) - ORDEN.indexOf(b.estatus) || porFecha(a, b));
  mount(main,
    encabezado('Operación', 'Armado físico y documentos. No se puede pasar a «Listo para transporte» mientras falte Factura, Carta Porte o Remisión.'),
    contadores(lista, ESTATUS_OPERACION),
    h('section', { class: 'tarjeta' }, tabla(lista, [
      ['Folio', (f) => h('b', null, f.folio)], ['Envío', envioChip], ['Cliente', (f) => f.cliente], ['Destino', (f) => f.destino],
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
        ['Folio', (f) => h('b', null, f.folio)], ['Envío', envioChip], ['Cliente', (f) => f.cliente], ['Destino', (f) => f.destino],
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
    f.entrega ? [h('h3', null, 'Entrega (Última Milla)'), bloqueEntrega(f)] : null,
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
  // Para simular el avance se usa el primer lugar de entrega que tenga coordenadas.
  const coordsDe = (f) => (typeof f.lat === 'number' ? { lat: f.lat, lng: f.lng } : lugaresDe(f).map((l) => destinos.find((d) => norm(d.nombre) === norm(l))).find(Boolean));
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
        h('p', null, f.cliente, ' → ', lugaresDe(f).join(' / ') || 'sin destino'),
        h('p', { class: 'gris chico' }, [f.transportista, f.unidad, d.operador, d.placas].filter(Boolean).join(' · ')),
        h('p', null, h('b', null, p.velocidad + ' km/h'), ' · ', fecha(p.hora), p.faltan_km !== undefined && !real ? ' · faltan ~' + p.faltan_km + ' km' : '', p.lugar ? ' · ' + p.lugar : ''),
        !real && p.motivo ? h('p', { class: 'gris chico' }, p.motivo) : null,
        !coordsDe(f) && !real ? h('p', { class: 'gris chico' }, esUM(f) ? 'El folio no tiene ubicación; pégala en Última Milla para simular el avance.' : 'El destino no tiene coordenadas; captúralas en Catálogos para simular el avance.') : null);
    }));
    if (mapa && puntos.length) mapa.fitBounds(L.latLngBounds(puntos.concat([[origen.lat, origen.lng]])).pad(0.2), { maxZoom: 11 });
  };
  await actualizar();
  temporizador = setInterval(() => actualizar().catch(() => {}), 60000);
}

/* ================================================================== ÚLTIMA MILLA */
async function ruta() {
  const [todos, general, rutas] = await Promise.all([API.folios(), API.config('general'), API.catalogo('rutas')]);
  const origen = general.lat ? general : CFG.origen;
  // Solo folios de Última Milla (Cuadro de Envío). Los Nacionales van a bodegas y obras y no se planean aquí.
  const candidatos = todos.filter((f) => esUM(f) && !['ENTREGADO', 'EN_RUTA'].includes(f.estatus)).sort((a, b) => String(a.destino).localeCompare(String(b.destino)));
  const elegidos = new Set();
  const regresa = h('input', { type: 'checkbox', id: 'regresa' });
  const resultado = h('div');
  const campoUbicacion = (f) => {
    const liga = f.entrega && f.entrega.maps;
    const tiene = typeof f.lat === 'number';
    const estado = h('small', { class: tiene ? 'ok' : 'gris' }, tiene ? '✓ ' + f.lat.toFixed(5) + ', ' + f.lng.toFixed(5) : 'Sin ubicación');
    const input = entrada({ placeholder: 'Pega la liga de Google Maps o lat, lng', class: 'entrada', 'aria-label': 'Ubicación de ' + f.folio,
      onchange: async (e) => {
        const v = e.target.value.trim();
        if (!v) return;
        const p = leerCoordenadas(v);
        if (!p) {
          toast(esLigaCorta(v)
            ? 'Esa liga corta (maps.app.goo.gl) no trae la ubicación. Ábrela, espera a que cargue el mapa y copia la liga larga de la barra de direcciones.'
            : 'No encontré la ubicación. Pega la liga de Google Maps (la larga, de la barra de direcciones) o escribe lat, lng.', true);
          return;
        }
        try { await API.guardarUbicacion(f, p, /^https?:/i.test(v) ? v : ''); f.lat = p.lat; f.lng = p.lng; if (/^https?:/i.test(v) && f.entrega) f.entrega.maps = v; e.target.value = ''; estado.className = 'ok'; estado.textContent = '✓ ' + p.lat.toFixed(5) + ', ' + p.lng.toFixed(5); toast('Ubicación guardada para ' + f.folio + '.'); } catch (x) { err(x); }
      } });
    return h('div', { class: 'ubicacion' }, estado, h('div', { class: 'fila-ub' }, input,
      liga ? h('a', { class: 'btn chico', href: liga, target: '_blank', rel: 'noopener', title: 'Abre la liga del Cuadro de Envío' }, 'Abrir liga ↗') : null),
    !tiene && liga && esLigaCorta(liga) ? h('small', { class: 'gris' }, 'La liga del cuadro es corta: ábrela y pega aquí la liga larga que sale en la barra de direcciones.') : null);
  };
  const filas = candidatos.map((f) => h('tr', null, h('td', null, h('input', { type: 'checkbox', 'aria-label': 'Incluir ' + f.folio, onchange: (e) => (e.target.checked ? elegidos.add(f.id) : elegidos.delete(f.id)) })),
    h('td', null, h('b', null, f.folio)), h('td', null, (f.entrega && f.entrega.recibe) || f.cliente, h('br'), h('small', { class: 'gris' }, f.entrega ? direccion(f.entrega) : f.destino)),
    h('td', { class: 'num' }, kg(f.peso_kg)), h('td', null, pill(f.estatus)), h('td', null, campoUbicacion(f))));
  const calcular = h('button', { class: 'btn primario' }, 'Calcular ruta más corta');
  calcular.addEventListener('click', async () => {
    const sel = candidatos.filter((f) => elegidos.has(f.id));
    if (sel.length < 1) { toast('Elige al menos un folio.', true); return; }
    const sin = sel.filter((f) => typeof f.lat !== 'number');
    if (sin.length) { toast('Falta la ubicación de: ' + sin.map((f) => f.folio).join(', '), true); return; }
    // Folios con la misma ubicación = una sola parada.
    const paradas = [];
    sel.forEach((f) => {
      let p = paradas.find((x) => Math.abs(x.lat - f.lat) < 1e-5 && Math.abs(x.lng - f.lng) < 1e-5);
      if (!p) paradas.push(p = { nombre: (f.entrega && (f.entrega.colonia || f.entrega.localidad)) || f.destino || f.folio, lat: f.lat, lng: f.lng, folios: [] });
      p.folios.push(f.folio);
    });
    const plan = planear(origen, paradas, regresa.checked);
    await pintarRuta(resultado, origen, plan, regresa.checked, sel);
  });
  mount(main, encabezado('Última Milla', 'Orden de entregas a domicilio (folios del Cuadro de Envío) para un mismo viaje.'),
    h('p', { class: 'aviso' }, 'Aproximación por distancia en línea recta: no es la distancia real por carretera. El cálculo se hace aquí mismo; no usa Samsara ni se manda a otro sistema.'),
    h('section', { class: 'tarjeta' },
      h('p', { class: 'gris chico' }, 'Sale de: ', h('b', null, origen.nombre), '. La ubicación sale de la liga de Google Maps del Cuadro de Envío; si es liga corta, ábrela y pega la liga larga una vez.'),
      h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla compacta' }, h('thead', null, h('tr', null, ['', 'Folio', 'Recibe · Dirección', 'Peso', 'Estatus', 'Ubicación'].map((t) => h('th', null, t)))),
        h('tbody', null, filas.length ? filas : h('tr', null, h('td', { colspan: 6, class: 'gris centro' }, 'No hay folios de Última Milla pendientes.'))))),
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
  const [unidades, destinos, folios] = await Promise.all([API.catalogo('unidades'), API.catalogo('destinos'), API.folios()]);
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
  mount(main, encabezado('Catálogos', 'Unidades por transportista, ubicación de destinos Nacionales y Pesos y Embalajes.'),
    h('section', { class: 'tarjeta' }, h('div', { class: 'cabecera' }, h('h2', null, 'Unidades'), h('button', { class: 'btn primario', onclick: () => editarUnidad() }, '+ Nueva unidad')),
      h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla' }, h('thead', null, h('tr', null, ['Transportista', 'Unidad', 'Tipo', 'Capacidad', 'Placas', 'Samsara', ''].map((t) => h('th', null, t)))),
        h('tbody', null, unidades.length ? unidades.sort((a, b) => (a.transportista + a.nombre).localeCompare(b.transportista + b.nombre)).map((u) => h('tr', null,
          h('td', null, u.transportista), h('td', null, h('b', null, u.nombre)), h('td', null, u.tipo), h('td', { class: 'num' }, kg(u.capacidad_kg)), h('td', null, u.placas || '—'),
          h('td', null, u.samsara_id ? h('span', { class: 'fuente real' }, 'Vinculada') : h('span', { class: 'gris' }, 'Simulado')),
          h('td', null, h('button', { class: 'btn chico', onclick: () => editarUnidad(u) }, 'Editar'), ' ',
            h('button', { class: 'btn chico', onclick: async () => { if (confirm('¿Borrar la unidad ' + u.nombre + '?')) { try { await API.borrarDe('unidades', u.id); catalogos().catch(fallo); } catch (x) { err(x); } } } }, 'Borrar'))))
          : h('tr', null, h('td', { colspan: 7, class: 'gris centro' }, 'Sin unidades.')))))),
    seccionDestinos(destinos, folios),
    seccionEmbalajes());
}
/* Destinos Nacionales (sucursales, bodegas y obras): ubicación por liga de Google Maps o lat, lng; se usa en el Monitoreo. */
function seccionDestinos(destinos, folios) {
  const conCoords = new Map(destinos.map((d) => [norm(d.nombre), d]));
  const pendientes = [...new Set(folios.filter((f) => !esUM(f) && f.estatus !== 'ENTREGADO').flatMap(lugaresDe))].filter((l) => !conCoords.has(norm(l))).sort();
  const filas = destinos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map((d) => ({ nombre: d.nombre, d })).concat(pendientes.map((nombre) => ({ nombre, d: null })));
  const guardar = async (nombre, d, valor, celda) => {
    const p = leerCoordenadas(valor);
    if (!p) { toast(esLigaCorta(valor) ? 'Esa liga corta no trae la ubicación: ábrela y copia la liga larga de la barra de direcciones.' : 'Pega la liga de Google Maps (la larga) o escribe lat, lng.', true); return; }
    try { await API.guardarEn('destinos', d ? d.id : null, { nombre, lat: p.lat, lng: p.lng }); mount(celda, h('span', { class: 'ok' }, '✓ ' + p.lat.toFixed(5) + ', ' + p.lng.toFixed(5))); toast('Ubicación guardada para ' + nombre + '.'); } catch (x) { err(x); }
  };
  return h('section', { class: 'tarjeta' }, h('h2', null, 'Destinos Nacionales'),
    h('p', { class: 'gris chico' }, 'Sucursales, bodegas y obras de los folios Nacionales. Pega la liga de Google Maps una vez y se reutiliza para el Monitoreo. ' + (pendientes.length ? pendientes.length + ' sin ubicación.' : '')),
    h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla compacta' }, h('thead', null, h('tr', null, ['Destino', 'Ubicación', 'Liga de Google Maps o lat, lng', ''].map((t) => h('th', null, t)))),
      h('tbody', null, filas.length ? filas.map(({ nombre, d }) => {
        const celda = h('td', null, d ? h('span', { class: 'ok' }, '✓ ' + Number(d.lat).toFixed(5) + ', ' + Number(d.lng).toFixed(5)) : h('span', { class: 'gris' }, 'Sin ubicación'));
        return h('tr', null, h('td', null, nombre), celda,
          h('td', null, entrada({ placeholder: 'https://www.google.com/maps/…', 'aria-label': 'Ubicación de ' + nombre, onchange: (e) => guardar(nombre, d, e.target.value.trim(), celda) })),
          h('td', null, d ? h('button', { class: 'btn chico', onclick: async () => { if (confirm('¿Borrar ' + nombre + '?')) { try { await API.borrarDe('destinos', d.id); catalogos().catch(fallo); } catch (x) { err(x); } } } }, 'Borrar') : null));
      }) : h('tr', null, h('td', { colspan: 4, class: 'gris centro' }, 'Sin destinos.'))))));
}
/* Pesos, embalajes y estibas (referencia para revisar el material de cada folio). */
function seccionEmbalajes() {
  const cuerpo = h('tbody'), buscar = entrada({ type: 'search', placeholder: 'Buscar formato (60*120, PRC, SODIMAC…)', 'aria-label': 'Buscar formato' });
  const pintar = () => {
    const q = norm(buscar.value);
    mount(cuerpo, EMBALAJES.filter((e) => !q || norm(e.formato).includes(q)).map((e) => h('tr', null, h('td', null, h('b', null, e.formato)), h('td', { class: 'num' }, String(e.piezas_caja)),
      h('td', { class: 'num' }, String(e.m2_caja)), h('td', { class: 'num' }, String(e.cajas_tarima)), h('td', { class: 'num' }, String(e.m2_tarima)),
      h('td', { class: 'num' }, e.kg_caja_min + ' – ' + e.kg_caja_max), h('td', { class: 'num' }, kg(e.kg_tarima_max)), h('td', null, e.tarima), h('td', { class: 'num' }, e.altura_cm + ' cm'), h('td', { class: 'num' }, String(e.estiba)))));
  };
  buscar.addEventListener('input', pintar);
  pintar();
  return h('section', { class: 'tarjeta' }, h('h2', null, 'Pesos, embalajes y estibas'),
    h('p', { class: 'gris chico' }, REVISION + '. Con esta tabla se revisan tarimas, restos y kilos de cada partida del acopio.'),
    h('div', { class: 'filtros' }, buscar),
    h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla compacta' }, h('thead', null, h('tr', null,
      ['Formato', 'Pz/caja', 'm²/caja', 'Cajas/tarima', 'm²/tarima', 'Kg por caja', 'Kg máx. tarima', 'Tarima (cm)', 'Altura', 'Estiba'].map((t) => h('th', null, t)))), cuerpo)),
    h('details', { class: 'desglose' }, h('summary', null, 'Adhesivos: paquetes por tarima completa (' + ADHESIVOS.length + ')'),
      h('p', { class: 'gris chico' }, 'Los junteadores vienen en máster pack de 4; tarima completa = 36 cajas (144 paquetes).'),
      h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla compacta' }, h('thead', null, h('tr', null, ['SKU', 'Descripción', 'Paquetes/tarima'].map((t) => h('th', null, t)))),
        h('tbody', null, ADHESIVOS.map((a) => h('tr', null, h('td', null, a.sku), h('td', null, a.descripcion), h('td', { class: 'num' }, String(a.paquetes_tarima)))))))));
}

/* Usuarios: cada correo con su área. Solo el Administrador. */
async function seccionUsuarios() {
  const lista = await API.usuarios();
  const AREAS = ['ventas', 'operacion', 'transporte', 'admin'];
  const correo = entrada({ type: 'email', placeholder: 'nombre@cesantoni.com.mx', 'aria-label': 'Correo nuevo' });
  const nombre = entrada({ placeholder: 'Nombre', 'aria-label': 'Nombre de la persona' });
  const area = selector(AREAS.map((k) => [k, CFG.areas[k].nombre]), 'ventas', { 'aria-label': 'Área' });
  const agregar = h('button', { class: 'btn primario', type: 'submit' }, 'Dar de alta');
  const recargar = () => irA('config');
  return h('section', { class: 'tarjeta' }, h('h2', null, 'Usuarios'),
    h('p', { class: 'gris chico' }, 'Cada persona entra con su correo y ve solo lo de su área (Transporte y Administrador ven todo). ' + CFG.administrador + ' siempre es Administrador. Si das de baja a alguien, su sesión deja de funcionar enseguida.'),
    h('form', { class: 'alta-usuario', onsubmit: async (e) => {
      e.preventDefault();
      try { await ocupado(agregar, () => API.guardarUsuario(correo.value, { nombre: nombre.value, area: area.value })); toast('Alta de ' + correo.value.trim().toLowerCase() + ' en ' + CFG.areas[area.value].nombre + '.'); recargar(); } catch (x) { err(x); }
    } }, correo, nombre, area, agregar),
    h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla compacta' }, h('thead', null, h('tr', null, ['Correo', 'Nombre', 'Área', 'Activo', ''].map((t) => h('th', null, t)))),
      h('tbody', null, h('tr', null, h('td', null, h('b', null, CFG.administrador)), h('td', null, '—'), h('td', null, 'Administrador'), h('td', null, 'Siempre'), h('td')),
        lista.filter((u) => u.id !== CFG.administrador).map((u) => h('tr', { class: u.activo === false ? 'apagado' : '' }, h('td', null, u.id), h('td', null, u.nombre || '—'),
          h('td', null, selector(AREAS.map((k) => [k, CFG.areas[k].nombre]), u.area, { 'aria-label': 'Área de ' + u.id,
            onchange: async (e) => { try { await API.guardarUsuario(u.id, { nombre: u.nombre, area: e.target.value, activo: u.activo !== false }); toast(u.id + ': ' + CFG.areas[e.target.value].nombre); } catch (x) { err(x); } } })),
          h('td', null, h('input', { type: 'checkbox', checked: u.activo !== false, 'aria-label': 'Activo ' + u.id,
            onchange: async (e) => { try { await API.guardarUsuario(u.id, { nombre: u.nombre, area: u.area, activo: e.target.checked }); toast(u.id + (e.target.checked ? ' activo.' : ' dado de baja.')); recargar(); } catch (x) { err(x); } } })),
          h('td', null, h('button', { class: 'btn chico', onclick: async () => { if (confirm('¿Borrar a ' + u.id + '?')) { try { await API.borrarUsuario(u.id); recargar(); } catch (x) { err(x); } } } }, 'Borrar'))))))));
}

/* ================================================================== ALERTAS */
async function alertas() {
  const lista = await API.alertas();
  const TIPOS = { checklist: 'Checklist reprobado', sin_checklist: 'Salida sin checklist', capacidad: 'Sobrepeso', parado: 'Folio parado' };
  mount(main, encabezado('Alertas', 'Avisos automáticos del sistema. El envío por correo está simulado: se registra aquí, todavía no se manda.'),
    h('section', { class: 'tarjeta' }, lista.length ? h('ul', { class: 'alertas' }, lista.map((a) => h('li', { class: a.leida ? 'leida' : '' },
      h('div', null, h('span', { class: 'pill ' + (a.leida ? 'gris' : 'rojo') }, h('i'), TIPOS[a.tipo] || a.tipo), ' ', h('b', null, a.texto)),
      h('div', { class: 'gris chico' }, fecha(a.fecha), ' · ', CFG.areas[a.area] ? CFG.areas[a.area].nombre : a.area, a.por ? ' (' + a.por + ')' : '', ' · correo: ', a.correo || 'simulado'),
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
  g1.addEventListener('click', async () => { const p = leerCoordenadas(coord.value); if (!p) { toast('Pega la liga larga de Google Maps o escribe lat, lng.', true); return; } try { await ocupado(g1, () => API.guardarConfig('general', { nombre: nombre.value.trim() || 'Origen', lat: p.lat, lng: p.lng })); toast('Origen guardado.'); } catch (e) { err(e); } });
  g2.addEventListener('click', async () => { try { await ocupado(g2, () => API.guardarConfig('gps', { puente: puente.value.trim() })); toast(puente.value.trim() ? 'Puente guardado.' : 'Puente quitado: el Monitoreo queda simulado.'); } catch (e) { err(e); } });
  const secciones = [
    encabezado('Configuración'),
    h('section', { class: 'tarjeta' }, h('h2', null, 'Origen de las rutas'), h('p', { class: 'gris chico' }, 'Desde dónde salen las unidades (Última Milla y simulación del Monitoreo). Pega la liga de Google Maps del lugar o sus coordenadas.'),
      h('div', { class: 'rejilla' }, campo('Nombre', nombre), campo('Liga de Google Maps o lat, lng', coord)), h('div', { class: 'acciones' }, g1)),
    h('section', { class: 'tarjeta' }, h('h2', null, 'GPS de Samsara'),
      h('p', { class: 'gris chico' }, 'El token de Samsara no puede ir en esta página (es pública). Va en un puente (Cloud Function) que guarda el token y responde la ubicación. Ver docs/samsara-puente en el repositorio. Si el puente falla o está vacío, el Monitoreo usa datos simulados.'),
      campo('URL del puente', puente), h('div', { class: 'acciones' }, g2))
  ];
  if (puede('admin')) secciones.splice(1, 0, await seccionUsuarios());
  mount(main, secciones);
}
