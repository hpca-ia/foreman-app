import { test } from "node:test";
import assert from "node:assert/strict";
import { presupuestoActualizado, conIva, esperaFirma } from "../src/modules/controlObra/presupuestoActualizado.js";

// ── EL PRESUPUESTO ACTUALIZADO ─────────────────────────────────────────────
//
// El cliente pide "el presupuesto actualizado": el contrato, lo que las órdenes
// aprobadas le hicieron a cada rubro, y aparte lo que le harían las que todavía
// esperan firma. Una sola matriz en lugar de un presupuesto y cuatro órdenes
// que cada uno suma por su lado.

const rubro = (id, numero, cantidad, precio, extra = {}) => ({
  id, numero, descripcion: `Rubro ${numero}`, unidad: "U", cantidad, precio_unitario: precio,
  total_base: Math.round(cantidad * precio * 1.15 * 100) / 100, iva_pct: 15,
  capitulo: "ELÉCTRICO", capitulo_orden: 2, orden: numero, origen: "base", ...extra,
});
const rubros = [
  rubro(1, 1, 10, 100, { capitulo: "OBRA CIVIL", capitulo_orden: 1 }),
  rubro(106, 106, 65, 36.38),
  rubro(97, 97, 4, 9.79),
  rubro(50, 50, 0, 20),                                      // un renglón en cero del archivo
  // Lo que ya metió una orden aprobada al control no es parte del contrato.
  { id: 900, numero: 9101, descripcion: "Picado · OC-01", cantidad: 5, total_base: 575, iva_pct: 15, origen: "orden_cambio", orden_cambio_id: 1 },
];
const ordenes = [
  { id: 1, numero: 1, codigo: "OC-01", titulo: "Piso", estado: "aprobada" },
  { id: 4, numero: 4, codigo: "OC-04", titulo: "Eléctrico", estado: "enviada" },
  { id: 5, numero: 5, codigo: "OC-05", titulo: "En armado", estado: "borrador" },
  { id: 6, numero: 6, codigo: "OC-06", titulo: "Anulada", estado: "aprobada", anulada: true },
];
const lineasDeOrdenes = {
  1: [
    { id: 11, tipo: "aumenta", clase: "nuevo", item: "ADIC-01", descripcion: "Picado de masillado", unidad: "m2", cantidad: 5, precio_unitario: 100 },
    { id: 12, tipo: "aumenta", clase: "mas", obra_rubro_id: 1, rubro_codigo: "1", cantidad: 2, precio_unitario: 100 },
  ],
  4: [
    { id: 41, tipo: "aumenta", clase: "mas", obra_rubro_id: 106, cantidad: 46, precio_unitario: 36.38 },
    { id: 42, tipo: "quita", obra_rubro_id: 97, cantidad: 2, precio_unitario: 9.79 },
    { id: 43, tipo: "aumenta", clase: "nuevo", item: "ADIC-02", descripcion: "Tablero de control", unidad: "U", cantidad: 1, precio_unitario: 456 },
  ],
  5: [{ id: 51, tipo: "aumenta", clase: "mas", obra_rubro_id: 106, cantidad: 9, precio_unitario: 36.38 }],
  6: [{ id: 61, tipo: "aumenta", clase: "mas", obra_rubro_id: 106, cantidad: 100, precio_unitario: 36.38 }],
};
const obra = { honorarios_pct: 10 };
const filaDe = (m, numero) => m.capitulos.flatMap(c => c.filas).find(f => f.numero === String(numero));

test("la base es el contrato: sus rubros, en sus capítulos y en su orden, sin IVA", () => {
  const m = presupuestoActualizado({ rubros, ordenes: [], lineasDeOrdenes: {}, obra });
  assert.deepEqual(m.capitulos.map(c => c.nombre), ["OBRA CIVIL", "ELÉCTRICO"]);
  assert.deepEqual(m.capitulos[1].filas.map(f => f.numero), ["97", "106"], "el renglón en cero no va");
  assert.equal(filaDe(m, 106).base.total, 2364.7);
  assert.equal(filaDe(m, 106).precio, 36.38);
  assert.equal(m.totales.base, 3403.86);
  assert.equal(m.totales.vigente, m.totales.base, "sin órdenes, el vigente es la base");
  assert.equal(m.bloques.length, 0);
  assert.equal(m.iva, 15);
});

test("lo que una orden aprobada le hizo a un rubro va en su fila, y da el vigente", () => {
  const m = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra });
  const f = filaDe(m, 1);
  assert.equal(f.base.cantidad, 10);
  assert.deepEqual(f.aprobado, { cantidad: 2, total: 200, ordenes: ["OC-01"] });
  assert.deepEqual(f.vigente, { cantidad: 12, total: 1200 });
  assert.deepEqual(m.aprobadas, ["OC-01"], "la anulada no cuenta");
});

test("lo que espera firma va aparte: no mueve el vigente, sí el proyectado", () => {
  const m = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra });
  const luz = filaDe(m, 106);
  assert.deepEqual(luz.aprobado, { cantidad: 0, total: 0, ordenes: [] });
  assert.deepEqual(luz.vigente, { cantidad: 65, total: 2364.7 });
  assert.deepEqual(luz.porAprobar, { cantidad: 46, total: 1673.48, ordenes: ["OC-04"] });
  assert.deepEqual(luz.proyectado, { cantidad: 111, total: 4038.18 });
  // Una reducción resta, en cantidad y en plata.
  const doble = filaDe(m, 97);
  assert.deepEqual(doble.porAprobar, { cantidad: -2, total: -19.58, ordenes: ["OC-04"] });
  assert.deepEqual(doble.proyectado, { cantidad: 2, total: 19.58 });
  assert.deepEqual(m.porAprobar, ["OC-04"], "el borrador todavía no salió de la oficina");
});

