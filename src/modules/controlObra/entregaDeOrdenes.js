// ¿LE LLEGÓ EL CORREO DE LA ORDEN DE CAMBIO?
//
// Al mandar una orden, el servidor de correo contesta "sent" un segundo
// después, que quiere decir "entró el pedido" y nada más. Si la casilla del
// cliente lo rechaza, el rebote aparece minutos más tarde, cuando ya nadie
// mira la pantalla.
//
// Las actas y el libro de obra vuelven a preguntar. Las órdenes de cambio no:
// guardaban ese primer "sent" para siempre. La pantalla ya sabe decir "no le
// llegó" y "el correo rebotó: hay que corregir la dirección", pero nunca tenía
// de dónde enterarse, así que una orden rebotada se veía igual que una
// entregada: "enviado", y el plazo de aprobación corriendo contra un correo
// que el cliente no recibió nunca.
//
// Acá está la regla de A QUIÉN se le vuelve a preguntar. Sin base de datos.

/** El correo llegó: no hay más que preguntar. */
export const LLEGO = ["delivered", "opened", "clicked"];
/** El correo no llegó: tampoco, y hay que avisarlo. */
export const REBOTO = ["bounced", "complained", "failed"];
/** Pasados estos días ya no se pregunta: el servidor de correo no guarda el registro. */
export const DIAS_QUE_SE_PREGUNTA = 7;

const estadoDe = a => String(a?.envio_estado || "").trim().toLowerCase();

/** ¿A este firmante el correo le rebotó, y todavía no contestó por otro lado? */
export const leReboto = a => REBOTO.includes(estadoDe(a)) && !a?.aprobado_at;

/**
 * ¿De este envío todavía no se sabe si llegó?
 *
 * @param a      la fila del firmante: envio_id, envio_at, envio_estado, aprobado_at, observacion
 * @param ahora  milisegundos, para poder probarlo
 */
export function sinConfirmar(a, ahora = Date.now()) {
  if (!a?.envio_id || !a.envio_at) return false;                 // no salió, o salió sin identificador
  // Si ya contestó —aprobó u objetó—, le llegó: no hay nada que averiguar.
  if (a.aprobado_at || String(a.observacion || "").trim()) return false;
  const e = estadoDe(a);
  if (LLEGO.includes(e) || REBOTO.includes(e) || e === "canceled") return false;
  const hace = ahora - new Date(a.envio_at).getTime();
  return Number.isFinite(hace) && hace <= DIAS_QUE_SE_PREGUNTA * 86400000;
}

/**
 * De qué órdenes hay que preguntar, y por cuáles envíos.
 *
 * @param porOrden  { [ordenId]: [firmantes] }
 * @param yaPreguntados  Set de claves por las que ya se preguntó en esta pantalla
 * @returns { ordenes: [id], claves: [clave] }  — vacío si no hay nada que preguntar
 */
export function porConfirmar(porOrden = {}, yaPreguntados = new Set(), ahora = Date.now()) {
  const ordenes = [], claves = [];
  for (const [ordenId, firmantes] of Object.entries(porOrden || {})) {
    const suyas = (firmantes || []).filter(a => sinConfirmar(a, ahora))
      .map(claveDelEnvio).filter(k => !yaPreguntados.has(k));
    if (!suyas.length) continue;
    ordenes.push(Number(ordenId));
    claves.push(...suyas);
  }
  return { ordenes, claves };
}

/** Un envío, para no preguntar dos veces por el mismo: si se reenvía, cambia. */
export const claveDelEnvio = a => `${a.id}:${a.envio_id}`;
