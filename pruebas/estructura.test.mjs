import test from "node:test";
import assert from "node:assert/strict";
import { estructura } from "../src/modules/presupuestos/estructura.js";

// Lo que esta función no copia, para el documento no existe: el PDF se arma
// con lo que sale de acá y nada más. Se le escaparon la etapa y la nota, y el
// resultado fue un documento que anunciaba las etapas con la columna en blanco.

const capitulos = [{ nombre: "OBRA GRIS", orden: 1 }];
const items = [
  { capitulo: "OBRA GRIS", orden: 1, descripcion: "Replanteo", unidad: "m2", cantidad: 10, precio_unitario: 2, total: 20, etapa: "ETAPA 1" },
  { capitulo: "OBRA GRIS", orden: 2, descripcion: "Mampostería", unidad: "m2", cantidad: 5, precio_unitario: 10, total: 50, etapa: "ETAPA 2", nota: "falta la cotización" },
];

test("la etapa de cada rubro llega al documento", () => {
  const caps = estructura({ capitulos, items });
  assert.deepEqual(caps[0].rubros.map(r => r.etapa), ["ETAPA 1", "ETAPA 2"]);
});

test("la advertencia escrita a mano también", () => {
  const caps = estructura({ capitulos, items });
  assert.equal(caps[0].rubros[1].nota, "falta la cotización");
});

test("un rubro sin etapa ni nota no inventa nada", () => {
  const caps = estructura({ capitulos, items: [{ capitulo: "OBRA GRIS", descripcion: "X", total: 1 }] });
  assert.equal(caps[0].rubros[0].etapa, "");
  assert.equal(caps[0].rubros[0].nota, "");
});

test("el rubro lleva su id: es con lo que se elige si su nota sale", () => {
  const caps = estructura({
    capitulos: ["ALBAÑILERÍA"],
    items: [{ id: 77, capitulo: "ALBAÑILERÍA", descripcion: "Tabique", nota: "Rubro omitido por error", total: 10 }],
  });
  assert.equal(caps[0].rubros[0].id, 77);
  assert.equal(caps[0].rubros[0].nota, "Rubro omitido por error");
});
