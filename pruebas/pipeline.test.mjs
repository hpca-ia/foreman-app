import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TIPOS, tipoDe, sePersigue, esProyecto, etapasDelTipo, etapaDelLead, etapaAlCambiarDeTipo,
  diasEntre, sumarDias, diaCorto, proximoPaso, estadoDelLead, enEspera, loQueDice, avisosDelPipeline, esMiAviso,
  alEsperar, alResponder, alPosponer, SE_ESPERA, alCambiarEtapa, alCambiarTipo, alAprobar, alPerder, alReabrir, porTipo,
  CATALOGO_BASE,
} from "../src/modules/leads/pipeline.js";
import { avisosDelTablero } from "../src/lib/avisos.js";

// ── EL PIPELINE ES LO QUE SE PERSIGUE ──────────────────────────────────────
//
// Hernán: «el "estamos acá" puede marear a dónde en realidad está». Un lead
// tenía una fila por etapa, cada una con su estado, y se podía marcar «en
// curso» en tres a la vez. Ahora está en una etapa —la dice él— elegida de las
// de su tipo: Diseño, Construcción, o Diseño y construcción.

const HOY = "2026-11-11";
const catalogo = [
  ...CATALOGO_BASE,
  // Las de antes siguen en la base, apagadas: las tareas viejas las nombran.
  { id: "con_gris", nombre: "Obra gris", orden: 60, tunel: "construccion", activa: false },
  { id: "plan_masa", nombre: "Plan masa", orden: 15, tunel: "lead", activa: false },
];
const lead = (extra = {}) => ({ id: 18, nombre: "CHRONIX", tunel: "diseno_construccion", etapa: "dyc_presupuesto", resultado: null, responsable_id: 1, created_by: 1, ...extra });
const tarea = (extra = {}) => ({ id: 1, lead_id: 18, title: "Presupuesto corregido", status: "en-progreso", due_date: null, type: "Gestión", ...extra });

test("el tipo es uno de tres; «lead» y «arquitectura» eran de antes", () => {
  assert.deepEqual(Object.keys(TIPOS), ["diseno", "construccion", "diseno_construccion"]);
  assert.equal(TIPOS.diseno_construccion.label, "Diseño y construcción");
  assert.equal(tipoDe({ tunel: "construccion" }), "construccion");
  assert.equal(tipoDe({ tunel: "arquitectura" }), "diseno");
  // «lead» quería decir «todavía se persigue»: eso ahora lo dice el resultado.
  assert.equal(tipoDe({ tunel: "lead" }), null);
  assert.equal(tipoDe(null), null);
});

test("se persigue mientras no tenga resultado; aprobado sale del pipeline", () => {
  assert.equal(sePersigue(lead()), true);
  assert.equal(sePersigue(lead({ resultado: "ganado" })), false);
  assert.equal(sePersigue(lead({ resultado: "perdido" })), false);
  // Quién lleva libro y actas: lo aprobado, lo que tiene obra, y RES BG, que
  // se persigue todavía pero ya está marcado como proyecto.
  assert.equal(esProyecto({ resultado: "ganado" }), true);
  assert.equal(esProyecto({ obra_id: 13 }), true);
  assert.equal(esProyecto({ resultado: null, es_lead: false }), true);
  assert.equal(esProyecto({ resultado: null, es_lead: true }), false);
  assert.equal(esProyecto({ resultado: null }), false, "sin el dato, no es proyecto");
});

