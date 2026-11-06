import { test } from "node:test";
import assert from "node:assert/strict";
import { loQueFaltaAgrupar, esDeOrden, ORDEN_BASE } from "../src/modules/controlObra/agrupacionesDeOrdenes.js";

// ── CADA ORDEN APROBADA TIENE SU AGRUPACIÓN ────────────────────────────────
//
// "Las ODC que se han aprobado entran a presupuesto y a control de obra...
// también deberían aparecer en el dropdown de compras para poder asignar a
// esos rubros." No aparecían: en Compras se elige primero la agrupación, y los
// rubros de una orden entraban al control sin ninguna.

const actividades = [
  { id: 164, codigo: "01", nombre: "Gastos generales de obra" },
  { id: 165, codigo: "02", nombre: "Obra civil" },
  { id: 131, codigo: "16", nombre: "Honorarios" },
];
const ordenes = [
  { id: 5, numero: 1, codigo: "OC-01", titulo: "PISO PULIDO DE HORMIGON EN COLOR BLANCO", estado: "aprobada" },
  { id: 7, numero: 2, codigo: "OC-02", titulo: "Vinyl en cerramiento", estado: "enviada" },
  { id: 9, numero: 3, codigo: "OC-03", titulo: "RESANE Y PINTURA", estado: "aprobada" },
];
const deOrden = (id, ordenId, extra = {}) => ({
  id, origen: "orden_cambio", orden_cambio_id: ordenId, actividad_id: null,
  capitulo: `ADICIONALES · OC-0${ordenId === 5 ? 1 : 3}`, descripcion: `Partida ${id}`, ...extra,
});
const rubros = [
  { id: 1, origen: "base", capitulo: "OBRA CIVIL", descripcion: "Mampostería", actividad_id: 165 },
  deOrden(1433, 5), deOrden(1434, 5), deOrden(1440, 5, { descripcion: "(–) Piso de microcemento" }),
  deOrden(1443, 5, { capitulo: "HONORARIOS", descripcion: "Honorarios 10% sobre OC-01" }),
  deOrden(1444, 9), deOrden(1448, 9),
  deOrden(1450, 9, { capitulo: "HONORARIOS", descripcion: "Honorarios 10% sobre OC-03" }),
];

test("a cada orden aprobada se le arma su agrupación, con su código y su título, y van ahí sus partidas", () => {
  const plan = loQueFaltaAgrupar({ ordenes, rubros, actividades });
  assert.deepEqual(plan.crear, [
    { codigo: "OC-01", nombre: "PISO PULIDO DE HORMIGON EN COLOR BLANCO", orden: ORDEN_BASE + 1 },
    { codigo: "OC-03", nombre: "RESANE Y PINTURA", orden: ORDEN_BASE + 3 },
  ]);
  // Las que suman y la que resta: el total de la agrupación es el de la orden.
  assert.deepEqual(plan.mover, [
    { codigo: "OC-01", rubros: [1433, 1434, 1440] },
    { codigo: "OC-03", rubros: [1444, 1448] },
  ]);
  // La enviada todavía no puso nada en el control: no se le arma nada.
  assert.equal(plan.crear.some(x => x.codigo === "OC-02"), false);
});

test("el honorario de la orden va con el del contrato, si ese está en una agrupación; si no, se queda", () => {
  // En el Aéreo el honorario del contrato no está en ninguna agrupación.
  const sin = loQueFaltaAgrupar({ ordenes, rubros, actividades });
  assert.equal(sin.mover.some(m => m.rubros.includes(1443) || m.rubros.includes(1450)), false);
  // En Plaza Lagos sí: «16 · Honorarios».
  const conHonorarios = [...rubros, { id: 1098, origen: "base", capitulo: "HONORARIOS Y CARGOS", descripcion: "HONORARIOS DE ADMINISTRACION 10%", actividad_id: 131 }];
  const con = loQueFaltaAgrupar({ ordenes, rubros: conHonorarios, actividades });
  assert.deepEqual(con.mover.at(-1), { actividadId: 131, rubros: [1443, 1450] });
});

