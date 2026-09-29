// La orden de cambio, por correo.
//
// Es el documento que va al cliente, al fiscalizador o al gerente para que lo
// analice y lo apruebe. Se arma en el servidor y no en el navegador: el cuerpo
// tiene que decir lo mismo que la base, y un correo armado del lado del que lo
// manda es un correo que puede decir otra cosa.

import { db, configurado } from "./_supabase.js";
import { enviarCorreo, plantilla, esc } from "./_correo.js";

const plata = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = f => (f ? new Date(f).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Solo POST" });
  if (!configurado()) return res.status(503).json({ error: "Falta SUPABASE_SECRET_KEY" });

  const { orden_id, destinatarios, cuerpo } = req.body || {};
  const correos = (Array.isArray(destinatarios) ? destinatarios : []).map(x => String(x).trim()).filter(Boolean);
  if (!orden_id || !correos.length) return res.status(400).json({ error: "Falta la orden o a quién mandarla" });

  const sb = db();
  const { data: orden } = await sb.from("ordenes_cambio").select("*").eq("id", orden_id).maybeSingle();
  if (!orden) return res.status(404).json({ error: "Esa orden de cambio no existe" });

  const [{ data: lineas }, { data: obra }] = await Promise.all([
    sb.from("orden_cambio_lineas").select("*").eq("orden_id", orden.id).order("orden"),
    sb.from("obras").select("id,nombre,cliente_nombre,lead_id").eq("id", orden.obra_id).maybeSingle(),
  ]);

  // El nombre que manda es el del proyecto, como en toda la app.
  let proyecto = obra?.nombre || "";
  if (obra?.lead_id) {
    const { data: lead } = await sb.from("leads").select("nombre").eq("id", obra.lead_id).maybeSingle();
    if (lead?.nombre) proyecto = lead.nombre;
  }

  // La línea base del contrato y lo que ya se pactó después, para que el
  // número nuevo se lea contra algo y no en el aire.
  const { data: rubros } = await sb.from("obra_rubros").select("total_base,origen").eq("obra_id", orden.obra_id);
  const base = (rubros || []).filter(r => r.origen !== "orden_cambio").reduce((s, r) => s + Number(r.total_base || 0), 0);
  const adicionalesObra = (rubros || []).filter(r => r.origen === "orden_cambio").reduce((s, r) => s + Number(r.total_base || 0), 0);

  const conMonto = (lineas || []).map(l => ({
    ...l,
    monto: (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0),
  }));
  const adiciones   = conMonto.filter(l => l.tipo !== "quita").reduce((s, l) => s + l.monto, 0);
  const reducciones = conMonto.filter(l => l.tipo === "quita").reduce((s, l) => s + l.monto, 0);
  const total = adiciones - reducciones;
  const codigo = orden.codigo || `OC-${String(orden.numero).padStart(2, "0")}`;

  // El documento es el que la oficina firma: cuatro capítulos, adiciones y
  // reducciones separadas con sus subtotales, y el cuadro de revisión. Que el
  // correo se parezca al papel es lo que hace que nadie tenga que traducir.
  const dato = (k, v) => v ? `<tr>
      <td style="padding:3px 10px 3px 0;color:#6B7280;font-size:11.5px;white-space:nowrap">${esc(k)}</td>
      <td style="padding:3px 0;font-size:12.5px;color:#111827">${esc(v)}</td>
    </tr>` : "";

  const capitulo = (n, titulo) => `
    <div style="background:#0F3D3E;color:#fff;font-size:11.5px;font-weight:700;padding:5px 9px;border-radius:4px;margin:16px 0 8px">
      CAPÍTULO ${n}: ${esc(titulo)}
    </div>`;

  const fila = l => `
    <tr>
      <td style="padding:5px 6px;border-bottom:1px solid #F3F4F6;font-size:11px;color:#6B7280;white-space:nowrap">${esc(l.item || "")}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #F3F4F6;font-size:11px;color:#6B7280;white-space:nowrap">${esc(l.rubro_codigo || "")}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #F3F4F6;font-size:12px">${esc(l.descripcion)}${l.especificacion ? `<div style="color:#9CA3AF;font-size:11px">${esc(l.especificacion)}</div>` : ""}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #F3F4F6;font-size:11.5px;text-align:center;color:#6B7280">${esc(l.unidad || "")}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #F3F4F6;font-size:11.5px;text-align:right">${plata(l.cantidad)}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #F3F4F6;font-size:11.5px;text-align:right">${plata(l.precio_unitario)}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #F3F4F6;font-size:12px;text-align:right;font-weight:600">${plata(l.monto)}</td>
    </tr>`;

  const seccion = (titulo, tipo, subtotal) => {
    const suyas = conMonto.filter(l => (tipo === "quita" ? l.tipo === "quita" : l.tipo !== "quita"));
    return `
      <tr><td colspan="7" style="background:#F3F4F6;padding:4px 6px;font-size:10.5px;font-weight:700;letter-spacing:.4px;color:#374151">${titulo}</td></tr>
      ${suyas.length ? suyas.map(fila).join("") : `<tr><td colspan="7" style="padding:6px;font-size:11.5px;color:#9CA3AF">—</td></tr>`}
      <tr>
        <td colspan="6" style="padding:5px 6px;text-align:right;font-size:11.5px;font-weight:700;color:#374151">SUBTOTAL ${titulo}</td>
        <td style="padding:5px 6px;text-align:right;font-size:12.5px;font-weight:700">$${plata(subtotal)}</td>
      </tr>`;
  };

  const revisor = (rol, nombre, fechaF, comentario) => `
    <tr>
      <td style="padding:6px 8px;border:1px solid #E5E7EB;font-size:11.5px;font-weight:700;color:#374151;white-space:nowrap">${esc(rol)}</td>
      <td style="padding:6px 8px;border:1px solid #E5E7EB;font-size:12px">${esc(nombre || "")}</td>
      <td style="padding:6px 8px;border:1px solid #E5E7EB;font-size:11.5px;color:#6B7280;white-space:nowrap">${esc(fecha(fechaF) || "")}</td>
      <td style="padding:6px 8px;border:1px solid #E5E7EB;font-size:11.5px;color:#6B7280">${esc(comentario || "")}</td>
    </tr>`;

  const html = plantilla({
    titulo: `Orden de Cambio ${codigo}`,
    subtitulo: proyecto,
    cuerpo: `
      ${orden.anulada ? `<div style="background:#FEF2F2;border:1px solid #FCA5A5;color:#B91C1C;font-weight:700;font-size:12.5px;padding:8px 10px;border-radius:6px;margin-bottom:14px;text-align:center">ORDEN DE CAMBIO ANULADA — NO EJECUTADA</div>` : ""}
      ${cuerpo ? `<p style="margin:0 0 14px">${esc(cuerpo)}</p>` : ""}

      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">
        ${dato("CAMBIO N°:", codigo)}
        ${dato("FECHA:", fecha(orden.fecha || orden.created_at))}
        ${dato("TIPO:", orden.tipo)}
        ${dato("LUGAR:", orden.lugar)}
        ${dato("TÍTULO:", orden.titulo)}
        ${dato("EMITIDO POR:", orden.emitido_por || orden.created_nombre)}
        ${dato("PROYECTO:", proyecto)}
        ${dato("CLIENTE:", obra?.cliente_nombre)}
      </table>

      ${capitulo("I", "Argumentos para la solicitud.")}
      <div style="font-size:12.5px;color:#374151;line-height:1.6">${esc(orden.justificacion || "—")}</div>
      ${orden.soportes ? `<div style="font-size:11.5px;color:#6B7280;margin-top:6px"><strong>Soportes gráficos:</strong> ${esc(orden.soportes)}</div>` : ""}

      ${capitulo("II", "Propuesta de imprevisto y cotización preliminar.")}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tr style="background:#F9FAFB">
          <th style="text-align:left;padding:5px 6px;font-size:9.5px;color:#6B7280;letter-spacing:.3px">ITEM</th>
          <th style="text-align:left;padding:5px 6px;font-size:9.5px;color:#6B7280;letter-spacing:.3px">RUBRO</th>
          <th style="text-align:left;padding:5px 6px;font-size:9.5px;color:#6B7280;letter-spacing:.3px">DESCRIPCIÓN</th>
          <th style="text-align:center;padding:5px 6px;font-size:9.5px;color:#6B7280;letter-spacing:.3px">UNIDAD</th>
          <th style="text-align:right;padding:5px 6px;font-size:9.5px;color:#6B7280;letter-spacing:.3px">CANT</th>
          <th style="text-align:right;padding:5px 6px;font-size:9.5px;color:#6B7280;letter-spacing:.3px">P. UNIT</th>
          <th style="text-align:right;padding:5px 6px;font-size:9.5px;color:#6B7280;letter-spacing:.3px">TOTAL</th>
        </tr>
        ${seccion("ADICIONES", "aumenta", adiciones)}
        ${seccion("REDUCCIONES", "quita", reducciones)}
        <tr>
          <td colspan="6" style="padding:9px 6px;text-align:right;font-size:13px;font-weight:700;border-top:2px solid #0F3D3E">TOTAL</td>
          <td style="padding:9px 6px;text-align:right;font-size:14.5px;font-weight:700;border-top:2px solid #0F3D3E;color:${total < 0 ? "#B91C1C" : "#0F3D3E"}">
            ${total < 0 ? "− " : ""}$${plata(Math.abs(total))}
          </td>
        </tr>
      </table>
      <div style="font-size:11.5px;color:#6B7280;margin-top:5px">
        ${total >= 0 ? "Mayor valor del contrato" : "Menor valor del contrato"}.
      </div>

      ${capitulo("III", "Impacto en cronograma.")}
      <div style="font-size:12.5px;color:#374151;line-height:1.6">
        ${esc(orden.impacto_cronograma || (orden.dias_impacto ? `Impacto estimado de ${orden.dias_impacto} días.` : "Sin impacto en el cronograma."))}
      </div>

      ${capitulo("IV", "Revisión y aprobación.")}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tr style="background:#F9FAFB">
          <th style="text-align:left;padding:5px 8px;border:1px solid #E5E7EB;font-size:9.5px;color:#6B7280;letter-spacing:.3px">INTERESADO</th>
          <th style="text-align:left;padding:5px 8px;border:1px solid #E5E7EB;font-size:9.5px;color:#6B7280;letter-spacing:.3px">NOMBRE / FIRMA</th>
          <th style="text-align:left;padding:5px 8px;border:1px solid #E5E7EB;font-size:9.5px;color:#6B7280;letter-spacing:.3px">FECHA</th>
          <th style="text-align:left;padding:5px 8px;border:1px solid #E5E7EB;font-size:9.5px;color:#6B7280;letter-spacing:.3px">COMENTARIOS</th>
        </tr>
        ${revisor("CONTRATISTA", orden.contratista_nombre || "HCARQ SA", orden.contratista_fecha, orden.contratista_comentario)}
        ${revisor("FISCALIZACIÓN", orden.fiscalizacion_nombre, orden.fiscalizacion_fecha, orden.fiscalizacion_comentario)}
        ${revisor("CONTRATANTE", orden.contratante_nombre, orden.contratante_fecha, orden.contratante_comentario)}
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:12px;background:#F9FAFB;border-radius:6px;margin-top:16px">
        <tr><td style="padding:4px 8px;color:#6B7280">Contrato original</td><td style="padding:4px 8px;text-align:right">$${plata(base)}</td></tr>
        <tr><td style="padding:4px 8px;color:#6B7280">Órdenes de cambio aprobadas</td><td style="padding:4px 8px;text-align:right">$${plata(adicionalesObra)}</td></tr>
        <tr><td style="padding:4px 8px;color:#6B7280">Esta orden</td><td style="padding:4px 8px;text-align:right">${total < 0 ? "− " : ""}$${plata(Math.abs(total))}</td></tr>
        <tr><td style="padding:6px 8px;font-weight:700;border-top:1px solid #E5E7EB">Nuevo valor del contrato</td>
            <td style="padding:6px 8px;text-align:right;font-weight:700;border-top:1px solid #E5E7EB">$${plata(base + adicionalesObra + total)}</td></tr>
      </table>

      <p style="margin:14px 0 0;color:#6B7280;font-size:11.5px">
        Esta orden no modifica el presupuesto contratado: se aprueba aparte y su resultado se lleva como adicional.
      </p>`,
    pie: "Orden de cambio emitida desde FOREMAN · HCA Studio. Para aprobarla o hacer observaciones, responde a quien te la envió.",
  });

  const r = await enviarCorreo({
    to: correos,
    subject: `Orden de Cambio ${codigo} · ${proyecto}`,
    html,
  });
  return r.ok ? res.status(200).json({ ok: true, enviadoA: r.enviadoA }) : res.status(500).json({ error: r.error });
}