test("las etapas dependen del tipo, y el lead está en una sola", () => {
  assert.deepEqual(etapasDelTipo(catalogo, "diseno").map(e => e.nombre),
    ["Contacto", "Levantamiento", "Plan masa", "Anteproyecto", "Propuesta de honorarios", "Negociación"]);
  assert.deepEqual(etapasDelTipo(catalogo, "construccion").map(e => e.nombre),
    ["Contacto", "Levantamiento", "Ingenierías", "Presupuesto", "Propuesta enviada", "Negociación"]);
  assert.equal(etapasDelTipo(catalogo, "diseno_construccion").length, 8);
  // Las de ejecutar —obra gris— están apagadas: no se ofrecen.
  assert.equal(etapasDelTipo(catalogo, "construccion").some(e => e.id === "con_gris"), false);
  assert.equal(etapasDelTipo(catalogo, null).length, 0);

  assert.equal(etapaDelLead(lead(), catalogo).nombre, "Presupuesto");
  // Una etapa que no es de su tipo no cuenta: el desplegable pide elegir.
  assert.equal(etapaDelLead(lead({ etapa: "con_presupuesto" }), catalogo), null);
  assert.equal(etapaDelLead(lead({ tunel: "lead" }), catalogo), null);
});

test("al cambiar el tipo cae en la etapa que se llama igual, o en la primera", () => {
  assert.equal(etapaAlCambiarDeTipo(lead(), "construccion", catalogo), "con_presupuesto");
  assert.equal(etapaAlCambiarDeTipo(lead({ etapa: "dyc_plan_masa" }), "construccion", catalogo), "con_contacto");
  const c = alCambiarTipo(lead(), "construccion", catalogo);
  assert.deepEqual(c.campos, { tunel: "construccion", etapa: "con_presupuesto" });
  assert.equal(c.detalle, "Pasa de Diseño y construcción a Construcción, en Presupuesto.");
  // Uno que no tenía tipo: se le pone, y arranca en la primera.
  assert.deepEqual(alCambiarTipo(lead({ tunel: "lead", etapa: "nuevo" }), "diseno", catalogo).campos, { tunel: "diseno", etapa: "dis_contacto" });
  assert.equal(alCambiarTipo(lead(), "diseno_construccion", catalogo), null, "el mismo tipo no es un cambio");
  assert.equal(alCambiarTipo(lead(), "otra_cosa", catalogo), null);
});

test("pasar de etapa es elegir otra: sin orden obligado, y queda en la historia", () => {
  // Puede presupuestar antes del plan masa: se elige cualquiera.
  const c = alCambiarEtapa(lead(), "dyc_plan_masa", catalogo);
  assert.deepEqual(c, { campos: { etapa: "dyc_plan_masa" }, tipo: "etapa", detalle: "Presupuesto → Plan masa", etapa_de: "dyc_presupuesto", etapa_a: "dyc_plan_masa" });
  assert.equal(alCambiarEtapa(lead(), "dyc_presupuesto", catalogo), null);
  assert.equal(alCambiarEtapa(lead({ etapa: "nuevo" }), "dyc_contacto", catalogo).detalle, "Sin etapa → Contacto");
});

test("las fechas se cuentan en días, sin correrse por la hora", () => {
  assert.equal(diasEntre("2026-11-06", "2026-11-11"), 5);
  assert.equal(diasEntre("2026-11-11", "2026-11-06"), -5);
  assert.equal(diasEntre("2026-11-06T23:30:00", "2026-11-07"), 1);
  assert.equal(sumarDias("2026-11-11", 3), "2026-11-14");
  assert.equal(sumarDias("2026-11-28", 7), "2026-12-05");
  assert.equal(diaCorto("2026-11-14"), "14 nov");
  assert.equal(diaCorto(""), "");
});

test("el próximo paso es la tarea abierta más próxima; las compras no cuentan", () => {
  const tareas = [
    tarea({ id: 1, due_date: "2026-11-20" }),
    tarea({ id: 2, title: "Llamar a Marcelo", due_date: "2026-11-13" }),
    tarea({ id: 3, title: "Ya hecha", due_date: "2026-11-01", status: "listo" }),
    tarea({ id: 4, title: "Comprar: andamios", due_date: "2026-11-02", type: "Compra", compra_id: 9 }),
    tarea({ id: 5, title: "Sin fecha" }),
  ];
  assert.equal(proximoPaso(tareas).title, "Llamar a Marcelo");
  // Sin ninguna con fecha, la primera que se escribió: se dice cuál es.
  assert.equal(proximoPaso([tarea({ id: 9, title: "B" }), tarea({ id: 7, title: "A" })]).title, "A");
  assert.equal(proximoPaso([tarea({ status: "listo" })]), null);
  assert.equal(proximoPaso(), null);
});

