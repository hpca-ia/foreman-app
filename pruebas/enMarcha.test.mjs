import { test } from "node:test";
import assert from "node:assert/strict";
import { fichaDelProyecto, ordenesEsperando, comprasAbiertas, tareasDelAprobado, ordenarEnMarcha } from "../src/modules/leads/enMarcha.js";
import { resumenDeObras } from "../src/modules/controlObra/resumenDeObras.js";

// ── EN MARCHA: LO APROBADO ─────────────────────────────────────────────────
//
// Un proyecto aprobado sale del pipeline y no lleva etapas a mano. En qué anda
// lo dice una ficha que se arma sola con lo que ya saben Control, Compras,
// Tareas y el Libro: nadie tiene que acordarse de mover nada.

const HOY = "2026-11-11";
const obra = { id: 13, nombre: "IMPLEMENTACIÓN DINERS AEREOPUERTO-GUAYAQUIL", lead_id: 15 };
const planillas = [
  { id: 1, obra_id: 13, numero: 1, nombre: "Planilla N°1", estado: "cerrada", fecha_cierre: "2026-11-05T20:51:59Z" },
  { id: 2, obra_id: 13, numero: 2, nombre: "Planilla N°2", estado: "abierta", fecha_cierre: null },
];

test("las órdenes que esperan firma: cuántas, hace cuánto, y si alguna está objetada o vencida", () => {
  const ordenes = [
    { id: 1, estado: "enviada", anulada: false, enviada_at: "2026-10-28T15:00:00Z" },
    { id: 2, estado: "enviada", anulada: false, enviada_at: "2026-11-09T15:00:00Z", fecha_limite_aprobacion: "2026-11-10" },
    { id: 3, estado: "aprobada", anulada: false },                                     // ya firmada
    { id: 4, estado: "enviada", anulada: true },                                       // anulada
    { id: 5, estado: "enviada", anulada: false, reemplazada_at: "2026-11-01T00:00:00Z" }, // la reemplazó una revisión
  ];
  const aprobaciones = [
    // La orden 1 se le mandó al cliente dos días después de marcarla enviada: cuenta desde ahí.
    { orden_id: 1, envio_at: "2026-10-30T12:00:00Z", aprobado_at: null, observacion: null },
    { orden_id: 2, envio_at: "2026-11-09T12:00:00Z", aprobado_at: null, observacion: "el precio del gypsum no es el acordado" },
  ];
  assert.deepEqual(ordenesEsperando(ordenes, aprobaciones, HOY), { cuantas: 2, dias: 12, vencidas: 1, objetadas: 1 });
  assert.deepEqual(ordenesEsperando([], [], HOY), { cuantas: 0, dias: 0, vencidas: 0, objetadas: 0 });
  // Sin registro del envío, cuenta desde que se la marcó enviada.
  assert.equal(ordenesEsperando([{ id: 9, estado: "enviada", enviada_at: "2026-11-08T10:00:00Z" }], [], HOY).dias, 3);
});

test("las compras abiertas se cuentan por el paso en el que están", () => {
  const compras = ["aprobada", "aprobada", "comprada", "requiere_info", "requiere_info", "recibida", "pendiente_aprobacion", "borrador"].map((estado, id) => ({ id, estado }));
  assert.deepEqual(comprasAbiertas(compras), { porAprobar: 1, devueltas: 2, porComprar: 2, porRecibir: 1, total: 6 });
  assert.equal(comprasAbiertas([]).total, 0);
});

test("las tareas del aprobado: abiertas, vencidas y la que sigue; las compras no cuentan", () => {
  const tareas = [
    { id: 1, title: "Revisión Contrato", status: "en-progreso", due_date: "2026-10-07", type: "Gestión" },
    { id: 2, title: "Revisión", status: "en-progreso", due_date: "2026-10-26", type: "Gestión" },
    { id: 3, title: "Revisión y recopilación de materiales", status: "en-progreso", due_date: null, type: "Otro" },
    { id: 4, title: "Comprar: gypsum", status: "en-progreso", due_date: "2026-11-05", type: "Compra", compra_id: 7 },
    { id: 5, title: "Cronograma", status: "listo", due_date: "2026-09-25", type: "Otro" },
  ];
  const r = tareasDelAprobado(tareas, HOY);
  assert.deepEqual({ abiertas: r.abiertas, vencidas: r.vencidas, sinFecha: r.sinFecha, proxima: r.proxima.title },
    { abiertas: 3, vencidas: 2, sinFecha: 1, proxima: "Revisión Contrato" });
  assert.deepEqual(tareasDelAprobado([], HOY), { abiertas: 0, vencidas: 0, sinFecha: 0, proxima: null });
});

