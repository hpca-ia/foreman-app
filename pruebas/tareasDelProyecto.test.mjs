import { test } from "node:test";
import assert from "node:assert/strict";
import { comoActividad, delProyecto, filaNueva, alMarcar, estadoDelHito, notaDeOrigen }
  from "../src/modules/leads/tareasDelProyecto.js";

// ── UNA SOLA TAREA ─────────────────────────────────────────────────────────
//
// Hernán: "es confuso las tareas en pipeline y las mismas tareas". Eran dos
// filas por cada cosa —la actividad de la etapa y su tarea gemela— que el
// código copiaba de una a otra. Ahora es una: la tarea, que dice de qué etapa es.

const lead = { id: 15, nombre: "Diners Aereo GYE" };
const etapa = { id: 61, etapa_id: "con_contrato" };
const AHORA = new Date("2026-11-11T15:00:00Z");

test("la tarea se ve en su etapa con los nombres que usa la pantalla, y es la misma fila", () => {
  const t = { id: 147, title: "Revisión", status: "en-progreso", lead_id: 15, lead_etapa_id: 61, ruta_orden: 2, espera: true, nota: "Falta el anexo" };
  const a = comoActividad(t);
  assert.equal(a.id, 147);
  assert.equal(a.tarea_id, 147, "no hay otra fila: el id de la actividad es el de la tarea");
  assert.deepEqual({ texto: a.texto, hecho: a.hecho, orden: a.orden, espera: a.espera, nota: a.nota, lead_etapa_id: a.lead_etapa_id },
    { texto: "Revisión", hecho: false, orden: 2, espera: true, nota: "Falta el anexo", lead_etapa_id: 61 });
  const hecha = comoActividad({ ...t, status: "listo", hecha_at: "2026-10-07T12:00:00Z", hecha_por: "Hernan Cueva" });
  assert.deepEqual({ hecho: hecha.hecho, hecho_at: hecha.hecho_at, hecho_por: hecha.hecho_por },
    { hecho: true, hecho_at: "2026-10-07T12:00:00Z", hecho_por: "Hernan Cueva" });
  // Una tarea creada desde Tareas no trae nada de esto, y no se rompe.
  assert.deepEqual(comoActividad({ id: 9, title: null, status: "en-progreso", lead_id: 15 }),
    { id: 9, tarea_id: 9, lead_id: 15, lead_etapa_id: null, texto: "", hecho: false, hecho_at: null, hecho_por: null, orden: 0, espera: false, nota: "" });
});

test("en el proyecto se ven sus tareas: las de cada etapa, y aparte las que no están en ninguna", () => {
  const etapas = [{ id: 61 }, { id: 62 }];
  const tareas = [
    { id: 1, lead_etapa_id: 61, type: "Gestión" },
    { id: 2, lead_etapa_id: "62", type: "Reunión" },          // la base puede devolver el número como texto
    { id: 3, lead_etapa_id: null, type: "Otro" },             // se creó desde Tareas, con este proyecto
    { id: 4, lead_etapa_id: 99, type: "Gestión" },            // su etapa se quitó del proyecto
    { id: 5, lead_etapa_id: null, type: "Compra", compra_id: 40 },
    { id: 6, lead_etapa_id: 61, type: "Gestión", compra_id: 41 },
  ];
  const r = delProyecto(tareas, etapas);
  assert.deepEqual(r.enEtapas.map(t => t.id), [1, 2]);
  assert.deepEqual(r.sueltas.map(t => t.id), [3, 4], "nada del proyecto queda sin verse");
  // Las compras tienen su módulo: acá no se listan.
  assert.equal([...r.enEtapas, ...r.sueltas].some(t => t.compra_id || t.type === "Compra"), false);
  assert.deepEqual(delProyecto(), { enEtapas: [], sueltas: [] });
});

test("sumar una tarea a una etapa guarda una sola fila, con su etapa escrita en ella", () => {
  const f = filaNueva({ lead, etapa, titulo: "  Revisión de contrato ", orden: 3, tipo: "Gestión", assignee_id: 1, due_date: "2026-11-14",
    hora: "09:30", urgente: true, creadoPor: 1, ahora: AHORA });
  assert.deepEqual(f, {
    title: "Revisión de contrato", lead_id: 15, lead_etapa_id: 61, etapa_id: "con_contrato", ruta_orden: 3,
    assignee_id: 1, due_date: "2026-11-14", priority: "urgente", type: "Gestión", created_by: 1,
    notes: "Gestión de Diners Aereo GYE", hora: "09:30",
    status: "en-progreso", hecha_at: null, hecha_por: null,
  });
  // Sin dueño ni fecha sigue siendo una tarea del proyecto.
  const suelta = filaNueva({ lead, etapa, titulo: "Pedir pólizas", tipo: "Otro", ahora: AHORA });
  assert.equal(suelta.assignee_id, null);
  assert.equal(suelta.due_date, null);
  assert.equal(suelta.priority, "media");
  assert.equal(suelta.notes, "Tarea de Diners Aereo GYE");
  assert.equal("hora" in suelta, false);
  // Y del proyecto sin etapa, cuando se la suma sin decir a cuál.
  assert.equal(filaNueva({ lead, titulo: "x" }).lead_etapa_id, null);
});

test("un envío ya ocurrió: nace cerrado, con a quién y quién lo registró", () => {
  // El error que había: "Presupuesto enviado" quedaba abierto para siempre,
  // a nombre del cliente, vencido desde el 7 de octubre.
  const f = filaNueva({ lead, etapa, titulo: "Presupuesto enviado: rev.2", tipo: "Envío", due_date: "2026-10-07",
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

test("el hito arranca con la primera tarea hecha y cierra con la última; nunca vuelve atrás solo", () => {
  const t = (...estados) => estados.map(status => ({ status }));
  assert.equal(estadoDelHito("pendiente", t("listo", "en-progreso")), "en_curso");
  assert.equal(estadoDelHito("en_curso", t("listo", "listo")), "hecha");
  assert.equal(estadoDelHito("pendiente", t("listo")), "hecha");
  // Ya está donde tiene que estar: no se toca.
  assert.equal(estadoDelHito("en_curso", t("listo", "en-progreso")), null);
  assert.equal(estadoDelHito("hecha", t("listo")), null);
  // Alguien dijo a mano que está en curso y todavía no hay nada hecho: se queda.
  assert.equal(estadoDelHito("en_curso", t("en-progreso", "en-progreso")), null);
  // Sin tareas, o si se decidió que no se hace, no opina.
  assert.equal(estadoDelHito("pendiente", []), null);
  assert.equal(estadoDelHito("omitida", t("listo")), null);
  // Se reabre una tarea de un hito cerrado: el hito vuelve a estar en curso.
  assert.equal(estadoDelHito("hecha", t("listo", "en-progreso")), "en_curso");
});

test("la nota de origen dice qué es, que es como el tablero lo clasifica", () => {
  assert.equal(notaDeOrigen("Reunión", "RES BG"), "Reunión de RES BG");
  assert.equal(notaDeOrigen("Gestión", "RES BG"), "Gestión de RES BG");
  assert.equal(notaDeOrigen("Envío", "RES BG"), "Envío de RES BG");
  assert.equal(notaDeOrigen("Otro", "RES BG"), "Tarea de RES BG");
  assert.equal(notaDeOrigen(undefined, undefined), "Tarea de");
});
