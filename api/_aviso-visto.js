// El acta, al que le tiene que dar el visto.
//
// "Pedir el visto" dejaba el acta en estado `lista` y no avisaba a nadie: el
// director se enteraba porque el residente se acordaba de escribirle por
// WhatsApp. Un acta que espera tres días por un visto es un acta que llega
// tarde, y lo que se decidió en la reunión queda sin constancia mientras tanto.
//
// Así que el acta sale por correo, entera y en PDF, a quien puede aprobarla, y
// la aprueba desde ahí: en el teléfono, sin entrar a FOREMAN. Y desde la misma
// página, una vez aprobada, la manda a los involucrados — que es el paso que
// venía después y por el que había que volver a la computadora.
//
// POST { acta_id, adjunto, pdf_path }

import { randomUUID } from "crypto";
import { rest, configurado, sesionValida } from "./_supabase.js";
import { enviarCorreo, plantilla, esc } from "./_correo.js";

const json = async r => (r.ok ? (await r.json().catch(() => [])) || [] : []);
const uno = async (tabla, consulta) => (await json(await rest(`${tabla}?${consulta}`)))[0] || null;
const APP = process.env.APP_URL || "https://foreman-app-ebon.vercel.app";
const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");

/**
 * QUIÉN PUEDE DAR EL VISTO, según los permisos de verdad.
 *
 * No una lista de roles escrita acá: la que el Director maneja con los
 * interruptores de Ajustes, que es `permisos_rol`. Si mañana le da el visto a
 * los arquitectos, el correo les llega sin tocar una línea.
 *
 * El owner siempre está: si dependiera de sus propios permisos, un error de
 * edición dejaría al acta sin nadie que la apruebe.
 */
