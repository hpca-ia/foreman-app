import { test } from "node:test";
import assert from "node:assert/strict";
import { presupuestoActualizado, conIva, esperaFirma, aclaracionDelBloque, renglonesDeLaMatriz, nuevosLimpios, BLOQUE_PROYECTADO,
  ajustesLimpios, nuevosDe, loQueSeGuarda, CLAVE_NUEVOS, pesosDelPapel }
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
  assert.deepEqual(m.ajuste, { hay: true, neto: 118.1, enRubros: 118.1, enNuevos: 0, cuantosNuevos: 0, honorarios: 11.81, total: 129.91 });
  const honor = m.capitulos.flatMap(c => c.filas).find(x => x.honorario);
  assert.equal(honor.manual.total, 11.81);
  assert.equal(honor.manual.calculado, true, "no lo escribió nadie: sale de la cuenta");
  assert.equal(m.totales.manual, 129.91);
  assert.equal(m.totales.proyectado, Math.round((m.totales.vigente + m.totales.porAprobar + 129.91) * 100) / 100);
  // Sacar un rubro entero baja también su honorario.
  const sin = presupuestoActualizado({ rubros, obra, ajustes: { 1: -10 } });
  assert.deepEqual(sin.ajuste, { hay: true, neto: -1000, enRubros: -1000, enNuevos: 0, cuantosNuevos: 0, honorarios: -100, total: -1100 });
  assert.deepEqual(filaDe(sin, 1).proyectado, { cantidad: 0, total: 0 });
});

test("sin honorarios en el contrato, el ajuste no inventa ninguno; y un ajuste a nada no hace nada", () => {
  const m = presupuestoActualizado({ rubros, obra: { honorarios_pct: 0 }, ajustes: { 1: 2, 999: 5, 106: 0 } });
  assert.deepEqual(m.ajuste, { hay: true, neto: 200, enRubros: 200, enNuevos: 0, cuantosNuevos: 0, honorarios: 0, total: 200 });
  assert.deepEqual(m.capitulos.map(c => c.nombre), ["OBRA CIVIL", "ELÉCTRICO"]);
  assert.equal(presupuestoActualizado({ rubros, obra }).ajuste.hay, false);
});

test("el rubro de honorarios no se ajusta a mano: se calcula", () => {
  const honor = { id: 9191, numero: 9191, descripcion: "Honorarios de administración (10 %)", unidad: "glb", cantidad: 1,
    precio_unitario: 340.39, total_base: 391.45, iva_pct: 15, capitulo: "HONORARIOS", capitulo_orden: 9, orden: 9191, origen: "base" };
  const m = presupuestoActualizado({ rubros: [...rubros, honor], obra, ajustes: { 9191: -1, 1: 1 } });
  assert.deepEqual(m.ajuste, { hay: true, neto: 100, enRubros: 100, enNuevos: 0, cuantosNuevos: 0, honorarios: 10, total: 110 });
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

// ── LOS RUBROS QUE TODAVÍA NO SON DE NADIE ─────────────────────────────────
//
// "Quiero poder agregar rubros a mano que no están en una orden de cambio y
// todavía no se cotizan, pero proyectan el presupuesto. Pueden ir al final."
// Un trabajo que se sabe que viene: ni contrato ni orden, una estimación.

const nuevos = [
  { id: "a", descripcion: "Letrero luminoso de fachada", unidad: "glb", cantidad: "1", precio: "2500" },
  { id: "b", descripcion: "Cortinas enrollables", unidad: "u", cantidad: "6", precio: "180,5" },   // mal escrito: no es un número
  { id: "c", descripcion: "Cortinas enrollables", unidad: "u", cantidad: 6, precio: 180.5 },
  { id: "d", descripcion: "", unidad: "", cantidad: "", precio: "" },                                // se abrió y no se llenó
];

test("los rubros escritos a mano se limpian: números, y fuera los renglones vacíos", () => {
  const l = nuevosLimpios(nuevos);
  // El vacío no va. El que tiene descripción y un precio que no se entiende sí:
  // "falta cotizar" también es un dato, y va en cero hasta que tenga número.
  assert.deepEqual(l.map(x => x.id), ["a", "b", "c"]);
  assert.deepEqual(l[0], { id: "a", descripcion: "Letrero luminoso de fachada", unidad: "glb", cantidad: 1, precio: 2500 });
  assert.equal(l[1].precio, 0);
  assert.deepEqual(nuevosLimpios(null), []);
  assert.deepEqual(nuevosLimpios("cualquier cosa"), []);
});

test("un rubro escrito a mano va al final, suma solo al proyectado y no toca ni la base ni el vigente", () => {
  const sin = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra });
  const m = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra, nuevos: [nuevos[0], nuevos[2]] });
  assert.equal(m.proyectados.filas.length, 2);
  const [letrero, cortinas] = m.proyectados.filas;
  assert.equal(letrero.numero, "P-01");
  assert.equal(letrero.descripcion, "Letrero luminoso de fachada");
  assert.deepEqual(letrero.base, { cantidad: 0, total: 0 });
  assert.deepEqual(letrero.vigente, { cantidad: 0, total: 0 });
  assert.equal(letrero.manual.total, 2500);
  assert.equal(letrero.proyectado.total, 2500);
  assert.equal(cortinas.numero, "P-02");
  assert.equal(cortinas.manual.total, 1083);
  assert.equal(m.proyectados.sub.manual, 3583);
  // Lo firmado y lo aprobado no se movieron un centavo.
  assert.equal(m.totales.base, sin.totales.base);
  assert.equal(m.totales.aprobado, sin.totales.aprobado);
  assert.equal(m.totales.vigente, sin.totales.vigente);
  assert.equal(m.totales.porAprobar, sin.totales.porAprobar);
  // Y el proyectado sube por lo escrito más su honorario: 3.583 + 10 %.
  assert.equal(m.totales.manual, 3941.3);
  assert.equal(m.totales.proyectado, Math.round((sin.totales.proyectado + 3941.3) * 100) / 100);
});

