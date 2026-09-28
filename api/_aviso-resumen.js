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
  const quien = await usuarioDeToken(req);
  if (!quien?.id) return res.status(401).json({ error: "No se pudo identificar quién lo pide" });

  try {
    const r = await mandarResumen(quien.id);
    return res.status(200).json(r);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
