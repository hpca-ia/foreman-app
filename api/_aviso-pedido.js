// api/_aviso-pedido.js — Avisarle al cliente que tiene algo para aprobar.
//
// Hernán, 17/11/2026: «cada vez que se solicite una aprobación FOREMAN manda
// un mensaje al cliente». Pedirle la aprobación de un punto lo deja esperando
// en su enlace, pero un enlace hay que acordarse de abrirlo: esto se lo dice
// por correo, con qué tiene que revisar y el botón para entrar a aprobar.
//
// Sale cuando alguien del equipo lo pide y a quien elige —al pedir la
// aprobación, o después con «Avisarle de nuevo»—. A quién se le avisó queda
// en el registro de aprobaciones y en el historial del punto.
//
// Por WhatsApp todavía no sale solo: el número de FOREMAN no está configurado
// en Meta, y para escribirle primero a un cliente hace falta además una
// plantilla aprobada. Mientras tanto la pantalla arma el mensaje y abre el
// WhatsApp de quien lo pide.
//
// POST { leadId, taskId, correos: [correo], mensaje, quien }

import { rest, sesionValida } from "./_supabase.js";
import { enviarCorreo, plantilla } from "./_correo.js";
import { correoDelPedido } from "./_listaDelCliente.js";

const APP = process.env.APP_URL || "https://foreman-app-ebon.vercel.app";
const esCorreo = c => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c || "").trim());
// La respuesta tal cual: una lista son filas; un objeto es el error de la base.
const crudo = async r => { try { return await r.json(); } catch { return null; } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!(await sesionValida(req))) return res.status(401).json({ error: "Tu sesión venció. Vuelve a entrar a FOREMAN." });

  const { leadId, taskId, correos = [], mensaje = "", quien = null } = req.body || {};
  if (!leadId || !taskId) return res.status(400).json({ error: "Falta el punto que tiene que aprobar." });

  try {
    const leads = await crudo(await rest(`leads?id=eq.${Number(leadId)}&select=id,nombre,portal_token,portal_activo`));
    const lead = Array.isArray(leads) ? leads[0] : null;
    if (!lead) return res.status(404).json({ error: "No se encontró el proyecto." });
    // Sin su enlace no tiene dónde aprobar: no se le manda un correo que no lleva a ningún lado.
    if (!lead.portal_activo || !lead.portal_token) {
      return res.status(200).json({ ok: false, error: "El enlace del cliente está apagado: prendelo, al pie del checklist, para que tenga dónde aprobar." });
    }

    // Con la fecha límite, si la migración 188 ya está; si no, sin ella.
    const deLaTarea = `tasks?id=eq.${Number(taskId)}&lead_id=eq.${lead.id}&select=id,title,visible_cliente,cliente_aprueba,cliente_respuesta,cliente_descripcion`;
    let tareas = await crudo(await rest(`${deLaTarea},cliente_aprueba_hasta`));
    if (!Array.isArray(tareas)) tareas = await crudo(await rest(deLaTarea));
    const tarea = Array.isArray(tareas) ? tareas[0] : null;
    if (!tarea) return res.status(404).json({ error: "No se encontró ese punto." });
    if (tarea.visible_cliente !== true) return res.status(200).json({ ok: false, error: "El cliente no ve ese punto: mostráselo antes de avisarle." });
    if (tarea.cliente_aprueba !== true) return res.status(200).json({ ok: false, error: "A ese punto no se le pidió la aprobación." });
    if (tarea.cliente_respuesta) return res.status(200).json({ ok: false, error: "El cliente ya contestó ese punto. Para que apruebe otra vez, volvé a pedírselo." });

    const para = [...new Set([].concat(correos || []).map(c => String(c || "").trim().toLowerCase()).filter(esCorreo))];
    if (!para.length) return res.status(200).json({ ok: false, error: "Elegí a quién avisarle: nadie de los elegidos tiene un correo válido." });

    // Lo que tiene para revisar en ese punto: los nombres, para que sepa a qué entra.
    const suyos = await crudo(await rest(
      `proyecto_archivos?lead_id=eq.${lead.id}&task_id=eq.${tarea.id}&visible_cliente=eq.true&select=nombre&order=created_at`));

    const { asunto, cuerpo } = correoDelPedido({
      proyecto: lead.nombre, punto: tarea.title, descripcion: tarea.cliente_descripcion,
      archivos: (Array.isArray(suyos) ? suyos : []).map(a => a.nombre), mensaje,
      enlace: `${APP}/?cliente=${lead.portal_token}`, hasta: tarea.cliente_aprueba_hasta || null,
    });
    const r = await enviarCorreo({
      to: para, subject: asunto,
      html: plantilla({ titulo: lead.nombre, subtitulo: "Para tu aprobación", cuerpo }),
      // Si contesta el correo, que le llegue a quien se lo pidió y no a la casilla de avisos.
      responderA: esCorreo(quien?.email) ? [quien.email] : null,
    });
    if (!r.ok) return res.status(200).json({ ok: false, error: r.error });

    // A quién se le avisó queda en el pedido abierto del registro (migración
    // 187) y en el historial del punto. Si algo de esto falla, el correo ya salió.
    const cuando = new Date().toISOString();
    try {
      const abiertos = await crudo(await rest(
        `aprobaciones_cliente?lead_id=eq.${lead.id}&task_id=eq.${tarea.id}&respuesta=is.null&retirada_at=is.null`
        + `&select=id,avisos&order=pedida_at.desc&limit=1`));
      if (Array.isArray(abiertos) && abiertos[0]) {
        const avisos = [...(Array.isArray(abiertos[0].avisos) ? abiertos[0].avisos : []), { correos: para, cuando, quien: quien?.name || null }];
        await rest(`aprobaciones_cliente?id=eq.${abiertos[0].id}`, { method: "PATCH", body: JSON.stringify({ avisos }) });
      }
      await rest("lead_movimientos", {
        method: "POST",
        body: JSON.stringify({
          lead_id: lead.id, task_id: tarea.id, tipo: "nota", automatico: true,
          autor_id: quien?.id ?? null, autor_nombre: quien?.name ?? null,
          detalle: `Le avisó por correo a ${para.join(", ")} que apruebe "${tarea.title}"`,
        }),
      });
    } catch (e) {
      console.error("[aviso-pedido] el correo salió, pero no se pudo anotar:", e.message);
    }
    return res.status(200).json({ ok: true, enviadoA: para });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
