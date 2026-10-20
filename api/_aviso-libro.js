// El libro de obra, por correo, al que lo pida.
//
// El libro no se consulta: se entrega. Cuando alguien lo pide —la
// fiscalización, el cliente, el abogado en un reclamo— lo que tiene que salir
// es un documento con las fechas que se pidieron, no un acceso a un sistema.
//
// POR TRAMO DE FECHAS, que es como se pide de verdad: "mandame el libro de
// septiembre", "lo de la semana de la lluvia". El libro entero de una obra de
// un año no lo lee nadie, y además no entra en un correo.
//
// Y CADA ENTREGA QUEDA ANOTADA, con su acuse y su enlace. "El libro de
// septiembre te lo mandé el 3 de octubre" no vale nada sin el acuse al lado, y
// un libro que rebotó sin que nadie se entere es peor que uno que no se mandó:
// el que lo pidió cree que ya lo tiene y no lo vuelve a pedir.

import { randomUUID } from "crypto";
import { rest, configurado } from "./_supabase.js";
import { enviarCorreo, plantilla, estadoDeCorreo } from "./_correo.js";

async function filas(tabla, consulta) {
  const r = await rest(`${tabla}?${consulta}`);
  if (!r.ok) return [];
  return (await r.json().catch(() => [])) || [];
}

// Donde vive FOREMAN para quien no tiene cuenta. El enlace de conformidad
// tiene que abrirse desde el correo, en el teléfono, sin iniciar sesión.
const APP = process.env.APP_URL || "https://foreman-app-ebon.vercel.app";

const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`)
  .toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");
const esc = t => String(t ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const pausa = ms => new Promise(ok => setTimeout(ok, ms));
const esTope = e => /429|rate|too many/i.test(String(e || ""));

export default async function handler(req, res) {
  try {
    if ((req.body || {}).revisar) return await revisarEntregas(req, res);
    return await mandarLibro(req, res);
  } catch (e) {
    const donde = String(e?.stack || "").split("\n")[1]?.trim().replace(/^at\s+/, "") || "";
    return res.status(500).json({ error: `Se rompió mandando el libro: ${e?.message || e}${donde ? ` (${donde})` : ""}` });
  }
}

/** ¿Llegó? Se le vuelve a preguntar a Resend por los que todavía pueden cambiar. */
async function revisarEntregas(req, res) {
  const leadId = Number((req.body || {}).lead_id);
  if (!leadId) return res.status(400).json({ error: "Falta la obra." });
  // "delivered" no es el final: con el seguimiento de aperturas prendido el
  // estado sigue moviéndose a opened y clicked. Se deja de preguntar solo por
  // los que ya no pueden cambiar.
  const FINALES = ["bounced", "complained", "canceled"];
  const envios = await filas("libro_envios",
    `lead_id=eq.${leadId}&envio_id=not.is.null&select=id,nombre,email,envio_id,envio_estado,conforme_at,observacion`);
  const pendientes = envios.filter(e => !FINALES.includes(String(e.envio_estado || "").toLowerCase())
    && !e.conforme_at && !e.observacion);

  let cambiaron = 0;
  for (const e of pendientes) {
    const estado = await estadoDeCorreo(e.envio_id);
    if (!estado || estado === e.envio_estado) continue;
    await rest(`libro_envios?id=eq.${e.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ envio_estado: estado }),
    });
    e.envio_estado = estado;
    cambiaron++;
  }
  const rebotaron = envios.filter(e => ["bounced", "complained", "failed"].includes(String(e.envio_estado || "").toLowerCase()));
  return res.status(200).json({
    revisados: pendientes.length, cambiaron,
    rebotaron: rebotaron.map(e => e.nombre || e.email),
  });
}

