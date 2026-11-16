// La hoja del plan semanal: qué va y en qué orden. Con el plan real del
// Aeropuerto de la semana del 16/11/2026, que Hernán bajó y «no se ve para
// nada bien».
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { enLista, seccionesDelDia, pendientesParaElPapel, tituloDelDia, diaCorto, comoSeLee, sinBarras, cuantasActividades, TOPE_VIEJO } from "../src/modules/libro/planEnPapel.js";
import { loQueQuedoConSuDia } from "../src/modules/libro/arrastrarPendientes.js";
import { anchoEscrito } from "../src/lib/textoDelPdf.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");

// El material del martes 17/11, como quedó guardado: una lista pegada de
// corrido en el casillero y cortada en la letra 300.
const MATERIAL = '- Tinas plásticas para enlucido, cemento Portland, arena fina y aditivo adherente - Tubos metálicos estructurales para mesones de baño/cocina, soldadura y fondo anticorrosivo - Perfiles galvanizados (2 1/2" y 3 5/8"), planchas gypsum normal (1/2") y flexible (1/4"), tornillos 6x1" y 6x1 5/8" - Kit d';

test("LO QUE VIO: el material pegado de corrido sale renglón por renglón, no en un párrafo", () => {
  assert.equal(MATERIAL.length, TOPE_VIEJO);
  assert.deepEqual(enLista(MATERIAL), [
    "Tinas plásticas para enlucido, cemento Portland, arena fina y aditivo adherente",
    "Tubos metálicos estructurales para mesones de baño/cocina, soldadura y fondo anticorrosivo",
    'Perfiles galvanizados (2 1/2" y 3 5/8"), planchas gypsum normal (1/2") y flexible (1/4"), tornillos 6x1" y 6x1 5/8"',
    // Cortado por el tope viejo: se dice, no se deja como si terminara ahí.
    "Kit d...",
  ]);
});

test("un material común se deja entero, aunque tenga una raya en el medio", () => {
  assert.deepEqual(enLista("Tubo PVC de 1/2 - 3/4 para desagüe"), ["Tubo PVC de 1/2 - 3/4 para desagüe"]);
  assert.deepEqual(enLista("- Tubo de 2 - 4 pulgadas - Codos"), ["Tubo de 2 - 4 pulgadas", "Codos"]);
  assert.deepEqual(enLista(""), []);
  assert.deepEqual(enLista("  Cemento  "), ["Cemento"]);
});

test("la barra entre dos turnos se lee como una ele en la letra del PDF: va un punto medio", () => {
  assert.equal(sinBarras("Dos jornadas: Diurna (08:00 a 17:00) | Nocturna (21:00 a 05:00)"),
    "Dos jornadas: Diurna (08:00 a 17:00)  ·  Nocturna (21:00 a 05:00)");
});

const DIA = { id: 7, fecha: "2026-11-17", horario: "Diurna (08:00 a 17:00) | Nocturna (21:00 a 05:00)", personal: "Albañilería (3)", permisos: "", consideraciones: null };
const ITEMS = [
  { plan_dia_id: 7, tipo: "tarea", texto: "3. SOLDADURA: ESTRUCTURA DE BAÑOS", nota: "Soldadura y montaje de estructura metálica.", hecha: false },
  { plan_dia_id: 7, tipo: null, texto: "7. OBRA GRIS: PICADOS", nota: null, hecha: true },
  { plan_dia_id: 7, tipo: "material", texto: MATERIAL, hecha: false },
  { plan_dia_id: 7, tipo: "externo", texto: "El cliente define el color del counter", hecha: false },
  { plan_dia_id: 8, tipo: "tarea", texto: "De otro día" },
];

test("cada cosa en su sección: tareas, material, lo de afuera y la ficha; lo de afuera ya no sale como tarea", () => {
  const s = seccionesDelDia(DIA, ITEMS);
  assert.deepEqual(s.tareas.map(t => [t.texto, t.nota, t.hecha]), [
    ["3. SOLDADURA: ESTRUCTURA DE BAÑOS", "Soldadura y montaje de estructura metálica.", false],
    ["7. OBRA GRIS: PICADOS", "", true],
  ]);
  assert.equal(s.materiales.length, 4);
  assert.deepEqual(s.externos, [{ texto: "El cliente define el color del counter", hecha: false }]);
  assert.deepEqual(s.ficha, [["HORARIO", "Diurna (08:00 a 17:00)  ·  Nocturna (21:00 a 05:00)"], ["PERSONAL", "Albañilería (3)"]]);
  assert.equal(s.vacio, false);
  assert.equal(seccionesDelDia({ id: 99 }, ITEMS).vacio, true);
});

// Lo que quedó de la semana del 9/11: dieciocho, con el título repetido.
const QUEDARON = [
  { fecha: "2026-11-09", texto: "Tabiquerías y Tumbados", nota: "Continuación del Estructurado de Tumbados (Rubro 4.3).", motivo: null },
  { fecha: "2026-11-10", texto: "Tabiquerías y Tumbados", nota: "Avanzar Cierre en Paredes (Rubro 4.4).", motivo: "" },
  { fecha: "2026-11-12", texto: "Rubro 9103 y Limpieza Diaria (Rubro 4):", nota: "Limpieza profunda.", motivo: "No llegó el material" },
];

