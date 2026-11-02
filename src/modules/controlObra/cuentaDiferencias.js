// QUÉ SE DECIDIÓ CON CADA DIFERENCIA, Y CÓMO VA EL ANÁLISIS.
//
// Vive aparte de la base porque es lo único de todo esto que se puede probar
// sin un navegador — y es lo que decide qué se le cobra a un cliente.

/** Lo que se decidió con cada diferencia, y qué significa. */
export const DECISIONES = {
  pendiente: { label: "Sin decidir", pista: "Todavía se está discutiendo" },
  cobrar: {
    label: "Se le cobra al cliente",
    pista: "Entra en la orden de cambio que el cliente firma y paga",
  },
  // LAS DOS QUE NO SE LE COBRAN AL CLIENTE, Y QUE NO SON LO MISMO.
  //
  //   · YA ESTABA INCLUIDO es una respuesta AL PROVEEDOR: eso que está
  //     cotizando aparte ya forma parte de lo que se le contrató, así que no se
  //     le paga. No sale plata de ningún lado; la conversación es con él, y lo
  //     que hay que poder señalar es en qué rubro estaba, porque es lo que va a
  //     pedir cuando vuelva a reclamarlo.
  //
  //   · LO PAGAMOS NOSOTROS es una decisión SOBRE NUESTRA PLATA: el trabajo es
  //     real y hay que hacerlo, el cliente no lo va a pagar aparte, y sale de
  //     un rubro del contrato que ya está vendido. El cliente no aprueba nada
  //     —ya lo pagó cuando firmó ese rubro— y lo que ese rubro tenga de más
  //     entre su precio y lo que de verdad costó queda a favor del proyecto.
  //
  // Dicho de una: en la primera no se gasta, en la segunda se gasta de un
  // rubro propio. Por eso la segunda llega a Beneficios y la primera no.
  incluido: {
    label: "Ya estaba incluido",
    pista: "Ya es parte de lo que se le contrató al proveedor: no se le paga aparte. Señalá en qué rubro estaba",
  },
  nuestro: {
    label: "Lo pagamos nosotros",
    pista: "Se hace con la plata de un rubro ya contratado: el cliente no aprueba nada y lo que sobre de ese rubro queda a favor",
  },
  // UN AHORRO NO ES UNA DIFERENCIA CON EL CLIENTE.
  //
  // Si el proveedor cotiza por debajo del costo cargado, no hay nada que
  // cobrar ni que devolver: el cliente paga el precio que firmó y nosotros
  // compramos mejor. Eso es una eficiencia, y vive en Beneficios.
  eficiencia: {
    label: "Es eficiencia nuestra",
    pista: "Se compró por debajo de lo presupuestado: no se le cobra al cliente, se registra en Beneficios",
  },
};

/**
 * QUÉ SE PUEDE DECIDIR CON CADA HALLAZGO.
 *
 * Ofrecer las cuatro siempre deja elegir las dos que no son: cobrarle al
 * cliente porque compramos más barato, o anotar como eficiencia nuestra un
 * trabajo que no está en el contrato. Un botón que no corresponde no es una
 * opción de más: es la respuesta equivocada al alcance de un clic.
 */
export function decisionesPara(hallazgo) {
  const todas = Object.keys(DECISIONES).filter(k => k !== "pendiente");
  if (hallazgo === "bajo_precio") return todas.filter(k => k !== "cobrar");
  return todas.filter(k => k !== "eficiencia");
}

/** Cómo va un análisis, para poder tener varios abiertos sin perderse. */
export function comoVa(lineas = []) {
  const sinDecidir = lineas.filter(l => l.decision === "pendiente").length;
  const aCobrar = lineas.filter(l => l.decision === "cobrar");
  // LO QUE SE DEVUELVE NO SE SUMA CON LO QUE SE COBRA.
  //
  // Un renglón con menos cantidad decidido "se cobra" quiere decir que entra en
  // la orden —como reducción—, no que le sumamos plata al cliente. Contarlo en
  // el mismo total deja el titular diciendo que se le cobran $500 cuando se le
  // cobran $300 y se le devuelven $200, que es otra conversación.
  const suma = ls => Math.round(ls.reduce((t, l) => t + (Number(l.monto) || 0), 0) * 100) / 100;
  const seCobran = aCobrar.filter(l => l.hallazgo !== "menos_cantidad");
  const seDevuelven = aCobrar.filter(l => l.hallazgo === "menos_cantidad");
  // Lo que quedó a favor nuestro se cuenta aparte de lo que se le cobra al
  // cliente: son dos plata distintas y van a dos lados distintos.
  const eficiencias = lineas.filter(l => l.decision === "eficiencia");
  // REVISADO NO ES DECIDIDO. Un renglón mirado y dejado a propósito para
  // hablarlo el lunes no es lo mismo que uno que nadie abrió, y sin
  // distinguirlos volver al análisis obliga a empezar desde arriba.
  const revisadas = lineas.filter(l => !!l.revisado_at || l.decision !== "pendiente");
  const anotadas = lineas.filter(l => String(l.nota || "").trim());
  const miradasSinDecidir = lineas.filter(l => !!l.revisado_at && l.decision === "pendiente");
  return {
    total: lineas.length,
    sinDecidir,
    aCobrar: seCobran.length,
    monto: suma(seCobran),
    aDevolver: seDevuelven.length,
    montoDevuelto: suma(seDevuelven),
    enLaOrden: aCobrar.length,
    eficiencias: eficiencias.length,
    revisadas: revisadas.length,
    sinMirar: lineas.length - revisadas.length,
    // Las que alguien ya miró y dejó pendientes a propósito: son las que hay
    // que volver a tocar, y no se mezclan con las que nadie abrió.
    miradasSinDecidir: miradasSinDecidir.length,
    anotadas: anotadas.length,
    aFavor: Math.round(eficiencias.reduce((t, l) => t + (Number(l.monto) || 0), 0) * 100) / 100,
    listo: lineas.length > 0 && sinDecidir === 0,
  };
}

