import test from "node:test";
import assert from "node:assert/strict";
import { correosDe } from "../src/modules/actas/correos.js";

test("se le manda a los que tienen correo y quedaron marcados", () => {
  const r = correosDe([
    { nombre: "A", email: "a@x.com", recibe: true },
    { nombre: "B", email: "b@x.com", recibe: true },
  ]);
  assert.deepEqual(r, ["a@x.com", "b@x.com"]);
});

test("AL QUE FALTÓ TAMBIÉN: el acta se manda a los convocados, no a los presentes", () => {
  const r = correosDe([
    { nombre: "Vino", email: "a@x.com", recibe: true, asistio: true },
    { nombre: "Faltó", email: "b@x.com", recibe: true, asistio: false },
  ]);
  assert.equal(r.length, 2, "el que no vino es el que más necesita enterarse");
});

test("al que se destildó no se le manda", () => {
  const r = correosDe([{ email: "a@x.com", recibe: false }]);
  assert.deepEqual(r, []);
});

test("sin correo no entra, y un correo mal escrito tampoco", () => {
  const r = correosDe([
    { nombre: "Sin correo", recibe: true },
    { nombre: "Mal", email: "no-es-un-correo", recibe: true },
    { nombre: "Bien", email: "ok@x.com", recibe: true },
  ]);
  assert.deepEqual(r, ["ok@x.com"]);
});

test("el mismo correo dos veces se manda una: dos personas con la misma casilla", () => {
  const r = correosDe([
    { email: "obra@x.com", recibe: true },
    { email: "  OBRA@X.com ", recibe: true },
  ]);
  assert.deepEqual(r, ["obra@x.com"]);
});

test("una lista vacía no revienta", () => {
  assert.deepEqual(correosDe(), []);
});
