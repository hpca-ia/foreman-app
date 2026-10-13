// La caja del proyecto: con qué plata se está haciendo la obra.
//
// Sin base de datos, para poder probarlo. Es la cuenta que contesta "¿podemos
// pagar esto?", y una cuenta que contesta eso tiene que estar bien.

const n = v => Number(v) || 0;

/**
 * El estado de la caja del proyecto: LA PLATA, no los papeles.
 *
 * Contaba como gastada la suma de las FACTURAS, y eso es otra cosa. Una
 * factura de veinte mil de la que se pagó un anticipo de cinco sacó CINCO de
 * la caja; los quince restantes son una deuda con el proveedor, que es real y
 * que hay que ver, pero que todavía no salió del banco. Mezclarlas da un saldo
 * que no es el saldo de ninguna cuenta: ni la de la caja ni la de la deuda.
 *
 * Y el efecto práctico es el peor posible: la pantalla dice que la obra está
 * mucho peor de lo que está, justo en el momento en que uno la mira para
 * decidir si puede pagar algo.
 *
 * Entonces:
 *   · pagado  — lo que de verdad salió. Es lo que mueve el saldo.
 *   · porPagar — facturado menos pagado. La deuda con los proveedores.
 *   · gastado  — todo lo facturado, que es el costo de la obra y se sigue
 *     mostrando: es lo que compara contra el presupuesto.
 *
 * Sin ningún pago registrado —una obra que todavía no usa Proveedores— el
 * pagado sería cero y la caja se vería perfecta, que sería mentir al revés.
 * Por eso, cuando no hay NINGÚN pago cargado, se sigue contando por facturas:
 * es el comportamiento de antes y es el correcto mientras los pagos no se
 * lleven.
 */
export function estadoDeCaja({ fondos = [], facturas = [], pagos = [] }) {
  const entrado = fondos.filter(f => n(f.monto) > 0).reduce((t, f) => t + n(f.monto), 0);
  const salido = fondos.filter(f => n(f.monto) < 0).reduce((t, f) => t - n(f.monto), 0);
  const facturado = facturas.filter(f => f.clase !== "proforma").reduce((t, f) => t + n(f.total), 0);
  const pagado = pagos.reduce((t, p) => t + n(p.monto), 0);
  const seLlevanPagos = pagos.length > 0;
  const gastado = seLlevanPagos ? pagado : facturado;
  return {
    entrado, salido, gastado, facturado, pagado,
    porPagar: Math.max(0, Math.round((facturado - pagado) * 100) / 100),
    seLlevanPagos,
    saldo: entrado - salido - gastado,
  };
}

/**
 * La caja, corte por corte: cuánto había, cuánto se gastó, con cuánto se sigue.
 *
 * Es la lectura que se hace de arriba hacia abajo cuando alguien pregunta "¿y
 * en qué momento nos quedamos cortos?". Las facturas que todavía no tienen
 * planilla van en su propia línea al final: existen y pesan, y esconderlas
 * hasta que alguien las asigne es cómo el saldo de la pantalla deja de ser el
 * saldo del banco.
 */
export function porPlanilla({ planillas = [], facturas = [], fondos = [], pagos = [] }) {
  const orden = [...planillas].sort((a, b) => a.numero - b.numero);
  const gastoDe = new Map();
  let huerfanas = 0;
  // Lo pagado de cada factura, para que el corte diga plata y no papeles.
  const pagadoDe = new Map();
  pagos.forEach(p => pagadoDe.set(Number(p.factura_id), (pagadoDe.get(Number(p.factura_id)) || 0) + n(p.monto)));
  const seLlevanPagos = pagos.length > 0;
  facturas.forEach(f => {
    if (f.clase === "proforma") return;
    const plata = seLlevanPagos ? (pagadoDe.get(Number(f.id)) || 0) : n(f.total);
    if (!plata) return;
    if (!f.planilla_id) { huerfanas += plata; return; }
    gastoDe.set(f.planilla_id, (gastoDe.get(f.planilla_id) || 0) + plata);
  });

  // Lo que entró hasta el cierre de cada corte. Una planilla sin fecha de
  // cierre se lleva todo lo que entró hasta hoy.
  const entradas = fondos.map(f => ({ fecha: f.fecha, monto: n(f.monto) }));
  const entradoHasta = fecha => entradas
    .filter(e => !fecha || !e.fecha || e.fecha <= fecha)
    .reduce((t, e) => t + e.monto, 0);

  let acumulado = 0;
  const filas = orden.map(p => {
    const gasto = gastoDe.get(p.id) || 0;
    acumulado += gasto;
    const recibido = entradoHasta(p.fecha_hasta || p.fecha_cierre || null);
    return { id: p.id, nombre: p.nombre || `Planilla N°${p.numero}`, numero: p.numero,
      gasto, acumulado, recibido, saldo: recibido - acumulado };
  });
  if (huerfanas) {
    acumulado += huerfanas;
    const recibido = entradoHasta(null);
    filas.push({ id: "sin", nombre: "Sin planilla todavía", numero: null,
      gasto: huerfanas, acumulado, recibido, saldo: recibido - acumulado });
  }
  return filas;
}
