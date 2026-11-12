// LA LIQUIDACIÓN: EL PRESUPUESTO ACTUALIZADO, CON LO QUE DE VERDAD SE EJECUTÓ.
//
// «Las cantidades ejecutadas se ponen en presupuesto actualizado con órdenes
// de cambio… ese es a la final la liquidación» (Hernán, 11/11/2026).
//
// El presupuesto actualizado dice en cuánto está el contrato: lo firmado más
// lo que las órdenes aprobadas le hicieron. Eso es lo VIGENTE. La liquidación
// es lo que al final se cobra, y depende de cómo se contrató la obra:
//
//   · POR RUBROS. Se cobra lo ejecutado, al precio pactado. «Si me contrataron
//     por 100 y se ejecutaron 80, nos pagan 80». El honorario se mueve con
//     eso, igual que con una orden o con un ajuste: administrar menos obra es
//     menos honorario.
//   · LLAVE EN MANO. Se cobra lo contratado. «Si se contrató 100 y se
//     ejecutaron 120, nos pagan los 100». Lo ejecutado no mueve el cobro:
//     mueve el costo.
//
// Y LO QUE ESA DIFERENCIA LE HACE AL BENEFICIO, que es lo que se pregunta
// después, tampoco es lo mismo en las dos:
//
//   · Por rubros, la diferencia de cantidad sola no es beneficio: lo que no se
//     ejecutó tampoco se cobra. Se deja de ganar —o se gana de más— el margen
//     de esas unidades: (precio − costo) × la diferencia.
//   · Llave en mano, ejecutar menos es beneficio por el costo que no se gastó,
//     y ejecutar más es pérdida: −costo × la diferencia.
//
// Un renglón sin cantidad ejecutada cargada TODAVÍA NO SE MIDIÓ: se liquida
// por lo vigente y no cuenta como diferencia. Sin nada cargado, la liquidación
// es el contrato vigente, al centavo.
//
// Sin base ni pantalla: se puede probar (pruebas/liquidacion.test.mjs).

import { presupuestoActualizado } from "./presupuestoActualizado.js";

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;
const c4 = v => Math.round(n(v) * 10000) / 10000;

export const MODALIDADES = {
  rubros: { label: "Por rubros", dice: "Se cobra lo ejecutado, al precio pactado." },
  llave_en_mano: { label: "Llave en mano", dice: "Se cobra lo contratado, se ejecute más o menos." },
};

/** Cómo se cobra esta obra. Sin el dato, por rubros: es como son las de hoy. */
export const modalidadDe = obra => (obra?.modalidad === "llave_en_mano" ? "llave_en_mano" : "rubros");

/** El renglón del presupuesto actualizado, como se guarda su cantidad ejecutada. */
export const claveDe = fila => String(fila?.id ?? "");

/** Lo escrito en la casilla: vacío es «todavía no se midió»; un número, también el cero, es lo ejecutado. */
export function cantidadEscrita(v) {
  if (v === "" || v == null) return null;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) && x >= 0 ? c4(x) : null;
}

/** ¿A este renglón se le puede cargar lo ejecutado? Los de honorarios y los que no están vigentes, no. */
export const seMide = fila => !!fila && !fila.honorario && !fila.proyectada
  && (n(fila.vigente?.cantidad) !== 0 || n(fila.vigente?.total) !== 0);

/**
 * @param matriz     lo que devuelve presupuestoActualizado
 * @param ejecutado  { [clave]: cantidad }: solo lo que ya se midió
 * @param modalidad  "rubros" | "llave_en_mano"
 * @param costos     { [clave]: costo unitario sin IVA }, de los rubros que lo tienen
 * @returns {{
 *   modalidad, porFila, honorarios, diferencias, deltas, totales }}
 *   `porFila`     { [clave]: { vigente, medida, ejecutada, deltaCantidad, deltaCobro, cobra, efecto } }
 *   `diferencias` los renglones medidos cuya cantidad no es la vigente
 *   `deltas`      { [clave]: ± cantidad } de esos renglones: lo usa Beneficios
 */