test("lo que no estaba en el contrato va en el bloque de su orden, con su honorario", () => {
  const m = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra });
  assert.deepEqual(m.bloques.map(b => [b.orden.codigo, b.orden.columna]), [["OC-01", "aprobado"], ["OC-04", "porAprobar"]]);
  const [uno, cuatro] = m.bloques;
  assert.deepEqual(uno.filas.map(f => [f.descripcion, f.aprobado.total]),
    [["Picado de masillado", 500], ["Honorarios 10 % sobre OC-01", 70]]);
  // El honorario es sobre el neto de TODA la orden: los 500 nuevos y los 200 del rubro 1.
  assert.equal(uno.sub.aprobado, 570);
  assert.equal(uno.sub.vigente, 570);
  // OC-04: 1.673,48 + 456 − 19,58 = 2.109,90 de neto; su 10% son 210,99.
  assert.deepEqual(cuatro.filas.map(f => [f.descripcion, f.porAprobar.total]),
    [["Tablero de control", 456], ["Honorarios 10 % sobre OC-04", 210.99]]);
  assert.equal(cuatro.sub.vigente, 0, "nada de esto está en el contrato todavía");
});

test("los totales cierran: vigente es base más aprobadas, proyectado es vigente más lo que espera", () => {
  const m = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra });
  const t = m.totales;
  assert.equal(t.base, 3403.86);
  assert.equal(t.aprobado, 770, "200 del rubro 1, 500 nuevos y 70 de honorarios");
  assert.equal(t.vigente, 4173.86);
  assert.equal(t.porAprobar, 2320.89, "2.109,90 de neto más 210,99 de honorarios");
  assert.equal(t.proyectado, 6494.75);
  assert.equal(Math.round((t.base + t.aprobado) * 100) / 100, t.vigente);
  assert.equal(Math.round((t.vigente + t.porAprobar) * 100) / 100, t.proyectado);
  // Y cada capítulo y cada bloque suman a ese total.
  const partes = [...m.capitulos, ...m.bloques].reduce((s, x) => s + x.sub.proyectado, 0);
  assert.equal(Math.round(partes * 100) / 100, t.proyectado);
  assert.equal(conIva(t.vigente, m.iva), 4799.94);
});

test("los borradores entran en «por aprobar» solo si se pide", () => {
  assert.equal(esperaFirma({ estado: "borrador" }), false);
  assert.equal(esperaFirma({ estado: "borrador" }, true), true);
  assert.equal(esperaFirma({ estado: "enviada", reemplazada_at: "2026-11-05" }), false);
  const m = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra, conBorradores: true });
  assert.deepEqual(m.porAprobar, ["OC-04", "OC-05"]);
  assert.deepEqual(filaDe(m, 106).porAprobar, { cantidad: 55, total: 2000.9, ordenes: ["OC-04", "OC-05"] });
});

test("una modificación que espera firma cuenta por lo que cambia, no por entero", () => {
  // La OC-01 está aprobada: 2 de más en el rubro 1 y 5 m2 de picado. La
  // OC-01-A la modifica: 3 de más y el mismo picado. Si se aprueba, lo que
  // cambia es 1 unidad del rubro 1, no 3 más las 2 que ya estaban.
  const con = [...ordenes.slice(0, 1),
    { id: 7, numero: 1001, codigo: "OC-01-A", titulo: "Piso", estado: "enviada", revision_de: 1 }];
  const m = presupuestoActualizado({ rubros, ordenes: con, obra, lineasDeOrdenes: {
    ...lineasDeOrdenes,
    7: [
      { id: 71, tipo: "aumenta", clase: "nuevo", item: "ADIC-01", descripcion: "Picado de masillado", unidad: "m2", cantidad: 5, precio_unitario: 100 },
      { id: 72, tipo: "aumenta", clase: "mas", obra_rubro_id: 1, cantidad: 3, precio_unitario: 100 },
    ],
  } });
  const f = filaDe(m, 1);
  assert.deepEqual(f.vigente, { cantidad: 12, total: 1200 }, "hoy manda la OC-01");
  assert.equal(f.porAprobar.cantidad, 1);
  assert.equal(f.porAprobar.total, 100);
  assert.deepEqual(f.proyectado, { cantidad: 13, total: 1300 });
  // En el bloque de la modificación, lo nuevo entra y lo que reemplaza sale: neto, solo el honorario de la diferencia.
  const b = m.bloques.find(x => x.orden.codigo === "OC-01-A");
  assert.equal(b.sub.porAprobar, 10, "500 que entran, 500 que salen, y 80 de honorarios contra los 70 de antes");
  assert.equal(m.totales.proyectado, Math.round((m.totales.vigente + 110) * 100) / 100);
});

test("un rubro que una orden vieja tachó entero sale del vigente", () => {
  const con = rubros.map(r => (r.id === 97 ? { ...r, anulado_por_oc: 1 } : r));
  const m = presupuestoActualizado({ rubros: con, ordenes, lineasDeOrdenes: { 1: lineasDeOrdenes[1] }, obra });
  const f = filaDe(m, 97);
  assert.deepEqual(f.aprobado, { cantidad: -4, total: -39.16, ordenes: ["OC-01"] });
  assert.deepEqual(f.vigente, { cantidad: 0, total: 0 });
});
