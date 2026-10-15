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
