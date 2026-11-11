import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bandeja, esDeCompras, sinCompras, alReprogramar, alDelegar, alCompletar, alDescartar, alReabrir, tareaRapida, FECHAS_RAPIDAS,
} from "../src/lib/bandeja.js";

// ── LA BANDEJA ─────────────────────────────────────────────────────────────
//
// Lo que había el 10/11/2026: 23 tareas abiertas, 16 vencidas, 11 de ellas
// pasos de compras copiados, y las 9 de Hernán todas «urgentes». Una lista así
// se aprende a ignorar. Ahora son dos partes —«Me toca» y «Espero de otros»—,
// manda la fecha, lo vencido pide una decisión y las compras no son tareas.

const HOY = "2026-11-11";
const YO = 1, CAMILA = 7, JOHANNA = 2;
let n = 0;
const t = (extra = {}) => ({ id: ++n, title: `Tarea ${n}`, status: "en-progreso", assignee_id: YO, created_by: YO, due_date: null, type: "Otro", ...extra });
const ids = grupos => Object.fromEntries(grupos.map(g => [g.clave, g.tareas.map(x => x.title)]));

test("un aviso de compras no es una tarea de nadie", () => {
  assert.equal(esDeCompras({ type: "Compra" }), true);
  assert.equal(esDeCompras({ type: "Gestión", compra_id: 26 }), true);
  // Las de antes de que tuvieran tipo propio se reconocen por su nota.
  assert.equal(esDeCompras({ type: "Gestión", notes: "Gestión de compras · Andamios" }), true);
  assert.equal(esDeCompras({ type: "Gestión", notes: "Gestión de RES BG" }), false);
  assert.equal(esDeCompras(null), false);
  assert.deepEqual(sinCompras([{ id: 1, type: "Compra" }, { id: 2, type: "Otro" }]).map(x => x.id), [2]);
});

test("me toca lo mío, por fecha: lo vencido primero, y pide una decisión", () => {
  const tareas = [
    t({ title: "Revisión Contrato", due_date: "2026-10-07" }),
    t({ title: "Llamar al municipio", due_date: HOY }),
    t({ title: "Entregar planos", due_date: "2026-11-14" }),
    t({ title: "Cerrar planilla", due_date: "2026-11-18" }),        // justo a una semana: todavía «esta semana»
    t({ title: "Renovar póliza", due_date: "2026-12-01" }),
    t({ title: "Ordenar archivo" }),
    t({ title: "Ya hecha", due_date: "2026-10-01", status: "listo" }),
    t({ title: "Comprar: gypsum", due_date: "2026-11-05", type: "Compra", compra_id: 9 }),
    t({ title: "De Camila", assignee_id: CAMILA, created_by: CAMILA, due_date: "2026-10-01" }),
    t({ title: "Vencida más vieja", due_date: "2026-09-30" }),
  ];
  const b = bandeja({ tareas, usuarioId: YO, hoy: HOY });
  assert.deepEqual(ids(b.meToca), {
    vencidas: ["Vencida más vieja", "Revisión Contrato"],
    hoy: ["Llamar al municipio"],
    semana: ["Entregar planos", "Cerrar planilla"],
    despues: ["Renovar póliza"],
    sinFecha: ["Ordenar archivo"],
  });
  assert.equal(b.meToca[0].pide, "decision");
  assert.deepEqual(b.cuenta, { meToca: 7, espero: 0, vencidas: 2, hoy: 1, encargadasVencidas: 0 });
  // Un grupo sin nada no aparece: no hay títulos sobre un hueco.
  assert.deepEqual(bandeja({ tareas: [], usuarioId: YO, hoy: HOY }), { meToca: [], espero: [], cuenta: { meToca: 0, espero: 0, vencidas: 0, hoy: 0, encargadasVencidas: 0 } });
});

