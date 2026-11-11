import { test } from "node:test";
import assert from "node:assert/strict";
import { comoActividad, delProyecto, filaNueva, alMarcar, notaDeOrigen }
  from "../src/modules/leads/tareasDelProyecto.js";

// ── UNA SOLA TAREA ─────────────────────────────────────────────────────────
//
// Hernán: "es confuso las tareas en pipeline y las mismas tareas". Eran dos
// filas por cada cosa —la actividad de la etapa y su tarea gemela— que el
// código copiaba de una a otra. Ahora es una: la tarea.
//
// Y el proyecto ya no tiene una columna por etapa: sus tareas son una lista,
// y cada una lleva de etiqueta en qué etapa estaba el lead cuando se escribió.

const lead = { id: 15, nombre: "Diners Aereo GYE" };
const AHORA = new Date("2026-11-11T15:00:00Z");

test("la tarea se ve en el proyecto con los nombres que usa la pantalla, y es la misma fila", () => {
  const t = { id: 147, title: "Revisión", status: "en-progreso", lead_id: 15, etapa_id: "con_presupuesto", ruta_orden: 2, espera: true, nota: "Falta el anexo" };
  const a = comoActividad(t);
  assert.equal(a.id, 147);
  assert.equal(a.tarea_id, 147, "no hay otra fila: el id de la actividad es el de la tarea");
  assert.deepEqual({ texto: a.texto, hecho: a.hecho, orden: a.orden, espera: a.espera, nota: a.nota, etapa_id: a.etapa_id },
    { texto: "Revisión", hecho: false, orden: 2, espera: true, nota: "Falta el anexo", etapa_id: "con_presupuesto" });
  const hecha = comoActividad({ ...t, status: "listo", hecha_at: "2026-10-07T12:00:00Z", hecha_por: "Hernan Cueva" });
  assert.deepEqual({ hecho: hecha.hecho, hecho_at: hecha.hecho_at, hecho_por: hecha.hecho_por },
    { hecho: true, hecho_at: "2026-10-07T12:00:00Z", hecho_por: "Hernan Cueva" });
  // Una tarea creada desde Tareas no trae nada de esto, y no se rompe.
  assert.deepEqual(comoActividad({ id: 9, title: null, status: "en-progreso", lead_id: 15 }),
    { id: 9, tarea_id: 9, lead_id: 15, etapa_id: null, texto: "", hecho: false, hecho_at: null, hecho_por: null, orden: 0, espera: false, nota: "" });
});

test("las tareas del proyecto son una lista: lo abierto por fecha, y lo hecho aparte", () => {
  const tareas = [
    { id: 1, status: "en-progreso", due_date: "2026-11-20", type: "Gestión" },
    { id: 2, status: "en-progreso", due_date: null, type: "Otro" },                       // sin fecha: después de las que tienen
    { id: 3, status: "en-progreso", due_date: "2026-11-13", type: "Reunión" },            // la más próxima: es el próximo paso
    { id: 4, status: "en-progreso", due_date: "2026-11-01", type: "Gestión", espera: true }, // espera a un tercero: al fondo
    { id: 5, status: "listo", hecha_at: "2026-10-07T12:00:00Z", type: "Envío" },
    { id: 6, status: "listo", hecha_at: "2026-10-23T12:00:00Z", type: "Gestión" },
    { id: 7, status: "en-progreso", due_date: "2026-11-02", type: "Compra", compra_id: 40 },
    { id: 8, status: "listo", type: "Gestión", compra_id: 41 },
  ];
  const r = delProyecto(tareas);
  assert.deepEqual(r.abiertas.map(t => t.id), [3, 1, 2, 4]);
  assert.deepEqual(r.hechas.map(t => t.id), [6, 5], "la más reciente arriba");
  // Las compras tienen su módulo: acá no se listan.
  assert.equal([...r.abiertas, ...r.hechas].some(t => t.compra_id || t.type === "Compra"), false);
  // Nada del proyecto queda sin verse: una tarea creada desde Tareas, sin etapa ni fecha, está.
  assert.ok(r.abiertas.some(t => t.id === 2));
  assert.deepEqual(delProyecto(), { abiertas: [], hechas: [] });
});

