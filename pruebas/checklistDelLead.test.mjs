// El checklist de un lead: pegar una lista, cuánto va, y qué ve el cliente.
import test from "node:test";
import assert from "node:assert/strict";
import { renglonesDeLista, avanceDe } from "../src/modules/leads/tareasDelProyecto.js";
import { listaDelCliente, avanceDeLaLista, correoDeLaLista } from "../api/_listaDelCliente.js";

test("una lista pegada da una tarea por renglón", () => {
  const r = renglonesDeLista("Cotizar ventanería\nCotizar cocina\nControl de iluminación");
  assert.deepEqual(r.nuevos, ["Cotizar ventanería", "Cotizar cocina", "Control de iluminación"]);
  assert.deepEqual(r.repetidos, []);
});

test("las viñetas, los números y las casillas de adelante se quitan", () => {
  const r = renglonesDeLista("- Cotizar ventanería\n• Cotizar cocina\n3. Control de iluminación\n4) Pisos\n[ ] Mesones\n[x] Grifería\n☐ Closets\n  * Puertas");
  assert.deepEqual(r.nuevos, ["Cotizar ventanería", "Cotizar cocina", "Control de iluminación", "Pisos", "Mesones", "Grifería", "Closets", "Puertas"]);
});

test("un número que es parte de lo que hay que hacer no se toca", () => {
  const r = renglonesDeLista("2 cotizaciones de cocina\n3 baños: grifería");
  assert.deepEqual(r.nuevos, ["2 cotizaciones de cocina", "3 baños: grifería"]);
});

test("los renglones vacíos y los que son solo una viñeta no cuentan", () => {
  const r = renglonesDeLista("\n\nCotizar cocina\n   \n-\n\r\nPisos\r\n");
  assert.deepEqual(r.nuevos, ["Cotizar cocina", "Pisos"]);
});

test("lo que ya está abierto en el proyecto no se repite, aunque cambie una mayúscula o un acento", () => {
  const r = renglonesDeLista("cotizar ventaneria\nCotizar cocina\nPisos", ["Cotizar Ventanería", "Otra cosa"]);
  assert.deepEqual(r.nuevos, ["Cotizar cocina", "Pisos"]);
  assert.deepEqual(r.repetidos, ["cotizar ventaneria"]);
});

test("un renglón repetido dentro de la misma lista entra una sola vez", () => {
  const r = renglonesDeLista("Pisos\npisos\nPISOS ");
  assert.deepEqual(r.nuevos, ["Pisos"]);
  assert.equal(r.repetidos.length, 2);
});

test("nada pegado no da nada", () => {
  assert.deepEqual(renglonesDeLista(""), { nuevos: [], repetidos: [] });
  assert.deepEqual(renglonesDeLista(null), { nuevos: [], repetidos: [] });
});

test("el avance cuenta hechas de cuántas, sin las compras ni lo que ya no va", () => {
  const a = avanceDe([
    { id: 1, status: "listo" }, { id: 2, status: "en-progreso" }, { id: 3, status: "pendiente" },
    { id: 4, status: "listo", descartada: true },          // ya no va: ni hecha ni pendiente
    { id: 5, status: "en-progreso", compra_id: 9 },        // de compras
    { id: 6, status: "listo", type: "Compra" },
  ]);
  assert.deepEqual(a, { hechas: 1, total: 3 });
  assert.deepEqual(avanceDe([]), { hechas: 0, total: 0 });
});

// ── Lo que viaja al cliente ────────────────────────────────────────────────

const tareas = [
  { id: 11, title: "Cotizar ventanería", status: "listo", hecha_at: "2026-11-09T15:00:00Z", visible_cliente: true, ruta_orden: 1,
    nota: "El proveedor subió 8%", assignee_id: 3, due_date: "2026-11-08" },
  { id: 12, title: "Cotizar cocina", status: "en-progreso", espera: true, visible_cliente: true, ruta_orden: 2 },
  { id: 13, title: "Control de iluminación", status: "en-progreso", visible_cliente: true, ruta_orden: 3 },
  { id: 14, title: "Revisar margen con Hernán", status: "en-progreso", visible_cliente: false, ruta_orden: 4 },
  { id: 15, title: "Llamar al cliente por el anticipo", status: "en-progreso", ruta_orden: 5 },
];