// Hernán, 26/11/2026: «El workflow del pipeline es confuso». De sus nueve
// proyectos, cinco estaban en «Insistir con el cliente» en rojo desde hacía
// hasta quince días, y «Insistí hoy» no se había usado nunca.
test("un proyecto está EN CURSO o EN ESPERA, y dice lo suyo; no tener fechas ya no es una falta", () => {
  const dice = (l, ts) => { const e = estadoDelLead(l, ts, HOY); return [e.clase, enEspera(e), loQueDice(e)]; };

  // EN CURSO.
  assert.deepEqual(dice(lead(), [tarea({ due_date: "2026-11-14" })]), ["al_dia", false, "«Presupuesto corregido» · en 3 días"]);
  assert.deepEqual(dice(lead(), [tarea({ due_date: HOY })]), ["al_dia", false, "«Presupuesto corregido» · hoy"]);
  assert.deepEqual(dice(lead(), [tarea({ due_date: "2026-11-12" })]), ["al_dia", false, "«Presupuesto corregido» · mañana"]);
  assert.deepEqual(dice(lead(), [tarea({ due_date: "2026-10-23" })]), ["vencido", false, "«Presupuesto corregido» · atrasado 19 días"]);
  // Sin fechas, o sin nada abierto: se dice cuánto hay, y no es una falta.
  assert.deepEqual(dice(lead(), []), ["sin_paso", false, "Sin actividades abiertas"]);
  assert.deepEqual(dice(lead(), [tarea()]), ["sin_paso", false, "1 actividad abierta, sin fecha"]);
  // Lo hecho y las compras no cuentan.
  assert.deepEqual(dice(lead(), [tarea(), tarea({ id: 2 }), tarea({ id: 3, status: "listo" }), tarea({ id: 4, type: "Compra" })]), ["sin_paso", false, "2 actividades abiertas, sin fecha"]);

  // EN ESPERA: la pelota está del otro lado hasta el día que se dijo.
  const espera = lead({ espera_desde: "2026-11-06", espera_que: "que apruebe el presupuesto", recordar_el: "2026-11-13" });
  assert.deepEqual(dice(espera, []), ["esperando", true, "En espera hace 5 días · que apruebe el presupuesto · se recuerda el 13 nov"]);
  // Aunque tenga un paso nuestro atrasado: mientras espera, manda la espera.
  assert.equal(estadoDelLead(espera, [tarea({ due_date: "2026-10-01" })], HOY).clase, "esperando");
  // SIN RECORDATORIO ESTÁ ESTACIONADO, NO EN FALTA. (Antes «sin día se recuerda ya», y volvía en rojo.)
  assert.deepEqual(dice({ ...espera, recordar_el: null }, []), ["esperando", true, "En espera hace 5 días · que apruebe el presupuesto"]);
  // Llegó el día que se pidió: toca revisarlo, y dice hace cuánto tocaba.
  assert.deepEqual(dice({ ...espera, recordar_el: HOY }, []), ["insistir", true, "En espera hace 5 días · que apruebe el presupuesto · tocaba revisarlo hoy"]);
  assert.deepEqual(dice({ ...espera, espera_que: null, recordar_el: "2026-11-09" }, []), ["insistir", true, "En espera hace 5 días · tocaba revisarlo hace 2 días"]);
  assert.equal(loQueDice(estadoDelLead(lead({ espera_desde: "2026-11-10", recordar_el: "2026-11-10" }), [], HOY)), "En espera hace 1 día · tocaba revisarlo hace 1 día");
});

