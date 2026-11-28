// EL EXPEDIENTE DE UNA TR: toda su historia en un documento.
//
// Hernán, 28/11/2026: «cuando haga clic en esta TR... ¿puedes desplegar un PDF
// con toda su historia? Orden de compra, factura, aprobación de la orden,
// anexos, comprobante de pago, etc.».
//
// Acá no se consulta nada ni se dibuja nada: con las filas que trae
// `historiaDeTR` se arma lo que el PDF va a decir —la historia en orden de
// fecha, los cuadros de cada parte y la lista de papeles que van detrás—.
// Lo que no está guardado no se inventa: un pago sin comprobante subido sale
// con su fecha, su forma y su referencia, y sin papel.

import { codigoTR, codigoODC, codigoCC, codigoPL, PUERTAS } from "./trazabilidad.js";

const n = v => Number(v) || 0;
const plata = v => `$${n(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const limpio = v => String(v ?? "").trim();

/** Una fecha como se lee: «12/11/2026». Acepta el día solo o el instante. */
export function dia(v) {
  if (!v) return "";
  const s = String(v);
  const solo = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (solo) return `${solo[3]}/${solo[2]}/${solo[1]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Guayaquil" });
}
/** Para ordenar: el día solo cuenta como su mediodía. */
const instante = v => {
  if (!v) return 0;
  const s = String(v);
  const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00-05:00` : s).getTime();
  return Number.isNaN(t) ? 0 : t;
};

const ESTADO_DE_ORDEN = {
  borrador: "Borrador", pendiente_aprobacion: "Esperando el visto", requiere_info: "Devuelta",
  aprobada: "Aprobada", comprada: "Comprada", recibida: "Recibida", rechazada: "Rechazada", anulada: "Anulada",
};
const PASO = {
  borrador: "Volvió a borrador", pendiente_aprobacion: "Se envió a aprobar", requiere_info: "Se devolvió",
  aprobada: "Se aprobó", comprada: "Se compró", recibida: "Se recibió", rechazada: "Se rechazó", anulada: "Se anuló",
};
const CLASE = { factura: "Factura", nota_venta: "Nota de venta", recibo: "Recibo", pasaje: "Pasaje", anticipo: "Anticipo",
  nota_credito: "Nota de crédito", proforma: "Proforma" };
const ADJUNTO = { cotizacion: "Cotización", pago: "Comprobante de pago", respaldo: "Respaldo" };
const PENDIENTE = { factura: "Falta la factura", devolucion: "Devolución", otro: "Pendiente" };
const SRI = { ok: "Autorizada, sin observaciones", aviso: "Con observaciones", grave: "El SRI no la acepta" };
const ESTADO_DE_GASTO = { pendiente: "Sin aprobar", aprobado: "Aprobado", devuelto: "Devuelto", rechazado: "Rechazado" };

/**
 * @param h  lo que devuelve `historiaDeTR`: { tr, ordenes, historial, adjuntos,
 *   pendientes, facturas, asignaciones, rubros, actividades, pagos, planillas,
 *   obras, proyecto, gastos, cajas, cierres, anexos }
 *
 * @returns { vacio } si la TR no tiene ningún papel, o
 *   { codigo, nombreArchivo, titulo, subtitulo, resumen, bloques, papeles, pie }
 *   — `papeles` son las rutas del depósito que van detrás, sin repetir.
 */
export function armarExpediente(h = {}) {
  const ordenes = h.ordenes || [], facturas = h.facturas || [], gastos = h.gastos || [];
  if (!ordenes.length && !facturas.length && !gastos.length) return { vacio: true };

  const leadId = h.proyecto?.id ?? ordenes[0]?.lead_id ?? null;
  const codigo = codigoTR(h.tr, leadId);
  const plDe = {}; (h.planillas || []).forEach(p => { plDe[p.id] = p; });
  const cajaDe = {}; (h.cajas || []).forEach(c => { cajaDe[c.id] = c; });
  const cierreDe = {}; (h.cierres || []).forEach(c => { cierreDe[c.id] = c; });
  const rubroDe = {}; (h.rubros || []).forEach(r => { rubroDe[r.id] = r; });
  const actividadDe = {}; (h.actividades || []).forEach(a => { actividadDe[a.id] = a; });
  const facturaDe = {}; facturas.forEach(f => { facturaDe[f.id] = f; });

  const puerta = ordenes.length ? "odc" : gastos.length ? "cc" : facturas[0]?.origen === "rol" ? "rol" : "control";
  const entro = [
    ...ordenes.map(o => codigoODC(o.id)),
    ...[...new Set(gastos.map(g => g.caja_id))].map(id => `${codigoCC(id)}${cajaDe[id]?.responsable_nombre ? ` ${cajaDe[id].responsable_nombre}` : ""}`),
    puerta === "rol" ? "ROL" : "", puerta === "control" ? "Directo en el control" : "",
  ].filter(Boolean).join(" · ");
  const planillas = [...new Set(facturas.map(f => f.planilla_id).filter(Boolean))].map(id => plDe[id]).filter(Boolean);
  const total = facturas.length ? facturas.reduce((t, f) => t + n(f.total), 0)
    : gastos.length ? gastos.reduce((t, g) => t + n(g.monto), 0)
      : ordenes.reduce((t, o) => t + (n(o.monto) || n(o.monto_estimado)), 0);
  const pagado = (h.pagos || []).reduce((t, p) => t + n(p.monto), 0);
  // La orden dice que tiene factura y en el control ya no está: se dice, no se
  // deja como si todavía no hubiera llegado.
  const borrada = ordenes.filter(o => o.factura_id && !facturaDe[o.factura_id]);
  const que = limpio(facturas[0]?.detalle) || limpio(ordenes[0]?.descripcion) || limpio(gastos[0]?.descripcion);
  const proveedor = limpio(facturas[0]?.razon_social) || limpio(ordenes[0]?.proveedor) || limpio(gastos[0]?.proveedor);

  // ── LA HISTORIA, en orden de fecha ──
  const pasos = [];
  const paso = (cuando, que_, quien = "", detalle = "") => { if (cuando) pasos.push({ t: instante(cuando), fecha: dia(cuando), que: que_, quien: limpio(quien), detalle: limpio(detalle) }); };

  ordenes.forEach(o => {
    const suyos = (h.historial || []).filter(x => Number(x.solicitud_id) === Number(o.id));
    if (!suyos.length) paso(o.created_at, `Se pidió · ${codigoODC(o.id)}`, o.solicitante_nombre, o.descripcion);
    suyos.forEach(x => {
      // El primer renglón del historial no viene de ningún estado: es el pedido.
      const que_ = !x.estado_anterior ? "Se pidió"
        : x.estado_anterior !== x.estado_nuevo ? PASO[x.estado_nuevo] || x.estado_nuevo : "Comentario";
      paso(x.created_at, `${que_} · ${codigoODC(o.id)}`, x.usuario_nombre, x.comentario || (!x.estado_anterior ? o.descripcion : ""));
    });
    if (o.pagado_at) paso(o.pagado_at, `Se marcó pagada · ${codigoODC(o.id)}`, o.pagado_nombre, o.pagado_monto ? plata(o.pagado_monto) : "");
  });
  (h.adjuntos || []).forEach(a => paso(a.created_at, `Se subió: ${(ADJUNTO[a.tipo] || "papel").toLowerCase()}`, "",
    [a.proveedor, a.monto ? plata(a.monto) : "", a.nombre].filter(Boolean).join(" · ")));
  gastos.forEach(g => {
    const caja = cajaDe[g.caja_id];
    paso(g.created_at || g.fecha, `Gasto de caja chica · ${codigoCC(g.caja_id)}`, g.subido_por_nombre,
      [g.descripcion, plata(g.monto)].filter(Boolean).join(" · "));
    if (g.devuelto_at) paso(g.devuelto_at, "Se devolvió el gasto", g.devuelto_nombre, g.devuelto_motivo);
    const cierre = g.cierre_id ? cierreDe[g.cierre_id] : null;
    if (cierre) paso(cierre.created_at, `Se rindió en la vuelta N° ${cierre.numero}`, cierre.cerrado_nombre, caja?.responsable_nombre ? `Caja de ${caja.responsable_nombre}` : "");
  });
  facturas.forEach(f => {
    paso(f.created_at, `Entró al control: ${(CLASE[f.clase || "factura"] || "documento").toLowerCase()}`, f.subido_por_nombre,
      [f.razon_social, f.numero_factura ? `N° ${f.numero_factura}` : "sin número", plata(f.total)].filter(Boolean).join(" · "));
    if (f.sri_revisado_at) paso(f.sri_revisado_at, "Se revisó en el SRI", "", SRI[f.sri_estado] || "");
  });
  (h.pagos || []).forEach(p => paso(p.fecha || p.created_at, "Pago", p.registrado_nombre,
    [plata(p.monto), p.forma, p.referencia ? `ref. ${p.referencia}` : ""].filter(Boolean).join(" · ")));
  (h.pendientes || []).forEach(p => {
    paso(p.created_at, `Pendiente: ${(PENDIENTE[p.tipo] || "pendiente").toLowerCase()}`, p.creado_nombre,
      [p.texto, p.para_nombre ? `lo resuelve ${p.para_nombre}` : ""].filter(Boolean).join(" · "));
    if (p.resuelto_at) paso(p.resuelto_at, "Pendiente resuelto", p.resuelto_nombre, p.resuelto_nota);
  });
  (h.anexos || []).forEach(a => paso(a.created_at, "Anexo: para quién o para qué", a.subido_por_nombre, [a.nota, a.nombre].filter(Boolean).join(" · ")));
  pasos.sort((a, b) => a.t - b.t);

  const bloques = [{
    titulo: "La historia",
    columnas: ["Fecha", "Qué pasó", "Quién", "Detalle"],
    filas: pasos.map(p => [p.fecha, p.que, p.quien || "—", p.detalle || ""]),
    anchos: { 0: { cellWidth: 62 }, 1: { cellWidth: 190 }, 2: { cellWidth: 120 } },
  }];

  if (ordenes.length) {
    bloques.push({
      titulo: "Orden de compra",
      columnas: ["Código", "Qué se pidió", "Para qué", "Pidió", "Aprobó", "Estado", "Monto"],
      filas: ordenes.map(o => [codigoODC(o.id), limpio(o.descripcion), limpio(o.justificacion) || limpio(o.capitulo) || "—",
        limpio(o.solicitante_nombre) || "—",
        o.aprobador_nombre ? `${o.aprobador_nombre}${o.aprobado_at ? ` · ${dia(o.aprobado_at)}` : ""}` : "—",
        ESTADO_DE_ORDEN[o.estado] || o.estado || "—", plata(n(o.monto) || n(o.monto_estimado))]),
      anchos: { 0: { cellWidth: 50 }, 6: { cellWidth: 64, halign: "right" } },
    });
  }
  if (borrada.length) {
    bloques.push({
      titulo: "Falta en el control",
      columnas: ["Orden", "Qué pasó"],
      filas: borrada.map(o => [codigoODC(o.id), "La orden tiene una factura enganchada que ya no está en el control de obra: alguien la borró allá. Hay que volver a cargarla desde la orden."]),
      anchos: { 0: { cellWidth: 60 } },
    });
  }
  if ((h.adjuntos || []).length) {
    bloques.push({
      titulo: "Papeles de la orden: cotizaciones y comprobantes de pago",
      columnas: ["Qué es", "Proveedor", "Monto", "Archivo", "Subido"],
      filas: h.adjuntos.map(a => [ADJUNTO[a.tipo] || a.tipo || "Papel", limpio(a.proveedor) || "—", a.monto ? plata(a.monto) : "—", limpio(a.nombre) || "—", dia(a.created_at)]),
      anchos: { 2: { cellWidth: 64, halign: "right" }, 4: { cellWidth: 62 } },
    });
  }
  if (gastos.length) {
    bloques.push({
      titulo: "Caja chica",
      columnas: ["Caja", "Fecha", "Proveedor", "Qué se compró", "Estado", "Aprobó", "Vuelta", "Monto"],
      filas: gastos.map(g => {
        const cierre = g.cierre_id ? cierreDe[g.cierre_id] : null;
        return [`${codigoCC(g.caja_id)}${cajaDe[g.caja_id]?.responsable_nombre ? ` ${cajaDe[g.caja_id].responsable_nombre}` : ""}`, dia(g.fecha),
          limpio(g.proveedor) || "—", limpio(g.descripcion), ESTADO_DE_GASTO[g.estado] || g.estado || "Sin aprobar",
          limpio(g.aprobado_por_nombre) || "—", cierre ? `N° ${cierre.numero}` : "por rendir", plata(g.monto)];
      }),
      anchos: { 1: { cellWidth: 58 }, 7: { cellWidth: 60, halign: "right" } },
    });
  }
  if (facturas.length) {
    bloques.push({
      titulo: "En el control de obra",
      columnas: ["Documento", "N°", "RUC", "Proveedor", "Fecha", "Planilla", "SRI", "Base 0%", "Base 15%", "IVA", "Total"],
      filas: facturas.map(f => [CLASE[f.clase || "factura"] || f.clase, limpio(f.numero_factura) || "sin número", limpio(f.ruc) || "—",
        limpio(f.razon_social) || "—", dia(f.fecha),
        f.planilla_id && plDe[f.planilla_id] ? `${codigoPL(plDe[f.planilla_id].numero)}${plDe[f.planilla_id].estado === "cerrada" ? " (cerrada)" : ""}` : "sin planilla",
        SRI[f.sri_estado] || "sin revisar", plata(f.subtotal_0), plata(f.subtotal_15), plata(f.iva), plata(f.total)]),
      anchos: { 7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" }, 10: { halign: "right" } },
    });
    const asignado = (h.asignaciones || []).map(a => {
      const r = a.obra_rubro_id ? rubroDe[a.obra_rubro_id] : null;
      const ac = a.obra_actividad_id ? actividadDe[a.obra_actividad_id] : null;
      return [r ? `${r.numero || ""} ${r.descripcion || ""}`.trim() : ac ? `Agrupación: ${ac.nombre || ""}` : limpio(a.capitulo) || "—", plata(a.monto)];
    });
    const sumaAsignada = (h.asignaciones || []).reduce((t, a) => t + n(a.monto), 0);
    const falta = Math.round((total - sumaAsignada) * 100) / 100;
    bloques.push({
      titulo: "Asignada a",
      columnas: ["Rubro del presupuesto", "Monto"],
      filas: asignado.length || Math.abs(falta) > 0.009
        ? [...asignado, ...(falta > 0.009 ? [["SIN ASIGNAR", plata(falta)]] : [])]
        : [["SIN ASIGNAR", plata(total)]],
      anchos: { 1: { cellWidth: 80, halign: "right" } },
    });
    bloques.push({
      titulo: "Pagos",
      columnas: ["Fecha", "Forma", "Referencia", "Registró", "Comprobante", "Monto"],
      filas: (h.pagos || []).length
        ? [...h.pagos.map(p => [dia(p.fecha || p.created_at), limpio(p.forma) || "—", limpio(p.referencia) || "—", limpio(p.registrado_nombre) || "—",
          p.archivo_url ? "va detrás" : p.nota_credito_id ? "no lleva: es un vale" : "sin subir", plata(p.monto)]),
          ["", "", "", "TOTAL PAGADO", "", plata(pagado)]]
        : [["—", "Sin pagos registrados", "", "", "", plata(0)]],
      anchos: { 0: { cellWidth: 62 }, 5: { cellWidth: 80, halign: "right" } },
      filasDestacadas: (h.pagos || []).length ? [h.pagos.length] : [],
      nota: "El comprobante va detrás cuando se subió al registrar el pago, o en la orden de compra. «Sin subir»: el pago guarda fecha, forma y referencia, pero nadie le puso el archivo.",
    });
  }
  if ((h.pendientes || []).length) {
    bloques.push({
      titulo: "Pendientes",
      columnas: ["Qué", "Dejado por", "Lo resuelve", "Detalle", "Estado"],
      filas: h.pendientes.map(p => [PENDIENTE[p.tipo] || "Pendiente", `${limpio(p.creado_nombre) || "—"} · ${dia(p.created_at)}`, limpio(p.para_nombre) || "—",
        limpio(p.texto), p.resuelto_at ? `Resuelto el ${dia(p.resuelto_at)}${p.resuelto_nombre ? ` por ${p.resuelto_nombre}` : ""}` : "ABIERTO"]),
    });
  }
  if ((h.anexos || []).length) {
    bloques.push({
      titulo: "Anexos: para quién o para qué",
      columnas: ["Fecha", "Subió", "Explicación", "Archivo"],
      filas: h.anexos.map(a => [dia(a.created_at), limpio(a.subido_por_nombre) || "—", limpio(a.nota) || "—", limpio(a.nombre) || "—"]),
      anchos: { 0: { cellWidth: 62 } },
    });
  }

  // ── LOS PAPELES QUE VAN DETRÁS, sin repetir: el gasto de caja chica y su
  // factura del control apuntan casi siempre al mismo archivo. ──
  const papeles = [], vistos = new Set();
  const papel = (ruta, titulo) => { const r = limpio(ruta); if (!r || vistos.has(r)) return; vistos.add(r); papeles.push({ ruta: r, titulo }); };
  (h.adjuntos || []).filter(a => a.tipo === "cotizacion").forEach(a => papel(a.storage_path, `Cotización${a.proveedor ? ` — ${a.proveedor}` : ""}${a.monto ? ` — ${plata(a.monto)}` : ""}`));
  facturas.forEach(f => papel(f.archivo_url, `${CLASE[f.clase || "factura"] || "Documento"}${f.numero_factura ? ` ${f.numero_factura}` : ""} — ${f.razon_social || "sin proveedor"} — ${plata(f.total)}`));
  gastos.forEach(g => papel(g.archivo_url, `Gasto de caja chica — ${g.proveedor || "sin proveedor"} — ${plata(g.monto)}`));
  (h.adjuntos || []).filter(a => a.tipo === "pago").forEach(a => papel(a.storage_path, `Comprobante de pago${a.monto ? ` — ${plata(a.monto)}` : ""}`));
  (h.pagos || []).forEach(p => papel(p.archivo_url, `Comprobante del pago del ${dia(p.fecha || p.created_at)} — ${plata(p.monto)}${p.referencia ? ` — ref. ${p.referencia}` : ""}`));
  (h.adjuntos || []).filter(a => a.tipo !== "cotizacion" && a.tipo !== "pago").forEach(a => papel(a.storage_path, `${ADJUNTO[a.tipo] || "Respaldo"} de la orden${a.nombre ? ` — ${a.nombre}` : ""}`));
  (h.pendientes || []).forEach(p => papel(p.doc_path, `Papel del pendiente — ${PENDIENTE[p.tipo] || "pendiente"}`));
  (h.anexos || []).forEach(a => papel(a.storage_path, `Anexo${a.nombre ? ` — ${a.nombre}` : ""}`));

  const faltaPagar = Math.round((total - pagado) * 100) / 100;
  return {
    codigo,
    nombreArchivo: `Expediente ${codigo || `TR${h.tr}`}`,
    titulo: `Expediente ${codigo || `TR${h.tr}`}`,
    subtitulo: [h.proyecto?.nombre, proveedor, que].filter(Boolean).join(" · "),
    resumen: [
      { label: "Monto", valor: plata(total) },
      { label: "Entró", valor: entro || PUERTAS[puerta] },
      { label: "Planilla", valor: planillas.length ? planillas.map(p => codigoPL(p.numero)).join(" · ")
        : facturas.length ? "Sin planilla" : borrada.length ? "Su factura se borró del control" : "Todavía no" },
      { label: "Pagado", valor: facturas.length ? `${plata(pagado)}${faltaPagar > 0.009 ? ` · falta ${plata(faltaPagar)}` : ""}` : "—" },
      { label: "Papeles detrás", valor: String(papeles.length) },
    ],
    bloques, papeles,
    pie: { elemento: `Expediente ${codigo || `TR${h.tr}`}`, proyecto: h.proyecto?.nombre || "" },
  };
}
