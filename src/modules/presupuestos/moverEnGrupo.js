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