test("espero de otros: lo que encargué, y lo mío que ya depende de un tercero", () => {
  const tareas = [
    t({ title: "Para Camila", assignee_id: CAMILA, due_date: "2026-11-01" }),
    t({ title: "Para el ingeniero", assignee_id: null, responsable_externo: "JC Garcés", due_date: "2026-11-20" }),
    t({ title: "Permiso pedido al municipio", espera: true, due_date: "2026-11-03" }),
    t({ title: "Me la encargó Johanna", created_by: JOHANNA, due_date: "2026-11-12" }),
    t({ title: "De otros para otros", assignee_id: CAMILA, created_by: JOHANNA }),
  ];
  const b = bandeja({ tareas, usuarioId: YO, hoy: HOY });
  assert.deepEqual(ids(b.espero), {
    encargadas: ["Para Camila", "Para el ingeniero"],
    terceros: ["Permiso pedido al municipio"],
  });
  // Lo que espera a un tercero NO está en «Me toca», aunque su fecha ya pasó:
  // mi parte está hecha.
  assert.deepEqual(ids(b.meToca), { semana: ["Me la encargó Johanna"] });
  assert.equal(b.cuenta.encargadasVencidas, 1);
  // Para Camila, lo que yo le encargué es suyo.
  assert.deepEqual(ids(bandeja({ tareas, usuarioId: CAMILA, hoy: HOY }).meToca), { vencidas: ["Para Camila"], sinFecha: ["De otros para otros"] });
});

test("lo que acompaño es mío; lo que nadie tomó es de quien lo escribió, y del Director todo", () => {
  const acompanada = t({ title: "Visita a obra", assignee_id: CAMILA, created_by: CAMILA, due_date: HOY });
  const suelta = t({ title: "Pedir pólizas", assignee_id: null });
  const ajena = t({ title: "Suelta de Johanna", assignee_id: null, created_by: JOHANNA });
  const tareas = [acompanada, suelta, ajena];
  const acompanantes = new Map([[acompanada.id, [YO]]]);
  const b = bandeja({ tareas, usuarioId: YO, acompanantes, hoy: HOY });
  assert.deepEqual(ids(b.meToca), { hoy: ["Visita a obra"], sinDueno: ["Pedir pólizas"] });
  assert.equal(b.meToca.find(g => g.clave === "sinDueno").pide, "dueno");
  // El Director ve todo lo que no tiene dueño.
  assert.deepEqual(ids(bandeja({ tareas, usuarioId: YO, acompanantes, veTodo: true, hoy: HOY }).meToca).sinDueno, ["Pedir pólizas", "Suelta de Johanna"]);
  // Los números de la base pueden venir como texto.
  assert.deepEqual(ids(bandeja({ tareas: [t({ title: "x", assignee_id: "1" })], usuarioId: 1, hoy: HOY }).meToca), { sinFecha: ["x"] });
});

test("un lead que espera al cliente está en «Espero de otros»; el día del recordatorio pasa a «Me toca»", () => {
  const leads = [
    { id: 18, nombre: "CHRONIX", resultado: null, responsable_id: YO, espera_desde: "2026-11-06", espera_que: "que apruebe el presupuesto", recordar_el: HOY },
    { id: 21, nombre: "MINDKIDS", resultado: null, responsable_id: YO, espera_desde: "2026-11-10", recordar_el: "2026-11-17" },
    { id: 25, nombre: "Grupo Global", resultado: null, responsable_id: CAMILA, espera_desde: "2026-11-01", recordar_el: "2026-11-05" },
    { id: 14, nombre: "Puembo", resultado: null, responsable_id: YO },                         // no espera a nadie
    { id: 15, nombre: "Diners Aereo GYE", resultado: "ganado", responsable_id: YO, espera_desde: "2026-11-01", recordar_el: HOY },
  ];
  const b = bandeja({ tareas: [], usuarioId: YO, leads, hoy: HOY });
  const insistir = b.meToca.find(g => g.clave === "insistir");
  assert.deepEqual(insistir.leads.map(x => [x.lead.nombre, x.texto]),
    [["CHRONIX", "Insistir con el cliente: sin respuesta hace 5 días · que apruebe el presupuesto"]]);
  assert.deepEqual(b.espero.find(g => g.clave === "clientes").leads.map(x => x.lead.nombre), ["MINDKIDS"]);
  assert.deepEqual(b.cuenta, { meToca: 1, espero: 1, vencidas: 0, hoy: 0, encargadasVencidas: 0 });
  // El Director ve los de toda la oficina.
  assert.deepEqual(bandeja({ tareas: [], usuarioId: YO, leads, veTodo: true, hoy: HOY }).meToca[0].leads.map(x => x.lead.nombre), ["CHRONIX", "Grupo Global"]);
});

