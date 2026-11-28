// EL RESUMEN DE LAS TR DE UN PROYECTO: cuáles están completas y a cuáles les
// falta algo.
//
// Hernán, 28/11/2026: «de esta manera puedo sacar un resumen de TR y ver cuál
// tiene errores, ¿verdad?» y «toda TR debe tener su trazabilidad». Una TR está
// completa cuando el gasto se puede seguir de punta a punta: nació en una orden
// de compra o en un gasto de caja chica, tiene su factura en el control con
// papel y número, está en una planilla y está asignada a sus rubros.
//
// Acá no se inventa ninguna revisión: cada una ya existía suelta —en Alertas,
// en los pendientes de la compra, en la lectura de la bodega—. Esto las junta
// por transacción, que es como se busca un papel.

import { codigoTR, codigoODC, traza as armarTraza } from "../../lib/trazabilidad.js";

const n = v => Number(v) || 0;

/** Lo que le puede faltar a una TR, de lo más grave a lo menos. */
export const ERRORES_TR = {
  factura_borrada: { corto: "Su factura se borró", grave: true,
    hacer: "La orden de compra dice que tiene factura, pero en el control ya no está: alguien la borró. Hay que volver a cargarla desde la orden." },
  repetida: { corto: "Repetida", grave: true,
    hacer: "El mismo documento (mismo RUC y número, o el mismo archivo) está cargado más de una vez: se cuenta doble." },
  de_mas: { corto: "Asignada de más", grave: true,
    hacer: "Lo asignado a rubros suma más que el documento: se abre y se deja una sola de las asignaciones que se repiten." },
  sri: { corto: "El SRI no la acepta", grave: true,
    hacer: "La revisión del SRI encontró algo que invalida el comprobante. Se ve al abrir la factura." },
  sin_factura: { corto: "Sin factura",
    hacer: "La orden está comprada y todavía no tiene su factura en el control." },
  anticipo: { corto: "Falta la factura del anticipo",
    hacer: "La plata salió y ya cuenta como gasto; falta el comprobante. Si nunca va a tener, se marca «no espera factura»." },
  pendiente: { corto: "Pendiente abierto",
    hacer: "Alguien dejó un pendiente en la orden de compra (falta la factura, una devolución) y nadie lo cerró." },
  devuelto: { corto: "Gasto devuelto",
    hacer: "El gasto de caja chica se devolvió a quien lo subió y sigue sin corregir." },
  sin_control: { corto: "No llegó al control",
    hacer: "El gasto de caja chica está aprobado, pero no tiene su factura en el control de la obra." },
  sin_papel: { corto: "Sin papel",
    hacer: "No tiene la foto ni el PDF. Se abre el documento y se sube." },
  sin_numero: { corto: "Sin número",
    hacer: "Es una factura o nota de venta y no tiene el número del comprobante." },
  sin_planilla: { corto: "Sin planilla",
    hacer: "El documento está en el control pero no quedó en ninguna planilla." },
  sin_asignar: { corto: "Sin asignar a rubro",
    hacer: "Todo o parte del documento no descuenta de ningún rubro del presupuesto." },
};
export const ORDEN_DE_ERRORES = Object.keys(ERRORES_TR);

const COMPRADA = ["comprada", "recibida"];
const CERRADA_SIN_GASTO = ["anulada", "rechazada"];
const CON_NUMERO = ["factura", "nota_venta"];

/**
 * @param leadId        el proyecto (para el código PR)
 * @param facturas      las del control de la obra, con `_traza` si la tienen
 * @param solicitudes   las órdenes de compra del proyecto
 * @param gastos        los gastos de las cajas chicas de la obra
 * @param cajas         esas cajas: { id, responsable_nombre }
 * @param alertas       lo que devuelve `alertasDeLaObra` (repetidas, sobreasignadas, sinAsignar)
 * @param pendientes    { solicitudId: [pendientes abiertos] }
 *
 * @returns { trs, cuenta } — `trs` ordenadas: primero las que tienen algo
 *   grave, después las demás con error, por número de TR.
 */
