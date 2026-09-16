// api/cron-pipeline.js — El repaso de cada mañana.
//
// Una vez al día revisa el pipeline y escribe a quien tiene algo encima: una
// etapa que vence hoy o mañana, o que ya se pasó de fecha. El Director recibe
// además la foto completa: lo atrasado, lo que se quedó sin próximo paso y lo
// que volvió atrás.
//
// Lo dispara el reloj de Vercel (ver vercel.json). Si hay CRON_SECRET, se exige.

import { rest, configurado } from "./_supabase.js";
import { enviarCorreo, plantilla, esc } from "./_correo.js";
import { json, hoy, enDias } from "./_pipeline.js";

const fila = (que, cuando, quien) =>
  `<div style="font-size:13px;color:#374151;padding:3px 0">• ${esc(que)}${cuando ? ` <span style="color:#9CA3AF">· ${esc(cuando)}</span>` : ""}${quien ? ` <span style="color:#9CA3AF">· ${esc(quien)}</span>` : ""}</div>`;

export default async function handler(req, res) {
  // Cerrado por defecto: sin la llave no corre. Abierto, cualquiera podría
  // disparar los correos de toda la oficina.
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return res.status(503).json({ error: "Falta CRON_SECRET en Vercel" });
  if (req.headers.authorization !== `Bearer ${secreto}`) return res.status(401).json({ error: "No autorizado" });
  if (!configurado()) return res.status(503).json({ error: "Falta SUPABASE_SECRET_KEY" });

  try {
    const [leads, etapas, catalogo, tareas, usuarios, invitados] = await Promise.all([
      json(await rest(`leads?resultado=is.null&select=id,nombre,etapa,created_by`)),
      json(await rest(`lead_etapas?select=*`)),
      json(await rest(`pipeline_etapas?select=id,nombre`)),
      json(await rest(`tasks?lead_id=not.is.null&status=eq.pendiente&select=id,title,due_date,assignee_id,lead_id`)),
      json(await rest(`usuarios?select=id,nombre,email,rol,activo`)),
      json(await rest(`pipeline_invitados?select=id,nombre,email`)),
    ]);
    const abiertos = new Map(leads.map(l => [l.id, l]));
    const nombreEtapa = id => catalogo.find(c => c.id === id)?.nombre || id;
    const limite = enDias(1);

    // Lo que aprieta: etapas en curso vencidas o que vencen hoy o mañana, y
    // pasos en la misma situación.
    const urgentes = [];
    etapas.filter(e => e.estado === "en_curso" && e.fecha_objetivo && e.fecha_objetivo <= limite && abiertos.has(e.lead_id))
      .forEach(e => urgentes.push({
        lead: abiertos.get(e.lead_id), que: `${nombreEtapa(e.etapa_id)} — ${abiertos.get(e.lead_id).nombre}`,
        cuando: e.fecha_objetivo, usuario: e.responsable_id, invitado: e.invitado_id,
        atrasado: e.fecha_objetivo < hoy(),
      }));
    tareas.filter(t => t.due_date && t.due_date <= limite && abiertos.has(t.lead_id))
      .forEach(t => urgentes.push({
        lead: abiertos.get(t.lead_id), que: `${t.title} — ${abiertos.get(t.lead_id).nombre}`,
        cuando: t.due_date, usuario: t.assignee_id, atrasado: t.due_date < hoy(),
      }));

    // A cada quien lo suyo
    const porPersona = new Map();
    urgentes.forEach(u => {
      const clave = u.usuario ? `u:${u.usuario}` : u.invitado ? `i:${u.invitado}` : null;
      if (!clave) return;
      if (!porPersona.has(clave)) porPersona.set(clave, []);
      porPersona.get(clave).push(u);
    });

    const enviados = [];
    for (const [clave, lista] of porPersona) {
      const [tipo, id] = clave.split(":");
      const persona = tipo === "u" ? usuarios.find(x => x.id === Number(id)) : invitados.find(x => x.id === Number(id));
      const correo = persona?.email;
      if (!correo || (tipo === "u" && persona.activo === false)) continue;
      const atrasadas = lista.filter(x => x.atrasado);
      const html = plantilla({
        titulo: "Lo que tienes hoy",
        subtitulo: atrasadas.length ? `${atrasadas.length} ${atrasadas.length === 1 ? "cosa atrasada" : "cosas atrasadas"}` : "Nada atrasado, esto es lo que viene",
        cuerpo: `
          ${atrasadas.length ? `<div style="font-size:11px;font-weight:700;color:#B91C1C;letter-spacing:.4px;margin-bottom:4px">ATRASADO</div>${atrasadas.map(x => fila(x.que, x.cuando)).join("")}` : ""}
          ${lista.filter(x => !x.atrasado).length ? `<div style="font-size:11px;font-weight:700;color:#6B7280;letter-spacing:.4px;margin:14px 0 4px">HOY Y MAÑANA</div>${lista.filter(x => !x.atrasado).map(x => fila(x.que, x.cuando)).join("")}` : ""}
        `,
      });
      const r = await enviarCorreo({ to: correo, subject: atrasadas.length ? `Tienes ${atrasadas.length} atrasado en el pipeline` : "Tu pipeline de hoy", html });
      if (r.ok) enviados.push(correo);
    }

    // La foto completa, para el Director
    const sinPaso = leads.filter(l => !etapas.some(e => e.lead_id === l.id && e.estado === "en_curso")
      && !tareas.some(t => t.lead_id === l.id));
    const directores = usuarios.filter(u => u.rol === "owner" && u.email && u.activo !== false).map(u => u.email);
    if (directores.length && (urgentes.length || sinPaso.length)) {
      const atrasados = urgentes.filter(x => x.atrasado);
      const html = plantilla({
        titulo: "El pipeline hoy",
        subtitulo: `${leads.length} proyectos abiertos`,
        cuerpo: `
          ${atrasados.length ? `<div style="font-size:11px;font-weight:700;color:#B91C1C;letter-spacing:.4px;margin-bottom:4px">ATRASADOS</div>${atrasados.map(x => fila(x.que, x.cuando)).join("")}` : ""}
          ${sinPaso.length ? `<div style="font-size:11px;font-weight:700;color:#B45309;letter-spacing:.4px;margin:14px 0 4px">SIN PRÓXIMO PASO</div>${sinPaso.map(l => fila(l.nombre)).join("")}` : ""}
          ${!atrasados.length && !sinPaso.length ? "<p>Todo al día.</p>" : ""}
        `,
      });
      const r = await enviarCorreo({ to: directores, subject: atrasados.length ? `Pipeline: ${atrasados.length} atrasados` : "Pipeline al día", html });
      if (r.ok) enviados.push(...directores);
    }

    return res.status(200).json({ ok: true, urgentes: urgentes.length, enviados });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
