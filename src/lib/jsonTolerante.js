// Leer el JSON de una respuesta que se cortó a la mitad.
//
// Un modelo tiene un tope de salida. Cuando la respuesta no entra —veinte
// agrupaciones con sus dependencias y el porqué de cada una— vuelve cortada en
// mitad de un objeto, y `JSON.parse` tira todo: el error dice "Expected ',' or
// ']' at position 10388" y el usuario se queda sin nada, cuando el modelo
// había calculado bien las primeras dieciocho.
//
// Lo correcto es subir el tope, y está subido. Pero un tope siempre se puede
// quedar corto con una obra más grande, y perder todo el trabajo por el último
// renglón es una forma cara de fallar. Acá se recorta hasta el último elemento
// COMPLETO y se cierran los corchetes que falten: se pierde lo que de verdad
// se cortó y se salva lo demás, diciendo cuánto.
//
// Nada se adivina ni se completa: lo que no llegó entero, no entra.

/**
 * Qué cierres le faltan a un JSON a medio escribir.
 *
 * Recorre contando llaves y corchetes, salteando lo que está adentro de
 * comillas —una llave dentro de un texto no abre nada— y respetando el
 * escape. Devuelve el cierre que falta, o null si quedó adentro de un texto
 * sin terminar, que no se puede cerrar sin inventar.
 */
function cierresQueFaltan(txt) {
  const pila = [];
  let enTexto = false, escapado = false;
  for (const c of txt) {
    if (enTexto) {
      if (escapado) escapado = false;
      else if (c === "\\") escapado = true;
      else if (c === '"') enTexto = false;
      continue;
    }
    if (c === '"') enTexto = true;
    else if (c === "{" || c === "[") pila.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") {
      if (pila[pila.length - 1] !== c) return null;   // mal balanceado
      pila.pop();
    }
  }
  if (enTexto) return null;
  return pila.reverse().join("");
}

/**
 * El JSON de una respuesta, aunque haya llegado cortada.
 *
 * @returns {{ datos: object|null, cortado: boolean }}
 */
export function jsonTolerante(texto) {
  const limpio = String(texto || "").replace(/```json|```/g, "").trim();
  const abre = limpio.indexOf("{");
  if (abre < 0) return { datos: null, cortado: false };
  const desde = limpio.slice(abre);

  // Lo normal: llegó entero.
  const entero = desde.match(/\{[\s\S]*\}/);
  if (entero) {
    try { return { datos: JSON.parse(entero[0]), cortado: false }; } catch { /* sigue abajo */ }
  }

  // Cortada: se prueba cerrando después de cada objeto completo, del final
  // hacia atrás, hasta que uno parsee. El primero que entra es el que más
  // conserva.
  let corte = desde.lastIndexOf("}");
  let vueltas = 0;
  while (corte > 0 && vueltas++ < 500) {
    const trozo = desde.slice(0, corte + 1);
    const faltan = cierresQueFaltan(trozo);
    if (faltan !== null) {
      try { return { datos: JSON.parse(trozo + faltan), cortado: true }; } catch { /* probar más atrás */ }
    }
    corte = desde.lastIndexOf("}", corte - 1);
  }
  return { datos: null, cortado: false };
}