export function resumenDeTR({ leadId = null, facturas = [], solicitudes = [], gastos = [], cajas = [], alertas = {}, pendientes = {} } = {}) {
  const grupos = new Map();
  const de = (tr, suelta) => {
    const k = Number(tr) > 0 ? `tr${Number(tr)}` : suelta;
    if (!grupos.has(k)) grupos.set(k, { clave: k, tr: Number(tr) > 0 ? Number(tr) : null, facturas: [], ordenes: [], gastos: [] });
    return grupos.get(k);
  };
  // Sin la 202 nadie tiene TR: cada papel se agrupa con los que tiene enganchados.
  const trDeFactura = {}; facturas.forEach(f => { trDeFactura[f.id] = f.tr; });
  const sueltaDeFactura = f => (f.caja_gasto_id ? `g${f.caja_gasto_id}` : `f${f.id}`);
  facturas.forEach(f => de(f.tr, sueltaDeFactura(f)).facturas.push(f));
  const facturaPorId = new Map(facturas.map(f => [Number(f.id), f]));
  solicitudes.forEach(s => {
    const f = s.factura_id ? facturaPorId.get(Number(s.factura_id)) : null;
    de(s.tr ?? (f ? trDeFactura[f.id] : null), f ? sueltaDeFactura(f) : `c${s.id}`).ordenes.push(s);
  });
  gastos.forEach(g => de(g.tr, `g${g.id}`).gastos.push(g));

  const cajaDe = {}; cajas.forEach(c => { cajaDe[c.id] = c; });
  const repetidas = new Set();
  (alertas.repetidas || []).filter(g => g.tipo === "exacto" && !g.justificado)
    .forEach(g => g.facturas.forEach(f => repetidas.add(Number(f.id))));
  const deMas = new Set((alertas.sobreasignadas || []).map(x => Number(x.factura?.id)));
  const sinAsignar = new Map((alertas.sinAsignar || []).map(x => [Number(x.factura?.id), n(x.falta)]));

  const trs = [...grupos.values()].map(g => {
    const errores = [];
    const pone = (clave, dice = "") => { if (!errores.some(e => e.clave === clave)) errores.push({ clave, dice }); };

    g.ordenes.forEach(s => {
      if (CERRADA_SIN_GASTO.includes(s.estado)) return;
      if (s.factura_id && !facturaPorId.has(Number(s.factura_id))) pone("factura_borrada", codigoODC(s.id));
      else if (!s.factura_id && COMPRADA.includes(s.estado)) pone("sin_factura", codigoODC(s.id));
      (pendientes[s.id] || []).forEach(p => pone("pendiente", [p.texto, p.para_nombre ? `lo resuelve ${p.para_nombre}` : ""].filter(Boolean).join(" · ")));
    });

    g.facturas.forEach(f => {
      if (repetidas.has(Number(f.id))) pone("repetida");
      if (deMas.has(Number(f.id))) pone("de_mas");
      if (f.sri_estado === "grave") pone("sri", (f.sri_hallazgos || []).filter(h => h.nivel === "grave").map(h => h.dice).join(" · "));
      const clase = f.clase || "factura";
      if (clase === "anticipo") { if (!f.facturada_con_id) pone("anticipo"); }
      else {
        if (!f.archivo_url) pone("sin_papel");
        if (CON_NUMERO.includes(clase) && !String(f.numero_factura || "").trim()) pone("sin_numero");
      }
      if (!f.planilla_id) pone("sin_planilla");
      if (sinAsignar.has(Number(f.id))) pone("sin_asignar", `$${sinAsignar.get(Number(f.id)).toFixed(2)} sin rubro`);
    });

    g.gastos.forEach(x => {
      if (x.estado === "devuelto") pone("devuelto", x.devuelto_motivo || "");
      else if (x.estado === "aprobado" && !x.obra_factura_id) pone("sin_control");
    });

    errores.sort((a, b) => ORDEN_DE_ERRORES.indexOf(a.clave) - ORDEN_DE_ERRORES.indexOf(b.clave));

    const f = g.facturas[0] || null;
    const s = g.ordenes[0] || null;
    const x = g.gastos[0] || null;
    const anulada = !f && !x && g.ordenes.length > 0 && g.ordenes.every(o => CERRADA_SIN_GASTO.includes(o.estado));
    // En curso: todavía no le toca tener factura. Una orden sin comprar, o un
    // gasto de caja chica que nadie aprobó todavía.
    const enCurso = (!f && g.ordenes.some(o => !COMPRADA.includes(o.estado) && !CERRADA_SIN_GASTO.includes(o.estado)))
      || g.gastos.some(y => y.estado === "pendiente" || !y.estado);
    const estado = errores.length ? "con_error" : anulada ? "anulada" : enCurso ? "en_curso" : "completa";

    const caja = x && cajaDe[x.caja_id] ? { id: x.caja_id, nombre: cajaDe[x.caja_id].responsable_nombre } : null;
    const traza = f?._traza
      || armarTraza({ tr: g.tr, leadId, odc: g.ordenes.map(o => o.id), caja, puerta: g.ordenes.length ? "odc" : caja ? "cc" : null });
    return {
      clave: g.clave, tr: g.tr, codigo: codigoTR(g.tr, leadId), traza, estado, errores,
      grave: errores.some(e => ERRORES_TR[e.clave]?.grave),
      // De qué es, con las palabras del papel que haya.
      que: [f?.razon_social, f?.detalle || s?.descripcion || x?.descripcion].filter(Boolean).join(" · ")
        || s?.descripcion || x?.proveedor || "",
      monto: f ? n(f.total) : x ? n(x.monto) : s ? n(s.monto) || n(s.monto_estimado) : 0,
      // El monto de una orden sin factura es el pedido, no un gasto hecho.
      montoEsEstimado: !f && !x,
      facturaId: f?.id ?? null, solicitudId: s?.id ?? null, gastoId: x?.id ?? null,
    };
  });

  trs.sort((a, b) => (Number(b.grave) - Number(a.grave)) || (a.tr ?? 1e12) - (b.tr ?? 1e12));

  const cuenta = { total: trs.length, completas: 0, enCurso: 0, conError: 0, anuladas: 0, porError: {} };
  trs.forEach(t => {
    if (t.estado === "completa") cuenta.completas += 1;
    else if (t.estado === "en_curso") cuenta.enCurso += 1;
    else if (t.estado === "anulada") cuenta.anuladas += 1;
    else cuenta.conError += 1;
    t.errores.forEach(e => { cuenta.porError[e.clave] = (cuenta.porError[e.clave] || 0) + 1; });
  });
  return { trs, cuenta };
}
