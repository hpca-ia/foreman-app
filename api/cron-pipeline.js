// api/cron-pipeline.js — El repaso de cada mañana.
//
// A cada quien lo suyo: lo atrasado, lo de hoy, lo de mañana y lo que cerró
// ayer. Al Director y a los admins, además, la foto completa: qué tiene encima
// cada persona, qué cerró ayer y qué quedó sin repartir.
//
// El de antes miraba las fechas de las etapas —que ya no llevan fecha— y
// buscaba tareas en estado "pendiente", que dejó de existir: o sea, mandaba
// correos vacíos o no mandaba nada.
//
// Lo dispara el reloj de Vercel (ver vercel.json). Si hay CRON_SECRET, se exige.

import { rest, configurado } from "./_supabase.js";
import { enviarCorreo, plantilla, esc } from "./_correo.js";
import { json } from "./_pipeline.js";
import { armarResumen, hoyISO } from "./_resumen.js";

const COLOR = { gestion: "#B45309", tarea: "#0F3D3E", reunion: "#6D28D9" };
const NOMBRE = { gestion: "Gestión", tarea: "Tarea", reunion: "Reunión" };
const APP = "https://foreman-app-ebon.vercel.app";

const dia = f => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "sin fecha");

const linea = t => `<div style="font-size:13px;color:#374151;padding:3px 0">
  <span style="font-size:10px;font-weight:700;color:${COLOR[t.clase]}">${NOMBRE[t.clase].toUpperCase()}</span>
  ${esc(t.title)}
  <span style="color:#9CA3AF">· ${esc(t.proyecto || "sin proyecto")}${t.hora ? ` · ${esc(t.hora)}` : ""}${t.due_date ? ` · ${dia(t.due_date)}` : ""}</span>
</div>`;

const bloque = (titulo, color, filas) => (filas.length
  ? `<div style="font-size:11px;font-weight:700;color:${color};letter-spacing:.4px;margin:14px 0 4px">${titulo}</div>${filas.map(linea).join("")}`
  : "");

export default async function handler(req, res) {
  // Cerrado por defecto: sin la llave no corre. Abierto, cualquiera podría
  // disparar los correos de toda la oficina.
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return res.status(503).json({ error: "Falta CRON_SECRET en Vercel" });
  if (req.headers.authorization !== `Bearer ${secreto}`) return res.status(401).json({ error: "No autorizado" });
  if (!configurado()) return res.status(503).json({ error: "Falta SUPABASE_SECRET_KEY" });

  try {
    const [tareas, usuarios, leads, accesos] = await Promise.all([
      json(await rest("tasks?select=id,title,due_date,hora,status,type,notes,priority,assignee_id,responsable_externo,lead_id,project_id,updated_at")),
      json(await rest("usuarios?select=id,nombre,email,rol,activo")),
      json(await rest("leads?select=id,nombre,created_by,responsable_id,resultado")),
      json(await rest("lead_accesos?select=lead_id,usuario_id")).catch(() => []),
    ]);

    const sobres = armarResumen({ tareas, usuarios, leads, accesos, hoy: hoyISO() });
    const enviados = [];

    for (const s of sobres) {
      const cuerpo = [
        bloque("ATRASADO", "#B91C1C", s.atrasadas),
        bloque("HOY", "#B45309", s.hoy),
        bloque("MAÑANA", "#6B7280", s.manana),
        s.deSusProyectos.length ? bloque("EN TUS PROYECTOS", "#6B7280", s.deSusProyectos) : "",
        s.ayer.length ? bloque("CERRASTE AYER", "#15803D", s.ayer) : "",
        s.sinFecha.length ? `<div style="font-size:12px;color:#9CA3AF;margin-top:14px">Y ${s.sinFecha.length} ${s.sinFecha.length === 1 ? "cosa tuya sin fecha" : "cosas tuyas sin fecha"}.</div>` : "",

        // La foto de la oficina, solo para quien la tiene que mirar.
        s.esAdmin && s.equipo.length ? `
          <div style="font-size:11px;font-weight:700;color:#111827;letter-spacing:.4px;margin:20px 0 6px">EL EQUIPO</div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;color:#374151">
            ${s.equipo.map(e => `<tr>
              <td style="padding:4px 0">${esc(e.persona)}</td>
              <td style="padding:4px 0;color:#9CA3AF">${e.abiertas} abiertas</td>
              <td style="padding:4px 0;color:${e.atrasadas.length ? "#B91C1C" : "#9CA3AF"}">${e.atrasadas.length ? `${e.atrasadas.length} atrasadas` : "al día"}</td>
              <td style="padding:4px 0;color:#15803D">${e.ayer.length ? `${e.ayer.length} ayer` : ""}</td>
            </tr>`).join("")}
          </table>` : "",
        s.esAdmin && s.sinDueno.length ? bloque(`SIN RESPONSABLE · ${s.sinDueno.length}`, "#B91C1C", s.sinDueno.slice(0, 12)) : "",

        `<div style="margin-top:20px"><a href="${APP}" style="display:inline-block;background:#0F3D3E;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Abrir FOREMAN →</a></div>`,
      ].filter(Boolean).join("");

      const pendiente = s.atrasadas.length + s.hoy.length;
      const html = plantilla({
        titulo: `Buenos días, ${esc(s.usuario.nombre?.split(" ")[0] || "")}`,
        subtitulo: s.atrasadas.length
          ? `${s.atrasadas.length} atrasado · ${s.hoy.length} para hoy`
          : s.hoy.length ? `${s.hoy.length} para hoy` : "Nada vence hoy",
        cuerpo,
      });

      const r = await enviarCorreo({
        to: s.usuario.email,
        subject: s.atrasadas.length ? `${s.atrasadas.length} atrasado y ${s.hoy.length} para hoy` : pendiente ? `${s.hoy.length} para hoy` : "Tu día en FOREMAN",
        html,
      });
      if (r.ok) enviados.push(s.usuario.email);
    }

    return res.status(200).json({ ok: true, sobres: sobres.length, enviados });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