test("dejar en espera: qué se espera y el recordatorio son opcionales, y cada toque queda en la historia", () => {
  const e = alEsperar({ que: " que apruebe el presupuesto ", recordarEl: "2026-11-14", hoy: HOY });
  assert.deepEqual(e.campos, { espera_desde: HOY, espera_que: "que apruebe el presupuesto", recordar_el: "2026-11-14" });
  assert.equal(e.detalle, "Queda en espera: que apruebe el presupuesto. Se recuerda el 14 nov.");
  // SIN RECORDATORIO: queda estacionado, y no avisa.
  const sin = alEsperar({ que: "Un proveedor", hoy: HOY });
  assert.deepEqual([sin.campos, sin.detalle], [{ espera_desde: HOY, espera_que: "Un proveedor", recordar_el: null }, "Queda en espera: Un proveedor. Sin recordatorio."]);
  assert.deepEqual(alEsperar({ recordarEl: "", hoy: HOY }).campos, { espera_desde: HOY, espera_que: null, recordar_el: null });
  assert.equal(estadoDelLead({ ...lead(), ...sin.campos }, [], HOY).clase, "esperando");
  assert.ok(alEsperar({ que: "x", recordarEl: "2026-11-01", hoy: HOY }).error, "no se recuerda en el pasado");
  // De quién se espera, de un toque: es lo que se escribe.
  assert.deepEqual(SE_ESPERA, ["Respuesta del cliente", "Un proveedor", "Lo retomamos más adelante"]);

  const esperando = lead({ espera_desde: "2026-11-06", espera_que: "x", recordar_el: HOY });
  // SIGUE EN ESPERA: se recuerda otro día...
  assert.deepEqual(alPosponer({ recordarEl: "2026-11-20", hoy: HOY }), { campos: { recordar_el: "2026-11-20" }, detalle: "Sigue en espera. Se recuerda el 20 nov." });
  assert.ok(alPosponer({ recordarEl: "2026-11-01", hoy: HOY }).error);
  // ...o sin recordatorio: el que estaba para revisar deja de avisar.
  const estacionar = alPosponer({ hoy: HOY });
  assert.deepEqual(estacionar, { campos: { recordar_el: null }, detalle: "Sigue en espera, sin recordatorio." });
  assert.equal(estadoDelLead({ ...esperando, ...estacionar.campos }, [], HOY).clase, "esperando");
  // RETOMAR: deja de estar en espera, y vuelve a estar en curso.
  const r = alResponder(esperando, HOY);
  assert.deepEqual(r.campos, { espera_desde: null, espera_que: null, recordar_el: null });
  assert.equal(r.detalle, "Se retoma, después de 5 días en espera.");
  assert.equal(enEspera(estadoDelLead({ ...esperando, ...r.campos }, [], HOY)), false);
});

test("las dos salidas: aprobado sale del pipeline, perdido pide el motivo", () => {
  const a = alAprobar();
  assert.deepEqual(a.campos, { resultado: "ganado", es_lead: false, espera_desde: null, espera_que: null, recordar_el: null });
  assert.equal(sePersigue({ ...lead(), ...a.campos }), false);
  assert.ok(alPerder("  ").error);
  const p = alPerder(" precio ");
  assert.deepEqual(p.campos, { resultado: "perdido", motivo_perdida: "precio", espera_desde: null, espera_que: null, recordar_el: null });
  assert.equal(p.detalle, "Perdido: precio");
  assert.deepEqual(alReabrir().campos, { resultado: null, motivo_perdida: null });
});

