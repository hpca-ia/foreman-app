// ¿Lo que escribió es el nombre que había que escribir?
//
// El seguro de los borrados definitivos es copiar el nombre a mano: obliga a
// leer cuál es, que es justo donde se cometen estos errores. Pero la
// comparación era exacta, y el nombre se muestra en una página web, donde dos
// espacios seguidos se ven como uno. Un presupuesto que se llamaba
// "FORMATO ÚNICO DE PRESUPUESTO  Remodelación…" —con dos espacios, un dedazo
// de hace un mes— no se podía borrar nunca: la pantalla pedía escribir algo
// que no se podía ver, el botón quedaba gris y no había nada que explicara por
// qué. Un seguro que no se puede abrir no es un seguro, es una traba.
//
// Se perdona lo invisible —espacios de más, mayúsculas, tildes— y no se
// perdona nada más: hay que haber leído el nombre y haberlo escrito.

export function normalizarParaConfirmar(t) {
  return String(t ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const igualParaConfirmar = (escrito, esperado) =>
  !!normalizarParaConfirmar(esperado) &&
  normalizarParaConfirmar(escrito) === normalizarParaConfirmar(esperado);
