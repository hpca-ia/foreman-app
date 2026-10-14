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

import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { enviarCorreo, plantilla, estadoDeCorreo } from "./_correo.js";

const URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY;

// Donde vive FOREMAN para quien no tiene cuenta. El enlace de conformidad
// tiene que abrirse desde el correo, en el teléfono, sin iniciar sesión.
const APP = process.env.APP_URL || "https://foreman-app-ebon.vercel.app";

const dia = f => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");
const esc = t => String(t ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

/**
 * QUE EL ERROR LLEGUE A LA PANTALLA.
 *
 * Cualquier cosa que se lance acá adentro sin atajar termina en un 500 que no
 * devuelve JSON, y del otro lado queda "No se pudo enviar el acta" a secas:
 * no se puede ni contar ni arreglar, y manda a adivinar. Si algo se rompe, lo
 * que se rompió se dice, con la línea donde pasó.
 */
export default async function handler(req, res) {
  try {
    return await mandarActa(req, res);
  } catch (e) {
    const donde = String(e?.stack || "").split("\n")[1]?.trim().replace(/^at\s+/, "") || "";
    return res.status(500).json({ error: `Se rompió mandando el acta: ${e?.message || e}${donde ? ` (${donde})` : ""}` });
  }
}

async function mandarActa(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { acta_id: actaId, para, adjunto, conAnexos, prueba } = req.body || {};
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

  // LOS ANEXOS VIAJAN CON EL CORREO.
  //
  // Quien recibe el acta no tiene cuenta en FOREMAN —es el cliente, la
  // fiscalización, un contratista— así que un enlace al sistema es un enlace
  // que no puede abrir. El plano sobre el que se decidió tiene que llegarle.
  //
  // Con un techo: Resend no acepta un correo de cualquier tamaño, y un acta
  // que no sale por culpa de un anexo pesado es peor que un anexo que no
  // viaja. Lo que no entra se nombra en el cuerpo y queda en FOREMAN.
  const anexos = [];
  const afuera = [];
  if (conAnexos) {
    const { data: lista } = await db.from("acta_adjuntos").select("*").eq("acta_id", actaId).order("orden");
    let usado = (adjunto?.contenido?.length || 0) * 0.75;
    for (const a of lista || []) {
      const peso = Number(a.bytes) || 0;
      if (usado + peso > 18 * 1024 * 1024) { afuera.push(a); continue; }
      try {
        const { data: blob, error } = await db.storage.from("task-files").download(a.storage_path);
        if (error || !blob) { afuera.push(a); continue; }
        const buf = Buffer.from(await blob.arrayBuffer());
        anexos.push({ filename: a.nombre, content: buf.toString("base64") });
        usado += buf.length;
      } catch { afuera.push(a); }
    }
  }

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

  // ── EL ENLACE DE CONFORMIDAD, UNO POR PERSONA ────────────────────────────
  //
  // Lo que convierte un envío en una firma. Hoy el que está de acuerdo no hace
  // nada, y el silencio no se distingue de "no la leyó": tres meses después
  // "se la mandamos" no prueba nada.
  //
  // Es una llave por asistente, no una por acta: si fuera una sola, cualquiera
  // de los ocho podría dar la conformidad de los otros siete —o negarla— y la
  // firma no valdría para nada. Se guarda la primera vez que se manda y no
  // cambia, así el enlace de un correo viejo sigue abriendo.
  async function llaveDe(a) {
    if (a.token) return a.token;
    const token = (randomUUID() + randomUUID()).replace(/-/g, "");
    const { error } = await db.from("acta_asistentes").update({ token }).eq("id", a.id);
    if (error) return null;
    a.token = token;
    return token;
  }

  const porCorreo = new Map();
  for (const a of asistentes || []) {
    const e = String(a.email || "").trim().toLowerCase();
    if (e && !porCorreo.has(e)) porCorreo.set(e, a);
  }

  const firma = (a, ejemplo) => {
    if (!a?.token) return "";
    const url = `${APP}/?acta=${a.token}`;
    return `
    <div style="margin:0 0 18px;padding:14px 16px;background:#F4F7F6;border:1px solid #CFE0DC;border-radius:8px">
      ${ejemplo ? `<div style="font-size:11.5px;color:#92400E;font-weight:700;margin-bottom:6px">PRUEBA · este es el enlace de ${esc(a.nombre)}, así le llega a cada uno</div>` : ""}
      <div style="font-size:13.5px;color:#1A1A1A;line-height:1.5;margin-bottom:10px">
        ${ejemplo ? "" : `<strong>${esc(a.nombre)}</strong>: `}Si el acta refleja lo acordado, dejalo registrado con un toque.
        Si algo no está bien, escribilo ahí mismo: queda como constancia y se trata en la próxima reunión.
      </div>
      <a href="${url}" style="display:inline-block;background:#0F3D3E;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:11px 20px;border-radius:7px">Ver el acta y dar conformidad</a>
      <div style="font-size:11px;color:#777;margin-top:8px">Este enlace es tuyo: registra tu conformidad con tu nombre y la fecha. No lo reenvíes.</div>
    </div>`;
  };

  const cuerpo = enlaceFirma => `
    ${enlaceFirma}
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

    ${anexos.length || afuera.length ? `<h3 style="margin:20px 0 6px;font-size:13px;color:#555;letter-spacing:.3px">ANEXOS</h3>
      <p style="margin:0;font-size:13px;color:#1A1A1A;line-height:1.6">
        ${anexos.map(a => `· ${esc(a.filename)}`).join("<br>")}
        ${afuera.length ? `<br><span style="color:#92400E">No entraron en este correo por tamaño: ${afuera.map(a => esc(a.nombre)).join(", ")}. Pedilos y te los mandamos aparte.</span>` : ""}
      </p>` : ""}

    ${acta.proxima_fecha ? `<p style="margin:20px 0 0;font-size:13px;color:#1A1A1A">
      <strong>Próxima reunión:</strong> ${dia(acta.proxima_fecha)}${acta.proxima_hora ? ` a las ${acta.proxima_hora.slice(0, 5)}` : ""}</p>` : ""}
  `;

  const html = enlaceFirma => plantilla({
    titulo: `Acta de reunión N° ${acta.numero}`,
    subtitulo: lead?.nombre || "",
    cuerpo: cuerpo(enlaceFirma),
    // El pie de siempre no sirve acá: esto va a gente de afuera, y lo que
    // necesitan saber es que si algo quedó mal escrito hay que decirlo ahora.
    // El pie de siempre dice "no respondas, nadie lo lee", y acá es al revés:
    // la respuesta es la única manera que tiene alguien de dejar constancia de
    // que no estuvo de acuerdo. Las dos frases juntas se contradicen, y la que
    // vale es ésta.
    pie: "Si algo de esta acta no refleja lo acordado, decilo dentro de las próximas 48 horas: por el enlace de arriba, "
      + "o respondiendo este correo —la respuesta les llega a quien la escribió y a quien la aprobó—. "
      + "En los dos casos queda como constancia. Pasado ese plazo se da por aceptada. "
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
    // `usuarios`, no `users`: la tabla se llama así y la consulta fallaba en
    // silencio, así que el acta salía sin responderA y "respondé este correo"
    // era una invitación al vacío. Lo que se perdía no era un correo: era la
    // objeción de alguien que no estuvo de acuerdo.
    const { data: u } = await db.from("usuarios").select("email").eq("id", id).maybeSingle();
    const e = String(u?.email || "").trim().toLowerCase();
    if (e && !responderA.includes(e)) responderA.push(e);
  }

  // ── UN CORREO POR PERSONA ────────────────────────────────────────────────
  //
  // Antes salía uno solo con las ocho direcciones en el Para. Ya no se puede:
  // el enlace de conformidad es personal, y mandarlos todos juntos sería darle
  // a cada uno la llave de los otros siete.
  //
  // Sale con lo mismo para todos —el acta en el cuerpo, el PDF y los anexos
  // adjuntos— y cambia solo el bloque de la firma. De paso, un rebote queda
  // atado a una dirección: se sabe a quién no le llegó, no que "algo falló".
  const adjuntosDelCorreo = [
    // El PDF lo arma el navegador y viaja en el pedido: acá no hay librería de
    // PDF ni las fotos firmadas, y poner una sería mantener dos veces el mismo
    // documento.
    ...(adjunto?.contenido ? [{ filename: adjunto.nombre || `Acta ${acta.numero}.pdf`, content: adjunto.contenido }] : []),
    ...anexos,
  ];
  // La prueba se marca en el asunto: dos correos iguales en la bandeja, uno
  // de ensayo y otro de verdad, se confunden en cinco minutos.
  const asunto = `${prueba ? "[PRUEBA] " : ""}Acta de reunión N° ${acta.numero} · ${lead?.nombre || "Obra"} · ${dia(acta.fecha)}`;

  // En una prueba, el que la pide suele no estar en la lista de asistentes con
  // ese correo —se la manda a su casilla para ver cómo sale—. Igual tiene que
  // poder abrir el enlace y apretar el botón: un ensayo que no prueba lo único
  // nuevo no prueba nada. Va el de la primera persona, dicho con todas las
  // letras.
  const primero = [...porCorreo.values()][0] || (asistentes || [])[0] || null;

  // DE A UNO Y CON UNA PAUSA. Resend acepta dos pedidos por segundo: catorce
  // asistentes mandados de corrido chocan contra ese techo y los últimos
  // vuelven con 429. Visto desde la pantalla eso sería "el acta salió a doce
  // de catorce" sin ninguna razón entendible, así que se espera y, si igual
  // choca, se reintenta una vez.
  const pausa = ms => new Promise(ok => setTimeout(ok, ms));
  const esTope = e => /429|rate|too many/i.test(String(e || ""));

  const envios = [];
  for (const dir of para) {
    const quien = porCorreo.get(String(dir).trim().toLowerCase());
    const suyo = quien || (prueba ? primero : null);
    const bloque = suyo ? firma(Object.assign(suyo, { token: await llaveDe(suyo) }), !quien) : "";
    const mandar = () => enviarCorreo({
      to: [dir], responderA: responderA.length ? responderA : null,
      adjuntos: adjuntosDelCorreo, subject: asunto, html: html(bloque),
    });
    let r = await mandar();
    if (r?.error && esTope(r.error)) { await pausa(1500); r = await mandar(); }
    envios.push({ dir, id: r?.id || null, error: r?.error || null });
    if (para.length > 1) await pausa(550);
  }

  // QUÉ PASÓ DE VERDAD CON CADA CORREO.
  //
  // Resend devuelve un identificador y un 200 aunque el correo NO vaya a
  // salir: si la dirección está en su lista de suprimidos —porque rebotó
  // alguna vez, o porque alguien marcó un aviso como spam— acepta el pedido y
  // después lo descarta. Visto desde acá, un envío que nunca ocurre se ve
  // idéntico a uno entregado, y el acta queda marcada como enviada a gente que
  // nunca la recibió.
  //
  // Se espera un momento y se pregunta por todos a la vez. Si volvió "bounced"
  // o "complained", eso se dice: es la diferencia entre "no me llegó" y "no te
  // llegó porque tu casilla rechazó el correo en marzo y Resend no lo intenta
  // más".
  const MALOS = ["bounced", "complained", "failed", "delivery_delayed"];
  if (envios.some(e => e.id)) await new Promise(ok => setTimeout(ok, 1200));
  await Promise.all(envios.map(async e => {
    e.estado = e.id ? await estadoDeCorreo(e.id) : null;
    e.malo = !!e.error || MALOS.includes(String(e.estado || "").toLowerCase());
  }));

  const fallaron = envios.filter(e => e.malo);
  const salieron = envios.filter(e => !e.malo).map(e => e.dir);
  const porQue = e => e.error || `el servidor de correo dice "${e.estado}"`;
  const explicacion = fallaron.length
    ? `No salió a ${fallaron.map(e => `${e.dir} (${porQue(e)})`).join(", ")}.`
      + " Una dirección que rebotó antes, o de alguien que marcó un aviso como spam,"
      + " queda en la lista de suprimidos de Resend y hay que sacarla desde su panel."
    : null;

  // Todas mal es un error: el acta no se mandó y no puede quedar marcada como
  // enviada. Algunas mal es otra cosa: la mayoría la tiene, y lo que hace
  // falta es saber a quién hay que buscar por otro lado.
  if (!salieron.length) return res.status(502).json({ error: explicacion || "No se pudo enviar el acta." });
  return res.status(200).json({
    enviados: salieron.length, entregados: salieron,
    estado: envios[0]?.estado || null, id: envios[0]?.id || null,
    ...(explicacion ? { aviso: explicacion, fallaron: fallaron.map(e => e.dir) } : {}),
  });
}