test("los avisos son DOS y solo de lo que se persigue: toca revisar uno en espera, o venció algo con fecha", () => {
  const leads = [
    lead({ id: 1, nombre: "Al día" }),
    lead({ id: 2, nombre: "RES ZULETA", responsable_id: 7 }),
    lead({ id: 3, nombre: "CHRONIX", espera_desde: "2026-11-06", recordar_el: HOY }),
    lead({ id: 4, nombre: "MINDKIDS" }),                                                                  // sin nada con fecha
    lead({ id: 5, nombre: "Espera tranquila", espera_desde: "2026-11-10", recordar_el: "2026-11-17" }),
    lead({ id: 6, nombre: "Diners Aereo GYE", resultado: "ganado" }),
    lead({ id: 7, nombre: "Otro para revisar", espera_desde: "2026-11-01", recordar_el: "2026-11-10" }),
    lead({ id: 8, nombre: "Estacionado", espera_desde: "2026-10-01", recordar_el: null }),               // en espera, sin recordatorio
  ];
  const tareas = [
    tarea({ id: 10, lead_id: 1, due_date: "2026-11-15" }),
    tarea({ id: 11, lead_id: 2, title: "gestionar reunion", due_date: "2026-10-05" }),
    // La base puede devolver el id del lead como texto.
    tarea({ id: 12, lead_id: "6", title: "Revisión Contrato", due_date: "2026-10-07" }),
    tarea({ id: 13, lead_id: 4, title: "Cotizar" }),
  ];
  const avisos = avisosDelPipeline({ leads, tareas, hoy: HOY });
  assert.deepEqual(avisos.map(a => [a.clase, a.nombre]), [
    ["insistir", "Otro para revisar"],    // tocaba ayer
    ["insistir", "CHRONIX"],              // toca hoy
    ["vencido", "RES ZULETA"],
  ]);
  assert.equal(avisos[0].texto, "En espera hace 10 días · tocaba revisarlo hace 1 día");
  assert.equal(avisos[2].texto, "«gestionar reunion» · atrasado 37 días");
  // «SIN PRÓXIMO PASO» YA NO AVISA, ni el que está estacionado: no están en falta.
  assert.equal(avisos.some(a => ["MINDKIDS", "Estacionado", "Espera tranquila"].includes(a.nombre)), false);
  // El aprobado tiene una tarea vencida y no avisa acá: ya no es del pipeline.
  assert.equal(avisos.some(a => a.nombre === "Diners Aereo GYE"), false);
  // Cada quien ve los suyos; el Director, todos.
  assert.equal(esMiAviso(avisos[2], 7), true);
  assert.equal(esMiAviso(avisos[2], 1), true, "lo creó");
  assert.equal(esMiAviso(avisos[2], 99), false);
  assert.equal(esMiAviso(avisos[2], 99, true), true);
  assert.deepEqual(avisosDelPipeline({}), []);
});

test("el servidor arma los mismos avisos que la pantalla: el correo no puede decir otra cosa", async () => {
  const api = await import("../api/_avisosDelPipeline.js");
  const leads = [
    lead({ id: 1, nombre: "A" }), lead({ id: 2, nombre: "B", espera_desde: "2026-11-01", espera_que: "firma", recordar_el: "2026-11-09" }),
    lead({ id: 3, nombre: "C", espera_desde: "2026-11-10", recordar_el: "2026-11-20" }), lead({ id: 4, nombre: "D", resultado: "perdido" }),
    lead({ id: 5, nombre: "E", espera_desde: "2026-11-11T03:00:00+00:00", recordar_el: null }), lead({ id: 6, nombre: "F" }),
  ];
  const tareas = [
    tarea({ id: 1, lead_id: 1, due_date: "2026-11-01" }), tarea({ id: 2, lead_id: 1, due_date: "2026-10-01", status: "listo" }),
    tarea({ id: 3, lead_id: 6, due_date: "2026-11-30" }), tarea({ id: 4, lead_id: "6", type: "Compra", due_date: "2026-11-02" }),
    tarea({ id: 5, lead_id: 4, due_date: "2026-11-02" }), tarea({ id: 6, lead_id: null }),
  ];
  for (const hoy of ["2026-11-11", "2026-11-25", "2026-12-01"]) {
    assert.deepEqual(api.avisosDelPipeline({ leads, tareas, hoy }), avisosDelPipeline({ leads, tareas, hoy }), `el ${hoy}`);
  }
  assert.equal(api.esMiAviso({ responsable_id: 7, created_by: 1 }, "7"), esMiAviso({ responsable_id: 7, created_by: 1 }, "7"));
});

