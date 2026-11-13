// DE COMPRAS AL CONTROL DE OBRA.
//
// Una compra de una obra tiene que terminar en el control: el documento, para
// que descuente su rubro; y el pago, para que Proveedores no muestre una deuda
// que ya no existe. Y tiene que llegar SOLA, desde Compras: si después de
// pagar alguien tiene que acordarse de ir a cargar la misma factura a la
// planilla, la carga dos veces o no la carga.
//
// Eso es lo que pasaba. En Compras se podía marcar «se pagó» y subir el
// comprobante sin que el documento entrara al control: seis pedidos por
// $9.574 quedaron pagados en Compras y «aprobados» para siempre, mientras
// alguien cargaba cinco de esas facturas a mano en la planilla, sin
// engancharlas. El control contaba la misma plata dos veces —invertida por la
// factura y comprometida por el pedido— y una de ellas figuraba impaga.
//
// Acá están las decisiones, sin base ni pantalla, para poder probarlas.

import { montoDeSolicitud } from "../controlObra/calculos.js";

const n = v => Number(v) || 0;
const r2 = v => Math.round(n(v) * 100) / 100;
const limpio = t => String(t || "").trim();

/** Los estados en los que la compra ya debería estar pesando en el control. */
const YA_APROBADA = ["aprobada", "comprada", "recibida"];

/**
 * ¿Este pedido es de una obra, ya se aprobó, y su documento todavía no está en
 * el control? Un gasto de oficina no entra a ningún control: no le falta nada.
 */
export const faltaEnElControl = s => !!s && s.lead_id != null && !s.factura_id && YA_APROBADA.includes(s.estado);

/**
 * Lo que ya se sabe del documento antes de que nadie escriba nada.
 *
 * Quien pidió la compra subió la cotización —muchas veces la factura misma— y
 * NOVA ya leyó de quién es y por cuánto. Volver a pedirle esos datos a quien
 * paga es pedirle que copie lo que la pantalla ya tiene.
 *
 * @param adjuntos  los del pedido: cotizaciones, respaldos, comprobantes
 * @returns { proveedor, total, de, papel }  `papel` es el adjunto que hace de
 *          documento: el último respaldo, o la cotización elegida —o la única—
 */
export function documentoSugerido(solicitud = {}, adjuntos = []) {
  const suyos = (adjuntos || []).filter(Boolean);
  const cotizaciones = suyos.filter(a => a.tipo === "cotizacion");
  const elegida = solicitud.proforma_id != null
    ? cotizaciones.find(a => Number(a.id) === Number(solicitud.proforma_id)) || null : null;
  const delPedido = elegida || (cotizaciones.length === 1 ? cotizaciones[0] : null);
  const respaldo = suyos.filter(a => a.tipo === "respaldo")
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0] || null;
  const m = montoDeSolicitud(solicitud, cotizaciones.map(a => ({ ...a, solicitud_id: solicitud.id })));
  return {
    proveedor: limpio(solicitud.proveedor) || limpio(respaldo?.proveedor) || limpio(delPedido?.proveedor),
    total: r2(m.monto), de: m.de,
    papel: respaldo || delPedido,
  };
}

/**
 * Cuánto registrar de pago contra un documento del control.
 *
 * Lo que se escribe es ESTE pago, no el total pagado: una factura se paga en
 * dos veces y cada vez se anota lo que salió. En blanco es «lo que falta».
 * Nunca más de lo que falta: pagar de más un documento es casi siempre un
 * anticipo de otra cosa, y eso va con su propio documento.
 *
 * @returns { monto, pendiente } o { error }
 */
export function abonoAlControl({ total, pagado = 0, escrito = null, esAnticipo = false }) {
  const pendiente = r2(n(total) - n(pagado));
  if (escrito == null || limpio(escrito) === "") return { monto: Math.max(0, pendiente), pendiente };
  const monto = r2(escrito);
  if (!(monto > 0)) return { error: "Escribí cuánto se pagó." };
  if (monto > pendiente + 0.005) {
    return {
      pendiente,
      error: (pendiente > 0.005
        ? `De ese documento quedan por pagar $${pendiente.toFixed(2)}: no se puede registrar un pago mayor.`
        : "Ese documento ya está pagado entero en el control.")
        + (esAnticipo ? " Si es el saldo de lo que se anticipó, va con la factura final: cargala en el control y liquidá el anticipo." : ""),
    };
  }
  return { monto, pendiente };
}

