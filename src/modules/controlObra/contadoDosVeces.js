// PLATA CONTADA DOS VECES, AUNQUE NO SEA LA MISMA FACTURA DOS VECES.
//
// «Duplicados» miraba una sola cosa: la misma factura cargada dos veces. Hay
// otras dos formas de contar de más que no son eso y que nadie veía ahí:
//
//   1. UN PEDIDO DE COMPRAS YA FACTURADO. El pedido se aprobó en Compras y su
//      factura se cargó en el control —desde la planilla— sin engancharla. El
//      control cuenta la factura como gastada y el pedido como comprometido:
//      la misma compra, dos veces.
//
//   2. UNA FACTURA ASIGNADA POR MÁS DE LO QUE VALE. Sus asignaciones suman más
//      que su total: la plata de más aparece en los rubros y no existe.
//
//   3. PAGADO EN COMPRAS Y SIN DOCUMENTO EN EL CONTROL. La plata salió y el
//      control no la tiene de ninguna forma.
//
//   4. UN DOCUMENTO SIN ASIGNAR. Está en el control y no descuenta de ningún
//      rubro: el gasto existe y ningún renglón lo muestra.
//
// Y la primera de siempre, LA MISMA FACTURA DOS VECES, que ahora se busca con
// la misma regla en un solo lugar (`facturasRepetidas`), sin ir a la base.
//
// Juntas son las ALERTAS de la obra: lo que hay que revisar.
//
// Son cuenta pura: reciben las filas que la pantalla del control ya tiene.

import { montoDeSolicitud, recibeGasto } from "./calculos.js";
import { candidatasDelControl } from "../compras/alControl.js";

const n = v => Number(v) || 0;
const r2 = v => Math.round(n(v) * 100) / 100;

// Los pedidos que el control sigue contando: lo pedido, lo aprobado, y lo
// comprado cuyo documento todavía no entró.
const VIVOS = ["pendiente_aprobacion", "aprobada", "comprada", "recibida"];

/**
 * Los pedidos de Compras que ya tienen su factura en el control, sin enganchar.
 *
 * Se avisa cuando hay un documento libre —de ningún pedido— por EL MISMO MONTO
 * que el pedido; o cuando el pedido figura pagado y hay uno libre del mismo
 * proveedor, que es el caso del anticipo: se pagó el 50% y el documento no
 * coincide en monto con lo pedido. Un documento del mismo proveedor por otro
 * monto, con el pedido sin pagar, no se avisa: puede ser otra compra.
 *
 * @param solicitudes  los pedidos de la obra
 * @param facturas     los documentos de la obra
 * @param adjuntos     las cotizaciones de esos pedidos
 * @param pagos        los pagos de la obra
 * @returns [{ pedido, monto, candidatas, seguro, deMas }]
 *   `seguro`: mismo monto Y mismo proveedor. `deMas`: lo comprometido que
 *   sobra —el pedido entero, o lo que vale el documento si es un anticipo—.
 */