test("los rubros a mano arrastran honorarios como cualquier otro trabajo, y se suman con los ajustes de cantidad", () => {
  const m = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra, ajustes: { 1: 3 }, nuevos: [nuevos[0]] });
  // 3 × 100 en un rubro del contrato + 2.500 de un rubro nuevo; 10 % de los dos.
  assert.deepEqual(m.ajuste, { hay: true, neto: 2800, enRubros: 300, enNuevos: 2500, cuantosNuevos: 1, honorarios: 280, total: 3080 });
  const sinHonorarios = presupuestoActualizado({ rubros, obra: { honorarios_pct: 0 }, nuevos: [nuevos[0]] });
  assert.equal(sinHonorarios.ajuste.honorarios, 0);
  assert.equal(sinHonorarios.totales.manual, 2500);
});

test("un rubro a mano todavía sin precio se lista igual, en cero: falta cotizar también es un dato", () => {
  const m = presupuestoActualizado({ rubros, obra, nuevos: [{ id: "x", descripcion: "Señalética", unidad: "glb", cantidad: 1, precio: "" }] });
  assert.equal(m.proyectados.filas.length, 1);
  assert.equal(m.proyectados.filas[0].manual.total, 0);
  assert.equal(m.ajuste.hay, true);
  assert.equal(m.ajuste.neto, 0);
  // Y sin nada escrito, no hay bloque ni ajuste.
  const nada = presupuestoActualizado({ rubros, obra, nuevos: [nuevos[3]] });
  assert.equal(nada.proyectados.filas.length, 0);
  assert.equal(nada.ajuste.hay, false);
});

test("en la matriz van después de las órdenes, en su bloque, y el pie los suma", () => {
  const m = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra, nuevos: [nuevos[0]] });
  const r = renglonesDeLaMatriz(m);
  const bloques = r.filter(x => x.tipo === "bloque");
  const ultimo = bloques[bloques.length - 1];
  assert.equal(ultimo.nombre, BLOQUE_PROYECTADO);
  assert.equal(ultimo.estado, "ESTIMADO");
  assert.equal(ultimo.manual, true);
  assert.match(ultimo.aclaracion, /no son parte del contrato ni de ninguna orden/);
  assert.equal(ultimo.sub.manual, 2500);
  // Es lo último antes del pie.
  const i = r.indexOf(ultimo);
  assert.equal(r[i + 1].tipo, "fila");
  assert.equal(r[i + 1].descripcion, "Letrero luminoso de fachada");
  assert.equal(r[i + 2].tipo, "pie");
  const pie = r.find(x => x.tipo === "pie");
  assert.equal(pie.valores.manual, 2750);
  // Sin rubros a mano, la matriz es la de siempre.
  assert.equal(renglonesDeLaMatriz(presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra })).some(x => x.tipo === "bloque" && x.manual), false);
});

