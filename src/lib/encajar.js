// UNA FOTO ADENTRO DE UN HUECO, SIN DEFORMARLA.
//
// En el PDF las fotos van en una grilla de dos columnas, y el alto tiene un
// tope para que una sola no se coma la hoja. El error estaba ahí: se le daba
// el ancho entero de la columna y el alto recortado al tope. Una foto apaisada
// entra proporcionada de casualidad —su alto no llega al tope— pero una foto
// vertical, que es como se saca el 90% de las fotos de obra con el teléfono,
// salía aplastada: la misma pared, más gorda y más baja.
//
// Recortar un lado obliga a recortar el otro en la misma proporción. Eso es
// todo lo que hace esto, y vive acá porque el acta y el libro de obra arman la
// misma grilla y el error estaba igual en los dos.

/**
 * @param img   { width, height } de la imagen (o { ancho, alto })
 * @param hueco { ancho, alto } lo máximo que puede ocupar, en la unidad del PDF
 * @returns { w, h, dx } el tamaño que respeta la proporción, y cuánto correrla
 *   a la derecha para que quede centrada en su columna.
 */
export function encajar(img, { ancho, alto }) {
  const w0 = Number(img?.width ?? img?.ancho) || 0;
  const h0 = Number(img?.height ?? img?.alto) || 0;
  // Sin medidas no se puede proporcionar nada: ocupa el hueco y se nota.
  if (!w0 || !h0) return { w: ancho, h: alto, dx: 0 };
  const escala = Math.min(ancho / w0, alto / h0);
  const w = w0 * escala, h = h0 * escala;
  return { w, h, dx: (ancho - w) / 2 };
}