// Palabras que están en casi todos los nombres y no dicen de quién es.
const RUIDO = new Set(["S", "A", "SA", "CIA", "LTDA", "CA", "SAS", "DE", "DEL", "LA", "EL", "LOS", "LAS", "Y", "E",
  "PAGO", "FACTURA", "FACT", "PROFORMA", "COTIZACION", "REPORTE", "DEVOLUCION", "COMPANIA", "ECUADOR"]);
const palabras = t => limpio(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
  .split(/[^A-Z0-9]+/).filter(p => p.length > 1 && !RUIDO.has(p));

/** ¿Dos nombres de proveedor son el mismo? «Kevin Ormaza» y «KEVIN ALEXIS ORMAZA BUENO», sí. */
export function mismoProveedor(a, b) {
  const pa = new Set(palabras(a)), pb = new Set(palabras(b));
  if (!pa.size || !pb.size) return false;
  const comunes = [...pa].filter(p => pb.has(p)).length;
  return comunes >= 2 || (comunes === 1 && Math.min(pa.size, pb.size) === 1);
}

/**
 * Los documentos del control que pueden ser el de este pedido.
 *
 * Para cuando la factura ya se cargó desde la planilla y nadie la enganchó: se
 * ofrece engancharla en vez de cargarla otra vez. Primero los del mismo monto;
 * si no hay ninguno, los del mismo proveedor —un anticipo del 50% no coincide
 * en monto con el pedido, pero sí en a quién se le pagó—.
 *
 * @param facturas     las de la obra
 * @param enganchadas  ids de facturas que ya son de algún pedido
 * @param pagos        los pagos de la obra: { factura_id, monto }
 * @returns [{ factura, mismoMonto, mismoProveedor, pagado }]
 */
export function candidatasDelControl(solicitud = {}, { facturas = [], enganchadas = [], adjuntos = [], pagos = [] } = {}) {
  const tomadas = new Set((enganchadas || []).map(Number));
  const cotizaciones = (adjuntos || []).filter(a => a.tipo === "cotizacion").map(a => ({ ...a, solicitud_id: solicitud.id }));
  const montos = [montoDeSolicitud(solicitud, cotizaciones).monto, solicitud.pagado_monto, solicitud.monto, solicitud.monto_estimado]
    .map(r2).filter(m => m > 0);
  const nombres = [solicitud.proveedor, ...(adjuntos || []).filter(a => a.tipo !== "pago").map(a => a.proveedor)].filter(Boolean);
  const pagadoDe = {};
  (pagos || []).forEach(p => { pagadoDe[p.factura_id] = r2(n(pagadoDe[p.factura_id]) + n(p.monto)); });

  const vistas = (facturas || [])
    .filter(f => f && !tomadas.has(Number(f.id)) && n(f.total) > 0 && f.clase !== "nota_credito" && f.clase !== "proforma")
    .map(f => ({
      factura: f,
      mismoMonto: montos.some(m => Math.abs(m - n(f.total)) < 0.01),
      mismoProveedor: nombres.some(x => mismoProveedor(x, f.razon_social)),
      pagado: n(pagadoDe[f.id]),
    }))
    .filter(c => c.mismoMonto || c.mismoProveedor);
  const porMonto = vistas.filter(c => c.mismoMonto);
  const elegidas = porMonto.length ? porMonto : vistas;
  return elegidas
    .sort((a, b) => (Number(b.mismoMonto) + Number(b.mismoProveedor)) - (Number(a.mismoMonto) + Number(a.mismoProveedor))
      || String(b.factura.fecha || "").localeCompare(String(a.factura.fecha || "")))
    .slice(0, 5);
}

/**
 * Al enganchar un documento que ya estaba en el control: cuánto pago hay que
 * registrarle para que diga lo mismo que Compras, y cuánto queda pagado.
 *
 * Compras dice «se pagó X»; el control puede no tener ese pago (se cargó la
 * factura y no el pago) o tenerlo entero. Nunca se registra más que lo que el
 * documento vale: el pedido de $4.562 que figuraba pagado entero tenía en el
 * control un anticipo de $2.281, que es lo que de verdad salió.
 *
 * @returns { registrar, pagado }  `pagado` es lo que queda dicho en el pedido
 */
export function pagoAlEnganchar({ total, pagadoEnControl = 0, pagadoEnCompras = 0, estabaPagado = false }) {
  const dicho = estabaPagado ? Math.min(n(pagadoEnCompras), n(total)) : 0;
  const registrar = Math.max(0, r2(dicho - n(pagadoEnControl)));
  return { registrar, pagado: r2(n(pagadoEnControl) + registrar) };
}
