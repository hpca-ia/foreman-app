// El rol de pagos de la obra. Las mismas cuentas del Excel, hechas solas.
//
// El circuito es el que ya existe en papel: se anota la asistencia día por
// día, de ahí salen los días trabajados y las horas extras de cada uno, y con
// eso se arma el rol. Lo único que cambia es que la asistencia la carga el
// residente desde la obra —donde la sabe— en vez de llegar a la oficina en
// una hoja al final de la quincena.
//
// LAS FÓRMULAS SON LAS DEL EXCEL, a propósito y sin "mejorarlas". Son las que
// la oficina viene usando y las que el trabajador reconoce en su recibo; un
// número que no cuadra con el del mes pasado, aunque esté mejor calculado, es
// una discusión con alguien que tiene razón en desconfiar.
//
// Los parámetros —240 horas al mes, 30 días, el salario básico, los
// porcentajes— se pasan de afuera porque cambian todos los años. Dejarlos
// escritos acá adentro garantiza que en enero el rol salga mal y que nadie
// sepa dónde tocar.

export const PARAMETROS = {
  horasMes: 240,          // la base del valor hora del Excel: salario / 240
  diasMes: 30,            // sueldo del período = salario / 30 × días trabajados
  sbu: 482,               // salario básico unificado, para el décimo cuarto
  jornada: 8,             // horas normales de un día entero
  aportePersonal: 9.45,   // IESS, aporte del trabajador
  fondosReserva: 8.33,    // si acumula
};

// Los cuatro recargos del Excel, con su multiplicador sobre el valor hora.
//
// El 25% no es un error de la planilla aunque desentone: es el recargo
// nocturno, que se paga SOBRE una hora que el sueldo ya cubrió, así que suma
// solo el recargo. Las suplementarias y extraordinarias se pagan enteras de
// nuevo con su recargo, y por eso van 1.5 y 2.
export const RECARGOS = [
  { id: "he25",  label: "25%",  factor: 0.25, pista: "Recargo nocturno: la hora ya está pagada, se suma el recargo" },
  { id: "he50",  label: "50%",  factor: 1.5,  pista: "Suplementarias: hasta 4 al día, antes de medianoche" },
  { id: "he75",  label: "75%",  factor: 1.75, pista: "Según el acuerdo de la obra" },
  { id: "he100", label: "100%", factor: 2,    pista: "Extraordinarias: noche, fin de semana o feriado" },
];

const n = v => Number(v) || 0;
const redondo = v => Math.round(v * 100) / 100;

/** Lo que vale una hora de cada clase para este salario. */
export function valoresHora(salarioMensual, par = PARAMETROS) {
  const hora = n(salarioMensual) / (par.horasMes || 240);
  const out = {};
  RECARGOS.forEach(r => { out[r.id] = redondo(hora * r.factor); });
  out.normal = redondo(hora);
  return out;
}

/**
 * Lo que juntó una persona en el período, leído de la asistencia.
 *
 * Los días se suman como vienen: un medio día es 0,5 y cuenta medio. Que el
 * residente pueda poner medio día es lo que evita la discusión de fin de mes
 * sobre el jueves que se fue a las once.
 */
export function resumirAsistencia(dias = [], par = PARAMETROS) {
  const r = { dias: 0, horas: 0, he25: 0, he50: 0, he75: 0, he100: 0, transporte: 0, alimentacion: 0 };
  dias.forEach(d => {
    // Las horas mandan cuando están: alguien que entró a las diez y trabajó
    // cinco no hizo medio día ni un día, y redondearlo le paga de menos o de
    // más todos los días hasta que hace la cuenta.
    const horas = d.horas == null || d.horas === "" ? null : n(d.horas);
    r.horas += horas ?? n(d.dias) * (par.jornada || 8);
    r.dias += horas != null ? horas / (par.jornada || 8) : n(d.dias);
    RECARGOS.forEach(x => { r[x.id] += n(d[x.id]); });
    r.transporte += n(d.transporte);
    r.alimentacion += n(d.alimentacion);
  });
  // Los días con tres decimales y no con dos: con jornada de ocho, cinco
  // horas son 0,625 días exactos, y redondear a 0,63 ANTES de multiplicar por
  // el salario le paga medio centavo de más todos los días. Poco, siempre, y
  // en una dirección — que es como se descubre a los seis meses y con razón.
  // La plata se redondea al final, que es donde corresponde.
  Object.keys(r).forEach(k => {
    r[k] = k === "dias" || k === "horas" ? Math.round(r[k] * 1000) / 1000 : redondo(r[k]);
  });
  return r;
}

/**
 * El rol de una persona: ingresos, beneficios de ley, descuentos y a pagar.
 *
 * @param persona  { salario_mensual, acumula_fondos }
 * @param asist    lo que devuelve resumirAsistencia
 * @param extras   { valorTransporte, valorAlimentacion, anticipos, prestamos,
 *                   quirografarios, multas }
 */