/**
 * QUÉ ES ESTE RENGLÓN AHORA QUE SE LE SEÑALÓ OTRO RUBRO.
 *
 * Un renglón sin rubro entra como trabajo nuevo, y está bien: sin un rubro que
 * lo cubra, eso es alcance que apareció después. Pero en el momento en que
 * alguien le señala el rubro a mano, deja de ser trabajo nuevo —el contrato SÍ
 * lo cubre— y pasa a ser una de otras dos cosas: el mismo trabajo con otra
 * cantidad, o el mismo trabajo al mismo volumen y a otro precio.
 *
 * Sin rehacer la cuenta, la tarjeta sigue diciendo "no está en el contrato" al
 * lado del rubro que lo contiene, con el monto entero como si hubiera que
 * cobrarlo todo. Lo que corresponde cobrar —o lo que queda a favor— es la
 * diferencia contra lo contratado, y el beneficio no aparecía en ningún lado.
 *
 * LA VARA ES EL COSTO CARGADO SI EXISTE, y si no el precio que vio el cliente:
 * es la misma regla con la que se leyó la proforma, y tiene que ser la misma
 * acá o el mismo renglón diría dos cosas distintas según cómo llegó.
 *
 * @param linea  la diferencia guardada, con lo que decía el papel
 * @param rubro  el rubro que se le señaló, ya sin IVA en su unitario
 * @returns { hallazgo, cantidad, monto, por } o null si contra ese rubro calza
 */
export function recalcularContra(linea, rubro, unitarioSinIva) {
  const n = v => Number(v) || 0;
  const c2 = v => Math.round(n(v) * 100) / 100;
  const cantPapel = n(linea?.cantidad_papel ?? linea?.cantidad);
  const montoPapel = n(linea?.monto_papel ?? linea?.monto);
  if (!rubro) {
    return { hallazgo: "nuevo", cantidad: cantPapel || 1, monto: montoPapel,
      por: "no está en el presupuesto" };
  }
  const cantRubro = n(rubro.cantidad);
  const puPapel = cantPapel ? montoPapel / cantPapel : 0;
  const puRubro = n(unitarioSinIva);
  const puCosto = n(rubro.costo_unitario) > 0 ? n(rubro.costo_unitario) : null;
  const vara = puCosto != null ? puCosto : puRubro;

  if (cantRubro && cantPapel > cantRubro * 1.001) {
    const extra = c2(cantPapel - cantRubro);
    return { hallazgo: "mas_cantidad", cantidad: extra, monto: c2(extra * puPapel),
      por: `el rubro tiene ${cantRubro} ${rubro.unidad || ""} y la proforma trae ${cantPapel}`.trim() };
  }
  if (cantRubro && cantPapel > 0 && cantPapel < cantRubro * 0.999) {
    const falta = c2(cantRubro - cantPapel);
    return { hallazgo: "menos_cantidad", cantidad: falta, monto: c2(falta * puPapel),
      por: `el contrato tiene ${cantRubro} ${rubro.unidad || ""} y acá figuran ${cantPapel}`.trim() };
  }
  // Misma cantidad: lo único que puede haber cambiado es el precio.
  const dif = c2((puPapel - vara) * (cantPapel || cantRubro || 1));
  if (!vara || Math.abs(dif) <= Math.max(0.01, Math.abs(vara) * 0.001)) return null;
  return {
    hallazgo: dif > 0 ? "subio_precio" : "bajo_precio",
    cantidad: cantPapel || cantRubro || 1,
    monto: Math.abs(dif),
    por: `${puCosto != null ? "costaba" : "el cliente lo vio a"} $${c2(vara)} y ahora lo cotizan a $${c2(puPapel)}`,
  };
}
