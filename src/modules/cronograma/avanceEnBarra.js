// Cómo se dibuja el avance en una barra del cronograma impreso.
//
// Aparte del generador del PDF porque es la cuenta que no puede estar mal y
// la única que se puede probar sin dibujar nada: qué pedazo de la barra es lo
// ejecutado y cuál lo que falta.

/**
 * El mismo color, aclarado: lo que a una barra le falta ejecutar. La pantalla
 * le pone encima un blanco al 55 %, y en el papel sale igual.
 */
export const aclarado = color => color.map(c => Math.round(c * 0.45 + 255 * 0.55));

/** El avance de una fila, entero y entre 0 y 100. */
export const hechoDe = f => Math.max(0, Math.min(100, Math.round(Number(f?.avance) || 0)));

/**
 * Qué tramo de una barra en curso es lo que FALTA, dentro de lo que entra en
 * la hoja.
 *
 * El avance se mide sobre la barra entera —de su primer día al último—, no
 * sobre el pedazo que cayó en esta hoja: una barra partida entre dos hojas
 * mostraba en cada una su porcentaje como si fuera completa.
 *
 * @param xBarra        dónde empieza la barra entera (puede caer fuera de la hoja)
 * @param anchoTotal    cuánto mide entera
 * @param xVisible      dónde empieza lo que se ve en esta hoja
 * @param anchoVisible  cuánto se ve
 * @returns { desde, ancho } en las mismas unidades, o null si en esta hoja no
 *   falta nada (no empezó, ya terminó, o lo que falta cae en otra hoja)
 */
export function tramoQueFalta({ xBarra, anchoTotal, avance, xVisible, anchoVisible }) {
  const hecho = Math.max(0, Math.min(100, Number(avance) || 0));
  if (hecho <= 0 || hecho >= 100) return null;
  const desde = Math.max(xVisible, xBarra + anchoTotal * (hecho / 100));
  const ancho = xVisible + anchoVisible - desde;
  return ancho > 0.05 ? { desde, ancho } : null;
}
