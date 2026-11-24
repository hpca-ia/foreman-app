import test from "node:test";
import assert from "node:assert/strict";
import { calendario, calcular } from "../src/modules/cronograma/cpm.js";
import { fotoDe } from "../src/modules/cronograma/compararVersion.js";
import { corteDeAvance, camposDeAvance, duracionParaTerminar, debiaIr, corteSugerido }
  from "../src/modules/cronograma/corteDeAvance.js";

// El avance de la obra contra lo que se firmó. Nació de una obra con tres
// versiones guardadas que terminaban el mismo día, estando atrasada: el
// cronograma no tenía dónde decir qué se había hecho.

const cal = calendario({ laborables: [1, 2, 3, 4, 5, 6] });
const inicio = "2026-03-02";                                   // un lunes
const cadena = [{ actividad_id: 2, depende_de_id: 1 }, { actividad_id: 3, depende_de_id: 2 }];
const acts = extra => [
  { id: 1, nombre: "DERROCAMIENTO", duracion: 6, ...(extra?.[1] || {}) },   // lun 2 → sáb 7
  { id: 2, nombre: "MAMPOSTERÍA", duracion: 12, ...(extra?.[2] || {}) },    // lun 9 → sáb 21
  { id: 3, nombre: "PINTURA", duracion: 6, ...(extra?.[3] || {}) },         // lun 23 → sáb 28
];
const plan = (extra, corte = null) => {
  const r = calcular({ actividades: acts(extra), dependencias: cadena, inicio, cal, corte });
  return { ...r, de: id => r.actividades.find(a => a.id === id) };
};
const base = () => fotoDe(plan().actividades, cadena);

test("sin corte el cronograma es el plan de siempre, aunque haya avance cargado", () => {
  const p = plan({ 1: { avance_pct: 50, inicio_real: "2026-03-04" } });
  assert.equal(p.de(1).inicio, "2026-03-02");
  assert.equal(p.fin, "2026-03-28");
  assert.equal(p.corte, null);
});

test("lo que no empezó no puede arrancar antes del día siguiente al corte", () => {
  // Nadie tocó nada en dos semanas: al sábado 14 no hay nada hecho.
  const p = plan({}, "2026-03-14");
  assert.equal(p.de(1).inicio, "2026-03-16", "el lunes siguiente");
  assert.equal(p.fin, "2026-04-11", "la obra entera se corrió dos semanas");
});

test("lo terminado queda donde de verdad ocurrió y no lo corre nadie", () => {
  const p = plan({ 1: { avance_pct: 100, inicio_real: "2026-03-03", fin_real: "2026-03-11" } }, "2026-03-14");
  assert.equal(p.de(1).inicio, "2026-03-03");
  assert.equal(p.de(1).fin, "2026-03-11");
  assert.equal(p.de(1).real, "terminada");
  assert.equal(p.de(1).critica, false, "lo que ya pasó no puede atrasar nada");
});

test("a lo empezado le falta su parte sin hacer, contada desde el corte", () => {
  // Mampostería al 50 % el sábado 14: le quedan 6 de sus 12 días → sáb 21.
  const p = plan({
    1: { avance_pct: 100, inicio_real: "2026-03-02", fin_real: "2026-03-07" },
    2: { avance_pct: 50, inicio_real: "2026-03-09" },
  }, "2026-03-14");
  assert.equal(p.de(2).inicio, "2026-03-09", "conserva su arranque real");
  assert.equal(p.de(2).fin, "2026-03-21");
  assert.equal(p.de(2).real, "en_curso");
  assert.equal(p.fin, "2026-03-28", "va al día: la obra termina cuando se firmó");
});

test("una barra empezada que va lenta empuja a la que sigue y al fin de la obra", () => {
  // Al 25 % el sábado 14: le quedan 9 días → mié 25. Pintura arranca el 26.
  const p = plan({
    1: { avance_pct: 100, inicio_real: "2026-03-02", fin_real: "2026-03-07" },
    2: { avance_pct: 25, inicio_real: "2026-03-09" },
  }, "2026-03-14");
  assert.equal(p.de(2).fin, "2026-03-25");
  assert.equal(p.de(3).inicio, "2026-03-26");
  assert.equal(p.fin, "2026-04-01");
  assert.equal(p.de(2).critica, true, "es la que está corriendo la entrega");
});

test("lo que debía ir sale de la línea base, no del plan de hoy", () => {
  assert.equal(debiaIr("2026-03-09", "2026-03-21", "2026-03-14", cal), 0.5);
  assert.equal(debiaIr("2026-03-09", "2026-03-21", "2026-03-07", cal), 0, "todavía no le tocaba");
  assert.equal(debiaIr("2026-03-09", "2026-03-21", "2026-03-30", cal), 1);
});

test("el avance de la obra: lo hecho de cada barra por lo que pesa", () => {
  const p = plan({
    1: { avance_pct: 100, inicio_real: "2026-03-02", fin_real: "2026-03-07" },
    2: { avance_pct: 25, inicio_real: "2026-03-09" },
  }, "2026-03-14");
  const r = corteDeAvance({ actividades: p.actividades, foto: base(), corte: "2026-03-14", cal });
  // Por días: 6 + 12×0,25 = 9 de 24 hechos; debía ir 6 + 6 = 12 de 24.
  assert.equal(r.pesaPor, "dias");
  assert.equal(r.real, 37.5);
  assert.equal(r.esperado, 50);
  assert.equal(r.atrasadas.length, 1);
  assert.equal(r.atrasadas[0].nombre, "MAMPOSTERÍA");
  assert.equal(r.atrasadas[0].estado, "atrasada");
  assert.equal(r.terminadas, 1);
});

