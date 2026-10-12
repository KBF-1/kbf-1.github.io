/* Formato de Acopio (.xlsx / .xlsm): lee las hojas Base, CB360 y Exhibición sin librerías, separa por cliente y destino,
   y calcula tarimas, resto de tarima y peso. Los títulos de columna se buscan por nombre (no por posición), así que el
   formato puede mover columnas. Todo lo calculado se muestra antes de crear los folios para corregirlo a mano. */
import { combinarFolios, tarimas, tipoUnidad, redondeo, norm } from './reglas.js';

export const HOJAS = [['BASE', 'Base'], ['CB360', 'CB360'], ['EXHIBICION', 'Exhibición']];

/* ---------------------------------------------------------------- lectura del archivo */
const dec = new TextDecoder();
const desc = (v) => String(v).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');

async function inflar(datos) {
  const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}
async function leerZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fin = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error('El archivo no es un Excel (.xlsx o .xlsm) válido. Si es .xls antiguo, guárdalo como .xlsx.');
  const total = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const out = {};
  for (let n = 0; n < total; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('El archivo de Excel está dañado.');
    const metodo = v.getUint16(p + 10, true), tam = v.getUint32(p + 20, true);
    const largo = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), coment = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const nombre = dec.decode(bytes.subarray(p + 46, p + 46 + largo));
    p += 46 + largo + extra + coment;
    if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(nombre)) continue;
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const datos = bytes.subarray(inicio, inicio + tam);
    if (metodo === 0) out[nombre] = datos.slice();
    else if (metodo === 8) out[nombre] = await inflar(datos);
    else throw new Error('El Excel usa una compresión no soportada.');
  }
  return out;
}
function textosCompartidos(xml) {
  return (xml.match(/<si>[\s\S]*?<\/si>/g) || []).map((si) =>
    desc((si.replace(/<rPh[\s\S]*?<\/rPh>/g, '').match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
}
const colNum = (letras) => [...letras].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
/* Hoja → matriz de filas (arreglo de valores; números como número). */
function filasDe(xml, compartidos) {
  const filas = [];
  (xml.match(/<c r="[A-Z]+\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).forEach((c) => {
    const [, letras, num] = c.match(/r="([A-Z]+)(\d+)"/), t = (c.match(/ t="(\w+)"/) || [])[1];
    const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1], inline = (c.match(/<is>[\s\S]*?<\/is>/) || [])[0];
    let val = t === 's' ? compartidos[Number(v)] : inline ? desc(inline.replace(/<[^>]+>/g, '')) : v === undefined ? '' : desc(v);
    if ((t === undefined || t === 'n') && val !== '' && !isNaN(Number(val))) val = Number(val);
    const f = Number(num) - 1;
    (filas[f] = filas[f] || [])[colNum(letras)] = val;
  });
  return filas.map((f) => f || []);
}
export async function leerLibro(bytes) {
  const a = await leerZip(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  if (!a['xl/workbook.xml']) throw new Error('El archivo no es un libro de Excel.');
  const libro = dec.decode(a['xl/workbook.xml']), rels = dec.decode(a['xl/_rels/workbook.xml.rels'] || new Uint8Array());
  const compartidos = a['xl/sharedStrings.xml'] ? textosCompartidos(dec.decode(a['xl/sharedStrings.xml'])) : [];
  const hojas = {};
  [...libro.matchAll(/<sheet\b[^>]*>/g)].forEach(([tag]) => {
    const nombre = desc((tag.match(/name="([^"]*)"/) || [])[1] || ''), rid = (tag.match(/r:id="([^"]+)"/) || [])[1];
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes('Id="' + rid + '"'));
    if (!rel) return;
    let destino = rel.match(/Target="([^"]+)"/)[1].replace(/^\/?xl\//, '').replace(/^\//, '');
    const ruta = 'xl/' + destino;
    if (a[ruta]) hojas[nombre] = filasDe(dec.decode(a[ruta]), compartidos);
  });
  return hojas;
}

/* ---------------------------------------------------------------- interpretación */
/* Cada columna se reconoce por su título. El orden importa: se prueba primero lo más específico. */
const COLUMNAS = [
  ['cajas_x_tarima', /^(CAJAS?|CJ|CJS)\s*(X|POR|\/)\s*(TARIMA|PALLET)/],
  ['m2_x_tarima', /^(M2|MTS2|METROS?( CUADRADOS)?)\s*(X|POR|\/)\s*(TARIMA|PALLET)/],
  ['peso_x_caja', /^(PESO|KG|KILOS)\s*(X|POR|\/)\s*(CAJA|CJ)/],
  ['folio', /^(FOLIO|PEDIDO|NO\.? ?PEDIDO|NUM\.? ?PEDIDO|ORDEN( DE VENTA)?|OV|REMISION|DOCUMENTO)\b/],
  ['cliente', /^(CLIENTE|NOMBRE( DEL)? CLIENTE|RAZON SOCIAL|DISTRIBUIDOR)\b/],
  ['destino', /^(DESTINO|CIUDAD( DESTINO)?|PLAZA|LUGAR DE ENTREGA|DIRECCION( DE ENTREGA)?|SUCURSAL|CONSIGNATARIO)\b/],
  ['tarimas', /^(TARIMAS?|PALLETS?|NO\.? ?TARIMAS|TOTAL TARIMAS)\b/],
  ['peso_ton', /^(PESO|PESO TOTAL|PESO BRUTO)?\s*\(?(TON|TONS|TONELADAS)\)?$/],
  ['peso', /^(PESO|PESO TOTAL|PESO BRUTO|KG|KILOS|KILOGRAMOS)\b/],
  ['cajas', /^(CAJAS?|CJS?|TOTAL CAJAS)\b/],
  ['m2', /^(M2|MTS2|METROS CUADRADOS)\b/]
];
function reconocer(titulo) {
  const t = norm(titulo).replace(/[.:]$/, '');
  if (!t) return null;
  const hit = COLUMNAS.find(([, re]) => re.test(t));
  return hit ? hit[0] : null;
}
/* Busca la fila de títulos (la primera, en las 40 de arriba, con cliente o destino y al menos otra columna conocida). */
function encabezado(filas) {
  for (let i = 0; i < Math.min(filas.length, 40); i++) {
    const mapa = {};
    (filas[i] || []).forEach((v, c) => { const k = reconocer(v); if (k && mapa[k] === undefined) mapa[k] = c; });
    const n = Object.keys(mapa).length;
    if ((mapa.cliente !== undefined || mapa.destino !== undefined) && n >= 2) return { fila: i, mapa };
  }
  return null;
}
const num = (v) => {
  if (typeof v === 'number') return v;
  const n = Number(String(v || '').replace(/[,\s]/g, '').replace(/kg$/i, ''));
  return isNaN(n) ? 0 : n;
};
const texto = (v) => String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim();

function renglonesDe(filas, hoja) {
  const enc = encabezado(filas);
  if (!enc) return { renglones: [], aviso: 'No se encontraron los títulos (Cliente / Destino, Tarimas, Peso…) en la hoja ' + hoja + '.' };
  const m = enc.mapa, renglones = [];
  let ultimoCliente = '', ultimoDestino = '', ultimoFolio = '';
  for (let i = enc.fila + 1; i < filas.length; i++) {
    const f = filas[i] || [], g = (k) => (m[k] === undefined ? '' : f[m[k]]);
    const primera = norm(f.find((x) => texto(x)) || '');
    if (/^(TOTAL|TOTALES|SUBTOTAL|GRAN TOTAL)\b/.test(primera)) continue;
    // Celdas combinadas: el cliente o destino solo viene en la primera fila del grupo.
    const cliente = texto(g('cliente')) || ultimoCliente, destino = texto(g('destino')) || ultimoDestino;
    const folio = texto(g('folio')) || (texto(g('cliente')) ? '' : ultimoFolio);
    let peso = m.peso_ton !== undefined ? num(g('peso_ton')) * 1000 : num(g('peso'));
    if (!peso && m.peso_x_caja !== undefined) peso = num(g('cajas')) * num(g('peso_x_caja'));
    let tar = num(g('tarimas'));
    if (!tar && num(g('cajas_x_tarima')) > 0) tar = num(g('cajas')) / num(g('cajas_x_tarima'));
    if (!tar && num(g('m2_x_tarima')) > 0) tar = num(g('m2')) / num(g('m2_x_tarima'));
    if (!cliente && !destino) continue;
    if (!peso && !tar && !num(g('cajas')) && !num(g('m2'))) continue;
    ultimoCliente = cliente; ultimoDestino = destino; ultimoFolio = folio;
    renglones.push({ hoja, fila: i + 1, folio, cliente, destino, tarimas: tar, peso_kg: peso, cajas: num(g('cajas')), m2: num(g('m2')) });
  }
  return { renglones, aviso: renglones.length ? '' : 'La hoja ' + hoja + ' no tiene renglones con cantidades.' };
}

/* Libro → { grupos: [...], avisos: [...] }. Un grupo = un cliente + destino (un folio, o varios combinados con «/»). */
export function interpretar(hojas) {
  const avisos = [], renglones = [];
  const nombres = Object.keys(hojas);
  HOJAS.forEach(([clave, etiqueta]) => {
    const nombre = nombres.find((n) => norm(n).replace(/\s/g, '') === clave) || nombres.find((n) => norm(n).replace(/\s/g, '').startsWith(clave));
    if (!nombre) { avisos.push('El archivo no trae la hoja ' + etiqueta + '.'); return; }
    const r = renglonesDe(hojas[nombre], etiqueta);
    if (r.aviso) avisos.push(r.aviso);
    renglones.push(...r.renglones);
  });
  const mapa = new Map();
  renglones.forEach((r) => {
    const k = norm(r.cliente) + '|' + norm(r.destino);
    if (!mapa.has(k)) mapa.set(k, { cliente: r.cliente, destino: r.destino, folios: [], hojas: {}, tarimas: 0, peso_kg: 0, renglones: 0 });
    const gr = mapa.get(k);
    if (r.folio) gr.folios.push(r.folio);
    gr.hojas[r.hoja] = (gr.hojas[r.hoja] || 0) + 1;
    gr.tarimas += r.tarimas; gr.peso_kg += r.peso_kg; gr.renglones++;
  });
  const grupos = [...mapa.values()].map((g) => {
    const t = tarimas(g.tarimas), peso = redondeo(g.peso_kg, 0);
    return {
      folio: combinarFolios(g.folios), cliente: g.cliente, destino: g.destino, hojas: Object.keys(g.hojas),
      tarimas: t.total, tarimas_completas: t.completas, resto: t.resto, peso_kg: peso, tipo_unidad: tipoUnidad(peso), renglones: g.renglones
    };
  });
  if (!grupos.length && !avisos.length) avisos.push('No se encontró ningún pedido en el archivo.');
  return { grupos, avisos };
}