test("lo vencido se resuelve de un toque: nueva fecha, delegar, o ya no va", () => {
  const AHORA = new Date("2026-11-11T15:00:00Z");
  assert.deepEqual(FECHAS_RAPIDAS.map(f => f.label), ["Hoy", "Mañana", "En una semana"]);
  assert.deepEqual(alReprogramar("2026-11-12"), { due_date: "2026-11-12" });
  assert.deepEqual(alReprogramar(""), { due_date: null });
  assert.deepEqual(alDelegar(CAMILA), { assignee_id: CAMILA, responsable_externo: null });
  assert.deepEqual(alCompletar("Hernan Cueva", AHORA), { status: "listo", hecha_at: "2026-11-11T15:00:00.000Z", hecha_por: "Hernan Cueva" });
  // «Ya no va» la cierra —no vuelve a pedir nada— y dice que no se hizo.
  const d = alDescartar("Hernan Cueva", AHORA);
  assert.deepEqual(d, { status: "listo", descartada: true, hecha_at: "2026-11-11T15:00:00.000Z", hecha_por: "Hernan Cueva" });
  const tarea = t({ title: "Presupuesto corregido", due_date: "2026-10-23" });
  assert.equal(bandeja({ tareas: [{ ...tarea, ...d }], usuarioId: YO, hoy: HOY }).cuenta.meToca, 0);
  // Y se puede volver a abrir.
  assert.deepEqual(alReabrir(), { status: "en-progreso", descartada: false, hecha_at: null, hecha_por: null });
});

test("se agrega escribiendo y Enter: es mía, con su proyecto si lo elegí al lado", () => {
  assert.deepEqual(tareaRapida({ titulo: "  Llamar a Marcelo ", usuarioId: YO, proyecto: { esLead: true, id: 18, nombre: "CHRONIX" }, fecha: "2026-11-12" }).fila, {
    title: "Llamar a Marcelo", assignee_id: YO, created_by: YO, lead_id: 18, project_id: null, due_date: "2026-11-12",
    status: "en-progreso", type: "Otro", priority: "media", notes: "Tarea de CHRONIX",
  });
  // Sin proyecto y sin fecha también es una tarea; de un proyecto viejo de Ajustes, cuelga de ahí.
  const suelta = tareaRapida({ titulo: "Pagar el SRI", usuarioId: YO }).fila;
  assert.deepEqual([suelta.lead_id, suelta.project_id, suelta.due_date, suelta.notes], [null, null, null, null]);
  assert.equal(tareaRapida({ titulo: "x", usuarioId: YO, proyecto: { esLead: false, id: 4, nombre: "Oficina" } }).fila.project_id, 4);
  // Nunca nace urgente: manda la fecha.
  assert.equal(suelta.priority, "media");
  assert.ok(tareaRapida({ titulo: "   ", usuarioId: YO }).error);
});

