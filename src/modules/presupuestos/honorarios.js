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
