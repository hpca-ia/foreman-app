import { test } from "node:test";
import assert from "node:assert/strict";
import {
  abierto, vivos, abiertosDeVerdad, vencidos, quienLoSigue, sinRepartir, decisionDe, valorDe, quienDelEquipo,
  paraTarea, tareaDelCompromiso, alCerrarLaTarea, alArrastrar,
} from "../src/modules/actas/compromisos.js";
import { bandeja } from "../src/lib/bandeja.js";

// ── LOS COMPROMISOS DE LAS ACTAS ───────────────────────────────────────────
//
// El 11/11/2026 conté 49 compromisos abiertos y 37 vencidos, y publiqué un
// aviso con ese número. Estaba mal: cada reunión copia los pendientes de la
// anterior y la copia vieja se queda «pendiente» para siempre. Eran 9. Estas
// pruebas existen para que ese error no vuelva.

const HOY = "2026-11-11";
const actas = [{ id: 1, numero: 1 }, { id: 2, numero: 2 }, { id: 3, numero: 3 }, { id: 4, numero: 4 }];
const c = (extra = {}) => ({ id: 1, acta_id: 1, texto: "Terminar los derrocamientos", estado: "pendiente", viene_de: null, fecha_limite: null, responsable_nombre: "HCARQ", ...extra });

test("un compromiso que se arrastra de reunión en reunión es uno solo: vale el de la última acta", () => {
  // «Terminar los derrocamientos»: nació en el acta 2, se arrastró a la 3 y a la 4.
  const cadena = [
    c({ id: 33, acta_id: 2, fecha_limite: "2026-10-23" }),
    c({ id: 58, acta_id: 3, viene_de: 33, fecha_limite: "2026-10-23" }),
    c({ id: 74, acta_id: 4, viene_de: 33, estado: "reprogramado", fecha_limite: "2026-11-06" }),
  ];
  // Otro que se cumplió en la última: las copias viejas siguen diciendo «pendiente».
  const cumplido = [
    c({ id: 21, acta_id: 2, texto: "Cargar los planos" }),
    c({ id: 53, acta_id: 3, viene_de: 21, texto: "Cargar los planos" }),
    c({ id: 80, acta_id: 4, viene_de: 21, texto: "Cargar los planos", estado: "cumplido" }),
  ];
  const nuevo = c({ id: 87, acta_id: 4, texto: "Enviar correo formal", fecha_limite: "2026-11-05" });
  const todos = [...cadena, ...cumplido, nuevo];

  // Contando filas «pendientes» o «reprogramadas» salen 6; abiertos de verdad hay 2.
  assert.equal(todos.filter(abierto).length, 6);
  assert.deepEqual(vivos(todos, actas).map(x => x.id).sort((a, b) => a - b), [74, 80, 87]);
  assert.deepEqual(abiertosDeVerdad(todos, actas).map(x => x.id).sort((a, b) => a - b), [74, 87]);
  assert.deepEqual(vencidos(todos, actas, HOY).map(x => x.id).sort((a, b) => a - b), [74, 87]);
  // El orden lo da el número del acta, no el orden en que llegan las filas.
  assert.deepEqual(vivos([...todos].reverse(), actas).map(x => x.id).sort((a, b) => a - b), [74, 80, 87]);
  // Sin la lista de actas se guía por el id del acta, que crece igual.
  assert.deepEqual(abiertosDeVerdad(todos).map(x => x.id).sort((a, b) => a - b), [74, 87]);
  // Con fecha de hoy o sin fecha no está vencido.
  assert.deepEqual(vencidos([c({ id: 1, fecha_limite: HOY }), c({ id: 2 })], actas, HOY), []);
  assert.deepEqual(vivos(), []);
});

test("quién lo sigue se elige: alguien del equipo, un tercero, o todavía nadie", () => {
  assert.equal(quienLoSigue(c()), null);
  assert.equal(quienLoSigue(c({ asignado_a: 7 })), "equipo");
  assert.equal(quienLoSigue(c({ tercero: true })), "tercero");
  // El desplegable guarda una de tres cosas, y muestra la que está guardada.
  assert.deepEqual(decisionDe("7"), { asignado_a: 7, tercero: false });
  assert.deepEqual(decisionDe("tercero"), { asignado_a: null, tercero: true });
  assert.deepEqual(decisionDe(""), { asignado_a: null, tercero: false });
  assert.equal(valorDe(c({ asignado_a: 7 })), "7");
  assert.equal(valorDe(c({ tercero: true })), "tercero");
  assert.equal(valorDe(c()), "");
  // Sin repartir: abiertos de verdad a los que no se les dijo quién.
  const todos = [c({ id: 1 }), c({ id: 2, asignado_a: 7 }), c({ id: 3, tercero: true }), c({ id: 4, estado: "cumplido" }), c({ id: 5, tarea_id: 99 })];
  assert.deepEqual(sinRepartir(todos, actas).map(x => x.id), [1]);
});

