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
// ── LAS REDUCCIONES NO SE VEN COMO UNA LÍNEA NEGATIVA ───────────────────────
//
// Cuando una orden quita un rubro que ya estaba en el contrato, no agrega una
// línea en negativo: TACHA el rubro original (`anulado_por_oc`). Por eso en el
// control de presupuesto se ven las adiciones de la orden y no se ve la
// reducción — está, pero es un rubro que dejó de contar. Acá se suma aparte,
// con su monto, para que se pueda decir cuánto sacó cada orden.
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
  const original = c2(base.reduce((t, r) => t + enLaBaseDelControl(r), 0));
  const reducciones = c2(base.filter(r => r.anulado_por_oc).reduce((t, r) => t + enLaBaseDelControl(r), 0));

  // Lo que las órdenes agregaron. Una quita escrita a mano —sin rubro al que
  // apuntar— entró en negativo y se resta sola.
  const adiciones = c2(deOrden.reduce((t, r) => t + enLaBaseDelControl(r), 0));

  return {
    original,
    adiciones,
    reducciones,
    neto: c2(adiciones - reducciones),
    vigente: c2(original - reducciones + adiciones),
    cuantasOrdenes: new Set(deOrden.map(r => r.orden_cambio_id).filter(Boolean)).size,
    cuantosTachados: base.filter(r => r.anulado_por_oc).length,
    // Cuánto IVA lleva adentro el vigente, para poder decir el número sin él:
    // el contrato se firma con IVA y los adicionales se cotizan sin IVA, y en
    // una conversación hacen falta los dos.
    sinIva: c2(vivos.filter(r => !r.anulado_por_oc).reduce((t, r) => t + baseSinIva(r), 0)),
    // Lo que daría sumando los total_base como están guardados: si no coincide
    // con el vigente, hay rubros de orden que entraron sin IVA.
    comoEstaGuardado: c2(vivos.filter(r => !r.anulado_por_oc).reduce((t, r) => t + n(r.total_base), 0)),
  };
}
