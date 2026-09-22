// api/aviso-cuenta.js — Avisarle a alguien que le cambiaron algo de su cuenta.
//
// Dos casos, los dos desde Ajustes y solo por un admin:
//   · PIN nuevo: se lo mandamos, porque es el único momento en que se puede.
//     En la base solo queda una huella del PIN, no el PIN: ni FOREMAN ni nadie
//     lo puede volver a leer después.
//   · Permisos: cambió lo que puede hacer, y tiene que enterarse por algo más
//     que por toparse con un botón que antes no estaba.
//
// El PIN viaja del navegador del admin al correo del usuario y no se guarda en
// ningún lado: ni en la base, ni en los registros del servidor, ni vuelve en la
// respuesta.
//
// POST { usuarioId, tipo: "pin" | "permisos", pin?, rol?, cambios?: [texto] }

import { sesionValida, usuarioDeToken, rest } from "./_supabase.js";
import { enviarCorreo, plantilla, esc } from "./_correo.js";
import { json } from "./_pipeline.js";

const ADMIN = ["owner", "admin", "director", "assistant"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!(await sesionValida(req))) return res.status(401).json({ error: "Tu sesión venció. Vuelve a entrar a FOREMAN." });

  const { usuarioId, tipo, pin, rol, cambios = [] } = req.body || {};
  if (!usuarioId || !["pin", "permisos"].includes(tipo)) return res.status(400).json({ error: "Faltan datos" });

  try {
    // Quien pide el aviso tiene que ser admin: si no, cualquiera mandaría
    // correos a nombre de la oficina.
    const cuenta = await usuarioDeToken(req);
    if (cuenta) {
      const [quien] = await json(await rest(`usuarios?auth_user_id=eq.${cuenta.id}&select=rol,nombre`));
      if (quien && !ADMIN.includes(quien.rol)) return res.status(403).json({ error: "Solo un administrador puede mandar este aviso" });
    }

    const [usuario] = await json(await rest(`usuarios?id=eq.${usuarioId}&select=id,nombre,email,rol,activo`));
    if (!usuario) return res.status(404).json({ error: "No se encontró el usuario" });
    if (!usuario.email) return res.status(200).json({ ok: false, error: `${usuario.nombre} no tiene correo cargado en Ajustes.` });

    const linea = t => `<div style="font-size:13px;color:#374151;padding:3px 0">• ${esc(t)}</div>`;
    const cuerpo = tipo === "pin"
      ? `<div style="font-size:14px;color:#111827">Tu clave de FOREMAN cambió.</div>
         <div style="margin:14px 0;padding:14px 16px;background:#F7F7F5;border:1px solid #E4E4E1;border-radius:8px;text-align:center">
           <div style="font-size:11px;color:#6B7280;letter-spacing:1px">TU NUEVA CLAVE</div>
           <div style="font-size:26px;font-weight:700;color:#111827;letter-spacing:6px;margin-top:4px">${esc(pin || "")}</div>
         </div>
         <div style="font-size:13px;color:#374151;line-height:1.5">
           Entra con ella en <a href="https://foreman-app-ebon.vercel.app" style="color:#0F3D3E">FOREMAN</a>, con tu perfil de siempre.
           Si no pediste este cambio, avísale a quien administra FOREMAN.
         </div>
         <div style="font-size:12px;color:#6B7280;margin-top:10px">Este correo es el único lugar donde queda escrita tu clave: en FOREMAN se guarda cifrada y nadie la puede volver a leer. Guárdalo o bórralo, como prefieras.</div>`
      : `<div style="font-size:14px;color:#111827">Cambió lo que puedes hacer en FOREMAN${rol ? `, como <strong>${esc(rol)}</strong>` : ""}.</div>
         <div style="margin-top:10px">${(cambios.length ? cambios : ["Se ajustaron tus permisos."]).map(linea).join("")}</div>
         <div style="font-size:13px;color:#374151;margin-top:12px">Si algo que necesitas para trabajar no te aparece, dilo y se revisa.</div>`;

    const r = await enviarCorreo({
      to: usuario.email,
      subject: tipo === "pin" ? "Tu nueva clave de FOREMAN" : "Cambiaron tus permisos en FOREMAN",
      html: plantilla({
        titulo: tipo === "pin" ? "Tu nueva clave" : "Tus permisos",
        subtitulo: usuario.nombre,
        cuerpo,
      }),
    });
    res.status(200).json(r.ok ? { ok: true, enviadoA: usuario.email } : { ok: false, error: r.error });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
