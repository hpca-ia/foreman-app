// LO QUE LA PROFORMA TRAE Y EL PRESUPUESTO NO TIENE.
//
// Se cotizó X. Se va a la obra, se mide, y hace falta X, Y y T. Esa diferencia
// no es un error de la proforma: es alcance que apareció después de firmar, y
// es plata que sale de la obra. Si no se le cobra al cliente, la paga la
// utilidad — y nadie se entera hasta el cierre, cuando ya no hay con quién
// discutirlo.
//
// El problema no es decidir si se cobra: eso se decide en una conversación. El
// problema es ENCONTRARLO. La proforma tiene cuarenta renglones, el presupuesto
// ciento sesenta, y los tres que no están se ven a ojo solo si alguien se
// sienta a cruzarlos renglón por renglón, que no pasa nunca.
//
// Son dos cosas distintas y se cobran distinto:
//
//   · UN RENGLÓN QUE NO ESTÁ EN NINGÚN RUBRO (la Y, la T). Es trabajo nuevo.
//   · MÁS CANTIDAD DE LA PRESUPUESTADA (la X, que eran 8 y son 12). El rubro
//     existe y su precio ya está acordado: lo que se cobra son las 4 de más, al
//     precio que ya firmó el cliente. Discutir el precio de un rubro que ya
//     está en el contrato es abrir una negociación que no hacía falta.
//
// Sin base de datos: se le pasa lo que devolvió la comparación.

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

/**
 * @param comparacion lo que devuelve compararContraPresupuesto
 * @returns { nuevos, demas, costo, cuantos }
 */
export function loQueNoEstaPresupuestado(comparacion) {
  const lineas = comparacion?.lineas || [];

  // DE DÓNDE VIENE EL RUBRO CONTRA EL QUE SE COMPARA.
  //
  // Un rubro puede ser del contrato original o haber entrado por una orden de
  // cambio ya aprobada. La diferencia importa al discutirla: si la propuesta
  // nueva cambia una cantidad que YA se modificó en la OC-01, eso no es un
  // adicional nuevo, es la misma conversación por segunda vez — y hay que
  // decirlo antes de mandarle otra orden al cliente por lo mismo.
  const deDonde = r => (r?.origen === "orden_cambio"
    ? `ya venía de una orden de cambio${r.orden_cambio_id ? ` (la N° ${r.orden_cambio_id})` : ""}`
    : null);

  // Trabajo nuevo: la proforma lo cotiza y no hay rubro que lo contenga.
  const nuevos = lineas.filter(l => !l.rubro).map(l => ({
    descripcion: String(l.descripcion || "").slice(0, 160),
    unidad: l.unidad || "u",
    cantidad: n(l.cantidad) || 1,
    costo: c2(l.cotizado),
    costoUnitario: c2(n(l.cotizado) / (n(l.cantidad) || 1)),
    // No hay precio acordado: hay que ponerle uno.
    precioUnitario: null,
    por: "no está en el presupuesto",
    hallazgo: "nuevo",
  }));

  // Más cantidad de la que se presupuestó, del mismo rubro.
  const demas = lineas.filter(l => l.rubro && n(l.cantidad) > n(l.cantidadRubro) * 1.001).map(l => {
    const extra = c2(n(l.cantidad) - n(l.cantidadRubro));
    return {
      descripcion: `${l.rubro.descripcion || l.descripcion} — ${extra} ${l.unidadRubro || l.unidad || "u"} de más`.slice(0, 160),
      unidad: l.unidadRubro || l.unidad || "u",
      cantidad: extra,
      costo: c2(extra * (n(l.puProforma) || 0)),
      costoUnitario: c2(l.puProforma),
      // EL PRECIO YA ESTÁ ACORDADO: es el del rubro del contrato. Volver a
      // ponerle precio a un rubro que el cliente ya firmó es abrir una
      // negociación que no hacía falta.
      precioUnitario: l.puRubro != null ? c2(l.puRubro) : null,
      por: `el rubro tiene ${n(l.cantidadRubro)} ${l.unidadRubro || ""} y la proforma trae ${n(l.cantidad)}`.trim(),
      rubro_id: l.rubro.id,
      rubro_codigo: String(l.rubro.numero ?? l.rubro.codigo ?? ""),
      deOrden: deDonde(l.rubro),
      hallazgo: "mas_cantidad",
    };
  });

  // ── Y LO QUE FALTA, QUE TAMBIÉN ES UNA DIFERENCIA CON EL CLIENTE ──────────
  //
  // Una liquidación o una propuesta nueva también puede traer MENOS: el rubro
  // se contrató por 120 m² y la liquidación mide 95. Eso no es un ahorro
  // nuestro — es trabajo que no se hizo y que el cliente no tiene por qué
  // pagar. Va en la misma orden de cambio, pero como reducción.
  //
  // Decirlo importa tanto como lo otro: una obra que solo informa los
  // adicionales y se queda callada con las reducciones es una obra a la que el
  // cliente deja de creerle los adicionales.
  const menos = lineas.filter(l => l.rubro && n(l.cantidad) > 0 && n(l.cantidad) < n(l.cantidadRubro) * 0.999).map(l => {
    const falta = c2(n(l.cantidadRubro) - n(l.cantidad));
    return {
      descripcion: `${l.rubro.descripcion || l.descripcion} — ${falta} ${l.unidadRubro || l.unidad || "u"} de menos`.slice(0, 160),
      unidad: l.unidadRubro || l.unidad || "u",
      cantidad: falta,
      costo: c2(falta * (n(l.puProforma) || 0)),
      costoUnitario: c2(l.puProforma),
      precioUnitario: l.puRubro != null ? c2(l.puRubro) : null,
      por: `el contrato tiene ${n(l.cantidadRubro)} ${l.unidadRubro || ""} y acá figuran ${n(l.cantidad)}`.trim(),
      rubro_id: l.rubro.id,
      rubro_codigo: String(l.rubro.numero ?? l.rubro.codigo ?? ""),
      deOrden: deDonde(l.rubro),
      hallazgo: "menos_cantidad",
      quita: true,
    };
  });

  const todo = [...nuevos, ...demas];
  // Las que tocan algo que ya movió una orden anterior: son las que hay que
  // mirar dos veces antes de volver a cobrarlas.
  const sobreOrdenes = [...demas, ...menos].filter(x => x.deOrden);
  return {
    nuevos, demas, menos, todo, sobreOrdenes,
    cuantos: todo.length,
    // Lo que se le devuelve al cliente, al precio que él firmó.
    aDevolver: c2(menos.reduce((t, x) => t + n(x.precioUnitario) * x.cantidad, 0)),
    costo: c2(todo.reduce((t, x) => t + x.costo, 0)),
    // Lo que ya tiene precio acordado se cobra a ese precio; el resto todavía
    // no tiene ninguno y por eso no se puede sumar un total de venta sin
    // inventarlo.
    conPrecio: c2(demas.reduce((t, x) => t + n(x.precioUnitario) * x.cantidad, 0)),
    sinPrecio: nuevos.length,
  };
}

