/* Acceso a Firebase (colecciones lc_). Las reglas de Firestore repiten cada permiso en el servidor:
   ocultar un botón aquí no es lo que protege los datos. */
import * as fb from './firebase-sdk.js';
import { ESTATUS_OPERACION, docsCompletos, idFolio } from './reglas.js';

const CFG = window.LC_CONFIG;
const params = new URLSearchParams(location.search);
const EMULADOR = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && params.has('emu');

const app = fb.initializeApp(CFG.firebase, 'logistica');
export const auth = fb.getAuth(app);
export const db = fb.getFirestore(app);
if (EMULADOR) { fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); fb.connectFirestoreEmulator(db, '127.0.0.1', 8080); }

const C = (n) => fb.collection(db, n);
const D = (n, id) => fb.doc(db, n, id);
const ahora = () => new Date().toISOString();
const lista = (snap) => snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));

/* ------------------------------------------------------------------ sesión */
let sesion = null; // { uid, area }
export const actual = () => sesion;
const LLAVE_INICIO = 'lc-inicio-sesion';

export function vencida() {
  const t = Number(localStorage.getItem(LLAVE_INICIO) || 0);
  return !t || Date.now() - t > CFG.sesionHoras * 3600000;
}
export function alCambiar(fn) {
  return fb.onAuthStateChanged(auth, async (u) => {
    if (!u) { sesion = null; fn(null); return; }
    const inicio = Date.parse((u.metadata && u.metadata.lastSignInTime) || '') || Number(localStorage.getItem(LLAVE_INICIO) || 0);
    if (inicio) localStorage.setItem(LLAVE_INICIO, String(inicio));
    if (vencida()) { await salir(); fn(null, 'Tu sesión duró más de ' + CFG.sesionHoras + ' horas. Vuelve a entrar.'); return; }
    try {
      const a = await fb.getDoc(D('lc_areas', u.uid));
      if (!a.exists()) { await salir(); fn(null, 'Esta cuenta no tiene un área asignada.'); return; }
      sesion = { uid: u.uid, area: a.data().area };
      fn(sesion);
    } catch (e) { await salir(); fn(null, amigable(e)); }
  });
}
export async function entrar(area, clave) {
  const a = CFG.areas[area];
  if (!a) throw new Error('Elige tu área.');
  await fb.setPersistence(auth, fb.browserLocalPersistence);
  localStorage.setItem(LLAVE_INICIO, String(Date.now()));
  await fb.signInWithEmailAndPassword(auth, a.correo, clave);
}
export async function salir() { localStorage.removeItem(LLAVE_INICIO); await fb.signOut(auth); }

/* Primera vez: crea las cuatro cuentas de área y deja al administrador con sesión. */
export async function configurado() { return (await fb.getDoc(D('lc_config', 'inicio'))).exists(); }
export async function configurar(claves) {
  const uids = {};
  for (const area of ['ventas', 'operacion', 'transporte']) {
    const app2 = fb.initializeApp(CFG.firebase, 'alta-' + area + '-' + Date.now()), a2 = fb.getAuth(app2);
    if (EMULADOR) fb.connectAuthEmulator(a2, 'http://127.0.0.1:9099', { disableWarnings: true });
    uids[area] = (await crearOEntrar(a2, CFG.areas[area].correo, claves[area])).uid;
    await fb.signOut(a2);
  }
  await fb.setPersistence(auth, fb.browserLocalPersistence);
  localStorage.setItem(LLAVE_INICIO, String(Date.now()));
  uids.admin = (await crearOEntrar(auth, CFG.areas.admin.correo, claves.admin)).uid;
  const b = fb.writeBatch(db);
  Object.keys(uids).forEach((area) => b.set(D('lc_areas', uids[area]), { area, creado: ahora() }));
  b.set(D('lc_config', 'inicio'), { fecha: ahora() });
  await b.commit();
}
async function crearOEntrar(a, correo, clave) {
  try { return (await fb.createUserWithEmailAndPassword(a, correo, clave)).user; }
  catch (e) {
    if (e.code !== 'auth/email-already-in-use') throw e;
    return (await fb.signInWithEmailAndPassword(a, correo, clave)).user; // un intento anterior se quedó a medias
  }
}
/* Cambia la contraseña de un área (se necesita la actual). */
export async function cambiarClave(area, actualClave, nueva) {
  const app2 = fb.initializeApp(CFG.firebase, 'clave-' + Date.now()), a2 = fb.getAuth(app2);
  if (EMULADOR) fb.connectAuthEmulator(a2, 'http://127.0.0.1:9099', { disableWarnings: true });
  const u = (await fb.signInWithEmailAndPassword(a2, CFG.areas[area].correo, actualClave)).user;
  await fb.updatePassword(u, nueva);
  await fb.signOut(a2);
}

