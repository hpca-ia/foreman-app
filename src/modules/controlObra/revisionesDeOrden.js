// OC-04 → OC-04-A → OC-04-B
//
// Un adicional aprobado no siempre queda quieto. Se aprueba el piso de
// hormigón, se empieza a picar y aparecen cuarenta metros más; o el cliente
// pide otro acabado sobre el cambio que ya aceptó. Eso no es una orden nueva
// —es la misma conversación, sobre el mismo trabajo— y tampoco es un error que
// haya que anular: la orden original existió, y lo que pasa es que se modifica.
//
// El código guarda la historia. Quien ve "OC-04-B" sabe que hubo dos versiones
// antes y las puede ir a buscar, y el cliente reconoce que es el mismo cambio
// que ya había firmado en vez de recibir una orden nueva por lo mismo. Y no
// consume número: la orden que sigue a la OC-04 es la OC-05, haya tenido la 04
// las modificaciones que haya tenido.
//
// Las primeras se numeraron con punto —OC-01.1, OC-01.2—. Se siguen
// reconociendo como de la misma familia, pero lo que sale desde ahora lleva
// letra, que es como se nombran en obra.
//
// Aparte y sin base de datos porque es donde vive la regla del código, y un
// código mal armado se le manda al cliente.

/** La orden a la que pertenece un código: "OC-04" para OC-04, OC-04-B y OC-04.1. */
const raiz = codigo => {
  const m = /^(OC-\d+)/i.exec(String(codigo || "").trim());
  return m ? m[1].toUpperCase() : String(codigo || "").split(".")[0];
};

/** Lo que va detrás del número: "B" en OC-04-B, "2" en OC-01.2, "" en OC-04. */
const sufijo = codigo => String(codigo || "").trim().slice(raiz(codigo).length).replace(/^[\s.-]+/, "");

/** A, B, … Z, AA, AB: la letra de la modificación número n. */
export function letraDe(n) {
  let s = "", k = n;
  while (k > 0) {
    k -= 1;
    s = String.fromCharCode(65 + (k % 26)) + s;
    k = Math.floor(k / 26);
  }
  return s;
}

/** Qué número de modificación es un sufijo: A → 1, B → 2, y el ".2" viejo → 2. */
function ordinal(s) {
  const t = String(s || "").toUpperCase();
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  if (!/^[A-Z]+$/.test(t)) return 0;
  return [...t].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);
}

/** Todas las versiones de una misma orden, la original incluida. */
export function laFamiliaDe(orden, ordenes = []) {
  if (!orden) return [];
  const base = raiz(orden.codigo);
  return (ordenes || [])
    .filter(o => raiz(o.codigo) === base)
    .sort((a, b) => ordinal(sufijo(a.codigo)) - ordinal(sufijo(b.codigo)));
}

/**
 * EL CÓDIGO DE LA PRÓXIMA MODIFICACIÓN.
 *
 * Se cuenta sobre las que ya existen y no sobre la que se está modificando: si
 * se modifica la OC-04 teniendo ya una OC-04-A, la que sale es la B y no otra
 * A. Dos papeles con el mismo código es la peor manera de perder una discusión
 * con un cliente.
 */
export function codigoDeLaRevision(orden, ordenes = []) {
  const base = raiz(orden?.codigo) || "OC";
  const mayor = laFamiliaDe(orden, ordenes).reduce((m, o) => Math.max(m, ordinal(sufijo(o.codigo))), 0);
  return `${base}-${letraDe(mayor + 1)}`;
}

/** ¿Esta orden ya fue reemplazada por una modificación posterior? */
export const estaReemplazada = o => !!o?.reemplazada_at;

/**
 * ¿Cuenta en el contrato vigente?
 *
 * La aprobada y viva. Una anulada no existió, y una reemplazada por su
 * modificación existió pero ya no manda: si contaran las dos, el contrato
 * sumaría el mismo trabajo dos veces.
 */
export const mandaEnElControl = o => o?.estado === "aprobada" && !o?.anulada && !o?.reemplazada_at;

/** Qué decir de una orden que tiene parientes, en una línea. */
export function comoSeDice(orden, ordenes = []) {
  if (!orden) return null;
  const familia = laFamiliaDe(orden, ordenes);
  if (familia.length < 2) return null;
  const esRevision = !!orden.revision_de || !!sufijo(orden.codigo);
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