export function liquidacion({ matriz, ejecutado = {}, modalidad = "rubros", costos = {} } = {}) {
  const porRubros = modalidad !== "llave_en_mano";
  const filas = [
    ...(matriz?.capitulos || []).flatMap(c => c.filas),
    ...(matriz?.bloques || []).flatMap(b => b.filas),
  ];
  const porFila = {};
  const diferencias = [];
  const deltas = {};
  let movido = 0, medidos = 0, sinMedir = 0, efecto = 0, sinCosto = 0;

  for (const f of filas) {
    if (!seMide(f)) continue;
    const clave = claveDe(f);
    const vigente = { cantidad: c4(f.vigente.cantidad), total: c2(f.vigente.total) };
    const escrita = cantidadEscrita(ejecutado[clave]);
    const medida = escrita != null;
    if (medida) medidos++; else sinMedir++;
    const ejecutada = medida ? escrita : vigente.cantidad;
    const deltaCantidad = c4(ejecutada - vigente.cantidad);
    // AL PRECIO PACTADO, sobre la diferencia: así lo que no cambió queda en el
    // mismo centavo que el contrato. Con cero ejecutado no se cobra nada,
    // aunque cantidad por precio no dé exacto el total del renglón.
    const deltaCobro = !porRubros || !medida ? 0 : ejecutada === 0 ? c2(-vigente.total) : c2(deltaCantidad * n(f.precio));
    const costo = costos[clave] != null && n(costos[clave]) > 0 ? n(costos[clave]) : null;
    const loQueHace = !deltaCantidad ? 0 : costo == null ? null
      : porRubros ? c2((n(f.precio) - costo) * deltaCantidad) : c2(-costo * deltaCantidad);
    porFila[clave] = { vigente, medida, ejecutada, deltaCantidad, deltaCobro, cobra: c2(vigente.total + deltaCobro), efecto: loQueHace };
    movido += deltaCobro;
    if (medida && deltaCantidad) {
      deltas[clave] = deltaCantidad;
      if (loQueHace == null) sinCosto++; else efecto += loQueHace;
      diferencias.push({
        clave, numero: f.numero, descripcion: f.descripcion, unidad: f.unidad, precio: n(f.precio), costo,
        contratada: vigente.cantidad, ejecutada, deltaCantidad, deltaCobro, efecto: loQueHace,
      });
    }
  }
  movido = c2(movido);

  // EL HONORARIO SE MUEVE CON LO EJECUTADO, con el porcentaje del contrato,
  // como se mueve con cada orden y con cada ajuste. Solo por rubros: llave en
  // mano no cambia lo que se cobra.
  const pct = n(matriz?.honorariosPct);
  const deHonorarios = filas.filter(f => f.honorario);
  const honorariosVigente = c2(deHonorarios.reduce((t, f) => t + n(f.vigente?.total), 0));
  // Si el contrato vigente no tiene un renglón de honorarios, no hay honorario
  // que mover; y si lo tiene, no puede quedar en menos que cero.
  const honorariosDelta = porRubros && pct > 0 && deHonorarios.length
    ? Math.max(-honorariosVigente, c2(movido * pct / 100)) : 0;
  deHonorarios.forEach((f, i) => {
    const total = c2(f.vigente.total);
    // Todo el movimiento va al primer renglón de honorarios, que es donde el cliente lo busca.
    const delta = i === 0 ? honorariosDelta : 0;
    porFila[claveDe(f)] = { vigente: { cantidad: c4(f.vigente.cantidad), total }, medida: false, ejecutada: null,
      deltaCantidad: 0, deltaCobro: delta, cobra: c2(total + delta), efecto: 0, honorario: true };
  });

  const iva = n(matriz?.iva);
  const diferencia = c2(movido + honorariosDelta);
  const vigente = c2(matriz?.totales?.vigente);
  const ivaVigente = c2(matriz?.ivas?.vigente);
  const ivaDeLaDiferencia = iva > 0 ? c2(diferencia * iva / 100) : 0;
  return {
    modalidad: porRubros ? "rubros" : "llave_en_mano",
    porFila, diferencias, deltas,
    honorarios: { vigente: honorariosVigente, delta: honorariosDelta, pct },
    totales: {
      vigente, enRubros: movido, honorarios: honorariosDelta, diferencia,
      liquidacion: c2(vigente + diferencia),
      iva: c2(ivaVigente + ivaDeLaDiferencia),
      conIva: c2(n(matriz?.totalesConIva?.vigente) + diferencia + ivaDeLaDiferencia),
      medidos, sinMedir,
      // Lo que las diferencias le hacen al beneficio, de los renglones con costo.
      efecto: c2(efecto), sinCosto,
    },
  };
}

/**
 * El subtotal de liquidación de cada capítulo y de cada bloque de la tabla.
 *
 * @param renglones  los de renglonesDeLaMatriz, en el orden en que se dibujan
 * @returns { [índice del renglón de capítulo o bloque]: subtotal }
 */
export function subtotalesDeLiquidacion(renglones = [], liq) {
  const out = {};
  let abierto = null;
  renglones.forEach((r, i) => {
    if (r.tipo === "capitulo" || r.tipo === "bloque") { abierto = i; out[i] = 0; return; }
    if (r.tipo !== "fila" || abierto == null) { if (r.tipo === "pie") abierto = null; return; }
    out[abierto] = c2(out[abierto] + n(liq?.porFila?.[claveDe(r)]?.cobra));
  });
  return out;
}

/** Los costos por renglón, de los rubros del contrato que tienen uno cargado. */
export function costosDe(rubros = []) {
  const out = {};
  for (const r of rubros) if (r && n(r.costo_unitario) > 0) out[String(r.id)] = n(r.costo_unitario);
  return out;
}

/**
 * La liquidación de una obra, desde sus rubros y sus órdenes: arma el
 * presupuesto actualizado —sin ajustes a mano, que son una proyección— y le
 * pone lo ejecutado. Es la misma cuenta para la pantalla del presupuesto, para
 * Diferencias y para Beneficios.
 */
export function liquidacionDeLaObra({ obra = null, rubros = [], ordenes = [], lineasDeOrdenes = {}, ejecutado = {} } = {}) {
  const matriz = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra });
  return liquidacion({ matriz, ejecutado, modalidad: modalidadDe(obra), costos: costosDe(rubros) });
}

/** Cómo se dice una diferencia de cantidad, en una línea. */
export function comoSeDice(d, modalidad, fmt = String) {
  const menos = d.deltaCantidad < 0;
  const cuanto = `${fmt(Math.abs(d.deltaCantidad))} ${d.unidad || ""}`.trim();
  const cobro = modalidad === "llave_en_mano"
    ? "se cobra igual lo contratado"
    : `se cobran $${fmt(Math.abs(d.deltaCobro))} ${menos ? "menos" : "más"}`;
  const beneficio = d.efecto == null ? "sin costo cargado no se sabe qué le hace al beneficio"
    : d.efecto === 0 ? "no mueve el beneficio"
    : `${d.efecto > 0 ? "suma" : "resta"} $${fmt(Math.abs(d.efecto))} al beneficio`;
  return `Se ejecutaron ${cuanto} ${menos ? "menos" : "más"}: ${cobro}; ${beneficio}.`;
}
