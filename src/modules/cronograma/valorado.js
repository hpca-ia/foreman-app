// El cronograma valorado: cuánto se gasta cada mes, y cuándo hay que poner.
//
// Es otra cosa que el cronograma de ruta crítica, y conviene no confundirlos
// porque contestan preguntas distintas:
//
//   LA RUTA CRÍTICA dice en qué orden se hace y qué no puede atrasarse. Es la
//   guía de obra, y la mira el residente.
//
//   EL VALORADO dice cuánta plata entra en juego cada mes. Es la guía de caja,
//   y la miran el cliente y la oficina. Se arma repartiendo el presupuesto a
//   lo largo de los meses que dura la obra: cada línea, un porcentaje por mes,
//   y la fila tiene que cerrar en 100.
//
// Esa segunda es la que hace falta primero, y no por ser más fácil: es la que
// le dice al cliente cuándo desembolsar. Un cronograma de barras le dice que
// la mampostería empieza en marzo; este le dice que en marzo tiene que tener
// 48 mil. Lo segundo es lo que hace que la plata llegue a tiempo.
//
// Y es contra esta curva que se compara lo planillado. La diferencia mes a
// mes es la única respuesta honesta a "¿vamos bien?": no cuántos metros se
// levantaron, sino si lo gastado se parece a lo previsto.
//
// LA DISTRIBUCIÓN SE GUARDA EN PORCENTAJES Y NO EN PLATA. Cuando entra una
// orden de cambio y el rubro pasa de 40 mil a 52, la curva se corrige sola;
// con montos escritos habría que rehacerla a mano y nadie lo haría.

const n = v => Number(v) || 0;
const redondo = v => Math.round(v * 100) / 100;