async function mandarLibro(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { lead_id: leadId, desde, hasta, para, adjunto, dias: cuantos, nota, de, quien } = req.body || {};
  if (!leadId) return res.status(400).json({ error: "Falta la obra." });
  if (!configurado()) return res.status(500).json({ error: "Falta la llave de la base en el servidor (SUPABASE_SECRET_KEY)." });
  if (!Array.isArray(para) || !para.length) return res.status(400).json({ error: "No hay a quién mandárselo." });
  // SIN EL PDF NO SE MANDA NADA.
  //
  // El libro ES el adjunto: un correo que dice "acá va el libro" sin el libro
  // adentro es peor que no mandarlo, porque el que lo recibe cree que ya se lo
  // mandaron y no vuelve a pedirlo.
  if (!adjunto?.contenido) return res.status(400).json({ error: "El PDF del libro no llegó al servidor." });

  const lead = (await filas("leads", `id=eq.${leadId}&select=nombre`))[0] || null;
  const obra = lead?.nombre || "Obra";
  const tramo = desde && hasta
    ? (desde === hasta ? `del ${dia(desde)}` : `del ${dia(desde)} al ${dia(hasta)}`)
    : "";
  const asunto = `Libro de obra · ${obra}${tramo ? ` · ${tramo}` : ""}`;
  const adjuntos = [{ filename: adjunto.nombre || `Libro de obra - ${obra}.pdf`, content: adjunto.contenido }];

  // DE A UNO Y CON SU ENLACE. Cada persona recibe el suyo: la conformidad es
  // de alguien, y una llave compartida dejaría que cualquiera dé —o niegue— la
  // de los demás. De paso, nadie ve a quién más se le mandó el libro.
  const envios = [];
  for (const dir of para) {
    const correo = String(dir).trim().toLowerCase();
    if (!correo) continue;
    const token = (randomUUID() + randomUUID()).replace(/-/g, "");
    const fila = (await (await rest("libro_envios", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        lead_id: leadId, desde: desde || null, hasta: hasta || null, dias: cuantos || null,
        email: correo, nombre: (quien || {})[correo] || null, token,
        creado_por: (de || {}).id ?? null, creado_nombre: (de || {}).nombre || null,
      }),
    })).json().catch(() => null))?.[0] || null;

    const enlace = fila?.token ? `${APP}/?libro=${fila.token}` : null;
    const html = plantilla({
      titulo: `Libro de obra · ${obra}`,
      subtitulo: tramo || undefined,
      cuerpo: cuerpoDelCorreo({ obra, tramo, cuantos, nota, enlace }),
    });

    const mandar = () => enviarCorreo({
      to: [correo], subject: asunto, html, adjuntos,
      responderA: (de || {}).email ? [de.email] : null,
    });
    let r = await mandar();
    if (r?.error && esTope(r.error)) { await pausa(1500); r = await mandar(); }

    if (fila?.id) {
      await rest(`libro_envios?id=eq.${fila.id}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          envio_id: r?.id || null,
          envio_estado: r?.error ? "failed" : "sent",
          envio_at: new Date().toISOString(),
        }),
      });
    }
    envios.push({ dir: correo, id: r?.id || null, error: r?.error || null });
    if (para.length > 1) await pausa(550);
  }

  const fallaron = envios.filter(e => e.error);
  return res.status(200).json({
    mandados: envios.length - fallaron.length,
    fallaron: fallaron.map(e => ({ dir: e.dir, error: e.error })),
  });
}

function cuerpoDelCorreo({ obra, tramo, cuantos, nota, enlace }) {
  return `
    <p style="margin:0 0 12px">Va adjunto el <strong>libro de obra de ${esc(obra)}</strong>${tramo ? `, ${esc(tramo)}` : ""}.</p>
    ${cuantos ? `<p style="margin:0 0 12px;color:#6B7280">${esc(String(cuantos))} ${cuantos === 1 ? "día cerrado" : "días cerrados"}, en orden, con lo que se escribió cada día y las fotos de ese día.</p>` : ""}
    ${nota ? `<p style="margin:0 0 12px;white-space:pre-line">${esc(nota)}</p>` : ""}
    ${enlace ? `
    <div style="margin:18px 0;padding:14px 16px;background:#F4F7F6;border:1px solid #CFE0DC;border-radius:8px">
      <div style="font-size:14px;color:#1A1A1A;margin-bottom:10px">
        Cuando lo revises, dejá constancia desde acá. Es tu enlace: no lo reenvíes.
      </div>
      <a href="${enlace}" style="display:inline-block;background:#0F3D3E;color:#fff;text-decoration:none;
        padding:10px 18px;border-radius:7px;font-size:14px;font-weight:700">Dar por revisado el libro</a>
      <div style="font-size:12px;color:#6B7280;margin-top:9px">
        Si algo no coincide con lo que viste en obra, escribilo ahí mismo: queda anotado con tu nombre y la fecha.
      </div>
    </div>` : ""}
    <p style="margin:14px 0 0;color:#6B7280;font-size:12.5px">
      Cada día lo cerró quien lo escribió, y una vez cerrado no se cambia: si hizo falta corregir algo,
      el día dice que fue reabierto y cuándo. Por eso el libro sirve como documento.
    </p>`;
}
