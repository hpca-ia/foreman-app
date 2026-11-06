import { test } from "node:test";
import assert from "node:assert/strict";
import { presupuestoActualizado, conIva, esperaFirma, aclaracionDelBloque, renglonesDeLaMatriz }
  from "../src/modules/controlObra/presupuestoActualizado.js";

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

test("lo que no estaba en el contrato va en el bloque de su orden", () => {
  const m = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra });
  assert.deepEqual(m.bloques.map(b => [b.orden.codigo, b.orden.columna]), [["OC-01", "aprobado"], ["OC-04", "porAprobar"]]);
  const [uno, cuatro] = m.bloques;
  assert.deepEqual(uno.filas.map(f => [f.descripcion, f.aprobado.total]), [["Picado de masillado", 500]]);
  assert.equal(uno.sub.aprobado, 500);
  assert.deepEqual(cuatro.filas.map(f => [f.descripcion, f.porAprobar.total]), [["Tablero de control", 456]]);
  assert.equal(cuatro.sub.vigente, 0, "nada de esto está en el contrato todavía");
});

test("los honorarios de cada orden van al rubro de honorarios, que muestra su nuevo total", () => {
  // El contrato trae su rubro de honorarios: 10% sobre los 3.403,86 de la obra.
  const honor = { id: 9191, numero: 9191, descripcion: "Honorarios de administración (10 %)", unidad: "glb", cantidad: 1,
    precio_unitario: 340.39, total_base: 391.45, iva_pct: 15, capitulo: "HONORARIOS", capitulo_orden: 9, orden: 9191, origen: "base" };
  const m = presupuestoActualizado({ rubros: [...rubros, honor], ordenes, lineasDeOrdenes, obra });
  const f = filaDe(m, 9191);
  assert.equal(f.honorario, true);
  assert.equal(f.base.total, 340.39);
  // OC-01, aprobada: 10% de sus 700 de neto. OC-04, que espera: 10% de 2.109,90.
  assert.deepEqual(f.aprobado, { cantidad: 0, total: 70, ordenes: ["OC-01"] });
  assert.deepEqual(f.vigente, { cantidad: 1, total: 410.39 });
  assert.deepEqual(f.porAprobar, { cantidad: 0, total: 210.99, ordenes: ["OC-04"] });
  assert.deepEqual(f.proyectado, { cantidad: 1, total: 621.38 });
  assert.deepEqual(m.capitulos.map(c => c.nombre), ["OBRA CIVIL", "ELÉCTRICO", "HONORARIOS"]);
  // Y ninguna orden lleva su honorario suelto en su bloque.
  assert.ok(m.bloques.every(b => b.filas.every(x => !/honorario/i.test(x.descripcion))));
});

test("si el contrato no tiene rubro de honorarios, se abre uno: el honorario de una orden no puede no estar", () => {
  const m = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra });
  const cap = m.capitulos[m.capitulos.length - 1];
  assert.equal(cap.nombre, "HONORARIOS");
  assert.equal(cap.filas[0].descripcion, "Honorarios de administración (10 %)");
  assert.equal(cap.filas[0].base.total, 0);
  assert.equal(cap.filas[0].aprobado.total, 70);
  assert.equal(cap.filas[0].porAprobar.total, 210.99);
  // Sin órdenes con honorario y sin ajustes, no se abre nada.
  assert.deepEqual(presupuestoActualizado({ rubros, obra }).capitulos.map(c => c.nombre), ["OBRA CIVIL", "ELÉCTRICO"]);
});

test("cada orden dice cuánto vale entera, como en su papel, y dónde está cada parte", () => {
  const m = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra });
  const [uno, cuatro] = m.ordenes;
  assert.deepEqual([uno.codigo, uno.estado, uno.adiciones, uno.reducciones, uno.neto, uno.honorarios, uno.subtotal, uno.iva, uno.total],
    ["OC-01", "APROBADA", 700, 0, 700, 70, 770, 115.5, 885.5]);
  assert.deepEqual([cuatro.codigo, cuatro.estado, cuatro.neto, cuatro.honorarios, cuatro.subtotal, cuatro.total],
    ["OC-04", "POR APROBAR", 2109.9, 210.99, 2320.89, 2669.02]);
  // Lo que suman las órdenes es lo que la matriz les atribuye.
  assert.equal(m.ordenesAprobadas.subtotal, m.totales.aprobado);
  assert.equal(m.ordenesPorAprobar.subtotal, m.totales.porAprobar);
  // El bloque de la OC-04 no es la orden entera: tiene 456 de 2.320,89.
  const b = m.bloques.find(x => x.orden.codigo === "OC-04").orden;
  assert.deepEqual([b.valor, b.enRubros, b.honorarios, b.enBloque], [2320.89, 1653.9, 210.99, 456]);
  const dice = aclaracionDelBloque(b);
  assert.match(dice, /La orden vale \$2\.320,89 sin IVA/);
  assert.match(dice, /\$1\.653,90 son cambios de cantidad en rubros del contrato/);
  assert.match(dice, /\$210,99 son sus honorarios/);
  assert.match(dice, /\$456,00 es lo que no estaba en el contrato/);
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
  // En el bloque de la modificación, lo nuevo entra y lo que reemplaza sale: no cambia nada.
  const b = m.bloques.find(x => x.orden.codigo === "OC-01-A");
  assert.equal(b.sub.porAprobar, 0, "500 que entran y 500 que salen");
  // Y el honorario cambia por la diferencia: 80 de la nueva contra los 70 de la anterior.
  const honor = m.capitulos.flatMap(c => c.filas).find(x => x.honorario);
  assert.equal(honor.porAprobar.total, 10);
  assert.equal(m.totales.proyectado, Math.round((m.totales.vigente + 110) * 100) / 100);
});

