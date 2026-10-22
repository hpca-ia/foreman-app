// LA JORNADA DE OBRA NO TERMINA A MEDIANOCHE.
//
// Si se funde hasta las dos de la mañana, eso es trabajo del día anterior y el
// residente lo escribe cuando termina —no antes de las doce para que el libro
// no se le cierre en la mano—. Con el corte a medianoche, lo que pasó en la
// noche caía en el día siguiente o directamente no se podía escribir, y lo que
// no se puede escribir el día que pasó termina escrito de memoria dos días
// después, que es justo lo que un libro de obra no puede permitirse.
//
// La jornada va de las 6 de la mañana a las 6 de la mañana siguiente.
//
// Vive en su propio archivo porque es la única parte del libro que se puede
// probar sin un navegador, y es la que no puede estar mal.

export const HORA_DE_CIERRE = 6;

/** Qué día de obra se está escribiendo ahora mismo, en hora de Quito. */
export function hoyEnObra(ahora = new Date()) {
  const corrido = new Date(ahora.getTime() - HORA_DE_CIERRE * 60 * 60 * 1000);
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return f.format(corrido);
}
