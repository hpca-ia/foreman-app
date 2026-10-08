import test from "node:test";
import assert from "node:assert/strict";
import { calendario, calcular } from "../src/modules/cronograma/cpm.js";

// El motor de fechas. Lo que calcula acá es lo que la obra promete cumplir.

const lunASab = calendario({ laborables: [1, 2, 3, 4, 5, 6] });
const lunAVie = calendario({ laborables: [1, 2, 3, 4, 5] });
const inicio = new Date("2026-03-02T12:00:00");       // un lunes

// `calcular` devuelve las actividades en una lista; acá se buscan por id, que
// es como se leen en una prueba.
const plan = (acts, deps, cal = lunASab) => {
  const r = calcular({ actividades: acts, dependencias: deps, inicio, cal });
  return { ...r, de: id => r.actividades.find(a => a.id === id) };
};

test("una actividad de un día empieza y termina el mismo día", () => {
  const p = plan([{ id: 1, duracion: 1 }], []);
  assert.equal(p.de(1).inicio, p.de(1).fin);
});

test("el domingo no cuenta: seis días de trabajo cruzan la semana", () => {
  const p = plan([{ id: 1, duracion: 7 }], []);
  // Lunes 2 + 7 días hábiles de lun-a-sáb = termina el lunes 9.
  assert.equal(p.de(1).fin.slice(0, 10), "2026-03-09");
});

test("sin sábados, los mismos siete días terminan dos días después", () => {
  const conSab = plan([{ id: 1, duracion: 7 }], []).de(1).fin;
  const sinSab = plan([{ id: 1, duracion: 7 }], [], lunAVie).de(1).fin;
  assert.ok(sinSab > conSab, `sin sábados debería terminar más tarde: ${sinSab} vs ${conSab}`);
});

test("fin→comienzo: la segunda arranca después de que termina la primera", () => {
  const p = plan([{ id: 1, duracion: 5 }, { id: 2, duracion: 3 }],
    [{ actividad_id: 2, depende_de_id: 1, tipo: "FC", retardo: 0 }]);
  assert.ok(p.de(2).inicio > p.de(1).fin);
});

test("UN RETARDO NEGATIVO ES UN TRASLAPE: la segunda entra antes de que termine la primera", () => {
  // Es lo que hace que una obra entre en su plazo, y estuvo roto: el signo se
  // aplastaba a cero y el traslape no existía.
  const sin = plan([{ id: 1, duracion: 10 }, { id: 2, duracion: 5 }],
    [{ actividad_id: 2, depende_de_id: 1, tipo: "FC", retardo: 0 }]);
  const con = plan([{ id: 1, duracion: 10 }, { id: 2, duracion: 5 }],
    [{ actividad_id: 2, depende_de_id: 1, tipo: "FC", retardo: -4 }]);
  assert.ok(con.de(2).inicio < sin.de(2).inicio, "el traslape tiene que adelantar el arranque");
  assert.ok(con.duracion < sin.duracion, "y acortar la obra entera");
});

test("una espera real alarga: el fragüe antes de desencofrar", () => {
  const sin = plan([{ id: 1, duracion: 5 }, { id: 2, duracion: 5 }],
    [{ actividad_id: 2, depende_de_id: 1, tipo: "FC", retardo: 0 }]);
  const con = plan([{ id: 1, duracion: 5 }, { id: 2, duracion: 5 }],
    [{ actividad_id: 2, depende_de_id: 1, tipo: "FC", retardo: 7 }]);
  assert.ok(con.duracion > sin.duracion);
});

test("comienzo→comienzo: arrancan juntas", () => {
  const p = plan([{ id: 1, duracion: 9 }, { id: 2, duracion: 3 }],
    [{ actividad_id: 2, depende_de_id: 1, tipo: "CC", retardo: 0 }]);
  assert.equal(p.de(2).inicio, p.de(1).inicio);
});

test("fin→fin: terminan juntas", () => {
  const p = plan([{ id: 1, duracion: 9 }, { id: 2, duracion: 3 }],
    [{ actividad_id: 2, depende_de_id: 1, tipo: "FF", retardo: 0 }]);
  assert.equal(p.de(2).fin, p.de(1).fin);
});

test("la ruta crítica no tiene colchón, y lo que está en paralelo sí", () => {
  const p = plan([{ id: 1, duracion: 10 }, { id: 2, duracion: 2 }, { id: 3, duracion: 1 }],
    [{ actividad_id: 3, depende_de_id: 1, tipo: "FC", retardo: 0 },
     { actividad_id: 3, depende_de_id: 2, tipo: "FC", retardo: 0 }]);
  assert.equal(p.de(1).holgura, 0, "la larga es crítica");
  assert.ok(p.de(2).holgura > 0, "la corta tiene colchón");
});

test("un círculo se detecta y no deja el plan sin fechas", () => {
  const p = plan([{ id: 1, duracion: 3 }, { id: 2, duracion: 3 }],
    [{ actividad_id: 2, depende_de_id: 1, tipo: "FC", retardo: 0 },
     { actividad_id: 1, depende_de_id: 2, tipo: "FC", retardo: 0 }]);
  assert.ok(p.ciclos.length > 0, "tiene que avisar del círculo");
});

test("un feriado corre la fecha de fin", () => {
  const conFeriado = calendario({ laborables: [1, 2, 3, 4, 5, 6], feriados: ["2026-03-04"] });
  const sin = plan([{ id: 1, duracion: 5 }], []).de(1).fin;
  const con = calcular({ actividades: [{ id: 1, duracion: 5 }], dependencias: [], inicio, cal: conFeriado })
    .actividades[0].fin;
  assert.ok(con > sin, "con un feriado en el medio tiene que terminar más tarde");
});
