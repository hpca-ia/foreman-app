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
//
// Capítulo y actividad son dos vistas paralelas de los mismos rubros: el
// capítulo es cómo se contrató, la actividad cómo se ejecuta, y una actividad
// puede cruzar capítulos. El total es idéntico, solo cambia el orden.
//
// Las planillas se cargan por actividad, así que la plata entra a un nivel
// más alto que el rubro. Para que la vista por capítulos siga cuadrando, lo
// asignado a una actividad se reparte entre sus rubros a prorrata del
// presupuesto de cada uno. Eso hace que el número por actividad sea exacto y
// el de rubro estimado — salvo que la factura se haya asignado al rubro
// directamente, que también se permite.

const n = v => Number(v) || 0;

export function fmt(v) {
  return n(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Reparte un monto entre rubros a prorrata de su presupuesto, exacto al
 *  centavo: el sobrante de redondeo va a los rubros más grandes, uno a uno. */
export function repartirProporcional(monto, rubros) {
  if (!rubros.length) return [];
  const centavos = Math.round(n(monto) * 100);
  const base = rubros.reduce((s, r) => s + n(r.total_base), 0);
  const partes = base > 0
    ? rubros.map(r => Math.floor(centavos * n(r.total_base) / base))
    : rubros.map(() => Math.floor(centavos / rubros.length));
  let resto = centavos - partes.reduce((a, b) => a + b, 0);
  const mayoresPrimero = rubros.map((_, i) => i).sort((a, b) => n(rubros[b].total_base) - n(rubros[a].total_base));
  for (let k = 0; k < resto; k++) partes[mayoresPrimero[k % mayoresPrimero.length]] += 1;
  return partes.map(c => c / 100);
}

/**
 * @param rubros        filas de obra_rubros
 * @param facturas      filas de obra_facturas (de toda la obra)
 * @param asignaciones  filas de obra_asignaciones; cada una apunta a un rubro
 *                      (monto exacto) o a una actividad (se reparte)
 * @param planillaNumero número de la planilla en curso; null = acumulado total
 */
export function calcularControl({ rubros = [], facturas = [], asignaciones = [], planillaNumero = null }) {
  const planillaDeFactura = {};
  facturas.forEach(f => { planillaDeFactura[f.id] = f._planillaNumero ?? null; });

  const porRubro = {};
  rubros.forEach(r => {
    porRubro[r.id] = { anterior: 0, periodo: 0, acumulado: 0, saldo: n(r.total_base), pct: 0, estimado: false };
  });

  const rubrosDe = new Map();
  rubros.forEach(r => {
    if (r.actividad_id == null) return;
    if (!rubrosDe.has(r.actividad_id)) rubrosDe.set(r.actividad_id, []);
    rubrosDe.get(r.actividad_id).push(r);
  });

  // Plata asignada a una actividad que no tiene rubros: no hay dónde repartirla.
  let sinRepartir = 0;

  asignaciones.forEach(a => {
    const num = planillaDeFactura[a.factura_id];
    if (num == null) return;                       // factura todavía sin planilla
    const campo = planillaNumero == null || num < planillaNumero ? "anterior"
      : num === planillaNumero ? "periodo"
      : null;                                      // planillas posteriores no cuentan
    if (!campo) return;

    if (a.obra_rubro_id != null) {
      const acc = porRubro[a.obra_rubro_id];
      if (acc) acc[campo] += n(a.monto);
      return;
    }
    const destino = rubrosDe.get(a.obra_actividad_id) || [];
    if (!destino.length) { sinRepartir += n(a.monto); return; }
    // Con un solo rubro no hay nada que repartir: el monto es exacto.
    const reparte = destino.length > 1;
    repartirProporcional(a.monto, destino).forEach((parte, i) => {
      const acc = porRubro[destino[i].id];
      acc[campo] += parte;
      if (reparte) acc.estimado = true;
    });
  });

  rubros.forEach(r => {
    const acc = porRubro[r.id];
    const base = n(r.total_base);
    acc.acumulado = acc.anterior + acc.periodo;
    acc.saldo = base - acc.acumulado;
    acc.pct = base > 0 ? acc.acumulado / base : 0;
  });

  porRubro._sinRepartir = sinRepartir;
  return porRubro;
}

/**
 * Agrupa los rubros para una de las dos vistas. Son paralelas, no anidadas:
 * los mismos rubros ordenados de otra forma, con el mismo total.
 *
 * @param modo        "capitulo" | "actividad"
 * @param actividades filas de obra_actividades (solo para modo actividad)
 */
const SIN_CAPITULO = "SIN CAPÍTULO";
const SIN_ACTIVIDAD = "SIN AGRUPAR";

export function agrupar(rubros = [], porRubro = {}, modo = "capitulo", actividades = []) {
  const porActividad = modo === "actividad";
  const dic = new Map(actividades.map(a => [a.id, a]));

  const mapa = new Map();
  rubros.slice()
    .sort((a, b) => ((a.capitulo_orden ?? 9999) - (b.capitulo_orden ?? 9999)) || (a.orden - b.orden) || (a.numero - b.numero))
    .forEach(r => {
      const act = porActividad ? dic.get(r.actividad_id) : null;
      const clave = porActividad ? (act ? `a${act.id}` : SIN_ACTIVIDAD) : (r.capitulo || SIN_CAPITULO);
      if (!mapa.has(clave)) {
        mapa.set(clave, {
          clave,
          capitulo: porActividad ? (act ? act.nombre : SIN_ACTIVIDAD) : (r.capitulo || SIN_CAPITULO),
          codigo: porActividad ? (act?.codigo || "") : "",
          capitulo_orden: porActividad ? (act?.orden ?? 9999) : (r.capitulo_orden ?? 9999),
          capitulos: new Set(),
          rubros: [], base: 0, anterior: 0, periodo: 0, acumulado: 0, saldo: 0, pct: 0, estimado: false,
        });
      }
      const g = mapa.get(clave);
      const acc = porRubro[r.id] || { anterior: 0, periodo: 0, acumulado: 0, saldo: n(r.total_base) };
      g.rubros.push(r);
      g.capitulos.add(r.capitulo || SIN_CAPITULO);
      g.base += n(r.total_base);
      g.anterior += acc.anterior;
      g.periodo += acc.periodo;
      g.acumulado += acc.acumulado;
      g.saldo += acc.saldo;
      if (acc.estimado) g.estimado = true;
    });

  const grupos = [...mapa.values()];
  grupos.forEach(g => {
    g.pct = g.base > 0 ? g.acumulado / g.base : 0;
    // Una actividad que cruza capítulos es la única que vuelve estimado el
    // número contractual del capítulo: se marca para poder partirla.
    g.cruzaCapitulos = porActividad && g.capitulos.size > 1;
    g.capitulos = [...g.capitulos];
  });
  const sinAsignar = porActividad ? SIN_ACTIVIDAD : SIN_CAPITULO;
  // Lo no clasificado va al final, no estorbando arriba.
  return grupos.sort((a, b) =>
    (a.capitulo === sinAsignar ? 1 : 0) - (b.capitulo === sinAsignar ? 1 : 0) ||
    a.capitulo_orden - b.capitulo_orden ||
    a.capitulo.localeCompare(b.capitulo));
}

// Nombre viejo, para no romper lo que todavía lo importa.
export const agruparPorCapitulo = agrupar;

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
 * Resumen de una planilla: cuánto entró, cuánto quedó sin asignar,
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
