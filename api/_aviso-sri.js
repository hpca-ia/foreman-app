// Una factura que el SRI no va a aceptar, avisada a quien decide pagarla.
//
// La revisión se ve al cargarla, pero quien la carga no siempre es quien paga,
// y una pantalla que ya se cerró no para un pago. Lo que para un pago es un
// correo que llega hoy, con el nombre del proveedor y el número adentro.
//
// SOLO LAS GRAVES. Una leyenda que falta se reclama cuando se pueda y vive en
// la factura; esto es para lo otro: comprobantes que no están autorizados,
// emitidos a nombre de otra empresa, o de un proveedor que el SRI tiene
// marcado como fantasma. Pagar eso es perder el gasto y el IVA, y además deja
// a la empresa en la mira. Si avisara por cada leyenda, a la tercera semana
// nadie abriría el correo.

import { rest } from "./_supabase.js";
import { enviarCorreo, plantilla } from "./_correo.js";

const json = async r => { try { return await r.json(); } catch { return null; } };
const esc = t => String(t ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const plata = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const id = Number((req.body || {}).factura_id);
  if (!id) return res.status(400).json({ error: "Falta la factura." });

  const facturas = await json(await rest(`obra_facturas?id=eq.${id}&select=*`));
  const f = facturas?.[0];
  if (!f) return res.status(404).json({ error: "No encontré la factura." });
  // Lo que no es grave no se manda: la pantalla ya lo mostró y la factura lo
  // lleva escrito.
  if (f.sri_estado !== "grave") return res.status(200).json({ avisados: 0, motivo: "no es grave" });

  const [obras, usuarios] = await Promise.all([
    json(await rest(`obras?id=eq.${f.obra_id}&select=nombre,lead_id`)),
    // Quien paga y quien decide: administración y dirección. Más quien la
    // cargó, que es el que tiene al proveedor del otro lado del teléfono.
    json(await rest("usuarios?activo=eq.true&select=id,nombre,email,rol")),
  ]);
  const obra = obras?.[0]?.nombre || "la obra";
  const para = [];
  for (const u of usuarios || []) {
    const correo = String(u.email || "").trim().toLowerCase();
    if (!correo) continue;
    const mando = ["owner", "admin", "assistant"].includes(String(u.rol || "").toLowerCase());
    if (mando || String(u.id) === String(f.subido_por)) {
      if (!para.includes(correo)) para.push(correo);
    }
  }
  if (!para.length) return res.status(200).json({ avisados: 0, motivo: "nadie tiene correo" });

  const hallazgos = (f.sri_hallazgos || []).filter(h => h.nivel === "grave");
  const cuerpo = `
    <p style="margin:0 0 12px;font-size:14px;color:#1A1A1A">
      <strong>${esc(f.razon_social || "Sin proveedor")}</strong>${f.numero_factura ? ` · factura ${esc(f.numero_factura)}` : ""}<br>
      <span style="color:#555">${esc(obra)} · ${esc(f.fecha || "")} · $${plata(f.total)}</span>
    </p>
    ${hallazgos.map(h => `
      <div style="margin-bottom:10px;padding:10px 12px;background:#FDECEC;border:1px solid #F3C7C7;border-radius:7px">
        <div style="font-size:13.5px;color:#B91C1C;font-weight:700">${esc(h.dice)}</div>
        ${h.hacer ? `<div style="font-size:13px;color:#444;margin-top:3px;line-height:1.5">${esc(h.hacer)}</div>` : ""}
      </div>`).join("")}
    <p style="margin:14px 0 0;font-size:13px;color:#555;line-height:1.55">
      Esto no lo decide FOREMAN: sale de consultarle al SRI el RUC del proveedor y la autorización del
      comprobante. La factura quedó cargada igual —el gasto existe— y marcada en la lista de la obra.
    </p>`;

  const r = await enviarCorreo({
    to: para,
    subject: `Factura que el SRI no acepta · ${f.razon_social || "proveedor"} · ${obra}`,
    html: plantilla({
      titulo: "Esta factura no sustenta el gasto",
      subtitulo: obra,
      cuerpo,
      pie: "Correo automático de FOREMAN · HCA Studio. Sale solo cuando la revisión del SRI encuentra algo que invalida la factura, no por una leyenda que falta.",
    }),
  });
  if (r?.error) return res.status(502).json({ error: r.error });
  return res.status(200).json({ avisados: para.length });
}
