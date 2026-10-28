// La caja del proyecto: con qué plata se está haciendo la obra.
//
// Sin base de datos, para poder probarlo. Es la cuenta que contesta "¿podemos
// pagar esto?", y una cuenta que contesta eso tiene que estar bien.

const n = v => Number(v) || 0;

// UN PAGO CON UNA NOTA DE CRÉDITO NO SALIÓ DEL BANCO.
//
// La factura queda saldada —para el proveedor está pagada— pero la plata no se
// movió: se gastó un vale que ya teníamos. Contándolo como salida, la caja del
// proyecto decía que salió plata dos veces: la del día que compramos lo que
// después devolvimos, y otra vez al usar el vale.
//
// Para la caja cuentan los pagos que movieron plata. Para el proveedor, todos.
const deLaCaja = pagos => pagos.filter(p => p?.nota_credito_id == null);

const r2 = v => Math.round(n(v) * 100) / 100;

// UNA NOTA DE CRÉDITO NO ES UNA FACTURA EN NEGATIVO. Es un vale a favor: no
// se le debe a nadie y no se paga. Mezclada con las facturas, bajaba la deuda
// con los proveedores —acá decía $4.900,39 y Proveedores, bien, $5.005,45— y
// desaparecía de la vista.
const esVale = f => f?.clase === "nota_credito" || n(f?.total) < 0;

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
 *   · porPagar — lo que falta pagar de CADA documento, sumado. No se resta un
 *     total contra otro: una factura pagada de más no cancela la deuda de
 *     otra, y una nota de crédito no es una deuda al revés.
 *   · facturado — el costo documentado: las facturas, los recibos y los
 *     anticipos. Las notas de crédito no van acá.
 *   · credito — los vales sin usar: plata nuestra en la casa del proveedor.
 *   · anticipado — plata que salió por algo que todavía no está facturado.
 *
 * Sin ningún pago registrado —una obra que todavía no usa Proveedores— el
 * pagado sería cero y la caja se vería perfecta, que sería mentir al revés.
 * Por eso, cuando no hay NINGÚN pago cargado, se sigue contando por facturas:
 * es el comportamiento de antes y es el correcto mientras los pagos no se
 * lleven.
 */
export function estadoDeCaja({ fondos = [], facturas = [], pagos: todos = [] }) {
  const pagos = deLaCaja(todos);
  const entrado = fondos.filter(f => n(f.monto) > 0).reduce((t, f) => t + n(f.monto), 0);
  const salido = fondos.filter(f => n(f.monto) < 0).reduce((t, f) => t - n(f.monto), 0);

  // Lo pagado de cada documento, para poder decir lo que falta de CADA uno.
  // La resta de los dos totales daba otra cosa: le restaba a la deuda los
  // vales a favor —que no son deuda— y cualquier pago de más.
  const pagadoDe = {};
  todos.forEach(p => { pagadoDe[p.factura_id] = (pagadoDe[p.factura_id] || 0) + n(p.monto); });

  const gasto = facturas.filter(f => f.clase !== "proforma" && !esVale(f));
  const facturado = r2(gasto.reduce((t, f) => t + n(f.total), 0));
  const porPagar = r2(gasto.reduce((t, f) => t + Math.max(0, n(f.total) - (pagadoDe[f.id] || 0)), 0));
  // EL VALE VALE LO QUE LE QUEDA. Lo usado sale de los pagos hechos con él:
  // contarlo entero decía que el proveedor todavía nos debe una plata que ya
  // gastamos en la compra siguiente.
  const usadoDe = {};
  todos.forEach(p => {
    if (p?.nota_credito_id == null) return;
    usadoDe[p.nota_credito_id] = (usadoDe[p.nota_credito_id] || 0) + n(p.monto);
  });
  const credito = r2(facturas
    .filter(f => esVale(f) && !f.facturada_con_id)
    .reduce((t, f) => t + Math.max(0, Math.abs(n(f.total)) - (usadoDe[f.id] || 0)), 0));
  const anticipado = r2(gasto
    .filter(f => f.clase === "anticipo" && !f.facturada_con_id)
    .reduce((t, f) => t + n(f.total), 0));

  const pagado = r2(pagos.reduce((t, p) => t + n(p.monto), 0));
  const seLlevanPagos = pagos.length > 0;
  const gastado = seLlevanPagos ? pagado : facturado;
  const saldo = r2(entrado - salido - gastado);
  return {
    entrado, salido, gastado, facturado, pagado, credito, anticipado,
    porPagar, seLlevanPagos, saldo,
    // LO QUE QUEDA DE VERDAD PARA COMPROMETER.
    //
    // El saldo es lo que hay en la cuenta; parte de eso ya tiene dueño: son
    // facturas firmadas que todavía no se pagaron. Con el saldo a secas
    // delante se decide gastar plata que ya está gastada.
    libre: r2(saldo - porPagar),
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
export function porPlanilla({ planillas = [], facturas = [], fondos = [], pagos: todos = [] }) {
  const pagos = deLaCaja(todos);
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
