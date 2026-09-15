// Rubros de la base que parecen el mismo.
//
// Antes se agrupaban por las primeras 25 letras: "Porcelanato 60x60 importado"
// y "Porcelanato 60x60 nacional" salían como duplicados, y como no había forma
// de decir "son distintos", volvían a salir cada vez. Acá se comparan las
// palabras con significado y la unidad —el mismo trabajo por m² y por ml no es
// un duplicado—, y los pares que alguien marcó como distintos no se muestran más.

import { normalizarUnidad } from "./unidades";

const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "y", "e", "o", "en", "con", "para", "por", "a", "al", "un", "una", "tipo", "incluye", "inc", "incl"]);

export const normalDesc = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const palabras = s => new Set(normalDesc(s).split(" ").filter(p => p && !VACIAS.has(p)));

/** La misma clave para (a, b) y (b, a). */
export const clavePar = (a, b) => (Number(a) < Number(b) ? `${a}-${b}` : `${b}-${a}`);

// Una letra de diferencia en una palabra larga es un error de tipeo
// ("amnstrong", "armstrong"), no otra palabra.
function casiIgual(a, b) {
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false;
  let i = 0, j = 0, dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++dif > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}

// Parecidos si dicen lo mismo con otras palabras de relleno. No lo son si
// cambia una medida ("válvula 1"" y "válvula 3/4"") ni si una palabra reemplaza
// a otra ("hormigón en losas" y "hormigón en vigas"): eso es otro concepto.
// Sí lo son si difieren en tildes, en un error de tipeo o en una o dos
// palabras de más ("incluye encofrado").
function parecidos(x, y) {
  if (x.norm === y.norm) return true;
  if (x.numeros !== y.numeros) return false;
  let soloX = [...x.p].filter(w => !y.p.has(w));
  let soloY = [...y.p].filter(w => !x.p.has(w));
  soloX = soloX.filter(w => {
    const k = soloY.findIndex(v => casiIgual(w, v));
    if (k < 0) return true;
    soloY.splice(k, 1);
    return false;
  });
  if (soloX.length && soloY.length) return false;
  const comunes = x.p.size - soloX.length;
  return comunes >= 2 && soloX.length + soloY.length <= 2;
}

/**
 * @param rubros     [{ id, descripcion, unidad, ... }]
 * @param distintos  Set de clavePar marcados como distintos
 * @returns [{ rubros: [...], exacto: bool }]  los grupos, los más grandes primero
 */
export function agruparDuplicados(rubros = [], distintos = new Set()) {
  const items = rubros.map(r => ({
    r, norm: normalDesc(r.descripcion), p: palabras(r.descripcion),
    numeros: (normalDesc(r.descripcion).match(/\d+/g) || []).join(" "),
    u: normalizarUnidad(r.unidad).canon || normalDesc(r.unidad),
  }));

  // Para no comparar todos contra todos: solo rubros que comparten al menos
  // una palabra poco común.
  const porPalabra = new Map();
  items.forEach((it, i) => it.p.forEach(w => { if (!porPalabra.has(w)) porPalabra.set(w, []); porPalabra.get(w).push(i); }));

  const padre = items.map((_, i) => i);
  const raiz = i => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  const vistos = new Set();

  porPalabra.forEach(indices => {
    if (indices.length > 150) return;   // palabras como "suministro" no sirven para acercar
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const i = indices[a], j = indices[b];
        const k = `${i}-${j}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        const x = items[i], y = items[j];
        if (x.u && y.u && x.u !== y.u) continue;
        if (distintos.has(clavePar(x.r.id, y.r.id))) continue;
        if (parecidos(x, y)) padre[raiz(i)] = raiz(j);
      }
    }
  });

  const grupos = new Map();
  items.forEach((it, i) => {
    const g = raiz(i);
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(it);
  });
  return [...grupos.values()]
    .filter(g => g.length > 1)
    .map(g => ({ rubros: g.map(x => x.r), exacto: g.every(x => x.norm === g[0].norm) }))
    .sort((a, b) => (b.exacto - a.exacto) || (b.rubros.length - a.rubros.length));
}
