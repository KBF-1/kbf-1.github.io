/* node --test tests/reglas.test.mjs  (necesita tests/acopio.xlsx: python3 tests/acopio_ejemplo.py tests/acopio.xlsx) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { combinarFolios, tipoUnidad, tarimas, idFolio, docsCompletos, revisarChecklist, excedeCapacidad, coordenadasDeLiga, esLigaCorta } from '../js/reglas.js';
import { revisarPartida, EMBALAJES } from '../js/embalajes.js';
import { leerLibro, interpretar, combinar } from '../js/acopio.js';
import { planear, km } from '../js/ruta.js';
import { simulada } from '../js/gps.js';

test('folios combinados con «/» y sin letra', () => {
  assert.equal(combinarFolios(['12345A']), '12345A');
  assert.equal(combinarFolios(['12345A', '12346B']), '12345/12346');
  assert.equal(combinarFolios(['30010 Y 30011']), '30010/30011');
  assert.equal(combinarFolios(['30010 y 30011B']), '30010/30011');
  assert.equal(combinarFolios(['22001', '22001']), '22001');
  assert.equal(idFolio('12345/12346'), '12345-12346');
});
test('SENCILLO hasta 40 t, FULL arriba', () => {
  assert.equal(tipoUnidad(40000), 'SENCILLO');
  assert.equal(tipoUnidad(40001), 'FULL');
  assert.equal(tipoUnidad(0), 'SENCILLO');
});
test('tarimas y resto', () => {
  assert.deepEqual(tarimas(4.5), { total: 4.5, completas: 4, resto: 0.5 });
  assert.deepEqual(tarimas(3), { total: 3, completas: 3, resto: 0 });
});
test('documentos, checklist y capacidad', () => {
  assert.equal(docsCompletos({ factura: true, carta_porte: true, remision: false }), false);
  assert.equal(docsCompletos({ factura: true, carta_porte: true, remision: true }), true);
  const todo = Object.fromEntries(['llantas', 'luces', 'frenos', 'espejos', 'cinturones', 'extintor', 'documentos', 'combustible'].map((k) => [k, 'ok']));
  assert.deepEqual(revisarChecklist(todo), { contestado: true, pasa: true, reprobados: [] });
  assert.equal(revisarChecklist({ ...todo, frenos: 'mal' }).pasa, false);
  assert.deepEqual(revisarChecklist({ ...todo, frenos: 'mal' }).reprobados, ['Frenos']);
  assert.equal(revisarChecklist({ llantas: 'ok' }).contestado, false);
  assert.equal(excedeCapacidad(30000, 28000), true);
  assert.equal(excedeCapacidad(30000, 0), false);
});
test('Formato de Acopio: hojas Base, CB360 y Exhibición', { skip: !existsSync(new URL('./acopio.xlsx', import.meta.url)) }, async () => {
  const hojas = await leerLibro(new Uint8Array(readFileSync(new URL('./acopio.xlsx', import.meta.url))));
  const { grupos, avisos } = interpretar(hojas);
  assert.deepEqual(avisos, []);
  const por = Object.fromEntries(grupos.map((g) => [g.cliente, g]));
  assert.equal(grupos.length, 4);
  // Home Depot: dos pedidos con letra → combinados sin letra; tarimas 120/48 + 60/40 = 4.0
  assert.equal(por['Home Depot'].folio, '12345/12346');
  assert.equal(por['Home Depot'].tarimas, 4);
  assert.equal(por['Home Depot'].peso_kg, 5700);
  assert.equal(por['Home Depot'].tipo_unidad, 'SENCILLO');
  // Interceramic: Base (8 + 2 tarimas, 42 t) + CB360 (2 tarimas, 1.5 t) → FULL; la fila TOTAL no cuenta
  assert.equal(por['Interceramic Norte'].folio, '22001');
  assert.equal(por['Interceramic Norte'].tarimas, 12);
  assert.equal(por['Interceramic Norte'].peso_kg, 43500);
  assert.equal(por['Interceramic Norte'].tipo_unidad, 'FULL');
  assert.deepEqual(por['Interceramic Norte'].hojas, ['Base', 'CB360']);
  assert.equal(por['Distribuidora Bajío'].folio, '30010/30011');
  assert.equal(por['Distribuidora Bajío'].resto, 0.5);
  // Exhibición en toneladas → kg
  assert.equal(por['Showroom Polanco'].peso_kg, 800);
  assert.equal(por['Showroom Polanco'].destino, 'CDMX');
  assert.equal(por['Showroom Polanco'].resto, 0.25);
});
test('ruta más corta (línea recta)', () => {
  const o = { lat: 0, lng: 0 };
  const p = [{ n: 'C', lat: 0, lng: 3 }, { n: 'A', lat: 0, lng: 1 }, { n: 'B', lat: 0, lng: 2 }];
  const r = planear(o, p, false);
  assert.deepEqual(r.orden.map((x) => x.n), ['A', 'B', 'C']);
  assert.ok(Math.abs(r.km - km(o, p[0])) < 0.01);
  // 2-opt corrige el cruce que deja el vecino más cercano
  const q = [{ n: 1, lat: 0, lng: 1 }, { n: 2, lat: 1, lng: 1 }, { n: 3, lat: 1, lng: 0 }, { n: 4, lat: 0, lng: 2.1 }];
  const r2 = planear(o, q, true);
  assert.equal(r2.tramos.length, 5);
});
test('GPS simulado avanza y llega', () => {
  const o = { lat: 20, lng: -103 }, d = { lat: 21, lng: -103 };
  const salida = new Date('2026-10-12T08:00:00Z').toISOString();
  const a = simulada(o, d, salida, Date.parse('2026-10-12T09:00:00Z'));
  assert.equal(a.fuente, 'simulado');
  assert.ok(a.lat > 20 && a.lat < 21 && a.velocidad > 0);
  const b = simulada(o, d, salida, Date.parse('2026-10-12T20:00:00Z'));
  assert.equal(b.lat, 21); assert.equal(b.velocidad, 0);
  assert.equal(simulada(o, null, salida).lat, 20);
});
test('Formato de Acopio CESANTONI: un folio por archivo, por destino de envío', async () => {
  const leer = async (n) => interpretar(await leerLibro(new Uint8Array(readFileSync(new URL(n, import.meta.url)))));
  const { grupos, avisos } = await leer('./acopio-cesantoni.xlsm');
  assert.deepEqual(avisos, []);
  assert.equal(grupos.length, 1);
  const g = grupos[0];
  assert.equal(g.folio, '7777A');
  assert.equal(g.clasificacion, 'C');
  assert.equal(g.cliente, 'CLIENTE PRUEBA SA DE CV');
  assert.equal(g.destino, 'LEON / QUERETARO');
  assert.deepEqual(g.paradas.map((p) => [p.codigo, p.sucursal, p.tarimas, p.restos_liso, p.restos_deco, p.peso_kg]),
    [['9001', 'PRUEBA Suc. LEON', 13, 3, 2, 26000], ['9002', 'PRUEBA Suc. QRO', 8, 0, 0, 15000]]);
  // Base (41 t) + Exhibición (500 kg, 1 espacio) → 41.5 t, FULL
  assert.equal(g.peso_kg, 41500);
  assert.equal(g.tarimas, 22);
  assert.equal(g.resto, 5);
  assert.equal(g.tipo_unidad, 'FULL');
  assert.deepEqual(g.hojas, ['Base', 'Exhibición']);
  assert.equal(g.material.length, 3);
  assert.equal(g.material[2].producto !== undefined, true);
  // Dos acopios en la misma unidad
  const g2 = (await leer('./acopio-cesantoni-2.xlsm')).grupos[0];
  const c = combinar([g, g2]);
  assert.equal(c.folio, '7777/8888');
  assert.equal(c.peso_kg, 83000);
  assert.equal(c.paradas.length, 2);
  assert.equal(c.paradas[0].tarimas, 26);
});
test('Cuadro de Envío (Última Milla)', async () => {
  const leer = async (n) => interpretar(await leerLibro(new Uint8Array(readFileSync(new URL(n, import.meta.url)))));
  const r = await leer('./cuadro-envio.xlsm');
  assert.deepEqual(r.avisos, []);
  const g = r.grupos[0];
  assert.equal(g.tipo_envio, 'ULTIMA_MILLA');
  assert.equal(g.folio, '9001');
  assert.equal(g.cliente, 'CLIENTE DE PRUEBA');
  assert.equal(g.destino, 'ZACATECAS');
  assert.equal(g.peso_kg, 615.56);
  assert.equal(g.m2, 36.96);
  assert.equal(g.entrega.descarga, 'MANUAL');
  assert.equal(g.entrega.no_ext, '10');
  assert.equal(g.entrega.no_int, '');          // vacío: no toma la etiqueta de al lado
  assert.equal(g.entrega.telefono2, '');
  assert.equal(g.entrega.gran_formato, false);
  assert.equal(g.lat, null);                    // liga corta: sin coordenadas
  const g2 = (await leer('./cuadro-envio-2.xlsm')).grupos[0];
  assert.deepEqual([g2.lat, g2.lng], [22.7472, -102.5182]);
});
test('Ligas de Google Maps', () => {
  assert.deepEqual(coordenadasDeLiga('https://www.google.com/maps/place/X/@22.6489,-102.9913,15z/data=!3d22.6478!4d-102.9902'), { lat: 22.6478, lng: -102.9902 });
  assert.deepEqual(coordenadasDeLiga('https://www.google.com/maps/@19.4326,-99.1332,14z'), { lat: 19.4326, lng: -99.1332 });
  assert.deepEqual(coordenadasDeLiga('https://maps.google.com/?q=22.64,-102.99'), { lat: 22.64, lng: -102.99 });
  assert.deepEqual(coordenadasDeLiga('20.67, -103.35'), { lat: 20.67, lng: -103.35 });
  assert.equal(coordenadasDeLiga('https://maps.app.goo.gl/TtiYoWf2PJQ1jwN49'), null);
  assert.equal(esLigaCorta('https://maps.app.goo.gl/TtiYoWf2PJQ1jwN49'), true);
});
test('Pesos y embalajes: formato por descripción y rango de kilos', () => {
  const r1 = revisarPartida({ producto: 'EMILIA MATE BONE CE 30*60 PRC RECT 1.44 MT2/48 CJ-TAR 20', cantidad: 336, um: 'CJ', kg: 10516.8 });
  assert.equal(r1.embalaje.formato, '30*60 RECT PRC');
  assert.equal(r1.tarimas_calc, 7);
  assert.equal(r1.fuera_de_rango, false);
  const r2 = revisarPartida({ producto: 'EMILIA MATE BONE CE 30*30 MALL A PRC RECT 0.527 MT2/90 CJ 026', cantidad: 3, um: 'CJ', kg: 34.68 });
  assert.equal(r2.embalaje.formato, '32.5*29.5 MALLA');
  assert.equal(r2.restos_calc, 3);
  assert.equal(revisarPartida({ producto: 'HARLOW CE 20*120 RECT 1.68 MT2/ 24 CJ-TAR 08', cantidad: 2, um: 'CJ', kg: 90 }).fuera_de_rango, true);
  assert.equal(revisarPartida({ sku: 'P061301635P3', producto: 'PEGAPISO', cantidad: 250 }).tarimas_calc, 2);
  assert.equal(EMBALAJES.length, 46);
});