test("si la agrupación de la orden ya existe se usa esa, y no se crea otra", () => {
  const ya = [...actividades, { id: 300, codigo: "oc-01 ", nombre: "Piso pulido" }];
  const plan = loQueFaltaAgrupar({ ordenes, rubros, actividades: ya });
  assert.deepEqual(plan.crear.map(x => x.codigo), ["OC-03"]);
  assert.deepEqual(plan.mover[0], { actividadId: 300, rubros: [1433, 1434, 1440] });
});

test("lo que ya está en una agrupación no se toca: alguien lo puso ahí", () => {
  const mudado = rubros.map(r => (r.id === 1434 ? { ...r, actividad_id: 165 } : r));
  const plan = loQueFaltaAgrupar({ ordenes, rubros: mudado, actividades });
  assert.deepEqual(plan.mover[0], { codigo: "OC-01", rubros: [1433, 1440] });
  // Y con todo acomodado, no hay nada que hacer.
  const listo = rubros.map(r => ({ ...r, actividad_id: r.actividad_id ?? 300 }));
  assert.deepEqual(loQueFaltaAgrupar({ ordenes, rubros: listo, actividades }), { crear: [], mover: [] });
});

test("una modificación —OC-04-A— es de la 04 y va a su misma agrupación", () => {
  const os = [
    { id: 13, numero: 4, codigo: "OC-04", titulo: "Eléctrico", estado: "aprobada", reemplazada_at: "2026-11-10" },
    { id: 14, numero: 5, codigo: "OC-04-A", titulo: "Eléctrico, con el tablero", estado: "aprobada", revision_de: 13 },
  ];
  const rs = [deOrden(2001, 14, { capitulo: "ADICIONALES · OC-04-A" }), deOrden(2002, 14, { capitulo: "ADICIONALES · OC-04-A" })];
  // La 04 ya tenía su agrupación de cuando se aprobó.
  const plan = loQueFaltaAgrupar({ ordenes: os, rubros: rs, actividades: [{ id: 400, codigo: "OC-04", nombre: "Eléctrico" }] });
  assert.deepEqual(plan, { crear: [], mover: [{ actividadId: 400, rubros: [2001, 2002] }] });
  // Y si no la tenía, se crea una sola, con el número de la orden que modifica.
  const nueva = loQueFaltaAgrupar({ ordenes: os, rubros: rs, actividades: [] });
  assert.deepEqual(nueva.crear, [{ codigo: "OC-04", nombre: "Eléctrico, con el tablero", orden: ORDEN_BASE + 4 }]);
});

test("una orden anulada o reemplazada no arma agrupación, y una sin título igual tiene nombre", () => {
  const os = [
    { id: 20, numero: 6, codigo: "OC-06", titulo: "Anulada", estado: "aprobada", anulada: true },
    { id: 21, numero: 7, codigo: "OC-07", titulo: "  ", estado: "aprobada" },
  ];
  const rs = [deOrden(3001, 20), deOrden(3002, 21)];
  const plan = loQueFaltaAgrupar({ ordenes: os, rubros: rs, actividades: [] });
  assert.deepEqual(plan.crear, [{ codigo: "OC-07", nombre: "Orden de cambio", orden: ORDEN_BASE + 7 }]);
  assert.deepEqual(plan.mover, [{ codigo: "OC-07", rubros: [3002] }]);
  assert.deepEqual(loQueFaltaAgrupar(), { crear: [], mover: [] });
});

test("las agrupaciones de órdenes se reconocen para listarlas aparte", () => {
  assert.equal(esDeOrden({ codigo: "OC-01", origen: "orden_cambio" }), true);
  assert.equal(esDeOrden({ codigo: "OC-12" }), true);
  assert.equal(esDeOrden({ codigo: "Mis OC", origen: "orden_cambio" }), true, "aunque le cambien el código");
  assert.equal(esDeOrden({ codigo: "01", origen: "nova" }), false);
  assert.equal(esDeOrden({ codigo: "X1", origen: "manual" }), false);
  assert.equal(esDeOrden(null), false);
});