test("al cliente le llega solo lo marcado", () => {
  assert.deepEqual(listaDelCliente(tareas).map(t => t.titulo), ["Cotizar ventanería", "Cotizar cocina", "Control de iluminación"]);
});

test("de cada tarea viaja lo escrito para el cliente y en qué está, y nada más", () => {
  const [lista] = listaDelCliente(tareas);
  assert.deepEqual(lista, { id: 11, titulo: "Cotizar ventanería", descripcion: "", estado: "listo", listo_el: "2026-11-09", actualizacion: "", actualizado_el: null });
  // Ni la nota interna, ni de quién es, ni para cuándo estaba.
  listaDelCliente(tareas).forEach(t => assert.deepEqual(Object.keys(t).sort(),
    ["actualizacion", "actualizado_el", "descripcion", "estado", "id", "listo_el", "titulo"]));
  assert.equal(JSON.stringify(listaDelCliente(tareas)).includes("8%"), false);
});

test("la descripción y la actualización para el cliente viajan, con la fecha de la actualización", () => {
  const [t] = listaDelCliente([{
    id: 12, title: "Cotizar cocina", status: "en-progreso", espera: true, visible_cliente: true,
    cliente_descripcion: " Muebles altos y bajos, mesón de cuarzo ", cliente_actualizacion: "Llegaron dos cotizaciones, falta la de Alumina.",
    cliente_actualizado_at: "2026-11-12T14:30:00Z", nota: "Alumina siempre se demora",
  }]);
  assert.equal(t.descripcion, "Muebles altos y bajos, mesón de cuarzo");
  assert.equal(t.actualizacion, "Llegaron dos cotizaciones, falta la de Alumina.");
  assert.equal(t.actualizado_el, "2026-11-12");
  assert.equal(t.estado, "espera");
});

test("sin actualización escrita no se manda una fecha de actualización", () => {
  const [t] = listaDelCliente([{ id: 1, title: "Pisos", status: "en-progreso", visible_cliente: true, cliente_actualizacion: "  ", cliente_actualizado_at: "2026-11-01T10:00:00Z" }]);
  assert.equal(t.actualizacion, ""); assert.equal(t.actualizado_el, null);
});

test("lo que espera a un tercero se dice distinto de lo pendiente", () => {
  assert.deepEqual(listaDelCliente(tareas).map(t => t.estado), ["listo", "espera", "pendiente"]);
});

test("lo que se cerró con «ya no va» y las compras no se le muestran aunque estén marcadas", () => {
  const r = listaDelCliente([
    { id: 1, title: "Cotizar domótica", status: "listo", descartada: true, visible_cliente: true },
    { id: 2, title: "Compra de muestras", status: "en-progreso", compra_id: 4, visible_cliente: true },
    { id: 3, title: "Aprobación", status: "en-progreso", type: "Compra", visible_cliente: true },
    { id: 4, title: "Pisos", status: "en-progreso", visible_cliente: true },
  ]);
  assert.deepEqual(r.map(t => t.titulo), ["Pisos"]);
});

test("va en el orden en que se escribió, no por fecha", () => {
  const r = listaDelCliente([
    { id: 9, title: "C", status: "en-progreso", visible_cliente: true, ruta_orden: 3, due_date: "2026-11-01" },
    { id: 7, title: "A", status: "en-progreso", visible_cliente: true, ruta_orden: 1, due_date: "2026-12-01" },
    { id: 8, title: "B", status: "listo", visible_cliente: true, ruta_orden: 2 },
  ]);
  assert.deepEqual(r.map(t => t.titulo), ["A", "B", "C"]);
});

test("si la base contesta un error en vez de filas, no hay lista y no se rompe", () => {
  assert.deepEqual(listaDelCliente({ code: "42703", message: "column tasks.visible_cliente does not exist" }), []);
  assert.deepEqual(listaDelCliente(null), []);
});