test("una simulación guarda los ajustes por rubro y los rubros nuevos en un solo dato, y los devuelve iguales", () => {
  const guardado = loQueSeGuarda({ 106: "-5", 1: "3", 50: "0", 97: "" }, nuevos);
  // Los ajustes en cero o vacíos no se guardan; los rubros nuevos van bajo su clave.
  assert.deepEqual(Object.keys(guardado).sort(), ["1", "106", CLAVE_NUEVOS].sort());
  assert.equal(guardado[106], -5);
  assert.equal(guardado[CLAVE_NUEVOS].length, 3);
  // Al abrirla: los ajustes por un lado, sin la clave de los nuevos…
  assert.deepEqual(ajustesLimpios(guardado), { 1: 3, 106: -5 });
  // …y los rubros nuevos por el otro, como se escribieron.
  assert.deepEqual(nuevosDe(guardado).map(x => x.descripcion), ["Letrero luminoso de fachada", "Cortinas enrollables", "Cortinas enrollables"]);
  // Guardar lo que se abrió da lo mismo: así se sabe si hay algo sin guardar.
  assert.deepEqual(loQueSeGuarda(ajustesLimpios(guardado), nuevosDe(guardado)), guardado);
  // Una simulación de antes, sin rubros nuevos, se lee igual que siempre.
  assert.deepEqual(nuevosDe({ 106: -5 }), []);
  assert.deepEqual(loQueSeGuarda({ 106: -5 }, []), { 106: -5 });
  assert.deepEqual(nuevosDe(null), []);
  // Y la clave de los nuevos nunca se lee como el ajuste de un rubro.
  const m = presupuestoActualizado({ rubros, obra, ajustes: guardado });
  assert.equal(m.ajuste.enRubros, 118.1);
  assert.equal(m.ajuste.cuantosNuevos, 0);
});

// ── EL PIE NO RECALCULA EL IVA: USA EL DE CADA PAPEL ───────────────────────
//
// En el mismo PDF, el cuadro de órdenes decía $4.599,50 y el pie de la matriz
// $4.599,51. Cada orden redondea su IVA en su documento, que es el que el
// cliente firma; sumar los subtotales y multiplicar de nuevo da otro centavo.

const unRubro = (id, sinIva, extra = {}) => ({
  id, numero: id, descripcion: `Rubro ${id}`, unidad: "glb", cantidad: 1, precio_unitario: sinIva,
  total_base: Math.round(sinIva * 1.15 * 100) / 100, iva_pct: 15,
  capitulo: "OBRA", capitulo_orden: 1, orden: id, origen: "base", ...extra,
});
const deUnaLinea = (id, monto) => [{ id, tipo: "aumenta", clase: "nuevo", item: `ADIC-${id}`, descripcion: "Trabajo nuevo", unidad: "glb", cantidad: 1, precio_unitario: monto }];
const pieDe = m => {
  const pies = renglonesDeLaMatriz(m).filter(r => r.tipo === "pie");
  return { sub: pies[0].valores, iva: pies[1]?.valores, total: pies[pies.length - 1].valores };
};

test("dos órdenes aprobadas: el pie suma el IVA de cada una, como el cuadro de órdenes (Diners Aéreo)", () => {
  // OC-01: 3.347,76 + 10 % = 3.682,54 → IVA 552,38.  OC-03: 288,21 + 10 % = 317,03 → IVA 47,55.
  // La suma de los IVA es 599,93; el 15 % de 3.999,57 es 599,94.
  const m = presupuestoActualizado({
    rubros: [unRubro(1, 1000)], obra: { honorarios_pct: 10 },
    ordenes: [{ id: 1, numero: 1, codigo: "OC-01", estado: "aprobada" }, { id: 3, numero: 3, codigo: "OC-03", estado: "aprobada" }],
    lineasDeOrdenes: { 1: deUnaLinea(11, 3347.76), 3: deUnaLinea(31, 288.21) },
  });
  assert.equal(m.ordenesAprobadas.subtotal, 3999.57);
  assert.equal(m.ordenesAprobadas.iva, 599.93);
  assert.equal(m.ordenesAprobadas.total, 4599.5);
  const pie = pieDe(m);
  assert.equal(pie.sub.aprobado, 3999.57);
  assert.equal(pie.iva.aprobado, 599.93, "no 599,94: el IVA es el de las órdenes");
  assert.equal(pie.total.aprobado, m.ordenesAprobadas.total);
  // Y el vigente es la base con su IVA más las órdenes con el suyo.
  assert.equal(pie.total.base, 1150);
  assert.equal(pie.total.vigente, 5749.5);
  assert.equal(pie.total.proyectado, 5749.5);
  // Las tarjetas de la pantalla leen el mismo número.
  assert.equal(m.totalesConIva.aprobado, 4599.5);
});

