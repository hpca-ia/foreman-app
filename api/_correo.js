// Enviar correo desde el servidor. Lo comparten el informe del pipeline y el
// resumen diario; el módulo de caja chica tiene el suyo de antes.

export async function enviarCorreo({ to, subject, html }) {
  const destinatarios = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!destinatarios.length) return { ok: false, error: "sin destinatarios" };
  if (!process.env.RESEND_API_KEY) return { ok: false, error: "falta RESEND_API_KEY" };

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.RESEND_API_KEY },
    body: JSON.stringify({ from: "FOREMAN <notificaciones@hcastudio.com>", to: destinatarios, subject, html }),
  });
  const datos = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, enviadoA: destinatarios, id: datos.id } : { ok: false, error: datos.message || "Resend rechazó el envío" };
}

const escapar = t => String(t ?? "").replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

/** El mismo marco para todos los correos: título, cuerpo y una nota al pie. */
export const PIE = "Correo automático de FOREMAN · HCA Studio. No respondas a este mensaje: nadie lo lee. Lo que tengas que decir, escríbelo en FOREMAN.";

// El logo vive en el depósito público, que para esto existe: en un correo
// un enlace que caduca se vería roto.
export const LOGO = "https://qxoincfvscvbqvoxamdi.supabase.co/storage/v1/object/public/publico/empresa/logo.png";

export function plantilla({ titulo, subtitulo, cuerpo, pie = PIE }) {
  return `
  <div style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto">
    <div style="background:#0F3D3E;padding:16px 22px;border-radius:8px 8px 0 0">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:10px">
        <tr>
          <td style="padding-right:9px"><img src="${LOGO}" alt="HCA Studio" width="26" height="26" style="display:block;border-radius:5px;background:#fff" /></td>
          <td style="color:#fff;font-size:13px;font-weight:700;letter-spacing:.3px">FOREMAN <span style="color:#B7CBCB;font-weight:400">de HCA Studio</span></td>
        </tr>
      </table>
      <div style="color:#fff;font-size:17px;font-weight:700">${escapar(titulo)}</div>
      ${subtitulo ? `<div style="color:#B7CBCB;font-size:13px;margin-top:3px">${escapar(subtitulo)}</div>` : ""}
    </div>
    <div style="background:#fff;border:1px solid #E5E7EB;border-top:none;padding:22px;border-radius:0 0 8px 8px;color:#374151;font-size:14px;line-height:1.65">
      ${cuerpo}
      <div style="margin-top:22px;padding-top:12px;border-top:1px solid #F3F4F6;color:#9CA3AF;font-size:11px">${escapar(pie)}</div>
    </div>
  </div>`;
}

/** Texto libre de NOVA a HTML: respeta párrafos y viñetas, sin dejar pasar etiquetas. */
export function texto2html(texto) {
  const lineas = String(texto || "").split("\n").map(l => l.trim()).filter(Boolean);
  let html = "", enLista = false;
  for (const l of lineas) {
    const vinheta = /^[-*·•]\s+/.test(l);
    if (vinheta && !enLista) { html += "<ul style='margin:8px 0;padding-left:18px'>"; enLista = true; }
    if (!vinheta && enLista) { html += "</ul>"; enLista = false; }
    html += vinheta ? `<li style="margin:3px 0">${escapar(l.replace(/^[-*·•]\s+/, ""))}</li>`
                    : `<p style="margin:0 0 10px">${escapar(l)}</p>`;
  }
  if (enLista) html += "</ul>";
  return html;
}

export const esc = escapar;
