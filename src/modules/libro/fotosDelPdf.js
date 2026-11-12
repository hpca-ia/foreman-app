// LAS FOTOS DEL LIBRO EN EL PAPEL: GRANDES, ENTERAS Y SIN DEFORMAR.
//
// «Las fotos se ven muy pequeñas» (Hernán, 12/11/2026). Iban de a dos por
// fila, en dos columnas iguales, con un tope de 150 puntos de alto. Casi toda
// foto de obra se saca con el teléfono parado: en el libro del Aeropuerto, 66
// de 83 eran verticales y salían de 94 × 150 puntos —tres centímetros de
// ancho—, con media columna en blanco a cada lado.
//
// Ahora todas las fotos de una fila tienen el mismo alto, el doble que antes,
// y cada una el ancho que le da su proporción. Entran las que quepan a lo
// ancho de la hoja: tres verticales, o dos de proporción media, o una
// apaisada sola, que así sale casi a hoja entera. Ninguna se recorta ni se
// estira, y van en el orden en que se subieron.
//
// Sin pantalla ni base: se puede probar (pruebas/fotosDelLibro.test.mjs).

const n = v => Number(v) || 0;

/** El alto de una fila de fotos y el espacio entre una y otra, en puntos. */
export const ALTO_DE_FOTO = 290;
export const ENTRE_FOTOS = 10;

/**
 * Las fotos acomodadas en filas.
 *
 * @param fotos  [{ width, height }] en píxeles, en el orden en que van
 * @param ancho  el ancho útil de la hoja
 * @param alto   el alto de la fila: ninguna foto es más alta que eso
 * @returns [{ alto, fotos: [{ indice, x, w, h }] }]
 *   `x` se cuenta desde el margen izquierdo; `alto` es el de la foto más alta
 *   de la fila
 */
export function filasDeFotos(fotos = [], { ancho, alto = ALTO_DE_FOTO, entre = ENTRE_FOTOS } = {}) {
  const filas = [];
  let fila = null;
  fotos.forEach((f, indice) => {
    const w0 = n(f?.width ?? f?.ancho), h0 = n(f?.height ?? f?.alto);
    // Sin medidas no se puede proporcionar nada: se la trata como una apaisada común.
    const proporcion = w0 && h0 ? w0 / h0 : 4 / 3;
    // Al alto de la fila; si así no entra en la hoja, al ancho de la hoja.
    let w = alto * proporcion, h = alto;
    if (w > ancho) { w = ancho; h = ancho / proporcion; }
    const ocupado = fila ? fila.fotos.reduce((t, x) => t + x.w, 0) + entre * fila.fotos.length : 0;
    if (!fila || ocupado + w > ancho + 0.01) { fila = { alto: 0, fotos: [] }; filas.push(fila); }
    const x = fila.fotos.reduce((t, p) => t + p.w + entre, 0);
    fila.fotos.push({ indice, x, w, h });
    fila.alto = Math.max(fila.alto, h);
  });
  return filas;
}
