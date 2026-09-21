// Buscar rubros por nombre, como los busca una persona: sin tildes, sin
// importar mayúsculas, por partes del nombre y en cualquier orden. "encof
// losa" encuentra "Encofrado de losa de entrepiso".
//
// La búsqueda de la base se hacía en el servidor con un ilike de la frase
// entera: "piso flotante" no encontraba "Instalación de piso flotante 8mm"
// si estaba escrito distinto, y si la consulta fallaba no se veía el error,
// solo una lista vacía. Ahora se busca en memoria sobre los rubros ya
// leídos, que son pocos y se leen una vez.

export const pelado = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9ñ.,%/ ]/g, " ").replace(/\s+/g, " ").trim();

const terminos = s => pelado(s).split(" ").filter(p => p.length > 1);

/**
 * Qué tanto responde un texto a lo que se busca, de 0 (nada) a 100.
 * Cuenta cuántas palabras de la búsqueda aparecen, premia la frase completa
 * y el empezar por ella, y desempata con el rubro más corto —el más preciso—.
 */
export function puntaje(texto, consulta) {
  const t = pelado(texto), q = pelado(consulta);
  if (!t || !q) return 0;
  if (t === q) return 100;
  const busca = terminos(consulta);
  if (!busca.length) return 0;
  const enTexto = ` ${t} `;
  let hallados = 0, enteros = 0;
  busca.forEach(p => {
    if (enTexto.includes(` ${p} `) || enTexto.includes(` ${p}s `)) { hallados++; enteros++; }
    // Media palabra cuenta si empieza una: "mamposter" encuentra
    // "mampostería", pero "piso" no puede encontrar "entrepiso".
    else if (enTexto.includes(` ${p}`)) hallados++;
  });
  if (!hallados) return 0;
  // Con varias palabras, al menos la mitad tienen que estar: si no, no es el rubro.
  if (hallados < Math.ceil(busca.length / 2)) return 0;
  let p = (hallados / busca.length) * 55 + (enteros / busca.length) * 10;
  if (t.startsWith(q)) p += 25;
  else if (t.includes(q)) p += 15;
  p += Math.max(0, 8 - t.length / 20);          // entre dos que calzan, el más corto
  return Math.min(99, p);
}

/**
 * Los rubros que responden a un texto, el que más calza primero.
 * @param lista  [{ descripcion, unidad, ... }]
 */
export function buscarRubros(lista = [], texto, { limite = 40 } = {}) {
  if (!pelado(texto)) return [];
  return lista
    .map(r => ({ ...r, puntaje: puntaje(r.descripcion, texto) }))
    .filter(r => r.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje || String(a.descripcion).length - String(b.descripcion).length)
    .slice(0, limite);
}

// ── Rubros parecidos ──────────────────────────────────────────────────────
// Para cuando el rubro del presupuesto no está escrito igual que en la base:
// "Pintura de caucho en paredes" y "Pintura caucho interior en pared" son el
// mismo trabajo. Se comparan las palabras que comparten, no el texto entero.

const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "en", "con", "y", "a", "para", "por", "un", "una", "e", "o", "al", "sobre", "tipo", "incluye"]);

// Al comparar rubros, singular y plural son la misma palabra: "Pintura en
// paredes interiores" y "Pintura en pared interior" son el mismo trabajo.
const raiz = p => (p.length > 5 && p.endsWith("es") ? p.slice(0, -2) : p.length > 3 && p.endsWith("s") ? p.slice(0, -1) : p);

/** Las palabras que dicen algo de una descripción, sin artículos ni muletillas. */
export const palabrasClave = s => new Set(terminos(s).filter(p => !VACIAS.has(p)).map(raiz));

/** Qué tanto se parecen dos conjuntos de palabras, de 0 a 100. */
export function parecidoDePalabras(x, y) {
  if (!x.size || !y.size) return 0;
  let comunes = 0;
  x.forEach(p => { if (y.has(p)) comunes++; });
  return Math.round((2 * comunes) / (x.size + y.size) * 100);
}

/** Qué tanto se parecen dos descripciones, de 0 a 100. */
export function parecido(a, b) {
  return parecidoDePalabras(palabrasClave(a), palabrasClave(b));
}

/**
 * Los rubros de la base parecidos a uno del presupuesto, sin contar el que
 * ya es idéntico. Los de la misma unidad primero: el mismo trabajo por m² y
 * por ml no son precios comparables.
 */
export function parecidosA(item, lista = [], { minimo = 40, limite = 8, mismaUnidad } = {}) {
  const suyo = pelado(item.descripcion);
  return lista
    .map(r => ({ ...r, parecido: parecido(item.descripcion, r.descripcion) }))
    .filter(r => r.parecido >= minimo && pelado(r.descripcion) !== suyo)
    .sort((a, b) => {
      if (mismaUnidad) {
        const ma = mismaUnidad(a) ? 1 : 0, mb = mismaUnidad(b) ? 1 : 0;
        if (ma !== mb) return mb - ma;
      }
      return b.parecido - a.parecido;
    })
    .slice(0, limite);
}
