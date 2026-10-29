// HASTA CUÁNDO CUBRE LO QUE SE COTIZÓ.
//
// Casi toda orden de cambio es un trabajo: se hace y se termina. Algunas son un
// ALQUILER —el generador por quince días, el andamio por un mes, la bomba
// mientras dure la fundición— y esas tienen fecha de vencimiento. El día
// dieciséis el generador sigue en la obra, el proveedor sigue facturando, y la
// orden que lo cubría se quedó en quince.
//
// Eso no se descubre solo. Se descubre cuando llega la factura del mes
// siguiente por un alquiler que nadie autorizó — o no se descubre, se paga, y
// se come el margen de la orden entera. Es la clase de plata que se pierde sin
// que nadie haya hecho nada mal.
//
// Por eso se avisa ANTES y DESPUÉS. Antes, porque todavía se puede devolver el
// equipo o pedirle al cliente la extensión con tiempo; después, porque cada día
// que pasa es plata que ya salió.
//
// Sin base de datos: se le pasa la orden y el día de hoy.

const soloDia = f => String(f || "").slice(0, 10);
const AVISA_DESDE = 3;   // días antes de que venza

/** Días enteros de `a` a `b`. Negativo si `b` ya pasó. */
export function dias(a, b) {
  const x = soloDia(a), y = soloDia(b);
  if (!x || !y) return 0;
  return Math.round((new Date(`${y}T12:00:00`) - new Date(`${x}T12:00:00`)) / 86400000);
}

/** ¿Esta orden cubre un período, y sigue abierto? */
export const tienePlazo = o => !!soloDia(o?.cubre_hasta) && !o?.cubre_cerrado_at && !o?.anulada;

/**
 * El estado del plazo de una orden.
 *
 * @returns null si no tiene plazo; si no, { hasta, cuantos, faltan, vencida,
 *   porVencer, que, texto }
 */
export function vigenciaDe(orden, hoy = new Date().toISOString().slice(0, 10)) {
  if (!tienePlazo(orden)) return null;
  const hasta = soloDia(orden.cubre_hasta);
  const desde = soloDia(orden.cubre_desde);
  const faltan = dias(hoy, hasta);
  const que = String(orden.cubre_que || "").trim();
  const vencida = faltan < 0;
  const porVencer = faltan >= 0 && faltan <= AVISA_DESDE;
  const cuantos = desde ? dias(desde, hasta) + 1 : null;

  const nombre = que || "lo cotizado";
  const texto = vencida
    ? `${nombre} se pasó ${-faltan} ${-faltan === 1 ? "día" : "días"} de lo que cubre esta orden`
    : faltan === 0
      ? `${nombre} vence hoy`
      : porVencer
        ? `${nombre} vence en ${faltan} ${faltan === 1 ? "día" : "días"}`
        : `${nombre} está cubierto hasta el ${hasta}`;

  return { hasta, desde, cuantos, faltan, vencida, porVencer, que, texto, avisa: vencida || porVencer };
}

/** Las órdenes cuyo plazo hay que mirar hoy, de la más vencida a la que falta más. */
export function plazosQueAvisan(ordenes = [], hoy = new Date().toISOString().slice(0, 10)) {
  return (ordenes || [])
    .map(o => ({ orden: o, v: vigenciaDe(o, hoy) }))
    .filter(x => x.v?.avisa)
    .sort((a, b) => a.v.faltan - b.v.faltan);
}
