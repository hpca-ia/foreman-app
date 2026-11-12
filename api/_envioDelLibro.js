// La copia del servidor de src/modules/libro/envioDelLibro.js: qué archivo del
// depósito se puede mandar como libro, y hasta qué peso va adjunto.
//
// Un libro que no entra en el pedido se sube al depósito y el servidor lo toma
// de ahí. Como el servidor manda por correo lo que el pedido le diga, la ruta
// se revisa: tiene que ser un libro subido para mandar, de la obra del pedido.
// pruebas/envioDelLibro.test.mjs cuida que esta copia y la de la aplicación
// digan lo mismo.

/** Hasta cuántos bytes de PDF van como adjunto; más que eso, va el enlace. */
export const TOPE_DEL_ADJUNTO = 15 * 1024 * 1024;

export function esRutaDeEnvio(ruta, leadId) {
  const id = Number(leadId);
  if (!Number.isInteger(id) || id <= 0) return false;
  return new RegExp(`^libro/${id}/envios/libro-[0-9-]+-a-[0-9-]+-[0-9]+\\.pdf$`).test(String(ruta || ""));
}

export const enMegas = bytes => `${((Number(bytes) || 0) / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
