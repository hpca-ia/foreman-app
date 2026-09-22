// api/respaldo.js — "Respaldar ahora", desde Admin BD.
//
// El mismo respaldo de cada noche, disparado a mano por alguien que entró a
// FOREMAN. Sirve para comprobar que todo está bien configurado sin esperar a
// la madrugada, y para sacar una copia antes de tocar algo delicado.

import { correrRespaldo } from "./_respaldoTarea.js";
import { configurado, usuarioDeToken, rest } from "./_supabase.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!configurado()) return res.status(503).json({ error: "Falta SUPABASE_SECRET_KEY en Vercel" });

  // Solo el dueño: un respaldo es la oficina entera en un archivo.
  const cuenta = await usuarioDeToken(req);
  if (!cuenta) return res.status(401).json({ error: "Entra a FOREMAN para hacer esto" });
  const r = await rest(`usuarios?auth_user_id=eq.${cuenta.id}&select=rol`);
  const rol = r.ok ? (await r.json())[0]?.rol : null;
  if (rol !== "owner") return res.status(403).json({ error: "Solo el dueño de FOREMAN puede sacar un respaldo" });

  try {
    res.status(200).json(await correrRespaldo({ correo: req.body?.correo === true }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
