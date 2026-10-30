// Los honorarios de un presupuesto: ninguno, de administración, de diseño
// arquitectónico, los dos, u otros con su nombre. Cada uno como porcentaje del
// costo directo o como monto fijo.
//
// Es la única cuenta de totales: la pantalla, el PDF, el Excel y la
// verificación de una cotización la usan igual, para que el documento diga
// siempre lo mismo que la pantalla.

export const HONORARIOS_COMUNES = ["Honorarios de administración", "Honorarios de diseño arquitectónico"];

const n = v => Number(v) || 0;
const r2 = v => Math.round(v * 100) / 100;

/**
 * La lista de honorarios de un presupuesto. Sin la migración 028 —o en uno
 * viejo— se arma con el porcentaje único de antes.
 */
export function lineasHonorarios(p = {}) {
  if (Array.isArray(p.honorarios)) return p.honorarios;
  return n(p.honorarios_pct) > 0 ? [{ nombre: "Honorarios", tipo: "pct", valor: n(p.honorarios_pct) }] : [];
}

/**
 * Subtotal (costo directo), cada honorario con su monto, IVA sobre subtotal
 * más honorarios, y total. Sin IVA es una decisión de presentación: la tasa
 * del presupuesto no se toca.
 */
export function totalesPresupuesto(subtotal, p = {}, conIva = true) {
  const sub = r2(n(subtotal));
  const honorarios = lineasHonorarios(p)
    .filter(h => n(h.valor) !== 0 || String(h.nombre || "").trim())
    .map(h => ({ ...h, monto: r2(h.tipo === "monto" ? n(h.valor) : sub * n(h.valor) / 100) }));
  const honorarios_monto = r2(honorarios.reduce((s, h) => s + h.monto, 0));
  const iva_pct = !conIva ? 0 : p.iva_pct == null ? 15 : n(p.iva_pct);
  const iva = r2((sub + honorarios_monto) * iva_pct / 100);
  return { subtotal: sub, honorarios, honorarios_monto, iva_pct, iva, total: r2(sub + honorarios_monto + iva) };
}

/** Cómo se lee un honorario en una línea: "Honorarios de administración (10 %)". */
export const etiquetaHonorario = h => `${String(h.nombre || "Honorarios").trim()}${h.tipo !== "monto" ? ` (${n(h.valor).toLocaleString("es-EC", { maximumFractionDigits: 2 })} %)` : ""}`;

/**
 * LOS HONORARIOS COMO UN CAPÍTULO DEL PRESUPUESTO.
 *
 * Hasta ahora los honorarios viven fuera de los rubros: se calculan sobre el
 * costo directo y se suman al pie, junto con el IVA. Para el documento que ve
 * el cliente está bien — es como se presenta un presupuesto— pero tiene una
 * consecuencia que no se ve hasta que la obra arranca: a la obra viajan los
 * RUBROS, y los honorarios no son un rubro. El contrato de Diners Aéreo entró
 * al control por $172.127,27 cuando el presupuesto, con su 10% de
 * administración, son $189.340,00: faltaban $17.212,73 que sí se le cobran al
 * cliente y que ningún número de la obra conocía.
 *
 * Pasarlos a un capítulo los convierte en lo que para la obra tienen que ser:
 * renglones. Se planillan, se controlan, llevan IVA como todo lo demás y
 * viajan solos a cualquier lado al que vaya el presupuesto.
 *
 * Esto NO cambia lo que paga el cliente: el mismo monto, en otro lugar del
 * papel. Por eso después hay que sacarlos del pie, o se cobrarían dos veces.
 *
 * @returns [{ capitulo, descripcion, unidad, cantidad, precio_unitario, total }]
 */
export const CAPITULO_HONORARIOS = "HONORARIOS";

export function honorariosComoItems(p = {}, subtotal = 0) {
  const { honorarios } = totalesPresupuesto(subtotal, p, false);
  return honorarios
    .filter(h => r2(h.monto) !== 0)
    .map(h => ({
      capitulo: CAPITULO_HONORARIOS,
      descripcion: etiquetaHonorario(h),
      unidad: "glb",
      cantidad: 1,
      precio_unitario: r2(h.monto),
      total: r2(h.monto),
    }));
}
