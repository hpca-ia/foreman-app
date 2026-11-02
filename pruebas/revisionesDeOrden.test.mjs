import test from "node:test";
import assert from "node:assert/strict";
import { codigoDeLaRevision, laFamiliaDe, mandaEnElControl, comoSeDice }
  from "../src/modules/controlObra/revisionesDeOrden.js";

const ordenes = [
  { id: 1, codigo: "OC-01", estado: "aprobada" },
  { id: 2, codigo: "OC-02", estado: "aprobada" },
];

test("la primera revision de una orden es la .1", () => {
  assert.equal(codigoDeLaRevision(ordenes[0], ordenes), "OC-01.1");
});

test("se cuenta sobre las que existen, no sobre la que se revisa", () => {
  // Revisando la OC-01 cuando ya hay una OC-01.1, la que sale es la .2: dos
  // papeles con el mismo numero es la peor manera de perder una discusion con
  // un cliente.
  const con = [...ordenes, { id: 3, codigo: "OC-01.1", revision_de: 1, estado: "aprobada" }];
  assert.equal(codigoDeLaRevision(ordenes[0], con), "OC-01.2");
  assert.equal(codigoDeLaRevision(con[2], con), "OC-01.2");
  // Y la familia son las tres versiones, en orden.
  assert.deepEqual(laFamiliaDe(ordenes[0], con).map(o => o.codigo), ["OC-01", "OC-01.1"]);
});

test("en el control manda la ultima: la reemplazada existio pero ya no cuenta", () => {
  // Si contaran las dos, el contrato vigente sumaria el mismo trabajo dos
  // veces.
  assert.equal(mandaEnElControl({ estado: "aprobada" }), true);
  assert.equal(mandaEnElControl({ estado: "aprobada", reemplazada_at: "2026-11-01" }), false);
  assert.equal(mandaEnElControl({ estado: "aprobada", anulada: true }), false);
  assert.equal(mandaEnElControl({ estado: "enviada" }), false);
});

test("cada version dice que es, para no mandarle al cliente dos ordenes por lo mismo", () => {
  const con = [
    { id: 1, codigo: "OC-01", estado: "aprobada", reemplazada_at: "2026-11-01" },
    { id: 3, codigo: "OC-01.1", revision_de: 1, estado: "borrador" },
  ];
  assert.match(comoSeDice(con[0], con), /Reemplazada por la OC-01\.1/);
  assert.match(comoSeDice(con[1], con), /Revisión de OC-01/);
  // Una orden sin parientes no dice nada.
  assert.equal(comoSeDice(ordenes[1], ordenes), null);
});
