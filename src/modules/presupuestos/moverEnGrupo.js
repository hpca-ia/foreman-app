// MOVER VARIOS CAPÍTULOS JUNTOS.
//
// Ordenar un presupuesto importado es casi siempre mover un bloque: los tres
// capítulos de instalaciones que quedaron al final, los dos de acabados que
// van antes de equipamiento. De a uno son quince clics y es fácil perder la
// cuenta. Acá se mueven los marcados juntos, sin cambiar su orden entre ellos.
//
// Sin base de datos a propósito: recibe nombres y devuelve nombres, y se prueba
// sin navegador.

/**
 * Un lugar para arriba (dir = -1) o para abajo (dir = 1). Cada marcado salta
 * al que no está marcado de al lado; si el de al lado también está marcado o
 * es el borde, se queda. Así el bloque se mueve entero y no se mezcla.
 */
export function correrMarcados(nombres, marcados, dir) {
  const lista = [...nombres];
  const es = new Set(marcados);
  const indices = lista.map((_, i) => i);
  const recorrido = dir < 0 ? indices : indices.reverse();
  recorrido.forEach(i => {
    const j = i + dir;
    if (!es.has(lista[i]) || j < 0 || j >= lista.length || es.has(lista[j])) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
  });
  return lista;
}

/**
 * Los marcados, juntos y en su orden, puestos en el lugar de `destino`: antes
 * de ese capítulo (o al final si `destino` es null). Si `destino` es uno de
 * los marcados, el bloque queda donde estaba ese.
 */
export function llevarMarcados(nombres, marcados, destino) {
  const es = new Set(marcados);
  const bloque = nombres.filter(n => es.has(n));
  if (!bloque.length) return [...nombres];
  if (destino != null && es.has(destino)) {
    // El bloque se arma en el lugar del primero de los marcados que esté en
    // la posición de destino o antes.
    const i = nombres.indexOf(destino);
    const antes = nombres.slice(0, i).filter(n => !es.has(n));
    const despues = nombres.slice(i).filter(n => !es.has(n));
    return [...antes, ...bloque, ...despues];
  }
  const resto = nombres.filter(n => !es.has(n));
  const k = destino == null ? resto.length : resto.indexOf(destino);
  return [...resto.slice(0, k < 0 ? resto.length : k), ...bloque, ...resto.slice(k < 0 ? resto.length : k)];
}

// ── LAS HOJAS DEL EXCEL, COMO BLOQUES ──
//
// Un presupuesto que vino de un libro de varias hojas se trabaja igual que el
// libro: cada hoja con sus capítulos juntos, y las hojas una detrás de la
// otra. Mover un capítulo lo mueve dentro de su hoja —nunca entre los de
// otra—, y las hojas se mueven enteras. La hoja de un capítulo es lo que va
// antes de " · " en su nombre.

const SEP = " · ";
const hojaDe = n => { const i = String(n).indexOf(SEP); return i > 0 ? String(n).slice(0, i) : ""; };

/** Las hojas en el orden en que aparecen. */
export const hojasEnOrden = nombres => [...new Set(nombres.map(hojaDe))];

/**
 * Los capítulos con cada hoja junta, sin cambiar el orden de las hojas ni el
 * de los capítulos dentro de cada una. `orden` fija el orden de las hojas (si
 * no se da, el de su primera aparición).
 */
export function juntarPorHoja(nombres, orden = hojasEnOrden(nombres)) {
  const todas = [...orden, ...hojasEnOrden(nombres).filter(h => !orden.includes(h))];
  return todas.flatMap(h => nombres.filter(n => hojaDe(n) === h));
}

/** Correr los marcados un lugar, cada uno dentro de su hoja. */
export function correrEnSuHoja(nombres, marcados, dir) {
  const orden = hojasEnOrden(nombres);
  const lista = juntarPorHoja(nombres, orden);
  return orden.flatMap(h => {
    const suyos = lista.filter(n => hojaDe(n) === h);
    return correrMarcados(suyos, marcados.filter(m => hojaDe(m) === h), dir);
  });
}

/** Llevar los marcados al principio (destino "inicio") o al final de su hoja. */
export function llevarEnSuHoja(nombres, marcados, destino) {
  const orden = hojasEnOrden(nombres);
  const lista = juntarPorHoja(nombres, orden);
  return orden.flatMap(h => {
    const suyos = lista.filter(n => hojaDe(n) === h);
    const mios = marcados.filter(m => hojaDe(m) === h);
    if (!mios.length) return suyos;
    return llevarMarcados(suyos, mios, destino === "inicio" ? suyos.find(n => !mios.includes(n)) ?? null : null);
  });
}

/** Una hoja entera un lugar para arriba (-1) o para abajo (1). */
export function moverHoja(nombres, hoja, dir) {
  const orden = hojasEnOrden(nombres);
  const i = orden.indexOf(hoja), j = i + dir;
  if (i < 0 || j < 0 || j >= orden.length) return juntarPorHoja(nombres, orden);
  [orden[i], orden[j]] = [orden[j], orden[i]];
  return juntarPorHoja(nombres, orden);
}

/** ¿Los dos capítulos son de la misma hoja? Para no soltar uno entre los de otra. */
export const mismaHoja = (a, b) => hojaDe(a) === hojaDe(b);
