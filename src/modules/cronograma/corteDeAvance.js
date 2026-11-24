// El corte de avance: cuánto va la obra y cuánto debería ir.
//
// El cronograma decía cuándo se iba a hacer cada cosa y la línea base guardaba
// lo que se firmó, pero entre los dos faltaba el dato que los une: QUÉ SE HIZO.
// Sin él "vamos atrasados" no se puede medir —las tres versiones guardadas de
// una obra terminaban el mismo día, con la obra corrida—.
//
// Un corte es una fecha y, para cada barra, un porcentaje a esa fecha. De ahí
// sale todo lo demás:
//   · el avance REAL de la obra, que es lo hecho de cada barra por lo que pesa;
//   · el avance que DEBÍA llevar, leído de la línea base a esa misma fecha;
//   · y, barra por barra, cuál va atrás de lo que se firmó.
// El fin proyectado no se calcula acá: sale de `calcular` con el corte, que es
// quien sabe de dependencias.
//
// No habla con la base: son cuentas, y por eso se pueden probar.

import { calendario, calcular, avanceDe } from "./cpm.js";

const dia = f => String(f || "").slice(0, 10);
const n = v => Number(v) || 0;
const redondo = v => Math.round(v * 10) / 10;

/** Cada barra de hoy con la suya de la foto: por id y, si no, por nombre. */
export function emparejar(foto, actividades = []) {
  const antes = foto?.actividades || [];
  const porId = new Map(antes.map(a => [Number(a.id), a]));
  const porNombre = new Map(antes.map(a => [String(a.nombre || "").trim(), a]));
  const pares = new Map();
  actividades.forEach(a => {
    const viejo = porId.get(Number(a.id)) || porNombre.get(String(a.nombre || "").trim());
    if (viejo) pares.set(a.id, viejo);
  });
  return pares;
}

/** Qué parte de una barra debía estar hecha al cierre de ese día, de 0 a 1. */
export function debiaIr(inicio, fin, corte, cal = calendario()) {
  const i = dia(inicio), f = dia(fin), c = dia(corte);
  if (!i || !f || !c || i > c) return 0;
  if (f <= c) return 1;
  const total = cal.entre(i, f);
  return total ? Math.min(1, cal.entre(i, c) / total) : 0;
}

/**
 * El corte entero.
 *
 * CUÁNTO PESA CADA BARRA. Por plata cuando TODAS las barras tienen la suya:
 * es como se mide un avance de obra, y es lo que después se planilla. Si
 * alguna no tiene —un cronograma armado a mano, con barras que no vienen del
 * control— se pesa por días de trabajo: pesar por plata dejaría afuera del
 * avance justo a las barras que no tienen, y el número diría que la obra va
 * más adelantada o más atrasada de lo que va sin que nadie sepa por qué.
 * Los hitos no pesan: son un momento, no un trabajo.
 *
 * @param actividades  las del plan ya calculado, con `avance_pct`
 * @param foto         la línea base, o null si no hay
 * @param montoDe      (actividad) => plata de esa barra
 */
export function corteDeAvance({ actividades = [], foto = null, corte, cal = calendario(), montoDe = null }) {
  const trabajos = actividades.filter(a => !a.es_hito);
  const plata = a => (montoDe ? n(montoDe(a)) : 0);
  const porPlata = trabajos.length > 0 && trabajos.every(a => plata(a) > 0);
  const peso = a => (a.es_hito ? 0 : porPlata ? plata(a) : Math.max(1, n(a.duracion)));

  const pares = emparejar(foto, actividades);
  const usadas = new Set();

  const lineas = actividades.map(a => {
    const base = pares.get(a.id) || null;
    if (base) usadas.add(base.id);
    const avance = avanceDe(a);
    const esperado = base ? redondo(debiaIr(base.inicio, base.fin, corte, cal) * 100) : null;
    // Atrás: debía llevar más de lo que lleva. Con un punto de tolerancia,
    // para que 33 contra 33,3 no se pinte de rojo.
    const atras = esperado != null && avance < 100 && avance < esperado - 1;
    return {
      id: a.id, nombre: a.nombre, critica: !!a.critica, hito: !!a.es_hito,
      avance, esperado, peso: peso(a),
      base: base ? { inicio: dia(base.inicio), fin: dia(base.fin) } : null,
      inicio: dia(a.inicio), fin: dia(a.fin),
      estado: avance >= 100 ? "terminada" : atras ? (avance > 0 ? "atrasada" : "sin_arrancar")
        : avance > 0 ? "en_curso" : "pendiente",
      // Cuánto le falta contra lo que debía, en puntos: por donde se empieza a mirar.
      falta: atras ? redondo(esperado - avance) : 0,
    };
  });

  const total = lineas.reduce((t, l) => t + l.peso, 0);
  const hecho = lineas.reduce((t, l) => t + l.peso * l.avance / 100, 0);

  // Lo que debía ir sale de la línea base ENTERA, también de las barras que
  // hoy ya no están: se firmaron, y a esa fecha tenían que estar caminando.
  let esperado = null;
  if (foto?.actividades?.length) {
    const actualDe = new Map([...pares.entries()].map(([id, v]) => [v.id, actividades.find(a => a.id === id)]));
    let tb = 0, hb = 0;
    foto.actividades.forEach(b => {
      const hoy = actualDe.get(b.id);
      if (hoy?.es_hito) return;
      const w = porPlata ? (hoy ? plata(hoy) : 0) : Math.max(1, n(b.duracion));
      tb += w; hb += w * debiaIr(b.inicio, b.fin, corte, cal);
    });
    esperado = tb ? redondo((hb / tb) * 100) : null;
  }

  const atrasadas = lineas.filter(l => l.estado === "atrasada" || l.estado === "sin_arrancar")
    .sort((a, b) => (b.critica - a.critica) || (b.falta * b.peso - a.falta * a.peso));

  return {
    corte: dia(corte), pesaPor: porPlata ? "plata" : "dias",
    real: total ? redondo((hecho / total) * 100) : 0,
    esperado,
    lineas, atrasadas,
    terminadas: lineas.filter(l => l.estado === "terminada").length,
    enCurso: lineas.filter(l => l.avance > 0 && l.avance < 100).length,
    sinEmpezar: lineas.filter(l => l.avance <= 0).length,
    nuevas: lineas.filter(l => !l.base).length,
    borradas: (foto?.actividades || []).filter(b => !usadas.has(b.id)).length,
  };
}

