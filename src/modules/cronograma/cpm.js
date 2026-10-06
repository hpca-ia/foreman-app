// El cronograma: cuándo va cada cosa, qué no puede esperar, y cuánto vale.
//
// Esto es el método de la ruta crítica, el mismo que calcula MS Project. No
// tiene nada de misterioso y por eso se puede probar: dadas unas actividades
// con duración y unas dependencias, hay UNA respuesta correcta, y abajo está
// verificada contra ejemplos armados a mano.
//
// Dos pasadas:
//
//   HACIA ADELANTE · lo más temprano que cada actividad puede empezar, que es
//   cuando terminó la última de las que la traban. De ahí sale la fecha de fin
//   de la obra: no se elige, se calcula.
//
//   HACIA ATRÁS · lo más tarde que cada una puede empezar sin mover esa fecha
//   de fin. La diferencia entre lo más temprano y lo más tarde es la HOLGURA:
//   cuántos días puede atrasarse sin arrastrar a nadie.
//
//   Las que tienen holgura cero son la RUTA CRÍTICA. Un día de atraso ahí es
//   un día de atraso en la obra, y eso es todo lo que significa — no son las
//   actividades "importantes", son las que no tienen colchón.
//
// LO QUE LO HACE VALORADO: cada actividad puede colgar de una agrupación del
// presupuesto, y de ahí saca su monto. Con eso el cronograma deja de decir
// solo "esto va en marzo" y pasa a decir "en marzo deberíamos llevar
// invertidos 140 mil", que es contra lo que se compara el control de obra.

const DIA = 86400000;

// Las etapas de un rubro que no pasa de una sola vez.
//
// La ventanería no "se hace": se anticipa, se fabrica dos meses, llega y se
// instala. Son cuatro momentos separados y cada uno se lleva su parte de la
// plata, así que son cuatro barras del cronograma y cuatro líneas del
// valorado. Lo normal —lo que se ejecuta y se paga mientras se hace— es una
// sola barra con etapa "ejecucion", y no hay que partirlo.
//
// Nombre corto y en castellano porque sale impreso en el valorado que ve el
// cliente, al lado del nombre de la agrupación.
export const ETAPAS = {
  anticipo: "anticipo",
  fabricacion: "fabricación",
  entrega: "entrega",
  instalacion: "instalación",
  ejecucion: "ejecución",
};

export const TIPOS_DEP = {
  FC: { label: "Fin → Comienzo", pista: "La que sigue arranca cuando esta termina. Es la normal" },
  CC: { label: "Comienzo → Comienzo", pista: "Arrancan juntas" },
  FF: { label: "Fin → Fin", pista: "Terminan juntas" },
};

/** Una fecha, al mediodía: así ningún cambio de huso corre un día. */
export const aFecha = f => {
  if (!f) return null;
  if (f instanceof Date) return new Date(f.getFullYear(), f.getMonth(), f.getDate(), 12);
  const [a, m, d] = String(f).slice(0, 10).split("-").map(Number);
  return new Date(a, (m || 1) - 1, d || 1, 12);
};

export const claveFecha = d => {
  if (!d) return null;
  const f = aFecha(d);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
};

/**
 * El calendario de la obra.
 *
 * Una obra no trabaja los domingos ni el 1 de mayo, y un cronograma que cuenta
 * días corridos promete fechas que nadie va a cumplir. `laborables` son los
 * días de la semana que se trabaja —0 es domingo— y `feriados` las fechas que
 * no, escritas como YYYY-MM-DD.
 *
 * En Ecuador se trabaja de lunes a sábado en obra, y ese es el valor por
 * defecto: poner lunes a viernes haría que todo cronograma salga largo y que
 * alguien lo "corrija" sumando días a mano, que es como se pierde el control.
 */
