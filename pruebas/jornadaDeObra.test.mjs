import test from "node:test";
import assert from "node:assert/strict";
import { hoyEnObra, HORA_DE_CIERRE } from "../src/modules/libro/jornada.js";

// La jornada de obra no termina a medianoche. Si se funde hasta las dos de la
// mañana, eso es trabajo del día anterior, y el residente lo escribe cuando
// termina —no antes de las doce para que el libro no se le cierre en la mano.
//
// Quito es UTC−5, así que las 06:00 locales son las 11:00 UTC.
const enQuito = (iso) => new Date(`${iso}-05:00`);

test("a media tarde, el libro es el del día", () => {
  assert.equal(hoyEnObra(enQuito("2026-10-22T15:00:00")), "2026-10-22");
});

test("a las dos de la mañana todavía se escribe el día anterior", () => {
  assert.equal(hoyEnObra(enQuito("2026-10-23T02:00:00")), "2026-10-22");
});

test("a las cinco y media sigue siendo el día anterior", () => {
  assert.equal(hoyEnObra(enQuito("2026-10-23T05:30:00")), "2026-10-22");
});

test("a las seis y cuarto ya empezó el día nuevo", () => {
  assert.equal(hoyEnObra(enQuito("2026-10-23T06:15:00")), "2026-10-23");
});

test("justo a las seis arranca el día nuevo", () => {
  assert.equal(hoyEnObra(enQuito("2026-10-23T06:00:00")), "2026-10-23");
});

test("el corte está donde dice la constante, y no en otro lado", () => {
  assert.equal(HORA_DE_CIERRE, 6);
});

// ── HASTA CUÁNDO SE PUEDE ESCRIBIR ─────────────────────────────────────────
//
// Una cosa es a qué día pertenece lo que pasó —eso lo decide la jornada de 6 a
// 6— y otra hasta cuándo se puede dejarlo escrito. El residente que fundió
// toda la noche no puede tener que escribir el libro antes de irse a dormir.
import { sePuedeEscribirEl, horaEnObra, diaAnterior } from "../src/modules/libro/jornada.js";

// Quito es UTC−5: las 14:00 UTC son las 09:00 en la obra.
const enObra = (fecha, hora) => new Date(`${fecha}T${String(hora + 5).padStart(2, "0")}:00:00Z`);

test("la jornada en curso se escribe siempre", () => {
  // 15:00 del 30 → jornada del 30.
  const r = sePuedeEscribirEl("2026-10-30", enObra("2026-10-30", 15));
  assert.equal(r.sePuede, true);
  assert.equal(r.hastaMediodia, false);
});

test("el que trabajó de noche escribe a las nueve de la mañana siguiente", () => {
  // Fundió hasta las 2 del 31; esa es jornada del 30. A las 9 del 31 la
  // jornada en curso ya es el 31, y la del 30 sigue abierta.
  const ahora = enObra("2026-10-31", 9);
  const r = sePuedeEscribirEl("2026-10-30", ahora);
  assert.equal(r.sePuede, true);
  assert.equal(r.hastaMediodia, true);
  assert.match(r.porQue, /hasta el mediodía/);
});

test("a las dos de la mañana sigue siendo la jornada anterior, y se escribe", () => {
  const ahora = enObra("2026-10-31", 2);
  assert.equal(hoyEnObra(ahora), "2026-10-30", "antes de las 6 la jornada es la del día anterior");
  assert.equal(sePuedeEscribirEl("2026-10-30", ahora).sePuede, true);
});

test("pasado el mediodía, la jornada anterior se cierra", () => {
  const ahora = enObra("2026-10-31", 12);
  assert.equal(sePuedeEscribirEl("2026-10-30", ahora).sePuede, false);
  assert.match(sePuedeEscribirEl("2026-10-30", ahora).porQue, /pasó el mediodía/);
});

test("un día más viejo no se escribe ni de mañana", () => {
  assert.equal(sePuedeEscribirEl("2026-10-28", enObra("2026-10-31", 9)).sePuede, false);
});

test("un día que todavía no pasó no se escribe por adelantado", () => {
  assert.equal(sePuedeEscribirEl("2026-11-05", enObra("2026-10-31", 9)).sePuede, false);
});

test("la hora de la obra es la de Quito, no la del servidor", () => {
  assert.equal(horaEnObra(new Date("2026-10-31T14:00:00Z")), 9);
  assert.equal(diaAnterior("2026-11-01"), "2026-10-31");
});
