/* Configuración del sitio. Estos valores NO son secretos: Firebase está diseñado para usarse desde el navegador;
   la seguridad la dan las reglas de Firestore (bloque «lc_» de firestore.rules en el repositorio de proveedores).
   Mismo proyecto de Firebase que Proveedores y Movimientos, pero con colecciones propias (prefijo lc_). */
window.LC_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyAb2NEHLxzpW_MmuUavbYnALxjueL1aI84',
    authDomain: 'proveedores-cesantoni.firebaseapp.com',
    projectId: 'proveedores-cesantoni',
    storageBucket: 'proveedores-cesantoni.firebasestorage.app',
    messagingSenderId: '168248619956',
    appId: '1:168248619956:web:f3e1078e744512bdd538e1'
  },
  /* Una cuenta de Firebase por área. Nadie escribe estos correos: en la pantalla de acceso solo se elige el área y su contraseña. */
  areas: {
    ventas:     { nombre: 'Ventas',     correo: 'ventas@logistica-cesantoni.local' },
    operacion:  { nombre: 'Operación',  correo: 'operacion@logistica-cesantoni.local' },
    transporte: { nombre: 'Transporte', correo: 'transporte@logistica-cesantoni.local' },
    admin:      { nombre: 'Administrador', correo: 'admin@logistica-cesantoni.local' }
  },
  sesionHoras: 12,
  /* Punto de salida por omisión (se cambia en Configuración). */
  origen: { nombre: 'CEDIS Planta', lat: 20.6597, lng: -103.3496 }
};
