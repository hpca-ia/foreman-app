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
import { enviarCorreo, plantilla } from "./_correo.js";

const URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY;

const dia = f => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");
const esc = t => String(t ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { acta_id: actaId, para, adjunto } = req.body || {};
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
  // El repaso de la anterior y lo nuevo, separados: la primera lista dice si
  // la obra cumple lo que promete, la segunda qué prometió ahora. Mezcladas,
  // ninguna de las dos se lee.
  const vivos = (compromisos || []).filter(c => c.estado !== "anulado");
  const repaso = vivos.filter(c => c.viene_de);
  const nuevos = vivos.filter(c => !c.viene_de);
  const abiertos = nuevos;
  const cerrados = [];
  void cerrados;

  const fila = c => `<tr>
      <td style="padding:7px 10px;border-top:1px solid #E8E6E1;font-size:13px;color:${c.urgente ? "#B91C1C" : "#1A1A1A"}">
        ${c.urgente ? '<span style="font-size:10px;font-weight:700;color:#fff;background:#B91C1C;border-radius:9px;padding:1px 6px;margin-right:5px">URGENTE</span>' : ""}${esc(c.texto)}
      </td>
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

    ${repaso.length ? `<h3 style="margin:20px 0 6px;font-size:13px;color:#555;letter-spacing:.3px">REPASO DE LA REUNIÓN ANTERIOR</h3>
      <table style="width:100%;border-collapse:collapse">
        <tr><th style="text-align:left;padding:0 10px 5px;font-size:11px;color:#777">QUÉ SE HABÍA COMPROMETIDO</th>
            <th style="text-align:left;padding:0 10px 5px;font-size:11px;color:#777">QUIÉN</th>
            <th style="text-align:left;padding:0 10px 5px;font-size:11px;color:#777">¿SE HIZO?</th></tr>
        ${repaso.map(c => `<tr>
          <td style="padding:7px 10px;border-top:1px solid #E8E6E1;font-size:13px;color:${c.estado === "cumplido" ? "#777" : c.urgente ? "#B91C1C" : "#1A1A1A"}">
            ${c.urgente && c.estado !== "cumplido" ? '<span style="font-size:10px;font-weight:700;color:#fff;background:#B91C1C;border-radius:9px;padding:1px 6px;margin-right:5px">URGENTE</span>' : ""}${esc(c.texto)}${c.estado !== "cumplido" && c.nota ? `<br><span style="color:#777;font-size:12px">${esc(c.nota)}</span>` : ""}
          </td>
          <td style="padding:7px 10px;border-top:1px solid #E8E6E1;font-size:13px;color:#555;white-space:nowrap">${esc(c.responsable_nombre || "—")}</td>
          <td style="padding:7px 10px;border-top:1px solid #E8E6E1;font-size:13px;white-space:nowrap;font-weight:600;color:${c.estado === "cumplido" ? "#2D7A4F" : "#92400E"}">
            ${c.estado === "cumplido" ? "Sí" : c.fecha_limite ? `No · para el ${dia(c.fecha_limite)}` : "No"}
          </td></tr>`).join("")}
      </table>` : ""}

    ${abiertos.length ? `<h3 style="margin:20px 0 6px;font-size:13px;color:#555;letter-spacing:.3px">COMPROMISOS DE ESTA REUNIÓN</h3>
      <table style="width:100%;border-collapse:collapse">
        <tr><th style="text-align:left;padding:0 10px 5px;font-size:11px;color:#777">QUÉ</th>
            <th style="text-align:left;padding:0 10px 5px;font-size:11px;color:#777">QUIÉN</th>
            <th style="text-align:left;padding:0 10px 5px;font-size:11px;color:#777">PARA CUÁNDO</th></tr>
        ${abiertos.map(fila).join("")}
      </table>` : ""}



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
    // El pie de siempre dice "no respondas, nadie lo lee", y acá es al revés:
    // la respuesta es la única manera que tiene alguien de dejar constancia de
    // que no estuvo de acuerdo. Las dos frases juntas se contradicen, y la que
    // vale es ésta.
    pie: "Si algo de esta acta no refleja lo acordado, respondé este correo dentro de las próximas 48 horas: "
      + "la respuesta les llega a quien la escribió y a quien la aprobó, y queda como constancia. "
      + "Pasado ese plazo se da por aceptada. "
      + "Correo automático de FOREMAN · HCA Studio.",
  });

  // A QUIÉN LE LLEGA LA RESPUESTA.
  //
  // El acta pide que digan si algo no refleja lo acordado, y el remitente es
  // una casilla de avisos que nadie lee. Sin esto, "respondé este correo" es
  // una invitación al vacío — y lo que se pierde no es un correo: es la
  // observación de alguien que no estuvo de acuerdo, que es justo lo que un
  // acta tiene que poder recoger.
  //
  // A LOS DOS: a quien la escribió y a quien le dio el visto.
  //
  // No es redundancia, son dos roles distintos. El residente escribió el acta
  // y es quien sabe si lo que objetan es un error de transcripción o un
  // desacuerdo de fondo; el director la aprobó y es quien decide qué se hace
  // con la objeción. Mandarla a uno solo obliga a reenviarla, y un reenvío que
  // depende de que alguien se acuerde es un reenvío que a veces no pasa.
  const ids = [...new Set([acta.creado_por, acta.revisada_por].filter(Boolean))];
  const responderA = [];
  for (const id of ids) {
    const { data: u } = await db.from("users").select("email").eq("id", id).maybeSingle();
    const e = String(u?.email || "").trim().toLowerCase();
    if (e && !responderA.includes(e)) responderA.push(e);
  }

  const r = await enviarCorreo({
    to: para, responderA: responderA.length ? responderA : null,
    // El PDF lo arma el navegador y viaja en el pedido: acá no hay librería de
    // PDF ni las fotos firmadas, y poner una sería mantener dos veces el mismo
    // documento.
    adjuntos: adjunto?.contenido
      ? [{ filename: adjunto.nombre || `Acta ${acta.numero}.pdf`, content: adjunto.contenido }]
      : undefined,
    subject: `Acta de reunión N° ${acta.numero} · ${lead?.nombre || "Obra"} · ${dia(acta.fecha)}`,
    html,
  });
  if (r?.error) return res.status(502).json({ error: r.error });
  return res.status(200).json({ enviados: para.length });
}
