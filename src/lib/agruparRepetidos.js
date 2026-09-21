import { pelado, palabrasClave, parecidoDePalabras } from "./buscarRubros";

// Rubros repetidos dentro de un mismo presupuesto.
//
// Repetido no es solo el rubro escrito igual dos veces: al armar un
// presupuesto entre varios archivos aparece "Pintura de caucho en paredes" en
// un capítulo y "Pintura caucho interior en pared" en otro. Son el mismo
// trabajo con dos cantidades sueltas, y así se cotiza dos veces.
//
// Se agrupan los escritos igual y los que comparten la mayoría de sus
// palabras. Para no comparar todos contra todos —un presupuesto grande son
// cientos de rubros— solo se comparan los que comparten alguna palabra.

const n = v => Number(v) || 0;

/**
 * @param items   rubros del presupuesto [{ id, descripcion, unidad, cantidad, precio_unitario, total, capitulo }]
 * @param minimo  cuánto se tienen que parecer para caer en el mismo grupo (0 a 100)
 * @returns [{ items, iguales, unidades, capitulos, cantidad, monto, precioMin, precioMax }] de mayor monto a menor
 */
export function gruposRepetidos(items = [], { minimo = 70 } = {}) {
  const datos = items.map(i => ({ item: i, clave: pelado(i.descripcion), palabras: palabrasClave(i.descripcion) }));

  // Índice palabra → rubros, para comparar solo contra los que algo comparten.
  const porPalabra = new Map();
  datos.forEach((d, idx) => d.palabras.forEach(p => {
    if (!porPalabra.has(p)) porPalabra.set(p, []);
    porPalabra.get(p).push(idx);
  }));

  const grupoDe = new Array(datos.length).fill(-1);
  const grupos = [];
  datos.forEach((d, idx) => {
    if (grupoDe[idx] !== -1) return;
    const grupo = [idx];
    grupoDe[idx] = grupos.length;
    const candidatos = new Set();
    d.palabras.forEach(p => (porPalabra.get(p) || []).forEach(k => { if (k > idx && grupoDe[k] === -1) candidatos.add(k); }));
    candidatos.forEach(k => {
      const o = datos[k];
      if (o.clave === d.clave || parecidoDePalabras(d.palabras, o.palabras) >= minimo) {
        grupoDe[k] = grupos.length;
        grupo.push(k);
      }
    });
    grupos.push(grupo);
  });

  return grupos
    .filter(g => g.length > 1)
    .map(g => {
      const suyos = g.map(k => datos[k].item);
      const precios = suyos.map(i => n(i.precio_unitario)).filter(v => v > 0);
      return {
        items: suyos,
        iguales: new Set(g.map(k => datos[k].clave)).size === 1,
        unidades: [...new Set(suyos.map(i => String(i.unidad || "").trim()).filter(Boolean))],
        capitulos: [...new Set(suyos.map(i => i.capitulo))],
        cantidad: suyos.reduce((s, i) => s + n(i.cantidad), 0),
        monto: suyos.reduce((s, i) => s + n(i.total), 0),
        precioMin: precios.length ? Math.min(...precios) : 0,
        precioMax: precios.length ? Math.max(...precios) : 0,
      };
    })
    .sort((a, b) => b.monto - a.monto);
}

/** El rubro del grupo que conviene conservar: el de mayor monto. */
export function principalDe(grupo) {
  return [...grupo.items].sort((a, b) => n(b.total) - n(a.total))[0];
}
