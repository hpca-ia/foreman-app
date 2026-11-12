// CÓMO VIAJA EL LIBRO CUANDO SE MANDA POR CORREO.
//
// El PDF se arma en el navegador y antes iba entero adentro del pedido al
// servidor. Ese pedido tiene un techo que no es nuestro —Vercel corta en
// 4,5 MB— y un libro de cinco días con sus fotos ya lo pasaba: «El libro de
// ese tramo pesa 4.3 MB… mandalo por partes». Hernán preguntó si se podía
// ampliar (12/11/2026). El techo del pedido no se puede mover; lo que se puede
// es no meter el libro en el pedido.
//
//   · CHICO: va en el pedido, como siempre. Nada cambia.
//   · MÁS GRANDE: se sube al depósito y el servidor lo toma de ahí y lo
//     adjunta. Hasta 15 MB de PDF, que con el envoltorio del correo son unos
//     20: lo que aceptan sin rebotar las casillas comunes.
//   · MUY GRANDE: tampoco entra como adjunto en ninguna casilla. Se sube igual
//     y el correo lleva el botón para descargarlo, válido treinta días.
//
// La copia del servidor es api/_envioDelLibro.js; pruebas/envioDelLibro.test.mjs
// cuida que las dos digan lo mismo.

/** Cuántas letras de base64 entran en un pedido sin que Vercel lo corte. */
export const TOPE_DEL_PEDIDO = 4.2e6;
/** Hasta cuántos bytes de PDF van como adjunto. */
export const TOPE_DEL_ADJUNTO = 15 * 1024 * 1024;

/** Cuánto ocupa un archivo de `bytes` una vez pasado a base64. */
export const enBase64 = bytes => Math.ceil((Number(bytes) || 0) / 3) * 4;

/**
 * Cómo viaja un libro de ese peso.
 * @returns "pedido" | "deposito" | "enlace"
 */
export function comoViaja(bytes) {
  if (enBase64(bytes) <= TOPE_DEL_PEDIDO) return "pedido";
  return bytes <= TOPE_DEL_ADJUNTO ? "deposito" : "enlace";
}

const soloFecha = f => String(f || "").slice(0, 10).replace(/[^0-9-]/g, "");

/** Dónde se sube el libro que se va a mandar: en la carpeta de envíos de su obra. */
export function rutaDelEnvio(leadId, desde, hasta, ahora = Date.now()) {
  return `libro/${Number(leadId)}/envios/libro-${soloFecha(desde)}-a-${soloFecha(hasta)}-${ahora}.pdf`;
}

/**
 * ¿Esa ruta es un libro subido para mandar, de ESA obra?
 *
 * El servidor toma del depósito lo que diga el pedido y lo manda por correo:
 * sin esta regla, cualquier archivo del depósito se podría hacer salir así.
 */
export function esRutaDeEnvio(ruta, leadId) {
  const id = Number(leadId);
  if (!Number.isInteger(id) || id <= 0) return false;
  return new RegExp(`^libro/${id}/envios/libro-[0-9-]+-a-[0-9-]+-[0-9]+\\.pdf$`).test(String(ruta || ""));
}

/** El peso, como se le dice a una persona. */
export const enMegas = bytes => `${((Number(bytes) || 0) / 1024 / 1024).toLocaleString("es-EC", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
