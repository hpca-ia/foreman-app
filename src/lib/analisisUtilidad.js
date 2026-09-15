// ¿Estos precios son al costo o ya traen utilidad?
//
// No hay una regla: un presupuesto de FOREMAN puede traer un % sumado por
// capítulo, otro ir al costo con honorarios al final, un proveedor cotiza a su
// precio. Lo que sí se puede hacer es comparar: para los rubros que ya están en
// la base, ¿los precios nuevos están por encima de lo que ya se sabe que
// cuestan? Con esa diferencia, por capítulo, NOVA pregunta en vez de suponer.

import { normalizarUnidad } from "./unidades";

const norm = s => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
// La misma identidad de rubro que usa la base: descripción en su unidad.
export const claveRubro = (desc, unidad) => `${norm(desc)}|${normalizarUnidad(unidad).canon || norm(unidad)}`;

const ordenar = a => [...a].sort((x, y) => x - y);
const cuantil = (a, q) => {
  if (!a.length) return null;
  const s = ordenar(a), pos = (s.length - 1) * q, i = Math.floor(pos);
  return s[i + 1] != null ? s[i] + (s[i + 1] - s[i]) * (pos - i) : s[i];
};
const mediana = a => cuantil(a, 0.5);

/**
 * Un precio del historial sin IVA y, si se sabe, al costo. Lo que cotiza un
 * proveedor es costo para HCA aunque nadie lo haya marcado.
 * @returns { sinIva, costo (null si no se sabe), estado }
 */
export function precioAlCosto(h) {
  const precio = Number(h.precio_unitario) || 0;
  const sinIva = h.iva_incluido === true ? precio / (1 + (Number(h.iva_pct) || 15) / 100) : precio;
  const tipo = h.origen_tipo || (String(h.cliente_nombre || "").trim() ? "cliente" : null);
  const estado = h.utilidad_estado || (tipo === "proveedor" ? "costo" : null);
  if (estado === "costo") return { sinIva, costo: sinIva, estado };
  if (estado === "con_utilidad" && h.utilidad_pct != null) return { sinIva, costo: sinIva / (1 + Number(h.utilidad_pct) / 100), estado };
  return { sinIva, costo: null, estado };
}

/**
 * Compara precios nuevos con los de la base para los mismos rubros.
 * @param nuevos   [{ descripcion, unidad, precio_unitario, capitulo }]
 * @param base     { rubros: [{ id, descripcion, unidad }], precios: [filas de precios_historial] }
 * @param opciones { ivaIncluido, ivaPct }  si los precios nuevos traen IVA
 * @returns { n, referencia: "costo" | "todos" | null, diferencia, rango, porCapitulo, ejemplos, descartados }
 */
export function compararConBase(nuevos = [], base = { rubros: [], precios: [] }, { ivaIncluido = false, ivaPct = 15 } = {}) {
  const idPorClave = new Map(base.rubros.map(r => [claveRubro(r.descripcion, r.unidad), r.id]));
  const refs = new Map();
  base.precios.forEach(h => {
    if (h.anulado) return;
    const p = precioAlCosto(h);
    if (!(p.sinIva > 0)) return;
    if (!refs.has(h.rubro_id)) refs.set(h.rubro_id, { costo: [], todos: [] });
    const x = refs.get(h.rubro_id);
    x.todos.push(p.sinIva);
    if (p.costo) x.costo.push(p.costo);
  });

  const comparar = campo => {
    const filas = [];
    nuevos.forEach(r => {
      const precio = Number(r.precio_unitario) || 0;
      const ref = refs.get(idPorClave.get(claveRubro(r.descripcion, r.unidad)));
      if (!(precio > 0) || !ref?.[campo].length) return;
      const nuevo = ivaIncluido ? precio / (1 + (Number(ivaPct) || 0) / 100) : precio;
      const referencia = mediana(ref[campo]);
      filas.push({ descripcion: r.descripcion, capitulo: r.capitulo || "", nuevo, referencia, ratio: nuevo / referencia });
    });
    return filas;
  };

  // Primero contra lo que se sabe que es costo; si casi no hay, contra todo lo
  // anterior, avisando que no se sabe si eso era al costo.
  let filas = comparar("costo"), referencia = "costo";
  if (filas.length < 3) { filas = comparar("todos"); referencia = "todos"; }
  if (!filas.length) return { n: 0, referencia: null, diferencia: null, rango: null, porCapitulo: [], ejemplos: [], descartados: 0 };

  // Un rubro al doble o a la mitad no es utilidad: es otro alcance con el mismo nombre.
  const razonables = filas.filter(f => f.ratio >= 0.5 && f.ratio <= 2);
  const ratios = razonables.map(f => f.ratio);
  const porCap = new Map();
  razonables.forEach(f => { if (!porCap.has(f.capitulo)) porCap.set(f.capitulo, []); porCap.get(f.capitulo).push(f.ratio); });

  return {
    n: razonables.length,
    descartados: filas.length - razonables.length,
    referencia,
    diferencia: ratios.length ? mediana(ratios) - 1 : null,
    rango: ratios.length >= 4 ? [cuantil(ratios, 0.25) - 1, cuantil(ratios, 0.75) - 1] : null,
    porCapitulo: [...porCap.entries()].map(([capitulo, rs]) => ({ capitulo, n: rs.length, diferencia: mediana(rs) - 1 })).sort((a, b) => b.n - a.n),
    ejemplos: razonables.slice().sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1)).slice(0, 5),
  };
}

/** El % de utilidad que lleva un rubro según lo respondido. */
export function pctUtilidad(r, utilidad) {
  if (utilidad?.estado !== "con_utilidad") return 0;
  const porCap = utilidad.porCapitulo?.[r.capitulo];
  return Number(porCap ?? utilidad.pct) || 0;
}
