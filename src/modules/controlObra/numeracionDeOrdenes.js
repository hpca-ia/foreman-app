// LA NUMERACIÓN DE LAS ÓRDENES DE CAMBIO.
//
// La regla, como la dijo el director: las órdenes guardan su orden —OC-01,
// OC-02, OC-03, OC-04— y la única que no lleva un número nuevo es la
// modificación de una orden, que es la misma orden con una letra: OC-04-A,
// OC-04-B.
//
// Antes el número salía de "la última más uno", y eso deja huecos en cuanto se
// borra una: se armó la OC-05 con la OC-04 vieja todavía en borrador, se borró
// la vieja, y quedó una OC-05 sin que exista ninguna OC-04. El cliente que
// recibe la 05 pregunta por la 04, y no hay nada que mostrarle.
//
// Entonces:
//
//   · una orden nueva toma el primer número libre, que casi siempre es el
//     siguiente y a veces es el de una que se borró;
//   · al borrar una, las que le siguen y TODAVÍA NO SALIERON de la oficina
//     bajan a ocupar el lugar. La que ya se mandó o se aprobó no se toca nunca:
//     su número está en un papel que alguien tiene;
//   · una modificación no consume número: lleva el de su orden y una letra.
//
// Sin base de datos, porque es donde vive la regla del número, y un número mal
// armado se le manda al cliente.

const RAIZ = /^OC-(\d+)/i;

/** OC-04, a partir del número. */
export const codigoPrincipal = numero => `OC-${String(numero).padStart(2, "0")}`;

/**
 * El número de la orden a la que pertenece: el de su código, tenga o no una
 * letra de modificación detrás. Una OC-04-B es de la 4.
 */
export function numeroPrincipal(orden) {
  const m = RAIZ.exec(String(orden?.codigo || ""));
  return m ? Number(m[1]) : Number(orden?.numero) || 0;
}

/** ¿Es la modificación de otra orden? Lleva letra —o el ".1" de las viejas—. */
export const esModificacion = orden => !!orden?.revision_de
  || /^OC-\d+\s*[-.]\s*\w+$/i.test(String(orden?.codigo || ""));

/** El primer número libre para una orden nueva. */
export function siguienteNumero(ordenes = []) {
  const usados = new Set(ordenes.filter(o => !esModificacion(o)).map(numeroPrincipal));
  let n = 1;
  while (usados.has(n)) n += 1;
  return n;
}

/**
 * El número interno de una modificación. No es el que se ve —ese es el de su
 * orden, con la letra—: es solo para que la base no tenga dos iguales, y va
 * por encima de mil para no ocuparle el lugar a ninguna orden.
 */
export function numeroDeModificacion(ordenes = []) {
  return Math.max(1000, ...ordenes.map(o => Number(o?.numero) || 0)) + 1;
}

/** ¿Todavía se le puede cambiar el número? Solo si nunca salió de la oficina. */
export const todaviaNoSalio = o => o?.estado === "borrador" && !o?.anulada && !o?.visto_pedido_at && !o?.visto_at;

/**
 * Los huecos que se pueden cerrar, y cómo.
 *
 * Devuelve qué orden baja a qué número, de menor a mayor: aplicadas en ese
 * orden, ninguna pisa a otra. Solo se mueven las que todavía no salieron.
 *
 * @returns [{ id, de, a, codigoDe, codigoA }]
 */
export function huecosQueSeCierran(ordenes = []) {
  const principales = ordenes.filter(o => !esModificacion(o))
    .sort((a, b) => numeroPrincipal(a) - numeroPrincipal(b));
  const usados = new Set(principales.filter(o => !todaviaNoSalio(o)).map(numeroPrincipal));
  const plan = [];
  for (const o of principales.filter(todaviaNoSalio)) {
    let n = 1;
    while (usados.has(n)) n += 1;
    usados.add(n);
    const de = numeroPrincipal(o);
    if (n !== de) plan.push({ id: o.id, de, a: n, codigoDe: codigoPrincipal(de), codigoA: codigoPrincipal(n) });
  }
  return plan;
}

/** Los números que faltan en la serie, para poder decirlo. */
export function numerosQueFaltan(ordenes = []) {
  const usados = new Set(ordenes.filter(o => !esModificacion(o)).map(numeroPrincipal));
  const mayor = Math.max(0, ...usados);
  const faltan = [];
  for (let n = 1; n < mayor; n += 1) if (!usados.has(n)) faltan.push(n);
  return faltan;
}