export function calendario({ laborables = [1, 2, 3, 4, 5, 6], feriados = [] } = {}) {
  const noLaborables = new Set(feriados.map(f => claveFecha(f)));
  const trabaja = d => laborables.includes(aFecha(d).getDay()) && !noLaborables.has(claveFecha(d));

  /** El primer día hábil desde esta fecha, ella incluida. */
  const siguienteHabil = d => {
    let f = aFecha(d);
    let vueltas = 0;
    while (!trabaja(f) && vueltas++ < 400) f = new Date(f.getTime() + DIA);
    return f;
  };

  /**
   * Sumar días HÁBILES. Una actividad de un día que arranca el sábado termina
   * el sábado, no el domingo: el primer día ya cuenta.
   */
  const sumar = (d, dias) => {
    let f = siguienteHabil(d);
    let faltan = Math.max(1, Math.round(dias || 1)) - 1;
    let vueltas = 0;
    while (faltan > 0 && vueltas++ < 4000) {
      f = siguienteHabil(new Date(f.getTime() + DIA));
      faltan -= 1;
    }
    return f;
  };

  /** Cuántos días hábiles hay entre dos fechas, las dos incluidas. */
  const entre = (a, b) => {
    let f = aFecha(a), fin = aFecha(b), n = 0, vueltas = 0;
    while (f <= fin && vueltas++ < 4000) {
      if (trabaja(f)) n += 1;
      f = new Date(f.getTime() + DIA);
    }
    return n;
  };

  return { trabaja, siguienteHabil, sumar, entre, laborables, feriados };
}

/**
 * Calcular el cronograma entero.
 *
 * @param actividades  [{ id, nombre, duracion, inicio_fijo?, monto?, avance_pct? }]
 * @param dependencias [{ actividad_id, depende_de_id, tipo = "FC", retardo = 0 }]
 * @param opciones     { inicio, cal }
 *
 * Devuelve cada actividad con sus cuatro fechas, su holgura y si es crítica,
 * más el fin de la obra y la lista de ciclos si alguien armó un círculo.
 */
