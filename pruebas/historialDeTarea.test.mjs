// El historial de un punto del checklist: lo que se anotó y lo que pasó solo,
// juntos y en orden. Los textos de la bitácora son los que escribe proyecto.js
// y los que ya hay en la base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dichoAdentro, historialDe, ultimaAnotacion, porTarea } from "../src/modules/leads/historialDeTarea.js";

const madeval = { id: 195, title: "MADEVAL", status: "en-progreso", created_at: "2026-11-13T02:38:31Z", created_by: 1 };
const nombreDe = id => ({ 1: "Hernan Cueva", 2: "Johanna" }[id] || null);

test("adentro de la tarea, la bitácora no repite su nombre", () => {
  assert.equal(dichoAdentro('Hizo "MADEVAL"'), "Se marcó como hecha");
  assert.equal(dichoAdentro("Hecho: Envío documentación EHS"), "Se marcó como hecha");
  assert.equal(dichoAdentro('Volvió a abrir "ENVIO DE CONTRATO APORBADO"'), "Se volvió a abrir");
  assert.equal(dichoAdentro('Le encargó "Presupuesto corregido" a Hernan Cueva, para el 23 oct'), "Se le encargó a Hernan Cueva, para el 23 oct");
  assert.equal(dichoAdentro('"MADEVAL" queda para el 18 nov'), "Queda para el 18 nov");
  assert.equal(dichoAdentro('"MADEVAL" se queda sin fecha'), "Se queda sin fecha");
  assert.equal(dichoAdentro('"MADEVAL" queda esperando a un tercero'), "Queda esperando a un tercero");
  assert.equal(dichoAdentro('"Firma de Pagares para anticipo" ya no espera'), "Ya no espera a un tercero");
  assert.equal(dichoAdentro('Le mostró al cliente "MADEVAL"'), "Se le mostró al cliente");
  assert.equal(dichoAdentro('Dejó de mostrarle al cliente "MADEVAL"'), "Se le dejó de mostrar al cliente");
  assert.equal(dichoAdentro('Arregló "Espera de Borrador de Contrato": se mueve del 1 oct al 2 oct.'), "Se corrigió: se mueve del 1 oct al 2 oct.");
});

test("un título con comillas adentro, o corregido después, se reconoce igual: es por la forma de la frase", () => {
  assert.equal(dichoAdentro('Hizo "Cocina "tipo isla" MADEVAL"'), "Se marcó como hecha");
  assert.equal(dichoAdentro('"Cocina "tipo isla"" queda para el 2 dic'), "Queda para el 2 dic");
  assert.equal(dichoAdentro('Arregló "MADEBAL": ahora dice "MADEVAL", queda para el 18 nov a las 10:00.'), 'Se corrigió: ahora dice "MADEVAL", queda para el 18 nov a las 10:00.');
});

test("lo que no se reconoce se deja como está: no se inventa una frase", () => {
  assert.equal(dichoAdentro("Envío a Diners Club: Presupuesto enviado."), "Envío a Diners Club: Presupuesto enviado.");
  assert.equal(dichoAdentro(null), "");
});

test("MADEVAL: contactar, fijar la reunión, esperar la cotización, hecha. Se lee en orden", () => {
  const h = historialDe({
    tarea: { ...madeval, status: "listo", hecha_at: "2026-11-24T16:00:00Z", hecha_por: "Johanna" },
    nombreDe,
    movimientos: [
      { id: 376, detalle: 'Sumó "MADEVAL"', autor_nombre: "Hernan Cueva", automatico: true, created_at: "2026-11-13T02:38:32Z" },
      { id: 380, detalle: 'Arregló "MADEVAL": pasa de nadie a Johanna, queda para el 18 nov a las 10:00.', autor_nombre: "Hernan Cueva", automatico: true, created_at: "2026-11-14T15:05:00Z" },
      { id: 391, detalle: '"MADEVAL" queda esperando a un tercero', autor_nombre: "Johanna", automatico: true, created_at: "2026-11-18T17:00:00Z" },
      { id: 402, detalle: 'Hizo "MADEVAL"', autor_nombre: "Johanna", automatico: true, created_at: "2026-11-24T16:00:01Z" },
    ],
    comentarios: [
      { id: 21, texto: "Reunión hecha. Mandan la cotización el viernes.", autor_nombre: "Johanna", created_at: "2026-11-18T16:58:00Z" },
      { id: 12, texto: "Llamé a Madeval, hablé con Andrea. Quedan en confirmar la reunión.", autor_nombre: "Hernan Cueva", created_at: "2026-11-13T15:00:00Z" },
      { id: 25, texto: "Llegó la cotización: $18.400.", autor_nombre: "Johanna", created_at: "2026-11-24T15:59:00Z" },
    ],
  });
  assert.deepEqual(h.map(f => [f.cuando.slice(5, 10), f.quien, f.texto, f.automatico]), [
    ["11-13", "Hernan Cueva", "Se agregó al checklist", true],
    ["11-13", "Hernan Cueva", "Llamé a Madeval, hablé con Andrea. Quedan en confirmar la reunión.", false],
    ["11-14", "Hernan Cueva", "Se corrigió: pasa de nadie a Johanna, queda para el 18 nov a las 10:00.", true],
    ["11-18", "Johanna", "Reunión hecha. Mandan la cotización el viernes.", false],
    ["11-18", "Johanna", "Queda esperando a un tercero", true],
    ["11-24", "Johanna", "Llegó la cotización: $18.400.", false],
    ["11-24", "Johanna", "Se marcó como hecha", true],
  ]);
});

