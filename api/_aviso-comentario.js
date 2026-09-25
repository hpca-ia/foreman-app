// api/aviso-comentario.js — Avisar de un comentario en una tarea.
//
// Un comentario sirve si lo lee el que tiene que leerlo. Va a los involucrados
// —quien la tiene a cargo, quien la creó y quienes ya comentaron—, menos al
// que acaba de escribir. Sin copiar a toda la oficina: eso enseña a ignorar
// los correos.
//
// POST { taskId, texto, autorId }

import { sesionValida, rest } from "./_supabase.js";
import { enviarCorreo, plantilla, texto2html, esc } from "./_correo.js";
import { json } from "./_pipeline.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!(await sesionValida(req))) return res.status(401).json({ error: "Tu sesión venció. Vuelve a entrar a FOREMAN." });

  const { taskId, texto, autorId } = req.body || {};
  if (!taskId || !String(texto || "").trim()) return res.status(400).json({ error: "Faltan datos" });

  try {
    const [tarea] = await json(await rest(`tasks?id=eq.${taskId}&select=id,title,assignee_id,created_by,due_date,lead_id,project_id`));
    if (!tarea) return res.status(404).json({ error: "No se encontró la tarea" });

    const comentarios = await json(await rest(`tarea_comentarios?task_id=eq.${taskId}&select=autor_id`));
    const usuarios = await json(await rest(`usuarios?select=id,nombre,email,activo`));
    const autor = usuarios.find(u => u.id === Number(autorId));

    const involucrados = new Set([tarea.assignee_id, tarea.created_by, ...comentarios.map(c => c.autor_id)].filter(Boolean));
    involucrados.delete(Number(autorId));
    const para = usuarios.filter(u => involucrados.has(u.id) && u.email && u.activo !== false).map(u => u.email);
    if (!para.length) return res.status(200).json({ ok: false, error: "Nadie más tiene correo cargado." });

    // De qué proyecto es: el de Ajustes o el del pipeline.
    let donde = "";
    if (tarea.lead_id) {
      const [lead] = await json(await rest(`leads?id=eq.${tarea.lead_id}&select=nombre`));
      donde = lead?.nombre || "";
    } else if (tarea.project_id) {
      const [p] = await json(await rest(`proyectos?id=eq.${tarea.project_id}&select=nombre`));
      donde = p?.nombre || "";
    }

    const html = plantilla({
      titulo: tarea.title,
      subtitulo: [donde, tarea.due_date ? `para el ${tarea.due_date}` : ""].filter(Boolean).join(" · "),
      cuerpo: `
        <div style="font-size:12px;color:#6B7280;margin-bottom:6px">${esc(autor?.nombre || "Alguien")} comentó:</div>
        <div style="background:#F9FAFB;border-left:3px solid #0F3D3E;border-radius:4px;padding:10px 12px">
          ${texto2html(texto)}
        </div>
        <p style="margin:16px 0 0;font-size:12px;color:#6B7280">Respóndele en FOREMAN, en el comentario de la tarea.</p>`,
    });

    const r = await enviarCorreo({ to: para, subject: `Comentario en: ${tarea.title}`, html });
    return res.status(200).json(r);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