/* ------------------------------------------------------------------ folios */
export async function folios() { return lista(await fb.getDocs(C('lc_folios'))); }
export async function folio(id) { const s = await fb.getDoc(D('lc_folios', id)); return s.exists() ? Object.assign({ id }, s.data()) : null; }
export async function historial(id) {
  return lista(await fb.getDocs(fb.collection(db, 'lc_folios', id, 'historial'))).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}
function bitacora(b, id, texto) {
  b.set(fb.doc(fb.collection(db, 'lc_folios', id, 'historial')), { fecha: ahora(), area: sesion.area, texto });
}

/* Alta de folios (Ventas). Si el folio ya existe no se toca. */
export async function crearFolios(grupos) {
  const creados = [], repetidos = [];
  for (const g of grupos) {
    const id = idFolio(g.folio);
    if (!id) throw new Error('Hay un pedido sin folio (' + g.cliente + ').');
    const ok = await fb.runTransaction(db, async (tx) => {
      const ref = D('lc_folios', id);
      if ((await tx.get(ref)).exists()) return false;
      tx.set(ref, {
        folio: g.folio, cliente: g.cliente, destino: g.destino, hojas: g.hojas || [],
        tarimas: Number(g.tarimas) || 0, resto: Number(g.resto) || 0, peso_kg: Number(g.peso_kg) || 0, tipo_unidad: g.tipo_unidad,
        estatus: 'RECIBIDO', motivo: '', docs: { factura: false, carta_porte: false, remision: false },
        transportista: '', unidad: '', cita: '', anden: '', salida: '', entregado: '',
        creado: ahora(), actualizado: ahora(), creado_por: sesion.area
      });
      tx.set(fb.doc(fb.collection(db, 'lc_folios', id, 'historial')), { fecha: ahora(), area: sesion.area, texto: 'Alta del folio (Recibido)' });
      return true;
    });
    (ok ? creados : repetidos).push(g.folio);
  }
  return { creados, repetidos };
}

/* Operación: estatus, motivo y documentos. LISTO exige los tres documentos (también lo exige el servidor). */
export async function cambiarEstatus(f, estatus, motivo) {
  const permitido = ['transporte', 'admin'].includes(sesion.area) ? ESTATUS_OPERACION.concat(['EN_RUTA', 'ENTREGADO']) : ESTATUS_OPERACION;
  if (!permitido.includes(estatus)) throw new Error('Tu área no puede poner ese estatus.');
  if (['LISTO', 'EN_RUTA', 'ENTREGADO'].includes(estatus) && !docsCompletos(f.docs)) throw new Error('Faltan documentos: no puede pasar a Listo para transporte.');
  if (estatus === 'PARADO' && !String(motivo || '').trim()) throw new Error('Escribe el motivo por el que está parado.');
  const cambios = { estatus, motivo: estatus === 'PARADO' || estatus === 'INCOMPLETO' ? String(motivo || '').trim() : '', actualizado: ahora() };
  const b = fb.writeBatch(db);
  b.update(D('lc_folios', f.id), cambios);
  bitacora(b, f.id, 'Estatus: ' + estatus + (cambios.motivo ? ' — ' + cambios.motivo : ''));
  if (estatus === 'PARADO') alertaEn(b, 'parado', f, 'Folio ' + f.folio + ' PARADO: ' + cambios.motivo);
  await b.commit();
}
export async function marcarDocumento(f, clave, valor) {
  const b = fb.writeBatch(db);
  b.update(D('lc_folios', f.id), { ['docs.' + clave]: !!valor, actualizado: ahora() });
  bitacora(b, f.id, (valor ? 'Documento entregado: ' : 'Documento retirado: ') + clave.replace('_', ' '));
  await b.commit();
}