test("el correo de la mañana lleva del pipeline lo que está en espera y hoy toca revisar, y nada más", async () => {
  const { armarResumen } = await import("../api/_resumen.js");
  const pipeline = [
    { clase: "insistir", lead_id: 3, nombre: "CHRONIX", texto: "En espera hace 5 días · tocaba revisarlo hoy", responsable_id: 2, created_by: 2 },
    { clase: "vencido", lead_id: 2, nombre: "RES ZULETA", texto: "«gestionar reunion» · atrasado 37 días", responsable_id: 2, created_by: 2 },
    // Una clase de antes, por si llegara: ya no se manda.
    { clase: "sin_paso", lead_id: 4, nombre: "MINDKIDS", texto: "Sin actividades abiertas", responsable_id: 1, created_by: 1 },
  ];
  const usuarios = [
    { id: 1, nombre: "Hernan Cueva", email: "director@ejemplo.test", rol: "owner", activo: true },
    { id: 2, nombre: "Camila Mena", email: "camila@ejemplo.test", rol: "arquitecto", activo: true },
    { id: 3, nombre: "Lizeth", email: "lizeth@ejemplo.test", rol: "residente", activo: true },
  ];
  const sobres = armarResumen({ tareas: [], usuarios, leads: [], accesos: [], hoy: HOY, pipeline });
  const de = id => sobres.find(s => s.usuario.id === id);
  // El Director ve los de toda la oficina.
  assert.deepEqual(de(1).pipeline.map(a => a.nombre), ["CHRONIX"]);
  // Quien lleva el proyecto recibe el suyo, aunque no tenga ninguna tarea para hoy.
  assert.deepEqual(de(2).pipeline.map(a => a.nombre), ["CHRONIX"]);
  // El paso vencido no se repite: es una tarea, y ya sale en ATRASADO. Y «sin próximo paso» no avisa más.
  assert.equal(sobres.some(s => s.pipeline.some(a => a.clase !== "insistir")), false);
  // A quien no tiene nada no se le manda un correo vacío.
  assert.equal(de(3), undefined);
  assert.deepEqual(armarResumen({ tareas: [], usuarios, leads: [], accesos: [], hoy: HOY }), [], "sin avisos del pipeline no se rompe");
});

test("el pipeline se lee por tipo, y dentro de cada tipo cuántos hay en cada etapa", () => {
  const leads = [
    lead({ id: 13, nombre: "RES BG", tunel: "construccion", etapa: "con_ingenierias" }),
    lead({ id: 21, nombre: "MINDKIDS", tunel: "construccion", etapa: "con_presupuesto" }),
    lead({ id: 14, nombre: "Plaza Comercial Puembo.", tunel: "diseno", etapa: "dis_negociacion" }),
    lead({ id: 22, nombre: "Concurso PRONACA", tunel: "diseno", etapa: "dis_anteproyecto" }),
    lead({ id: 18, nombre: "CHRONIX" }),
    lead({ id: 30, nombre: "Recién dictado", tunel: "lead", etapa: "nuevo" }),
  ];
  const grupos = porTipo(leads, catalogo);
  assert.deepEqual(grupos.map(g => [g.label, g.leads.map(l => l.nombre)]), [
    ["Diseño", ["Concurso PRONACA", "Plaza Comercial Puembo."]],          // en el orden de sus etapas
    ["Construcción", ["RES BG", "MINDKIDS"]],
    ["Diseño y construcción", ["CHRONIX"]],
    ["Sin tipo", ["Recién dictado"]],                                      // al final, para que se le ponga
  ]);
  assert.deepEqual(grupos[1].etapas.filter(e => e.cuantos).map(e => [e.nombre, e.cuantos]), [["Ingenierías", 1], ["Presupuesto", 1]]);
  assert.equal(grupos[3].etapas.length, 0);
  assert.deepEqual(porTipo([], catalogo), []);
});