export function pedidosYaFacturados({ solicitudes = [], facturas = [], adjuntos = [], pagos = [] } = {}) {
  const enganchadas = (solicitudes || []).filter(s => s.factura_id != null).map(s => Number(s.factura_id));
  return (solicitudes || [])
    .filter(s => s && !s.factura_id && VIVOS.includes(s.estado))
    .map(s => {
      const suyos = (adjuntos || []).filter(a => Number(a.solicitud_id) === Number(s.id));
      // Sin el tipo no se sabe cuál es comprobante: los que traen monto son cotizaciones.
      const conTipo = suyos.map(a => ({ ...a, tipo: a.tipo || "cotizacion" }));
      const candidatas = candidatasDelControl(s, { facturas, enganchadas, adjuntos: conTipo, pagos });
      const monto = r2(montoDeSolicitud(s, conTipo.filter(a => a.tipo === "cotizacion")).monto);
      const primera = candidatas[0] || null;
      const avisa = !!primera && (primera.mismoMonto || !!s.pagado_at);
      if (!avisa) return null;
      return {
        pedido: s, monto, candidatas,
        seguro: primera.mismoMonto && primera.mismoProveedor,
        deMas: r2(Math.min(monto || n(primera.factura.total), n(primera.factura.total))),
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.seguro) - Number(a.seguro) || b.deMas - a.deMas);
}

/**
 * Las facturas con más asignado que su total.
 *
 * Una nota de crédito es negativa: se compara en valor absoluto, que es como
 * se la asigna.
 *
 * @returns [{ factura, asignado, deMas, aRubros, aAgrupaciones }]
 */
export function facturasSobreasignadas({ facturas = [], asignaciones = [] } = {}) {
  const de = {};
  (asignaciones || []).forEach(a => { (de[a.factura_id] = de[a.factura_id] || []).push(a); });
  return (facturas || [])
    .map(f => {
      const suyas = de[f.id] || [];
      const asignado = r2(suyas.reduce((t, a) => t + n(a.monto), 0));
      const deMas = r2(Math.abs(asignado) - Math.abs(n(f.total)));
      if (!(deMas > 0.01)) return null;
      return {
        factura: f, asignado, deMas,
        aRubros: suyas.filter(a => a.obra_rubro_id != null).length,
        aAgrupaciones: suyas.filter(a => a.obra_rubro_id == null && a.obra_actividad_id != null).length,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.deMas - a.deMas);
}

// ── La misma factura dos veces ──────────────────────────────────────────
const DIAS_CERCANOS = 5;
const norm = t => (t || "").toString().trim().toUpperCase().replace(/[\s.-]/g, "");
const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);

/**
 * Las facturas de una obra que se repiten entre sí.
 *
 *   exacto   mismo RUC + mismo número, o el mismo archivo
 *   posible  mismo proveedor + mismo monto, con fechas cercanas
 *
 * No importa por dónde entraron: planilla, caja chica o Compras.
 *
 * @returns [{ clave, tipo, facturas, total, justificado }]
 */
export function facturasRepetidas(facturas = []) {
  const grupos = new Map();
  [...(facturas || [])]
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || Number(a.id) - Number(b.id))
    .forEach(f => {
      let clave = null, tipo = null;
      if (f.numero_factura && f.ruc) { clave = "id:" + norm(f.ruc) + "|" + norm(f.numero_factura); tipo = "exacto"; }
      else if (f.archivo_hash) { clave = "file:" + f.archivo_hash; tipo = "exacto"; }
      else if (f.razon_social && f.total) { clave = "aprox:" + norm(f.razon_social) + "|" + Number(f.total).toFixed(2); tipo = "posible"; }
      if (!clave) return;
      if (!grupos.has(clave)) grupos.set(clave, { clave, tipo, facturas: [] });
      grupos.get(clave).facturas.push(f);
    });
  // Los «posibles» solo cuentan si además las fechas están cerca.
  return [...grupos.values()]
    .filter(g => g.facturas.length > 1)
    .filter(g => g.tipo === "exacto" || g.facturas.every((f, _, arr) => dias(f.fecha, arr[0].fecha) <= DIAS_CERCANOS))
    .map(g => ({ ...g, total: g.facturas.reduce((t, f) => t + n(f.total), 0), justificado: g.facturas.some(f => f.duplicado_de) }))
    .sort((a, b) => (a.tipo === b.tipo ? b.total - a.total : a.tipo === "exacto" ? -1 : 1));
}

/**
 * Los documentos del control que no están asignados del todo: lo que les
 * falta no descuenta de ningún rubro.
 *
 * @returns [{ factura, asignado, falta }]
 */
export function documentosSinAsignar({ facturas = [], asignaciones = [] } = {}) {
  const de = {};
  (asignaciones || []).forEach(a => { de[a.factura_id] = n(de[a.factura_id]) + n(a.monto); });
  return (facturas || [])
    .map(f => {
      const asignado = r2(de[f.id]);
      const falta = r2(Math.abs(n(f.total)) - Math.abs(asignado));
      return falta > 0.01 ? { factura: f, asignado, falta } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.falta - a.falta);
}

/**
 * Los pedidos de la obra que figuran pagados en Compras y no tienen documento
 * en el control, ni uno parecido que enganchar: la plata salió y el control
 * no la tiene de ninguna forma.
 *
 * @param yaFacturados  lo que devolvió `pedidosYaFacturados`: esos tienen con qué engancharse
 * @returns [{ pedido, monto }]
 */
export function pagadosSinDocumento({ solicitudes = [], adjuntos = [], yaFacturados = [] } = {}) {
  const conCandidata = new Set((yaFacturados || []).map(x => Number(x.pedido.id)));
  return (solicitudes || [])
    .filter(s => s && s.pagado_at && !s.factura_id && VIVOS.includes(s.estado) && !conCandidata.has(Number(s.id)))
    .map(s => {
      const suyos = (adjuntos || []).filter(a => Number(a.solicitud_id) === Number(s.id) && (a.tipo || "cotizacion") === "cotizacion");
      return { pedido: s, monto: r2(n(s.pagado_monto) || montoDeSolicitud(s, suyos).monto) };
    })
    .sort((a, b) => b.monto - a.monto);
}

/**
 * Gasto asignado DIRECTO a un rubro que una orden de cambio quitó —su renglón
 * en negativo— o tachó entero. Ahí no hay obra que hacer: el gasto es de otro
 * rubro, y mientras esté ahí el control lo muestra en una fila que no existe.
 *
 * Se elegía desde caja chica y desde la factura del control, que ofrecían ese
 * renglón como cualquier otro. Ya no se ofrece; esto es lo que quedó de antes.
 *
 * @returns [{ asignacion, factura, rubro }]
 */
export function gastosEnRubroQuitado({ rubros = [], facturas = [], asignaciones = [] } = {}) {
  const quitados = new Map((rubros || []).filter(r => r && !recibeGasto(r)).map(r => [Number(r.id), r]));
  if (!quitados.size) return [];
  const factura = new Map((facturas || []).map(f => [Number(f.id), f]));
  return (asignaciones || [])
    .filter(a => a.obra_rubro_id != null && quitados.has(Number(a.obra_rubro_id)) && factura.has(Number(a.factura_id)))
    .map(a => ({ asignacion: a, factura: factura.get(Number(a.factura_id)), rubro: quitados.get(Number(a.obra_rubro_id)) }))
    .sort((x, y) => String(y.factura.fecha || "").localeCompare(String(x.factura.fecha || "")));
}

/**
 * Todas las alertas de una obra, de una vez: para dibujarlas y para contar
 * cuántas hay en la pestaña.
 *
 * @returns { repetidas, sobreasignadas, pedidos, pagados, sinAsignar, enQuitados, cuantas }
 */
export function alertasDeLaObra({ solicitudes = [], facturas = [], asignaciones = [], adjuntos = [], pagos = [], rubros = [] } = {}) {
  const repetidas = facturasRepetidas(facturas);
  const sobreasignadas = facturasSobreasignadas({ facturas, asignaciones });
  const pedidos = pedidosYaFacturados({ solicitudes, facturas, adjuntos, pagos });
  const pagados = pagadosSinDocumento({ solicitudes, adjuntos, yaFacturados: pedidos });
  const sinAsignar = documentosSinAsignar({ facturas, asignaciones });
  const enQuitados = gastosEnRubroQuitado({ rubros, facturas, asignaciones });
  return {
    repetidas, sobreasignadas, pedidos, pagados, sinAsignar, enQuitados,
    cuantas: repetidas.length + sobreasignadas.length + pedidos.length + pagados.length + sinAsignar.length + enQuitados.length,
  };
}