/* ------------------------------------------------------------------ transporte */
export async function despacho(id) { const s = await fb.getDoc(D('lc_despachos', id)); return s.exists() ? s.data() : {}; }
export async function despachos() { const r = {}; (await fb.getDocs(C('lc_despachos'))).docs.forEach((d) => { r[d.id] = d.data(); }); return r; }
/* Datos públicos (folio, se ven en la Pantalla) y privados (despacho: operador, placas, tarifa, checklist). */
export async function guardarDespacho(f, publico, privado, alertaTexto) {
  const b = fb.writeBatch(db);
  b.update(D('lc_folios', f.id), Object.assign({}, publico, { actualizado: ahora() }));
  b.set(D('lc_despachos', f.id), Object.assign({}, privado, { actualizado: ahora() }), { merge: true });
  bitacora(b, f.id, 'Asignación: ' + [publico.transportista, publico.unidad, publico.cita && 'cita ' + publico.cita.replace('T', ' '), publico.anden && 'andén ' + publico.anden].filter(Boolean).join(' · '));
  if (alertaTexto) alertaEn(b, 'capacidad', f, alertaTexto);
  await b.commit();
}
export async function guardarChecklist(f, respuestas, revision) {
  const b = fb.writeBatch(db);
  b.set(D('lc_despachos', f.id), { checklist: respuestas, checklist_fecha: ahora(), actualizado: ahora() }, { merge: true });
  bitacora(b, f.id, 'Checklist pre-salida: ' + (revision.pasa ? 'aprobado' : 'reprobado (' + revision.reprobados.join(', ') + ')'));
  if (!revision.pasa) alertaEn(b, 'checklist', f, 'Checklist pre-salida reprobado en ' + f.folio + ': ' + revision.reprobados.join(', '));
  await b.commit();
}
export async function salirARuta(f, revision) {
  const b = fb.writeBatch(db);
  b.update(D('lc_folios', f.id), { estatus: 'EN_RUTA', salida: ahora(), actualizado: ahora() });
  bitacora(b, f.id, 'Salió a ruta; monitoreo GPS activo');
  if (!revision.contestado) alertaEn(b, 'sin_checklist', f, 'El folio ' + f.folio + ' salió a ruta SIN checklist pre-salida.');
  else if (!revision.pasa) alertaEn(b, 'checklist', f, 'El folio ' + f.folio + ' salió a ruta con checklist reprobado: ' + revision.reprobados.join(', '));
  await b.commit();
}
export async function entregar(f) {
  const b = fb.writeBatch(db);
  b.update(D('lc_folios', f.id), { estatus: 'ENTREGADO', entregado: ahora(), actualizado: ahora() });
  bitacora(b, f.id, 'Entregado');
  await b.commit();
}

/* Catálogos (Transporte y Administrador). */
export async function catalogo(nombre) { return lista(await fb.getDocs(C('lc_' + nombre))); }
export async function guardarEn(nombre, id, datos) {
  const ref = id ? D('lc_' + nombre, id) : fb.doc(C('lc_' + nombre));
  await fb.setDoc(ref, Object.assign({}, datos, { actualizado: ahora() }));
  return ref.id;
}
export async function borrarDe(nombre, id) { await fb.deleteDoc(D('lc_' + nombre, id)); }
export async function config(id) { const s = await fb.getDoc(D('lc_config', id)); return s.exists() ? s.data() : {}; }
export async function guardarConfig(id, datos) { await fb.setDoc(D('lc_config', id), datos, { merge: true }); }

/* ------------------------------------------------------------------ alertas (el correo está simulado: solo se registra) */
function alertaEn(b, tipo, f, texto) {
  b.set(fb.doc(C('lc_alertas')), { tipo, folio: f ? f.folio : '', folio_id: f ? f.id : '', texto, fecha: ahora(), area: sesion.area, leida: false, correo: 'simulado' });
}
export async function alertas() { return lista(await fb.getDocs(C('lc_alertas'))).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)); }
export async function marcarLeida(id) { await fb.updateDoc(D('lc_alertas', id), { leida: true }); }

/* Token de Firebase para el puente de Samsara (la Cloud Function revisa el área). */
export async function tokenGps() { try { return auth.currentUser ? await auth.currentUser.getIdToken() : ''; } catch (e) { return ''; } }

export function amigable(e) {
  const c = (e && e.code) || '', m = String((e && e.message) || e || '');
  if (/wrong-password|invalid-credential|user-not-found|invalid-login/.test(c)) return 'Contraseña incorrecta.';
  if (/too-many-requests/.test(c)) return 'Demasiados intentos. Espera unos minutos.';
  if (/weak-password/.test(c)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/network|unavailable/.test(c)) return 'Sin conexión. Revisa tu internet y vuelve a intentar.';
  if (/permission-denied|PERMISSION_DENIED/.test(c + m)) {
    if (vencida()) return 'SESION: Tu sesión venció (' + CFG.sesionHoras + ' horas). Vuelve a entrar.';
    return 'Tu área no tiene permiso para esto (o falta un requisito, como los tres documentos).';
  }
  return m.replace(/^Firebase:\s*/, '');
}
