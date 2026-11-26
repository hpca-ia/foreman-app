// api/_aviso-presupuesto.js — Avisarle al cliente que tiene el presupuesto para revisar y aprobar.
//
// Hernán, 17/11/2026: «cada vez que se solicite una aprobación FOREMAN manda
// un mensaje al cliente». Compartirle el presupuesto y su comparativa
// (migración 196) es pedirle una aprobación más, y un enlace hay que acordarse
// de abrirlo: esto se lo dice por correo, con el botón para entrar.
//
// Sale cuando alguien del equipo lo pide y a quien elige. A quién se le avisó
// queda en el pedido del registro de aprobaciones y en la historia del
// proyecto, igual que con un punto del checklist (api/_aviso-pedido.js).
//
// Por WhatsApp desde el número de FOREMAN todavía no sale: la pantalla arma el
// mensaje y abre el WhatsApp de quien lo pide.
//
// POST { leadId, pedidoId, correos: [correo], mensaje, quien }

import { rest, sesionValida } from "./_supabase.js";
import { enviarCorreo, plantilla } from "./_correo.js";
import { correoDelPedido } from "./_listaDelCliente.js";

const APP = process.env.APP_URL || "https://foreman-app-ebon.vercel.app";
const esCorreo = c => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c || "").trim());
const crudo = async r => { try { return await r.json(); } catch { return null; } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!(await sesionValida(req))) return res.status(401).json({ error: "Tu sesión venció. Vuelve a entrar a FOREMAN." });

  const { leadId, pedidoId, correos = [], mensaje = "", quien = null } = req.body || {};
  if (!leadId || !pedidoId) return res.status(400).json({ error: "Falta el presupuesto que tiene que aprobar." });

  try {
    const leads = await crudo(await rest(`leads?id=eq.${Number(leadId)}&select=id,nombre,portal_token,portal_activo`));
    const lead = Array.isArray(leads) ? leads[0] : null;
    if (!lead) return res.status(404).json({ error: "No se encontró el proyecto." });
    // Sin su enlace no tiene dónde verlo: no se le manda un correo que no lleva a ningún lado.
    if (!lead.portal_activo || !lead.portal_token) {
      return res.status(200).json({ ok: false, error: "El enlace del cliente está apagado: prendelo en la ficha del proyecto, al pie del checklist, para que tenga dónde verlo." });
    }

    const pedidos = await crudo(await rest(
      `aprobaciones_cliente?id=eq.${Number(pedidoId)}&lead_id=eq.${lead.id}&presupuesto_compartido_id=not.is.null`
      + `&select=id,titulo,descripcion,respuesta,retirada_at,avisos,vence_el`));
    const pedido = Array.isArray(pedidos) ? pedidos[0] : null;
    if (!pedido) return res.status(404).json({ error: "No se encontró ese presupuesto compartido." });
    if (pedido.retirada_at) return res.status(200).json({ ok: false, error: "Ese presupuesto ya no está compartido: compartilo de nuevo antes de avisarle." });
    if (pedido.respuesta) return res.status(200).json({ ok: false, error: "El cliente ya contestó. Para que apruebe otra vez, compartilo de nuevo." });

    const para = [...new Set([].concat(correos || []).map(c => String(c || "").trim().toLowerCase()).filter(esCorreo))];
    if (!para.length) return res.status(200).json({ ok: false, error: "Elegí a quién avisarle: nadie de los elegidos tiene un correo válido." });

    const { asunto, cuerpo } = correoDelPedido({
      proyecto: lead.nombre, punto: pedido.titulo, descripcion: "Te compartimos el presupuesto del proyecto para que lo revises.",
      archivos: [], mensaje, enlace: `${APP}/?cliente=${lead.portal_token}`, hasta: pedido.vence_el || null,
    });
    const r = await enviarCorreo({
      to: para, subject: asunto,
      html: plantilla({ titulo: lead.nombre, subtitulo: "Para tu aprobación", cuerpo }),
      // Si contesta el correo, que le llegue a quien se lo pidió y no a la casilla de avisos.
      responderA: esCorreo(quien?.email) ? [quien.email] : null,
    });
    if (!r.ok) return res.status(200).json({ ok: false, error: r.error || "No se pudo mandar el correo." });

    // A quién se le avisó queda en el pedido y en la historia del proyecto. Si esto falla, el aviso ya salió.
    const cuando = new Date().toISOString();
    try {
      const avisos = [...(Array.isArray(pedido.avisos) ? pedido.avisos : []), { correos: para, cuando, quien: quien?.name || null }];
      await rest(`aprobaciones_cliente?id=eq.${pedido.id}`, { method: "PATCH", body: JSON.stringify({ avisos }) });
      await rest("lead_movimientos", {
        method: "POST",
        body: JSON.stringify({
          lead_id: lead.id, tipo: "nota", automatico: true, autor_id: quien?.id ?? null, autor_nombre: quien?.name ?? null,
          detalle: `Le avisó por correo a ${para.join(", ")} que revise y apruebe "${pedido.titulo}"`,
        }),
      });
    } catch (e) {
      console.error("[aviso-presupuesto] el aviso salió, pero no se pudo anotar:", e.message);
    }
    return res.status(200).json({ ok: true, enviadoA: para });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