test("el correo de la mañana separa lo mismo que la bandeja: no pueden decir cosas distintas", async () => {
  const { armarResumen, esDeCompras: esDeComprasDelCorreo } = await import("../api/_resumen.js");
  const usuarios = [
    { id: YO, nombre: "Hernan Cueva", email: "director@ejemplo.test", rol: "owner", activo: true },
    { id: CAMILA, nombre: "Camila Mena", email: "camila@ejemplo.test", rol: "arquitecto", activo: true },
    { id: JOHANNA, nombre: "Johanna", email: "johanna@ejemplo.test", rol: "assistant", activo: true },
  ];
  n = 100;
  const tareas = [
    t({ title: "Vencida mía", due_date: "2026-10-07" }),
    t({ title: "Hoy mía", due_date: HOY }),
    t({ title: "Mañana mía", due_date: "2026-11-12" }),
    t({ title: "Semana mía", due_date: "2026-11-16" }),
    t({ title: "Lejos mía", due_date: "2026-12-20" }),
    t({ title: "Sin fecha mía" }),
    t({ title: "Espera a un tercero", espera: true, due_date: "2026-11-01" }),
    t({ title: "Le encargué a Camila, vencida", assignee_id: CAMILA, due_date: "2026-11-03" }),
    t({ title: "Le encargué a Camila, en fecha", assignee_id: CAMILA, due_date: "2026-11-25" }),
    t({ title: "Al ingeniero", assignee_id: null, responsable_externo: "JC Garcés", due_date: "2026-11-02" }),
    t({ title: "Aprobar compra: andamios", type: "Compra", compra_id: 5, compra_estado: "pendiente_aprobacion", due_date: "2026-10-30" }),
    t({ title: "Comprar: gypsum", assignee_id: JOHANNA, type: "Compra", compra_id: 6, compra_estado: "aprobada", due_date: "2026-11-05" }),
    t({ title: "Comprar: piso", assignee_id: JOHANNA, type: "Compra", compra_id: 7, compra_estado: "aprobada" }),
    t({ title: "Recibir: camisas", assignee_id: JOHANNA, type: "Compra", compra_id: 8, compra_estado: "comprada" }),
    t({ title: "Hecha", status: "listo", due_date: "2026-11-01" }),
  ];
  // La regla de qué es un aviso de compras es la misma en los dos lados.
  for (const x of tareas) assert.equal(esDeComprasDelCorreo(x), esDeCompras(x), x.title);

  const sobres = armarResumen({ tareas, usuarios, leads: [], accesos: [], hoy: HOY });
  for (const u of usuarios) {
    const s = sobres.find(x => x.usuario.id === u.id);
    const b = bandeja({ tareas, usuarioId: u.id, hoy: HOY });
    const titulos = lista => lista.map(x => x.title).sort();
    const deLaBandeja = clave => titulos(b.meToca.find(g => g.clave === clave)?.tareas || []);
    if (!s) { assert.equal(b.cuenta.meToca + b.cuenta.espero, 0, `${u.nombre} no recibe correo y tampoco tiene nada`); continue; }
    assert.deepEqual(titulos(s.atrasadas), deLaBandeja("vencidas"), `vencidas de ${u.nombre}`);
    assert.deepEqual(titulos(s.hoy), deLaBandeja("hoy"), `hoy de ${u.nombre}`);
    assert.deepEqual(titulos([...s.manana, ...s.estaSemana]), deLaBandeja("semana"), `esta semana de ${u.nombre}`);
    assert.deepEqual(titulos(s.masAdelante), deLaBandeja("despues"), `más adelante de ${u.nombre}`);
    assert.deepEqual(titulos(s.sinFecha), deLaBandeja("sinFecha"), `sin fecha de ${u.nombre}`);
    assert.deepEqual(titulos(s.espero), titulos(b.espero.find(g => g.clave === "encargadas")?.tareas || []), `lo que encargó ${u.nombre}`);
  }
  const mio = sobres.find(x => x.usuario.id === YO);
  // Ninguna compra entre lo atrasado: van en su renglón, por el paso en el que están.
  assert.equal([...mio.atrasadas, ...mio.hoy, ...mio.sinFecha].some(x => /compra|Comprar|Recibir/i.test(x.title)), false);
  assert.deepEqual(mio.compras, { visto: 1, devueltas: 0, comprar: 0, recibir: 0, total: 1 });
  assert.deepEqual(sobres.find(x => x.usuario.id === JOHANNA).compras, { visto: 0, devueltas: 0, comprar: 2, recibir: 1, total: 3 });
  // De lo que encargué, dice quién lo tiene y si venció.
  assert.deepEqual(mio.espero.map(x => [x.title, x.persona, x.vencida]), [
    ["Al ingeniero", "JC Garcés", true],
    ["Le encargué a Camila, vencida", "Camila Mena", true],
    ["Le encargué a Camila, en fecha", "Camila Mena", false],
  ]);
  // Johanna no tiene tareas, solo compras: igual recibe su correo.
  assert.equal(sobres.find(x => x.usuario.id === JOHANNA).atrasadas.length, 0);
});
