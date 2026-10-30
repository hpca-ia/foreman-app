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
// Y HASTA CUÁNDO SE PUEDE ESCRIBIR ES OTRA PREGUNTA.
//
// Una cosa es a qué día pertenece lo que pasó —eso lo decide la jornada— y
// otra hasta cuándo se puede dejarlo escrito. Estaban pegadas, y el resultado
// era que el residente que trabajó toda la noche tenía que escribir el libro
// antes de irse a dormir: a las 6 de la mañana se le cerraba en la mano.
//
// El libro de un día queda abierto hasta el MEDIODÍA DEL DÍA SIGUIENTE. Es
// tiempo para llegar a la casa, dormir y escribirlo con la cabeza fresca, y
// sigue siendo lo bastante corto como para que valga: un libro rellenado tres
// semanas después no prueba nada, pero uno escrito a las diez de la mañana del
// día siguiente lo escribió alguien que todavía se acuerda.
//
// Vive en su propio archivo porque es la única parte del libro que se puede
// probar sin un navegador, y es la que no puede estar mal.

export const HORA_DE_CIERRE = 6;
export const HORA_LIMITE_ESCRITURA = 12;

/** Qué día de obra se está escribiendo ahora mismo, en hora de Quito. */
export function hoyEnObra(ahora = new Date()) {
  const corrido = new Date(ahora.getTime() - HORA_DE_CIERRE * 60 * 60 * 1000);
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return f.format(corrido);
}

/** La fecha de obra del día anterior a una dada. */
export function diaAnterior(fecha) {
  const d = new Date(`${String(fecha).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Qué hora es en la obra, 0 a 23. */
export function horaEnObra(ahora = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Guayaquil", hour: "2-digit", hour12: false,
  }).format(ahora));
}

/**
 * ¿Se puede escribir todavía el libro de este día?
 *
 * El de la jornada en curso, siempre. El de la jornada anterior, hasta el
 * mediodía: es la ventana para el que trabajó de noche y lo escribe cuando se
 * levanta.
 *
 * @returns { sePuede, porQue, hastaMediodia }
 */
export function sePuedeEscribirEl(fecha, ahora = new Date()) {
  const dia = String(fecha || "").slice(0, 10);
  const hoy = hoyEnObra(ahora);
  if (!dia) return { sePuede: false, porQue: "sin fecha", hastaMediodia: false };
  if (dia === hoy) return { sePuede: true, porQue: "es la jornada en curso", hastaMediodia: false };
  if (dia > hoy) return { sePuede: false, porQue: "todavía no pasó", hastaMediodia: false };
  if (dia === diaAnterior(hoy) && horaEnObra(ahora) < HORA_LIMITE_ESCRITURA) {
    return { sePuede: true, porQue: "la jornada anterior se escribe hasta el mediodía", hastaMediodia: true };
  }
  return { sePuede: false, porQue: "pasó el mediodía del día siguiente", hastaMediodia: false };
}