test("el panel de avisos junta lo activo de cada módulo, con su cuenta y a dónde lleva", () => {
  const pipeline = [
    { clase: "insistir", nombre: "CHRONIX", texto: "En espera hace 5 días · tocaba revisarlo hoy" },
    { clase: "vencido", nombre: "MINDKIDS", texto: "«Cotizar» · atrasado 2 días" },
    { clase: "vencido", nombre: "Grupo Global", texto: "«Plano» · atrasado 1 día" },
    // Una clase de antes: el panel ya no la muestra.
    { clase: "sin_paso", nombre: "Megalabs", texto: "Sin actividades abiertas" },
  ];
  const lista = avisosDelTablero({
    pipeline, compras: [{ descripcion: "Andamios" }, { descripcion: "Gypsum" }], devueltas: 1,
    observaciones: [{ prioridad: "urgente" }, { prioridad: "media" }],
  });
  assert.deepEqual(lista.map(a => [a.clave, a.vista, a.cuenta, a.tono]), [
    ["pipeline-insistir", "leads", 1, "peligro"],
    ["pipeline-vencido", "leads", 2, "peligro"],
    ["compras", "compras", 2, "atencion"],
    ["observaciones", "observaciones", 2, "peligro"],
  ]);
  // Con uno solo dice qué pasa con él; con varios, cuáles son.
  assert.equal(lista[0].detalle, "CHRONIX: En espera hace 5 días · tocaba revisarlo hoy");
  assert.equal(lista[0].texto, "proyecto en espera para revisar");
  assert.equal(lista[1].detalle, "MINDKIDS · Grupo Global");
  assert.equal(lista[2].detalle, "1 que compras te devolvió");
  assert.equal(lista[3].detalle, "1 urgente");
  // Lo que no pasa no aparece: el panel se vacía solo.
  assert.deepEqual(avisosDelTablero({}), []);
  assert.deepEqual(avisosDelTablero({ compras: [{ descripcion: "Andamios" }] }).map(a => [a.tono, a.texto, a.detalle]),
    [["normal", "compra espera por vos", "Andamios"]]);
});

test("el panel suma lo de los demás módulos, y primero la plata que no cuadra", () => {
  const modulos = {
    ordenes: { cuantas: 3, dias: 13, vencidas: 3, objetadas: 0 }, rebotadas: 1, alquileres: 2, actas: 37,
    noCuadran: ["IMPLEMENTACIÓN DINERS AEREOPUERTO-GUAYAQUIL"], ordenesMal: { cuantas: 1, obras: ["IMPLEMENTACIÓN DINERS PLAZA LAGOS - GUAYAQUIL"] },
  };
  const lista = avisosDelTablero({ modulos, compras: [{ descripcion: "Andamios" }] });
  assert.deepEqual(lista.map(a => [a.clave, a.vista, a.cuenta, a.tono]), [
    ["control-presupuesto", "controlObra", 1, "peligro"],
    ["control-ordenes", "controlObra", 1, "peligro"],
    ["compras", "compras", 1, "normal"],
    ["ordenes-firma", "controlObra", 3, "peligro"],
    ["ordenes-rebote", "controlObra", 1, "peligro"],
    ["alquileres", "controlObra", 2, "peligro"],
    ["actas", "actas", 37, "atencion"],
  ]);
  assert.equal(lista[0].texto, "obra cuyo control no dice lo mismo que su presupuesto firmado");
  assert.equal(lista[3].detalle, "la más vieja, hace 13 días · 3 con el plazo vencido");
  assert.equal(lista[6].texto, "compromisos de actas están vencidos");
  // Lo que hoy pasa de verdad: las dos revisiones cuadran y no hay rebotes ni alquileres.
  const hoy = avisosDelTablero({ modulos: { ordenes: { cuantas: 3, dias: 13, vencidas: 3, objetadas: 0 }, rebotadas: 0, alquileres: 0, actas: 37, noCuadran: [], ordenesMal: { cuantas: 0, obras: [] } } });
  assert.deepEqual(hoy.map(a => a.clave), ["ordenes-firma", "actas"]);
  // Una sola orden, mandada hoy y sin plazo: avisa, pero sin alarma.
  assert.deepEqual(avisosDelTablero({ modulos: { ordenes: { cuantas: 1, dias: 0, vencidas: 0, objetadas: 0 } } }).map(a => [a.tono, a.texto, a.detalle]),
    [["atencion", "orden espera la firma del cliente", "enviada hoy"]]);
  // Mientras todavía no cargó, no rompe ni inventa.
  assert.deepEqual(avisosDelTablero({ modulos: null }), []);
});
