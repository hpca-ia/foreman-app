// api/cron.js — Una sola puerta para todos los relojes.
//
// Vercel cuenta cada archivo de /api como una función y el plan tope es doce.
// Ya pasó una vez: al agregar un aviso quedamos en trece y los despliegues
// empezaron a fallar EN SILENCIO —el sitio seguía sirviendo la versión vieja—.
// Los avisos se resolvieron así (ver aviso.js) y los relojes van igual: cada
// tarea sigue viviendo en su archivo, con su nombre y sus reglas, y entra por
// acá.
//
// GET /api/cron?hace=pipeline | respaldo | libro
//
// La llave se pide UNA vez, acá, porque es la misma para todos: con cualquiera
// de estos se mueve correo de toda la oficina o se saca una copia de la base.

import { configurado } from "./_supabase.js";
import pipeline from "./_cron-pipeline.js";
import respaldo from "./_cron-respaldo.js";
import libro from "./_cron-libro.js";

const RELOJES = { pipeline, respaldo, libro };

// El respaldo es el que tarda: sube la base entera a Dropbox.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return res.status(503).json({ error: "Falta CRON_SECRET en Vercel" });
  if (req.headers.authorization !== `Bearer ${secreto}`) return res.status(401).json({ error: "No autorizado" });
  if (!configurado()) return res.status(503).json({ error: "Falta SUPABASE_SECRET_KEY" });

  const que = String(req.query?.hace || "");
  const reloj = RELOJES[que];
  if (!reloj) return res.status(400).json({ error: `No sé qué es "${que}"` });
  try {
    return await reloj(req, res);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
