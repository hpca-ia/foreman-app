import { baseSinIva } from "./contratoDeLaObra.js";

// UNA COTIZACIÓN CONTRA VARIOS RUBROS DEL PRESUPUESTO.
//
// Hernán, 18/11/2026: «Tengo una cotización a la que la subo manualmente, la
// podría comparar con un rubro del presupuesto o varios rubros del
// presupuesto; al momento solo me deja comparar con uno». Y de Diferencias:
// «solo me permite escoger uno y a veces la compra de material afecta a más de
// un rubro».
//
// Una compra de porcelanato sirve al piso y a las barrederas; un contratista
// cotiza «gypsum» y son el tumbado, la pared de una cara y la de dos. Atada a
// un solo rubro, la comparación sale contra un pedazo del presupuesto y
// muestra una pérdida que no existe.
//
// CÓMO SE COMPARA, que lo definió él: «total contra la suma». El total de la
// cotización contra la suma de lo presupuestado de los rubros elegidos, sin
// IVA. Un solo beneficio o pérdida para el grupo. No se compara precio
// unitario ni cantidad: los rubros de un grupo pueden tener unidades
// distintas, y sumar metros con unidades no dice nada.
//
// CÓMO SE GUARDA: el primero sigue en la columna de siempre (`obra_rubro_id`
// en un beneficio, `rubro_id` en un renglón leído), que es por donde todo lo
// demás lo encuentra; la lista entera va en `rubros` solo cuando son varios.
// Con uno solo no cambia nada de lo que ya había.

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

/**
 * Los rubros contra los que va un beneficio o un renglón: su lista, o el único
 * de siempre. Sin repetir y en el orden en que se eligieron.
 */
export function rubrosDe(x) {
  const lista = Array.isArray(x?.rubros) && x.rubros.length ? x.rubros : [x?.obra_rubro_id ?? x?.rubro_id];
  const vistos = new Set();
  return lista.map(id => Number(id)).filter(id => id > 0 && !vistos.has(id) && vistos.add(id));
}

/** ¿Va contra más de un rubro? */
export const sonVarios = x => rubrosDe(x).length > 1;

/** Sumar un rubro a la lista, o sacarlo si ya estaba. */
export function conmutar(ids = [], id) {
  const limpio = rubrosDe({ rubros: ids });
  const k = Number(id);
  if (!(k > 0)) return limpio;
  return limpio.includes(k) ? limpio.filter(x => x !== k) : [...limpio, k];
}

/**
 * Cómo se guardan: el primero en la columna de siempre, y la lista solo si son
 * varios. @param columna  "obra_rubro_id" (un beneficio) o "rubro_id" (un renglón)
 */
export function paraGuardar(ids = [], columna = "obra_rubro_id") {
  const limpio = rubrosDe({ rubros: ids });
  return { [columna]: limpio[0] ?? null, rubros: limpio.length > 1 ? limpio : null };
}

/**
 * El grupo: los rubros que existen de esa lista, lo que suman sin IVA y cuánto
 * pesa cada uno —para repartir entre ellos lo que haga falta—.
 * @returns { rubros, presupuestado, pesos: { [id]: 0..1 }, faltan }
 */
export function grupoDe(ids = [], rubros = []) {
  const porId = new Map((rubros || []).map(r => [Number(r.id), r]));
  const lista = rubrosDe({ rubros: ids });
  const suyos = lista.map(id => porId.get(id)).filter(Boolean);
  const bases = suyos.map(r => Math.max(0, baseSinIva(r)));
  const total = bases.reduce((t, b) => t + b, 0);
  const pesos = {};
  // Sin nada presupuestado en ninguno, a partes iguales: no hay otra medida.
  suyos.forEach((r, i) => { pesos[r.id] = total > 0 ? bases[i] / total : 1 / suyos.length; });
  return { rubros: suyos, presupuestado: c2(suyos.reduce((t, r) => t + baseSinIva(r), 0)), pesos, faltan: lista.length - suyos.length };
}

/** «44 PISO LAMINADO, 29 TUMBADO GYPSUM y 1 más»: cómo se nombran en un renglón. */
export function comoSeLlaman(ids = [], rubros = [], { tope = 2, largo = 34 } = {}) {
  const { rubros: suyos } = grupoDe(ids, rubros);
  if (!suyos.length) return "";
  const nombre = r => `${r.numero ?? ""} ${String(r.descripcion || "").slice(0, largo)}`.trim();
  const dichos = suyos.slice(0, tope).map(nombre);
  const resto = suyos.length - dichos.length;
  return resto > 0 ? `${dichos.join(", ")} y ${resto} más` : dichos.join(", ");
}
