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