export function calcularRol(persona = {}, asist = {}, extras = {}, par = PARAMETROS) {
  const salario = n(persona.salario_mensual);
  const vh = valoresHora(salario, par);

  // ── Ingresos ───────────────────────────────────────────────────────────
  const sueldoPeriodo = redondo((salario / (par.diasMes || 30)) * n(asist.dias));
  const horasExtras = {};
  let totalExtras = 0;
  RECARGOS.forEach(r => {
    const monto = redondo(n(asist[r.id]) * vh[r.id]);
    horasExtras[r.id] = { horas: n(asist[r.id]), valorHora: vh[r.id], monto };
    totalExtras += monto;
  });
  totalExtras = redondo(totalExtras);
  const ingresos = redondo(sueldoPeriodo + totalExtras);

  // ── Fracciones de los beneficios de ley ────────────────────────────────
  // Todas sobre los ingresos del período, como en el Excel. El décimo cuarto
  // es la excepción: va por días y sobre el básico, no sobre lo que gana.
  const decimoTercero = redondo(ingresos / 12);
  const decimoCuarto = redondo(((par.sbu || 482) / 360) * n(asist.dias));
  const vacaciones = redondo(ingresos / 24);
  const fondos = persona.acumula_fondos ? redondo(ingresos * ((par.fondosReserva || 8.33) / 100)) : 0;

  const transporte = redondo(n(asist.transporte) * n(extras.valorTransporte));
  const alimentacion = redondo(n(asist.alimentacion) * n(extras.valorAlimentacion));

  const total = redondo(ingresos + decimoTercero + decimoCuarto + vacaciones + fondos + transporte + alimentacion);

  // ── Descuentos ─────────────────────────────────────────────────────────
  const aporte = redondo(ingresos * ((par.aportePersonal || 9.45) / 100));
  const anticipos = redondo(n(extras.anticipos));
  const prestamos = redondo(n(extras.prestamos));
  const quirografarios = redondo(n(extras.quirografarios));
  const multas = redondo(n(extras.multas));
  const descuentos = redondo(aporte + anticipos + prestamos + quirografarios + multas);

  return {
    valoresHora: vh,
    sueldoPeriodo, horasExtras, totalExtras, ingresos,
    decimoTercero, decimoCuarto, vacaciones, fondos, transporte, alimentacion,
    total,
    aporte, anticipos, prestamos, quirografarios, multas, descuentos,
    // El Excel resta solo aporte, anticipos y quirografarios acá, y deja
    // afuera préstamos y multas que sí están en "total de descuentos" tres
    // líneas arriba. Eso se contradice solo, y pagar de más es un error que
    // no se descubre. Acá se restan todos: si en la obra se decidió que un
    // préstamo no se descuenta este mes, se pone en cero y queda escrito.
    aPagar: redondo(total - descuentos),
  };
}

/** El rol de toda la obra, y lo que hay que tener en caja para pagarlo. */
export function calcularNomina({ personal = [], asistencia = {}, extras = {}, par = PARAMETROS }) {
  const lineas = personal.map(p => {
    const resumen = resumirAsistencia(asistencia[p.id] || [], par);
    const rol = calcularRol(p, resumen, extras[p.id] || {}, par);
    return { persona: p, asistencia: resumen, ...rol };
  });
  const sumar = campo => redondo(lineas.reduce((t, l) => t + n(l[campo]), 0));
  return {
    lineas,
    ingresos: sumar("ingresos"),
    beneficios: redondo(sumar("decimoTercero") + sumar("decimoCuarto") + sumar("vacaciones") + sumar("fondos")),
    descuentos: sumar("descuentos"),
    total: sumar("total"),
    aPagar: sumar("aPagar"),
    personas: lineas.length,
  };
}

/**
 * El gasto de mano de obra, repartido en los rubros del control de obra.
 *
 * Un rol pagado es plata que salió de la obra y tiene que descontar, igual que
 * una factura. Dos formas:
 *
 *   · A UN RUBRO. Cuando la cuadrilla estuvo toda el mes en lo mismo.
 *   · A PRORRATA entre varios. Cuando no, que es casi siempre. Se reparte en
 *     proporción a lo que pesa cada rubro, porque es la única repartición que
 *     no exige inventar un dato que nadie tiene.
 *
 * El resto que no divide exacto va al rubro más grande: si se tira, el total
 * del rol deja de coincidir con lo que descontó, y ese centavo aparece después
 * como un descuadre que nadie puede explicar.
 */
export function repartirEnRubros(total, destinos = []) {
  const monto = n(total);
  if (!destinos.length || !monto) return [];
  if (destinos.length === 1) return [{ ...destinos[0], monto: redondo(monto) }];

  const pesos = destinos.map(d => n(d.peso) || 0);
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  // Sin pesos —rubros sin presupuesto— se reparte en partes iguales, que es lo
  // único honesto cuando no hay con qué ponderar.
  const base = sumaPesos > 0 ? pesos.map(p => p / sumaPesos) : destinos.map(() => 1 / destinos.length);

  const centavos = Math.round(monto * 100);
  const partes = base.map(f => Math.floor(centavos * f));
  let resto = centavos - partes.reduce((a, b) => a + b, 0);
  const mayor = base.map((_, i) => i).sort((a, b) => base[b] - base[a]);
  for (let k = 0; k < resto; k++) partes[mayor[k % mayor.length]] += 1;

  return destinos.map((d, i) => ({ ...d, monto: redondo(partes[i] / 100) }));
}
