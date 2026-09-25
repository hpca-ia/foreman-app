// api/calendario.js — Las tareas de alguien, para su calendario de siempre.
//
// Google Calendar, el iPhone y Outlook se suscriben a una dirección y la
// releen cada tanto. Esta devuelve un archivo .ics con las tareas de una
// persona: las que tiene a cargo y las que la acompañan.
//
// No pide sesión, porque un calendario suscrito no puede iniciarla: la llave
// va en la dirección y es larga al azar. Quien la tenga ve ese calendario, así
// que se trata como una invitación; si se filtra, se cambia en Ajustes.
//
// GET /api/calendario?k=LLAVE

import { rest, configurado } from "./_supabase.js";
import { json } from "./_pipeline.js";

const escapar = t => String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const soloFecha = f => String(f).slice(0, 10).replace(/-/g, "");
const sello = d => new Date(d).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
// Una línea de iCalendar no puede pasar de 75 octetos: se parte con un espacio.
const plegar = l => l.match(/.{1,72}/g).join("\r\n ");

export default async function handler(req, res) {
  if (!configurado()) return res.status(503).send("Falta configurar el servidor");
  const llave = String(req.query.k || "").trim();
  if (llave.length < 20) return res.status(400).send("Enlace incompleto");

  try {
    const [usuario] = await json(await rest(`usuarios?calendario_token=eq.${encodeURIComponent(llave)}&select=id,nombre,activo`));
    if (!usuario || usuario.activo === false) return res.status(404).send("Ese calendario ya no existe");

    const acompana = await json(await rest(`tarea_responsables?usuario_id=eq.${usuario.id}&select=task_id`)).catch(() => []);
    const ids = (acompana || []).map(r => r.task_id);
    const filtro = ids.length ? `or=(assignee_id.eq.${usuario.id},id.in.(${ids.join(",")}))` : `assignee_id=eq.${usuario.id}`;
    const campos = "id,title,notes,due_date,status,priority,project_id,updated_at,created_at";
    // Con la 045 puesta viene la hora; sin ella, todo sigue como evento del día.
    let r = await rest(`tasks?${filtro}&select=${campos},hora&order=due_date.asc`);
    if (!r.ok) r = await rest(`tasks?${filtro}&select=${campos}&order=due_date.asc`);
    const tareas = await json(r);
    const proyectos = await json(await rest("proyectos?select=id,nombre"));
    const nombreProyecto = id => proyectos.find(p => p.id === id)?.nombre || "";

    // Lo que tiene hora entra a esa hora y dura una hora: una reunión puesta
    // como evento de todo el día no le dice a nadie cuándo presentarse. La hora
    // va sin zona —flotante—: la lee cada quien en la suya, que en la oficina
    // es la misma, y así no hay que empaquetar una VTIMEZONE que algunos
    // clientes ignoran igual.
    const aLaHora = t => (/^\d{1,2}:\d{2}$/.test(t.hora || "") ? t.hora.padStart(5, "0") : null);
    const conHora = (fecha, hora, masMinutos = 0) => {
      const [h, m] = hora.split(":").map(Number);
      const d = new Date(`${fecha}T00:00:00Z`);
      d.setUTCHours(h, m + masMinutos, 0, 0);
      return `${soloFecha(d.toISOString())}T${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}00`;
    };

    const eventos = (tareas || []).filter(t => t.due_date).map(t => {
      const fin = new Date(t.due_date + "T00:00:00Z");
      fin.setUTCDate(fin.getUTCDate() + 1);              // un día entero: fin exclusivo
      const estado = t.status === "listo" ? "✓ " : t.status === "bloqueado" ? "⏸ " : "";
      const donde = nombreProyecto(t.project_id);
      const hora = aLaHora(t);
      return [
        "BEGIN:VEVENT",
        `UID:tarea-${t.id}@foreman.hcastudio.com`,
        `DTSTAMP:${sello(t.updated_at || t.created_at || Date.now())}`,
        ...(hora
          ? [`DTSTART:${conHora(t.due_date, hora)}`, `DTEND:${conHora(t.due_date, hora, 60)}`]
          : [`DTSTART;VALUE=DATE:${soloFecha(t.due_date)}`, `DTEND;VALUE=DATE:${soloFecha(fin.toISOString())}`]),
        plegar(`SUMMARY:${escapar(estado + t.title + (donde ? ` · ${donde}` : ""))}`),
        t.notes ? plegar(`DESCRIPTION:${escapar(t.notes)}`) : null,
        donde ? plegar(`LOCATION:${escapar(donde)}`) : null,
        t.status === "listo" ? "STATUS:COMPLETED" : "STATUS:CONFIRMED",
        t.priority === "urgente" ? "PRIORITY:1" : t.priority === "alta" ? "PRIORITY:3" : "PRIORITY:5",
        "END:VEVENT",
      ].filter(Boolean).join("\r\n");
    });

    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HCA Studio//FOREMAN//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      plegar(`X-WR-CALNAME:FOREMAN · ${escapar(usuario.nombre || "Tareas")}`),
      "X-WR-TIMEZONE:America/Guayaquil",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
      ...eventos, "END:VCALENDAR",
    ].join("\r\n");

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="foreman.ics"');
    res.setHeader("Cache-Control", "public, max-age=900");
    res.status(200).send(ics);
  } catch (e) {
    res.status(500).send("No se pudo armar el calendario: " + e.message);
  }
}
