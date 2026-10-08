// api/cron-respaldo.js — El respaldo de cada noche.
//
// Lo dispara el reloj de Vercel entrando por cron.js (ver vercel.json). Arma el respaldo de la
// base, lo guarda en Dropbox, copia los archivos que falten y los lunes lo
// manda además por correo.

import { correrRespaldo } from "./_respaldoTarea.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  // La llave y la conexión las revisa cron.js, que es por donde se entra.

  try {
    res.status(200).json(await correrRespaldo());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
