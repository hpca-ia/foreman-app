// CUÁNDO HAY UNA VUELTA PARA CERRAR.
//
// Aparte de `cierres.js` porque eso habla con la base y esto es la regla: es
// lo que decide si aparece el botón de cerrar, y de eso salieron tres vueltas
// donde había una.

const n = v => Number(v) || 0;
const redondo = v => Math.round(v * 100) / 100;

/**
 * ¿Se puede cerrar, y hasta qué día conviene?
 *
 * Se habilita cuando hay un abono posterior al último cierre: ese abono es la
 * reposición, y reponer es el acto de dar por rendida la vuelta anterior.
 *
 * La fecha propuesta es el día ANTERIOR al abono, no el de hoy. Lo que se
 * rinde es lo que se gastó con el fondo viejo; un gasto hecho con la plata
 * nueva es de la vuelta que recién empieza, y meterlo en la rendición anterior
 * hace que los números no cierren contra el recibo que firmó el responsable.
 *
 * @returns {{ puede, desde, hasta, abono, gastos, totalGastado, totalAbonado, saldo }}
 */
export function proponerCierre({ anticipos = [], gastos = [], cierres = [] }) {
  const abiertos = x => !x.cierre_id;
  const ultimo = cierres.length
    ? cierres.reduce((a, b) => (a.numero >= b.numero ? a : b))
    : null;

  // El abono que habilita: el más nuevo de los que todavía no se cerraron.
  const sueltos = anticipos.filter(abiertos)
    .slice().sort((a, b) => String(a.fecha || "").localeCompare(String(b.fecha || "")));

  // UN ABONO HABILITA UNA VUELTA, NO TODAS LAS QUE VENGAN.
  //
  // Mientras el abono siguiera suelto —y queda suelto, porque su fecha es
  // posterior al corte que él mismo habilita— el botón de cerrar volvía a
  // aparecer con cada gasto atrasado que entrara. Así salieron tres vueltas
  // donde había una: la 2 con un gasto de $9 y la 3 con uno de $7, las dos
  // sin ninguna reposición adentro.
  //
  // Si ya se cerró algo DESPUÉS de que ese abono entró, ese abono ya hizo su
  // trabajo: lo que sigue es la vuelta nueva, y se cierra cuando llegue la
  // reposición siguiente.
  const sinUsar = sueltos.filter(a => !cierres.some(c => String(c.created_at || "") > String(a.created_at || "")));
  const abono = sinUsar.length ? sinUsar[sinUsar.length - 1] : null;

  // Hasta el día anterior al abono. Si no hay fecha —un abono viejo sin
  // cargarla— hasta hoy, que es lo único cierto que queda.
  const hoy = new Date().toISOString().slice(0, 10);
  let hasta = hoy;
  if (abono?.fecha) {
    const f = new Date(`${String(abono.fecha).slice(0, 10)}T12:00:00`);
    f.setDate(f.getDate() - 1);
    hasta = f.toISOString().slice(0, 10);
  }

  const entran = gastos.filter(g => abiertos(g) && String(g.fecha || "").slice(0, 10) <= hasta);
  const abonosQueEntran = sueltos.filter(a => String(a.fecha || "").slice(0, 10) <= hasta);
  const totalGastado = redondo(entran.reduce((t, g) => t + n(g.monto), 0));
  const totalAbonado = redondo(abonosQueEntran.reduce((t, a) => t + n(a.monto), 0));

  return {
    // Hay algo que rendir solo si hay un abono nuevo: el que repone es quien
    // da por buena la vuelta anterior.
    puede: !!abono && !!entran.length,
    desde: ultimo?.hasta || null,
    hasta,
    abono,
    gastos: entran,
    totalGastado,
    totalAbonado,
    saldo: redondo(totalAbonado - totalGastado),
  };
}

