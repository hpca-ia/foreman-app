import { subirArchivo } from "../../lib/archivos";
import { pdfActa } from "./pdfActa";

// PEDIR EL VISTO: que el acta salga a buscar a quien la tiene que aprobar.
//
// Antes "Pedir el visto" dejaba el acta en estado `lista` y no avisaba a nadie.
// Lo que pasaba en la obra es que el residente terminaba el acta a las ocho de
// la noche, apretaba el botón, y el director se enteraba al otro día si alguien
// se acordaba de escribirle por WhatsApp. Un acta que espera tres días por un
// visto llega tarde: lo que se decidió en la reunión no tiene constancia
// mientras tanto, y los compromisos no están en el tablero de nadie.
//
// Entonces el acta sale por correo, en PDF, a quien puede aprobarla, y se
// aprueba desde ahí.
//
// EL PDF SE SUBE AL DEPÓSITO, no solo se adjunta. Porque el paso siguiente
// —mandarla a los involucrados— se hace desde esa misma página del correo, y
// ahí no hay navegador que pueda armar el PDF: no está la librería ni los
// enlaces firmados de las fotos. Se arma una vez, acá, y los dos correos lo
// adjuntan desde el mismo lugar.

/** El base64 del PDF, convertido en archivo para subirlo. */
function comoArchivo(base64, nombre) {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new File([bytes], nombre, { type: "application/pdf" });
}

/**
 * @param acta     el acta abierta
 * @param obra     nombre del proyecto
 * @param cont     { asistentes, temas, compromisos, fotos, adjuntos }
 * @param enlaces  los enlaces firmados de las fotos
 * @returns { ok, error, enviadoA, sinPdf }
 */
export async function pedirElVisto({ acta, obra, cont, enlaces }) {
  let adjunto = null;
  let pdfPath = null;

  try {
    adjunto = await pdfActa({ acta, obra, ...cont, enlaces }, "base64");
  } catch { /* sin PDF el pedido sale igual: el resumen va en el cuerpo */ }

  if (adjunto?.contenido) {
    try {
      const ruta = `actas/${acta.id}/visto-${Date.now()}.pdf`;
      const { ruta: subida } = await subirArchivo(ruta, comoArchivo(adjunto.contenido, adjunto.nombre));
      pdfPath = subida;
    } catch { /* sin depósito igual viaja adjunto en este correo */ }
  }

  // EL PEDIDO TIENE UN TECHO Y NO ES NUESTRO: Vercel no acepta pedidos de más
  // de 4,5 MB, y un acta con fotos lo pasa. Antes que no avisar, se avisa sin
  // el adjunto —el resumen va en el cuerpo y el PDF quedó en el depósito, así
  // que el acta que salga después a los involucrados lo lleva igual—.
  let sinPdf = false;
  if (adjunto?.contenido && adjunto.contenido.length > 3.6e6) { sinPdf = true; adjunto = null; }

  try {
    const r = await fetch("/api/aviso?de=visto", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acta_id: acta.id, adjunto, pdf_path: pdfPath }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d?.error) return { ok: false, error: d?.error || "No se pudo avisar a quien da el visto." };
    return { ok: true, enviadoA: d.enviadoA || [], sinPdf };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