export async function quienesDanElVisto() {
  const guardados = await json(await rest("permisos_rol?permiso=eq.actas.aprobar&select=rol,activo"));
  const puede = new Set(guardados.filter(x => x.activo).map(x => x.rol));
  // Sin fila guardada vale lo de fábrica: el gerente aprueba (src/lib/permisos.js).
  if (!guardados.length) puede.add("gerente");
  puede.add("owner");
  const todos = await json(await rest("usuarios?activo=eq.true&select=id,nombre,email,rol"));
  return todos.filter(u => puede.has(u.rol) && String(u.email || "").trim());
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!(await sesionValida(req))) return res.status(401).json({ error: "Tu sesión venció. Vuelve a entrar a FOREMAN." });
  if (!configurado()) return res.status(500).json({ error: "Falta la llave de la base en el servidor." });

  const { acta_id: actaId, adjunto, pdf_path: pdfPath } = req.body || {};
  const id = Number(actaId);
  if (!id) return res.status(400).json({ error: "Falta el acta." });

  try {
    const acta = await uno("obra_actas", `id=eq.${id}&select=*`);
    if (!acta) return res.status(404).json({ error: "No encontré el acta." });

    const [lead, asistentes, temas, compromisos] = await Promise.all([
      acta.lead_id ? uno("leads", `id=eq.${acta.lead_id}&select=nombre`) : null,
      json(await rest(`acta_asistentes?acta_id=eq.${id}&select=nombre,email,recibe,asistio`)),
      json(await rest(`acta_temas?acta_id=eq.${id}&select=id,titulo,resuelto`)),
      json(await rest(`acta_compromisos?acta_id=eq.${id}&select=id,texto,estado,asignado_a,responsable_nombre,viene_de`)),
    ]);

    const quienes = await quienesDanElVisto();
    if (!quienes.length) return res.status(200).json({ ok: false, error: "Nadie tiene el permiso de dar el visto a un acta, o falta un correo cargado." });

    // La llave se guarda la primera vez y no cambia: un correo viejo sigue
    // abriendo, que es lo que uno quiere cuando el acta se pide dos veces.
    const token = acta.visto_token || (randomUUID() + randomUUID()).replace(/-/g, "");
    const r = await rest(`obra_actas?id=eq.${id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        visto_token: token, visto_pedido_at: new Date().toISOString(), visto_nota: null,
        ...(pdfPath ? { pdf_path: pdfPath } : {}),
      }),
    });
    if (!r.ok) return res.status(500).json({ error: "Falta correr la migración 132: el acta no puede guardar su enlace para el visto." });

    const escribio = acta.creado_nombre
      || (acta.creado_por ? (await uno("usuarios", `id=eq.${acta.creado_por}&select=nombre`))?.nombre : null);
    const deQuien = acta.creado_por ? (await uno("usuarios", `id=eq.${acta.creado_por}&select=email`))?.email : null;

    const vivos = (compromisos || []).filter(c => c.estado !== "anulado");
    const nuevos = vivos.filter(c => !c.viene_de);
    const conTarea = nuevos.filter(c => c.asignado_a).length;
    const recibirian = (asistentes || []).filter(a => a.recibe !== false && String(a.email || "").trim()).length;
    const sinResolver = (temas || []).filter(t => !String(t.resuelto || "").trim()).length;

    const ver = `${APP}/?visto=${token}`;
    const html = plantilla({
      titulo: `Dar el visto · Acta N° ${acta.numero}`,
      subtitulo: [lead?.nombre, dia(acta.fecha)].filter(Boolean).join(" · ") || undefined,
      cuerpo: `
        <div style="margin:0 0 16px;padding:14px 16px;background:#F4F7F6;border:1px solid #CFE0DC;border-radius:8px">
          <div style="font-size:13.5px;color:#111827;line-height:1.5;margin-bottom:11px">
            ${esc(escribio || "El residente")} terminó el acta y pide tu visto.
            Va completa en el PDF adjunto: leela acá y decidí.
            ${recibirian ? `Al darle el visto podés mandarla a los ${recibirian} involucrados desde la misma página.` : ""}
          </div>
          <a href="${ver}" style="display:inline-block;background:#0F3D3E;color:#fff;text-decoration:none;
            font-size:14px;font-weight:700;padding:11px 20px;border-radius:7px">Dar el visto</a>
          <a href="${ver}&d=1" style="display:inline-block;margin-left:8px;background:#fff;color:#92400E;
            text-decoration:none;font-size:14px;font-weight:700;padding:10px 18px;border-radius:7px;border:1px solid #FCD34D">Devolver</a>
          <div style="font-size:11px;color:#777;margin-top:9px">
            Nada sale a los asistentes hasta que vos lo mandes.
          </div>
        </div>

        <table style="border-collapse:collapse;font-size:13.5px;color:#111827">
          <tr><td style="padding:3px 12px 3px 0;color:#6B7280">Reunión</td><td>${dia(acta.fecha)}${acta.lugar ? ` · ${esc(acta.lugar)}` : ""}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#6B7280">Asistieron</td><td>${(asistentes || []).filter(a => a.asistio).length} de ${(asistentes || []).length}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#6B7280">Temas</td><td>${(temas || []).length}${sinResolver ? ` · <span style="color:#92400E">${sinResolver} sin resolución escrita</span>` : ""}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#6B7280">Compromisos nuevos</td><td>${nuevos.length}${conTarea ? ` · ${conTarea} se van a convertir en tareas del equipo` : ""}</td></tr>
        </table>

        ${nuevos.length ? `<h3 style="margin:18px 0 6px;font-size:12px;color:#6B7280;letter-spacing:.3px">LO QUE SE COMPROMETIÓ</h3>
          <p style="margin:0;font-size:13px;color:#111827;line-height:1.7">
            ${nuevos.slice(0, 8).map(c => `· ${esc(c.texto)}${c.responsable_nombre ? ` <span style="color:#6B7280">(${esc(c.responsable_nombre)})</span>` : ""}`).join("<br>")}
            ${nuevos.length > 8 ? `<br><span style="color:#6B7280">y ${nuevos.length - 8} más en el PDF</span>` : ""}
          </p>` : ""}`,
      pie: "Al dar el visto se crean las tareas de los compromisos asignados y el acta queda lista para enviar. "
        + "Correo automático de FOREMAN · HCA Studio.",
    });

    const adjuntos = adjunto?.contenido
      ? [{ filename: adjunto.nombre || `Acta ${acta.numero}.pdf`, content: adjunto.contenido }] : [];

    const pausa = ms => new Promise(ok => setTimeout(ok, ms));
    const salieron = [];
    const fallaron = [];
    for (const u of quienes) {
      const envio = await enviarCorreo({
        to: [u.email], subject: `Tu visto · Acta N° ${acta.numero}${lead?.nombre ? ` · ${lead.nombre}` : ""}`,
        html, adjuntos, responderA: deQuien ? [deQuien] : null,
      });
      if (envio?.error) fallaron.push({ dir: u.email, error: envio.error });
      else salieron.push(u.nombre || u.email);
      if (quienes.length > 1) await pausa(550);
    }
    if (!salieron.length) return res.status(200).json({ ok: false, error: fallaron[0]?.error || "No se pudo mandar el pedido de visto." });
    return res.status(200).json({ ok: true, enviadoA: salieron, fallaron });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