export function calcular({ actividades = [], dependencias = [], inicio, cal = calendario() } = {}) {
  const arranque = cal.siguienteHabil(inicio || new Date());
  const porId = new Map(actividades.map(a => [a.id, { ...a, duracion: Math.max(1, Math.round(a.duracion || 1)) }]));

  // De quién depende cada una, y a quién traba.
  const entran = new Map(actividades.map(a => [a.id, []]));
  const salen = new Map(actividades.map(a => [a.id, []]));
  dependencias.forEach(d => {
    if (!porId.has(d.actividad_id) || !porId.has(d.depende_de_id)) return;
    const dep = { ...d, tipo: d.tipo || "FC", retardo: Number(d.retardo) || 0 };
    entran.get(d.actividad_id).push(dep);
    salen.get(d.depende_de_id).push(dep);
  });

  // Orden topológico. Lo que quede sin ordenar está en un círculo —A espera a
  // B que espera a A— y no se puede calcular: se avisa en vez de colgarse o,
  // peor, de devolver fechas inventadas.
  const grado = new Map(actividades.map(a => [a.id, entran.get(a.id).length]));
  const cola = actividades.filter(a => grado.get(a.id) === 0).map(a => a.id);
  const orden = [];
  while (cola.length) {
    const id = cola.shift();
    orden.push(id);
    salen.get(id).forEach(d => {
      grado.set(d.actividad_id, grado.get(d.actividad_id) - 1);
      if (grado.get(d.actividad_id) === 0) cola.push(d.actividad_id);
    });
  }
  const enCiclo = actividades.filter(a => !orden.includes(a.id)).map(a => a.id);

  // ── Hacia adelante: lo más temprano ──────────────────────────────────
  const ini = new Map(), fin = new Map();
  orden.forEach(id => {
    const a = porId.get(id);
    let desde = a.inicio_fijo ? cal.siguienteHabil(a.inicio_fijo) : arranque;
    entran.get(id).forEach(d => {
      const f = fin.get(d.depende_de_id), i = ini.get(d.depende_de_id);
      if (!f) return;
      let candidato;
      // Comienzo→Comienzo: arrancan juntas, o con los días de desfase que diga
      // el retardo. Es el traslape que se usa cuando una va pisándole los
      // talones a la otra sin esperar a que termine.
      if (d.tipo === "CC") candidato = desplazar(cal, i, d.retardo);
      // Fin→Fin: terminan juntas. El arranque sale restando su duración.
      else if (d.tipo === "FF") candidato = retroceder(cal, desplazar(cal, f, d.retardo), a.duracion);
      // Fin→Comienzo, la normal: el día hábil siguiente al fin de la otra, y
      // de ahí el retardo —positivo para esperar el fragüe, NEGATIVO para
      // traslapar y arrancar antes de que la anterior termine—.
      else candidato = desplazar(cal, cal.siguienteHabil(new Date(f.getTime() + DIA)), d.retardo);
      if (!candidato) return;
      if (candidato > desde) desde = candidato;
    });
    ini.set(id, desde);
    fin.set(id, cal.sumar(desde, a.duracion));
  });

  const finObra = orden.length
    ? new Date(Math.max(...orden.map(id => fin.get(id).getTime())))
    : arranque;

  // Lo que empieza ANTES del día uno.
  //
  // En obra pasa siempre: los permisos, el anticipo de una importación, el
  // levantamiento topográfico. Son actividades del proyecto que ocurren antes
  // de que la obra arranque, y meterlas con fecha del día uno corre todo lo
  // demás y da un plazo que no es.
  //
  // Se consiguen con una fecha fija anterior al arranque —el cálculo ya la
  // respeta—. Lo que faltaba era que la escala de la pantalla las contemplara:
  // `inicio` es desde dónde se dibuja, y `arranque` sigue siendo el día uno,
  // que es contra el que se cuentan los días.
  const primero = orden.length
    ? new Date(Math.min(arranque.getTime(), ...orden.map(id => ini.get(id).getTime())))
    : arranque;

  // ── Hacia atrás: lo más tarde sin mover el fin ───────────────────────
  const finT = new Map(), iniT = new Map();
  [...orden].reverse().forEach(id => {
    const a = porId.get(id);
    let hasta = finObra;
    salen.get(id).forEach(d => {
      const siguiente = porId.get(d.actividad_id);
      const iniS = iniT.get(d.actividad_id), finS = finT.get(d.actividad_id);
      if (!iniS) return;
      // El espejo exacto de la pasada de arriba. Cada una devuelve lo más
      // tarde que ESTA puede terminar sin mover a la que sigue.
      let candidato;
      if (d.tipo === "CC") candidato = cal.sumar(desplazar(cal, iniS, -d.retardo), a.duracion);
      else if (d.tipo === "FF") candidato = desplazar(cal, finS, -d.retardo);
      // Fin→Comienzo: esta tiene que TERMINAR el día hábil anterior al que
      // arranca la que sigue, no el mismo. Retroceder uno solo la dejaba
      // terminando el mismo día que empieza la otra, y eso le regalaba un día
      // de holgura a toda la cadena — con lo que la ruta crítica salía vacía.
      else candidato = desplazar(cal, retroceder(cal, iniS, 2), -d.retardo);
      if (!candidato) return;
      if (candidato < hasta) hasta = candidato;
      void siguiente;
    });
    finT.set(id, hasta);
    iniT.set(id, retroceder(cal, hasta, a.duracion));
  });

  const resultado = actividades.map(a => {
    const roto = enCiclo.includes(a.id);
    const holgura = roto ? null : cal.entre(ini.get(a.id), iniT.get(a.id)) - 1;
    return {
      ...a,
      inicio: roto ? null : claveFecha(ini.get(a.id)),
      fin: roto ? null : claveFecha(fin.get(a.id)),
      inicio_tarde: roto ? null : claveFecha(iniT.get(a.id)),
      fin_tarde: roto ? null : claveFecha(finT.get(a.id)),
      holgura,
      critica: !roto && holgura <= 0,
      enCiclo: roto,
    };
  });

  return {
    actividades: resultado,
    // Desde dónde se dibuja y desde dónde se cuenta: con actividades previas
    // no son lo mismo, y confundirlos es lo que haría que el día 1 caiga en
    // el medio de la barra de los permisos.
    inicio: claveFecha(primero),
    arranque: claveFecha(arranque),
    fin: claveFecha(finObra),
    duracion: cal.entre(arranque, finObra),
    previos: cal.entre(primero, arranque) - 1,
    ciclos: enCiclo,
    ruta: resultado.filter(a => a.critica).map(a => a.id),
  };
}

