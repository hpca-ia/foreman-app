// La revisión del presupuesto, al que tiene que corregir el Excel.
//
// La revisión encuentra sumas que no dan, filas que el propio Excel no suma,
// códigos repetidos. Quien lo ve es el que importa; quien lo tiene que
// arreglar es otro: el contratista que armó la planilla, el proveedor que la
// mandó. Contárselo por teléfono no sirve —son catorce renglones con números
// de fila— y una captura de pantalla tampoco se puede buscar.
//
// POST { para, asunto, nota, adjunto, nombre, de }

import { sesionValida } from "./_supabase.js";
import { enviarCorreo, plantilla, texto2html, esc } from "./_correo.js";

const pausa = ms => new Promise(ok => setTimeout(ok, ms));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!(await sesionValida(req))) return res.status(401).json({ error: "Tu sesión venció. Vuelve a entrar a FOREMAN." });

  const { para, nota, adjunto, nombre, de, errores, avisos } = req.body || {};
  if (!Array.isArray(para) || !para.length) return res.status(400).json({ error: "No hay a quién mandárselo." });
  if (!adjunto?.contenido) return res.status(400).json({ error: "El PDF de la revisión no llegó al servidor." });

  const cuantos = [
    errores ? `${errores} ${errores === 1 ? "error" : "errores"}` : "",
    avisos ? `${avisos} ${avisos === 1 ? "aviso" : "avisos"}` : "",
  ].filter(Boolean).join(" y ");

  const html = plantilla({
    titulo: "Revisión del presupuesto",
    subtitulo: nombre || undefined,
    cuerpo: `
      <p style="margin:0 0 12px">Va adjunta la revisión de la planilla${nombre ? ` de <strong>${esc(nombre)}</strong>` : ""}.
      ${cuantos ? `Encontramos <strong>${esc(cuantos)}</strong>.` : ""}</p>
      ${nota ? `<div style="margin:0 0 12px">${texto2html(nota)}</div>` : ""}
      <p style="margin:0 0 12px;color:#6B7280">
        Cada punto lleva al lado el <strong>número de fila del Excel</strong>, para abrir el archivo y corregir
        de arriba abajo. Los marcados como ERROR cambian el total; los marcados como AVISO no cambian la plata
        pero complican el control de la obra.
      </p>
      <p style="margin:14px 0 0;color:#6B7280;font-size:12.5px">
        No cambiamos nada en tu archivo: esto es lo que no nos cuadró al leerlo.
      </p>`,
    pie: "Correo automático de FOREMAN · HCA Studio.",
  });

  const asunto = `Revisión del presupuesto${nombre ? ` · ${nombre}` : ""}${cuantos ? ` · ${cuantos}` : ""}`;
  const adjuntos = [{ filename: adjunto.nombre || "Revisión del presupuesto.pdf", content: adjunto.contenido }];

  const envios = [];
  for (const dir of para) {
    const r = await enviarCorreo({
      to: [String(dir).trim().toLowerCase()], subject: asunto, html, adjuntos,
      responderA: de?.email ? [de.email] : null,
    });
    envios.push({ dir, error: r?.error || null });
    if (para.length > 1) await pausa(550);
  }
  const fallaron = envios.filter(e => e.error);
  return res.status(200).json({
    mandados: envios.length - fallaron.length,
    fallaron: fallaron.map(e => ({ dir: e.dir, error: e.error })),
  });
}
