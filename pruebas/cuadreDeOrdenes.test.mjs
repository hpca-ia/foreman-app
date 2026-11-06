import test from "node:test";
import assert from "node:assert/strict";
import { cuadreDeUnaOrden, cuadreDeOrdenes, comoSeDice, capitulosPartidos } from "../src/modules/controlObra/cuadreDeOrdenes.js";

// La OC-01 del Aereo, tal como esta: cuatro adiciones, una reduccion, el
// desalojo en otro capitulo y los honorarios en el suyo.
const orden = { id: 5, codigo: "OC-01", estado: "aprobada" };
const obra = { honorarios_pct: 10 };
const lineas = [
  { tipo: "aumenta", cantidad: 95.61, precio_unitario: 98.5 },
  { tipo: "aumenta", cantidad: 95.61, precio_unitario: 8 },
  { tipo: "aumenta", cantidad: 95.61, precio_unitario: 4.65 },
  { tipo: "aumenta", cantidad: 2, precio_unitario: 125 },
  { tipo: "quita", cantidad: 95.61, precio_unitario: 78.75 },
];
// Como los deja hoy la aprobacion: cada partida con su IVA, sumando lo que
// dice el documento de la orden, $4.234,92.
const rubros = [
  { capitulo: "ADICIONALES · OC-01", total_base: 10830.22 },
  { capitulo: "ADICIONALES · OC-01", total_base: 879.61 },
  { capitulo: "ADICIONALES · OC-01", total_base: 511.27 },
  { capitulo: "ADICIONALES · OC-01", total_base: -8658.68 },
  { capitulo: "PRELIMINARES Y VARIOS", total_base: 287.50 },
  { capitulo: "HONORARIOS", descripcion: "Honorarios 10% sobre OC-01", total_base: 385.00 },
];

test("un capitulo no es una orden: sus lineas caen en capitulos distintos", () => {
  // El capitulo que lleva el nombre de la orden dice $3.562,42 y la orden puso
  // $4.234,92 en el control, repartidos en tres capitulos. Leer el capitulo
  // como si fuera la orden es el error que esto evita.
  const c = cuadreDeUnaOrden({ orden, lineas, rubros, obra, iva: 15 });
  assert.equal(c.enControl, 4234.92);
  assert.equal(c.esperado, 4234.92, "lo esperado es el total con IVA del documento");
  assert.equal(c.esperadoHonorarios, 385);
  assert.equal(c.esperadoTrabajo, 3849.92);
  assert.equal(c.capitulos.length, 3);
  assert.equal(c.capitulos.find(x => x.capitulo === "ADICIONALES · OC-01").total, 3562.42);
  assert.equal(c.diferencia, 0);
  assert.equal(c.cuadra, true);
});

test("dos centavos tambien se dicen: el control contra el documento, al centavo", () => {
  // Asi estaba la OC-01 del Aereo: dos de sus rubros con un centavo de mas
  // cada uno, por un IVA sumado sobre un monto ya redondeado. El documento
  // dice $4.234,92 y el control $4.234,94. Antes se toleraba; el contrato
  // vigente quedaba a dos centavos del presupuesto actualizado.
  const comoEstaba = rubros.map(r => (r.total_base === 10830.22 ? { ...r, total_base: 10830.23 }
    : r.total_base === 511.27 ? { ...r, total_base: 511.28 } : r));
  const c = cuadreDeUnaOrden({ orden, lineas, rubros: comoEstaba, obra, iva: 15 });
  assert.equal(c.enControl, 4234.94);
  assert.equal(c.diferencia, 0.02);
  assert.equal(c.cuadra, false);
  assert.match(c.problema, /el control tiene \$0\.02 de más por esta orden/);
  // Y un centavo de menos, igual.
  const corto = rubros.map(r => (r.total_base === 879.61 ? { ...r, total_base: 879.6 } : r));
  assert.match(cuadreDeUnaOrden({ orden, lineas, rubros: corto, obra, iva: 15 }).problema, /al control le faltan \$0\.01/);
});

test("si falta el rubro de honorarios lo dice con el monto", () => {
  // Las ordenes aprobadas antes de que los honorarios existieran: cobrandose
  // en el papel y sin aparecer en el control.
  const c = cuadreDeUnaOrden({ orden, lineas, obra, iva: 15,
    rubros: rubros.filter(r => r.capitulo !== "HONORARIOS") });
  assert.equal(c.cuadra, false);
  assert.match(c.problema, /le falta el rubro de honorarios/);
  assert.match(c.problema, /385\.00/);
});

test("si una aprobacion entro a medias dice cuanto falta y cuantas partidas", () => {
  const c = cuadreDeUnaOrden({ orden, lineas, obra, iva: 15,
    rubros: rubros.filter(r => r.total_base !== 879.61) });
  assert.equal(c.cuadra, false);
  assert.match(c.problema, /al control le faltan \$879\.\d\d/);
  assert.match(c.problema, /1 partida sin su rubro/);
});

test("una orden aprobada sin un solo rubro en el control se denuncia", () => {
  const c = cuadreDeUnaOrden({ orden, lineas, rubros: [], obra, iva: 15 });
  assert.equal(c.problema, "está aprobada y no puso un solo rubro en el control");
});

test("solo se revisan las aprobadas y vivas: una anulada ya no esta en el control", () => {
  const cu = cuadreDeOrdenes({
    ordenes: [orden, { id: 6, codigo: "OC-02", estado: "enviada" },
      { id: 7, codigo: "OC-03", estado: "aprobada", anulada: true }],
    lineasPorOrden: { 5: lineas },
    rubrosDeOrdenes: rubros.map(r => ({ ...r, orden_cambio_id: 5 })),
    obra, iva: 15,
  });
  assert.equal(cu.filas.length, 1);
  assert.equal(cu.todoCuadra, true);
  assert.equal(comoSeDice(cu), null);
});

test("el aviso dice cuantas no cuadran y cuanta plata hay en juego", () => {
  const cu = cuadreDeOrdenes({
    ordenes: [orden], lineasPorOrden: { 5: lineas },
    rubrosDeOrdenes: [], obra, iva: 15,
  });
  assert.equal(cu.mal.length, 1);
  assert.match(comoSeDice(cu), /1 orden aprobada no cuadra/);
});

test("un capitulo partido en dos esconde un rubro a plena vista", () => {
  // El desalojo de la OC-01 quedo en un segundo "PRELIMINARES Y VARIOS" al
  // fondo del control: el rubro esta y suma, pero quien lo busca en su
  // capitulo no lo encuentra y concluye que la orden no entro entera.
  const partidos = capitulosPartidos([
    { capitulo: "PRELIMINARES Y VARIOS", capitulo_orden: 1 },
    { capitulo: "PRELIMINARES Y VARIOS", capitulo_orden: 1 },
    { capitulo: "PRELIMINARES Y VARIOS", capitulo_orden: 9001, orden_cambio_id: 5 },
    { capitulo: "ADICIONALES · OC-01", capitulo_orden: 9001 },
  ]);
  assert.equal(partidos.length, 1);
  assert.equal(partidos[0].capitulo, "PRELIMINARES Y VARIOS");
  assert.deepEqual(partidos[0].ordenes, [1, 9001]);
});

test("sin capitulos partidos no denuncia nada", () => {
  assert.deepEqual(capitulosPartidos([
    { capitulo: "PRELIMINARES Y VARIOS", capitulo_orden: 1 },
    { capitulo: "ADICIONALES · OC-01", capitulo_orden: 9001 },
  ]), []);
});
