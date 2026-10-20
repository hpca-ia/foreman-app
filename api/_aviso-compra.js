// Un comentario en una solicitud de compra, a los que tienen que leerlo.
//
// Entre "aprobar" y "devolver" faltaba el caso más común de todos: la compra
// no está para aprobar, pero tampoco hay por qué devolvérsela a nadie —falta
// un dato que lo tiene un tercero, hay que confirmar una medida, hay que
// preguntarle al proveedor—. Eso es un comentario, y un comentario que nadie
// ve no sirve para nada.
//
// Va a los involucrados en ESA compra: quien la pidió, quien la aprobó o la
// tiene que aprobar, quien la está comprando, y quienes ya comentaron. Menos
// al que acaba de escribir. Sin copiar a toda la oficina, que es como se
// enseña a ignorar los correos.
//
// POST { solicitudId, texto, autorId }

import { sesionValida, rest } from "./_supabase.js";
import { enviarCorreo, plantilla, texto2html, esc } from "./_correo.js";

const json = async r => (r.ok ? (await r.json().catch(() => [])) || [] : []);
const APP = process.env.APP_URL || "https://foreman-app-ebon.vercel.app";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!(await sesionValida(req))) return res.status(401).json({ error: "Tu sesión venció. Vuelve a entrar a FOREMAN." });

  const { solicitudId, texto, autorId } = req.body || {};
  if (!solicitudId || !String(texto || "").trim()) return res.status(400).json({ error: "Faltan datos" });

  try {
    const [compra] = await json(await rest(
      `compras_solicitudes?id=eq.${solicitudId}&select=id,descripcion,estado,monto_estimado,lead_id,solicitante_id,solicitante_nombre,aprobador_id,comprado_por`));
    if (!compra) return res.status(404).json({ error: "No se encontró la solicitud" });

    const [historial, usuarios, leads] = await Promise.all([
      json(await rest(`compras_historial?solicitud_id=eq.${solicitudId}&select=usuario_id`)),
      json(await rest("usuarios?activo=eq.true&select=id,nombre,email,rol")),
      compra.lead_id ? json(await rest(`leads?id=eq.${compra.lead_id}&select=nombre`)) : Promise.resolve([]),
    ]);

    // LOS INTERESADOS SON LOS DE ESTA COMPRA, no un grupo fijo. Quien la pidió,
    // quien la aprueba, quien la compra, y quienes ya dijeron algo acá adentro.
    const involucrados = new Set([
      compra.solicitante_id, compra.aprobador_id, compra.comprado_por,
      ...historial.map(h => h.usuario_id),
    ].filter(Boolean).map(Number));
    involucrados.delete(Number(autorId));

    const autor = usuarios.find(u => Number(u.id) === Number(autorId));
    const para = usuarios
      .filter(u => involucrados.has(Number(u.id)) && String(u.email || "").trim())
      .map(u => String(u.email).trim().toLowerCase());
    if (!para.length) return res.status(200).json({ ok: true, mandados: 0 });

    const obra = leads?.[0]?.nombre || "";
    const r = await enviarCorreo({
      to: [...new Set(para)],
      responderA: autor?.email ? [autor.email] : null,
      subject: `Comentario en la compra · ${compra.descripcion}`,
      html: plantilla({
        titulo: "Comentario en una solicitud de compra",
        subtitulo: [obra, compra.descripcion].filter(Boolean).join(" · "),
        cuerpo: `
          <p style="margin:0 0 12px;font-size:14px;color:#1A1A1A">
            <strong>${esc(autor?.nombre || "Alguien")}</strong> escribió sobre esta compra:
          </p>
          <div style="font-size:14px;color:#1A1A1A;line-height:1.6;padding:12px 14px;background:#F4F7F6;
            border:1px solid #CFE0DC;border-radius:8px">${texto2html(texto)}</div>
          <p style="margin:14px 0 0;font-size:13px;color:#555">
            La solicitud sigue donde estaba: nadie la aprobó ni la devolvió. Queda en su historial,
            con el nombre y la hora.
          </p>
          <p style="margin:16px 0 0">
            <a href="${APP}" style="display:inline-block;background:#0F3D3E;color:#fff;text-decoration:none;
              padding:10px 18px;border-radius:7px;font-size:14px;font-weight:700">Abrir FOREMAN</a>
          </p>`,
        pie: "Correo automático de FOREMAN · HCA Studio.",
      }),
    });
    return res.status(200).json({ ok: !r?.error, mandados: r?.error ? 0 : para.length, error: r?.error || null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
