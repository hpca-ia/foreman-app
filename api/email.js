// api/email.js — Envio de emails con Resend
// Requiere variable de entorno: RESEND_API_KEY

export const config = {
  api: { bodyParser: { sizeLimit: "15mb" } },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { tipo, datos, to, subject, html } = req.body;

    if (tipo === "alerta_saldo_bajo") return await alertaSaldoBajo(res, datos);
    if (tipo === "reporte_caja_chica") return await reporteCajaChica(res, datos);

    // Formato directo: lo usa el aviso de tarea asignada.
    if (to && subject && html) {
      const result = await enviarEmail({ to, subject, html });
      return res.status(200).json({ ok: true, result });
    }

    return res.status(400).json({ error: "Tipo desconocido" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function enviarEmail({ to, subject, html, attachments }) {
  const cuerpo = {
    from: "FOREMAN <notificaciones@hcastudio.com>",
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  };
  if (attachments?.length) cuerpo.attachments = attachments;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + process.env.RESEND_API_KEY,
    },
    body: JSON.stringify(cuerpo),
  });
  return r.json();
}

async function alertaSaldoBajo(res, datos) {
  // La alerta va a quien repone la caja (Admin / Gerente), no al residente:
  // el residente ya sabe que se le acabó, quien tiene que actuar es el otro.
  const { nombre, proyecto, saldo, recibido, gastado, limite,
          emailsReposicion, pdfBase64, pdfNombre, pdfUrl } = datos;

  const destinatarios = (emailsReposicion || []).filter(Boolean);
  if (!destinatarios.length) {
    return res.status(200).json({ ok: false, error: "Nadie con rol Admin o Gerente tiene email configurado." });
  }

  const html = `
    <div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto">
      <div style="background:#1F2937;padding:20px 24px;border-radius:8px 8px 0 0">
        <div style="color:#E8622A;font-size:18px;font-weight:700">FOREMAN — Caja chica por reponer</div>
      </div>
      <div style="background:#fff;border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <p style="color:#374151;font-size:15px;margin:0 0 16px">
          La caja chica de <strong>${nombre}</strong>${proyecto ? ` (${proyecto})` : ""} bajó de
          $${Number(limite || 50).toFixed(2)} y necesita reposición:
        </p>
        <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:16px;margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span style="color:#92400E;font-size:13px">Total recibido</span>
            <strong style="color:#92400E">$${Number(recibido).toFixed(2)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span style="color:#92400E;font-size:13px">Total gastado</span>
            <strong style="color:#DC2626">$${Number(gastado).toFixed(2)}</strong>
          </div>
          <div style="border-top:1px solid #FDE68A;padding-top:8px;margin-top:4px;display:flex;justify-content:space-between">
            <span style="color:#92400E;font-size:14px;font-weight:700">Saldo disponible</span>
            <strong style="color:${Number(saldo) < 0 ? "#DC2626" : "#D97706"};font-size:16px">$${Number(saldo).toFixed(2)}</strong>
          </div>
        </div>
        <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:14px;margin-bottom:16px">
          <div style="color:#1D4ED8;font-size:13px;font-weight:600;margin-bottom:4px">Qué hacer</div>
          <div style="color:#374151;font-size:13px">
            Revisa el reporte de gastos ${pdfBase64 ? "adjunto" : pdfUrl ? "en el enlace de abajo" : "en FOREMAN"} y registra el anticipo de reposición.
          </div>
        </div>
        ${pdfUrl ? `<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px;text-align:center;margin-bottom:16px">
          <a href="${pdfUrl}" style="color:#1D4ED8;font-size:13px;font-weight:600;text-decoration:none">Ver el reporte de gastos en PDF</a>
        </div>` : ""}
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #F3F4F6;color:#9CA3AF;font-size:11px">
          FOREMAN + FINANCE · HCA Studio · Quito, Ecuador
        </div>
      </div>
    </div>
  `;

  const result = await enviarEmail({
    to: destinatarios,
    subject: `Caja chica por reponer — ${nombre}${proyecto ? " · " + proyecto : ""}`,
    html,
    attachments: pdfBase64 ? [{ filename: pdfNombre || "reporte-caja-chica.pdf", content: pdfBase64 }] : undefined,
  });

  return res.status(200).json({ ok: true, enviadoA: destinatarios, result });
}

