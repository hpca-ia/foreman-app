// EL TEXTO EN EL PAPEL: que entre en la hoja, a lo ancho y a lo alto.
//
// jsPDF no corta solo: escribe cada renglón hasta donde llegue y sigue fuera
// del papel. Para que no pase hay que partir el texto antes, y la cuenta de
// dónde partir la hace CON LA LETRA QUE ESTÉ PUESTA EN ESE MOMENTO.
//
// Ahí estaba el error del libro de obra. El texto de cada entrada se partía
// antes de poner su letra: se medía con la que había dejado la firma de la
// entrada anterior —7,5 puntos— y se escribía con la suya —9,5—. Cada renglón
// salía un cuarto más largo que la hoja: en el libro del Aeropuerto, 138
// renglones se pasaban entre 100 y 150 puntos del margen derecho y lo que
// quedaba afuera no se leía. La primera entrada de cada categoría se salvaba
// porque la letra anterior era la del título.
//
// Acá partir y poner la letra son una sola cosa: no se puede hacer lo uno sin
// lo otro. Sin pantalla ni base: se puede probar (pruebas/textoDelLibro.test.mjs
// y pruebas/textoDeLosPdf.test.mjs).
//
// NACIÓ EN EL LIBRO Y ES DE TODOS LOS PDF. La revisión del presupuesto tenía
// el mismo error —el título de cada punto se medía con la letra de las filas
// del punto de arriba— y el acta lo tenía al revés, en los pies de foto.

// LO QUE jsPDF MIDE DE UNA MANERA Y DIBUJA DE OTRA. Al tabulador —llega al
// pegar desde Word o desde Excel— lo cuenta como un signo y lo escribe como
// ocho espacios: en letra de 10, cada uno corre el renglón 17 puntos más allá
// de donde se midió, y con tres el renglón ya pasó el margen. Y el espacio
// duro no deja partir entre las dos palabras que une.
export const medible = t => String(t ?? "").replace(/\t/g, " ").replace(/\u00a0/g, " ");

// Y además, a máquina de escribir: comillas rectas y guiones en lugar de las
// comillas curvas y las rayas. El papel que escribe sus rayas a propósito —el
// acta, la solicitud de compra, el presupuesto— parte con `medible` y nada más.
export const seguro = t => medible(t)
  .replace(/[«»]/g, '"').replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

/**
 * El texto partido en renglones que entran en `ancho`, con la letra con la que
 * se va a escribir. Deja esa letra puesta: lo que se escriba enseguida sale
 * con la misma con la que se midió.
 *
 * @param estilo   "normal" | "bold" | "italic"
 * @param letra    el tamaño, en puntos
 * @param limpiar  `seguro`, o `medible` para el papel que conserva sus rayas.
 *                 Se limpia ANTES de medir: lo que se mide es lo que se escribe.
 */
export function partirTexto(doc, texto, ancho, estilo = "normal", letra = 9.5, limpiar = seguro) {
  doc.setFont("helvetica", estilo); doc.setFontSize(letra);
  return doc.splitTextToSize(limpiar(texto), ancho);
}

/**
 * En cuántas tandas se escribe un bloque de renglones, y en cuál hoja va cada
 * una, para que ninguno quede debajo del margen de abajo.
 *
 *   · Si entra en lo que queda de la hoja, va ahí.
 *   · Si no entra ahí pero sí en una hoja vacía, pasa entero a la siguiente:
 *     una entrada partida en dos hojas se lee peor.
 *   · Si no entra ni en una hoja vacía, se escribe hasta donde alcance el
 *     papel y sigue en la otra.
 *
 * @param cuantos  cuántos renglones son
 * @param y        dónde se está en la hoja
 * @param paso     el alto de un renglón
 * @param techo    dónde se empieza a escribir en una hoja nueva
 * @param piso     hasta dónde se puede escribir
 * @param cola     lo que va pegado abajo del bloque y no puede quedar solo en
 *                 otra hoja (la firma de la entrada)
 * @returns [{ desde, hasta, hojaNueva }]  rangos de renglones [desde, hasta)
 */
export function tandasDeRenglones({ cuantos, y, paso, techo, piso, cola = 0 }) {
  const out = [];
  if (!(cuantos > 0)) return out;
  const caben = desde => Math.max(0, Math.floor((piso - desde) / paso));
  const enHojaVacia = caben(techo);
  let hojaNueva = false;
  let dondeEstoy = y;
  // Entera en la hoja siguiente, si ahí sí entra con su firma.
  if (cuantos * paso + cola > piso - y && cuantos * paso + cola <= piso - techo) { hojaNueva = true; dondeEstoy = techo; }
  let i = 0;
  while (i < cuantos) {
    let n = Math.min(cuantos - i, caben(dondeEstoy));
    if (n <= 0) { hojaNueva = true; dondeEstoy = techo; n = Math.min(cuantos - i, Math.max(1, enHojaVacia)); }
    out.push({ desde: i, hasta: i + n, hojaNueva });
    i += n; hojaNueva = true; dondeEstoy = techo;
  }
  return out;
}
