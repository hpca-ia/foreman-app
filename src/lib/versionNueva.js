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
// avisa (components/AvisoDeVersionNueva.jsx). No recarga solo: se puede estar
// a mitad de escribir algo.

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
