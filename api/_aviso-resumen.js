// El resumen del día, mandado a mano para probarlo.
//
// El correo de la mañana sale solo y, si algo está mal, uno se entera al día
// siguiente. Con esto se lo pide cuando uno quiere: llega el mismo correo, con
// los mismos datos, a quien lo pide.
//
// POST /api/aviso?de=resumen

import { sesionValida, usuarioDeToken } from "./_supabase.js";
import { mandarResumen } from "./_resumenDiario.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!(await sesionValida(req))) return res.status(401).json({ error: "Tu sesión venció. Vuelve a entrar a FOREMAN." });

  // A quien lo pide, y a nadie más: probar no puede significar escribirle a
  // toda la oficina por accidente.
  //
  // El token es de la cuenta de acceso, no de la persona: el id de FOREMAN
  // viaja en `app_metadata.usuario_id`, que solo el servidor puede escribir.
  // Usar el id del token daba "esa persona no tiene correo cargado", porque ese
  // id no es de nadie en la tabla de usuarios.
  const cuenta = await usuarioDeToken(req);
  const usuarioId = cuenta?.app_metadata?.usuario_id ?? req.body?.usuarioId;
  if (!usuarioId) return res.status(401).json({ error: "No se pudo identificar quién lo pide" });

  try {
    const r = await mandarResumen(usuarioId);
    return res.status(200).json(r);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