test("una barra que debía haber arrancado y sigue en cero se dice sin arrancar", () => {
  const p = plan({}, "2026-03-14");
  const r = corteDeAvance({ actividades: p.actividades, foto: base(), corte: "2026-03-14", cal });
  assert.deepEqual(r.atrasadas.map(l => l.estado), ["sin_arrancar", "sin_arrancar"]);
  assert.equal(r.lineas.find(l => l.id === 3).estado, "pendiente", "a la pintura todavía no le tocaba");
});

test("pesa por plata solo cuando todas las barras tienen la suya", () => {
  const p = plan({ 1: { avance_pct: 100 } }, "2026-03-14");
  const todas = corteDeAvance({ actividades: p.actividades, corte: "2026-03-14", cal,
    montoDe: a => ({ 1: 1000, 2: 8000, 3: 1000 })[a.id] });
  assert.equal(todas.pesaPor, "plata");
  assert.equal(todas.real, 10);
  // Con una barra sin plata, pesar por plata la dejaría afuera del avance.
  const falta = corteDeAvance({ actividades: p.actividades, corte: "2026-03-14", cal,
    montoDe: a => ({ 1: 1000, 2: 8000 })[a.id] });
  assert.equal(falta.pesaPor, "dias");
  assert.equal(falta.real, 25);
});

test("sin línea base se dice el avance real y no se inventa cuánto debía ir", () => {
  const p = plan({ 1: { avance_pct: 50 } }, "2026-03-14");
  const r = corteDeAvance({ actividades: p.actividades, foto: null, corte: "2026-03-14", cal });
  assert.equal(r.esperado, null);
  assert.equal(r.atrasadas.length, 0);
});

test("una barra nueva, que no estaba en la línea base, no sale atrasada", () => {
  const p = plan({}, "2026-03-14");
  const r = corteDeAvance({
    actividades: [...p.actividades, { id: 9, nombre: "ADICIONAL", duracion: 3, inicio: "2026-03-16", fin: "2026-03-18" }],
    foto: base(), corte: "2026-03-14", cal });
  assert.equal(r.lineas.find(l => l.id === 9).esperado, null);
  assert.equal(r.nuevas, 1);
});

test("escribir un avance trae sus fechas: empezó cuando decía el plan si ya pasó", () => {
  const c = camposDeAvance({ id: 2 }, 40, "2026-03-14", { inicio: "2026-03-09", fin: "2026-03-21" });
  assert.deepEqual(c, { avance_pct: 40, inicio_real: "2026-03-09" });
});

test("lo que se adelantó al plan empezó, a más tardar, el día del corte", () => {
  const c = camposDeAvance({ id: 3 }, 10, "2026-03-14", { inicio: "2026-03-23", fin: "2026-03-28" });
  assert.equal(c.inicio_real, "2026-03-14");
});

test("al llegar a cien se propone la fecha de fin, y no pisa una ya escrita", () => {
  const c = camposDeAvance({ id: 1 }, 100, "2026-03-14", { inicio: "2026-03-02", fin: "2026-03-07" });
  assert.equal(c.fin_real, "2026-03-07");
  const ya = camposDeAvance({ id: 1, inicio_real: "2026-03-03", fin_real: "2026-03-11" }, 100, "2026-03-14",
    { inicio: "2026-03-02", fin: "2026-03-07" });
  assert.deepEqual(ya, { avance_pct: 100 });
});

test("volver a cero borra las fechas reales; bajar de cien borra la de fin", () => {
  assert.deepEqual(camposDeAvance({ id: 1, inicio_real: "2026-03-03", fin_real: "2026-03-11" }, 0, "2026-03-14"),
    { avance_pct: 0, inicio_real: null, fin_real: null });
  assert.deepEqual(camposDeAvance({ id: 1, inicio_real: "2026-03-03", fin_real: "2026-03-11" }, 80, "2026-03-14"),
    { avance_pct: 80, fin_real: null });
});

test("escribir cuándo termina una barra en curso es decir cuántos días le faltan", () => {
  // Al 40 % y termina el sábado 21: faltan 6 días desde el lunes 16 → era de 10.
  const a = { id: 2, duracion: 12, avance_pct: 40 };
  const d = duracionParaTerminar(a, "2026-03-21", "2026-03-16", cal);
  assert.equal(d, 10);
  const p = calcular({ actividades: [{ ...a, duracion: d, inicio_real: "2026-03-09" }], dependencias: [],
    inicio, cal, corte: "2026-03-14" });
  assert.equal(p.actividades[0].fin, "2026-03-21", "y el cronograma termina ese día");
});

test("el corte que se propone es el último día de trabajo antes de hoy", () => {
  assert.equal(corteSugerido("2026-03-16", cal), "2026-03-14", "un lunes: el sábado");
  assert.equal(corteSugerido("2026-03-18", cal), "2026-03-17");
});

test("la foto de un corte guarda cuánto se había hecho", () => {
  const p = plan({ 2: { avance_pct: 25, inicio_real: "2026-03-09" } }, "2026-03-14");
  const f = fotoDe(p.actividades, cadena);
  assert.equal(f.actividades[1].avance_pct, 25);
  assert.equal(f.actividades[1].inicio_real, "2026-03-09");
});