test("el encabezado dice listas de cuántas", () => {
  assert.deepEqual(avanceDeLaLista(listaDelCliente(tareas)), { listas: 1, total: 3 });
});

// ── El correo ──────────────────────────────────────────────────────────────

const conTextos = [
  { id: 11, title: "Cotizar ventanería", status: "listo", hecha_at: "2026-11-09T15:00:00Z", visible_cliente: true, ruta_orden: 1,
    cliente_descripcion: "Aluminio negro, vidrio templado", nota: "El proveedor subió 8%" },
  { id: 12, title: "Cotizar cocina", status: "en-progreso", espera: true, visible_cliente: true, ruta_orden: 2,
    cliente_actualizacion: "Llegaron dos cotizaciones, falta la de Alumina.", cliente_actualizado_at: "2026-11-12T14:30:00Z" },
  { id: 13, title: "Control de iluminación", status: "en-progreso", visible_cliente: true, ruta_orden: 3 },
  { id: 14, title: "Revisar margen con Hernán", status: "en-progreso", visible_cliente: false, ruta_orden: 4 },
];

test("el correo lleva lo mismo que el enlace: cada punto con su descripción, su estado y su actualización", () => {
  const { asunto, cuerpo } = correoDeLaLista({ proyecto: "RES BG", lista: listaDelCliente(conTextos), enlace: "https://x.test/?cliente=abc" });
  assert.equal(asunto, "RES BG · cómo vamos: 1 de 3 puntos listos");
  assert.match(cuerpo, /1 de 3 puntos listos/);
  assert.match(cuerpo, /Cotizar ventanería/); assert.match(cuerpo, /Aluminio negro, vidrio templado/);
  assert.match(cuerpo, /Listo · 9 de noviembre de 2026/);
  assert.match(cuerpo, /Hecho de nuestro lado · esperando respuesta/);
  assert.match(cuerpo, /Llegaron dos cotizaciones, falta la de Alumina\./);
  assert.match(cuerpo, /Actualizado el 12 de noviembre de 2026/);
  assert.match(cuerpo, /Pendiente/);
  assert.match(cuerpo, /href="https:\/\/x\.test\/\?cliente=abc"/);
  // Lo interno no viaja: ni la tarea sin marcar ni la nota de la marcada.
  assert.equal(cuerpo.includes("margen"), false);
  assert.equal(cuerpo.includes("8%"), false);
});

test("sin enlace prendido el correo va sin botón, y con unas líneas van arriba", () => {
  const { cuerpo } = correoDeLaLista({ proyecto: "RES BG", lista: listaDelCliente(conTextos), mensaje: "Hola Pablo,\nasí vamos esta semana." });
  assert.equal(cuerpo.includes("<a href"), false);
  assert.ok(cuerpo.indexOf("Hola Pablo,") < cuerpo.indexOf("puntos listos"));
});

test("lo que se escribe no puede meter HTML en el correo", () => {
  const lista = listaDelCliente([{ id: 1, title: "<b>Pisos</b>", status: "en-progreso", visible_cliente: true,
    cliente_descripcion: '<img src=x onerror="alert(1)">', cliente_actualizacion: "<script>x</script>" }]);
  const { cuerpo } = correoDeLaLista({ proyecto: "X", lista, mensaje: "<a href='http://malo'>clic</a>" });
  assert.equal(/<script|<img|<b>|<a href='http/.test(cuerpo), false);
  assert.match(cuerpo, /&lt;b&gt;Pisos&lt;\/b&gt;/);
});

test("con todo listo lo dice así", () => {
  const { asunto, cuerpo } = correoDeLaLista({ proyecto: "X", lista: listaDelCliente([{ id: 1, title: "Pisos", status: "listo", visible_cliente: true }]) });
  assert.equal(asunto, "X · cómo vamos: 1 de 1 punto listo");
  assert.match(cuerpo, /Todo listo/);
});