/**
 * Correr una fecha tantos días hábiles, para adelante o para atrás.
 *
 * El signo es lo que hace falta y lo que faltaba. `sumar` y `retroceder`
 * arrancan con `Math.max(1, …)`, así que un retardo negativo se volvía cero
 * sin decir nada: TRASLAPAR DOS ACTIVIDADES ERA IMPOSIBLE —"que la mampostería
 * arranque cinco días antes de que termine la estructura"— y el cronograma
 * devolvía la obra entera en fila, más larga de lo que es.
 */
function desplazar(cal, d, n) {
  const k = Math.round(Number(n) || 0);
  return k >= 0 ? cal.sumar(d, k + 1) : retroceder(cal, d, -k + 1);
}

/**
 * Aplanar la curva de plata moviendo lo que tiene colchón.
 *
 * ESTE ES EL PUENTE ENTRE LOS DOS CRONOGRAMAS, y el orden importa: el Gantt
 * se hace primero y el valorado sale de él, porque la plata sigue a la
 * ejecución y no al revés —solo se puede planillar lo que se construyó—. De un
 * valorado no se puede sacar un Gantt: un porcentaje mensual no dice qué traba
 * a qué, ni qué no puede atrasarse.
 *
 * Pero hay UNA cosa que viaja de vuelta, y es esta. El cliente no desembolsa
 * lo que el cronograma pide: desembolsa lo que puede. Si el plan concentra
 * 180 mil en el mes 3 y el cliente pone 120, ese mes no se ejecuta como está
 * escrito —se para la obra, que es la peor manera de enterarse—.
 *
 * Lo que se hace entonces no es alargar la obra: es correr hacia adelante las
 * actividades QUE TIENEN HOLGURA, dentro de su holgura. Son las que pueden
 * atrasarse sin arrastrar a nadie; eso es exactamente lo que significa tener
 * colchón, y gastarlo en acomodar la plata es gastarlo bien.
 *
 * NO SE TOCA LA RUTA CRÍTICA. Si el mes no se puede aliviar moviendo solo lo
 * que sobra, se dice que no se puede y por qué, en vez de correr algo que
 * atrase la entrega sin avisar.
 *
 * @param montoDe  (actividad) => cuánta plata lleva esa actividad
 * @param tope     lo máximo que puede salir en un mes
 * @return { movidas: [{ id, inicio_fijo, dias }], curva, apretados, fin }
 */
