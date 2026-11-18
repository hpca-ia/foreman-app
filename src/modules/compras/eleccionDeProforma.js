// CON QUÉ COTIZACIÓN SE COMPRA: en el historial queda la elección FINAL.
//
// Hernán, 18/11/2026, mirando el historial del pedido del porcelanato, con
// catorce renglones «Proforma elegida» —los clics de cuando el botón no
// mostraba que había elegido, y los de ir y volver entre las dos
// cotizaciones—: «se está cargando información de error en los pasos abajo.
// Solo debería cargar la información final seleccionada».
//
// Cada toque de «Comprar con esta» anotaba un renglón. Pero elegir no es un
// paso del pedido: es un dato del paso en que está. Lo que sirve seis meses
// después es con cuál se compró, no las veces que se cambió de idea antes de
// dar el visto.
//
// La regla: de las elecciones SEGUIDAS —sin que el pedido haya cambiado de
// estado ni nadie haya escrito otra cosa en el medio— vale la última. Si entre
// dos elecciones pasó algo (se devolvió, se aprobó, alguien comentó), las dos
// quedan: ahí sí cuentan una historia.
//
// Se aplica en dos lugares: al guardar una elección se borran las seguidas de
// antes (`eleccionesDeAntes`), y al mostrar el historial se saltean las que
// hayan quedado de antes de esta regla (`soloLaEleccionFinal`), sin tocar la
// base.

/** ¿Este renglón del historial es una elección de cotización? */
export const esEleccion = h => !!h && h.estado_anterior === h.estado_nuevo && /^Proforma elegida: /.test(String(h.comentario || ""));

/**
 * El historial como se lee: de cada tanda de elecciones seguidas, la última.
 * @param historial  los renglones en orden, del más viejo al más nuevo
 */
export function soloLaEleccionFinal(historial = []) {
  const filas = Array.isArray(historial) ? historial : [];
  return filas.filter((h, i) => !(esEleccion(h) && esEleccion(filas[i + 1])));
}

/**
 * Las elecciones que deja atrás una nueva: los ids de las que están al final
 * del historial, una detrás de otra.
 * @param historial  los renglones en orden, del más viejo al más nuevo
 */
export function eleccionesDeAntes(historial = []) {
  const filas = Array.isArray(historial) ? historial : [];
  const ids = [];
  for (let i = filas.length - 1; i >= 0 && esEleccion(filas[i]); i--) ids.push(filas[i].id);
  return ids.reverse();
}