test("la ficha dice en qué va la obra sin que nadie haya movido nada a mano", () => {
  const f = fichaDelProyecto({
    obra, planillas, hoy: HOY,
    resumen: { base: 193939.5, invertido: 42785.02, sinAsignar: 4424.02 },
    ordenes: [{ id: 1, estado: "enviada", anulada: false, enviada_at: "2026-10-30T12:00:00Z" }, { id: 2, estado: "enviada", anulada: false, enviada_at: "2026-11-04T12:00:00Z" }],
    compras: [{ estado: "requiere_info" }, { estado: "requiere_info" }, ...Array(7).fill({ estado: "aprobada" }), { estado: "comprada" }, { estado: "recibida" }],
    tareas: [
      { id: 1, title: "Revisión Contrato", status: "en-progreso", due_date: "2026-10-07" },
      { id: 2, title: "Envío a GYE", status: "en-progreso", due_date: "2026-10-27" },
      { id: 3, title: "Materiales", status: "en-progreso", due_date: null },
    ],
    libro: { dias: 31, ultima: "2026-11-10" },
  });
  assert.equal(f.enQueVa, "Planilla N°2 abierta · la anterior se cerró el 5 nov");
  // La plata, con los nombres de la lista de Control, y el saldo que sale de los dos números.
  assert.deepEqual(f.plata, { presupuesto: 193939.5, invertido: 42785.02, saldo: 193939.5 - 42785.02, pct: 42785.02 / 193939.5, sinAsignar: 4424.02 });
  assert.deepEqual(f.renglones.map(r => [r.clave, r.vista, r.tono, r.texto]), [
    ["ordenes", "controlObra", "atencion", "2 esperan firma · la más vieja, hace 12 días"],
    ["compras", "compras", "atencion", "2 devueltas · 7 por comprar · 1 por recibir"],
    ["tareas", "proyecto", "peligro", "3 abiertas · 2 vencidas · sigue «Revisión Contrato» (7 oct)"],
    ["libro", "libro", "normal", "Última entrada ayer (10 nov) · 31 días escritos"],
  ]);
  // Órdenes, compras devueltas, tareas vencidas y plata sin asignar: cuatro cosas piden atención.
  assert.equal(f.pendientes, 4);
});

test("lo que no pasa no aparece, y quien no ve montos no ve la plata", () => {
  const f = fichaDelProyecto({ obra, planillas: [planillas[1]], resumen: null, hoy: HOY, libro: null });
  assert.equal(f.enQueVa, "Planilla N°2 abierta");
  assert.equal(f.plata, null);
  assert.deepEqual(f.renglones.map(r => [r.clave, r.tono, r.texto]), [
    ["tareas", "apagado", "Ninguna abierta"],
    ["libro", "apagado", "Todavía sin entradas"],
  ]);
  assert.equal(f.pendientes, 0);

  // Centavos de redondeo no son plata sin asignar.
  assert.equal(fichaDelProyecto({ obra, resumen: { base: 100, invertido: 50, sinAsignar: 0.004 }, hoy: HOY }).plata.sinAsignar, 0);
  // Una sola orden, mandada hoy; una tarea sin fecha.
  const g = fichaDelProyecto({ obra, hoy: HOY, ordenes: [{ id: 1, estado: "enviada", enviada_at: `${HOY}T10:00:00Z`, fecha_limite_aprobacion: "2026-11-01" }],
    tareas: [{ id: 1, title: "Pólizas", status: "en-progreso", due_date: null }], compras: [{ estado: "pendiente_aprobacion" }] });
  assert.deepEqual(g.renglones.slice(0, 3).map(r => [r.tono, r.texto]), [
    ["peligro", "1 espera firma · enviada hoy · 1 con el plazo vencido"],
    ["normal", "1 espera visto"],
    ["normal", "1 abierta · sigue «Pólizas», sin fecha"],
  ]);
});

