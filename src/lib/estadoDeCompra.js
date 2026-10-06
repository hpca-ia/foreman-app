import { ESTADOS } from "../modules/compras/compras";

/**
 * El estado que muestra un aviso de compra en el tablero.
 *
 * Una tarea de compra con estado "En proceso" es cierta y no sirve para nada:
 * lo que uno necesita saber al verla en su lista es en qué paso está la compra
 * —esperando el visto, aprobada y sin comprar, comprada y sin recibir— porque
 * eso es lo que decide si le toca hacer algo ahora.
 *
 * Usa las mismas etiquetas y los mismos colores que el módulo Compras a
 * propósito: dos pantallas que nombran distinto lo mismo obligan a traducir.
 *
 * @returns {{label:string,color:string}|null} null si no es un aviso de compra
 */
export function estadoDeCompra(tarea) {
  if (!tarea?.compra_estado) return null;
  if (tarea.status === "listo") return null;      // ya se destrabó: vale el estado normal
  return ESTADOS[tarea.compra_estado] || null;
}

/** Lo que está esperando a esta persona y no tiene fecha que lo delate. */
export const esperaMiVisto = (tarea, usuarioId) =>
  tarea?.compra_estado === "pendiente_aprobacion"
  && tarea.status !== "listo"
  && tarea.assignee_id === usuarioId;

/**
 * ¿Esta compra VOLVIÓ al que la aprobó, o nunca se aprobó?
 *
 * Las dos están en "esperando visto" y no son lo mismo. Una es un pedido
 * nuevo. La otra ya se aprobó, compras la empezó a gestionar y la devolvió
 * porque el número cambió —aprobaron 500 y ahora son 800— así que el visto
 * anterior ya no cubre lo que hay que pagar.
 *
 * Mostradas iguales, el que aprueba ve que "sigue pendiente" después de que
 * alguien la devolvió y entiende que la devolución no hizo nada. Hizo algo:
 * se la devolvió A ÉL, a propósito.
 *
 * No hace falta una columna: si tiene fecha de aprobación y está esperando
 * visto otra vez, es que volvió.
 */
export const volvioAlVisto = c => c?.estado === "pendiente_aprobacion" && !!c?.aprobado_at;
