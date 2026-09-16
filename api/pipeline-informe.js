// api/pipeline-informe.js — El informe de un proyecto del pipeline, por correo.
//
// Sirve para las dos cosas que pidió la oficina: mandarlo cuando uno quiera, y
// que salga solo al cambiar de etapa. NOVA lo redacta con lo que hay en la
// base —avance, lo que sigue, las fechas—, y si no contesta se manda igual con
// el resumen armado acá: un aviso que no sale no sirve de nada.
//
// POST { leadId, a, motivo, soloTexto, texto }
//   a: "responsable" | "equipo" | "todos" | ["correo@..."]
//   soloTexto: devuelve el borrador sin mandarlo, para poder leerlo antes.
//   texto: si viene, se manda eso en vez de lo que escriba NOVA.

import { sesionValida } from "./_supabase.js";
import { enviarCorreo, plantilla, texto2html, esc } from "./_correo.js";
import { datosDelProyecto, destinatarios, informeDeNova } from "./_pipeline.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!(await sesionValida(req))) return res.status(401).json({ error: "Tu sesión venció. Vuelve a entrar a FOREMAN." });

  const { leadId, a = "equipo", motivo, soloTexto, texto } = req.body || {};
  if (!leadId) return res.status(400).json({ error: "Falta el proyecto" });

  try {
    const d = await datosDelProyecto(leadId);
    if (!d) return res.status(404).json({ error: "No se encontró el proyecto" });

    const paraCliente = Array.isArray(a)
      ? a.some(correo => d.invitados.some(i => i.email === correo))
      : a === "todos";
    const informe = texto?.trim() || await informeDeNova(d, { motivo, paraCliente });
    if (soloTexto) return res.status(200).json({ ok: true, texto: informe, destinatarios: destinatarios(d, a) });

    const para = destinatarios(d, a);
    if (!para.length) return res.status(200).json({ ok: false, error: "Nadie tiene correo configurado para este envío." });

    const etapa = d.actual ? d.nombreEtapa(d.actual.etapa_id) : "sin etapa en curso";
    const siguen = d.etapas.filter(e => e.estado === "pendiente").slice(0, 5);
    const html = plantilla({
      titulo: d.lead.nombre,
      subtitulo: `${etapa}${d.actual?.fecha_objetivo ? ` · para el ${d.actual.fecha_objetivo}` : ""}`,
      cuerpo: `
        ${texto2html(informe)}
        ${siguen.length ? `
          <div style="margin-top:18px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px">
            <div style="font-size:11px;font-weight:700;color:#6B7280;letter-spacing:.4px;margin-bottom:6px">LO QUE SIGUE</div>
            ${siguen.map(e => `<div style="font-size:13px;color:#374151;padding:2px 0">• ${esc(d.nombreEtapa(e.etapa_id))}${e.fecha_objetivo ? ` <span style="color:#9CA3AF">· ${esc(e.fecha_objetivo)}</span>` : ""}${e.responsable_nombre ? ` <span style="color:#9CA3AF">· ${esc(e.responsable_nombre)}</span>` : ""}</div>`).join("")}
          </div>` : ""}
      `,
    });

    const r = await enviarCorreo({ to: para, subject: `${d.lead.nombre} — ${etapa}`, html });
    return res.status(200).json({ ...r, texto: informe });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
