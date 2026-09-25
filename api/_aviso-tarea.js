// api/aviso-tarea.js — "Te encargaron esto", por correo.
//
// Antes el aviso se armaba en el navegador y solo al crear una tarea desde el
// tablero: lo que nacía en el pipeline —que hoy es casi todo— no avisaba a
// nadie, y si el envío fallaba nadie se enteraba porque el error se tragaba en
// silencio. Ahora hay un solo lugar que lo manda, los dos caminos lo usan y
// contesta si no pudo.
//
// POST { tareaId }

import { rest, sesionValida } from "./_supabase.js";
import { json } from "./_pipeline.js";
import { enviarCorreo, plantilla, esc } from "./_correo.js";

const APP = "https://foreman-app-ebon.vercel.app";
const enCriollo = f => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" }) : null);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!(await sesionValida(req))) return res.status(401).json({ error: "Tu sesión venció. Vuelve a entrar a FOREMAN." });

  const { tareaId } = req.body || {};
  if (!tareaId) return res.status(400).json({ error: "Falta la tarea" });

  try {
    const [tarea] = await json(await rest(`tasks?id=eq.${tareaId}&select=*`));
    if (!tarea) return res.status(404).json({ error: "No se encontró la tarea" });
    if (!tarea.assignee_id) return res.status(200).json({ ok: false, error: "La tarea no tiene responsable del equipo." });

    const [quien] = await json(await rest(`usuarios?id=eq.${tarea.assignee_id}&select=nombre,email,activo`));
    if (!quien?.email || quien.activo === false) return res.status(200).json({ ok: false, error: "Esa persona no tiene correo cargado." });

    // De qué proyecto es: del pipeline o de la lista vieja, lo que haya.
    let proyecto = "";
    if (tarea.lead_id) {
      const [l] = await json(await rest(`leads?id=eq.${tarea.lead_id}&select=nombre`));
      proyecto = l?.nombre || "";
    } else if (tarea.project_id) {
      const [p] = await json(await rest(`proyectos?id=eq.${tarea.project_id}&select=nombre`));
      proyecto = p?.nombre || "";
    }

    const clase = tarea.type === "Reunión" ? "Reunión" : tarea.type === "Gestión" ? "Gestión" : "Tarea";
    const cuando = enCriollo(tarea.due_date);
    const prioridad = { urgente: "URGENTE", alta: "Alta", media: "Media", baja: "Baja" }[tarea.priority] || "Media";

    const html = plantilla({
      titulo: tarea.title,
      subtitulo: `${clase}${proyecto ? ` · ${esc(proyecto)}` : ""}`,
      cuerpo: `
        <p style="font-size:14px;color:#111827;margin:0 0 4px">
          ${cuando ? `Para el <strong>${esc(cuando)}</strong>${tarea.hora ? ` a las <strong>${esc(tarea.hora)}</strong>` : ""}` : "Sin fecha"}
        </p>
        <p style="font-size:13px;color:#4B5563;margin:0 0 12px">Prioridad: ${esc(prioridad)}</p>
        ${tarea.notes && !/^(Gestión|Actividad|Tarea|Reunión) de /.test(tarea.notes)
          ? `<p style="font-size:13px;color:#4B5563;margin:0 0 12px">${esc(tarea.notes)}</p>` : ""}
        <a href="${APP}" style="display:inline-block;background:#0F3D3E;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Verla en FOREMAN →</a>`,
    });

    const r = await enviarCorreo({ to: quien.email, subject: `${clase}: ${tarea.title}${cuando ? ` · ${cuando}` : ""}`, html });
    return res.status(200).json(r.ok ? { ok: true, enviadoA: quien.nombre } : { ok: false, error: r.error });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
