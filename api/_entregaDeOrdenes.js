// A QUIÉN SE LE VUELVE A PREGUNTAR SI LE LLEGÓ LA ORDEN, del lado del servidor.
//
// Es la misma regla que src/modules/controlObra/entregaDeOrdenes.js. Vive
// repetida porque lo que corre en Vercel no puede importar de src/, y
// pruebas/entregaDeOrdenes.test.mjs compara las dos caso por caso.

export const LLEGO = ["delivered", "opened", "clicked"];
export const REBOTO = ["bounced", "complained", "failed"];
export const DIAS_QUE_SE_PREGUNTA = 7;

const estadoDe = a => String(a?.envio_estado || "").trim().toLowerCase();

export const leReboto = a => REBOTO.includes(estadoDe(a)) && !a?.aprobado_at;

export function sinConfirmar(a, ahora = Date.now()) {
  if (!a?.envio_id || !a.envio_at) return false;
  if (a.aprobado_at || String(a.observacion || "").trim()) return false;
  const e = estadoDe(a);
  if (LLEGO.includes(e) || REBOTO.includes(e) || e === "canceled") return false;
  const hace = ahora - new Date(a.envio_at).getTime();
  return Number.isFinite(hace) && hace <= DIAS_QUE_SE_PREGUNTA * 86400000;
}
