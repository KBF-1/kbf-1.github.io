/* Recorrido completo en navegador contra el emulador de Firebase.
   1) firebase emulators:start --only auth,firestore   2) http-server -p 5500 .   3) node tests/e2e.mjs  */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:5500/', EMU = '?emu=1', P = 'proveedores-cesantoni';
const ACOPIO = process.env.ACOPIO || fileURLToPath(new URL('./acopio.xlsx', import.meta.url));
const ACOPIO_CES = process.env.ACOPIO_CES || fileURLToPath(new URL('./acopio-cesantoni.xlsm', import.meta.url));
const ACOPIO_CES2 = process.env.ACOPIO_CES2 || fileURLToPath(new URL('./acopio-cesantoni-2.xlsm', import.meta.url));
const SALIDA = process.env.CAPTURAS || '';
let ok = 0, mal = 0;
const check = (cond, nombre) => { if (cond) { ok++; console.log('  ✓ ' + nombre); } else { mal++; console.log('  ✗ ' + nombre); } };

await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${P}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${P}/accounts`, { method: 'DELETE' });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errores = [];
page.on('pageerror', (e) => errores.push(e.message));
page.on('dialog', (d) => d.accept());
const foto = async (n) => { if (SALIDA) await page.screenshot({ path: SALIDA + '/' + n + '.png', fullPage: true }); };
const toast = async () => (await page.locator('.toast').allTextContents()).join(' | ');
const esperarToast = async (texto) => { await page.locator('.toast', { hasText: texto }).first().waitFor({ timeout: 10000 }); };
async function entrar(area, clave) {
  await page.goto(BASE + EMU);
  await page.getByRole('button', { name: area, exact: true }).click();
  await page.locator('#clave').fill(clave);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.locator('#nav a').first().waitFor();
}
async function salir() { await page.getByRole('button', { name: 'Cerrar sesión' }).click(); await page.getByRole('button', { name: 'Entrar' }).waitFor(); }
async function ir(hash, titulo) { await page.goto(BASE + EMU + '#' + hash); await page.locator('main h1', { hasText: titulo }).waitFor(); await page.locator('main .tabla, main .unidades, main .alertas, main .tarjeta p.gris').first().waitFor(); }
const menu = async () => (await page.locator('#nav a b').allTextContents()).map((t) => t.replace(/\d+$/, '').trim());

console.log('Configuración inicial');
await page.goto(BASE + EMU);
await page.getByRole('heading', { name: 'Configuración inicial' }).waitFor();
const claves = { Administrador: 'admin-123', Ventas: 'ventas-123', 'Operación': 'opera-123', Transporte: 'trans-123' };
for (const [n, c] of Object.entries(claves)) await page.getByLabel('Contraseña de ' + n).fill(c);
await page.getByRole('button', { name: 'Crear las cuatro áreas' }).click();
await page.locator('#nav a').first().waitFor({ timeout: 20000 });
check((await page.locator('.chip-area').textContent()) === 'Administrador', 'quedó con sesión de Administrador');
check((await menu()).includes('Configuración'), 'Administrador ve Configuración');

console.log('Transporte: catálogo de unidades');
await ir('catalogos', 'Catálogos');
await page.getByRole('button', { name: '+ Nueva unidad' }).click();
await page.getByLabel('Transportista').fill('Fletes del Bajío');
await page.getByLabel('Unidad', { exact: true }).fill('ECO-14');
await page.getByLabel('Capacidad (kg)').fill('30000');
await page.getByLabel('Placas').fill('jal1234');
await page.getByRole('button', { name: 'Guardar' }).click();
await page.locator('td', { hasText: 'ECO-14' }).waitFor();
check(await page.locator('td', { hasText: 'JAL1234' }).count() === 1, 'unidad guardada con placas en mayúsculas');
await salir();

console.log('Ventas');
await entrar('Ventas', 'ventas-123');
check(JSON.stringify(await menu()) === JSON.stringify(['Ventas', 'Alertas', 'Pantalla ↗']), 'Ventas solo ve Ventas + Alertas (+ liga a Pantalla)');
await page.goto(BASE + EMU + '#transporte');
await page.waitForTimeout(800);
check(new URL(page.url()).hash === '#ventas', 'Ventas no puede abrir Transporte escribiendo la liga');
await page.locator('#acopio').setInputFiles(ACOPIO);
await page.getByRole('button', { name: /Crear 4 folio/ }).waitFor();
const filas = await page.locator('.tabla.compacta tbody tr').count();
check(filas === 4, 'el acopio se separó en 4 clientes/destinos');
const valores = await page.locator('.tabla.compacta tbody input[aria-label="folio"]').evaluateAll((els) => els.map((e) => e.value));
check(valores.includes('12345/12346') && valores.includes('30010/30011'), 'folios combinados con «/» y sin letra');
check(await page.locator('.tabla.compacta .tipo.full').count() === 1, 'Interceramic (43.5 t) marcado FULL');
await foto('01-ventas-revision');
await page.getByRole('button', { name: /Crear 4 folio/ }).click();
await esperarToast('4 folio(s) creados');
await page.locator('.tabla tbody tr', { hasText: '22001' }).first().waitFor();
check(await page.locator('.tabla tbody tr', { hasText: '22001' }).count() === 1, 'folios creados y listados');
const prohibido = await page.evaluate(async () => {
  const fb = await import('./js/firebase-sdk.js'); const app = fb.getApps().find((a) => a.name === 'logistica');
  try { await fb.getDocs(fb.collection(fb.getFirestore(app), 'lc_despachos')); return 'leyó'; } catch (e) { return e.code; }
});
check(prohibido === 'permission-denied', 'Ventas pidiendo despachos (tarifas) directo al servidor: denegado');
// Subir el mismo archivo otra vez no duplica
await page.locator('#acopio').setInputFiles(ACOPIO);
await page.getByRole('button', { name: /Crear 4 folio/ }).click();
await esperarToast('Ya existían');
check(true, 'volver a subir el acopio no duplica folios');
// Formato de Acopio CESANTONI: dos archivos a la vez y juntarlos en un embarque
await page.locator('#acopio').setInputFiles([ACOPIO_CES, ACOPIO_CES2]);
await page.getByRole('button', { name: /Crear 2 folio/ }).waitFor();
const folios2 = await page.locator('.tabla.compacta tbody input[aria-label="folio"]').evaluateAll((els) => els.map((e) => e.value));
check(JSON.stringify(folios2) === JSON.stringify(['7777A', '8888']), 'formato CESANTONI: un folio por archivo (7777A y 8888)');
check(await page.locator('.paradas-t', { hasText: 'PRUEBA Suc. QRO' }).count() === 2, 'muestra el detalle por destino de envío');
await page.getByRole('button', { name: 'Juntar marcados en un embarque' }).click();
await page.getByRole('button', { name: /Crear 1 folio/ }).waitFor();
check((await page.locator('.tabla.compacta tbody input[aria-label="folio"]').inputValue()) === '7777/8888', 'juntados: folio 7777/8888 sin letra');
check(await page.locator('.tabla.compacta .tipo.full').count() === 1, 'embarque de 83 t marcado FULL');
await page.getByRole('button', { name: /Crear 1 folio/ }).click();
await esperarToast('1 folio(s) creados');
await page.locator('.tabla tbody tr', { hasText: '7777/8888' }).first().click();
await page.locator('.modal .paradas-t').waitFor();
check(await page.locator('.modal .paradas-t tbody tr').count() === 2, 'la ficha del folio muestra sus 2 destinos de envío');
await page.locator('.modal .btn-x').click();
await salir();

console.log('Operación');
await entrar('Operación', 'opera-123');
check(JSON.stringify(await menu()) === JSON.stringify(['Operación', 'Alertas', 'Pantalla ↗']), 'Operación solo ve Operación + Alertas');
const fila = (f) => page.locator('.tabla tbody tr', { hasText: f });
const opcionListo = fila('22001').locator('select option[value="LISTO"]');
check(await opcionListo.isDisabled(), 'sin documentos, «Listo para transporte» está deshabilitado');
const forzado = await page.evaluate(async () => {
  const fb = await import('./js/firebase-sdk.js'); const db = fb.getFirestore(fb.getApps().find((a) => a.name === 'logistica'));
  try { await fb.updateDoc(fb.doc(db, 'lc_folios', '22001'), { estatus: 'LISTO' }); return 'pasó'; } catch (e) { return e.code; }
});
check(forzado === 'permission-denied', 'forzar LISTO sin documentos directo al servidor: rechazado');
for (const d of ['Factura', 'Carta Porte']) { await fila('22001').getByLabel(d).check(); await page.waitForTimeout(700); }
check(await fila('22001').locator('select option[value="LISTO"]').isDisabled(), 'con 2/3 documentos sigue bloqueado');
await fila('22001').getByLabel('Remisión').check(); await page.waitForTimeout(700);
await fila('22001').locator('select').selectOption('LISTO');
await esperarToast('22001: Listo para transporte');
check(true, 'con 3/3 pasa a Listo para transporte');
await fila('40001').locator('select').selectOption('PARADO');
await fila('40001').getByRole('button', { name: 'Guardar' }).click();
check((await toast()).includes('motivo'), 'PARADO sin motivo: pide motivo');
await fila('40001').getByLabel('Motivo').fill('Falta exhibidor');
await fila('40001').getByRole('button', { name: 'Guardar' }).click();
await esperarToast('40001: Parado');
check(true, 'PARADO con motivo guardado');
for (const d of ['Factura', 'Carta Porte', 'Remisión']) { await fila('12345/12346').getByLabel(d).check(); await page.waitForTimeout(600); }
await fila('12345/12346').locator('select').selectOption('LISTO');
await esperarToast('Listo para transporte');
await foto('02-operacion');
await salir();

console.log('Transporte');
await entrar('Transporte', 'trans-123');
check((await menu()).length === 9, 'Transporte ve todo (igual que Administrador)');
await ir('transporte', 'Transporte');
await page.locator('.tabla tbody tr', { hasText: '22001' }).click();
await page.getByLabel('Unidad', { exact: true }).selectOption({ label: 'Fletes del Bajío · ECO-14 · SENCILLO · 30 t' });
check(await page.locator('.modal .aviso', { hasText: 'Excede' }).isVisible(), 'aviso: el peso excede la capacidad de la unidad');
check((await page.getByLabel('Placas').inputValue()) === 'JAL1234', 'placas tomadas del catálogo');
await page.getByLabel('Operador').fill('Juan Pérez');
await page.getByLabel('Fecha y hora de cita').fill('2026-10-13T09:30');
await page.getByLabel('Andén').fill('4');
await page.getByLabel('Tarifa negociada (MXN)').fill('18500');
await foto('03-despacho');
await page.getByRole('button', { name: 'Guardar asignación' }).click();
await esperarToast('Asignación guardada');
const celdaTarifa = page.locator('.tabla tbody tr', { hasText: '22001' }).locator('td', { hasText: '$18,500.00' });
await celdaTarifa.waitFor({ timeout: 10000 }).catch(() => {});
check(await celdaTarifa.count() === 1, 'tarifa visible para Transporte');
await page.locator('.tabla tbody tr', { hasText: '22001' }).click();
await page.getByRole('button', { name: 'Salir a ruta (activar GPS)' }).click();
await esperarToast('en ruta');
check(true, 'salió a ruta sin checklist (con confirmación)');
// Folio con checklist reprobado
await page.locator('.tabla tbody tr', { hasText: '12345/12346' }).click();
await page.getByLabel('Unidad', { exact: true }).selectOption({ index: 1 });
await page.getByRole('button', { name: 'Guardar asignación' }).click();
await esperarToast('Asignación guardada');
await page.locator('.tabla tbody tr', { hasText: '12345/12346' }).click();
for (const p of ['Llantas', 'Luces', 'Frenos', 'Espejos', 'Cinturones', 'Extintor', 'Documentos del vehículo', 'Combustible']) {
  await page.getByRole('radiogroup', { name: p }).getByText(p === 'Frenos' ? 'Falla' : 'Bien').click();
}
await page.getByRole('button', { name: 'Guardar checklist' }).click();
await esperarToast('Checklist reprobado');
check(true, 'checklist reprobado registra alerta');

console.log('Monitoreo, Última Milla, Alertas');
await ir('ruta', 'Última Milla');
await page.locator('.tabla tbody tr', { hasText: '30010/30011' }).getByRole('checkbox').check();
await page.locator('.tabla tbody tr', { hasText: '12345/12346' }).getByRole('checkbox').check();
await page.getByRole('button', { name: 'Calcular ruta más corta' }).click();
check((await toast()).includes('Faltan coordenadas'), 'pide coordenadas de destinos nuevos');
await page.getByLabel('Coordenadas de León').fill('21.1250, -101.6860'); await page.getByLabel('Coordenadas de León').press('Tab');
await esperarToast('Coordenadas guardadas para León');
await page.getByLabel('Coordenadas de Monterrey').fill('25.6866, -100.3161'); await page.getByLabel('Coordenadas de Monterrey').press('Tab');
await esperarToast('Coordenadas guardadas para Monterrey');
await page.getByRole('button', { name: 'Calcular ruta más corta' }).click();
await page.locator('.paradas').waitFor();
const orden = await page.locator('.paradas li b').allTextContents();
check(JSON.stringify(orden) === JSON.stringify(['León', 'Monterrey']), 'orden de paradas: León y luego Monterrey');
check(await page.getByText('Aproximación (línea recta)').count() > 0, 'marcado como aproximación');
await page.getByRole('button', { name: 'Guardar ruta' }).click();
await esperarToast('Ruta guardada');
await foto('04-ultima-milla');
await ir('monitoreo', 'Monitoreo');
await page.locator('.unidad').first().waitFor();
check(await page.locator('.unidad .fuente.sim', { hasText: 'SIMULADO' }).count() === 1, 'monitoreo muestra la unidad en ruta como SIMULADO');
await foto('05-monitoreo');
await ir('alertas', 'Alertas');
await page.locator('.alertas li').first().waitFor();
const textos = (await page.locator('.alertas li').allTextContents()).join(' ');
check(/SIN checklist/.test(textos) && /sobrepeso/.test(textos) && /reprobado/.test(textos) && /PARADO/.test(textos), 'alertas: sin checklist, sobrepeso, checklist reprobado y parado');
await foto('06-alertas');
const pass = await page.evaluate(async () => {
  const fb = await import('./js/firebase-sdk.js'); const db = fb.getFirestore(fb.getApps().find((a) => a.name === 'logistica'));
  return (await fb.getDoc(fb.doc(db, 'lc_despachos', '22001'))).data().tarifa;
});
check(pass === 18500, 'tarifa guardada en el despacho (privado)');
await salir();

console.log('Pantalla (sin contraseña)');
const ctx2 = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const pan = await ctx2.newPage();
await pan.goto(BASE + 'pantalla.html' + EMU);
await pan.locator('#filas tr td.folio').first().waitFor();
const tab = await pan.locator('#filas').textContent();
check(tab.includes('22001') && tab.includes('EN RUTA') && tab.includes('PARADO'), 'tablero con folios y estatus');
check(!/18,?500|Juan Pérez|JAL1234/.test(await pan.content()), 'la Pantalla no muestra tarifa, operador ni placas');
check(await pan.locator('#filas tr.c-rojo').count() === 1, 'el folio parado sale en rojo');
if (SALIDA) await pan.screenshot({ path: SALIDA + '/07-pantalla.png' });

check(errores.length === 0, 'sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' / ') : ''));
await browser.close();
console.log(`\n${ok} de ${ok + mal} correctas`);
process.exit(mal ? 1 : 0);
