// api/_aviso-checklist.js — Mandarle al cliente el checklist de su proyecto.
//
// El checklist se ve en su enlace, pero un enlace hay que acordarse de
// abrirlo. Esto se lo manda: los puntos que se decidió mostrarle, con su
// descripción, en qué está cada uno y la última actualización, y el botón al
// enlace si está prendido. Es lo mismo que vería ahí, ni un dato más.
//
// Lo manda una persona, cuando quiere y a quien elige: no sale solo.
//
// POST { leadId, invitados: [id], otros: [correo], mensaje }

import { rest, sesionValida } from "./_supabase.js";
import { json } from "./_pipeline.js";
import { enviarCorreo, plantilla } from "./_correo.js";
import { listaDelCliente, avanceDeLaLista, correoDeLaLista } from "./_listaDelCliente.js";

const APP = process.env.APP_URL || "https://foreman-app-ebon.vercel.app";
const esCorreo = c => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c || "").trim());

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!(await sesionValida(req))) return res.status(401).json({ error: "Tu sesión venció. Vuelve a entrar a FOREMAN." });

  const { leadId, invitados = [], otros = [], mensaje = "", quien = null } = req.body || {};
  if (!leadId) return res.status(400).json({ error: "Falta el proyecto" });

  try {
    const [lead] = await json(await rest(`leads?id=eq.${Number(leadId)}&select=id,nombre,portal_token,portal_activo`)) || [];
    if (!lead) return res.status(404).json({ error: "No se encontró el proyecto" });

    // Solo lo marcado para el cliente. Si faltan las columnas del reporte
    // (migración 178), sale igual con el título y el estado.
    const base = `tasks?lead_id=eq.${lead.id}&visible_cliente=eq.true&order=id&select=id,title,status,espera,hecha_at,descartada,compra_id,type,ruta_orden,visible_cliente`;
    let filas = await json(await rest(`${base},cliente_descripcion,cliente_actualizacion,cliente_actualizado_at`));
    if (!Array.isArray(filas)) filas = await json(await rest(base));
    const lista = listaDelCliente(filas);
    if (!lista.length) return res.status(200).json({ ok: false, error: "El cliente todavía no ve ninguna tarea de este proyecto: no hay checklist que mandar." });

    // A quién: la gente de afuera de ESTE proyecto que se eligió, y los
    // correos que se hayan escrito a mano.
    const gente = [];
    if (invitados.length) {
      const suyos = await json(await rest(`pipeline_invitados?lead_id=eq.${lead.id}&select=id,nombre,email`)) || [];
      suyos.filter(i => invitados.map(String).includes(String(i.id)) && esCorreo(i.email))
        .forEach(i => gente.push({ nombre: i.nombre, email: i.email.trim() }));
    }
    [].concat(otros || []).map(c => String(c || "").trim()).filter(esCorreo)
      .forEach(c => { if (!gente.some(g => g.email.toLowerCase() === c.toLowerCase())) gente.push({ nombre: c, email: c }); });
    if (!gente.length) return res.status(200).json({ ok: false, error: "Elegí a quién mandárselo: nadie de los elegidos tiene un correo válido." });

    const enlace = lead.portal_activo && lead.portal_token ? `${APP}/?cliente=${lead.portal_token}` : null;
    const { asunto, cuerpo } = correoDeLaLista({ proyecto: lead.nombre, lista, mensaje, enlace });
    const r = await enviarCorreo({
      to: gente.map(g => g.email), subject: asunto,
      html: plantilla({ titulo: lead.nombre, subtitulo: "Cómo vamos", cuerpo }),
      // Si contesta, que le llegue a quien se lo mandó y no a la casilla de avisos.
      responderA: esCorreo(quien?.email) ? [quien.email] : null,
    });
    if (!r.ok) return res.status(200).json({ ok: false, error: r.error });

    // Que quede escrito qué se le mandó y a quién.
    const { listas, total } = avanceDeLaLista(lista);
    await rest("lead_movimientos", {
      method: "POST",
      body: JSON.stringify({
        lead_id: lead.id, tipo: "nota", automatico: true,
        autor_id: quien?.id ?? null, autor_nombre: quien?.name ?? null,
        detalle: `Le mandó el checklist a ${gente.map(g => g.nombre).join(", ")}: ${listas} de ${total} ${total === 1 ? "punto listo" : "puntos listos"}.`,
      }),
    }).catch(() => {});
    return res.status(200).json({ ok: true, enviadoA: gente.map(g => g.nombre) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