test("solo propone a alguien del equipo cuando el acta lo nombra con nombre y apellido", () => {
  const equipo = [{ id: 7, name: "Camila Mena" }, { id: 1, name: "Hernan Cueva" }, { id: 9, name: "Lizeth DLC" }];
  assert.equal(quienDelEquipo(c({ responsable_nombre: "Camila Mena" }), equipo), 7);
  assert.equal(quienDelEquipo(c({ responsable_nombre: "  camila  mena " }), equipo), 7);
  // «HCARQ» es la oficina, no una persona: quién lo sigue hay que elegirlo.
  assert.equal(quienDelEquipo(c({ responsable_nombre: "HCARQ" }), equipo), null);
  assert.equal(quienDelEquipo(c({ responsable_nombre: "Camila, Proeficaz, Nathalie" }), equipo), null);
  assert.equal(quienDelEquipo(c({ responsable_nombre: null }), equipo), null);
});

test("al del equipo se le crea su tarea; lo de un tercero queda en «Espero de otros» de quien lleva el proyecto", () => {
  const acta = { id: 4, numero: 4, fecha: "2026-11-05", lead_id: 15 };
  const lead = { id: 15, nombre: "Diners Aereo GYE", responsable_id: 1 };
  const quien = { id: 2, name: "Johanna" };
  const delEquipo = tareaDelCompromiso({ c: c({ id: 89, texto: "Revisar la ubicación exacta de los puntales", asignado_a: 7, fecha_limite: "2026-11-06", urgente: true }), acta, lead, quien });
  assert.deepEqual(delEquipo, {
    title: "Revisar la ubicación exacta de los puntales", lead_id: 15, type: "Gestión", due_date: "2026-11-06",
    priority: "media", status: "en-progreso",
    notes: "Compromiso del acta de reunión N° 4 del 2026-11-05\nResponsable según el acta: HCARQ",
    assignee_id: 7, created_by: 2,
  });
  const deTercero = tareaDelCompromiso({ c: c({ id: 91, texto: "Revisar la orden de cambio del sistema eléctrico", responsable_nombre: " Diners", tercero: true, fecha_limite: "2026-11-06" }), acta, lead, quien });
  assert.equal(deTercero.assignee_id, null);
  assert.equal(deTercero.responsable_externo, "Diners");
  assert.equal(deTercero.created_by, 1, "la encargó quien lleva el proyecto, aunque el visto lo dio otra persona");
  // Nunca nace urgente: manda la fecha.
  assert.equal(delEquipo.priority, "media");
  // Sin decidir no hay tarea: una tarea en la bandeja de nadie es ruido.
  assert.equal(tareaDelCompromiso({ c: c(), acta, lead, quien }), null);
  // Si el proyecto no tiene quién lo lleve, queda a nombre de quien dio el visto.
  assert.equal(tareaDelCompromiso({ c: c({ tercero: true, responsable_nombre: null }), acta, lead: { id: 15 }, quien }).created_by, 2);
  assert.equal(tareaDelCompromiso({ c: c({ tercero: true, responsable_nombre: null }), acta, lead: { id: 15 }, quien }).responsable_externo, "Un tercero");

  // Y en la bandeja caen donde tienen que caer.
  const tareas = [{ id: 500, ...delEquipo }, { id: 501, ...deTercero }];
  const deHernan = bandeja({ tareas, usuarioId: 1, hoy: HOY });
  assert.deepEqual(deHernan.espero.find(g => g.clave === "encargadas").tareas.map(t => t.responsable_externo), ["Diners"]);
  assert.equal(deHernan.cuenta.meToca, 0);
  assert.deepEqual(bandeja({ tareas, usuarioId: 7, hoy: HOY }).meToca[0].tareas.map(t => t.title), ["Revisar la ubicación exacta de los puntales"]);
  assert.deepEqual(bandeja({ tareas, usuarioId: 2, hoy: HOY }).espero[0].tareas.map(t => t.assignee_id), [7], "Johanna dio el visto: se lo encargó a Camila");
});

