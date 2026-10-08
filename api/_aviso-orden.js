// La orden de cambio, por correo.
//
// Es el documento que va al cliente, al fiscalizador o al gerente para que lo
// analice y lo apruebe. Se arma en el servidor y no en el navegador: el cuerpo
// tiene que decir lo mismo que la base, y un correo armado del lado del que lo
// manda es un correo que puede decir otra cosa.

import { rest, configurado, SUPABASE_URL } from "./_supabase.js";

// `db()` no existe en _supabase.js: nunca existió. Este archivo lo importaba
// igual, así que el módulo fallaba AL IMPORTARSE y la orden de cambio por
// correo devolvía 500 sin llegar a mirar nada. Nadie se enteró porque un
// correo que no sale se parece mucho a un correo que el destinatario no
// contestó. Se consulta con `rest`, como los demás avisos.
const json = async r => { try { return await r.json(); } catch { return null; } };
const uno = async ruta => (await json(await rest(ruta)))?.[0] || null;
import { enviarCorreo, plantilla, esc } from "./_correo.js";

const plata = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = f => (f ? new Date(f).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Solo POST" });
  if (!configurado()) return res.status(503).json({ error: "Falta SUPABASE_SECRET_KEY" });

  const { orden_id, destinatarios, cuerpo } = req.body || {};
  const correos = (Array.isArray(destinatarios) ? destinatarios : []).map(x => String(x).trim()).filter(Boolean);
  if (!orden_id || !correos.length) return res.status(400).json({ error: "Falta la orden o a quién mandarla" });

  const orden = await uno(`ordenes_cambio?id=eq.${orden_id}&select=*&limit=1`);
  if (!orden) return res.status(404).json({ error: "Esa orden de cambio no existe" });

  const [lineas, obra, soportes] = await Promise.all([
    json(await rest(`orden_cambio_lineas?orden_id=eq.${orden.id}&select=*&order=orden`)),
    uno(`obras?id=eq.${orden.obra_id}&select=id,nombre,cliente_nombre,lead_id&limit=1`),
    json(await rest(`orden_cambio_fotos?orden_id=eq.${orden.id}&select=*&order=orden`)),
  ]);

  // El nombre que manda es el del proyecto, como en toda la app.
  let proyecto = obra?.nombre || "";
  if (obra?.lead_id) {
    const lead = await uno(`leads?id=eq.${obra.lead_id}&select=nombre&limit=1`);
    if (lead?.nombre) proyecto = lead.nombre;
  }

  // La línea base del contrato y lo que ya se pactó después, para que el
  // número nuevo se lea contra algo y no en el aire.
  const rubros = await json(await rest(`obra_rubros?obra_id=eq.${orden.obra_id}&select=total_base,origen`));
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

  // El enlace del portal, si la obra lo tiene abierto. Sin él, el correo sigue
  // sirviendo: dice que contesten por correo o por teléfono.
  let enlacePortal = null;
  if (obra?.lead_id) {
    const proy = await uno(`leads?id=eq.${obra.lead_id}&select=portal_token,portal_activo&limit=1`);
    if (proy?.portal_activo && proy?.portal_token) {
      enlacePortal = `https://foreman-app-ebon.vercel.app/?cliente=${proy.portal_token}`;
    }
  }

  const html = plantilla({
    titulo: `Orden de Cambio ${codigo}`,
    subtitulo: proyecto,
    cuerpo: `
      ${orden.anulada ? `<div style="background:#FEF2F2;border:1px solid #FCA5A5;color:#B91C1C;font-weight:700;font-size:12.5px;padding:8px 10px;border-radius:6px;margin-bottom:14px;text-align:center">ORDEN DE CAMBIO ANULADA — NO EJECUTADA</div>` : ""}
      ${cuerpo ? `<p style="margin:0 0 14px">${esc(cuerpo)}</p>` : ""}

      <!-- Qué tiene que hacer con esto. Sin decirlo, el cliente recibe un
           documento formal y no sabe si hay que contestar, firmar, o nada: se
           queda esperando una llamada y la obra se frena esperando un sí que
           él no sabía que tenía que dar. -->
      <div style="background:#F0F7F5;border:1px solid #CFE3DD;border-radius:8px;padding:14px 16px;margin:0 0 16px">
        <div style="font-size:13.5px;font-weight:700;color:#0F3D3E;margin-bottom:6px">Necesitamos tu aprobación para seguir</div>
        <div style="font-size:12.5px;color:#374151;line-height:1.6">
          Abajo está el detalle del cambio: por qué se pide, qué se agrega o se quita con su precio,
          y cuántos días suma al plazo. Leelo y contestanos.
          ${enlacePortal ? `` : `Podés responder a este correo o llamarnos.`}
        </div>
        ${enlacePortal ? `
        <div style="margin-top:12px">
          <a href="${enlacePortal}" style="display:inline-block;background:#0F3D3E;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Aprobar o comentar →</a>
        </div>
        <div style="font-size:11.5px;color:#6B7280;margin-top:8px;line-height:1.5">
          Ese enlace abre la obra en FOREMAN. No hace falta usuario ni contraseña, y desde ahí
          podés aprobar este cambio o dejar una observación. Tu respuesta queda registrada con la fecha.
        </div>` : ""}
        <div style="font-size:11.5px;color:#6B7280;margin-top:8px;line-height:1.5">
          Mientras no tengamos tu respuesta, este trabajo no se ejecuta${orden.dias_impacto ? ` y el plazo de obra queda en suspenso` : ""}.
        </div>
      </div>

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
      ${soportes?.length ? `<div style="font-size:11.5px;color:#6B7280;margin-top:6px"><strong>Soportes gráficos:</strong> ${soportes.length} ${soportes.length === 1 ? "imagen adjunta" : "imágenes adjuntas"} a este correo${soportes.map(f => f.descripcion).filter(Boolean).length ? ` — ${esc(soportes.map(f => f.descripcion).filter(Boolean).join("; "))}` : ""}.</div>` : ""}

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

      <!-- A cuánto asciende el contrato sale solo si alguien lo decidió para
           esta orden. Una que BAJA el contrato es una buena noticia y el
           cliente la lee como tal viendo la diferencia sola; con el acumulado
           al lado, la conversación pasa a ser sobre cuánto lleva gastado, que
           es otra discusión y casi nunca la que uno quería tener ese día. -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:12px;background:#F9FAFB;border-radius:6px;margin-top:16px">
        ${orden.mostrar_contrato ? `
        <tr><td style="padding:4px 8px;color:#6B7280">Contrato original</td><td style="padding:4px 8px;text-align:right">$${plata(base)}</td></tr>
        <tr><td style="padding:4px 8px;color:#6B7280">Órdenes de cambio aprobadas</td><td style="padding:4px 8px;text-align:right">$${plata(adicionalesObra)}</td></tr>` : ""}
        <tr><td style="padding:${orden.mostrar_contrato ? "4px" : "6px"} 8px;${orden.mostrar_contrato ? "color:#6B7280" : "font-weight:700"}">Esta orden</td>
            <td style="padding:${orden.mostrar_contrato ? "4px" : "6px"} 8px;text-align:right;${orden.mostrar_contrato ? "" : "font-weight:700"}">${total < 0 ? "− " : "+ "}$${plata(Math.abs(total))}</td></tr>
        ${orden.mostrar_contrato ? `
        <tr><td style="padding:6px 8px;font-weight:700;border-top:1px solid #E5E7EB">Nuevo valor del contrato</td>
            <td style="padding:6px 8px;text-align:right;font-weight:700;border-top:1px solid #E5E7EB">$${plata(base + adicionalesObra + total)}</td></tr>` : ""}
      </table>

      <p style="margin:14px 0 0;color:#6B7280;font-size:11.5px">
        Esta orden no modifica el presupuesto contratado: se aprueba aparte y su resultado se lleva como adicional.
      </p>`,
    pie: "Orden de cambio emitida desde FOREMAN · HCA Studio. Para aprobarla o hacer observaciones, responde a quien te la envió.",
  });

  // Los soportes van ADJUNTOS, no enlazados: un enlace que caduca deja el
  // respaldo inservible justo cuando alguien lo busca, meses después, para
  // justificar el adicional. Se mandan hasta seis y hasta 12 MB en total, que
  // es lo que un correo aguanta sin rebotar.
  const adjuntos = [];
  let peso = 0;
  for (const f of (soportes || []).slice(0, 6)) {
    try {
      // El depósito por HTTP, con la misma llave: no hay cliente de Supabase
      // acá y traerlo entero por una descarga sería cargar medio megabyte de
      // librería en cada envío.
      const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/task-files/${f.storage_path}`,
        { headers: { apikey: process.env.SUPABASE_SECRET_KEY || "", Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY || ""}` } });
      if (!resp.ok) continue;
      const buffer = Buffer.from(await resp.arrayBuffer());
      if (peso + buffer.length > 12 * 1024 * 1024) break;
      peso += buffer.length;
      adjuntos.push({ filename: f.storage_path.split("/").pop(), content: buffer.toString("base64") });
    } catch { /* un soporte que no se pudo traer no frena el envío */ }
  }

  const r = await enviarCorreo({
    to: correos,
    subject: `Orden de Cambio ${codigo} · ${proyecto}`,
    html,
    adjuntos,
  });
  return r.ok ? res.status(200).json({ ok: true, enviadoA: r.enviadoA }) : res.status(500).json({ error: r.error });
}
