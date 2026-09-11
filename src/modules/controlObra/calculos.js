// Núcleo de cálculo del Control de Obra.
//
// Todo se deriva del libro de facturas — no se guardan acumulados.
// En el Excel el "acumulado anterior" se copia a mano en cada planilla,
// que es de donde salen los descuadres; acá siempre se recalcula.
//
//   A          = total_base del rubro (presupuesto)
//   anterior   = Σ asignaciones de planillas con numero < N
//   periodo    = Σ asignaciones de la planilla N
//   acumulado  = anterior + periodo
//   saldo      = A - acumulado
//   pct        = acumulado / A

const n = v => Number(v) || 0;

export function fmt(v) {
  return n(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * @param rubros      filas de obra_rubros
 * @param facturas    filas de obra_facturas (de toda la obra)
 * @param asignaciones filas de obra_factura_rubros (de toda la obra)
 * @param planillaNumero número de la planilla en curso; null = acumulado total
 */
export function calcularControl({ rubros = [], facturas = [], asignaciones = [], planillaNumero = null }) {
  const planillaDeFactura = {};
  facturas.forEach(f => { planillaDeFactura[f.id] = f._planillaNumero ?? null; });

  const porRubro = {};
  rubros.forEach(r => {
    porRubro[r.id] = { anterior: 0, periodo: 0, acumulado: 0, saldo: n(r.total_base), pct: 0 };
  });

  asignaciones.forEach(a => {
    const acc = porRubro[a.obra_rubro_id];
    if (!acc) return;
    const num = planillaDeFactura[a.factura_id];
    if (num == null) return; // factura todavía sin planilla: no cuenta aún
    const monto = n(a.monto);
    if (planillaNumero == null || num < planillaNumero) acc.anterior += monto;
    else if (num === planillaNumero) acc.periodo += monto;
    // planillas posteriores a la seleccionada no se cuentan
  });

  rubros.forEach(r => {
    const acc = porRubro[r.id];
    const base = n(r.total_base);
    acc.acumulado = acc.anterior + acc.periodo;
    acc.saldo = base - acc.acumulado;
    acc.pct = base > 0 ? acc.acumulado / base : 0;
  });

  return porRubro;
}

/** Agrupa los rubros por capítulo respetando el orden del presupuesto. */
export function agruparPorCapitulo(rubros = [], porRubro = {}) {
  const mapa = new Map();
  rubros
    .slice()
    .sort((a, b) => (a.capitulo_orden - b.capitulo_orden) || (a.orden - b.orden) || (a.numero - b.numero))
    .forEach(r => {
      const key = r.capitulo || "SIN CAPÍTULO";
      if (!mapa.has(key)) {
        mapa.set(key, { capitulo: key, capitulo_orden: r.capitulo_orden ?? 0, rubros: [], base: 0, anterior: 0, periodo: 0, acumulado: 0, saldo: 0, pct: 0 });
      }
      const grupo = mapa.get(key);
      const acc = porRubro[r.id] || { anterior: 0, periodo: 0, acumulado: 0, saldo: n(r.total_base) };
      grupo.rubros.push(r);
      grupo.base += n(r.total_base);
      grupo.anterior += acc.anterior;
      grupo.periodo += acc.periodo;
      grupo.acumulado += acc.acumulado;
      grupo.saldo += acc.saldo;
    });

  const grupos = [...mapa.values()];
  grupos.forEach(g => { g.pct = g.base > 0 ? g.acumulado / g.base : 0; });
  return grupos;
}

export function totalesObra(grupos = []) {
  const t = grupos.reduce((acc, g) => ({
    base: acc.base + g.base,
    anterior: acc.anterior + g.anterior,
    periodo: acc.periodo + g.periodo,
    acumulado: acc.acumulado + g.acumulado,
    saldo: acc.saldo + g.saldo,
  }), { base: 0, anterior: 0, periodo: 0, acumulado: 0, saldo: 0 });
  t.pct = t.base > 0 ? t.acumulado / t.base : 0;
  return t;
}

/**
 * Resumen de una planilla: cuánto entró, cuánto quedó sin asignar a rubro,
 * desglose de IVA por tasa y por tipo de gasto (como la hoja RESUMEN GASTO).
 */
export function resumenPlanilla({ facturas = [], asignaciones = [] }) {
  const porFactura = {};
  asignaciones.forEach(a => {
    porFactura[a.factura_id] = (porFactura[a.factura_id] || 0) + n(a.monto);
  });

  const r = {
    cantidad: facturas.length,
    total: 0, asignado: 0, sinAsignar: 0,
    subtotal_0: 0, subtotal_5: 0, subtotal_15: 0, iva: 0,
    porTipo: {},
  };

  facturas.forEach(f => {
    const total = n(f.total);
    const asignado = Math.min(porFactura[f.id] || 0, total);
    r.total += total;
    r.asignado += asignado;
    r.sinAsignar += total - asignado;
    r.subtotal_0 += n(f.subtotal_0);
    r.subtotal_5 += n(f.subtotal_5);
    r.subtotal_15 += n(f.subtotal_15);
    r.iva += n(f.iva);
    const tipo = f.tipo || "otro";
    r.porTipo[tipo] = (r.porTipo[tipo] || 0) + total;
  });

  return r;
}

export const TIPOS_GASTO = [
  { id: "material", label: "Material" },
  { id: "mano_obra", label: "Mano de obra" },
  { id: "maquinaria", label: "Maquinaria / herramienta" },
  { id: "contrato", label: "Contrato" },
  { id: "honorarios", label: "Honorarios" },
  { id: "otro", label: "Otro" },
];
