// RECORRER UN CUADRO ANCHO AGARRÁNDOLO: las reglas, sin pantalla.
//
// De qué no se agarra, cuándo un clic pasa a ser un arrastre y a dónde va el
// cuadro. El gesto en sí —escuchar el mouse y mover el cuadro— está en
// arrastrarParaRecorrer.js.

/** De qué no se agarra. */
export const NO_SE_AGARRA = "input,button,select,textarea,a,label,[contenteditable],.no-se-agarra";

/** A partir de cuántos píxeles un clic pasa a ser un arrastre. */
export const UMBRAL = 4;

/**
 * A dónde va el cuadro con el mouse en (x, y), agarrado en `inicio`.
 * @param inicio  { x, y, left, top, movido }: dónde se agarró y cómo estaba
 * @returns null si todavía no se movió lo bastante para ser un arrastre, o
 *          { left, top }: cuánto tiene que estar corrido a los costados y hacia abajo
 */
export function aDondeVa(inicio, x, y) {
  const dx = x - inicio.x, dy = y - inicio.y;
  if (!inicio.movido && Math.abs(dx) + Math.abs(dy) < UMBRAL) return null;
  return { left: inicio.left - dx, top: inicio.top - dy };
}