test("una sola orden también se separaba un centavo: el pie usa su IVA, no otra fórmula (Plaza Lagos)", () => {
  // 1.726,64 + 10 % = 1.899,30. Su IVA en la orden es 284,90; 1.899,30 × 1,15
  // redondea a 2.184,19 por medio centavo de coma flotante.
  const m = presupuestoActualizado({
    rubros: [unRubro(1, 1000)], obra: { honorarios_pct: 10 },
    ordenes: [{ id: 6, numero: 1, codigo: "OC-01", estado: "aprobada" }],
    lineasDeOrdenes: { 6: deUnaLinea(61, 1726.64) },
  });
  assert.equal(m.ordenesAprobadas.total, 2184.2);
  const pie = pieDe(m);
  assert.equal(pie.iva.aprobado, 284.9);
  assert.equal(pie.total.aprobado, 2184.2);
});

test("las que esperan firma llevan en el pie el mismo total que en el cuadro de órdenes", () => {
  const m = presupuestoActualizado({
    rubros: [unRubro(1, 1000)], obra: { honorarios_pct: 10 },
    ordenes: [{ id: 1, numero: 1, codigo: "OC-01", estado: "enviada" }, { id: 3, numero: 3, codigo: "OC-03", estado: "enviada" }],
    lineasDeOrdenes: { 1: deUnaLinea(11, 3347.76), 3: deUnaLinea(31, 288.21) },
  });
  const pie = pieDe(m);
  assert.equal(pie.total.porAprobar, m.ordenesPorAprobar.total);
  assert.equal(pie.total.porAprobar, 4599.5);
  // No suman al vigente, sí al proyectado.
  assert.equal(pie.total.vigente, 1150);
  assert.equal(pie.total.proyectado, 5749.5);
});

test("la base con IVA es la del control, que es la del presupuesto firmado al centavo", () => {
  // Al activar la obra, los centavos que sobran van al rubro más grande: la
  // suma de los rubros con IVA es el total del presupuesto, y eso va al pie.
  const rs = [unRubro(1, 17875, { total_base: 20556.28 }), unRubro(2, 207.9, { total_base: 239.07 }), unRubro(3, 207.9, { total_base: 239.07 })];
  const m = presupuestoActualizado({ rubros: rs, obra: { honorarios_pct: 10 } });
  const pie = pieDe(m);
  assert.equal(pie.total.base, 21034.42);
  assert.equal(pie.iva.base, Math.round((21034.42 - pie.sub.base) * 100) / 100);
  assert.equal(pie.sub.base + pie.iva.base, pie.total.base);
  assert.equal(pie.total.vigente, 21034.42);
});

test("lo que una orden vieja tachó entero no tiene partidas: su IVA va por el resto de la columna", () => {
  const m = presupuestoActualizado({
    rubros: [unRubro(1, 1000), unRubro(2, 100, { anulado_por_oc: 9 })], obra: { honorarios_pct: 0 },
    ordenes: [{ id: 9, numero: 1, codigo: "OC-01", estado: "aprobada" }], lineasDeOrdenes: {},
  });
  const pie = pieDe(m);
  assert.equal(pie.sub.aprobado, -100);
  assert.equal(pie.iva.aprobado, -15);
  assert.equal(pie.total.aprobado, -115);
  assert.equal(pie.total.vigente, 1150);
});

test("el ajuste a mano lleva su IVA como lo llevaría una orden, y una obra sin IVA cierra sin él", () => {
  const m = presupuestoActualizado({ rubros: [unRubro(1, 1000)], obra: { honorarios_pct: 10 }, nuevos: [{ id: "a", descripcion: "Letrero", cantidad: 1, precio: 1726.64 }] });
  // 1.726,64 + 10 % = 1.899,30 → IVA 284,90: lo mismo que diría la orden el día que exista.
  assert.equal(m.totales.manual, 1899.3);
  assert.equal(m.ivas.manual, 284.9);
  assert.equal(m.totalesConIva.manual, 2184.2);
  const sinIva = presupuestoActualizado({ rubros: [unRubro(1, 1000, { iva_pct: 0, total_base: 1000 })], obra: { honorarios_pct: 0 } });
  assert.equal(sinIva.iva, 0);
  assert.deepEqual(sinIva.totalesConIva, sinIva.totales);
  assert.equal(renglonesDeLaMatriz(sinIva).filter(r => r.tipo === "pie").length, 1);
});

