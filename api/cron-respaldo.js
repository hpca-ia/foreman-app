// api/cron-respaldo.js — El respaldo de cada noche.
//
// Lo dispara el reloj de Vercel (ver vercel.json). Arma el respaldo de la
// base, lo guarda en Dropbox, copia los archivos que falten y los lunes lo
// manda además por correo.

import { correrRespaldo } from "./_respaldoTarea.js";
import { configurado } from "./_supabase.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  // Cerrado por defecto: con esto se saca una copia de toda la oficina.
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return res.status(503).json({ error: "Falta CRON_SECRET en Vercel" });
  if (req.headers.authorization !== `Bearer ${secreto}`) return res.status(401).json({ error: "No autorizado" });
  if (!configurado()) return res.status(503).json({ error: "Falta SUPABASE_SECRET_KEY" });

  try {
    res.status(200).json(await correrRespaldo());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
