// El libro de obra, por correo, al que lo pida.
//
// El libro no se consulta: se entrega. Cuando alguien lo pide —la
// fiscalización, el cliente, el abogado en un reclamo— lo que tiene que salir
// es un documento con las fechas que se pidieron, no un acceso a un sistema.
//
// POR TRAMO DE FECHAS, que es como se pide de verdad: "mandame el libro de
// septiembre", "lo de la semana de la lluvia". El libro entero de una obra de
// un año no lo lee nadie, y además no entra en un correo.

import { rest, configurado } from "./_supabase.js";
import { enviarCorreo, plantilla } from "./_correo.js";

async function filas(tabla, consulta) {
  const r = await rest(`${tabla}?${consulta}`);
  if (!r.ok) return [];
  return (await r.json().catch(() => [])) || [];
}

const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`)
  .toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");
const esc = t => String(t ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const pausa = ms => new Promise(ok => setTimeout(ok, ms));
const esTope = e => /429|rate|too many/i.test(String(e || ""));

export default async function handler(req, res) {
  try {
    return await mandarLibro(req, res);
  } catch (e) {
    const donde = String(e?.stack || "").split("\n")[1]?.trim().replace(/^at\s+/, "") || "";
    return res.status(500).json({ error: `Se rompió mandando el libro: ${e?.message || e}${donde ? ` (${donde})` : ""}` });
  }
}

async function mandarLibro(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { lead_id: leadId, desde, hasta, para, adjunto, dias: cuantos, nota, de } = req.body || {};
  if (!leadId) return res.status(400).json({ error: "Falta la obra." });
  if (!configurado()) return res.status(500).json({ error: "Falta la llave de la base en el servidor (SUPABASE_SECRET_KEY)." });
  if (!Array.isArray(para) || !para.length) return res.status(400).json({ error: "No hay a quién mandárselo." });
  // SIN EL PDF NO SE MANDA NADA.
  //
  // El libro ES el adjunto: un correo que dice "acá va el libro" sin el libro
  // adentro es peor que no mandarlo, porque el que lo recibe cree que ya se lo
  // mandaron y no vuelve a pedirlo.
  if (!adjunto?.contenido) return res.status(400).json({ error: "El PDF del libro no llegó al servidor." });

  const lead = (await filas("leads", `id=eq.${leadId}&select=nombre`))[0] || null;
  const obra = lead?.nombre || "Obra";
  const tramo = desde && hasta
    ? (desde === hasta ? `del ${dia(desde)}` : `del ${dia(desde)} al ${dia(hasta)}`)
    : "";

  const cuerpo = `
    <p style="margin:0 0 12px">Va adjunto el <strong>libro de obra de ${esc(obra)}</strong>${tramo ? `, ${esc(tramo)}` : ""}.</p>
    ${cuantos ? `<p style="margin:0 0 12px;color:#6B7280">${esc(String(cuantos))} ${cuantos === 1 ? "día cerrado" : "días cerrados"}, en orden, con lo que se escribió cada día y las fotos de ese día.</p>` : ""}
    ${nota ? `<p style="margin:0 0 12px;white-space:pre-line">${esc(nota)}</p>` : ""}
    <p style="margin:14px 0 0;color:#6B7280;font-size:12.5px">
      Cada día lo cerró quien lo escribió, y una vez cerrado no se cambia: si hizo falta corregir algo,
      el día dice que fue reabierto y cuándo. Por eso el libro sirve como documento.
    </p>`;

  const html = plantilla({
    titulo: `Libro de obra · ${obra}`,
    subtitulo: tramo || undefined,
    cuerpo,
  });

  const asunto = `Libro de obra · ${obra}${tramo ? ` · ${tramo}` : ""}`;
  const adjuntos = [{ filename: adjunto.nombre || `Libro de obra - ${obra}.pdf`, content: adjunto.contenido }];

  // DE A UNO: Resend acepta dos pedidos por segundo, y además nadie tiene por
  // qué ver a quién más se le mandó el libro de una obra.
  const envios = [];
  for (const dir of para) {
    const mandar = () => enviarCorreo({
      to: [dir], subject: asunto, html, adjuntos,
      responderA: de ? [de] : null,
    });
    let r = await mandar();
    if (r?.error && esTope(r.error)) { await pausa(1500); r = await mandar(); }
    envios.push({ dir, id: r?.id || null, error: r?.error || null });
    if (para.length > 1) await pausa(550);
  }

  const fallaron = envios.filter(e => e.error);
  return res.status(200).json({
    mandados: envios.length - fallaron.length,
    fallaron: fallaron.map(e => ({ dir: e.dir, error: e.error })),
  });
}
