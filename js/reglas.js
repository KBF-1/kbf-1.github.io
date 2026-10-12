/* Reglas de negocio que no dependen de la pantalla ni de Firebase (se prueban por separado en tests/reglas.test.mjs). */

export const ESTATUS = {
  RECIBIDO: { nombre: 'Recibido', color: 'azul' },
  EN_PREPARACION: { nombre: 'En preparación', color: 'azul' },
  ARMADO: { nombre: 'Armado', color: 'amarillo' },
  LISTO: { nombre: 'Listo para transporte', color: 'verde' },
  PARADO: { nombre: 'Parado', color: 'rojo' },
  INCOMPLETO: { nombre: 'Incompleto', color: 'rojo' },
  EN_RUTA: { nombre: 'En ruta', color: 'verde' },
  ENTREGADO: { nombre: 'Entregado', color: 'gris' }
};
/* Lo que puede elegir Operación; Transporte y Administrador además pasan a EN_RUTA y ENTREGADO. */
export const ESTATUS_OPERACION = ['RECIBIDO', 'EN_PREPARACION', 'ARMADO', 'LISTO', 'PARADO', 'INCOMPLETO'];
export const DOCUMENTOS = [['factura', 'Factura'], ['carta_porte', 'Carta Porte'], ['remision', 'Remisión']];
export const CHECKLIST = [
  ['llantas', 'Llantas'], ['luces', 'Luces'], ['frenos', 'Frenos'], ['espejos', 'Espejos'],
  ['cinturones', 'Cinturones'], ['extintor', 'Extintor'], ['documentos', 'Documentos del vehículo'], ['combustible', 'Combustible']
];
export const LIMITE_SENCILLO_KG = 40000;

export const docsCompletos = (docs) => DOCUMENTOS.every(([k]) => docs && docs[k] === true);
export const docsAvance = (docs) => DOCUMENTOS.filter(([k]) => docs && docs[k] === true).length;
/* SENCILLO hasta 40 toneladas (incluidas); FULL arriba de 40. */
export const tipoUnidad = (pesoKg) => (Number(pesoKg) > LIMITE_SENCILLO_KG ? 'FULL' : 'SENCILLO');

/* Folios: los combinados se separan con «/» (nunca con «Y») y no llevan letra pegada al número.
   Un folio solo conserva su letra (12345A). */
export function partesFolio(texto) {
  return String(texto || '').toUpperCase()
    .split(/\s*(?:\/|,|;|\+|&|\bY\b)\s*/)
    .map((s) => s.trim().replace(/\s+/g, ''))
    .filter(Boolean);
}
export function combinarFolios(lista) {
  const partes = [];
  [].concat(lista).forEach((x) => partesFolio(x).forEach((p) => partes.push(p)));
  const unicos = [...new Set(partes)];
  if (unicos.length <= 1) return unicos[0] || '';
  const sinLetra = unicos.map((p) => p.replace(/^([A-Z]*\d+)[A-Z]+$/, '$1'));
  return [...new Set(sinLetra)].join('/');
}
/* Id del documento en Firestore a partir del folio (la «/» no se permite en ids). */
export const idFolio = (folio) => String(folio).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');

/* Tarimas: completas y resto (fracción de tarima que no se llena). */
export function tarimas(total) {
  const t = Math.max(0, Number(total) || 0), completas = Math.floor(t + 1e-9);
  return { total: redondeo(t, 2), completas, resto: redondeo(t - completas, 2) };
}
export const redondeo = (n, d) => Math.round((Number(n) || 0) * 10 ** d) / 10 ** d;

/* La unidad aguanta el peso del folio? */
export function excedeCapacidad(pesoKg, capacidadKg) {
  return Number(capacidadKg) > 0 && Number(pesoKg) > Number(capacidadKg);
}

/* Revisión pre-salida: { llantas: 'ok' | 'mal' } → contestado completo y si pasa. */
export function revisarChecklist(resp) {
  const r = resp || {};
  const contestado = CHECKLIST.every(([k]) => r[k] === 'ok' || r[k] === 'mal');
  const reprobados = CHECKLIST.filter(([k]) => r[k] === 'mal').map(([, n]) => n);
  return { contestado, pasa: contestado && reprobados.length === 0, reprobados };
}

const norm = (s) => String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
export { norm };