export function nivelarPorPlata({ actividades = [], dependencias = [], inicio, cal = calendario(), montoDe, tope }) {
  const techo = Number(tope) || 0;
  const correr = fijos => {
    const plan = calcular({
      actividades: actividades.map(a => ({ ...a, inicio_fijo: fijos.get(a.id) || a.inicio_fijo || null })),
      dependencias, inicio, cal,
    });
    const curva = curvaValorada(
      plan.actividades.map(a => ({ ...a, monto: montoDe ? montoDe(a) : (a.monto || 0) })), cal, "mes");
    return { plan, curva };
  };

  const fijos = new Map();
  let { plan, curva } = correr(fijos);
  const finOriginal = plan.fin;
  if (!techo) return { movidas: [], curva, apretados: [], fin: plan.fin };

  const movidas = new Map();
  for (let vuelta = 0; vuelta < 40; vuelta++) {
    const caro = curva.find(c => c.monto > techo);
    if (!caro) break;

    // Las que aportan plata en ese mes y tienen colchón, la de más holgura
    // primero: mover la que más aguanta es lo que menos compromete.
    const candidatas = plan.actividades
      .filter(a => a.inicio && !a.enCiclo && (a.holgura || 0) > 0 && (montoDe ? montoDe(a) : a.monto) > 0)
      .filter(a => claveFecha(a.inicio).slice(0, 7) <= caro.corte && claveFecha(a.fin).slice(0, 7) >= caro.corte)
      .sort((x, y) => (y.holgura || 0) - (x.holgura || 0));
    if (!candidatas.length) break;

    let movio = false;
    for (const a of candidatas) {
      const dias = Math.min(a.holgura, 25);
      if (dias < 1) continue;
      const nuevo = claveFecha(cal.sumar(aFecha(a.inicio), dias + 1));
      const prueba = new Map(fijos); prueba.set(a.id, nuevo);
      const r = correr(prueba);
      // La entrega no se mueve. Si moverla era el precio, no se paga.
      if (r.plan.fin !== finOriginal) continue;
      const peorAntes = Math.max(...curva.map(c => c.monto));
      const peorAhora = Math.max(...r.curva.map(c => c.monto));
      if (peorAhora >= peorAntes) continue;
      fijos.set(a.id, nuevo);
      movidas.set(a.id, { id: a.id, nombre: a.nombre, inicio_fijo: nuevo, dias });
      ({ plan, curva } = r);
      movio = true;
      break;
    }
    if (!movio) break;
  }

  return {
    movidas: [...movidas.values()],
    curva,
    // Los meses que siguen pasados del tope después de hacer lo que se podía.
    apretados: curva.filter(c => c.monto > techo).map(c => ({ corte: c.corte, monto: c.monto, exceso: Math.round((c.monto - techo) * 100) / 100 })),
    fin: plan.fin,
  };
}

/**
 * Estirar o encoger el cronograma para que entre en el plazo.
 *
 * El plazo de una obra no es el resultado de sumar actividades: es lo que dice
 * el contrato. NOVA propone duraciones razonables y la cadena más larga sale
 * en 180 días cuando el contrato dice 150 — y hasta ahora eso quedaba así, con
 * el cronograma diciendo una cosa y el contrato otra. Corregirlo a mano son
 * cuarenta actividades.
 *
 * Se escalan las duraciones por el factor que haga falta y se vuelve a
 * calcular, porque al redondear y al cambiar cuál es la cadena más larga el
 * resultado no cae exacto a la primera. Unas pocas vueltas alcanzan.
 *
 * NO toca las dependencias ni los traslapes: son decisiones de obra —qué va
 * antes que qué— y cambiarlas para cuadrar un número sería inventar cómo se
 * construye. Lo que se ajusta es cuánto dura cada cosa, que es lo que de
 * verdad se negocia cuando hay que entregar antes: más gente en el frente.
 *
 * Devuelve [{ id, duracion }] con las que cambian, y a cuántos días llegó.
 */
export function ajustarAlPlazo({ actividades = [], dependencias = [], objetivo, inicio, cal = calendario() }) {
  const meta = Math.max(1, Math.round(objetivo || 0));
  if (!actividades.length || !meta) return { cambios: [], dias: 0, factor: 1 };

  let dur = new Map(actividades.map(a => [a.id, Math.max(1, Math.round(a.duracion || 1))]));
  const correr = d => calcular({
    actividades: actividades.map(a => ({ ...a, duracion: d.get(a.id) })),
    dependencias, inicio, cal,
  }).duracion;

  let dias = correr(dur), mejor = new Map(dur), mejorDias = dias;
  for (let vuelta = 0; vuelta < 8 && dias !== meta; vuelta++) {
    const factor = meta / dias;
    const siguiente = new Map();
    actividades.forEach(a => {
      // Mínimo un día: una actividad de cero días no existe, y es lo que
      // pasaría con las cortas al encoger mucho.
      siguiente.set(a.id, Math.max(1, Math.round(dur.get(a.id) * factor)));
    });
    // Si el escalado no movió nada —todo tocó el piso de un día— no hay más
    // que hacer: el plazo pedido es más corto que la obra más corta posible.
    let igual = true;
    siguiente.forEach((v, k) => { if (v !== dur.get(k)) igual = false; });
    if (igual) break;
    dur = siguiente;
    dias = correr(dur);
    if (Math.abs(dias - meta) < Math.abs(mejorDias - meta)) { mejor = new Map(dur); mejorDias = dias; }
  }

  const cambios = actividades
    .map(a => ({ id: a.id, duracion: mejor.get(a.id) }))
    .filter(c => c.duracion !== Math.max(1, Math.round(actividades.find(a => a.id === c.id).duracion || 1)));
  return { cambios, dias: mejorDias, factor: mejorDias ? meta / mejorDias : 1 };
}

