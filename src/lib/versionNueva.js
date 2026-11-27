// ¿HAY UNA VERSIÓN NUEVA DE FOREMAN PUBLICADA?
//
// Hernán, 18/11/2026, a las 17:17, diez minutos después de publicado el
// arreglo de «Comprar con esta»: «no sirve el botón comprar con esta...». Su
// captura era de la versión de antes: la pestaña estaba abierta desde antes de
// publicar, y una pestaña abierta sigue corriendo el código con que se cargó
// hasta que alguien la recarga. Tocó el botón viejo cinco veces más.
//
// No es la primera vez (scripts/version.mjs: «pasó dos veces hoy»). El número
// de versión del encabezado sirve para comparar, pero hay que saber que hay
// que mirarlo. Esto lo mira FOREMAN: cada tanto, y al volver a la pestaña,
// pide la página de entrada —que es la que nombra el archivo del código que
// está publicado— y la compara con el que está corriendo. Si no coinciden,
// avisa (components/AvisoDeVersionNueva.jsx). Recarga sola solo cuando no se
// corta nada (más abajo, «se actualiza sola»).

/** El archivo principal del código que nombra una página: «static/js/main.1dc52875.js». */
export const principalDe = texto => (String(texto || "").match(/static\/js\/main\.[a-z0-9]+\.js/) || [""])[0];

/** ¿La página publicada nombra otro código que el que está corriendo? */
export function esOtraVersion(paginaPublicada, laQueCorre) {
  const publicada = principalDe(paginaPublicada);
  // Sin una de las dos no hay con qué comparar: no se avisa por las dudas.
  return !!publicada && !!laQueCorre && publicada !== laQueCorre;
}

/** El código que está corriendo en esta pestaña. Vacío en desarrollo, donde no lleva número. */
export function laQueCorre(doc = typeof document !== "undefined" ? document : null) {
  return principalDe([...(doc?.scripts || [])].map(s => s.src || "").join(" "));
}

/** Pregunta al servidor. Si no se puede preguntar —sin conexión—, es que no. */
export async function hayVersionNueva() {
  const mia = laQueCorre();
  if (!mia) return false;
  try {
    const r = await fetch(`/?version=${Date.now()}`, { cache: "no-store" });
    return r.ok ? esOtraVersion(await r.text(), mia) : false;
  } catch {
    return false;
  }
}

// SE ACTUALIZA SOLA, SIN PERDER NADA (27/11/2026).
//
// Hernán, desde el iPad: «¿Cómo recargo la página? No tiene flecha redonda.
// Hago abajo, no funciona, y no quiero salir y entrar. ¿Puede recargar auto?».
// FOREMAN abierto desde el ícono de la pantalla de inicio no tiene la barra de
// Safari: ni la flecha, ni el deslizar hacia abajo. El aviso de abajo pedía
// tocar «Actualizar», y eso es justo lo que no se ve venir.
//
// Ahora se recarga sola en dos momentos en que no se corta nada: al volver a
// FOREMAN desde otra app, y al cambiar de módulo en el menú. Y vuelve al
// módulo donde estaba. Si hay algo a medio escribir —un campo con el cursor,
// una ventana abierta encima, algo escrito recién—, no: queda el aviso, con su
// botón, y la recarga espera.

let laNuevaYaSeSabe = false;
/** ¿Ya se vio, en esta pestaña, que hay una versión publicada más nueva? */
export const hayUnaNuevaConocida = () => laNuevaYaSeSabe;
export const anotarQueHayNueva = () => { laNuevaYaSeSabe = true; };

/** Un campo donde se escribe: con el cursor adentro, lo escrito puede no estar guardado. */
export const esEditable = el => !!el && (el.isContentEditable === true || /^(INPUT|TEXTAREA|SELECT)$/.test(String(el.tagName || "")));

let ultimaEscritura = 0;
/** Cuándo se escribió o se salió de un campo por última vez (ahí arranca el guardado). */
export const cuandoSeEscribio = () => ultimaEscritura;

/** Anota cada vez que se escribe, se cambia o se sale de un campo. Devuelve cómo dejar de anotar. */
export function vigilarLoQueSeEscribe(doc = typeof document !== "undefined" ? document : null) {
  if (!doc) return () => {};
  const anotar = e => { if (esEditable(e.target)) ultimaEscritura = Date.now(); };
  const tipos = ["input", "change", "focusout"];
  tipos.forEach(t => doc.addEventListener(t, anotar, true));
  return () => tipos.forEach(t => doc.removeEventListener(t, anotar, true));
}

/**
 * ¿Se puede recargar sin que se pierda nada?
 * No, con el cursor en un campo, con una ventana abierta encima (un
 * formulario que se guarda con su botón) o si se escribió hace menos de
 * `margen`: el guardado de lo último puede estar en camino.
 */
export function nadaAMedias({ enfocado = null, tapado = false, escrito = 0, ahora = Date.now(), margen = 4000 } = {}) {
  if (esEditable(enfocado) || tapado) return false;
  return ahora - escrito >= margen;
}

/** ¿Hay algo abierto encima de la pantalla? Las ventanas de FOREMAN cubren el centro, fijas. */
export function hayAlgoEncima(doc = document, win = window) {
  let el = doc.elementFromPoint?.(win.innerWidth / 2, win.innerHeight / 2) || null;
  for (; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
    if (win.getComputedStyle(el).position === "fixed") return true;
  }
  return false;
}

/** Lo que hay abierto ahora, para preguntarle a nadaAMedias. */
export const loQueHayAbierto = (doc = document, win = window) =>
  ({ enfocado: doc.activeElement, tapado: hayAlgoEncima(doc, win), escrito: ultimaEscritura });

const VOLVER_A = "foreman_volver_a";
// Lo que se recuerda dura poco: es para la recarga que se acaba de pedir, no
// para la próxima vez que se abra FOREMAN.
const DURA = 2 * 60 * 1000;

/** Recarga y, si se le dice, vuelve a ese módulo. */
export function recargar({ vista = "" } = {}, win = typeof window !== "undefined" ? window : null) {
  if (!win) return;
  try { if (vista) win.sessionStorage.setItem(VOLVER_A, JSON.stringify({ vista, at: Date.now() })); } catch { /* sin dónde anotarlo, vuelve al inicio */ }
  win.location.reload();
}

/** El módulo donde estaba antes de recargar, si se recargó recién. */
export function adondeVolver(win = typeof window !== "undefined" ? window : null, ahora = Date.now()) {
  try {
    const { vista, at } = JSON.parse(win?.sessionStorage?.getItem(VOLVER_A) || "null") || {};
    return typeof vista === "string" && vista && ahora - Number(at) < DURA ? vista : null;
  } catch {
    return null;
  }
}
