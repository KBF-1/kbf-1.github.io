# Control de Embarques · Somos Logística CESANTONI

| Liga | Para quién |
|---|---|
| https://logistica-cesantoni.github.io/ | Ventas, Operación, Transporte y Administrador (cada área con su contraseña) |
| https://logistica-cesantoni.github.io/pantalla.html | Pantalla del almacén: tablero público, sin contraseña y sin datos comerciales |

Controla el embarque desde que Ventas sube el pedido hasta que Transporte lo entrega. Es un sitio estático (HTML y JavaScript, sin
frameworks) publicado en GitHub Pages. Usa el proyecto de Firebase `proveedores-cesantoni` con **colecciones propias (`lc_`)**, separadas
de Proveedores (`pv_`) y de Movimientos (`sm_`). Nada se mezcla con esos sistemas.

## Puesta en marcha (una sola vez)

1. **Reglas:** Firebase › Firestore Database › Reglas › pega **todo** `firestore.rules` del repositorio `proveedores-cesantoni.github.io`
   (ya incluye el bloque «Logística CESANTONI», colecciones `lc_`) › Publicar.
2. **Dominio:** Firebase › Authentication › Settings › Authorized domains › agrega `logistica-cesantoni.github.io`.
3. Abre https://logistica-cesantoni.github.io/ en cuanto se publique. Como es la primera vez, sale **Configuración inicial**: escribe las
   cuatro contraseñas (Administrador, Ventas, Operación y Transporte). Hazlo tú mismo enseguida: la configuración inicial solo se puede
   hacer una vez, y quien la haga primero define las contraseñas.
4. En **Configuración** ajusta el origen (CEDIS) con sus coordenadas, y en **Catálogos** da de alta las unidades de cada transportista.

## Accesos por área

| Área | Ve |
|---|---|
| Ventas | Ventas + Alertas |
| Operación | Operación + Alertas |
| Transporte | Todo, igual que Administrador (salvo cambiar contraseñas) |
| Administrador | Todo, incluidas las contraseñas de las áreas |

Cada área es una cuenta de Firebase (`ventas@logistica-cesantoni.local`, etc.; nadie escribe el correo, solo elige el área). El área de cada
cuenta vive en `lc_areas/{uid}`. **Las reglas de Firestore revisan el área en cada lectura y escritura**: ocultar botones no es lo que
protege. La tarifa negociada, el operador, las placas y el checklist están en `lc_despachos`, que solo leen Transporte y Administrador; la
Pantalla solo lee `lc_folios`, donde no hay nada de eso. La sesión vence a las 12 horas de escribir la contraseña (lo revisan las reglas,
no solo la página).

## Nacional y Última Milla

| | Nacional | Última Milla |
|---|---|---|
| Archivo | Formato de Acopio (macro) | Cuadro de Envío |
| Va a | Bodegas, sucursales y obras | Domicilio del cliente |
| Se guarda | Destinos de envío y **material partida por partida** (producto, SKU, lote, OC, cantidad, tarimas, restos, kg, m²) | Dirección, quién recibe, teléfonos, liga de Google Maps, descarga, observaciones, peso y metros |
| Ubicación | Catálogos › Destinos Nacionales (liga de Maps o lat, lng) | Del Cuadro de Envío; si la liga es corta, se abre y se pega la liga larga |
| Ruta | — | Última Milla (orden de entregas) |

Cada partida del acopio se revisa contra **Pesos, Embalajes y Estibas (AN-GCT-13 Rev. 16)** y el embalaje de adhesivos
(`js/embalajes-datos.js`): formato, cajas por tarima, tarima, altura, estiba y rango de kilos esperado; marca las partidas fuera de rango.
Para una revisión nueva del documento se reemplazan las listas de ese archivo.

La Pantalla lee `lc_pantalla`, una copia pública de cada folio sin material, direcciones, teléfonos, tarifas ni nombres de clientes
de Última Milla. `lc_folios` ya solo lo leen las áreas con sesión.

## Flujo de un folio

1. **Ventas** sube uno o varios Formatos de Acopio (macro de CESANTONI). Cada archivo es un folio (celda «Folio:» de Base) con su clasificación y sus destinos de envío (sucursal, ciudad, tarimas, restos en cajas, kilos); CB360 y Exhibición suman su peso. Folios que van en la misma unidad se juntan con «Juntar marcados». Otros formatos: las columnas se reconocen por su
   título (Pedido/Folio, Cliente, Destino/Ciudad, Tarimas, o Cajas y Cajas por tarima, Peso en kg o toneladas). Se separa por cliente y
   destino, se calculan tarimas, resto de tarima y peso, y se muestra todo para revisarlo antes de crear los folios como **Recibido**.
   Reglas fijas: folios combinados con «/» (nunca «Y») y sin letra pegada; SENCILLO hasta 40 t, FULL arriba de 40 t.
2. **Operación** cambia el estatus (Recibido → En preparación → Armado → Listo para transporte, o Parado/Incompleto; Parado exige
   motivo) y marca Factura, Carta Porte y Remisión. Sin los tres documentos, el servidor no deja pasar a Listo para transporte.
3. **Transporte** asigna unidad del catálogo (avisa si el peso excede la capacidad), operador, placas, cita, andén y tarifa; contesta el
   checklist pre-salida de 8 puntos y manda a ruta. Salir sin checklist o con checklist reprobado genera alerta.
4. **Monitoreo:** ubicación de las unidades en ruta, marcada **GPS REAL** o **SIMULADO**. Si Samsara falla por cualquier motivo, se
   simula el avance en línea recta del origen al destino; la pantalla nunca queda vacía.
5. **Última Milla:** orden de paradas para varios folios en un viaje (vecino más cercano + 2-opt, distancia en línea recta). Las
   coordenadas de cada destino se capturan una vez y se reutilizan. Es una aproximación; no usa Samsara ni se manda a otro sistema.
6. **Alertas:** checklist reprobado, salida sin checklist, sobrepeso y folio parado. El correo está **simulado**: se registra, no se envía.

## GPS de Samsara

El token de Samsara no puede ir en esta página (es pública). `docs/samsara-puente/` trae una Cloud Function que guarda el token como
secreto, revisa que quien pregunta sea Transporte o Administrador y responde la ubicación. Necesita el plan Blaze de Firebase. Ya
publicada, se pega su URL en Configuración › GPS de Samsara y se pone el id de vehículo de Samsara en cada unidad del catálogo.
Mientras tanto, todo el Monitoreo funciona con datos simulados.

## Colecciones

`lc_folios` (+ `historial`), `lc_pantalla`, `lc_despachos`, `lc_unidades`, `lc_destinos`, `lc_rutas`, `lc_alertas`, `lc_areas`, `lc_config`
(`inicio`, `general` = origen, `gps` = puente).

## Pruebas

- `node --test tests/reglas.test.mjs`: reglas de negocio, lectura del Formato de Acopio (`python3 tests/acopio_ejemplo.py tests/acopio.xlsx`),
  ruta y GPS simulado.
- `tests/reglas-firestore.test.mjs`: reglas de Firestore en el emulador (permisos por área, tarifa, documentos, 12 horas).
- `tests/e2e.mjs`: recorrido completo en navegador (Playwright) contra el emulador.

## Pendiente

- Envío real de correos de alertas (hoy simulado).
- Puente de Samsara publicado (hoy el Monitoreo es simulado).
- Usuarios individuales, si algún día hace falta saber quién hizo qué dentro de un área (hoy el historial registra el área).
