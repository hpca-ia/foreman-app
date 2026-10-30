// Las cuentas de los beneficios de la obra.
//
// Aparte del resto porque es lo único que se puede probar sin un navegador —y
// porque es lo que no puede estar mal: estos números son los que dicen si la
// obra dejó plata.

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

/**
 * Cuánto se ganó y cuánto se perdió, por separado.
 *
 * NUNCA solo el neto: un neto de "+$300" puede esconder $4.000 de ahorro y
 * $3.700 de sobreprecio, y esas son dos obras muy distintas. La primera compra
 * bien y tiene un problema puntual; la segunda no sabe lo que le está pasando.
 */
export function totales(beneficios = []) {
  let presupuestado = 0, real = 0, ahorro = 0, sobreprecio = 0, previsto = 0, cuantosPrevistos = 0;
  beneficios.forEach(b => {
    const d = n(b.presupuestado) - n(b.real);
    // LO PREVISTO NO SUMA CON LO COBRADO.
    //
    // Una proforma dice lo que va a costar, no lo que costó: entre que el
    // proveedor cotiza y la factura llega se cae la mitad. Sumarlo al total es
    // contar plata que todavía no existe, y es el error que hace que una obra
    // parezca rentable hasta el último mes. Se cuenta aparte, que es distinto
    // de no contarlo: adelantar el beneficio de un rubro es lo que deja
    // decidir con tiempo dónde se puede gastar más.
    if (esPrevisto(b)) { previsto += d; cuantosPrevistos += 1; return; }
    presupuestado += n(b.presupuestado); real += n(b.real);
    if (d > 0) ahorro += d; else sobreprecio += -d;
  });
  return {
    presupuestado: c2(presupuestado), real: c2(real),
    ahorro: c2(ahorro), sobreprecio: c2(sobreprecio), neto: c2(ahorro - sobreprecio),
    previsto: c2(previsto), cuantosPrevistos,
    cuantos: beneficios.length - cuantosPrevistos,
  };
}

/** ¿Todavía es una promesa? Lo que vino de una proforma lo es hasta que se compra. */
export const esPrevisto = b => String(b?.estado || "confirmado") === "previsto";

/** Lo que de verdad dejó cada rubro: solo lo ya comprado. */
export function netoPorRubro(beneficios = []) {
  const mapa = {};
  beneficios.forEach(b => {
    if (!b.obra_rubro_id || esPrevisto(b)) return;
    mapa[b.obra_rubro_id] = c2((mapa[b.obra_rubro_id] || 0) + n(b.presupuestado) - n(b.real));
  });
  return mapa;
}

/** ¿Sale de una orden de cambio? Ese beneficio es de cobrar, no de comprar. */
export const esDeOrden = b => b?.origen === "orden_cambio" || !!b?.orden_cambio_id;

/**
 * Los totales, separados por de dónde sale la plata.
 *
 * COMPRAR MEJOR Y COBRAR UN ADICIONAL NO SON LO MISMO. El beneficio de una
 * compra es comprar abajo de lo presupuestado; el de una orden de cambio es lo
 * que se le cobra al cliente arriba de lo que cuesta. Sumados en un solo
 * número, una obra que compra mal puede parecer sana porque cobró bien los
 * adicionales, y eso es justo lo que este panel tiene que dejar ver.
 */
export function totalesPorOrigen(beneficios = []) {
  return {
    compras: totales(beneficios.filter(b => !esDeOrden(b))),
    ordenes: totales(beneficios.filter(esDeOrden)),
    obra: totales(beneficios),
  };
}

/**
 * LAS ÓRDENES APROBADAS QUE NO ESTÁN SUMANDO EN BENEFICIOS, Y POR QUÉ.
 *
 * El margen de una orden de cambio es beneficio de la obra igual que comprar
 * mejor. Para contarlo hacen falta dos cosas, y cuando falta una la orden
 * desaparece de Beneficios sin decir nada: queda cobrándose en el contrato y
 * sin aparecer en la utilidad, que es la peor de las dos mitades.
 *
 *   · QUE SE HAYA EJECUTADO. Una orden marcada "no ejecutada" no deja margen, y
 *     está bien — pero si ya metió sus rubros al presupuesto de la obra, las dos
 *     cosas no pueden ser ciertas a la vez. Eso es lo que pasa hoy con las dos
 *     OC-01: aprobadas, cobrándose, y marcadas como no ejecutadas.
 *   · QUE SE SEPA LO QUE CUESTA. Sin costo en las partidas no hay margen que
 *     calcular. No es cero: es que no se sabe.
 *
 * @param ordenes  las de la obra
 * @param lineasPorOrden { [orden_id]: [lineas] }
 */