test("un rubro que una orden vieja tachó entero sale del vigente", () => {
  const con = rubros.map(r => (r.id === 97 ? { ...r, anulado_por_oc: 1 } : r));
  const m = presupuestoActualizado({ rubros: con, ordenes, lineasDeOrdenes: { 1: lineasDeOrdenes[1] }, obra });
  const f = filaDe(m, 97);
  assert.deepEqual(f.aprobado, { cantidad: -4, total: -39.16, ordenes: ["OC-01"] });
  assert.deepEqual(f.vigente, { cantidad: 0, total: 0 });
});

// ── LO QUE SE PROYECTA A MANO ──────────────────────────────────────────────
//
// Más o menos cantidad de un rubro, o sacarlo, para ver cómo quedaría el
// presupuesto. Y los honorarios se mueven solos: administrar menos obra es
// menos honorario.

test("un ajuste a mano mueve el proyectado de su rubro, al precio del contrato", () => {
  const m = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra, ajustes: { 106: -5, 1: 3 } });
  const luz = filaDe(m, 106);
  assert.deepEqual(luz.manual, { cantidad: -5, total: -181.9, ordenes: [] });
  assert.deepEqual(luz.vigente, { cantidad: 65, total: 2364.7 }, "el vigente no se toca: es el contrato");
  assert.deepEqual(luz.proyectado, { cantidad: 106, total: 3856.28 }, "65 del contrato, 46 por aprobar, 5 que se sacan");
  assert.deepEqual(filaDe(m, 1).manual, { cantidad: 3, total: 300, ordenes: [] });
});

test("los honorarios siguen al ajuste: el porcentaje del contrato sobre lo que se sumó y se restó", () => {
  const m = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra, ajustes: { 106: -5, 1: 3 } });
  // −181,90 y +300: 118,10 de neto, y su 10% son 11,81 de honorarios.
  assert.deepEqual(m.ajuste, { hay: true, neto: 118.1, honorarios: 11.81, total: 129.91 });
  const honor = m.capitulos.flatMap(c => c.filas).find(x => x.honorario);
  assert.equal(honor.manual.total, 11.81);
  assert.equal(honor.manual.calculado, true, "no lo escribió nadie: sale de la cuenta");
  assert.equal(m.totales.manual, 129.91);
  assert.equal(m.totales.proyectado, Math.round((m.totales.vigente + m.totales.porAprobar + 129.91) * 100) / 100);
  // Sacar un rubro entero baja también su honorario.
  const sin = presupuestoActualizado({ rubros, obra, ajustes: { 1: -10 } });
  assert.deepEqual(sin.ajuste, { hay: true, neto: -1000, honorarios: -100, total: -1100 });
  assert.deepEqual(filaDe(sin, 1).proyectado, { cantidad: 0, total: 0 });
});

test("sin honorarios en el contrato, el ajuste no inventa ninguno; y un ajuste a nada no hace nada", () => {
  const m = presupuestoActualizado({ rubros, obra: { honorarios_pct: 0 }, ajustes: { 1: 2, 999: 5, 106: 0 } });
  assert.deepEqual(m.ajuste, { hay: true, neto: 200, honorarios: 0, total: 200 });
  assert.deepEqual(m.capitulos.map(c => c.nombre), ["OBRA CIVIL", "ELÉCTRICO"]);
  assert.equal(presupuestoActualizado({ rubros, obra }).ajuste.hay, false);
});

test("el rubro de honorarios no se ajusta a mano: se calcula", () => {
  const honor = { id: 9191, numero: 9191, descripcion: "Honorarios de administración (10 %)", unidad: "glb", cantidad: 1,
    precio_unitario: 340.39, total_base: 391.45, iva_pct: 15, capitulo: "HONORARIOS", capitulo_orden: 9, orden: 9191, origen: "base" };
  const m = presupuestoActualizado({ rubros: [...rubros, honor], obra, ajustes: { 9191: -1, 1: 1 } });
  assert.deepEqual(m.ajuste, { hay: true, neto: 100, honorarios: 10, total: 110 });
  assert.equal(filaDe(m, 9191).manual.total, 10);
});

test("los renglones de la matriz traen el ajuste y cierran al pie", () => {
  const m = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra, ajustes: { 1: 3 } });
  const pies = renglonesDeLaMatriz(m).filter(r => r.tipo === "pie");
  assert.deepEqual(pies.map(p => p.etiqueta), ["SUBTOTAL, SIN IVA", "IVA 15 %", "TOTAL"]);
  assert.equal(pies[0].valores.manual, 330, "300 del rubro y 30 de su honorario");
  assert.equal(pies[2].valores.manual, 379.5);
  assert.equal(pies[2].valores.proyectado, conIva(m.totales.proyectado, 15));
});
