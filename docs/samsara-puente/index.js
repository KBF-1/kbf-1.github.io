/* Puente de Samsara para el Monitoreo (Cloud Function de Firebase, 2.ª generación).
   El token de Samsara vive aquí como secreto, nunca en la página pública.
   Solo responde a sesiones de Transporte o Administrador (revisa el token de Firebase y lc_areas).

   Instalar (necesita el plan Blaze de Firebase):
     firebase functions:secrets:set SAMSARA_TOKEN
     firebase deploy --only functions:samsara
   Luego pega la URL de la función en Configuración › GPS de Samsara.

   Respuesta: { lat, lng, velocidad_kmh, hora, lugar } */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const SAMSARA_TOKEN = defineSecret('SAMSARA_TOKEN');
const ORIGEN = 'https://logistica-cesantoni.github.io';

exports.samsara = onRequest({ secrets: [SAMSARA_TOKEN], cors: [ORIGEN], region: 'us-central1' }, async (req, res) => {
  try {
    const idToken = String(req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!idToken) return res.status(401).json({ error: 'Sin sesión' });
    const yo = await admin.auth().verifyIdToken(idToken);
    if (Date.now() / 1000 - yo.auth_time > 12 * 3600) return res.status(401).json({ error: 'Sesión vencida' });
    const area = (await admin.firestore().doc('lc_areas/' + yo.uid).get()).get('area');
    if (!['transporte', 'admin'].includes(area)) return res.status(403).json({ error: 'Sin permiso' });

    const vehiculo = String(req.query.vehiculo || '');
    if (!/^[\w-]{1,40}$/.test(vehiculo)) return res.status(400).json({ error: 'Vehículo no válido' });
    const r = await fetch('https://api.samsara.com/fleet/vehicles/locations?vehicleIds=' + encodeURIComponent(vehiculo), {
      headers: { Authorization: 'Bearer ' + SAMSARA_TOKEN.value(), Accept: 'application/json' }
    });
    if (!r.ok) return res.status(502).json({ error: 'Samsara respondió ' + r.status });
    const d = (await r.json()).data || [];
    const loc = d[0] && d[0].location;
    if (!loc) return res.status(404).json({ error: 'Sin ubicación' });
    res.json({
      lat: loc.latitude, lng: loc.longitude,
      velocidad_kmh: Math.round((Number(loc.speed) || 0) * 1.609344), // Samsara da la velocidad en millas por hora
      hora: loc.time, lugar: (loc.reverseGeo && loc.reverseGeo.formattedLocation) || ''
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
