// PERMISO PARA ANOTAR DÍAS QUE TODAVÍA NO PASARON.
//
// La asistencia es una firma: dice que esta persona trabajó este día. Anotar
// por adelantado es firmar algo que no ocurrió, y el día que haya que defender
// un rol de pagos —ante el trabajador, ante el Ministerio— eso no se explica.
//
// Pero a veces hace falta, por una razón legítima: el cierre de mes cae un
// miércoles y el rol sale el jueves, con los dos días que faltan. La respuesta
// no es prohibirlo ni dejarlo abierto, es que alguien lo autorice por los días
// que haga falta y nada más.
//
// Sin base de datos: las fechas y los permisos que entran, la respuesta que
// sale. Es la parte que no puede estar mal.

const soloDia = f => String(f || "").slice(0, 10);

/** Hoy en la obra, que es donde se trabaja y no donde está el servidor. */
export function hoyEnObra(ahora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(ahora);
}

/** El permiso vivo que cubre más lejos, si hay alguno. */
export function permisoVigente(permisos = [], hoy = hoyEnObra()) {
  const dados = (permisos || [])
    .filter(p => p.estado === "dado" && soloDia(p.hasta) >= soloDia(hoy))
    .sort((a, b) => soloDia(b.hasta).localeCompare(soloDia(a.hasta)));
  return dados[0] || null;
}

/**
 * ¿Se puede anotar asistencia de este día?
 *
 * @returns { sePuede, futuro, hasta, porQue }
 */
export function sePuedeAnotar(fecha, permisos = [], hoy = hoyEnObra()) {
  const dia = soloDia(fecha);
  if (!dia) return { sePuede: false, futuro: false, porQue: "Elegí una fecha." };
  if (dia <= soloDia(hoy)) return { sePuede: true, futuro: false, porQue: null };

  const vale = permisoVigente(permisos, hoy);
  if (vale && soloDia(vale.hasta) >= dia) {
    return {
      sePuede: true, futuro: true, hasta: soloDia(vale.hasta),
      porQue: `Autorizado por ${vale.dado_nombre || "la gerencia"} hasta el ${soloDia(vale.hasta)}`,
    };
  }
  return {
    sePuede: false, futuro: true, hasta: vale ? soloDia(vale.hasta) : null,
    porQue: vale
      ? `El permiso llega hasta el ${soloDia(vale.hasta)}: para este día hace falta uno nuevo.`
      : "Ese día todavía no pasó. Para anotarlo por adelantado hace falta el permiso del gerente o del Director.",
  };
}

/** Lo que está esperando que alguien lo autorice. */
export const pedidosAbiertos = (permisos = []) => (permisos || []).filter(p => p.estado === "pedido");

/** Cuántos días por adelantado pide un permiso, para poder decirlo. */
export function cuantosDias(hasta, hoy = hoyEnObra()) {
  const a = soloDia(hoy), b = soloDia(hasta);
  if (!a || !b) return 0;
  return Math.max(0, Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000));
}
