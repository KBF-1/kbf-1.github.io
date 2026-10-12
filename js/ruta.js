/* Planeador de última milla: orden de paradas por distancia en línea recta (haversine), vecino más cercano y luego
   mejora 2-opt. Es una APROXIMACIÓN: no usa carreteras, ni Samsara, ni manda nada a otro sistema. */

export function km(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/* Largo del recorrido: origen → paradas en orden (→ origen si regresa). */
export function largo(origen, paradas, regresa) {
  let t = 0, prev = origen;
  paradas.forEach((p) => { t += km(prev, p); prev = p; });
  if (regresa && paradas.length) t += km(prev, origen);
  return t;
}
/* origen {lat,lng}; paradas [{lat,lng,...}] → { orden: [paradas], km, tramos: [km por tramo] } */
export function planear(origen, paradas, regresa) {
  const pend = paradas.slice(), orden = [];
  let actual = origen;
  while (pend.length) {
    let mejor = 0;
    pend.forEach((p, i) => { if (km(actual, p) < km(actual, pend[mejor])) mejor = i; });
    actual = pend.splice(mejor, 1)[0];
    orden.push(actual);
  }
  // 2-opt: invierte tramos mientras acorte el recorrido.
  let mejoro = true, vueltas = 0;
  while (mejoro && vueltas++ < 200) {
    mejoro = false;
    for (let i = 0; i < orden.length - 1; i++) {
      for (let j = i + 1; j < orden.length; j++) {
        const prueba = orden.slice(0, i).concat(orden.slice(i, j + 1).reverse(), orden.slice(j + 1));
        if (largo(origen, prueba, regresa) + 1e-9 < largo(origen, orden, regresa)) { orden.splice(0, orden.length, ...prueba); mejoro = true; }
      }
    }
  }
  const tramos = [];
  let prev = origen;
  orden.forEach((p) => { tramos.push(km(prev, p)); prev = p; });
  if (regresa && orden.length) tramos.push(km(prev, origen));
  return { orden, km: largo(origen, orden, regresa), tramos };
}
