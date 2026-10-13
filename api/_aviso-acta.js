// El acta de reunión, por correo, a quienes la firman.
//
// Se manda cuando el director le da el visto. Lo que sale es el acta entera en
// el cuerpo del correo —no un enlace a FOREMAN— porque quien la recibe suele
// no tener cuenta: es el cliente, la fiscalización, un contratista. Un correo
// que obliga a entrar a un sistema para leerlo no se lee, y un acta que no se
// lee no vale como acta.
//
// Y queda en la casilla de cada uno, que es donde se la va a buscar dentro de
// seis meses cuando haya que demostrar que algo se dijo.

import { createClient } from "@supabase/supabase-js";
import { enviarCorreo, plantilla, PIE } from "./_correo.js";

const URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY;

const dia = f => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");
const esc = t => String(t ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { acta_id: actaId, para } = req.body || {};
  if (!actaId) return res.status(400).json({ error: "Falta el acta." });
  if (!Array.isArray(para) || !para.length) return res.status(400).json({ error: "No hay a quién mandársela." });

  const db = createClient(URL, KEY);
  const { data: acta, error } = await db.from("obra_actas").select("*").eq("id", actaId).single();
  if (error || !acta) return res.status(404).json({ error: "No encontré el acta." });

  const [{ data: lead }, { data: asistentes }, { data: temas }, { data: compromisos }] = await Promise.all([
    db.from("leads").select("nombre").eq("id", acta.lead_id).single(),
    db.from("acta_asistentes").select("*").eq("acta_id", actaId).order("orden"),
    db.from("acta_temas").select("*").eq("acta_id", actaId).order("orden"),
    db.from("acta_compromisos").select("*").eq("acta_id", actaId).order("orden"),
  ]);

  const vinieron = (asistentes || []).filter(a => a.asistio);
  const faltaron = (asistentes || []).filter(a => !a.asistio);
  const abiertos = (compromisos || []).filter(c => c.estado === "pendiente" || c.estado === "reprogramado");
  const cerrados = (compromisos || []).filter(c => c.estado === "cumplido");

  const fila = c => `<tr>
      <td style="padding:7px 10px;border-top:1px solid #E8E6E1;font-size:13px;color:#1A1A1A">${esc(c.texto)}</td>
      <td style="padding:7px 10px;border-top:1px solid #E8E6E1;font-size:13px;color:#555;white-space:nowrap">${esc(c.responsable_nombre || "—")}</td>
      <td style="padding:7px 10px;border-top:1px solid #E8E6E1;font-size:13px;color:#555;white-space:nowrap">${c.fecha_limite ? dia(c.fecha_limite) : "—"}</td>
    </tr>`;

  const cuerpo = `
    <p style="margin:0 0 14px;font-size:14px;color:#1A1A1A">
      <strong>${esc(lead?.nombre || "Obra")}</strong><br>
      ${dia(acta.fecha)}${acta.hora_inicio ? ` · ${acta.hora_inicio.slice(0, 5)}${acta.hora_fin ? ` a ${acta.hora_fin.slice(0, 5)}` : ""}` : ""}${acta.lugar ? ` · ${esc(acta.lugar)}` : ""}
    </p>

    <h3 style="margin:18px 0 6px;font-size:13px;color:#555;letter-spacing:.3px">ASISTENTES</h3>
    <p style="margin:0 0 4px;font-size:13px;color:#1A1A1A;line-height:1.6">
      ${vinieron.map(a => `${esc(a.nombre)}${a.empresa ? ` <span style="color:#777">(${esc(a.empresa)})</span>` : ""}`).join("<br>") || "—"}
    </p>
    ${faltaron.length ? `<p style="margin:8px 0 0;font-size:12.5px;color:#777">No asistieron: ${faltaron.map(a => esc(a.nombre)).join(", ")}</p>` : ""}

    ${temas?.length ? `<h3 style="margin:20px 0 6px;font-size:13px;color:#555;letter-spacing:.3px">TEMAS TRATADOS</h3>
      ${temas.map(t => `<div style="margin-bottom:12px">
        <div style="font-size:13.5px;font-weight:600;color:#1A1A1A">${esc(t.titulo)}</div>
        ${t.detalle ? `<div style="font-size:13px;color:#444;line-height:1.55;margin-top:2px">${esc(t.detalle)}</div>` : ""}
        ${t.resuelto ? `<div style="font-size:13px;color:#1A1A1A;line-height:1.55;margin-top:4px;padding-left:9px;border-left:3px solid #2D5F55"><strong>Se resuelve:</strong> ${esc(t.resuelto)}</div>` : ""}
      </div>`).join("")}` : ""}

    ${abiertos.length ? `<h3 style="margin:20px 0 6px;font-size:13px;color:#555;letter-spacing:.3px">COMPROMISOS</h3>
      <table style="width:100%;border-collapse:collapse">
        <tr><th style="text-align:left;padding:0 10px 5px;font-size:11px;color:#777">QUÉ</th>
            <th style="text-align:left;padding:0 10px 5px;font-size:11px;color:#777">QUIÉN</th>
            <th style="text-align:left;padding:0 10px 5px;font-size:11px;color:#777">PARA CUÁNDO</th></tr>
        ${abiertos.map(fila).join("")}
      </table>` : ""}

    ${cerrados.length ? `<p style="margin:14px 0 0;font-size:12.5px;color:#777">
      Se dieron por cumplidos: ${cerrados.map(c => esc(c.texto)).join(" · ")}</p>` : ""}

    ${acta.avance_nota ? `<h3 style="margin:20px 0 6px;font-size:13px;color:#555;letter-spacing:.3px">AVANCE</h3>
      <p style="margin:0;font-size:13px;color:#1A1A1A;line-height:1.55">${esc(acta.avance_nota)}</p>` : ""}

    ${acta.resumen ? `<h3 style="margin:20px 0 6px;font-size:13px;color:#555;letter-spacing:.3px">OTRAS CONSTANCIAS</h3>
      <p style="margin:0;font-size:13px;color:#1A1A1A;line-height:1.55">${esc(acta.resumen)}</p>` : ""}

    ${acta.proxima_fecha ? `<p style="margin:20px 0 0;font-size:13px;color:#1A1A1A">
      <strong>Próxima reunión:</strong> ${dia(acta.proxima_fecha)}${acta.proxima_hora ? ` a las ${acta.proxima_hora.slice(0, 5)}` : ""}</p>` : ""}
  `;

  const html = plantilla({
    titulo: `Acta de reunión N° ${acta.numero}`,
    subtitulo: lead?.nombre || "",
    cuerpo,
    // El pie de siempre no sirve acá: esto va a gente de afuera, y lo que
    // necesitan saber es que si algo quedó mal escrito hay que decirlo ahora.
    pie: "Si algo de esta acta no refleja lo acordado, respondé este correo dentro de las próximas 48 horas. "
      + "Pasado ese plazo se da por aceptada. " + PIE,
  });

  const r = await enviarCorreo({
    to: para,
    subject: `Acta de reunión N° ${acta.numero} · ${lead?.nombre || "Obra"} · ${dia(acta.fecha)}`,
    html,
  });
  if (r?.error) return res.status(502).json({ error: r.error });
  return res.status(200).json({ enviados: para.length });
}
