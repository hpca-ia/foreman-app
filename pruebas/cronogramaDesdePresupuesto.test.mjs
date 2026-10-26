import test from "node:test";
import assert from "node:assert/strict";
import { capitulosComoAgrupaciones, planDelPresupuesto, presupuestoDeReferencia }
  from "../src/modules/cronograma/presupuestoComoObra.js";

// EL CRONOGRAMA DE UNA COTIZACIÓN: sale del presupuesto, sin obra.

const items = [
  { capitulo: "ACABADOS", descripcion: "Pintura interior", unidad: "M2", cantidad: 300, total: 1500, orden: 3001 },
  { capitulo: "OBRA GRIS", descripcion: "Mampostería de bloque", unidad: "m²", cantidad: 420, total: 8400, orden: 1001 },
  { capitulo: "OBRA GRIS", descripcion: "Enlucido", unidad: "m2", cantidad: 800, total: 6400, orden: 1002 },
  { capitulo: "OBRA GRIS", descripcion: "Andamios", unidad: "glb", cantidad: 1, total: 500, orden: 1003 },
  { capitulo: "MOBILIARIO", descripcion: "Muebles de cocina", unidad: "u", cantidad: 1, total: 0, orden: 2001,
    nota: "NO COTIZA: lo pone el cliente" },
];

test("cada capítulo es una agrupación, en el orden del presupuesto", () => {
  const ags = capitulosComoAgrupaciones(items, 15);
  assert.deepEqual(ags.map(a => [a.id, a.nombre]), [[1, "OBRA GRIS"], [2, "ACABADOS"]]);
  // Con IVA, como la obra cuando se activa.
  assert.equal(ags[0].monto, 15300 * 1.15);
  // Los metros se suman aunque estén escritos distinto; lo global no mide.
  assert.deepEqual(ags[0].magnitud, [{ unidad: "m2", cantidad: 1220 }]);
  assert.equal(ags[0].principales[0].descripcion, "Mampostería de bloque");
});

test("lo que no se cotiza no se planifica", () => {
  assert.ok(!capitulosComoAgrupaciones(items).some(a => a.nombre === "MOBILIARIO"));
});

test("el plan guarda el capítulo, no un id que no existe en el control", () => {
  const ags = capitulosComoAgrupaciones(items);
  const plan = planDelPresupuesto({ etapas: [{ nombre: "Obra gris", actividades: [
    { nombre: "Mampostería y enlucido", dias: 20, agrupacion: 1 },
    { nombre: "Replanteo", dias: 2, agrupacion: null },
  ] }], barras: 2, faltantes: [] }, ags);
  const [a, b] = plan.etapas[0].actividades;
  assert.equal(a.agrupacion, null);
  assert.equal(a.capitulo, "OBRA GRIS");
  assert.equal(a.monto, 15300);
  assert.equal(b.capitulo, null);
});

test("de qué presupuesto sale: el aprobado, si no el más nuevo, nunca uno archivado", () => {
  const ps = [
    { id: 1, estado: "enviado", created_at: "2026-09-01" },
    { id: 2, estado: "borrador", created_at: "2026-10-01" },
    { id: 3, estado: "aprobado", created_at: "2026-08-01" },
    { id: 4, estado: "borrador", created_at: "2026-10-20", archivado_at: "2026-10-21" },
  ];
  assert.equal(presupuestoDeReferencia(ps).id, 3);
  assert.equal(presupuestoDeReferencia(ps.filter(p => p.id !== 3)).id, 2);
  assert.equal(presupuestoDeReferencia([]), null);
});