async function reporteCajaChica(res, datos) {
  const { nombre, proyecto, periodo, gastos, recibido, gastado, saldo,
          emailAsistente, emailResponsable, destinatariosExtra, pdfBase64, pdfNombre, pdfUrl } = datos;

  const fmtUSD = n => "$" + Number(n || 0).toFixed(2);

  const filasGastos = (gastos || []).map(g => `
    <tr style="border-bottom:1px solid #F3F4F6">
      <td style="padding:8px 12px;font-size:12px;color:#374151">${g.fecha}</td>
      <td style="padding:8px 12px;font-size:12px;color:#374151">${g.descripcion}</td>
      <td style="padding:8px 12px;font-size:12px;color:#DC2626;font-weight:600;text-align:right">${fmtUSD(g.montoTotal)}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:center">
        <span style="background:${g.tieneFactura ? "#F0FDF4" : "#FEF3C7"};color:${g.tieneFactura ? "#059669" : "#D97706"};padding:2px 6px;border-radius:10px;font-size:10px;font-weight:600">
          ${g.tieneFactura ? "Con factura" : "Sin factura"}
        </span>
      </td>
      ${g.fotoUrl ? `<td style="padding:8px 12px;text-align:center"><a href="${g.fotoUrl}" style="color:#2563EB;font-size:11px">Ver foto</a></td>` : "<td></td>"}
    </tr>
  `).join("");

  const html = `
    <div style="font-family:Inter,sans-serif;max-width:650px;margin:0 auto">
      <div style="background:#1F2937;padding:20px 24px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="color:#E8622A;font-size:18px;font-weight:700">FOREMAN + FINANCE</div>
          <div style="color:#9CA3AF;font-size:12px;margin-top:2px">Reporte de Caja Chica${periodo ? " · " + periodo : ""}</div>
        </div>
        <div style="color:#6B7280;font-size:12px">${new Date().toLocaleDateString("es-EC", {day:"2-digit",month:"long",year:"numeric"})}</div>
      </div>

      <div style="background:#fff;border:1px solid #E5E7EB;border-top:none;padding:24px">
        <table style="width:100%;margin-bottom:20px">
          <tr>
            <td style="padding:0 0 4px"><span style="color:#6B7280;font-size:12px">Responsable</span><br><strong style="font-size:16px">${nombre}</strong></td>
            <td style="padding:0 0 4px"><span style="color:#6B7280;font-size:12px">Proyecto</span><br><strong style="font-size:16px">${proyecto}</strong></td>
          </tr>
        </table>

        <div style="display:flex;gap:12px;margin-bottom:20px">
          <div style="flex:1;background:#F0FDF4;border-radius:8px;padding:12px;text-align:center">
            <div style="color:#059669;font-size:18px;font-weight:700">${fmtUSD(recibido)}</div>
            <div style="color:#6B7280;font-size:11px;font-weight:600">RECIBIDO</div>
          </div>
          <div style="flex:1;background:#FEF3C7;border-radius:8px;padding:12px;text-align:center">
            <div style="color:#D97706;font-size:18px;font-weight:700">${fmtUSD(gastado)}</div>
            <div style="color:#6B7280;font-size:11px;font-weight:600">GASTADO</div>
          </div>
          <div style="flex:1;background:${Number(saldo) < 0 ? "#FEF2F2" : "#EFF6FF"};border-radius:8px;padding:12px;text-align:center">
            <div style="color:${Number(saldo) < 0 ? "#DC2626" : "#2563EB"};font-size:18px;font-weight:700">${fmtUSD(Math.abs(saldo))}</div>
            <div style="color:#6B7280;font-size:11px;font-weight:600">${Number(saldo) >= 0 ? "SALDO / DEVUELVE" : "DEBE"}</div>
          </div>
        </div>

        <div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:10px">Detalle de gastos</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:#F9FAFB">
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6B7280;font-weight:600">Fecha</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6B7280;font-weight:600">Descripcion</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6B7280;font-weight:600">Monto</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6B7280;font-weight:600">Factura</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6B7280;font-weight:600">Foto</th>
            </tr>
          </thead>
          <tbody>
            ${filasGastos || '<tr><td colspan="5" style="padding:16px;text-align:center;color:#9CA3AF;font-size:13px">Sin gastos registrados</td></tr>'}
          </tbody>
        </table>

        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #F3F4F6">
          <div style="background:${Number(saldo) < 0 ? "#FEF2F2" : Number(saldo) < 50 ? "#FEF3C7" : "#F0FDF4"};border-radius:8px;padding:12px;font-size:13px;color:#374151">
            ${Number(saldo) < 0
              ? `<strong>⚠️ Saldo negativo:</strong> ${nombre} debe rendir ${fmtUSD(Math.abs(saldo))} adicionales.`
              : Number(saldo) < 50
              ? `<strong>⚠️ Saldo bajo:</strong> Quedan ${fmtUSD(saldo)} — se solicita reposicion.`
              : `<strong>✓ Caja en orden.</strong> Saldo de ${fmtUSD(saldo)} disponible.`
            }
          </div>
        </div>

        ${pdfUrl ? `<div style="margin-top:16px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:14px;text-align:center">
          <a href="${pdfUrl}" style="color:#1D4ED8;font-size:13px;font-weight:600;text-decoration:none">Descargar el reporte completo en PDF (con las facturas)</a>
        </div>` : ""}

        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #F3F4F6;color:#9CA3AF;font-size:11px;text-align:center">
          Generado por FOREMAN + FINANCE · HCA Studio · ${new Date().toLocaleDateString("es-EC")}
        </div>
      </div>
    </div>
  `;

  const destinatarios = [...new Set([
    ...(Array.isArray(emailAsistente) ? emailAsistente : [emailAsistente]),
    emailResponsable,
    ...(destinatariosExtra || []),
  ].filter(Boolean))];

  if (!destinatarios.length) {
    return res.status(200).json({ ok: false, error: "Nadie tiene correo configurado. Revisa los usuarios en Ajustes." });
  }

  const result = await enviarEmail({
    to: destinatarios,
    subject: `Reporte Caja Chica — ${nombre} · ${proyecto}${periodo ? " · " + periodo : ""}`,
    html,
    attachments: pdfBase64 ? [{ filename: pdfNombre || "reporte-caja-chica.pdf", content: pdfBase64 }] : undefined,
  });

  return res.status(200).json({ ok: true, enviadoA: destinatarios, result });
}
