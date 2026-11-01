import test from "node:test";
import assert from "node:assert/strict";
import { cuadreDeUnaOrden, cuadreDeOrdenes, comoSeDice } from "../src/modules/controlObra/cuadreDeOrdenes.js";

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
const rubros = [
  { capitulo: "ADICIONALES · OC-01", total_base: 10830.23 },
  { capitulo: "ADICIONALES · OC-01", total_base: 879.61 },
  { capitulo: "ADICIONALES · OC-01", total_base: 511.28 },
  { capitulo: "ADICIONALES · OC-01", total_base: -8658.68 },
  { capitulo: "PRELIMINARES Y VARIOS", total_base: 287.50 },
  { capitulo: "HONORARIOS", descripcion: "Honorarios 10% sobre OC-01", total_base: 385.00 },
];

test("un capitulo no es una orden: sus lineas caen en capitulos distintos", () => {
  // El capitulo que lleva el nombre de la orden dice $3.562,44 y la orden puso
  // $4.234,94 en el control, repartidos en tres capitulos. Leer el capitulo
  // como si fuera la orden es el error que esto evita.
  const c = cuadreDeUnaOrden({ orden, lineas, rubros, obra, iva: 15 });
  assert.equal(c.enControl, 4234.94);
  assert.equal(c.capitulos.length, 3);
  assert.equal(c.capitulos.find(x => x.capitulo === "ADICIONALES · OC-01").total, 3562.44);
  assert.equal(c.cuadra, true);
});

test("los centavos del redondeo no son un error", () => {
  // Cada rubro se guarda con IVA y redondeado, asi que cinco lineas pueden
  // separarse unos centavos del total calculado de una vez.
  const c = cuadreDeUnaOrden({ orden, lineas, rubros, obra, iva: 15 });
  assert.ok(Math.abs(c.diferencia) <= 0.06, `diferencia ${c.diferencia}`);
  assert.equal(c.problema, null);
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