/**
 * Esos hallazgos, como partidas de una orden de cambio.
 *
 * El costo viaja: es lo que dice la proforma y es lo que después mide el margen
 * de la orden. El precio sale del costo más el porcentaje que ponga la oficina,
 * salvo en lo que ya tiene precio acordado en el contrato, que se respeta.
 *
 * @param pct  utilidad a aplicar sobre el costo de lo que no tiene precio
 */
export function partidasParaOrden(hallazgos, pct = 0) {
  const p = n(pct);
  return [...(hallazgos?.todo || []), ...(hallazgos?.menos || [])].map(x => ({
    tipo: x.quita ? "quita" : "aumenta",
    descripcion: x.descripcion,
    unidad: x.unidad,
    cantidad: x.cantidad,
    costo_unitario: x.costoUnitario,
    precio_unitario: x.precioUnitario != null ? x.precioUnitario : c2(x.costoUnitario * (1 + p / 100)),
    rubro_codigo: x.rubro_codigo || "",
    obra_rubro_id: x.rubro_id || "",
  }));
}

/** El titular, para no tener que armarlo en cada pantalla. */
export function comoSeDice(h) {
  if (!h.cuantos && !h.menos?.length) return null;
  const partes = [];
  if (h.nuevos.length) partes.push(`${h.nuevos.length} ${h.nuevos.length === 1 ? "renglón que no está" : "renglones que no están"} en el presupuesto`);
  if (h.demas.length) partes.push(`${h.demas.length} ${h.demas.length === 1 ? "rubro con más cantidad" : "rubros con más cantidad"} de la presupuestada`);
  if (h.menos.length) partes.push(`${h.menos.length} ${h.menos.length === 1 ? "rubro con menos" : "rubros con menos"} de lo contratado`);
  return `${partes.join(" y ")} · $${h.costo.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} de costo`;
}
