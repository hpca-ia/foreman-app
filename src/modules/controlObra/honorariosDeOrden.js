// LOS HONORARIOS DE UNA ORDEN DE CAMBIO, Y QUÉ AFECTA ESA ORDEN.
//
// Dos cosas que hasta ahora el papel no decía, y las dos se discuten en cada
// reunión de obra.
//
// QUÉ AFECTA. Una orden puede mover la plata, cambiar una especificación sin
// mover un peso, correr el plazo, o las tres a la vez. Hoy todas se leen igual
// —"orden de cambio 03"— y el cliente abre el PDF para enterarse de si eso le
// cuesta algo o le cambia la fecha de entrega. Decirlo arriba cambia a quién
// hay que mandársela y con cuánta urgencia.
//
// LOS HONORARIOS. El contrato dice que sobre la obra que administramos se cobra
// un porcentaje —acá el 10%—. Un adicional es obra que se administra igual que
// el resto: hay que comprarlo, dirigirlo y responder por él. Entonces sobre el
// neto de la orden se cobran esos honorarios.
//
// Y NO ENCARECE EL RUBRO: VA A HONORARIOS.
//
// Repartir el 10% dentro de los precios de las partidas haría dos daños. El
// precio de un rubro quedaría mintiendo —ese vinil no cuesta $56,10, cuesta
// $51 y lo demás es nuestro honorario— y el día que haya que comparar ese
// precio contra otra cotización, la comparación sale mal. Y el honorario
// quedaría escondido justo donde tiene que estar a la vista: es la parte que el
// cliente acepta aparte, y que se discute aparte.
//
// Va como una línea al pie, igual que el IVA, y al aprobarse entra al control
// como un rubro del capítulo de HONORARIOS, no sumado a los rubros de la orden.
//
// SI LA ORDEN ES NEGATIVA, LOS HONORARIOS TAMBIÉN. Si se reduce el alcance, se
// administra menos: el honorario baja en la misma proporción. Cobrar el 10% de
// una reducción sería cobrar por lo que no se hizo, y no cobrarlo cuando baja
// —cobrándolo cuando sube— es quedarse con la mitad buena de la regla.

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

/**
 * QUÉ AFECTA LA ORDEN. Puede ser más de una, y casi siempre lo es: un cambio
 * de especificación que además cuesta y además corre el plazo son tres
 * casillas, no una elección entre tres.
 */
export const AFECTA = [
  ["economica", "Económica", "Cambia la plata del contrato"],
  ["especificacion", "Especificación", "Cambia qué o cómo se construye"],
  ["tiempo", "Tiempo", "Corre el plazo de entrega"],
];

export const comoSeLlama = clave => AFECTA.find(a => a[0] === clave)?.[1] || clave;

/** Las claves que vienen de la base, limpias y sin repetir. */
export function afectaDe(orden) {
  const crudo = Array.isArray(orden?.afecta) ? orden.afecta : [];
  return AFECTA.map(a => a[0]).filter(k => crudo.includes(k));
}

/** Para el papel y para la lista: "Económica · Tiempo". */
export function comoSeDice(orden) {
  const suyas = afectaDe(orden);
  if (!suyas.length) return null;
  if (suyas.length === AFECTA.length) return "Económica, especificación y tiempo";
  return suyas.map(comoSeLlama).join(" · ");
}

/**
 * El neto de la orden: lo que agrega menos lo que quita.
 *
 * Es sobre esto que se calculan los honorarios, y no sobre las adiciones:
 * cobrar el porcentaje de lo que se agrega e ignorar lo que se quita sería
 * cobrar honorarios por obra que no se va a hacer.
 */
export function netoDeLaOrden(lineas = []) {
  let adiciones = 0, reducciones = 0;
  for (const l of lineas) {
    const monto = n(l.cantidad) * n(l.precio_unitario);
    if (l.tipo === "quita") reducciones += monto; else adiciones += monto;
  }
  return { adiciones: c2(adiciones), reducciones: c2(reducciones), neto: c2(adiciones - reducciones) };
}

/**
 * La cuenta del pie de la orden: neto, honorarios, y el IVA sobre los dos.
 *
 * EL IVA VA SOBRE EL TOTAL, honorarios incluidos: el honorario es un servicio y
 * se factura con IVA como todo lo demás. Dejarlo afuera deja el papel firmado
 * diciendo un número y la factura otro.
 *
 * @param lineas  las partidas de la orden
 * @param pct     el porcentaje de honorarios del contrato (10 = 10%)
 * @param iva     el IVA que corresponde (15 = 15%), 0 si no lleva
 */
export function honorariosDe({ lineas = [], pct = 0, iva = 0 } = {}) {
  const { adiciones, reducciones, neto } = netoDeLaOrden(lineas);
  const p = n(pct);
  const honorarios = p > 0 ? c2(neto * p / 100) : 0;
  const base = c2(neto + honorarios);
  const impuesto = n(iva) > 0 ? c2(base * n(iva) / 100) : 0;
  return {
    adiciones, reducciones, neto,
    pct: p, honorarios,
    // Lo que se firma antes del impuesto, y lo que de verdad se paga.
    subtotal: base,
    iva: impuesto,
    total: c2(base + impuesto),
    // Los honorarios de una orden negativa son negativos: se administra menos.
    devuelve: honorarios < 0,
    hay: p > 0 && honorarios !== 0,
  };
}

/**
 * La línea de honorarios, como rubro del control.
 *
 * Entra en su propio capítulo —el de HONORARIOS— y no sumada a los rubros de la
 * orden: el precio de cada partida tiene que seguir diciendo lo que cuesta esa
 * partida, porque es el número contra el que después se compara una cotización.
 *
 * @param conIva  cómo llevar el monto a la base del control, que maneja IVA
 */
export function rubroDeHonorarios(orden, cuenta, { capitulo = "HONORARIOS", conIva = v => v, iva = 0 } = {}) {
  if (!cuenta?.hay) return null;
  const codigo = orden?.codigo || `OC-${String(orden?.numero ?? "").padStart(2, "0")}`;
  return {
    obra_id: orden.obra_id,
    numero: 9000 + n(orden.numero) * 100 + 99,
    capitulo,
    capitulo_orden: 9000 + n(orden.numero),
    orden: 9000000 + n(orden.numero) * 1000 + 999,
    descripcion: `Honorarios ${cuenta.pct}% sobre ${cuenta.devuelve ? "la reducción de " : ""}${codigo}`,
    unidad: "glb",
    cantidad: 1,
    precio_unitario: conIva(cuenta.honorarios),
    total_base: conIva(cuenta.honorarios),
    iva_pct: iva,
    origen: "orden_cambio",
    orden_cambio_id: orden.id,
  };
}
