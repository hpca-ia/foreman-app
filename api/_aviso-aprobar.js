// La aprobación, en el correo, con el documento adjunto y dos botones.
//
// Antes esto salía como una tarea más: "Aprobar compra: cemento · Verla en
// FOREMAN →". Para decidir había que abrir la aplicación, acordarse de la
// contraseña, encontrar la solicitud y leer la proforma adentro de un visor.
// El que aprueba casi siempre está caminando por una obra con el teléfono en
// la mano, así que eso se posterga; y mientras se posterga, el material no se
// compra.
//
// Lo que hace falta para decidir viaja con el correo: el resumen en el cuerpo,
// la solicitud en PDF y las proformas adjuntas. Y la decisión es un toque,
// porque el botón abre una página sin login —la misma idea que la orden de
// cambio que aprueba el cliente—.
//
// LA TAREA NO DESAPARECE. Sigue en el tablero y sigue siendo el registro: esto
// es otra manera de contestarla, no un segundo sistema de aprobaciones.
//
// POST { tareaId, adjunto?, conAdjuntos?, okPara?, noPara? }

import { randomUUID } from "crypto";
import { rest, SUPABASE_URL, configurado, sesionValida } from "./_supabase.js";
import { enviarCorreo, plantilla, esc } from "./_correo.js";

const json = async r => (r.ok ? (await r.json().catch(() => [])) || [] : []);
const uno = async (tabla, consulta) => (await json(await rest(`${tabla}?${consulta}`)))[0] || null;
const APP = process.env.APP_URL || "https://foreman-app-ebon.vercel.app";

const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");
const plata = v => `$${(Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** La llave del enlace. Se guarda la primera vez y no cambia: un correo viejo sigue abriendo. */
async function llaveDe(tarea) {
  if (tarea.aprobacion_token) return tarea.aprobacion_token;
  const token = (randomUUID() + randomUUID()).replace(/-/g, "");
  const r = await rest(`tasks?id=eq.${tarea.id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ aprobacion_token: token }),
  });
  if (!r.ok) return null;
  return token;
}

/**
 * Las proformas y los respaldos, adjuntos al correo.
 *
 * Es el documento sobre el que se decide: aprobar un monto sin ver la proforma
 * es firmar lo que alguien dice que dice un papel. Con un techo, porque un
 * correo que no sale por un adjunto pesado es peor que un adjunto que no
 * viaja; lo que no entra se nombra y queda en FOREMAN.
 */
