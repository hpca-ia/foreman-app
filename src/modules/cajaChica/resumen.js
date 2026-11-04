// EL RESUMEN DE LA CAJA: anticipos y cierres en una sola lista, cada uno
// diciendo qué es.
//
// Quien carga un anticipo lo llama como puede —"Cierre caja 1", "Reposición
// caja chica 1", "Caja chica N°1"— y después nadie distingue en la pantalla
// qué fue plata que entró y qué fue una rendición. Acá se dice por lo que
// hay antes: el primer anticipo es el fondo; uno que llega después de un
// cierre es la reposición de ese cierre; uno sin cierre en el medio es plata
// de más.

const n = v => Number(v) || 0;
const dia = f => String(f || "").slice(0, 10);

/**
 * @returns filas del más nuevo al más viejo: { tipo: "fondo" | "reposicion" |
 *          "anticipo" | "cierre", fecha, monto, dice, anticipo?, cierre? }.
 *          En una reposición, `cierre` es el que repone.
 */
export function resumenDeLaCaja({ anticipos = [], cierres = [] }) {
  const cs = [...cierres].sort((a, b) => n(a.numero) - n(b.numero));
  const as = [...anticipos].sort((a, b) => dia(a.fecha).localeCompare(dia(b.fecha)) || n(a.id) - n(b.id));

  const filas = as.map((a, i) => {
    // El último cierre con corte anterior a la fecha del anticipo.
    const tras = cs.filter(c => dia(c.hasta) < dia(a.fecha)).pop() || null;
    const tipo = tras ? "reposicion" : i === 0 ? "fondo" : "anticipo";
    const dice = tras ? `Reposición tras el cierre ${tras.numero}`
      : i === 0 ? "Fondo inicial" : "Anticipo adicional, sin cierre antes";
    return { tipo, fecha: dia(a.fecha), monto: n(a.monto), dice, anticipo: a, cierre: tras };
  });
  cs.forEach(c => filas.push({
    tipo: "cierre", fecha: dia(c.hasta), monto: n(c.total_gastado), cierre: c,
    dice: `hasta el ${dia(c.hasta)} · ${n(c.gastos)} ${n(c.gastos) === 1 ? "gasto" : "gastos"}`,
  }));

  // Del más nuevo al más viejo. A igual fecha el cierre va arriba: un abono
  // con la fecha del corte entró en ese cierre, así que es anterior a él.
  return filas.sort((a, b) => b.fecha.localeCompare(a.fecha)
    || (a.tipo === "cierre" ? -1 : b.tipo === "cierre" ? 1 : 0));
}