export function ordenesMudas(ordenes = [], lineasPorOrden = {}) {
  const tiene = l => l?.costo_unitario !== null && l?.costo_unitario !== undefined && l?.costo_unitario !== "";
  return (ordenes || [])
    .filter(o => o?.estado === "aprobada" && !o.anulada)
    .map(o => {
      const adiciones = (lineasPorOrden[o.id] || []).filter(l => l.tipo !== "quita");
      const sinCosto = adiciones.filter(l => !tiene(l)).length;
      const noEjecutada = o.ejecucion === "no_ejecutado";
      if (!noEjecutada && !sinCosto) return null;
      const por = [
        noEjecutada ? "está marcada como NO EJECUTADA, pero sus rubros ya están en el presupuesto de la obra" : "",
        sinCosto ? `${sinCosto} ${sinCosto === 1 ? "partida" : "partidas"} sin costo: no se sabe qué deja` : "",
      ].filter(Boolean).join(" · ");
      return { orden: o, noEjecutada, sinCosto, por };
    })
    .filter(Boolean);
}

/**
 * CONTRA QUÉ SE MIDE EL MARGEN DE UNA ORDEN DE CAMBIO.
 *
 * Son dos cosas distintas y se leen igual en la pantalla, así que hay que
 * decirlo:
 *
 *   · LA PARTIDA QUE CAE SOBRE UN RUBRO QUE YA EXISTÍA se mide contra el
 *     presupuesto: el rubro estaba contratado y lo que la orden agrega se
 *     compara con lo que ese rubro tenía cargado.
 *   · LA PARTIDA NUEVA NO TIENE CONTRA QUÉ COMPARARSE. Ese rubro no existía ni
 *     en el presupuesto ni en el control: entra el rato que el cliente aprueba
 *     la orden, y desde entonces el presupuesto de ese trabajo ES el precio de
 *     la orden. Su beneficio es el precio aprobado menos lo que costó, y nada
 *     más —buscarle un rubro del presupuesto es buscar algo que nunca existió—.
 *
 * Sin esto, el que mira el margen de una orden hecha toda de rubros nuevos
 * busca la base en el presupuesto, no la encuentra, y concluye que el número
 * está mal.
 */
export function contraQueSeMide(ordenes = [], lineasPorOrden = {}) {
  let nuevas = 0, sobreRubros = 0;
  (ordenes || []).filter(o => o?.estado === "aprobada" && !o.anulada).forEach(o => {
    (lineasPorOrden[o.id] || []).filter(l => l.tipo !== "quita").forEach(l => {
      if (l.obra_rubro_id) sobreRubros += 1; else nuevas += 1;
    });
  });
  if (!nuevas && !sobreRubros) return null;
  const partes = [];
  if (sobreRubros) {
    partes.push(`${sobreRubros} ${sobreRubros === 1 ? "partida cae" : "partidas caen"} sobre rubros que ya `
      + `${sobreRubros === 1 ? "estaba" : "estaban"} en el contrato: ahí el margen se mide contra el presupuesto`);
  }
  if (nuevas) {
    partes.push(`${nuevas} ${nuevas === 1 ? "es un rubro nuevo" : "son rubros nuevos"} que no `
      + `${nuevas === 1 ? "existía" : "existían"} ni en el presupuesto ni en el control —`
      + `${nuevas === 1 ? "entró" : "entraron"} al aprobarse la orden—: su base es el precio que el cliente `
      + "aprobó, y el margen es ese precio menos lo que costó");
  }
  return { nuevas, sobreRubros, frase: `${partes.join(" · ")}.` };
}
