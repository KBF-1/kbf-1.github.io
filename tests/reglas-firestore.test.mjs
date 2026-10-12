/* Reglas de Firestore (bloque lc_) contra el emulador:
   firebase emulators:exec --only firestore "node --test tests/reglas-firestore.test.mjs"  (con firestore.rules del repositorio de proveedores) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'proveedores-cesantoni', firestore: { rules: readFileSync(process.env.REGLAS || 'firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
const ahora = Math.floor(Date.now() / 1000);
const CORREO = { ventas: 'ventas@cesantoni.com.mx', operacion: 'opera@cesantoni.com.mx', transporte: 'trafico@cesantoni.com.mx', admin: 'jroman@cesantoni.com.mx' };
const como = (area, horas = 0, extra = {}) => env.authenticatedContext('u-' + area, { auth_time: ahora - horas * 3600, email: CORREO[area] || area, email_verified: true, ...extra }).firestore();
const folio = (extra) => Object.assign({ folio: '100', cliente: 'Cliente', destino: 'León', hojas: ['Base'], tarimas: 2, resto: 0, peso_kg: 1000, tipo_unidad: 'SENCILLO',
  estatus: 'RECIBIDO', motivo: '', docs: { factura: false, carta_porte: false, remision: false }, transportista: '', unidad: '', cita: '', anden: '', salida: '', entregado: '',
  creado: 'x', actualizado: 'x', creado_por: 'ventas' }, extra);

test.before(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const a of ['ventas', 'operacion', 'transporte']) await setDoc(doc(db, 'lc_usuarios', CORREO[a]), { area: a, activo: true });
    await setDoc(doc(db, 'lc_usuarios', 'baja@cesantoni.com.mx'), { area: 'transporte', activo: false });
    await setDoc(doc(db, 'lc_folios', 'F1'), folio());
    await setDoc(doc(db, 'lc_despachos', 'F1'), { tarifa: 18500, operador: 'Juan', placas: 'ABC123' });
  });
});
test.after(() => env.cleanup());

test('Pantalla: sin sesión solo lee lc_pantalla (no folios, material, direcciones ni tarifas)', async () => {
  const anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDocs(collection(anon, 'lc_pantalla')));
  await assertFails(getDocs(collection(anon, 'lc_folios')));
  await assertFails(getDoc(doc(anon, 'lc_despachos', 'F1')));
  await assertFails(setDoc(doc(anon, 'lc_folios', 'X'), folio({ folio: 'X' })));
  await assertFails(setDoc(doc(anon, 'lc_pantalla', 'X'), { folio: 'X', docs: 0 }));
  const pan = { folio: '100', tipo_envio: 'NACIONAL', cliente: 'Cliente', destino: 'León', transportista: '', tipo_unidad: 'SENCILLO', cita: '', anden: '', docs: 1, estatus: 'RECIBIDO', entregado: '', actualizado: 'x' };
  await assertSucceeds(setDoc(doc(como('operacion'), 'lc_pantalla', 'F1'), pan));
  await assertFails(setDoc(doc(como('operacion'), 'lc_pantalla', 'F1'), { ...pan, tarifa: 100 }));
  await assertFails(setDoc(doc(como('operacion'), 'lc_pantalla', 'F1'), { ...pan, telefono: '1' }));
  await assertSucceeds(getDocs(collection(como('ventas'), 'lc_folios')));
});
test('Última Milla: folio con entrega y material', async () => {
  const um = folio({ folio: '9001', tipo_envio: 'ULTIMA_MILLA', m2: 36.96, lat: null, lng: null, material: [],
    entrega: { recibe: 'X', telefono: '1', calle: 'C', maps: 'https://maps.app.goo.gl/x', descarga: 'MANUAL' } });
  await assertSucceeds(setDoc(doc(como('ventas'), 'lc_folios', 'UM-9001'), um));
  await assertFails(setDoc(doc(como('ventas'), 'lc_folios', 'UM-9002'), { ...um, folio: '9002', tipo_envio: 'OTRO' }));
  await assertSucceeds(updateDoc(doc(como('transporte'), 'lc_folios', 'UM-9001'), { lat: 22.7, lng: -102.5, 'entrega.maps': 'https://www.google.com/maps/@22.7,-102.5,15z' }));
  await assertFails(updateDoc(doc(como('operacion'), 'lc_folios', 'UM-9001'), { lat: 1, lng: 1 }));
});
test('Tarifa: solo Transporte y Administrador', async () => {
  await assertFails(getDoc(doc(como('ventas'), 'lc_despachos', 'F1')));
  await assertFails(getDoc(doc(como('operacion'), 'lc_despachos', 'F1')));
  await assertFails(getDocs(collection(como('operacion'), 'lc_despachos')));
  await assertSucceeds(getDoc(doc(como('transporte'), 'lc_despachos', 'F1')));
  await assertSucceeds(getDoc(doc(como('admin'), 'lc_despachos', 'F1')));
});
test('Alta de folios: Ventas sí, Operación no; siempre como RECIBIDO', async () => {
  await assertSucceeds(setDoc(doc(como('ventas'), 'lc_folios', 'F2'), folio({ folio: '200' })));
  await assertFails(setDoc(doc(como('operacion'), 'lc_folios', 'F3'), folio({ folio: '300' })));
  await assertFails(setDoc(doc(como('ventas'), 'lc_folios', 'F4'), folio({ folio: '400', estatus: 'LISTO', docs: { factura: true, carta_porte: true, remision: true } })));
  await assertFails(setDoc(doc(como('ventas'), 'lc_folios', 'F5'), folio({ folio: '500', tarifa: 1 })));
  await assertSucceeds(setDoc(doc(como('ventas'), 'lc_folios', 'F6'), folio({ folio: '600', clasificacion: 'C', paradas: [{ codigo: '1', sucursal: 'S', ciudad: 'León', tarimas: 2, restos_liso: 0, restos_deco: 0, peso_kg: 1000, m2: 0 }] })));
  await assertFails(updateDoc(doc(como('ventas'), 'lc_folios', 'F2'), { cliente: 'Otro' }));
});
test('LISTO PARA TRANSPORTE se bloquea en el servidor si falta un documento', async () => {
  const op = como('operacion');
  await assertFails(updateDoc(doc(op, 'lc_folios', 'F1'), { estatus: 'LISTO' }));
  await assertSucceeds(updateDoc(doc(op, 'lc_folios', 'F1'), { 'docs.factura': true, 'docs.carta_porte': true }));
  await assertFails(updateDoc(doc(op, 'lc_folios', 'F1'), { estatus: 'LISTO' }));
  await assertFails(updateDoc(doc(como('admin'), 'lc_folios', 'F1'), { estatus: 'LISTO' }));
  await assertSucceeds(updateDoc(doc(op, 'lc_folios', 'F1'), { 'docs.remision': true }));
  await assertSucceeds(updateDoc(doc(op, 'lc_folios', 'F1'), { estatus: 'LISTO' }));
  await assertFails(updateDoc(doc(op, 'lc_folios', 'F1'), { 'docs.remision': false }));
});
test('PARADO exige motivo', async () => {
  const op = como('operacion');
  await assertFails(updateDoc(doc(op, 'lc_folios', 'F2'), { estatus: 'PARADO', motivo: '' }));
  await assertSucceeds(updateDoc(doc(op, 'lc_folios', 'F2'), { estatus: 'PARADO', motivo: 'Falta material' }));
});
test('Operación no asigna transporte ni manda a ruta', async () => {
  const op = como('operacion');
  await assertFails(updateDoc(doc(op, 'lc_folios', 'F1'), { transportista: 'Fletes X' }));
  await assertFails(updateDoc(doc(op, 'lc_folios', 'F1'), { estatus: 'EN_RUTA' }));
  await assertSucceeds(updateDoc(doc(como('transporte'), 'lc_folios', 'F1'), { transportista: 'Fletes X', estatus: 'EN_RUTA' }));
  await assertFails(updateDoc(doc(op, 'lc_folios', 'F1'), { estatus: 'ARMADO' }));
});
test('Catálogos y configuración: solo Transporte y Administrador', async () => {
  await assertFails(setDoc(doc(como('ventas'), 'lc_unidades', 'U1'), { nombre: 'x' }));
  await assertFails(getDocs(collection(como('operacion'), 'lc_unidades')));
  await assertSucceeds(setDoc(doc(como('transporte'), 'lc_unidades', 'U1'), { nombre: 'x', capacidad_kg: 20000 }));
  await assertFails(getDoc(doc(como('ventas'), 'lc_config', 'gps')));
  await assertSucceeds(setDoc(doc(como('transporte'), 'lc_config', 'gps'), { puente: '' }));
});
test('Usuarios por correo: solo el Administrador asigna áreas', async () => {
  await assertFails(updateDoc(doc(como('ventas'), 'lc_usuarios', CORREO.ventas), { area: 'admin' }));
  await assertFails(setDoc(doc(como('ventas'), 'lc_usuarios', 'otro@cesantoni.com.mx'), { area: 'admin', activo: true }));
  await assertSucceeds(getDoc(doc(como('ventas'), 'lc_usuarios', CORREO.ventas)));
  await assertFails(getDoc(doc(como('ventas'), 'lc_usuarios', CORREO.operacion)));
  await assertSucceeds(setDoc(doc(como('admin'), 'lc_usuarios', 'nuevo@cesantoni.com.mx'), { area: 'ventas', activo: true, nombre: 'N' }));
  await assertFails(setDoc(doc(como('admin'), 'lc_usuarios', 'Mayus@cesantoni.com.mx'), { area: 'ventas', activo: true }));
  await assertFails(setDoc(doc(como('admin'), 'lc_usuarios', 'x@cesantoni.com.mx'), { area: 'jefe', activo: true }));
  // Dado de baja o sin alta: sin acceso aunque tenga sesión
  await assertFails(getDocs(collection(como('baja@cesantoni.com.mx'), 'lc_folios')));
  await assertFails(getDocs(collection(como('desconocido@gmail.com'), 'lc_folios')));
  // Correo sin verificar: sin acceso
  await assertFails(getDocs(collection(como('ventas', 0, { email_verified: false }), 'lc_folios')));
  // El administrador principal entra aunque no tenga documento, sin importar mayúsculas
  await assertSucceeds(getDoc(doc(como('admin', 0, { email: 'JRoman@cesantoni.com.mx' }), 'lc_despachos', 'F1')));
});
test('Alertas e historial: con el área de quien escribe', async () => {
  await assertSucceeds(setDoc(doc(como('operacion'), 'lc_alertas', 'A1'), { tipo: 'parado', texto: 't', area: 'operacion', por: CORREO.operacion, leida: false, fecha: 'x' }));
  await assertFails(setDoc(doc(como('operacion'), 'lc_alertas', 'A2'), { tipo: 'parado', texto: 't', area: 'admin', por: CORREO.operacion, leida: false, fecha: 'x' }));
  await assertFails(setDoc(doc(como('operacion'), 'lc_alertas', 'A3'), { tipo: 'parado', texto: 't', area: 'operacion', por: CORREO.ventas, leida: false, fecha: 'x' }));
  await assertSucceeds(getDocs(collection(como('ventas'), 'lc_alertas')));
  await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'lc_alertas')));
  await assertSucceeds(updateDoc(doc(como('ventas'), 'lc_alertas', 'A1'), { leida: true }));
  await assertFails(updateDoc(doc(como('ventas'), 'lc_alertas', 'A1'), { texto: 'cambiado' }));
  await assertSucceeds(setDoc(doc(como('ventas'), 'lc_folios', 'F2', 'historial', 'h1'), { area: 'ventas', por: CORREO.ventas, texto: 'x', fecha: 'x' }));
});
test('La sesión vence a las 12 horas', async () => {
  await assertSucceeds(getDoc(doc(como('transporte', 11.9), 'lc_despachos', 'F1')));
  await assertFails(getDoc(doc(como('transporte', 12.1), 'lc_despachos', 'F1')));
  await assertFails(updateDoc(doc(como('operacion', 13), 'lc_folios', 'F2'), { estatus: 'ARMADO', motivo: '' }));
});
