// api/aviso-reunion.js — Avisar de una reunión, con su invitación de calendario.
//
// Una reunión agendada en FOREMAN le sirve a quien entra a FOREMAN. El
// ingeniero, el cliente o el proveedor no entran, así que la reunión les llega
// por correo con un archivo .ics adjunto: lo abren y les queda en su Google o
// su Outlook, con día, hora y de qué se trata.
//
// Del equipo, quien la tenga a cargo recibe el mismo correo: su calendario
// suscrito se actualiza cada hora, y una reunión de mañana temprano no puede
// esperar a que el calendario se acuerde de mirar.
//
// POST { tareaId, alResponsable, invitados: [id] }

import { rest, sesionValida } from "./_supabase.js";
import { json } from "./_pipeline.js";
import { enviarCorreo, plantilla, esc } from "./_correo.js";

const dosDigitos = n => String(n).padStart(2, "0");
const sello = d => new Date(d).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
const plegar = l => l.match(/.{1,72}/g).join("\r\n ");
const escaparIcs = t => String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** La cita como la entiende un calendario. Sin zona: se lee en la de cada uno,
 *  que en esta oficina es la misma, y así no hay que empaquetar una VTIMEZONE
 *  que la mitad de los clientes ignora. */
function invitacion({ tarea, proyecto }) {
  const [h, m] = (tarea.hora || "09:00").split(":").map(Number);
  const arranca = new Date(`${tarea.due_date}T00:00:00Z`);
  arranca.setUTCHours(h, m, 0, 0);
  const termina = new Date(arranca.getTime() + 60 * 60 * 1000);
  const comoTexto = d => `${d.getUTCFullYear()}${dosDigitos(d.getUTCMonth() + 1)}${dosDigitos(d.getUTCDate())}T${dosDigitos(d.getUTCHours())}${dosDigitos(d.getUTCMinutes())}00`;

  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HCA Studio//FOREMAN//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:reunion-${tarea.id}@foreman.hcastudio.com`,
    `DTSTAMP:${sello(Date.now())}`,
    `DTSTART:${comoTexto(arranca)}`,
    `DTEND:${comoTexto(termina)}`,
    plegar(`SUMMARY:${escaparIcs(tarea.title)}`),
    proyecto ? plegar(`LOCATION:${escaparIcs(proyecto)}`) : null,
    "STATUS:CONFIRMED",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

const enCriollo = f => new Date(`${f}T12:00:00`).toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!(await sesionValida(req))) return res.status(401).json({ error: "Tu sesión venció. Vuelve a entrar a FOREMAN." });

  const { tareaId, alResponsable = true, invitados = [] } = req.body || {};
  if (!tareaId) return res.status(400).json({ error: "Falta la reunión" });

  try {
    const [tarea] = await json(await rest(`tasks?id=eq.${tareaId}&select=*`));
    if (!tarea) return res.status(404).json({ error: "No se encontró la reunión" });
    if (!tarea.due_date) return res.status(400).json({ error: "La reunión no tiene día: ponle fecha y hora antes de avisar." });

    const [proyecto] = tarea.lead_id ? await json(await rest(`leads?id=eq.${tarea.lead_id}&select=nombre`)) : [];
    const gente = [];

    if (alResponsable && tarea.assignee_id) {
      const [u] = await json(await rest(`usuarios?id=eq.${tarea.assignee_id}&select=nombre,email,activo`));
      if (u?.email && u.activo !== false) gente.push({ nombre: u.nombre, email: u.email });
    }
    // Los de afuera solo de este proyecto: un id suelto no puede servir para
    // escribirle a alguien de otro.
    if (invitados.length && tarea.lead_id) {
      const suyos = await json(await rest(`pipeline_invitados?lead_id=eq.${tarea.lead_id}&select=id,nombre,email`));
      suyos.filter(i => invitados.includes(i.id) && i.email).forEach(i => gente.push({ nombre: i.nombre, email: i.email }));
    }
    if (!gente.length) return res.status(200).json({ ok: false, error: "Nadie de los elegidos tiene correo cargado." });

    const cuando = `${enCriollo(tarea.due_date)}${tarea.hora ? ` a las ${tarea.hora}` : ""}`;
    const html = plantilla({
      titulo: tarea.title,
      subtitulo: proyecto?.nombre ? `Reunión · ${esc(proyecto.nombre)}` : "Reunión",
      cuerpo: `
        <p style="font-size:15px;color:#111827;margin:0 0 6px"><strong>${esc(cuando)}</strong></p>
        ${tarea.notes ? `<p style="font-size:13px;color:#4B5563;margin:0 0 10px">${esc(tarea.notes)}</p>` : ""}
        <p style="font-size:13px;color:#4B5563;margin:14px 0 0">El archivo adjunto la agrega a tu calendario.</p>`,
    });

    const r = await enviarCorreo({
      to: gente.map(g => g.email),
      subject: `Reunión: ${tarea.title} · ${cuando}`,
      html,
      adjuntos: [{
        filename: "reunion.ics",
        content: Buffer.from(invitacion({ tarea, proyecto: proyecto?.nombre })).toString("base64"),
      }],
    });
    if (!r.ok) return res.status(200).json({ ok: false, error: r.error });

    // Que quede escrito a quién se avisó: después nadie se acuerda de si el
    // cliente estaba enterado.
    if (tarea.lead_id) {
      await rest("lead_movimientos", {
        method: "POST",
        body: JSON.stringify({
          lead_id: tarea.lead_id, tipo: "actividad", automatico: true,
          detalle: `Avisó de la reunión "${tarea.title}" a ${gente.map(g => g.nombre).join(", ")}`,
        }),
      }).catch(() => {});
    }
    return res.status(200).json({ ok: true, enviadoA: gente.map(g => g.nombre) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
