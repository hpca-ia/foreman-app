// LAS COMPRAS DEVUELTAS: cuándo vuelven solas, quién las puede reactivar, y
// el número con que se nombra una compra.
//
// Hernán, 26/11/2026: «Devolví una compra, residente envió otra cotización
// nueva, pero esta sigue como devuelta. Las compras deberían tener un número
// de ID para identificarlas. ¿Es posible solo comentar algo de la compra y no
// necesariamente devolver?... Yo la devolví por error, los admins deben poder
// activarla de nuevo».
//
// Lo que había pasado ese día, leído de la base:
//
//   · La N° 37 se devolvió a las 11:34 con «No está bien cotizado». A las
//     13:03 la residente subió otra cotización. El archivo quedó guardado,
//     pero volver a pedir el visto era OTRO botón —«Reenviar», al pie—, que no
//     tocó: para ella, subir la cotización era mandarla. La compra se quedó
//     «Devuelta», en el tablero de ella, y a quien da el visto no le llegó
//     nada.
//
//   · La N° 35 se devolvió con «Estoy gestionando descuento con Gina Aldaz»:
//     eso era un comentario. «Comentar y avisar» existía desde antes, pero
//     aparecía recién al escribir y chico, debajo del cuadro; los botones a la
//     vista eran «Aprobar» y «Devolver».
//
// Las reglas, sin base ni pantalla, para poder probarlas
// (pruebas/comprasDevueltas.test.mjs).

const texto = v => String(v ?? "").trim();

/** El número con que se nombra una compra: el de la base, que no cambia y ya salía en el PDF. */
export const numeroDeCompra = s => (s?.id != null ? `N° ${s.id}` : "");

/** El título de la tarea de un paso, con el número adelante: «Aprobar compra N° 37: Pintura…». */
export const tituloDelPaso = (paso, s) => `${paso}${s?.id != null ? ` N° ${s.id}` : ""}: ${texto(s?.descripcion)}`;

/** ¿Lo que se escribió en el buscador es el número de una compra? «37», «#37», «N° 37», «n 37». */
export function numeroBuscado(busca) {
  const m = texto(busca).match(/^(?:#|n(?:[°º]|o\.?|\.)?\s*)?(\d{1,9})$/i);
  return m ? Number(m[1]) : null;
}

/**
 * La última vez que se devolvió: el último paso del historial que la dejó en
 * «Devuelta» viniendo de otro estado. Un comentario —mismo estado de los dos
 * lados— no es una devolución.
 *
 * @param historial  las filas de `compras_historial` de la solicitud
 * @returns { cuando, quien, comentario } o null
 */
export function ultimaDevolucion(historial = []) {
  const pasos = (Array.isArray(historial) ? historial : [])
    .filter(h => h && h.estado_nuevo === "requiere_info" && h.estado_anterior !== "requiere_info")
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const h = pasos[pasos.length - 1];
  return h ? { cuando: h.created_at || null, quien: texto(h.usuario_nombre), comentario: texto(h.comentario) } : null;
}

/**
 * Las cotizaciones que llegaron DESPUÉS de que se devolvió: es lo que quien
 * la devolvió necesita saber para no dejarla esperando a alguien que ya
 * contestó.
 *
 * @returns las filas de `compras_adjuntos`, o [] si no está devuelta o no llegó ninguna
 */
export function cotizacionesDesdeQueSeDevolvio({ solicitud, historial = [], adjuntos = [] } = {}) {
  if (solicitud?.estado !== "requiere_info") return [];
  const d = ultimaDevolucion(historial);
  if (!d?.cuando) return [];
  return (Array.isArray(adjuntos) ? adjuntos : [])
    .filter(a => a && a.tipo === "cotizacion" && String(a.created_at || "") > String(d.cuando));
}

/**
 * SUBIR LA COTIZACIÓN NUEVA ES MANDARLA. Si la compra está devuelta y le
 * llega una cotización, vuelve sola a esperar el visto: es la respuesta a lo
 * que se pidió corregir.
 *
 * LA SUBA QUIEN LA SUBA. La primera versión de esta regla la limitaba a quien
 * había pedido la compra. Hernán, el mismo 26/11/2026, mirando la N° 37
 * todavía «Devuelta» con su cotización nueva: «si tienen una nueva
 * cotización, ¿no debería estar en mi decisión otra vez?». Una devuelta con
 * cotización nueva está esperando a quien da el visto, no a quien la pidió.
 */
export const vuelveSolaAlSubir = ({ solicitud } = {}) => solicitud?.estado === "requiere_info";

/**
 * LA DEVUELTA QUE YA TIENE SU COTIZACIÓN NUEVA Y NO VOLVIÓ —se subió antes de
 * que existiera la regla de arriba, o algo falló al volver— LE TOCA A QUIEN
 * LA PUEDE REACTIVAR, no a quien la pidió: tiene que aparecerle entre lo que
 * espera por él, que es donde la busca.
 *
 * @param conNueva  si tiene una cotización posterior a su devolución
 */
export const leTocaReactivarla = ({ solicitud, conNueva = false, esAdmin = false } = {}) =>
  !!conNueva && puedeReactivar({ solicitud, esAdmin });

/**
 * QUIÉN PUEDE REACTIVAR UNA DEVUELTA —volver a ponerla a esperar el visto sin
 * que quien la pidió haga nada—: los administradores. Es para deshacer una
 * devolución que fue un error, o para destrabar una que ya tiene lo que se
 * pidió y nadie reenvió.
 *
 * @param esAdmin  si la persona es administradora (Director o asistente)
 */
export const puedeReactivar = ({ solicitud, esAdmin = false } = {}) => !!esAdmin && solicitud?.estado === "requiere_info";

/** Lo que queda escrito al reactivar, si no se escribió otra cosa. */
export const NOTA_AL_REACTIVAR = "Se reactivó: vuelve a esperar el visto.";
/** Y al volver sola por una cotización nueva. */
export const NOTA_AL_VOLVER_SOLA = "Subió una cotización nueva: vuelve a esperar el visto.";