test("el alta sale de la tarea y no se repite con el «Sumó» de la bitácora; el cierre tampoco se duplica", () => {
  const h = historialDe({
    tarea: { ...madeval, status: "listo", hecha_at: "2026-11-20T10:00:00Z", hecha_por: "Hernan Cueva" }, nombreDe,
    movimientos: [
      { id: 1, detalle: 'Sumó "MADEVAL"', created_at: "2026-11-13T02:38:32Z" },
      { id: 2, detalle: 'Hizo "MADEVAL"', autor_nombre: "Hernan Cueva", created_at: "2026-11-20T10:00:01Z" },
    ],
  });
  assert.deepEqual(h.map(f => f.texto), ["Se agregó al checklist", "Se marcó como hecha"]);
});

test("una tarea de antes de la 181, sin renglones enlazados: igual dice cuándo entró y cuándo se hizo", () => {
  const h = historialDe({
    tarea: { id: 86, title: "Envio de correos ingenierias", status: "listo", created_at: "2026-09-26T14:00:00Z", created_by: 9, hecha_at: "2026-09-29T21:40:00Z", hecha_por: "Lizeth DLC" },
    comentarios: [{ id: 3, texto: "Completada: Se remitió el 28-sep-2026, 4h35", autor_nombre: "Lizeth DLC", created_at: "2026-09-29T21:39:00Z" }],
    nombreDe,
  });
  assert.deepEqual(h.map(f => [f.texto, f.quien, f.automatico]), [
    ["Se agregó al checklist", null, true],
    ["Completada: Se remitió el 28-sep-2026, 4h35", "Lizeth DLC", false],
    ["Se marcó como hecha", "Lizeth DLC", true],
  ]);
});

test("recién agregada y sin nada más, el historial tiene un renglón: no arranca vacío", () => {
  const h = historialDe({ tarea: madeval, nombreDe });
  assert.deepEqual(h.map(f => [f.texto, f.quien]), [["Se agregó al checklist", "Hernan Cueva"]]);
  assert.deepEqual(historialDe({ tarea: null }), []);
});

test("una que se hizo y se volvió a abrir no dice «hecha» de más", () => {
  const h = historialDe({
    tarea: { ...madeval, status: "en-progreso", hecha_at: null },
    movimientos: [
      { id: 5, detalle: 'Hizo "MADEVAL"', created_at: "2026-11-15T10:00:00Z" },
      { id: 6, detalle: 'Volvió a abrir "MADEVAL"', created_at: "2026-11-15T10:05:00Z" },
    ],
  });
  assert.deepEqual(h.map(f => f.texto), ["Se agregó al checklist", "Se marcó como hecha", "Se volvió a abrir"]);
});

test("agendar es un paso: elegir el día y enseguida la hora deja un renglón, no dos", () => {
  const h = historialDe({
    tarea: madeval, nombreDe,
    movimientos: [
      { id: 1, detalle: '"MADEVAL" queda para el 18 nov', autor_nombre: "Hernan Cueva", created_at: "2026-11-13T15:00:00Z" },
      { id: 2, detalle: '"MADEVAL" queda para el 18 nov a las 10:00', autor_nombre: "Hernan Cueva", created_at: "2026-11-13T15:00:20Z" },
    ],
  });
  assert.deepEqual(h.map(f => f.texto), ["Se agregó al checklist", "Queda para el 18 nov a las 10:00"]);
});

