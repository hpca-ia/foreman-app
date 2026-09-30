// El resumen diario, armado y mandado. Lo usan el reloj de la mañana y el botón
// de prueba de Ajustes, para que los dos manden exactamente lo mismo.

import { rest } from "./_supabase.js";
import { enviarCorreo, plantilla, esc } from "./_correo.js";
import { json, traer } from "./_pipeline.js";
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



function cuerpoDelCorreo(s) {
  return [
    bloque("ATRASADO", "#B91C1C", s.atrasadas),
    bloque("HOY", "#B45309", s.hoy),
    bloque("MAÑANA", "#6B7280", s.manana),
    // Lo que viene, para poder organizar el día sabiendo qué hay detrás.
    bloque("ESTA SEMANA", "#6B7280", (s.estaSemana || []).slice(0, 12)),
    (s.masAdelante || []).length
      ? bloque("MÁS ADELANTE", "#9CA3AF", s.masAdelante.slice(0, 8))
      : "",
    (s.masAdelante || []).length > 8
      ? `<div style="font-size:11.5px;color:#9CA3AF;margin-top:4px">…y ${s.masAdelante.length - 8} más adelante.</div>` : "",
    s.deSusProyectos.length ? bloque("EN TUS PROYECTOS", "#6B7280", s.deSusProyectos) : "",
    s.ayer.length ? bloque("CERRASTE AYER", "#15803D", s.ayer) : "",
    // Lo sin fecha ya no es una nota al pie: si no tiene día, no va a pasar
    // solo, y el correo de la mañana es el momento de ponerle uno.
    (s.sinFecha || []).length ? bloque(`SIN FECHA · ${s.sinFecha.length}`, "#9CA3AF", s.sinFecha.slice(0, 8)) : "",

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

    !s.atrasadas.length && !s.hoy.length && !s.manana.length && !s.ayer.length && !s.equipo.length
      && !(s.estaSemana || []).length && !(s.masAdelante || []).length && !(s.sinFecha || []).length
      ? `<p style="font-size:13px;color:#4B5563;margin:0">Hoy no tenés nada con fecha. Lo que esté sin fecha te espera en FOREMAN.</p>` : "",

    `<div style="margin-top:20px"><a href="${APP}" style="display:inline-block;background:#0F3D3E;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Abrir FOREMAN →</a></div>`,
  ].filter(Boolean).join("");
}

function asunto(s) {
  if (s.atrasadas.length) return `${s.atrasadas.length} atrasado y ${s.hoy.length} para hoy`;
  if (s.hoy.length) return `${s.hoy.length} para hoy`;
  return "Tu día en FOREMAN";
}

const tituloDelCorreo = s => plantilla({
  titulo: `Buenos días, ${esc(s.usuario.nombre?.split(" ")[0] || "")}`,
  subtitulo: s.atrasadas.length
    ? `${s.atrasadas.length} atrasado · ${s.hoy.length} para hoy`
    : s.hoy.length ? `${s.hoy.length} para hoy` : "Nada vence hoy",
  cuerpo: cuerpoDelCorreo(s),
});

/**
 * @param {number|null} soloPara  id de usuario: manda solo su sobre (para probar)
 * @returns { ok, sobres, enviados, columnas, error }
 */
export async function mandarResumen(soloPara = null) {
  const [{ filas: tareas, columnas }, { filas: usuarios }, { filas: leads }, { filas: accesos }] = await Promise.all([
    traer("tasks", [
      "id,title,due_date,hora,status,type,notes,priority,assignee_id,responsable_externo,lead_id,project_id,updated_at",
      "id,title,due_date,hora,status,type,notes,priority,assignee_id,lead_id,project_id,updated_at",
      "id,title,due_date,status,type,notes,priority,assignee_id,lead_id,project_id",
      "id,title,due_date,status,assignee_id,lead_id,project_id",
    ]),
    traer("usuarios", ["id,nombre,email,rol,activo"]),
    traer("leads", ["id,nombre,created_by,responsable_id,resultado", "id,nombre,resultado"]),
    traer("lead_accesos", ["lead_id,usuario_id"]),
  ]);

  if (!columnas) return { ok: false, error: "No se pudieron leer las tareas: revisá las columnas de la tabla tasks" };

  let sobres = armarResumen({ tareas, usuarios, leads, accesos, hoy: hoyISO() });
  if (soloPara) {
    sobres = sobres.filter(s => s.usuario.id === Number(soloPara));
    // Probando, un sobre vacío también sirve: dice que el correo llega.
    if (!sobres.length) {
      const u = usuarios.find(x => x.id === Number(soloPara));
      if (!u) return { ok: false, error: `No encontré al usuario ${soloPara} en la tabla de usuarios` };
      if (!u.email) return { ok: false, error: `${u.nombre} no tiene correo cargado: ponéselo en Ajustes → Usuarios` };
      sobres = [{ usuario: u, esAdmin: u.rol === "owner" || u.rol === "assistant",
        atrasadas: [], hoy: [], manana: [], estaSemana: [], masAdelante: [], sinFecha: [], ayer: [], deSusProyectos: [], equipo: [], sinDueno: [] }];
    }
  }

  const enviados = [];
  for (const s of sobres) {
    const r = await enviarCorreo({ to: s.usuario.email, subject: asunto(s), html: tituloDelCorreo(s) });
    if (r.ok) enviados.push(s.usuario.email);
  }
  return { ok: true, sobres: sobres.length, enviados, columnas, tareas: tareas.length };
}