async function bajarAdjuntos(solicitudId, yaUsado = 0) {
  const lista = await json(await rest(`compras_adjuntos?solicitud_id=eq.${solicitudId}&select=*&order=created_at`));
  const llave = process.env.SUPABASE_SECRET_KEY || "";
  const adjuntos = [];
  const afuera = [];
  let usado = yaUsado;
  for (const a of lista) {
    try {
      const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/task-files/${a.storage_path}`,
        { headers: { apikey: llave, ...(llave.startsWith("eyJ") ? { Authorization: `Bearer ${llave}` } : {}) } });
      if (!resp.ok) { afuera.push(a); continue; }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (usado + buf.length > 15 * 1024 * 1024) { afuera.push(a); continue; }
      adjuntos.push({ filename: a.nombre || `${a.tipo || "respaldo"}.pdf`, content: buf.toString("base64") });
      usado += buf.length;
    } catch { afuera.push(a); }
  }
  return { adjuntos, afuera: afuera.map(a => a.nombre || "un respaldo") };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!(await sesionValida(req))) return res.status(401).json({ error: "Tu sesión venció. Vuelve a entrar a FOREMAN." });
  if (!configurado()) return res.status(500).json({ error: "Falta la llave de la base en el servidor." });

  const { tareaId, adjunto, conAdjuntos = true, okPara, noPara } = req.body || {};
  if (!tareaId) return res.status(400).json({ error: "Falta la tarea" });

  try {
    const tarea = await uno("tasks", `id=eq.${Number(tareaId)}&select=*`);
    if (!tarea) return res.status(404).json({ error: "No se encontró la tarea" });
    if (!tarea.assignee_id) return res.status(200).json({ ok: false, error: "La aprobación no tiene a quién pedírsela." });

    const quien = await uno("usuarios", `id=eq.${tarea.assignee_id}&select=nombre,email,activo`);
    if (!quien?.email || quien.activo === false) return res.status(200).json({ ok: false, error: "Quien tiene que aprobar no tiene correo cargado." });

    // A QUIÉN LE TOCA DESPUÉS, resuelto por la pantalla que manda el pedido.
    // Acá no se decide: se guarda, y el servidor lo ejecuta cuando esta
    // persona aprueba o devuelve desde el correo.
    if (okPara || noPara) {
      await rest(`tasks?id=eq.${tarea.id}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          ...(okPara ? { aprob_ok_para: Number(okPara) } : {}),
          ...(noPara ? { aprob_no_para: Number(noPara) } : {}),
        }),
      }).catch(() => {});
    }

    const token = await llaveDe(tarea);
    if (!token) return res.status(500).json({ error: "Falta correr la migración 132: la tarea no puede guardar su enlace de aprobación." });

    const compra = tarea.compra_id
      ? await uno("compras_solicitudes", `id=eq.${tarea.compra_id}&select=*`) : null;
    const obra = compra?.lead_id ? (await uno("leads", `id=eq.${compra.lead_id}&select=nombre`))?.nombre : null;
    const pidio = compra?.solicitante_nombre
      || (tarea.created_by ? (await uno("usuarios", `id=eq.${tarea.created_by}&select=nombre,email`))?.nombre : null);

    // El PDF lo arma el navegador y viaja en el pedido: acá no hay librería de
    // PDF, y poner una sería mantener dos veces el mismo documento.
    const adjuntos = adjunto?.contenido
      ? [{ filename: adjunto.nombre || "Solicitud de compra.pdf", content: adjunto.contenido }] : [];
    let afuera = [];
    if (compra && conAdjuntos) {
      const r = await bajarAdjuntos(compra.id, (adjunto?.contenido?.length || 0) * 0.75);
      adjuntos.push(...r.adjuntos);
      afuera = r.afuera;
    }

    const ver = `${APP}/?aprobar=${token}`;
    const fila = (k, v) => v ? `<tr><td style="padding:4px 10px 4px 0;font-size:12.5px;color:#6B7280;white-space:nowrap">${esc(k)}</td>
      <td style="padding:4px 0;font-size:13.5px;color:#111827">${v}</td></tr>` : "";

    const html = plantilla({
      titulo: compra ? `Aprobar la compra: ${compra.descripcion}` : tarea.title,
      subtitulo: [obra, compra?.urgente ? "URGENTE" : null].filter(Boolean).join(" · ") || undefined,
      cuerpo: `
        ${/* LO QUE SE LE PIDE, ARRIBA. Quien abre esto desde el correo quiere
             saber en dos segundos qué tiene que hacer. */ ""}
        <div style="margin:0 0 16px;padding:14px 16px;background:#F4F7F6;border:1px solid #CFE0DC;border-radius:8px">
          <div style="font-size:13.5px;color:#111827;line-height:1.5;margin-bottom:11px">
            ${compra ? "Esta compra espera tu visto." : "Esto espera tu aprobación."}
            Está todo en el adjunto: podés leerlo acá en el teléfono y decidir con un toque.
          </div>
          <a href="${ver}" style="display:inline-block;background:#0F3D3E;color:#fff;text-decoration:none;
            font-size:14px;font-weight:700;padding:11px 20px;border-radius:7px">Aprobar</a>
          <a href="${ver}&d=1" style="display:inline-block;margin-left:8px;background:#fff;color:#92400E;
            text-decoration:none;font-size:14px;font-weight:700;padding:10px 18px;border-radius:7px;border:1px solid #FCD34D">Devolver</a>
          <div style="font-size:11px;color:#777;margin-top:9px">
            Queda registrado con tu nombre, la fecha y desde dónde. El enlace es tuyo, no lo reenvíes.
          </div>
        </div>

        <table style="border-collapse:collapse">
          ${fila("Qué", esc(compra?.descripcion || tarea.title))}
          ${fila("Para qué", esc(compra?.justificacion))}
          ${fila("Dónde va", esc(compra?.destino || compra?.capitulo))}
          ${fila("Monto estimado", compra?.monto_estimado ? `<strong>${plata(compra.monto_estimado)}</strong>` : "")}
          ${fila("La pidió", esc(pidio))}
          ${fila("Se necesita para", compra?.necesita_para ? dia(compra.necesita_para) : (tarea.due_date ? dia(tarea.due_date) : ""))}
          ${fila("Proyecto", esc(obra))}
        </table>

        ${adjuntos.length ? `<p style="margin:16px 0 0;font-size:12.5px;color:#6B7280">
          Adjunto: ${adjuntos.map(a => esc(a.filename)).join(" · ")}</p>` : ""}
        ${afuera.length ? `<p style="margin:6px 0 0;font-size:12.5px;color:#92400E">
          No entraron por tamaño: ${afuera.map(esc).join(", ")}. Están en FOREMAN.</p>` : ""}`,
      pie: "Si preferís verlo en FOREMAN, la tarea sigue en tu tablero. "
        + "Correo automático de FOREMAN · HCA Studio.",
    });

    const dePidio = compra?.solicitante_id
      ? (await uno("usuarios", `id=eq.${compra.solicitante_id}&select=email`))?.email : null;

    const r = await enviarCorreo({
      to: [quien.email], subject: `${compra?.urgente ? "URGENTE · " : ""}Aprobar: ${compra?.descripcion || tarea.title}${obra ? ` · ${obra}` : ""}`,
      html, adjuntos,
      // La respuesta le llega a quien lo pidió: "¿esto incluye el flete?" no
      // puede terminar en la casilla de avisos.
      responderA: dePidio ? [dePidio] : null,
    });
    if (r?.error) return res.status(200).json({ ok: false, error: r.error });

    await rest(`tasks?id=eq.${tarea.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ aprobacion_envio_at: new Date().toISOString() }),
    }).catch(() => {});
    return res.status(200).json({ ok: true, enviadoA: quien.nombre, conAdjuntos: adjuntos.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