test("correr la fecha otro día, u otra persona, sí son dos renglones: eso es historia", () => {
  const h = historialDe({
    tarea: madeval, nombreDe,
    movimientos: [
      { id: 1, detalle: '"MADEVAL" queda para el 18 nov a las 10:00', autor_nombre: "Hernan Cueva", created_at: "2026-11-13T15:00:00Z" },
      { id: 2, detalle: '"MADEVAL" queda para el 20 nov a las 16:00', autor_nombre: "Hernan Cueva", created_at: "2026-11-17T21:00:00Z" },
      { id: 3, detalle: '"MADEVAL" queda para el 21 nov', autor_nombre: "Johanna", created_at: "2026-11-17T21:01:00Z" },
    ],
  });
  assert.deepEqual(h.map(f => f.texto), ["Se agregó al checklist", "Queda para el 18 nov a las 10:00", "Queda para el 20 nov a las 16:00", "Queda para el 21 nov"]);
});

test("una anotación entre el día y la hora no se pierde ni junta nada", () => {
  const h = historialDe({
    tarea: madeval, nombreDe,
    movimientos: [
      { id: 1, detalle: '"MADEVAL" queda para el 18 nov', autor_nombre: "Hernan Cueva", created_at: "2026-11-13T15:00:00Z" },
      { id: 2, detalle: '"MADEVAL" queda para el 18 nov a las 10:00', autor_nombre: "Hernan Cueva", created_at: "2026-11-13T15:02:00Z" },
    ],
    comentarios: [{ id: 9, texto: "Confirmó Andrea.", autor_nombre: "Hernan Cueva", created_at: "2026-11-13T15:01:00Z" }],
  });
  assert.deepEqual(h.map(f => f.texto), ["Se agregó al checklist", "Queda para el 18 nov", "Confirmó Andrea.", "Queda para el 18 nov a las 10:00"]);
});

test("lo que se lee en la fila cerrada es lo último que alguien ANOTÓ", () => {
  assert.equal(ultimaAnotacion([]), null);
  assert.equal(ultimaAnotacion(undefined), null);
  assert.equal(ultimaAnotacion([{ id: 1, texto: "  ", created_at: "2026-11-13T10:00:00Z" }]), null);
  const u = ultimaAnotacion([
    { id: 21, texto: "Reunión hecha.", created_at: "2026-11-18T16:58:00Z" },
    { id: 12, texto: "Llamé.", created_at: "2026-11-13T15:00:00Z" },
  ]);
  assert.equal(u.texto, "Reunión hecha.");
});

test("los renglones se reparten por tarea; el que no es de ninguna queda afuera", () => {
  const m = porTarea([{ id: 1, task_id: 195 }, { id: 2, task_id: 86 }, { id: 3, task_id: 195 }, { id: 4, task_id: null }, { id: 5 }]);
  assert.deepEqual(Object.keys(m).sort(), ["195", "86"]);
  assert.deepEqual(m[195].map(f => f.id), [1, 3]);
});

// ── Lo que escribe proyecto.js tiene que seguir siendo lo que esto sabe leer ──
const proyecto = readFileSync(new URL("../src/modules/leads/proyecto.js", import.meta.url), "utf8");
const lista = readFileSync(new URL("../src/modules/leads/ListaDeTareas.jsx", import.meta.url), "utf8");

test("cada renglón de la bitácora que es de una tarea lleva de cuál: si no, no llega a su historial", () => {
  // Las frases que nombran UNA tarea entre comillas.
  const frases = ['`Sumó "${tarea.title}"`', '`Le encargó "${tarea.title}"', '"Hizo" : "Volvió a abrir"', "queda para el ${enCriollo(fecha)}", '"queda esperando a un tercero" : "ya no espera"'];
  for (const f of frases) {
    const desde = proyecto.indexOf(f);
    assert.ok(desde > 0, `proyecto.js ya no escribe ${f}`);
    const tramo = proyecto.slice(desde, desde + 420);
    assert.match(tramo, /extra: \{ task_id: (tarea|item)\.id \}/, `el renglón de ${f} no dice de qué tarea es`);
  }
  assert.match(lista, /anotarCorreccion\(lead, `Arregló "\$\{aTarea\.item\.texto\}"[^\n]+, currentUser, aTarea\.item\.id\)/);
});

test("si falta la migración 181, el renglón entra igual en la bitácora del proyecto", () => {
  assert.match(proyecto, /fila\.task_id !== undefined\) \{\s+const \{ task_id: deCual, \.\.\.sinTarea \} = fila;/);
});

test("la migración 181 enlaza lo viejo solo cuando nombra a una sola tarea, y no borra nada", () => {
  const sql = readFileSync(new URL("../supabase/migrations/181_el_historial_de_cada_tarea.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists task_id bigint references public\.tasks\(id\) on delete set null/);
  assert.match(sql, /having count\(\*\) = 1/);
  assert.match(sql, /where mm\.task_id is null/);
  // «on delete set null» es de la columna: lo que no puede haber es una orden de borrar.
  assert.doesNotMatch(sql.replace(/--.*$/gm, ""), /\b(delete\s+from|drop\s|truncate\s)/i);
});
