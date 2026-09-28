// api/cron-pipeline.js — El repaso de cada mañana.
//
// A cada quien lo suyo: lo atrasado, lo de hoy, lo de mañana y lo que cerró
// ayer. Al Director y a los admins, además, la foto completa del equipo y lo
// que quedó sin repartir.
//
// El armado vive en _resumenDiario.js, para que el botón de prueba de Ajustes
// mande exactamente el mismo correo que este reloj.
//
// Lo dispara Vercel de lunes a sábado (ver vercel.json).

import { configurado } from "./_supabase.js";
import { mandarResumen } from "./_resumenDiario.js";

export default async function handler(req, res) {
  // Cerrado por defecto: sin la llave no corre. Abierto, cualquiera podría
  // disparar los correos de toda la oficina.
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return res.status(503).json({ error: "Falta CRON_SECRET en Vercel" });
  if (req.headers.authorization !== `Bearer ${secreto}`) return res.status(401).json({ error: "No autorizado" });
  if (!configurado()) return res.status(503).json({ error: "Falta SUPABASE_SECRET_KEY" });

  try {
    const r = await mandarResumen();
    return res.status(r.ok ? 200 : 500).json(r);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
