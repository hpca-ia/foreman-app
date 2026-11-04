// CUÁNDO HAY UNA VUELTA PARA CERRAR, Y HASTA QUÉ DÍA.
//
// La caja se cierra POR FECHAS: al 31 de octubre, a una quincena. Entra todo
// lo que tiene fecha hasta ese día —gastos y abonos— y lo de después queda
// para la planilla siguiente.
//
// Antes se exigía una reposición cargada para habilitar el cierre, con la
// idea de que reponer es dar por rendida la vuelta anterior. Pero la
// rendición va primero: se cierra, se sabe cuánto se gastó, y con eso se
// repone. Con la regla al revés, la caja de Lizeth —reposición cargada el 23
// de octubre, cierre 1 formalizado el 4 de noviembre— no dejaba hacer el
// cierre 2: el único abono suelto ya "había hecho su trabajo".
//
// Lo que sigue valiendo del incidente de las tres vueltas donde había una es
// que el cierre diga EXACTAMENTE qué entra y qué queda afuera antes de apretar
// el botón, y que la fecha la elija quien cierra. Aparte de `cierres.js`
// porque eso habla con la base y esto es la regla, que se prueba sola.

import { devueltoAlResidente } from "./lista.js";

const n = v => Number(v) || 0;
const redondo = v => Math.round(v * 100) / 100;
const dia = f => String(f || "").slice(0, 10);
const dos = v => String(v).padStart(2, "0");
const ultimoDelMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();   // m de 1 a 12

/**
 * El último corte de quincena o de mes hasta ese día: el 15 o el último del
 * mes, el más reciente que no pase de `hoy`. El 4 de noviembre propone el 31
 * de octubre; el 20, el 15.
 */
export function ultimoCorte(hoy) {
  const [y, m, d] = dia(hoy).split("-").map(Number);
  if (d >= ultimoDelMes(y, m)) return dia(hoy);
  if (d >= 15) return `${y}-${dos(m)}-15`;
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  return `${py}-${dos(pm)}-${dos(ultimoDelMes(py, pm))}`;
}

/**
 * Qué entra si se cierra hasta `hasta`, y qué fecha se propone si no se dio.
 *
 * @returns {{ puede, desde, hasta, gastos, quedan, devueltos, abonos,
 *             abonosQueQuedan, totalGastado, totalAbonado, saldo }}
 */
export function proponerCierre({ anticipos = [], gastos = [], cierres = [], hasta = null, hoy = null }) {
  const abierto = x => !x.cierre_id;
  const ultimo = cierres.length
    ? cierres.reduce((a, b) => (n(a.numero) >= n(b.numero) ? a : b))
    : null;
  const desde = ultimo?.hasta ? dia(ultimo.hasta) : null;
  const h = dia(hoy || new Date().toISOString());

  // LOS DEVUELTOS NO SE RINDEN. Un gasto devuelto al residente está mal
  // cargado: cerrarlo es firmar que se revisó, y eso todavía no es cierto.
  // Queda abierto hasta que se corrija, y entra en la planilla que lo
  // encuentre corregido.
  const rendibles = gastos.filter(g => abierto(g) && !devueltoAlResidente(g));
  const sueltos = anticipos.filter(abierto);

  // La fecha propuesta: el último corte de quincena o de mes, si es
  // posterior al cierre anterior y algo entra con él. Si no, el día del
  // último gasto por rendir: todo lo abierto es de estos días.
  let corte = dia(hasta);
  if (!corte) {
    const candidato = ultimoCorte(h);
    const sirve = (!desde || candidato > desde) && rendibles.some(g => dia(g.fecha) <= candidato);
    corte = sirve ? candidato
      : (rendibles.map(g => dia(g.fecha)).filter(f => f <= h).sort().pop() || h);
  }

  const entra = f => dia(f) <= corte;
  const entran = rendibles.filter(g => entra(g.fecha));
  const quedan = rendibles.filter(g => !entra(g.fecha));
  const devueltos = gastos.filter(g => abierto(g) && devueltoAlResidente(g) && entra(g.fecha));
  const abonos = sueltos.filter(a => entra(a.fecha));
  const abonosQueQuedan = sueltos.filter(a => !entra(a.fecha));
  const totalGastado = redondo(entran.reduce((t, g) => t + n(g.monto), 0));
  const totalAbonado = redondo(abonos.reduce((t, a) => t + n(a.monto), 0));

  return {
    // Hay algo que rendir si hay gastos abiertos que no estén devueltos.
    puede: rendibles.length > 0,
    desde,
    hasta: corte,
    gastos: entran,
    // Lo de después del corte: es de la planilla siguiente.
    quedan,
    // Los devueltos con fecha dentro del corte: se quedan afuera igual.
    devueltos,
    abonos,
    abonosQueQuedan,
    totalGastado,
    totalAbonado,
    saldo: redondo(totalAbonado - totalGastado),
  };
}