test("van a tener tarea los que tienen quién los siga, siguen abiertos y todavía no la tienen", () => {
  const todos = [
    c({ id: 1, asignado_a: 7 }), c({ id: 2, tercero: true }), c({ id: 3 }),
    c({ id: 4, asignado_a: 7, tarea_id: 99 }), c({ id: 5, asignado_a: 7, estado: "cumplido" }),
    c({ id: 6, tercero: true, estado: "anulado" }), c({ id: 7, asignado_a: 9, estado: "reprogramado" }),
  ];
  assert.deepEqual(paraTarea(todos).map(x => x.id), [1, 2, 7]);
});

test("cerrarlo en el acta cierra su tarea, y reabrirlo la reabre: es la misma cosa", () => {
  const AHORA = new Date("2026-11-11T15:00:00Z");
  assert.deepEqual(alCerrarLaTarea("cumplido", "Hernan Cueva", AHORA), { status: "listo", descartada: false, hecha_at: "2026-11-11T15:00:00.000Z", hecha_por: "Hernan Cueva" });
  // «Ya no aplica» la cierra sin darla por hecha.
  assert.deepEqual(alCerrarLaTarea("anulado", "Hernan Cueva", AHORA), { status: "listo", descartada: true, hecha_at: "2026-11-11T15:00:00.000Z", hecha_por: "Hernan Cueva" });
  assert.deepEqual(alCerrarLaTarea("pendiente"), { status: "en-progreso", descartada: false, hecha_at: null, hecha_por: null });
  assert.deepEqual(alCerrarLaTarea("reprogramado"), { status: "en-progreso", descartada: false, hecha_at: null, hecha_por: null });
});

test("al arrastrarse a la reunión siguiente se lleva quién lo sigue y su tarea: no nace una segunda", () => {
  const original = c({ id: 87, acta_id: 4, asignado_a: 7, tarea_id: 500, fecha_limite: "2026-11-05", urgente: true, responsable_email: "x@ejemplo.test" });
  const copia = alArrastrar(original, 5, 0);
  assert.deepEqual(copia, {
    acta_id: 5, texto: "Terminar los derrocamientos", responsable_nombre: "HCARQ", responsable_email: "x@ejemplo.test",
    fecha_limite: "2026-11-05", estado: "pendiente", urgente: true, viene_de: 87, orden: 0,
    asignado_a: 7, tercero: false, tarea_id: 500,
  });
  // La copia ya tiene su tarea: al dar el visto del acta nueva no se crea otra.
  assert.deepEqual(paraTarea([{ id: 120, ...copia }]), []);
  // Y la copia de una copia sigue apuntando al original.
  assert.equal(alArrastrar({ id: 120, ...copia }, 6, 0).viene_de, 87);
});

test("el servidor cuenta y arma las tareas igual que la pantalla", async () => {
  const api = await import("../api/_compromisos.js");
  const todos = [
    c({ id: 33, acta_id: 2, fecha_limite: "2026-10-23" }), c({ id: 58, acta_id: 3, viene_de: 33, fecha_limite: "2026-10-23" }),
    c({ id: 74, acta_id: 4, viene_de: 33, estado: "reprogramado", fecha_limite: "2026-11-06", asignado_a: 7 }),
    c({ id: 80, acta_id: 4, viene_de: 21, estado: "cumplido" }), c({ id: 21, acta_id: 2 }),
    c({ id: 87, acta_id: 4, fecha_limite: "2026-11-05", tercero: true, responsable_nombre: "DINERS" }),
    c({ id: 88, acta_id: 4, fecha_limite: "2026-11-20" }), c({ id: 89, acta_id: 4, asignado_a: 9, tarea_id: 5 }),
  ];
  for (const hoy of ["2026-11-01", HOY, "2026-12-01"]) {
    assert.deepEqual(api.vencidos(todos, actas, hoy).map(x => x.id).sort(), vencidos(todos, actas, hoy).map(x => x.id).sort(), `el ${hoy}`);
  }
  assert.deepEqual(api.vivos(todos, actas).map(x => x.id).sort(), vivos(todos, actas).map(x => x.id).sort());
  assert.deepEqual(api.paraTarea(todos).map(x => x.id), paraTarea(todos).map(x => x.id));
  const acta = { id: 4, numero: 4, fecha: "2026-11-05", lead_id: 15 }, lead = { id: 15, responsable_id: 1 }, quien = { id: 2 };
  for (const x of todos) assert.deepEqual(api.tareaDelCompromiso({ c: x, acta, lead, quien }), tareaDelCompromiso({ c: x, acta, lead, quien }), `compromiso ${x.id}`);
});
