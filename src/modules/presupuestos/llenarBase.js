// LLENAR EL PRESUPUESTO CON LO QUE COTIZÓ UN PROVEEDOR.
//
// El presupuesto ya tiene sus rubros —la base, muchas veces en blanco— y el
// proveedor cotiza algunos de esos mismos. Cargar su cotización como un
// capítulo aparte obliga a copiar precio por precio a mano. Acá el precio va a
// su rubro: NOVA dice cuál rubro del presupuesto es cada renglón de la
// cotización, quien importa lo ve y lo corrige, y recién entonces se escribe.
//
// Del rubro del presupuesto no se toca ni la descripción ni la cantidad: son
// las del cliente. Solo entra el precio. La cantidad y la unidad de la
// cotización se usan únicamente donde el presupuesto no tiene ninguna.

import { estructura } from "./estructura.js";

const n = v => Number(v) || 0;
const r2 = v => Math.round(v * 100) / 100;

/**
 * Los rubros del presupuesto, en el orden y con el número que se ven en
 * pantalla, y además numerados de corrido (1, 2, 3…) para que NOVA los nombre.
 */
export function rubrosDeLaBase({ capitulos = [], items = [] }) {
  const lista = [];
  estructura({ capitulos, items }).forEach(cap => cap.rubros.forEach(r => {
    const item = items.find(i => i.id === r.id);
    if (!item) return;
    lista.push({
      n: lista.length + 1, id: item.id, numero: r.numero, capitulo: cap.nombre,
      descripcion: item.descripcion || "", unidad: item.unidad || "",
      cantidad: n(item.cantidad), precio_unitario: n(item.precio_unitario),
    });
  }));
  return lista;
}

/** Lo que se le agrega al pedido de lectura para que NOVA empareje. */
export function pedidoDeEmparejar(base) {
  if (!base.length) return "";
  const renglones = base.map(b => `${b.n} | ${b.capitulo} | ${b.descripcion} | ${b.unidad} | ${b.cantidad}`).join("\n");
  return ' ADEMAS: este presupuesto ya tiene los rubros de la BASE que va abajo (numero | capitulo | descripcion | unidad | cantidad). A cada rubro de la cotizacion agregale "base": el numero del rubro de la BASE que es el mismo trabajo (la misma descripcion, o una claramente equivalente aunque este abreviada o redactada distinto), o null si no corresponde a ninguno. Si dudas, null: no fuerces. No repitas un numero de la BASE en dos rubros. La "descripcion" sigue siendo la que esta escrita en la cotizacion.\n\nBASE:\n' + renglones;
}

/**
 * Lo que NOVA dijo, pasado a ids: cada rubro leído queda con `base_id` (o
 * null). Un número que no existe se descarta; uno repetido queda solo en el
 * primero, y el otro se elige a mano.
 */
export function emparejar(rubros, base) {
  const porN = new Map(base.map(b => [b.n, b.id]));
  const usados = new Set();
  return rubros.map(r => {
    const { base: dicho, ...resto } = r;
    const id = porN.get(Number(dicho)) ?? null;
    if (id == null || usados.has(id)) return { ...resto, base_id: null };
    usados.add(id);
    return { ...resto, base_id: id };
  });
}

/**
 * Qué se escribe. `rubros` son los de la cotización, ya revisados, cada uno
 * con `base_id` y `precio` (el final, con la utilidad puesta).
 *  - cambios: un renglón por rubro del presupuesto que se llena.
 *  - sueltos: los que no están en la base.
 *  - repetidos: ids de la base a los que apuntan dos renglones (no se aplica).
 */
export function planDeLlenado(rubros, base) {
  const porId = new Map(base.map(b => [b.id, b]));
  const veces = new Map();
  rubros.forEach(r => { if (r.base_id != null) veces.set(r.base_id, (veces.get(r.base_id) || 0) + 1); });
  const cambios = [], sueltos = [];
  rubros.forEach(r => {
    const b = r.base_id != null ? porId.get(r.base_id) : null;
    if (!b) { sueltos.push(r); return; }
    // La cantidad del presupuesto manda; la de la cotización solo si no hay.
    const cantidad = b.cantidad > 0 ? b.cantidad : n(r.cantidad) || 1;
    const precio = r2(n(r.precio));
    cambios.push({
      id: b.id, numero: b.numero, descripcion: b.descripcion,
      precio_unitario: precio, cantidad, total: r2(cantidad * precio),
      unidad: b.unidad || r.unidad || "",
      ponerCantidad: !(b.cantidad > 0), ponerUnidad: !b.unidad && !!r.unidad,
      totalAntes: r2(b.cantidad * b.precio_unitario), precioAntes: b.precio_unitario,
      cantidadCotizada: n(r.cantidad),
    });
  });
  const repetidos = [...veces].filter(([, v]) => v > 1).map(([id]) => id);
  const entra = r2(cambios.reduce((s, c) => s + c.total - c.totalAntes, 0));
  return { cambios, sueltos, repetidos, entra };
}
