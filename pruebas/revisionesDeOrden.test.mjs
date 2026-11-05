import test from "node:test";
import assert from "node:assert/strict";
import { codigoDeLaRevision, laFamiliaDe, mandaEnElControl, comoSeDice }
  from "../src/modules/controlObra/revisionesDeOrden.js";

const ordenes = [
  { id: 1, codigo: "OC-01", estado: "aprobada" },
  { id: 2, codigo: "OC-02", estado: "aprobada" },
];

test("la primera modificacion de una orden lleva la letra A", () => {
  assert.equal(codigoDeLaRevision(ordenes[0], ordenes), "OC-01-A");
  assert.equal(codigoDeLaRevision({ id: 4, codigo: "OC-04" }, [{ id: 4, codigo: "OC-04" }]), "OC-04-A");
});

test("se cuenta sobre las que existen, no sobre la que se revisa", () => {
  // Modificando la OC-01 cuando ya hay una OC-01-A, la que sale es la B: dos
  // papeles con el mismo codigo es la peor manera de perder una discusion con
  // un cliente.
  const con = [...ordenes, { id: 3, codigo: "OC-01-A", revision_de: 1, estado: "aprobada" }];
  assert.equal(codigoDeLaRevision(ordenes[0], con), "OC-01-B");
  assert.equal(codigoDeLaRevision(con[2], con), "OC-01-B");
  // Y la familia son sus versiones, en orden. La OC-02 no es pariente.
  assert.deepEqual(laFamiliaDe(ordenes[0], con).map(o => o.codigo), ["OC-01", "OC-01-A"]);
  // Las que se numeraron con punto siguen siendo de la familia, y cuentan.
  const viejas = [...ordenes, { id: 3, codigo: "OC-01.1", revision_de: 1 }, { id: 4, codigo: "OC-01.2", revision_de: 1 }];
  assert.deepEqual(laFamiliaDe(ordenes[0], viejas).map(o => o.codigo), ["OC-01", "OC-01.1", "OC-01.2"]);
  assert.equal(codigoDeLaRevision(ordenes[0], viejas), "OC-01-C", "la tercera, aunque las dos primeras lleven punto");
  // Y la OC-10 no es de la familia de la OC-01.
  assert.deepEqual(laFamiliaDe(ordenes[0], [...ordenes, { id: 9, codigo: "OC-10" }]).map(o => o.codigo), ["OC-01"]);
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
    { id: 3, codigo: "OC-01-A", revision_de: 1, estado: "borrador" },
  ];
  assert.match(comoSeDice(con[0], con), /Reemplazada por la OC-01-A/);
  assert.match(comoSeDice(con[1], con), /Revisión de OC-01/);
  // Una orden sin parientes no dice nada.
  assert.equal(comoSeDice(ordenes[1], ordenes), null);
});
