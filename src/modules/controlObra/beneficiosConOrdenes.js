// UN BENEFICIO SE CUENTA SOBRE LO QUE QUEDA POR HACER.
//
// Lo pidió Hernán el 15/11/2026, con el gypsum plano regular del Aeropuerto:
// se confirmó un beneficio por comprarlo a $18 cuando el contrato lo paga a
// $22,41 —$4,41 por m²—, sobre los 125,3 m² del rubro: $552,57. Después la
// OC-03 eliminó 39 m² de ese rubro. Quedan 86,3 m², y lo que de verdad se
// gana es 86,3 × $4,41 = $380,58. El control mostraba los $552,57.
//
// Acá: si una orden aprobada le quitó cantidad a un rubro, los beneficios de
// compra de ese rubro se cuentan sobre la cantidad que queda, a prorrata. El
// registro guardado no se toca —es lo que se cargó, con su papel—: se ajusta
// al leerlo, en el control, en Beneficios y en el resultado de la obra.
//
//   · Si la cantidad del beneficio cabe en lo que queda, no cambia.
//   · Si el rubro se eliminó entero, el beneficio queda en cero.
//   · Varios beneficios sobre el mismo rubro se ajustan juntos, en proporción.
//   · Lo que sale de una orden de cambio no se toca: eso es lo que se cobra
//     de la orden, no lo que se ganó comprando.
//   · Solo las órdenes que cuentan: aprobadas, no anuladas, no reemplazadas.
//   · Un beneficio contra VARIOS rubros no se toca: se midió el total contra
//     la suma, no una cantidad de un rubro, y no hay cantidad que achicar.

import { ordenCuenta } from "./cuentaOrdenCambio.js";
import { codigoDeOrden } from "./presupuestoParaGastar.js";
import { sonVarios } from "./variosRubros.js";

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;
const c4 = v => Math.round(n(v) * 10000) / 10000;
const deOrden = b => b?.origen === "orden_cambio" || !!b?.orden_cambio_id;

/**
 * Cuánta cantidad le quitaron las órdenes que cuentan a cada rubro.
 *
 * @param lineasDeOrdenes  { [ordenId]: [líneas] }
 * @returns { [rubroId]: { cantidad, codigos } }
 */
export function quitadoPorRubro(ordenes = [], lineasDeOrdenes = {}) {
  const por = {};
  for (const o of ordenes || []) {
    if (!ordenCuenta(o)) continue;
    for (const l of (lineasDeOrdenes || {})[o.id] || []) {
      if (l.tipo !== "quita" || l.obra_rubro_id == null) continue;
      const k = String(l.obra_rubro_id);
      if (!por[k]) por[k] = { cantidad: 0, codigos: [] };
      por[k].cantidad = c4(por[k].cantidad + n(l.cantidad));
      const codigo = codigoDeOrden(o);
      if (!por[k].codigos.includes(codigo)) por[k].codigos.push(codigo);
    }
  }
  return por;
}

/**
 * @param beneficios  las filas de `obra_beneficios`, tal cual
 * @param rubros      los del contrato, con su cantidad y su unidad
 * @returns las mismas filas; las ajustadas con cantidad, presupuestado y real
 *   a prorrata, y `_porOrden`: { codigos, eliminada, queda, unidad, original }
 */
export function beneficiosSobreLoQueQueda(beneficios = [], { rubros = [], ordenes = [], lineasDeOrdenes = {} } = {}) {
  const quitado = quitadoPorRubro(ordenes, lineasDeOrdenes);
  if (!Object.keys(quitado).length) return beneficios || [];
  const rubroDe = new Map((rubros || []).map(r => [String(r.id), r]));

  // Cuánto factor le toca a cada rubro: lo que queda sobre lo que suman sus
  // beneficios de compra. Uno solo, o varios que juntos se pasan.
  const factor = {};
  for (const [id, q] of Object.entries(quitado)) {
    const r = rubroDe.get(id);
    if (!r || !(n(r.cantidad) > 0)) continue;
    const queda = Math.max(0, c4(n(r.cantidad) - q.cantidad));
    const suyos = (beneficios || []).filter(b => String(b.obra_rubro_id) === id && !deOrden(b) && !sonVarios(b) && n(b.cantidad) > 0);
    const total = suyos.reduce((t, b) => t + n(b.cantidad), 0);
    if (total > queda + 0.0001) factor[id] = { f: total > 0 ? queda / total : 0, queda, ...q, unidad: r.unidad || "" };
  }

  return (beneficios || []).map(b => {
    const k = String(b.obra_rubro_id);
    const a = factor[k];
    if (!a || deOrden(b) || sonVarios(b) || !(n(b.cantidad) > 0)) return b;
    return {
      ...b,
      cantidad: c4(n(b.cantidad) * a.f),
      presupuestado: c2(n(b.presupuestado) * a.f),
      real: c2(n(b.real) * a.f),
      _porOrden: {
        codigos: a.codigos, eliminada: a.cantidad, queda: a.queda, unidad: a.unidad,
        original: { cantidad: n(b.cantidad), presupuestado: n(b.presupuestado), real: n(b.real) },
      },
    };
  });
}

/** Cómo se dice debajo del beneficio. */
export function notaDelAjuste(b) {
  const a = b?._porOrden;
  if (!a) return "";
  const cant = v => n(v).toLocaleString("es-EC", { maximumFractionDigits: 2 });
  const plata = v => `$${n(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const u = a.unidad ? ` ${a.unidad}` : "";
  const cargado = c2(a.original.presupuestado - a.original.real);
  return `${a.codigos.join(", ")} eliminó ${cant(a.eliminada)}${u}: el beneficio va sobre ${cant(b.cantidad)}${u}`
    + ` · cargado sobre ${cant(a.original.cantidad)}${u}: ${cargado >= 0 ? "+" : "−"}${plata(Math.abs(cargado))}`;
}
