// api/cron-pipeline.js — El repaso de cada mañana.
//
// A cada quien lo suyo: lo atrasado, lo de hoy, lo de mañana y lo que cerró
// ayer. Al Director y a los admins, además, la foto completa del equipo y lo
// que quedó sin repartir.
//
// El armado vive en _resumenDiario.js, para que el botón de prueba de Ajustes
// mande exactamente el mismo correo que este reloj.
//
// Lo dispara Vercel de lunes a sábado, entrando por cron.js (ver vercel.json).

import { mandarResumen } from "./_resumenDiario.js";

export default async function handler(req, res) {
  // La llave y la conexión las revisa cron.js, que es por donde se entra.

  try {
    const r = await mandarResumen();
    return res.status(r.ok ? 200 : 500).json(r);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
