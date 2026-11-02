// LA SEMANA DE OBRA: CUÁNDO EMPIEZA Y HASTA CUÁNDO SE ESCRIBE.
//
// Aparte del resto del plan porque es lo único que se puede probar sin un
// navegador, y porque es lo que estaba mal: el plan salía de miércoles a
// martes y nadie lo había elegido. El corte se heredaba del día en que arrancó
// la obra —si empezó un miércoles, todas sus semanas empezaban un miércoles— y
// después del último plan escrito, así que un accidente del calendario quedaba
// convertido en una regla permanente que ninguna pantalla podía cambiar.
//
// La semana de obra arranca el domingo y se llena hasta el domingo siguiente.
// Son ocho días y se pisan en uno a propósito: el domingo de cierre es el de
// apertura del siguiente, que es como se habla de las semanas en obra.

const masDias = (f, n) => {
  const d = new Date(`${String(f).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const cuantosDias = (a, b) =>
  Math.round((new Date(`${String(b).slice(0, 10)}T12:00:00`) - new Date(`${String(a).slice(0, 10)}T12:00:00`)) / 86400000) + 1;

export { masDias, cuantosDias };

/**
 * Qué período proponer al abrir la pantalla.
 *
 * ¿Y SI LA OBRA EMPIEZA UN MIÉRCOLES? Entonces la semana de esa obra es de
 * miércoles a martes, y lo va a ser hasta que termine. El corte no es una
 * propiedad del calendario, es de la obra: se hereda del arranque y después
 * del último plan que se escribió, y la pantalla abre donde corresponde sin
 * que nadie toque las dos fechas.
 *
 * Tres fuentes, en orden:
 *  1. El último plan guardado — su día de arranque y su largo son EL corte de
 *     esta obra, decidido por quien la lleva. Manda sobre cualquier regla.
 *  2. El arranque de la obra (`crono_inicio`) — si empieza el miércoles 8, el
 *     primer plan va del 8 al martes 14.
 *  3. Sin ninguno de los dos, lunes a sábado, que es lo más común.
 *
 * Y después CORRE HASTA HOY manteniendo el corte, de a un paso: el que abre un
 * lunes de marzo no quiere que le ofrezcan la semana de enero porque fue la
 * última que escribió, quiere la de ahora cortada igual que las de enero.
 */
export function proponerPeriodo({ hoy, inicioObra = null, ultimoDesde = null, ultimoHasta = null,
  arranca = null, dias = null } = {}) {
  const dia = String(hoy || new Date().toISOString()).slice(0, 10);
  let ancla, largo;
  // LA OBRA DECIDE SU SEMANA, y manda sobre todo lo demás.
  //
  // Antes el corte se heredaba del día en que arrancó la obra —si empezó un
  // miércoles, todas sus semanas empezaban un miércoles— y después del último
  // plan escrito. Eso convertía un accidente del calendario en una regla
  // permanente que no se podía cambiar desde ninguna pantalla: el plan salía de
  // miércoles a martes y nadie lo había elegido.
  if (arranca != null) {
    ancla = arranqueDeLaSemana(dia, arranca);
    largo = Number(dias) > 0 ? Number(dias) : 8;
    // LA SEMANA EN CURSO, SIN ADIVINAR. El plan se escribe antes de que la
    // semana empiece —esa es su razón de ser— pero saltar solo a la siguiente
    // porque es viernes sorprende al que abrió la pantalla para mirar lo de
    // hoy. La pantalla ofrece la semana en curso y avisa cuándo conviene
    // escribir la que viene; mover una semana es una flecha.
    return { desde: ancla, hasta: masDias(ancla, largo - 1) };
  }
  if (ultimoDesde && ultimoHasta && cuantosDias(ultimoDesde, ultimoHasta) > 0) {
    ancla = String(ultimoDesde).slice(0, 10);
    largo = cuantosDias(ultimoDesde, ultimoHasta);
  } else if (inicioObra) {
    ancla = String(inicioObra).slice(0, 10);
    largo = 7;                         // miércoles a martes
  } else {
    ancla = lunesDeLaSemana(dia);
    largo = 6;                         // lunes a sábado
  }
  // El paso es la semana salvo que el período sea más largo. "De lunes a
  // lunes" son 8 días y se pisan en un día a propósito: el paso sigue siendo
  // 7 y el lunes de cierre es el de apertura del siguiente.
  const paso = largo <= 8 ? 7 : largo;
  // La obra no empezó todavía: el primer plan es el del arranque.
  if (dia <= ancla) return { desde: ancla, hasta: masDias(ancla, largo - 1) };
  const saltos = Math.floor(cuantosDias(ancla, dia) / paso - 1 / paso);
  const desde = masDias(ancla, Math.max(0, saltos) * paso);
  return { desde, hasta: masDias(desde, largo - 1) };
}

/** El período anterior y el siguiente, conservando el corte y el largo. */
export function correrPeriodo(desde, hasta, haciaDonde) {
  const largo = Math.max(1, cuantosDias(desde, hasta));
  const paso = largo <= 8 ? 7 : largo;
  const d = masDias(desde, paso * (haciaDonde < 0 ? -1 : 1));
  return { desde: d, hasta: masDias(d, largo - 1) };
}

/**
 * El día en que arranca la semana que contiene a esta fecha.
 *
 * @param arranca  0 domingo, 1 lunes … 6 sábado
 */
export function arranqueDeLaSemana(fecha, arranca = 0) {
  const d = new Date(`${String(fecha).slice(0, 10)}T12:00:00`);
  if (isNaN(d)) return String(fecha).slice(0, 10);
  const hoy = d.getDay();
  const atras = (hoy - Number(arranca) + 7) % 7;
  d.setDate(d.getDate() - atras);
  return d.toISOString().slice(0, 10);
}

export function lunesDeLaSemana(fecha) {
  const d = new Date(`${String(fecha).slice(0, 10)}T12:00:00`);
  if (isNaN(d)) return String(fecha).slice(0, 10);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