/** Restar días hábiles: el espejo de sumar. */
function retroceder(cal, d, dias) {
  let f = aFecha(d);
  let faltan = Math.max(1, Math.round(dias)) - 1;
  let vueltas = 0;
  while (!cal.trabaja(f) && vueltas++ < 400) f = new Date(f.getTime() - DIA);
  while (faltan > 0 && vueltas++ < 4000) {
    f = new Date(f.getTime() - DIA);
    while (!cal.trabaja(f)) f = new Date(f.getTime() - DIA);
    faltan -= 1;
  }
  return f;
}

/**
 * La curva valorada: cuánta plata debería llevarse gastada en cada corte.
 *
 * Reparte el monto de cada actividad entre sus días hábiles —parejo, que es lo
 * que se asume cuando nadie dijo otra cosa— y suma. Contra esa curva se compara
 * lo invertido de verdad, y la diferencia es el atraso dicho en dinero, que es
 * el idioma en el que un cliente entiende "vamos tarde".
 */
export function curvaValorada(actividades = [], cal = calendario(), paso = "mes") {
  const puntos = new Map();
  actividades.forEach(a => {
    if (!a.inicio || !a.fin || !a.monto) return;
    const dias = cal.entre(a.inicio, a.fin);
    if (!dias) return;
    const porDia = Number(a.monto) / dias;
    let f = aFecha(a.inicio), finA = aFecha(a.fin), vueltas = 0;
    while (f <= finA && vueltas++ < 4000) {
      if (cal.trabaja(f)) {
        const k = paso === "mes" ? claveFecha(f).slice(0, 7) : claveFecha(f);
        puntos.set(k, (puntos.get(k) || 0) + porDia);
      }
      f = new Date(f.getTime() + DIA);
    }
  });
  let suma = 0;
  return [...puntos.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([corte, monto]) => {
      suma += monto;
      return { corte, monto: Math.round(monto * 100) / 100, acumulado: Math.round(suma * 100) / 100 };
    });
}

/**
 * Cuánto se atrasó la obra, en días y en plata.
 *
 * `avance_pct` de cada actividad es lo que dice la obra; la curva dice lo que
 * debería ir. La diferencia en dinero es lo que se reporta: "vamos 23 mil
 * abajo de lo planificado" se entiende y "vamos al 61% contra 68%" no tanto.
 */
export function desvio(actividades = [], hoy = new Date(), cal = calendario()) {
  const corte = claveFecha(hoy);
  let planificado = 0, real = 0, criticasTarde = [];
  actividades.forEach(a => {
    const monto = Number(a.monto) || 0;
    if (a.inicio && a.fin && monto) {
      const dias = cal.entre(a.inicio, a.fin);
      const corridos = a.inicio > corte ? 0 : cal.entre(a.inicio, a.fin < corte ? a.fin : corte);
      planificado += dias ? monto * (corridos / dias) : 0;
    }
    real += monto * ((Number(a.avance_pct) || 0) / 100);
    // Una crítica que debería haber empezado y no empezó ya movió la fecha de
    // fin, aunque todavía nadie lo haya anotado.
    if (a.critica && a.inicio && a.inicio < corte && !(Number(a.avance_pct) > 0)) criticasTarde.push(a);
  });
  return {
    planificado: Math.round(planificado * 100) / 100,
    real: Math.round(real * 100) / 100,
    diferencia: Math.round((real - planificado) * 100) / 100,
    criticasTarde,
  };
}
