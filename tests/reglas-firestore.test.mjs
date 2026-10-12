/* Reglas de Firestore (bloque lc_) contra el emulador:
   firebase emulators:exec --only firestore "node --test tests/reglas-firestore.test.mjs"  (con firestore.rules del repositorio de proveedores) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, writeBatch } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'proveedores-cesantoni', firestore: { rules: readFileSync(process.env.REGLAS || 'firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
const ahora = Math.floor(Date.now() / 1000);
const como = (area, horas = 0) => env.authenticatedContext('u-' + area, { auth_time: ahora - horas * 3600 }).firestore();
const folio = (extra) => Object.assign({ folio: '100', cliente: 'Cliente', destino: 'León', hojas: ['Base'], tarimas: 2, resto: 0, peso_kg: 1000, tipo_unidad: 'SENCILLO',
  estatus: 'RECIBIDO', motivo: '', docs: { factura: false, carta_porte: false, remision: false }, transportista: '', unidad: '', cita: '', anden: '', salida: '', entregado: '',
  creado: 'x', actualizado: 'x', creado_por: 'ventas' }, extra);

test.before(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const a of ['ventas', 'operacion', 'transporte', 'admin']) await setDoc(doc(db, 'lc_areas', 'u-' + a), { area: a });
    await setDoc(doc(db, 'lc_config', 'inicio'), { fecha: 'x' });
    await setDoc(doc(db, 'lc_folios', 'F1'), folio());
    await setDoc(doc(db, 'lc_despachos', 'F1'), { tarifa: 18500, operador: 'Juan', placas: 'ABC123' });
  });
});
test.after(() => env.cleanup());

test('Pantalla: sin sesión lee folios, no despachos (tarifa)', async () => {
  const anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDocs(collection(anon, 'lc_folios')));
  await assertFails(getDoc(doc(anon, 'lc_despachos', 'F1')));
  await assertFails(setDoc(doc(anon, 'lc_folios', 'X'), folio({ folio: 'X' })));
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
  await assertFails(setDoc(doc(como('admin'), 'lc_config', 'inicio'), { fecha: 'y' }));
});
test('Áreas: nadie se cambia de área; solo el Administrador', async () => {
  await assertFails(updateDoc(doc(como('ventas'), 'lc_areas', 'u-ventas'), { area: 'admin' }));
  await assertFails(setDoc(doc(como('ventas'), 'lc_areas', 'u-nuevo'), { area: 'admin' }));
  await assertFails(setDoc(doc(env.authenticatedContext('intruso', { auth_time: ahora }).firestore(), 'lc_areas', 'intruso'), { area: 'admin' }));
  await assertSucceeds(getDoc(doc(como('ventas'), 'lc_areas', 'u-ventas')));
  await assertFails(getDoc(doc(como('ventas'), 'lc_areas', 'u-admin')));
});
test('Alertas e historial: con el área de quien escribe', async () => {
  await assertSucceeds(setDoc(doc(como('operacion'), 'lc_alertas', 'A1'), { tipo: 'parado', texto: 't', area: 'operacion', leida: false, fecha: 'x' }));
  await assertFails(setDoc(doc(como('operacion'), 'lc_alertas', 'A2'), { tipo: 'parado', texto: 't', area: 'admin', leida: false, fecha: 'x' }));
  await assertSucceeds(getDocs(collection(como('ventas'), 'lc_alertas')));
  await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'lc_alertas')));
  await assertSucceeds(updateDoc(doc(como('ventas'), 'lc_alertas', 'A1'), { leida: true }));
  await assertFails(updateDoc(doc(como('ventas'), 'lc_alertas', 'A1'), { texto: 'cambiado' }));
  await assertSucceeds(setDoc(doc(como('ventas'), 'lc_folios', 'F2', 'historial', 'h1'), { area: 'ventas', texto: 'x', fecha: 'x' }));
});
test('La sesión vence a las 12 horas', async () => {
  await assertSucceeds(getDoc(doc(como('transporte', 11.9), 'lc_despachos', 'F1')));
  await assertFails(getDoc(doc(como('transporte', 12.1), 'lc_despachos', 'F1')));
  await assertFails(updateDoc(doc(como('operacion', 13), 'lc_folios', 'F2'), { estatus: 'ARMADO', motivo: '' }));
});
test('Configuración inicial: una sola vez', async () => {
  // Ya existe lc_config/inicio: un recién llegado no puede darse de alta como administrador.
  const db = env.authenticatedContext('nuevo', { auth_time: ahora }).firestore();
  const b = writeBatch(db);
  b.set(doc(db, 'lc_areas', 'nuevo'), { area: 'admin' });
  await assertFails(b.commit());
});