test("LO QUE VIO: «Tabiquerías y Tumbados - sin decir por que», dieciocho veces. Ahora dice qué había que hacer y de qué día era", () => {
  const p = pendientesParaElPapel(QUEDARON);
  assert.equal(p.titulo, "De la semana pasada quedaron 3 actividades sin hacer");
  assert.deepEqual(p.filas[0], { dia: "lun 9/11", titulo: "Tabiquerías y Tumbados", nota: "Continuación del Estructurado de Tumbados (Rubro 4.3).", motivo: "" });
  assert.equal(p.filas[1].nota, "Avanzar Cierre en Paredes (Rubro 4.4).");
  // El título que ya trae sus dos puntos no sale con cuatro.
  assert.equal(p.filas[2].titulo, "Rubro 9103 y Limpieza Diaria (Rubro 4)");
  assert.equal(p.filas[2].motivo, "No llegó el material");
  // Que no digan por qué se dice una vez, no en cada renglón.
  assert.equal(p.aviso, "2 de 3 no dicen por qué.");
  assert.equal(pendientesParaElPapel(QUEDARON.slice(0, 2)).aviso, "Ninguna dice por qué.");
  assert.equal(pendientesParaElPapel(QUEDARON.slice(2)).aviso, "");
  assert.equal(pendientesParaElPapel(QUEDARON.slice(0, 1)).titulo, "De la semana pasada quedó 1 actividad sin hacer");
});

test("lo que quedó viaja con el día en que estaba puesto, en orden de fecha", () => {
  const dias = [{ id: 1, fecha: "2026-11-10T05:00:00.000Z" }, { id: 2, fecha: "2026-11-09" }];
  const items = [
    { id: 10, plan_dia_id: 1, tipo: "tarea", texto: "B", hecha: false },
    { id: 11, plan_dia_id: 2, tipo: "tarea", texto: "A", hecha: false },
    { id: 12, plan_dia_id: 2, tipo: "material", texto: "no es tarea", hecha: false },
    { id: 13, plan_dia_id: 2, tipo: "tarea", texto: "hecha", hecha: true },
    { id: 14, plan_dia_id: 2, tipo: "tarea", texto: "C", hecha: false },
  ];
  assert.deepEqual(loQueQuedoConSuDia({ items, dias }).map(i => [i.fecha, i.texto]),
    [["2026-11-09", "A"], ["2026-11-09", "C"], ["2026-11-10", "B"]]);
});

test("las fechas, como se leen en la hoja", () => {
  assert.equal(comoSeLee("2026-11-16"), "lunes 16/11");
  assert.equal(tituloDelDia("2026-11-18"), "Miércoles 18/11");
  assert.equal(diaCorto("2026-11-09"), "lun 9/11");
  assert.equal(diaCorto(null), "");
  assert.equal(cuantasActividades(1), "1 actividad");
  assert.equal(cuantasActividades(9), "9 actividades");
});

test("un renglón del plan ya no se guarda cortado a 300 letras", () => {
  const datos = leer("../src/modules/libro/planSemanalDatos.js");
  assert.doesNotMatch(datos, /slice\(0, 300\)/);
  assert.match(datos, /export const TOPE_DE_UN_RENGLON = 2000;/);
  assert.match(datos, /texto: String\(texto\)\.trim\(\)\.slice\(0, TOPE_DE_UN_RENGLON\)/);
});

test("la hoja: el aviso de borrador en su franja y con tildes, casillas dibujadas, y nada de tabla que parta una actividad", () => {
  const pdf = leer("../src/modules/libro/pdfPlanSemanal.js");
  const codigo = pdf.split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
  assert.match(codigo, /el plan no está cerrado todavía/);
  assert.doesNotMatch(codigo, /no esta cerrado|sin decir por que|"\[ \]"/);
  assert.doesNotMatch(codigo, /autoTable\(/);
  // El aviso ya no se escribe a la altura del logo (era `y - 32`).
  assert.doesNotMatch(codigo, /y - 32/);
  assert.match(codigo, /pendientesParaElPapel\(quedaron\)/);
  assert.match(codigo, /seccionesDelDia\(d, items\)/);
  assert.match(codigo, /conCasillas\("MATERIAL", s\.materiales\)/);
  assert.match(codigo, /conCasillas\("DE AFUERA", s\.externos\)/);
  // Un bloque que no entra pasa entero, y la hoja nueva repite el día.
  assert.match(codigo, /queEntre\(b\.alto, sigue\)/);
  const pantalla = leer("../src/modules/libro/PlanSemanal.jsx");
  assert.equal(pantalla.split("const quedaron = loQueQuedoConSuDia(previa);").length - 1, 2);
});

test("un texto a continuación de otro se mide como se escribe, sin el ajuste entre letras", () => {
  const pedidos = [];
  const doc = { getStringUnitWidth: (t, o) => { pedidos.push(o); return t.length * 0.5; }, getFontSize: () => 10, internal: { scaleFactor: 2 } };
  assert.equal(anchoEscrito(doc, "Tabiquerías: "), 13 * 0.5 * 10 / 2);
  assert.deepEqual(pedidos, [{ doKerning: false }]);
  assert.equal(anchoEscrito(doc, null), 0);
});