/**
 * Lo que se guarda cuando alguien escribe un avance.
 *
 * EL PORCENTAJE TRAE SUS FECHAS. Al pasar de cero la barra empezó, y al llegar
 * a cien terminó: pedir las dos fechas aparte, en otra pantalla, es pedir que
 * no se carguen. Se proponen y quedan a la vista en EMPIEZA y TERMINA, donde
 * se corrigen si no fueron ésas.
 *
 * La propuesta es la fecha del PLAN si ya pasó —se asume que salió como
 * estaba previsto hasta que alguien diga otra cosa— y el día del corte si no:
 * lo único seguro de algo que se adelantó es que al corte ya estaba.
 *
 * @param a      la actividad como está guardada
 * @param plan   { inicio, fin } de esa actividad en el plan SIN corte
 */
export function camposDeAvance(a, pct, corte, plan = {}) {
  const p = Math.max(0, Math.min(100, Math.round(n(pct))));
  const c = dia(corte);
  if (p <= 0) return { avance_pct: 0, inicio_real: null, fin_real: null };
  const campos = { avance_pct: p };
  const empezo = a.inicio_real ? dia(a.inicio_real)
    : (plan.inicio && dia(plan.inicio) <= c ? dia(plan.inicio) : c);
  if (!a.inicio_real) campos.inicio_real = empezo;
  if (p < 100) { if (a.fin_real) campos.fin_real = null; return campos; }
  if (!a.fin_real) {
    const termino = plan.fin && dia(plan.fin) <= c ? dia(plan.fin) : c;
    campos.fin_real = termino < empezo ? empezo : termino;
  }
  return campos;
}

/**
 * Qué duración tiene que tener una barra EN CURSO para terminar ese día.
 *
 * Con corte, lo que falta de una barra empezada son sus días por la parte sin
 * hacer, contados desde el día siguiente al corte. Escribir "termina el 12" es
 * entonces decir cuántos días FALTAN, y la duración total sale de ahí: si va
 * por el 40 % y le quedan seis días, era un trabajo de diez.
 */
export function duracionParaTerminar(a, hasta, reanuda, cal = calendario()) {
  const faltan = dia(hasta) < dia(reanuda) ? 1 : Math.max(1, cal.entre(reanuda, hasta));
  const queda = 1 - avanceDe(a) / 100;
  if (queda <= 0) return Math.max(1, n(a.duracion));
  const justo = faltan / queda;
  const sirve = d => d >= 1 && Math.max(1, Math.ceil(d * queda - 1e-9)) === faltan;
  return [Math.round(justo), Math.floor(justo), Math.ceil(justo)].find(sirve) || Math.max(1, Math.round(justo));
}

/** El plan como estaba pensado, sin lo ejecutado: de ahí salen las fechas que se proponen. */
export function planSinCorte({ actividades, dependencias, inicio, cal }) {
  const plan = calcular({ actividades, dependencias, inicio, cal });
  return new Map(plan.actividades.map(a => [a.id, { inicio: a.inicio, fin: a.fin }]));
}

/** El último día hábil ANTES de hoy: lo que se mide es lo que se hizo hasta ayer. */
export function corteSugerido(hoy, cal = calendario()) {
  let f = new Date(`${dia(hoy)}T12:00:00`);
  for (let k = 0; k < 15; k++) {
    f = new Date(f.getTime() - 86400000);
    if (cal.trabaja(f)) break;
  }
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
}