test("sin obra o sin planillas lo dice, en vez de mostrar una ficha vacía", () => {
  assert.equal(fichaDelProyecto({ obra: null, hoy: HOY }).enQueVa, "Todavía sin obra en Control");
  // Sin obra no hay libro que esperar.
  assert.deepEqual(fichaDelProyecto({ obra: null, hoy: HOY }).renglones.map(r => r.clave), ["tareas"]);
  assert.equal(fichaDelProyecto({ obra, planillas: [], hoy: HOY }).enQueVa, "Todavía sin planillas");
  assert.equal(fichaDelProyecto({ obra, planillas: [planillas[0]], hoy: HOY }).enQueVa, "Planilla N°1 cerrada el 5 nov · sin planilla abierta");
});

test("en la lista va primero el proyecto que más cosas pide", () => {
  const lista = ordenarEnMarcha([
    { lead: { nombre: "Tranquilo" }, ficha: { pendientes: 0 } },
    { lead: { nombre: "Diners Aereo GYE" }, ficha: { pendientes: 4 } },
    { lead: { nombre: "DINERS CLUB PLAZA LAGOS" }, ficha: { pendientes: 2 } },
    { lead: { nombre: "Abc" }, ficha: { pendientes: 0 } },
  ]);
  assert.deepEqual(lista.map(x => x.lead.nombre), ["Diners Aereo GYE", "DINERS CLUB PLAZA LAGOS", "Abc", "Tranquilo"]);
});

// ── LA PLATA ES LA MISMA QUE EN CONTROL ────────────────────────────────────
//
// La ficha y la lista de Control de Obra usan una sola cuenta. Es dinero: no
// puede haber dos reglas que digan en cuánto va la misma obra.

test("el resumen de cada obra: presupuesto vigente, invertido, y lo cargado sin asignar", () => {
  const obras = [{ id: 13 }, { id: 10 }];
  const rubros = [
    // Rubros del contrato: su total ya lleva el IVA adentro.
    { id: 1, obra_id: 13, total_base: 1150, origen: "presupuesto", iva_pct: 15 },
    { id: 2, obra_id: 13, total_base: 2300, origen: "presupuesto", iva_pct: 15 },
    // Lo que una orden tachó no suma, y lo escondido tampoco.
    { id: 3, obra_id: 13, total_base: 500, origen: "presupuesto", iva_pct: 15, anulado_por_oc: 7 },
    { id: 4, obra_id: 13, total_base: 0, origen: "presupuesto", oculto: true },
    { id: 5, obra_id: 10, total_base: 1000, origen: "presupuesto", iva_pct: 15 },
    // De una obra que no está en la lista: no se cuenta.
    { id: 6, obra_id: 99, total_base: 9999, origen: "presupuesto" },
  ];
  const facturas = [
    { id: 100, obra_id: 13, total: 800 }, { id: 101, obra_id: 13, total: 300 }, { id: 102, obra_id: 10, total: 250 },
  ];
  const asignaciones = [
    { factura_id: 100, monto: 500 }, { factura_id: 100, monto: 300 },   // entera, en dos rubros
    { factura_id: 101, monto: 120 },                                    // le faltan 180
    { factura_id: 102, monto: 249.995 },                                // medio centavo no es plata sin asignar
  ];
  const r = resumenDeObras(obras, rubros, facturas, asignaciones);
  assert.equal(r[13].base, 3450);
  assert.equal(r[13].rubros, 2);
  assert.equal(r[13].invertido, 920);
  assert.equal(r[13].sinAsignar, 180);
  assert.equal(r[10].base, 1000);
  assert.equal(r[10].sinAsignar, 0);
  assert.equal(r[99], undefined);
  // Y el contrato de cada una viene armado, para quien quiera el desglose.
  assert.equal(r[13].contrato.vigente, 3450);
  assert.deepEqual(resumenDeObras(), {});
});