/** Los meses de la obra, desde "2026-03" y por la cantidad que dure. */
export function mesesDe(inicio, cuantos) {
  const [a, m] = String(inicio || "").split("-").map(Number);
  if (!a || !m) return [];
  const salida = [];
  for (let i = 0; i < Math.max(1, cuantos || 1); i++) {
    const d = new Date(a, m - 1 + i, 1);
    salida.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return salida;
}

export const nombreMes = clave => {
  const [a, m] = String(clave || "").split("-").map(Number);
  if (!a || !m) return clave || "";
  return new Date(a, m - 1, 1).toLocaleDateString("es-EC", { month: "short", year: "2-digit" });
};

/**
 * Repartir parejo, que es por dónde se empieza siempre.
 *
 * Nadie arma un valorado de cero poniendo 170 números: se reparte parejo y se
 * corrige lo que se sabe distinto —la estructura adelante, los acabados al
 * final—. El resto que no divide exacto va al último mes, para que la fila
 * cierre en 100 sin que haya que acomodarla a mano.
 */
export function repartirParejo(meses) {
  const cuantos = Math.max(1, meses || 1);
  const base = Math.floor((100 / cuantos) * 100) / 100;
  const pesos = Array(cuantos).fill(base);
  pesos[cuantos - 1] = redondo(100 - base * (cuantos - 1));
  return pesos;
}

/**
 * Repartir entre los meses que el rubro ocupa, y nada más.
 *
 * Es como se llena un valorado de verdad: nadie escribe porcentajes, elige el
 * mes en que empieza y el mes en que termina. En el Excel eso se ve como
 * "=I16/2" en dos columnas y vacío en el resto. Dos toques en vez de siete
 * números, y la fila cierra sola en 100.
 *
 * @param meses  cuántas columnas tiene el cronograma
 * @param desde  índice del primer mes del rubro (0 = mes 1)
 * @param hasta  índice del último, incluido
 */
export function repartirEntre(meses, desde, hasta) {
  const total = Math.max(1, meses || 1);
  const a = Math.max(0, Math.min(total - 1, desde ?? 0));
  const b = Math.max(a, Math.min(total - 1, hasta ?? a));
  const cuantos = b - a + 1;
  const base = Math.floor((100 / cuantos) * 100) / 100;
  const pesos = Array(total).fill(0);
  for (let i = a; i <= b; i++) pesos[i] = base;
  pesos[b] = redondo(100 - base * (cuantos - 1));
  return pesos;
}

/**
 * Los pesos de una actividad del cronograma, mes por mes.
 *
 * Esto es lo que ata el valorado al Gantt. Una actividad que va del 25 de
 * mayo al 10 de junio no es "de mayo" ni "de junio": son nueve días de uno y
 * siete del otro, y su plata cae en esa proporción. Repartirla parejo entre
 * los dos meses adelanta plata que todavía no se gastó, que es exactamente el
 * error que hace que el cliente desembolse de más en mayo.
 *
 * Se cuentan DÍAS HÁBILES, no corridos: el feriado y el domingo no se
 * trabajan, así que no deberían arrastrar plata al mes donde caen.
 *
 * Lo que queda fuera de la ventana del valorado se arrima a la punta más
 * cercana en vez de tirarse. Un anticipo que cae antes del primer mes es
 * plata que de verdad sale; borrarla haría que el valorado sume menos que el
 * presupuesto, y un valorado que no cuadra con el contrato no se usa.
 *
 * @param inicio   fecha de arranque (Date o "YYYY-MM-DD")
 * @param fin      fecha de fin, incluida
 * @param columnas los meses del valorado, como ["2026-03", "2026-04", …]
 * @param trabaja  (fecha) => bool; sin esto cuenta todos los días
 */
export function pesosDeTramo(inicio, fin, columnas = [], trabaja = null) {
  const total = columnas.length;
  if (!total) return [];
  const dia = f => new Date(`${String(f).slice(0, 10)}T12:00:00`);
  const a = inicio instanceof Date ? inicio : dia(inicio);
  const b = fin instanceof Date ? fin : dia(fin || inicio);
  if (isNaN(a) || isNaN(b)) return repartirParejo(total);

  const dias = Array(total).fill(0);
  let hab = 0;
  let f = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 12);
  const hasta = new Date(b.getFullYear(), b.getMonth(), b.getDate(), 12);
  // El tope es por si alguien guardó un fin anterior al inicio o una fecha
  // absurda: sin él, un dato malo cuelga la pantalla en vez de dar un número
  // feo que se ve y se corrige.
  for (let vuelta = 0; f <= hasta && vuelta < 4000; vuelta++) {
    if (!trabaja || trabaja(f)) {
      const clave = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}`;
      let k = columnas.indexOf(clave);
      if (k < 0) k = clave < columnas[0] ? 0 : total - 1;
      dias[k] += 1;
      hab += 1;
    }
    f = new Date(f.getTime() + 86400000);
  }
  // Una actividad entera en feriados no tiene día hábil ninguno. Pasa con los
  // anticipos puestos un domingo; su plata va al mes donde empieza.
  if (!hab) {
    const clave = `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, "0")}`;
    let k = columnas.indexOf(clave);
    if (k < 0) k = clave < columnas[0] ? 0 : total - 1;
    const pesos = Array(total).fill(0);
    pesos[k] = 100;
    return pesos;
  }

  const pesos = dias.map(d => Math.floor((d / hab) * 10000) / 100);
  // El resto al mes con más días, para que la fila cierre en 100 clavado.
  const mayor = dias.indexOf(Math.max(...dias));
  pesos[mayor] = redondo(pesos[mayor] + (100 - suma(pesos)));
  return pesos;
}

/** En qué meses cae un rubro: para dibujar su barra sin leer siete números. */
export function tramo(pesos = []) {
  const con = pesos.map((p, i) => (n(p) > 0 ? i : -1)).filter(i => i >= 0);
  return con.length ? { desde: con[0], hasta: con[con.length - 1] } : null;
}

/** ¿Cierra en 100? Lo que no cierra es lo que hay que mirar. */
export const suma = pesos => redondo((pesos || []).reduce((t, p) => t + n(p), 0));
export const cierra = pesos => Math.abs(suma(pesos) - 100) < 0.01;

/**
 * La curva: cuánto toca cada mes y cuánto va acumulado.
 *
 * @param lineas [{ monto, pesos: [%, %, …] }]
 * @param meses  ["2026-03", "2026-04", …]
 */
export function curva(lineas = [], meses = []) {
  const porMes = meses.map(() => 0);
  lineas.forEach(l => {
    const monto = n(l.monto);
    (l.pesos || []).forEach((p, i) => {
      if (i < porMes.length) porMes[i] += monto * (n(p) / 100);
    });
  });
  let acumulado = 0;
  return meses.map((mes, i) => {
    acumulado += porMes[i];
    return { mes, monto: redondo(porMes[i]), acumulado: redondo(acumulado) };
  });
}

/** El total del valorado. Tiene que dar el presupuesto, o algo no cierra. */
export const totalValorado = lineas =>
  redondo((lineas || []).reduce((t, l) => t + n(l.monto) * (suma(l.pesos) / 100), 0));

/**
 * Lo previsto contra lo que de verdad se gastó, mes a mes.
 *
 * Lo gastado sale de las facturas del control de obra agrupadas por el mes de
 * su fecha —no por su planilla—: una factura de marzo cargada en abril se
 * gastó en marzo, y mirarla en abril corre la curva y hace parecer que un mes
 * fue flojo y el siguiente desbordado.
 *
 * `diferencia` en positivo es que se gastó de más. Se dice en plata y no en
 * porcentaje porque es lo que el cliente tiene que poner.
 */
export function previstoContraReal({ lineas = [], meses = [], facturas = [], hasta = null }) {
  const plan = curva(lineas, meses);
  const gastoDe = new Map();
  facturas.forEach(f => {
    const mes = String(f.fecha || "").slice(0, 7);
    if (!mes) return;
    gastoDe.set(mes, (gastoDe.get(mes) || 0) + n(f.total));
  });

  // Lo gastado en meses que el valorado no contempla —antes de empezar, o
  // después del final previsto— no se tira: se suma a la punta más cercana.
  // Esconderlo haría que los totales no cierren y que nadie confíe en el
  // cuadro.
  const dentro = new Set(meses);
  let antes = 0, despues = 0;
  gastoDe.forEach((monto, mes) => {
    if (dentro.has(mes)) return;
    if (meses.length && mes < meses[0]) antes += monto;
    else despues += monto;
  });

  let acumReal = antes;
  const filas = plan.map((p, i) => {
    const real = (gastoDe.get(p.mes) || 0) + (i === 0 ? antes : 0) + (i === plan.length - 1 ? despues : 0);
    acumReal += (gastoDe.get(p.mes) || 0) + (i === plan.length - 1 ? despues : 0);
    return {
      mes: p.mes,
      previsto: p.monto,
      previstoAcum: p.acumulado,
      real: redondo(real),
      realAcum: redondo(acumReal),
      diferencia: redondo(acumReal - p.acumulado),
      futuro: hasta ? p.mes > String(hasta).slice(0, 7) : false,
    };
  });

  const corte = hasta ? filas.filter(f => !f.futuro).slice(-1)[0] : filas.slice(-1)[0];
  return {
    filas,
    previsto: corte?.previstoAcum || 0,
    real: corte?.realAcum || 0,
    diferencia: corte?.diferencia || 0,
    total: plan.length ? plan[plan.length - 1].acumulado : 0,
  };
}

/**
 * Lo que el cliente tiene que desembolsar cada mes.
 *
 * Es la misma curva dicha del otro lado del mostrador, y es la razón de ser
 * del valorado para él: no le interesa cuánto cuesta la mampostería, le
 * interesa cuánto tiene que tener en la cuenta en abril. Si ya anticipó, se
 * descuenta de los primeros meses hasta que se agota — que es como se usa un
 * anticipo de verdad y no repartido parejo en toda la obra.
 */
export function desembolsos({ lineas = [], meses = [], anticipado = 0 }) {
  let saldo = n(anticipado);
  return curva(lineas, meses).map(p => {
    const cubierto = Math.min(saldo, p.monto);
    saldo = redondo(saldo - cubierto);
    return {
      mes: p.mes,
      costo: p.monto,
      cubreAnticipo: redondo(cubierto),
      aponer: redondo(p.monto - cubierto),
    };
  });
}
