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

  // Plata asignada a una agrupación sin rubros. Antes se perdía en un total
  // suelto; ahora se guarda por agrupación, porque las agrupaciones extras
  // —salarios, oficina, logística— no tienen rubros NUNCA y es justamente
  // donde vive ese gasto.
  let sinRepartir = 0;
  const porActividad = {};

  // LA PLATA QUE NO ENTRA A NINGÚN TOTAL.
  //
  // Una factura sin planilla se saltea —no hay corte al cual sumarla— y hasta
  // acá eso pasaba en silencio: el gasto existía, se veía en el libro de
  // facturas, y en el control valía cero. Un control que pierde plata sin
  // avisar es peor que no tener control, porque igual se decide con él.
  // Se cuenta aparte y la tabla lo grita.
  let fueraDePlanilla = 0, facturasFueraDePlanilla = new Set();

  asignaciones.forEach(a => {
    const num = planillaDeFactura[a.factura_id];
    if (num == null) {
      fueraDePlanilla += n(a.monto);
      facturasFueraDePlanilla.add(a.factura_id);
      return;
    }
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
    if (!destino.length) {
      const id = a.obra_actividad_id;
      if (id != null) {
        if (!porActividad[id]) porActividad[id] = { anterior: 0, periodo: 0 };
        porActividad[id][campo] += n(a.monto);
      }
      sinRepartir += n(a.monto);
      return;
    }
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
  porRubro._porActividad = porActividad;
  porRubro._fueraDePlanilla = fueraDePlanilla;
  porRubro._facturasFueraDePlanilla = facturasFueraDePlanilla.size;
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
const FUERA_DE_PRESUPUESTO = "GASTOS SIN PRESUPUESTO";
const SIN_ACTIVIDAD = "SIN AGRUPAR";

/**
 * Lo COMPROMETIDO: lo que pidieron gastar y todavía no es gasto.
 *
 * Una solicitud de compra aprobada —o esperando aprobación— ya es plata
 * hablada contra un capítulo, aunque no haya factura. Verla recién cuando la
 * factura entra es enterarse un mes tarde de que el capítulo se pasó.
 *
 * Se cuenta mientras la solicitud está viva y sin factura. Cuando se compra y
 * la factura entra a Control de Obra, ese monto deja de estar comprometido
 * porque ya está invertido: contarlo dos veces inflaría el capítulo.
 */
// Las que comprometen plata de verdad.
//
// NO entra "requiere_info" —que en pantalla se llama DEVUELTA—: un pedido que
// el gerente rebotó es justo lo contrario de plata comprometida. Nadie se
// comprometió a nada; está esperando que lo corrijan o que muera. Contarlo
// inflaba el comprometido con pedidos rechazados, que es como aparecían
// $1.830 comprometidos en una obra sin una sola factura.
//
// Tampoco "borrador" (no se pidió todavía), "anulada" (se mató) ni "recibida"
// (ya llegó: su plata entra por la factura, y contarla dos veces la duplica).
const VIVAS = ["pendiente_aprobacion", "aprobada", "comprada"];

// Lo pedido y todavía sin aprobar es más blando que lo aprobado: se muestra
// aparte para que el número grande no mezcle dos cosas distintas.
const BLANDAS = ["pendiente_aprobacion"];

// LO DEVUELTO SE CUENTA APARTE, y no dentro del comprometido.
//
// Un pedido devuelto va para ATRÁS: alguien lo miró y lo rebotó. Lo que
// importa de él no es la plata —nadie la autorizó— sino que hay una persona
// que tiene que corregirlo o dejarlo morir. Mostrarlo como comprometido
// mezcla una deuda con una tarea, y además deja un número que no baja solo:
// una devuelta que nadie arregla se queda viva para siempre, y el comprometido
// —que al final de la obra tiene que dar cero— nunca llega.
const DEVUELTAS = ["requiere_info"];

export function comprometidoPorGrupo(solicitudes = [], rubros = []) {
  const capituloDeRubro = new Map(rubros.map(r => [r.id, r.capitulo || SIN_CAPITULO]));
  const actividadDeRubro = new Map(rubros.map(r => [r.id, r.actividad_id ?? null]));
  const porCapitulo = {}, porActividad = {}, porRubro = {};
  // De dónde sale cada peso. Sin esto, un comprometido que no cae en ninguna
  // fila aparece solo en el total y no hay manera de averiguar de qué pedido
  // vino: el número queda ahí, sin explicación y sin forma de bajarlo.
  const detalle = [];
  let total = 0;
  const rubroDe = new Map(rubros.map(r => [r.id, r]));
  let devuelto = 0, devueltas = 0;
  const detalleDevueltas = [];
  solicitudes.forEach(s => {
    if (DEVUELTAS.includes(s.estado) && !s.factura_id) {
      const m = n(s.monto ?? s.monto_estimado);
      devuelto += m;
      devueltas += 1;
      detalleDevueltas.push({ id: s.id, monto: m, descripcion: s.descripcion || "", estado: s.estado });
    }
    if (!VIVAS.includes(s.estado) || s.factura_id) return;
    const monto = n(s.monto ?? s.monto_estimado);
    if (!monto) return;
    const capitulo = s.obra_rubro_id ? capituloDeRubro.get(s.obra_rubro_id) : (s.capitulo || SIN_CAPITULO);
    porCapitulo[capitulo || SIN_CAPITULO] = (porCapitulo[capitulo || SIN_CAPITULO] || 0) + monto;
    // La misma plata leída por la otra vista. Se pide por agrupación; si el
    // pedido apunta a un rubro, la agrupación es la de ese rubro. La clave es
    // la misma que arma `agrupar`, para que la tabla la encuentre sin traducir.
    const actId = s.obra_rubro_id ? actividadDeRubro.get(s.obra_rubro_id) : (s.obra_actividad_id ?? null);
    const claveAct = actId ? `a${actId}` : SIN_ACTIVIDAD;
    porActividad[claveAct] = (porActividad[claveAct] || 0) + monto;
    if (s.obra_rubro_id) porRubro[s.obra_rubro_id] = (porRubro[s.obra_rubro_id] || 0) + monto;
    detalle.push({
      id: s.id, monto, estado: s.estado, firme: !BLANDAS.includes(s.estado),
      descripcion: s.descripcion || "",
      capitulo: capitulo || SIN_CAPITULO, claveAct,
      // A qué apunta, dicho como se lee. Sin esto no hay manera de contrastar
      // el número contra la pantalla de Compras.
      destino: s.obra_rubro_id
        ? `rubro ${rubroDe.get(s.obra_rubro_id)?.numero ?? s.obra_rubro_id}: ${rubroDe.get(s.obra_rubro_id)?.descripcion || ""}`
        : s.obra_actividad_id ? "una agrupación"
        : s.capitulo ? `capítulo ${s.capitulo}`
        : "SIN ASIGNAR",
      // De qué campo salió el monto: `monto` lo pone la proforma elegida y
      // `monto_estimado` es lo que se pidió. Si el número no cuadra con
      // Compras, acá se ve por qué.
      deProforma: s.monto != null,
      // Un pedido que no apunta a ningún rubro ni a ninguna agrupación es el
      // que después aparece en el total y en ninguna fila.
      suelto: !s.obra_rubro_id && !s.obra_actividad_id,
    });
    total += monto;
  });
  // El desglose por estado, para poder decir de qué está hecho el número.
  // "Comprometido: $1.830" sin decir de qué es un número que no se puede
  // discutir ni bajar.
  const porEstado = {};
  detalle.forEach(d => { porEstado[d.estado] = (porEstado[d.estado] || 0) + d.monto; });
  const firme = detalle.filter(d => d.firme).reduce((t, d) => t + d.monto, 0);
  return { porCapitulo, porActividad, porRubro, detalle, porEstado, firme, total,
    devuelto, devueltas, detalleDevueltas };
}

/**
 * Lo que una orden de cambio le hace al contrato.
 *
 * Suma lo que agrega, resta lo que quita, y la diferencia es lo que hay que
 * conversar con el cliente. No se guarda: se calcula de las líneas, porque un
 * total tecleado se despega de ellas en la primera corrección.
 */
export function totalOrden(lineas = []) {
  return lineas.reduce((t, l) => {
    const monto = n(l.cantidad) * n(l.precio_unitario);
    return t + (l.tipo === "quita" ? -monto : monto);
  }, 0);
}

/** Lo aprobado en órdenes de cambio: el otro contrato, el de después. */
export function totalAdicionales(ordenes = [], lineasPorOrden = {}) {
  return ordenes
    .filter(o => o.estado === "aprobada")
    .reduce((t, o) => t + totalOrden(lineasPorOrden[o.id] || []), 0);
}

export function agrupar(rubros = [], porRubro = {}, modo = "capitulo", actividades = []) {
  const porActividad = modo === "actividad";
  const dic = new Map(actividades.map(a => [a.id, a]));

  // Un rubro que una orden de cambio sacó del contrato no suma: sigue en la
  // lista —tachado, con el número de la orden— porque es historia del
  // presupuesto, pero su plata ya no es parte de lo que hay que hacer.
  const mapa = new Map();
  rubros.slice()
    // Lo escondido no se dibuja. Solo se puede esconder lo que está en $0 y
    // sin plata movida, así que esto no cambia ningún total: lo único que
    // cambia es cuánto ruido hay que leer todos los días.
    .filter(r => !r.oculto)
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
      if (r.anulado_por_oc) return;      // tachado: se muestra y no cuenta
      g.base += n(r.total_base);
      g.anterior += acc.anterior;
      g.periodo += acc.periodo;
      g.acumulado += acc.acumulado;
      g.saldo += acc.saldo;
      if (acc.estimado) g.estimado = true;
    });

  // Una agrupación sin rubros no salía de ningún lado —los grupos se armaban
  // leyendo rubros—, así que las extras eran invisibles justo cuando tenían
  // gasto. Se agregan con presupuesto cero: el saldo arranca en negativo
  // apenas entra el primer gasto, y eso no es un descuadre, es el dato.
  const sueltos = porRubro._porActividad || {};
  if (porActividad) {
    actividades.forEach(a => {
      const clave = `a${a.id}`;
      if (mapa.has(clave)) return;
      const acc = sueltos[a.id] || { anterior: 0, periodo: 0 };
      mapa.set(clave, {
        clave, capitulo: a.nombre, codigo: a.codigo || "", capitulo_orden: a.orden ?? 9999,
        capitulos: new Set(), rubros: [],
        base: 0, anterior: acc.anterior, periodo: acc.periodo,
        acumulado: acc.anterior + acc.periodo, saldo: -(acc.anterior + acc.periodo),
        pct: 0, estimado: false, extra: !!a.extra,
      });
    });
  } else {
    // En la vista por capítulos ese gasto tampoco tiene dónde caer —no es de
    // ningún capítulo del contrato—, y si no se muestra, los totales de arriba
    // cambian según qué vista esté puesta. Va en un bloque aparte, que además
    // es la lectura honesta: esto se gastó sin estar contratado.
    const fuera = Object.values(sueltos).reduce(
      (t, x) => ({ anterior: t.anterior + x.anterior, periodo: t.periodo + x.periodo }),
      { anterior: 0, periodo: 0 });
    if (fuera.anterior || fuera.periodo) {
      mapa.set(FUERA_DE_PRESUPUESTO, {
        clave: FUERA_DE_PRESUPUESTO, capitulo: FUERA_DE_PRESUPUESTO, codigo: "", capitulo_orden: 9998,
        capitulos: new Set(), rubros: [],
        base: 0, anterior: fuera.anterior, periodo: fuera.periodo,
        acumulado: fuera.anterior + fuera.periodo, saldo: -(fuera.anterior + fuera.periodo),
        pct: 0, estimado: false, extra: true,
      });
    }
  }

  const grupos = [...mapa.values()];
  grupos.forEach(g => {
    g.pct = g.base > 0 ? g.acumulado / g.base : 0;
    // Una actividad que cruza capítulos es la única que vuelve estimado el
    // número contractual del capítulo: se marca para poder partirla.
    g.cruzaCapitulos = porActividad && g.capitulos.size > 1;
    // Sin presupuesto no hay porcentaje de avance: el avance es contra algo.
    g.sinPresupuesto = g.base === 0 && g.acumulado !== 0;
    if (porActividad && g.extra === undefined) {
      g.extra = !!dic.get(Number(String(g.clave).slice(1)))?.extra;
    }
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