test("sumar una tarea guarda una sola fila, con la etapa en la que está el lead de etiqueta", () => {
  const f = filaNueva({ lead, etapaId: "con_presupuesto", titulo: "  Revisión de contrato ", orden: 3, tipo: "Gestión", assignee_id: 1, due_date: "2026-11-14",
    hora: "09:30", urgente: true, creadoPor: 1, ahora: AHORA });
  assert.deepEqual(f, {
    title: "Revisión de contrato", lead_id: 15, etapa_id: "con_presupuesto", ruta_orden: 3,
    assignee_id: 1, due_date: "2026-11-14", priority: "urgente", type: "Gestión", created_by: 1,
    notes: "Gestión de Diners Aereo GYE", hora: "09:30",
    status: "en-progreso", hecha_at: null, hecha_por: null,
  });
  // Sin dueño ni fecha sigue siendo una tarea del proyecto.
  const suelta = filaNueva({ lead, etapaId: "con_presupuesto", titulo: "Pedir pólizas", tipo: "Otro", ahora: AHORA });
  assert.equal(suelta.assignee_id, null);
  assert.equal(suelta.due_date, null);
  assert.equal(suelta.priority, "media");
  assert.equal(suelta.notes, "Tarea de Diners Aereo GYE");
  assert.equal("hora" in suelta, false);
  // En un proyecto aprobado ya no hay etapa del pipeline que anotar.
  assert.equal(filaNueva({ lead, titulo: "x" }).etapa_id, null);
  // Ya no se escribe a qué fila de etapa pertenece: esa tabla quedó de respaldo.
  assert.equal("lead_etapa_id" in f, false);
});

test("un envío ya ocurrió: nace cerrado, con a quién y quién lo registró", () => {
  // El error que había: "Presupuesto enviado" quedaba abierto para siempre,
  // a nombre del cliente, vencido desde el 7 de octubre.
  const f = filaNueva({ lead, etapaId: "con_presupuesto", titulo: "Presupuesto enviado: rev.2", tipo: "Envío", due_date: "2026-10-07",
    responsable_externo: "Diners Club", hecha: true, quienNombre: "Hernan Cueva", creadoPor: 1, ahora: AHORA });
  assert.equal(f.status, "listo");
  assert.equal(f.hecha_at, "2026-11-11T15:00:00.000Z");
  assert.equal(f.hecha_por, "Hernan Cueva");
  assert.equal(f.responsable_externo, "Diners Club");
  assert.equal(f.notes, "Envío de Diners Aereo GYE");
});

test("marcar y desmarcar escriben el estado y quién lo hizo, en la misma fila", () => {
  assert.deepEqual(alMarcar(true, "Camila Mena", AHORA), { status: "listo", hecha_at: "2026-11-11T15:00:00.000Z", hecha_por: "Camila Mena" });
  assert.deepEqual(alMarcar(false, "Camila Mena", AHORA), { status: "en-progreso", hecha_at: null, hecha_por: null });
  assert.equal(alMarcar(true).hecha_por, null);
});

test("la nota de origen dice qué es, que es como el tablero lo clasifica", () => {
  assert.equal(notaDeOrigen("Reunión", "RES BG"), "Reunión de RES BG");
  assert.equal(notaDeOrigen("Gestión", "RES BG"), "Gestión de RES BG");
  assert.equal(notaDeOrigen("Envío", "RES BG"), "Envío de RES BG");
  assert.equal(notaDeOrigen("Otro", "RES BG"), "Tarea de RES BG");
  assert.equal(notaDeOrigen(undefined, undefined), "Tarea de");
});
