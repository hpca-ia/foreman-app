// OC-01 → OC-01.1 → OC-01.2
//
// Un adicional aprobado no siempre queda quieto. Se aprueba el piso de
// hormigón, se empieza a picar y aparecen cuarenta metros más; o el cliente
// pide otro acabado sobre el cambio que ya aceptó. Eso no es una orden nueva
// —es la misma conversación, sobre el mismo trabajo— y tampoco es un error que
// haya que anular: la orden original existió, y lo que pasa es que se revisa.
//
// El número guarda la historia. Quien ve "OC-01.2" sabe que hubo dos versiones
// antes y las puede ir a buscar, y el cliente reconoce que es el mismo cambio
// que ya había firmado en vez de recibir una orden nueva por lo mismo.
//
// Aparte y sin base de datos porque es donde vive la regla del número, y un
// número mal armado se le manda al cliente.

const raiz = codigo => String(codigo || "").split(".")[0];

/** Todas las versiones de una misma orden, la original incluida. */
export function laFamiliaDe(orden, ordenes = []) {
  if (!orden) return [];
  const base = raiz(orden.codigo);
  return (ordenes || [])
    .filter(o => raiz(o.codigo) === base)
    .sort((a, b) => String(a.codigo || "").localeCompare(String(b.codigo || ""), "es", { numeric: true }));
}

/**
 * EL CÓDIGO DE LA PRÓXIMA REVISIÓN.
 *
 * Se cuenta sobre las que ya existen y no sobre la que se está revisando: si se
 * revisa la OC-01 teniendo ya una OC-01.1, la que sale es la .2 y no otra .1.
 * Dos papeles con el mismo número es la peor manera de perder una discusión con
 * un cliente.
 */
export function codigoDeLaRevision(orden, ordenes = []) {
  const base = raiz(orden?.codigo) || "OC";
  const familia = laFamiliaDe(orden, ordenes);
  let mayor = 0;
  for (const o of familia) {
    const n = Number(String(o.codigo || "").split(".")[1] || 0);
    if (n > mayor) mayor = n;
  }
  return `${base}.${mayor + 1}`;
}

/** ¿Esta orden ya fue reemplazada por una revisión posterior? */
export const estaReemplazada = o => !!o?.reemplazada_at;

/**
 * ¿Cuenta en el contrato vigente?
 *
 * La aprobada y viva. Una anulada no existió, y una reemplazada por su revisión
 * existió pero ya no manda: si contaran las dos, el contrato sumaría el mismo
 * trabajo dos veces.
 */
export const mandaEnElControl = o => o?.estado === "aprobada" && !o?.anulada && !o?.reemplazada_at;

/** Qué decir de una orden que tiene parientes, en una línea. */
export function comoSeDice(orden, ordenes = []) {
  if (!orden) return null;
  const familia = laFamiliaDe(orden, ordenes);
  if (familia.length < 2) return null;
  const esRevision = !!orden.revision_de || String(orden.codigo || "").includes(".");
  const ultima = familia[familia.length - 1];
  if (orden.reemplazada_at) {
    return `Reemplazada por la ${ultima.codigo}: esta versión se firmó y ya no es la que manda.`;
  }
  if (esRevision) {
    const antes = familia.filter(o => o.id !== orden.id).map(o => o.codigo).join(", ");
    return `Revisión de ${antes}: el mismo cambio, con otro alcance.`;
  }
  return null;
}
