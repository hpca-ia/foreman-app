// El plan de la semana, por correo.
//
// Un plan que vive en una pantalla que nadie abre no es un plan: es una lista.
// El gerente de proyecto y el director no entran a FOREMAN todos los lunes, y
// lo que necesitan de la semana —qué se va a hacer, qué hace falta que esté, y
// qué de la semana pasada quedó sin hacer— entra en un correo.
//
// SE ARMA EN EL SERVIDOR, leyendo la base. Un correo armado en el navegador
// del que lo manda puede decir algo distinto de lo que está guardado, y
// entonces el correo deja de servir como registro de lo que se avisó.
//
// Y LO QUE NO SE HIZO VA PRIMERO. Un plan semanal que solo dice lo que viene
// es optimista por construcción; lo que explica una obra es lo que se había
// planificado y no pasó, con su motivo. Eso arriba, antes de lo nuevo.

import { rest, configurado } from "./_supabase.js";
import { enviarCorreo, plantilla, esc } from "./_correo.js";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const comoSeLee = f => {
  const d = new Date(`${String(f).slice(0, 10)}T12:00:00`);
  return `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Solo POST" });
  if (!configurado()) return res.status(503).json({ error: "Falta SUPABASE_SECRET_KEY" });

  const { lead_id, desde, hasta, destinatarios, nota, de } = req.body || {};
  const correos = (Array.isArray(destinatarios) ? destinatarios : []).map(x => String(x).trim()).filter(Boolean);
  if (!lead_id || !desde || !hasta) return res.status(400).json({ error: "Falta el proyecto o el período" });
  if (!correos.length) return res.status(400).json({ error: "Falta a quién mandarlo" });

  const json = async r => { try { return await r.json(); } catch { return null; } };
  const uno = async ruta => (await json(await rest(ruta)))?.[0] || null;

  const lead = await uno(`leads?id=eq.${lead_id}&select=nombre&limit=1`);
  const dias = await json(await rest(
    `obra_plan_dias?lead_id=eq.${lead_id}&fecha=gte.${desde}&fecha=lte.${hasta}&select=*&order=fecha`));
  if (!dias?.length) return res.status(400).json({ error: "No hay nada planificado en ese período" });

  const items = await json(await rest(
    `obra_plan_items?plan_dia_id=in.(${dias.map(d => d.id).join(",")})&select=*&order=orden`));
  const todos = items || [];

  // Lo de la semana ANTERIOR que quedó sin hacer. Es lo primero que el que
  // lee tiene que ver: la semana que viene se planifica contra eso.
  const antes = new Date(`${String(desde).slice(0, 10)}T12:00:00`);
  antes.setDate(antes.getDate() - 7);
  const diasAntes = await json(await rest(
    `obra_plan_dias?lead_id=eq.${lead_id}&fecha=gte.${antes.toISOString().slice(0, 10)}`
    + `&fecha=lt.${String(desde).slice(0, 10)}&select=id,fecha`));
  let quedaron = [];
  if (diasAntes?.length) {
    const itemsAntes = await json(await rest(
      `obra_plan_items?plan_dia_id=in.(${diasAntes.map(d => d.id).join(",")})&select=*`));
    const fechaDe = new Map(diasAntes.map(d => [d.id, d.fecha]));
    quedaron = (itemsAntes || [])
      .filter(i => (i.tipo || "tarea") !== "material" && !i.hecha)
      .map(i => ({ ...i, fecha: fechaDe.get(i.plan_dia_id) }));
  }

  const bloque = dias.map(d => {
    const suyos = todos.filter(i => i.plan_dia_id === d.id);
    const tareas = suyos.filter(i => (i.tipo || "tarea") !== "material");
    const materiales = suyos.filter(i => i.tipo === "material");
    const campos = [
      d.horario && ["Horario", d.horario],
      d.personal && ["Personal", d.personal],
      d.permisos && ["Permisos", d.permisos],
      d.consideraciones && ["A tener en cuenta", d.consideraciones],
    ].filter(Boolean);
    if (!tareas.length && !materiales.length && !campos.length) return "";
    return `
      <tr><td style="padding:14px 0 4px;border-top:1px solid #e3e6ea">
        <div style="font-size:14px;font-weight:700;color:#0F3D3E;text-transform:capitalize">${esc(comoSeLee(d.fecha))}</div>
        ${tareas.length ? `<ul style="margin:6px 0 0;padding-left:18px;font-size:13px;color:#1f2937;line-height:1.6">
          ${tareas.map(t => `<li>${esc(t.texto)}${t.hecha ? ' <span style="color:#15803D">· hecha</span>' : ""}</li>`).join("")}
        </ul>` : ""}
        ${materiales.length ? `<div style="font-size:12px;color:#6B7280;margin-top:5px">
          <strong>Material:</strong> ${materiales.map(m => esc(m.texto)).join(" · ")}
        </div>` : ""}
        ${campos.length ? `<div style="font-size:12px;color:#6B7280;margin-top:5px">
          ${campos.map(([k, v]) => `<strong>${esc(k)}:</strong> ${esc(v)}`).join(" &nbsp;·&nbsp; ")}
        </div>` : ""}
      </td></tr>`;
  }).join("");

  const pendientes = quedaron.length ? `
    <tr><td style="padding:12px 14px;background:#FEF3C7;border-radius:8px">
      <div style="font-size:13px;font-weight:700;color:#92400E;margin-bottom:5px">
        De la semana pasada quedaron ${quedaron.length} sin hacer
      </div>
      <ul style="margin:0;padding-left:18px;font-size:12.5px;color:#78350F;line-height:1.6">
        ${quedaron.map(q => `<li>${esc(q.texto)} <span style="color:#A16207">— ${esc(q.motivo || "sin decir por qué")}</span></li>`).join("")}
      </ul>
    </td></tr>` : "";

  const html = plantilla({
    titulo: `Plan de obra · ${esc(lead?.nombre || "Proyecto")}`,
    subtitulo: `Del ${comoSeLee(desde)} al ${comoSeLee(hasta)}${de ? ` · lo envía ${esc(de)}` : ""}`,
    cuerpo: `
      <table width="100%" cellpadding="0" cellspacing="0">
        ${pendientes}
        ${nota ? `<tr><td style="padding:10px 0;font-size:13px;color:#1f2937;line-height:1.6">${esc(nota)}</td></tr>` : ""}
        ${bloque || `<tr><td style="padding:14px 0;font-size:13px;color:#6B7280">Nada planificado todavía para ese período.</td></tr>`}
      </table>`,
  });

  const r = await enviarCorreo({
    to: correos,
    subject: `Plan de obra · ${lead?.nombre || "Proyecto"} · ${comoSeLee(desde)} al ${comoSeLee(hasta)}`,
    html,
  });
  if (r?.error) return res.status(502).json({ error: r.error });
  return res.status(200).json({ enviado: correos.length, pendientes: quedaron.length, id: r?.id || null });
}