test("la plata del papel lleva su signo de dólar, siempre", () => {
  // Un reemplazo de texto se comió el «$» de los totales del PDF y salió
  // publicado así: "TOTAL 189.340,00". En un papel para el cliente, no.
  assert.equal(pesosDelPapel(189340), "$189.340,00");
  assert.equal(pesosDelPapel(4599.5), "$4.599,50");
  assert.equal(pesosDelPapel(-115), "-$115,00");
  assert.equal(pesosDelPapel(0), "$0,00");
  assert.equal(pesosDelPapel("no es un número"), "$0,00");
});

// ── LA PROYECCIÓN SE GUARDA SOLA ───────────────────────────────────────────
//
// "Hago cambios en la matriz y no se está guardando." Había que ponerle nombre
// y apretar un botón; en la base no quedó ni una. Ahora cada cambio se guarda
// solo, y esta es la pregunta que decide cuándo hay algo que guardar.

test("una proyección nueva y vacía no es nada que guardar; con algo escrito, sí", async () => {
  const { faltaGuardar } = await import("../src/modules/controlObra/presupuestoActualizado.js");
  assert.equal(faltaGuardar({}), false);
  assert.equal(faltaGuardar({ abierta: null, ajustes: {}, nuevos: [], nombre: "Con nombre y nada más" }), false);
  // Un cero, un vacío o un renglón sin llenar tampoco son un cambio.
  assert.equal(faltaGuardar({ ajustes: { 106: "0", 97: "" }, nuevos: [{ id: "a", descripcion: "", cantidad: "1", precio: "" }] }), false);
  assert.equal(faltaGuardar({ ajustes: { 106: "-5" } }), true);
  assert.equal(faltaGuardar({ nuevos: [{ id: "a", descripcion: "Letrero", cantidad: "1", precio: "" }] }), true);
});

test("con una abierta, falta guardar solo cuando lo escrito ya no es lo guardado", async () => {
  const { faltaGuardar } = await import("../src/modules/controlObra/presupuestoActualizado.js");
  // Como vuelve de la base: los números como números, las claves en otro orden.
  const abierta = { id: 3, nombre: "Proyección", ajustes: {
    106: -5, 1: 3,
    [CLAVE_NUEVOS]: [{ precio: 2500, unidad: "glb", cantidad: 1, id: "a", descripcion: "Letrero" }],
  } };
  const igual = { abierta, ajustes: { 1: "3", 106: "-5" }, nuevos: [{ id: "a", descripcion: "Letrero", unidad: "glb", cantidad: "1", precio: "2500" }], nombre: "Proyección" };
  assert.equal(faltaGuardar(igual), false, "un 5 escrito y un 5 guardado no son un cambio");
  assert.equal(faltaGuardar({ ...igual, ajustes: { 1: "3", 106: "-6" } }), true);
  assert.equal(faltaGuardar({ ...igual, ajustes: { 1: "3" } }), true, "sacar un ajuste también se guarda");
  // Editar un rubro proyectado, y borrarlo: las dos cosas se guardan.
  assert.equal(faltaGuardar({ ...igual, nuevos: [{ ...igual.nuevos[0], precio: "2800" }] }), true);
  assert.equal(faltaGuardar({ ...igual, nuevos: [] }), true);
  // El nombre: cambiarlo se guarda; borrarlo no lo cambia.
  assert.equal(faltaGuardar({ ...igual, nombre: "Con lo que viene" }), true);
  assert.equal(faltaGuardar({ ...igual, nombre: "   " }), false);
});

test("una proyección que nadie nombró nace con un nombre, sin repetir", async () => {
  const { nombrePorDefecto } = await import("../src/modules/controlObra/presupuestoActualizado.js");
  assert.equal(nombrePorDefecto([]), "Proyección");
  assert.equal(nombrePorDefecto([{ nombre: "Ahorro" }]), "Proyección");
  assert.equal(nombrePorDefecto([{ nombre: "proyección " }]), "Proyección 2");
  assert.equal(nombrePorDefecto([{ nombre: "Proyección" }, { nombre: "Proyección 2" }]), "Proyección 3");
  assert.equal(nombrePorDefecto(null), "Proyección");
});
