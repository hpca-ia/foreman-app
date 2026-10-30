// EN CUÁNTO VA EL CONTRATO: lo firmado, lo que las órdenes le movieron, y el total.
//
// Son tres números y hacen falta los tres. El contrato original es lo que se
// firmó y no cambia nunca: es contra lo que se mide todo. Las órdenes de cambio
// aprobadas lo mueven —suman lo que se agregó y restan lo que se sacó— y el
// vigente es lo que hoy se le cobra al cliente. Con uno solo no se puede
// discutir nada: "el contrato son doscientos mil" no dice si eran ciento
// noventa y entraron diez de adicionales o eran doscientos diez y se sacaron
// diez.
//
// ── EL IVA: CADA DOCUMENTO EN SU BASE ──────────────────────────────────────
//
// El CONTROL DE PRESUPUESTO maneja IVA: sus rubros están cargados con el
// impuesto adentro, y contra eso se descuenta lo que se va gastando.
//
// La ORDEN DE CAMBIO se arma sin IVA —sus rubros y su margen se cotizan sin
// impuesto, y el IVA va al pie del documento, como en cualquier proforma—.
//
// Las dos cosas están bien, pero cuando una orden aprobada mete sus rubros al
// control, tiene que entrar en la base del control: CON IVA. Si no, el
// adicional suma un 15% de menos y el contrato vigente queda corto sin que nada
// lo diga.
//
// ── LAS REDUCCIONES SON LÍNEAS DE LA ORDEN ──────────────────────────────────
//
// El presupuesto original es lo que se firmó y no se toca. Una orden no lo
// edita: le suma sus adiciones y le resta sus reducciones, y las dos son
// renglones suyos, en su capítulo, uno en positivo y otro en negativo.
//
// Hasta la 141 la reducción tachaba el rubro original del contrato. Por eso el
// capítulo de la orden mostraba solo lo que sumaba: ADICIONALES · OC-01 por
// $12.508,62 cuando esa orden movía $3.849,94.
//
// Sin base de datos: se le pasan los rubros de la obra.

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

/**
 * Lo que vale un rubro EN LA BASE DEL CONTROL, que es con IVA.
 *
 * Los rubros base ya lo traen adentro. Los que metió una orden de cambio antes
 * de que esto se arreglara entraron con el monto de la línea —sin IVA— y hay
 * que llevarlos a la misma base para poder sumarlos: un total que mezcla las
 * dos cosas no cuadra con ningún papel.
 */
export function enLaBaseDelControl(r) {
  // Desde la 140 TODOS los rubros del control están en su base, incluidos los
  // que mete una orden de cambio: el puente les pone el IVA al entrar. Esto
  // existe igual, con nombre propio, porque es la pregunta que se hacen las
  // pantallas —"¿cuánto vale esto en el control?"— y la respuesta tiene que
  // estar en un solo lugar el día que vuelva a no ser obvia.
  return c2(n(r?.total_base));
}

/** Lo que vale un rubro sin IVA: la base en la que se cotiza y se mide el margen. */
export function baseSinIva(r) {
  const total = n(r?.total_base);
  if (r?.origen === "orden_cambio") return c2(total);
  const pct = n(r?.iva_pct);
  return pct > 0 ? c2(total / (1 + pct / 100)) : c2(total);
}

/**
 * @param rubros  los de la obra, con su origen, su iva_pct y su anulado_por_oc
 * @returns { original, adiciones, reducciones, vigente, cuantasOrdenes, mezcla }
 */
export function contratoDe(rubros = []) {
  const vivos = (rubros || []).filter(r => !r?.oculto);
  const base = vivos.filter(r => r.origen !== "orden_cambio");
  const deOrden = vivos.filter(r => r.origen === "orden_cambio");

  // EL ORIGINAL INCLUYE LO QUE DESPUÉS SE TACHÓ. Es lo que se firmó: si una
  // orden sacó un rubro, el contrato original seguía teniéndolo, y por eso la
  // reducción se puede mostrar como lo que es —algo que se quitó— en vez de
  // hacer desaparecer la plata sin explicación.
  // EL ORIGINAL ES EL PRESUPUESTO ENTERO: ninguna orden lo edita. (En las obras
  // de antes de la 141 una reducción tachaba un rubro; esos rubros volvieron a
  // contar y su resta vive ahora en la línea negativa de su orden.)
  const original = c2(base.filter(r => !r.anulado_por_oc).reduce((t, r) => t + enLaBaseDelControl(r), 0));

  // Lo que las órdenes suman y lo que restan, por separado: un neto esconde las
  // dos mitades, y lo que se discute con el cliente son las dos.
  const adiciones = c2(deOrden.filter(r => n(r.total_base) >= 0).reduce((t, r) => t + enLaBaseDelControl(r), 0));
  const reducciones = c2(-deOrden.filter(r => n(r.total_base) < 0).reduce((t, r) => t + enLaBaseDelControl(r), 0));

  return {
    original,
    adiciones,
    reducciones,
    neto: c2(adiciones - reducciones),
    vigente: c2(original + adiciones - reducciones),
    cuantasOrdenes: new Set(deOrden.map(r => r.orden_cambio_id).filter(Boolean)).size,
    cuantasReducciones: deOrden.filter(r => n(r.total_base) < 0).length,
    // Cuánto IVA lleva adentro el vigente, para poder decir el número sin él:
    // el contrato se firma con IVA y los adicionales se cotizan sin IVA, y en
    // una conversación hacen falta los dos.
    sinIva: c2(vivos.filter(r => !r.anulado_por_oc).reduce((t, r) => t + baseSinIva(r), 0)),
    // Lo que daría sumando los total_base como están guardados: si no coincide
    // con el vigente, hay rubros de orden que entraron sin IVA.
    comoEstaGuardado: c2(vivos.filter(r => !r.anulado_por_oc).reduce((t, r) => t + n(r.total_base), 0)),
  };
}
