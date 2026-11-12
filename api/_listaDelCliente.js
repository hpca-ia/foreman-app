// EL CHECKLIST QUE VE EL CLIENTE EN SU ENLACE, Y EL QUE LE LLEGA POR CORREO.
//
// De cada tarea que el equipo decidió mostrarle sale lo que se escribió PARA
// ÉL: qué dice, su descripción, en qué está y la última actualización. Lo
// demás es interno y no viaja: la nota de quien la trabajó, los comentarios,
// quién la tiene, para cuándo estaba.
//
// Sin base: recibe las filas y devuelve lo que se manda. Así se puede probar
// qué sale y, sobre todo, qué no (pruebas/checklistDelLead.test.mjs).

const dia = f => String(f || "").slice(0, 10) || null;
const limpio = t => String(t || "").trim();
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * @param tareas  las filas de `tasks` del proyecto
 * @returns [{ id, titulo, descripcion, estado, listo_el, actualizacion, actualizado_el }]
 *          `estado` es "listo" | "espera" | "pendiente". En el orden en que se
 *          escribieron, que es el orden de un checklist.
 */
export function listaDelCliente(tareas = []) {
  return (Array.isArray(tareas) ? tareas : [])
    // Solo lo marcado. Las compras tienen su circuito y lo que se cerró con
    // «ya no va» no se hizo ni falta: mostrárselo al cliente sería ruido.
    .filter(t => t && t.visible_cliente === true && !t.descartada && !t.compra_id && t.type !== "Compra")
    .sort((a, b) => (Number(a.ruta_orden) || 0) - (Number(b.ruta_orden) || 0) || Number(a.id) - Number(b.id))
    .map(t => {
      const listo = t.status === "listo";
      const actualizacion = limpio(t.cliente_actualizacion);
      return {
        id: t.id,
        titulo: limpio(t.title),
        descripcion: limpio(t.cliente_descripcion),
        estado: listo ? "listo" : t.espera ? "espera" : "pendiente",
        listo_el: listo ? dia(t.hecha_at) : null,
        actualizacion,
        actualizado_el: actualizacion ? dia(t.cliente_actualizado_at) : null,
      };
    })
    .filter(t => t.titulo);
}

/** Cuánto va, para el encabezado: listas de cuántas. */
export const avanceDeLaLista = (lista = []) => ({ listas: lista.filter(t => t.estado === "listo").length, total: lista.length });

/** Cómo se le dice cada estado al cliente. La pantalla del enlace usa las mismas palabras. */
export const ESTADOS = {
  listo: { dice: "Listo", color: "#15803D" },
  espera: { dice: "Hecho de nuestro lado · esperando respuesta", color: "#B45309" },
  pendiente: { dice: "Pendiente", color: "#6B7280" },
};

const enCriollo = f => (f ? new Date(`${dia(f)}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");

/**
 * El cuerpo del correo con el checklist: lo mismo que ve en su enlace.
 *
 * @param mensaje  unas líneas de quien lo manda, arriba de la lista (opcional)
 * @param enlace   la dirección de su enlace, si está prendido: va de botón
 * @returns { asunto, cuerpo }  el cuerpo es HTML, con todo lo escrito escapado
 */
export function correoDeLaLista({ proyecto = "", lista = [], mensaje = "", enlace = null } = {}) {
  const { listas, total } = avanceDeLaLista(lista);
  const pct = total ? Math.round((listas / total) * 100) : 0;
  const renglones = lista.map(t => {
    const e = ESTADOS[t.estado] || ESTADOS.pendiente;
    const listo = t.estado === "listo";
    return `
      <tr>
        <td style="vertical-align:top;padding:11px 10px 11px 0;border-top:1px solid #F3F4F6;width:20px">
          <div style="width:16px;height:16px;border-radius:4px;border:1.5px solid ${listo ? "#15803D" : "#D1D5DB"};background:${listo ? "#15803D" : "#fff"};color:#fff;font-size:11px;line-height:16px;text-align:center;font-weight:700">${listo ? "&#10003;" : "&nbsp;"}</div>
        </td>
        <td style="vertical-align:top;padding:11px 0;border-top:1px solid #F3F4F6">
          <div style="font-size:14px;color:#111827;font-weight:600;line-height:1.35">${esc(t.titulo)}</div>
          ${t.descripcion ? `<div style="font-size:13px;color:#4B5563;line-height:1.5;margin-top:2px">${esc(t.descripcion)}</div>` : ""}
          <div style="font-size:12px;color:${e.color};margin-top:3px">${esc(e.dice)}${listo && t.listo_el ? ` · ${esc(enCriollo(t.listo_el))}` : ""}</div>
          ${t.actualizacion ? `<div style="font-size:13px;color:#374151;line-height:1.5;margin-top:6px;padding:7px 10px;background:#F9FAFB;border-radius:6px">${esc(t.actualizacion)}${t.actualizado_el ? `<div style="font-size:11px;color:#9CA3AF;margin-top:3px">Actualizado el ${esc(enCriollo(t.actualizado_el))}</div>` : ""}</div>` : ""}
        </td>
      </tr>`;
  }).join("");

  const cuerpo = `
    ${limpio(mensaje) ? `<p style="font-size:14px;color:#374151;margin:0 0 14px;white-space:pre-line">${esc(limpio(mensaje))}</p>` : ""}
    <p style="font-size:15px;color:#111827;margin:0 0 6px"><strong>${listas === total && total ? "Todo listo" : `${listas} de ${total} ${total === 1 ? "punto listo" : "puntos listos"}`}</strong></p>
    <div style="height:6px;background:#F3F4F6;border-radius:3px;overflow:hidden;margin:0 0 12px"><div style="width:${pct}%;height:6px;background:#15803D"></div></div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${renglones}</table>
    ${enlace ? `<p style="margin:18px 0 0"><a href="${esc(enlace)}" style="display:inline-block;background:#0F3D3E;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:9px 16px;border-radius:7px">Ver el checklist al día</a></p>
    <p style="font-size:12px;color:#6B7280;margin:8px 0 0">El enlace muestra siempre la última versión.</p>` : ""}`;

  return { asunto: `${proyecto ? `${proyecto} · ` : ""}cómo vamos: ${listas} de ${total} ${total === 1 ? "punto listo" : "puntos listos"}`, cuerpo };
}
