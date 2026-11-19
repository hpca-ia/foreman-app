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
// POR WHATSAPP sale solo desde el número de FOREMAN cuando está configurado
// en Meta (Hernán, 18/11/2026: «es importante ya integrar WhatsApp»): con la
// plantilla aprobada, que lleva qué tiene que aprobar, hasta cuándo y el botón
// a su enlace. Lo que salió queda anotado igual que el correo, y Meta avisa
// después si llegó (api/whatsapp.js). Mientras no esté configurado no se
// manda nada por ahí: la pantalla arma el mensaje y abre el WhatsApp de quien
// lo pide, como antes.
//
// Con que salga por uno de los dos, el aviso está dado; lo que no salió por el
// otro se devuelve dicho, para que se vea.
//
// POST { leadId, taskId, correos: [correo], whatsapps: [{ nombre, telefono }], mensaje, quien }

import { rest, sesionValida } from "./_supabase.js";
import { enviarCorreo, plantilla } from "./_correo.js";
import { correoDelPedido, archivosDelPedido } from "./_listaDelCliente.js";
import { configurado as hayWhatsApp, enviarPlantilla, anotarPlantilla, plantillaDelPedido, huecosDelPedido, textoDeLaPlantilla } from "./_whatsapp.js";

const APP = process.env.APP_URL || "https://foreman-app-ebon.vercel.app";
const esCorreo = c => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c || "").trim());
// La respuesta tal cual: una lista son filas; un objeto es el error de la base.
const crudo = async r => { try { return await r.json(); } catch { return null; } };
// El plazo como va en el hueco de la plantilla: «hasta el martes 25 de noviembre».
const plazoEnPalabras = f => {
  const d = String(f || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? `hasta el ${new Date(`${d}T12:00:00`).toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" })}` : "";
};
/** A quién se le escribe por WhatsApp: el número con su código de país, sin repetir. */
export function losWhatsApp(lista) {
  const vistos = new Set();
  return [].concat(lista || []).map(w => ({ nombre: String(w?.nombre || "").trim(), telefono: String(w?.telefono || "").replace(/\D/g, "") }))
    .filter(w => w.telefono.length >= 10 && w.telefono.length <= 15 && !vistos.has(w.telefono) && vistos.add(w.telefono));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!(await sesionValida(req))) return res.status(401).json({ error: "Tu sesión venció. Vuelve a entrar a FOREMAN." });

  const { leadId, taskId, correos = [], whatsapps = [], mensaje = "", quien = null } = req.body || {};
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
    // Por WhatsApp solo si el número de FOREMAN está configurado: si no, no se intenta.
    const porWa = hayWhatsApp() ? losWhatsApp(whatsapps) : [];
    if (!para.length && !porWa.length) {
      return res.status(200).json({ ok: false, error: hayWhatsApp()
        ? "Elegí a quién avisarle: nadie de los elegidos tiene un correo válido ni un WhatsApp."
        : "Elegí a quién avisarle: nadie de los elegidos tiene un correo válido." });
    }

    // El pedido abierto del registro (migración 187): ahí queda a quién se le
    // avisó, y cada WhatsApp se anota con él para saber después si llegó. Y
    // dice qué archivos pide (migración 191); sin esa columna, todo el punto.
    const cuando = new Date().toISOString();
    const elAbierto = `aprobaciones_cliente?lead_id=eq.${lead.id}&task_id=eq.${tarea.id}&respuesta=is.null&retirada_at=is.null`;
    let abiertos = null;
    try {
      abiertos = await crudo(await rest(`${elAbierto}&select=id,avisos,pide_archivos&order=pedida_at.desc&limit=1`));
      if (!Array.isArray(abiertos)) abiertos = await crudo(await rest(`${elAbierto}&select=id,avisos&order=pedida_at.desc&limit=1`));
    } catch { abiertos = null; }
    const abierto = Array.isArray(abiertos) && abiertos[0] ? abiertos[0] : null;

    // Lo que tiene para revisar: los nombres, para que sepa a qué entra. Si el
    // pedido es de un archivo en particular, ese y no todos los del punto.
    const delPunto = await crudo(await rest(
      `proyecto_archivos?lead_id=eq.${lead.id}&task_id=eq.${tarea.id}&visible_cliente=eq.true&select=id,nombre&order=created_at`));
    const suyos = archivosDelPedido(Array.isArray(delPunto) ? delPunto : [], abierto?.pide_archivos).archivos;

    const { asunto, cuerpo } = correoDelPedido({
      proyecto: lead.nombre, punto: tarea.title, descripcion: tarea.cliente_descripcion,
      archivos: (Array.isArray(suyos) ? suyos : []).map(a => a.nombre), mensaje,
      enlace: `${APP}/?cliente=${lead.portal_token}`, hasta: tarea.cliente_aprueba_hasta || null,
    });
    // EL CORREO.
    let enviadoA = [], correoError = "";
    if (para.length) {
      const r = await enviarCorreo({
        to: para, subject: asunto,
        html: plantilla({ titulo: lead.nombre, subtitulo: "Para tu aprobación", cuerpo }),
        // Si contesta el correo, que le llegue a quien se lo pidió y no a la casilla de avisos.
        responderA: esCorreo(quien?.email) ? [quien.email] : null,
      });
      if (r.ok) enviadoA = para; else correoError = r.error || "No se pudo mandar el correo.";
    }

    // EL WHATSAPP, de a uno: cada persona lleva su nombre en el saludo.
    const porWhatsApp = [];
    const { nombre: laPlantilla, idioma } = plantillaDelPedido();
    for (const w of porWa) {
      const huecos = huecosDelPedido({
        nombre: w.nombre, proyecto: lead.nombre, punto: tarea.title,
        plazo: plazoEnPalabras(tarea.cliente_aprueba_hasta), llave: lead.portal_token,
      });
      const r = await enviarPlantilla(w.telefono, { nombre: laPlantilla, idioma, huecos });
      if (r.error) { porWhatsApp.push({ nombre: w.nombre, telefono: w.telefono, ok: false, error: r.error }); continue; }
      porWhatsApp.push({ nombre: w.nombre, telefono: w.telefono, ok: true, wa_id: r.id });
      await anotarPlantilla({
        wa_id: r.id, telefono: w.telefono, usuario_id: quien?.id ?? null, usuario_nombre: quien?.name ?? null,
        texto: textoDeLaPlantilla(huecos), lead_id: lead.id, task_id: tarea.id, aprobacion_id: abierto?.id ?? null,
        para_nombre: w.nombre || null, plantilla: laPlantilla, estado: "enviado", estado_at: cuando,
      });
    }
    const salieron = porWhatsApp.filter(w => w.ok);
    // Lo que vuelve a la pantalla: a quién sí y a quién no, sin el id de Meta.
    const delWhatsApp = porWhatsApp.map(({ wa_id, ...w }) => w);
    if (!enviadoA.length && !salieron.length) {
      return res.status(200).json({ ok: false, error: correoError || porWhatsApp[0]?.error || "No se pudo avisar.", ...(delWhatsApp.length ? { porWhatsApp: delWhatsApp } : {}) });
    }

    // A quién se le avisó queda en el pedido abierto del registro y en el
    // historial del punto. Si algo de esto falla, el aviso ya salió.
    const porDonde = [
      enviadoA.length ? `por correo a ${enviadoA.join(", ")}` : "",
      salieron.length ? `por WhatsApp a ${salieron.map(w => (w.nombre ? `${w.nombre} (${w.telefono})` : w.telefono)).join(", ")}` : "",
    ].filter(Boolean).join(" y ");
    try {
      if (abierto) {
        const esteAviso = {
          correos: enviadoA, cuando, quien: quien?.name || null,
          ...(salieron.length ? { whatsapps: salieron.map(w => ({ nombre: w.nombre, telefono: w.telefono, wa_id: w.wa_id })) } : {}),
        };
        const avisos = [...(Array.isArray(abierto.avisos) ? abierto.avisos : []), esteAviso];
        await rest(`aprobaciones_cliente?id=eq.${abierto.id}`, { method: "PATCH", body: JSON.stringify({ avisos }) });
      }
      await rest("lead_movimientos", {
        method: "POST",
        body: JSON.stringify({
          lead_id: lead.id, task_id: tarea.id, tipo: "nota", automatico: true,
          autor_id: quien?.id ?? null, autor_nombre: quien?.name ?? null,
          detalle: `Le avisó ${porDonde} que apruebe "${tarea.title}"`,
        }),
      });
    } catch (e) {
      console.error("[aviso-pedido] el aviso salió, pero no se pudo anotar:", e.message);
    }
    return res.status(200).json({
      ok: true, enviadoA,
      ...(correoError ? { correoError } : {}),
      ...(delWhatsApp.length ? { porWhatsApp: delWhatsApp } : {}),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
