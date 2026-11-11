// LO APROBADO: UNA FICHA QUE SE ARMA SOLA.
//
// Un proyecto aprobado no está en el pipeline —ya no se persigue— y no lleva
// etapas a mano: nadie tiene que acordarse de mover nada para que se sepa en
// qué anda. Su ficha se arma con lo que los módulos YA SABEN:
//
//   · Control de Obra · cuánto se presupuestó, cuánto va invertido, en qué
//                       planilla está, y qué órdenes de cambio esperan firma
//   · Compras         · qué está esperando visto, devuelto, por comprar o por
//                       recibir
//   · Tareas          · cuántas tiene abiertas, cuántas vencidas, y la próxima
//   · Libro de Obra   · cuándo fue la última entrada
//
// Acá no se lee la base ni se calcula plata: la plata viene ya calculada por
// la misma regla que arma la lista de Control de Obra (resumenDeObras.js),
// para que la ficha no pueda decir un número distinto del que dice la obra.
// Esto solo ordena lo que hay y decide qué pide atención.
//
// Ver docs/reingenieria-pipeline-tareas.md, fase 3.

import { proximoPaso, diasEntre, diaCorto, hoyISO } from "./pipeline.js";

const soloDia = f => String(f || "").slice(0, 10);
const n = v => Number(v) || 0;
const plural = (cuantos, uno, varios) => `${cuantos} ${cuantos === 1 ? uno : varios}`;
const haceDias = d => (d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`);

/** Una orden que el cliente todavía no firmó: enviada, vigente, y no reemplazada por otra. */
const esperaFirma = o => o?.estado === "enviada" && !o.anulada && !o.reemplazada_at;

/**
 * Las órdenes de cambio que esperan firma: cuántas, hace cuánto la más vieja,
 * y cuántas tienen el plazo vencido o una objeción de quien tenía que firmar.
 */
export function ordenesEsperando(ordenes = [], aprobaciones = [], hoy = hoyISO()) {
  const vivas = ordenes.filter(esperaFirma);
  const dias = vivas.map(o => {
    const envios = aprobaciones.filter(a => String(a.orden_id) === String(o.id)).map(a => soloDia(a.envio_at)).filter(Boolean).sort();
    const desde = envios[0] || soloDia(o.enviada_at) || soloDia(o.fecha);
    return desde ? Math.max(0, diasEntre(desde, hoy)) : 0;
  });
  return {
    cuantas: vivas.length,
    dias: dias.length ? Math.max(...dias) : 0,
    vencidas: vivas.filter(o => o.fecha_limite_aprobacion && soloDia(o.fecha_limite_aprobacion) < hoy).length,
    objetadas: vivas.filter(o => aprobaciones.some(a => String(a.orden_id) === String(o.id) && !a.aprobado_at && a.observacion)).length,
  };
}

/** Las compras del proyecto que siguen abiertas, por el paso en el que están. */
export function comprasAbiertas(compras = []) {
  const cuantas = estado => compras.filter(c => c.estado === estado).length;
  const r = {
    porAprobar: cuantas("pendiente_aprobacion"), devueltas: cuantas("requiere_info"),
    porComprar: cuantas("aprobada"), porRecibir: cuantas("comprada"),
  };
  return { ...r, total: r.porAprobar + r.devueltas + r.porComprar + r.porRecibir };
}

/** Las tareas del proyecto: las compras no cuentan, tienen su renglón. */
export function tareasDelAprobado(tareas = [], hoy = hoyISO()) {
  const suyas = tareas.filter(t => !t.compra_id && t.type !== "Compra" && t.status !== "listo");
  return {
    abiertas: suyas.length,
    vencidas: suyas.filter(t => t.due_date && soloDia(t.due_date) < hoy).length,
    sinFecha: suyas.filter(t => !t.due_date).length,
    proxima: proximoPaso(tareas),
  };
}

/**
 * La ficha de un proyecto aprobado.
 *
 * @param obra       la obra en Control, o null si todavía no tiene
 * @param resumen    { base, invertido, sinAsignar } de esa obra, como lo arma
 *                   resumenDeObras; null si quien mira no ve montos o no hay obra
 * @param planillas  las planillas de la obra
 * @param libro      { dias, ultima } del libro de obra
 * @returns { enQueVa, plata, renglones: [{ clave, modulo, vista, texto, tono }], pendientes }
 *   `vista` es a dónde lleva tocar el renglón; `tono`: peligro · atencion · normal · apagado
 */
export function fichaDelProyecto({
  obra = null, resumen = null, planillas = [], ordenes = [], aprobaciones = [],
  compras = [], tareas = [], libro = null, hoy = hoyISO(),
}) {
  const abierta = planillas.find(p => p.estado === "abierta") || null;
  const cerradas = planillas.filter(p => p.estado === "cerrada")
    .sort((a, b) => String(b.fecha_cierre || "").localeCompare(String(a.fecha_cierre || "")));
  const nombreDe = p => p.nombre || `Planilla N°${p.numero}`;

  // En qué va: lo dice la planilla en la que está la obra.
  const enQueVa = !obra ? "Todavía sin obra en Control"
    : abierta ? `${nombreDe(abierta)} abierta${cerradas[0] ? ` · la anterior se cerró el ${diaCorto(cerradas[0].fecha_cierre)}` : ""}`
    : cerradas[0] ? `${nombreDe(cerradas[0])} cerrada el ${diaCorto(cerradas[0].fecha_cierre)} · sin planilla abierta`
    : "Todavía sin planillas";

  const renglones = [];

  // Control: lo que la plata no dice sola.
  const oc = ordenesEsperando(ordenes, aprobaciones, hoy);
  if (oc.cuantas) {
    renglones.push({
      clave: "ordenes", modulo: "Órdenes de cambio", vista: "controlObra", tono: oc.vencidas || oc.objetadas ? "peligro" : "atencion",
      texto: `${plural(oc.cuantas, "espera firma", "esperan firma")} · ${oc.dias === 0 ? "enviada hoy" : `la más vieja, hace ${plural(oc.dias, "día", "días")}`}`
        + (oc.objetadas ? ` · ${plural(oc.objetadas, "objetada", "objetadas")}` : "")
        + (oc.vencidas ? ` · ${oc.vencidas} con el plazo vencido` : ""),
    });
  }

  const cp = comprasAbiertas(compras);
  if (cp.total) {
    renglones.push({
      clave: "compras", modulo: "Compras", vista: "compras", tono: cp.devueltas ? "atencion" : "normal",
      texto: [
        cp.porAprobar && plural(cp.porAprobar, "espera visto", "esperan visto"),
        cp.devueltas && plural(cp.devueltas, "devuelta", "devueltas"),
        cp.porComprar && `${cp.porComprar} por comprar`,
        cp.porRecibir && `${cp.porRecibir} por recibir`,
      ].filter(Boolean).join(" · "),
    });
  }

  const tr = tareasDelAprobado(tareas, hoy);
  renglones.push({
    clave: "tareas", modulo: "Tareas", vista: "proyecto", tono: tr.vencidas ? "peligro" : tr.abiertas ? "normal" : "apagado",
    texto: !tr.abiertas ? "Ninguna abierta"
      : `${plural(tr.abiertas, "abierta", "abiertas")}${tr.vencidas ? ` · ${plural(tr.vencidas, "vencida", "vencidas")}` : ""}`
        + (tr.proxima ? ` · sigue «${tr.proxima.title}»${tr.proxima.due_date ? ` (${diaCorto(tr.proxima.due_date)})` : ", sin fecha"}` : ""),
  });

  // El libro se dice, no se alarma: una obra aprobada puede no haber empezado.
  if (libro?.ultima) {
    const d = Math.max(0, diasEntre(libro.ultima, hoy));
    renglones.push({
      clave: "libro", modulo: "Libro de obra", vista: "libro", tono: "normal",
      texto: `Última entrada ${haceDias(d)} (${diaCorto(libro.ultima)}) · ${plural(n(libro.dias), "día escrito", "días escritos")}`,
    });
  } else if (obra) {
    renglones.push({ clave: "libro", modulo: "Libro de obra", vista: "libro", tono: "apagado", texto: "Todavía sin entradas" });
  }

  // La plata, con los mismos nombres y la misma cuenta que la lista de Control.
  const plata = resumen ? {
    presupuesto: n(resumen.base), invertido: n(resumen.invertido), saldo: n(resumen.base) - n(resumen.invertido),
    pct: n(resumen.base) > 0 ? n(resumen.invertido) / n(resumen.base) : 0,
    // Plata cargada que no está en ningún rubro: no aparece en el control.
    sinAsignar: n(resumen.sinAsignar) > 0.009 ? n(resumen.sinAsignar) : 0,
  } : null;

  return {
    enQueVa, plata, renglones,
    // Cuántas cosas de este proyecto piden que alguien haga algo.
    pendientes: renglones.filter(r => r.tono === "peligro" || r.tono === "atencion").length + (plata?.sinAsignar ? 1 : 0),
  };
}

/** Los aprobados, con lo que más pide atención primero. */
export function ordenarEnMarcha(fichas = []) {
  return fichas.slice().sort((a, b) =>
    (b.ficha?.pendientes || 0) - (a.ficha?.pendientes || 0) || String(a.lead.nombre).localeCompare(String(b.lead.nombre)));
}
