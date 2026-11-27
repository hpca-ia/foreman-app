// EL FLUJO DEL PIPELINE, SIMPLE: un proyecto y cada una de sus actividades
// están EN CURSO o EN ESPERA, hasta que se terminan.
//
// Hernán, 26/11/2026: «Se ha vuelto muy complejo de llenar, entender...
// cuando tienes una actividad o tarea, pasar a la siguiente es confuso. Ya
// tengo la actividad FOGA, ¿el check quiere decir completada? En efecto se
// completó pero quiero que quede en stand-by hasta tener nuevo paso... ¿se
// cierra y se abre nueva?». Y después: «El workflow del pipeline es confuso».
//
// Este archivo probaba el «¿Qué sigue?» del 17/11/2026: al terminar un punto
// nacía OTRO, con lo que se escribiera de nombre. Las cuatro veces que se usó
// en RES BG hubo que renombrar el punto nuevo para devolverle el tema (FOGA,
// Eléctrico, Sanitario, Estructural). Eso se fue: ahora el punto es el tema, y
// avanza.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estadoDelLead, enEspera, loQueDice, avisosDelPipeline } from "../src/modules/leads/pipeline.js";
import * as reglas from "../src/modules/leads/tareasDelProyecto.js";
import { ESTADOS } from "../api/_listaDelCliente.js";

const { estadoDeActividad, alAvanzar, delProyecto, comoActividad } = reglas;
const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

const HOY = "2026-11-26";
const RES_BG = { id: 13, nombre: "RES BG", etapa: "con_presupuesto", tunel: "construccion", resultado: null };
const t = (id, title, extra = {}) => ({ id, title, status: "en-progreso", due_date: null, lead_id: 13, etapa_id: "con_presupuesto", ...extra });
// Como estaba RES BG ese día: las cotizaciones abiertas, una sola cosa con fecha, y lo hecho.
const PUNTOS = [
  t(195, "MADEVAL"), t(197, "Window world"), t(199, "Dekorando"), t(204, "MODELADO EN REVIT", { due_date: "2026-11-30" }),
  t(196, "FOGA"), t(120, "Levantamiento", { status: "listo", hecha_at: "2026-09-24T15:00:00Z" }), t(300, "Pedido de tubería", { compra_id: 4 }),
];

test("LO QUE PIDIÓ: FOGA se completó y «queda en stand-by hasta tener nuevo paso»: sigue abierta, al fondo, y lo dice", () => {
  const conFogaEnEspera = PUNTOS.map(p => (p.id === 196 ? { ...p, espera: true } : p));
  const { abiertas, hechas } = delProyecto(conFogaEnEspera);
  // No se fue a «hechos»: sigue en la lista, después de lo que está en curso.
  assert.deepEqual(abiertas.map(p => p.title), ["MODELADO EN REVIT", "MADEVAL", "Window world", "Dekorando", "FOGA"]);
  assert.deepEqual(hechas.map(p => p.title), ["Levantamiento"]);
  const foga = comoActividad(abiertas.at(-1));
  assert.deepEqual([foga.texto, foga.hecho, foga.espera], ["FOGA", false, true]);
  assert.deepEqual(estadoDeActividad(foga, abiertas.at(-1), HOY), { clase: "espera", dice: "En espera" });
  // Y el proyecto no pierde su próximo paso por eso.
  assert.equal(loQueDice(estadoDelLead(RES_BG, conFogaEnEspera, HOY)), "«MODELADO EN REVIT» · en 4 días");
});

test("AVANZÓ: lo que sigue se anota en el MISMO punto —con su fecha, si la tiene—; no nace otro con otro nombre", () => {
  const foga = comoActividad(t(196, "FOGA"));
  assert.deepEqual(alAvanzar({ item: foga, texto: "  gestionar reunión para consultas " }), { nota: "gestionar reunión para consultas", sacarDeEspera: false });
  // Con día, el punto queda para ese día.
  assert.deepEqual(alAvanzar({ item: foga, texto: "Reunión con FOGA", due_date: "2026-12-02" }), { nota: "Reunión con FOGA", fecha: "2026-12-02", sacarDeEspera: false });
  // Si estaba en espera y avanzó, deja de estar en espera.
  assert.equal(alAvanzar({ item: { ...foga, espera: true }, texto: "Llegó la cotización" }).sacarDeEspera, true);
  // Sin texto no hay nada que anotar, y se dice.
  assert.deepEqual(alAvanzar({ item: foga, texto: "   " }), { error: "Escribí qué pasó, o qué sigue." });
  // Sin día nuevo, una fecha que ya pasó se quita: era la del paso de antes. Una que viene, se deja.
  assert.deepEqual(alAvanzar({ item: foga, texto: "Se mandó el borrador", vence: "2026-11-20", hoy: "2026-11-27" }), { nota: "Se mandó el borrador", fecha: null, sacarDeEspera: false });
  assert.deepEqual(alAvanzar({ item: foga, texto: "Se mandó el borrador", vence: "2026-11-30", hoy: "2026-11-27" }), { nota: "Se mandó el borrador", sacarDeEspera: false });
  assert.deepEqual(alAvanzar({ item: foga, texto: "Otra fecha", due_date: "2026-12-04", vence: "2026-11-20", hoy: "2026-11-27" }).fecha, "2026-12-04");
  // La regla que abría otro punto ya no existe.
  assert.equal(reglas.loQueSigue, undefined);
});

test("la fila dice en qué está, con palabras: en curso, en espera, para cuándo, vencida, hecha", () => {
  const de = (extra = {}) => { const fila = t(1, "x", extra); return estadoDeActividad(comoActividad(fila), fila, HOY); };
  assert.deepEqual(de(), { clase: "curso", dice: "En curso" });
  assert.deepEqual(de({ espera: true }), { clase: "espera", dice: "En espera" });
  assert.deepEqual(de({ due_date: "2026-11-30" }), { clase: "fecha", dice: "Para el 30 nov" });
  assert.deepEqual(de({ due_date: "2026-11-30", hora: "10:00" }), { clase: "fecha", dice: "Para el 30 nov 10:00" });
  assert.deepEqual(de({ due_date: HOY }), { clase: "fecha", dice: "Para hoy" });
  assert.deepEqual(de({ due_date: "2026-11-20T00:00:00+00:00" }), { clase: "vencida", dice: "Venció el 20 nov" });
  // En espera no se la da por vencida: no depende de nosotros.
  assert.equal(de({ espera: true, due_date: "2026-11-20" }).clase, "espera");
  assert.deepEqual(de({ status: "listo", due_date: "2026-11-20" }), { clase: "hecha", dice: "Hecha" });
});

test("«EL WORKFLOW ES CONFUSO»: el proyecto sin fechas no está en falta, y el que está en espera sin recordatorio, tampoco", () => {
  const sinFechas = PUNTOS.map(p => ({ ...p, due_date: null }));
  const estado = estadoDelLead(RES_BG, sinFechas, HOY);
  assert.deepEqual([estado.clase, enEspera(estado), loQueDice(estado)], ["sin_paso", false, "5 actividades abiertas, sin fecha"]);
  const estacionado = { ...RES_BG, id: 14, nombre: "Plaza Comercial Puembo", espera_desde: "2026-11-11", recordar_el: null };
  const conDia = { ...RES_BG, id: 22, nombre: "Concurso PRONACA", espera_desde: "2026-11-11", recordar_el: "2026-11-18" };
  const avisos = avisosDelPipeline({ leads: [RES_BG, estacionado, conDia], tareas: sinFechas, hoy: HOY });
  // Avisa solo el que tiene un día pedido, y ese día llegó.
  assert.deepEqual(avisos.map(a => [a.clase, a.nombre, a.texto]), [["insistir", "Concurso PRONACA", "En espera hace 15 días · tocaba revisarlo hace 8 días"]]);
  for (const archivo of ["../src/lib/avisos.js", "../src/modules/leads/ModuloLeads.jsx", "../api/_resumen.js"]) assert.equal(codigoDe(archivo).includes("sin_paso"), false, archivo);
});

test("EL ✓ DE LA FILA PREGUNTA QUÉ PASÓ, ahí mismo, con tres botones que dicen lo que hacen", () => {
  const lista = codigoDe("../src/modules/leads/ListaDeTareas.jsx");
  // Tocar el ✓ de un punto abierto no lo cierra: abre la pregunta. El de uno hecho lo vuelve a abrir.
  assert.match(lista, /className="que-paso-con-el-punto"[\s\S]{0,200}if \(item\.hecho\) onMarcar\?\.\(false\); else setPregunta\(p => \(p \? null : "elegir"\)\);/);
  assert.match(lista, /<div className="que-paso"[\s\S]{0,400}¿Qué pasó con «\{item\.texto\}»\?/);
  assert.match(lista, /className="avanzo" onClick=\{\(\) => setPregunta\("avanzo"\)\}[\s\S]{0,300}<strong>Avanzó: anotar qué sigue<\/strong>/);
  assert.match(lista, /className="queda-en-espera" onClick=\{\(\) => \{ setPregunta\(null\); onEspera\?\.\(!item\.espera\); \}\}/);
  assert.match(lista, /<strong>Queda en espera<\/strong>[\s\S]{0,160}No se cierra\./);
  assert.match(lista, /className="terminada" onClick=\{\(\) => \{ setPregunta\(null\); onMarcar\?\.\(true\); \}\}[\s\S]{0,300}<strong>Terminada: ya no hay más que hacer<\/strong>/);
  // AVANZÓ anota en el mismo punto: no agrega otro.
  const avanzar = lista.slice(lista.indexOf("async function avanzar(item"), lista.indexOf("const naceALaVista"));
  assert.match(avanzar, /const r = alAvanzar\(\{ item, texto, due_date, vence, hoy: hoyISO\(\) \}\);/);
  assert.match(avanzar, /await anotarEnLaTarea\(item, r\.nota, currentUser, \{ alCliente:/);
  // El día nuevo va sin la hora del paso de antes (una reunión a las 10 no se muda sola al día nuevo).
  assert.match(avanzar, /if \(r\.fecha !== undefined\) despues\.push\(await ponerFecha\(item, r\.fecha, currentUser, null\)\);/);
  assert.match(avanzar, /if \(r\.sacarDeEspera\) despues\.push\(await marcarEspera\(item, false, currentUser\)\);/);
  // Lo que falla después de anotar se dice, y el cuadro se cierra: reintentar anotaba dos veces.
  assert.match(avanzar, /if \(problemas\.length\) setError\(problemas\.join\(" "\)\);/);
  assert.match(avanzar, /if \(aviso && !\/\^Quedó anotado\/\.test\(aviso\)\) \{ dijo = aviso; return; \}/);
  // Un Enter doble no manda dos anotaciones; y la fila le pasa la fecha que tiene.
  assert.match(lista, /const guardarPaso = async \(\) => \{\s+if \(enviando\.current\) return;\s+enviando\.current = true;/);
  assert.match(lista, /vence: tarea\?\.due_date \|\| ""/);
  assert.doesNotMatch(avanzar, /agregarTarea\(/);
  // Y terminarlo ya no pregunta nada ni abre otro: el «¿Qué sigue?» de antes no está.
  assert.doesNotMatch(lista, /loQueSigue|preguntarQueSigue|sumarLoQueSigue|className="que-sigue"|setSigue\(|Nada más/);
  // Lo que se anota al avanzar lo lee el cliente solo si ve el punto, y se puede destildar.
  assert.match(lista, /\{puedeLeerlo && \(\s+<label[\s\S]{0,300}className="que-lo-lea-el-cliente"/);
});

test("LA FILA, LIMPIA: su estado en una pastilla, y de lo demás solo lo que la distingue", () => {
  const lista = codigoDe("../src/modules/leads/ListaDeTareas.jsx");
  assert.match(lista, /const est = estadoDeActividad\(item, tarea, hoy\);/);
  assert.match(lista, /className="estado-de-la-actividad" data-estado=\{est\.clase\} style=\{pildora\(est\.clase\)\}/);
  // «gestión» se dice solo cuando NO lo es; «la ve el cliente», nunca; la que no ve, sí.
  assert.match(lista, /claseDe\(tarea\) !== "gestion" \? <span/);
  assert.doesNotMatch(lista, /className="la-ve-el-cliente"/);
  assert.match(lista, /className="no-la-ve-el-cliente"/);
  // Y ya no hay un «sin fecha» en rojo en cada fila.
  assert.equal(lista.includes('"sin fecha"'), false);
  // Arriba dice cuántos hay en espera, y enseña el gesto en una frase.
  assert.match(lista, /\{enEspera > 0 \? ` · \$\{enEspera\} en espera` : ""\}/);
  assert.ok(lista.includes("Tocá el ✓ de un punto para decir qué pasó: avanzó, queda en espera o terminó."));
});

test("EL PUNTO ABIERTO, CORTO: qué pasó, para cuándo y su estado; lo del cliente y lo demás, plegados", () => {
  const lista = codigoDe("../src/modules/leads/ListaDeTareas.jsx");
  const abierto = lista.slice(lista.indexOf('className="punto-abierto"'));
  // En ese orden.
  const orden = ['titulo="¿QUÉ PASÓ? · EL HISTORIAL DE ESTE PUNTO"', 'className="para-cuando"', 'className="ya-esta"', 'className="ver-lo-del-cliente"', 'className="ver-mas"'].map(x => abierto.indexOf(x));
  assert.ok(orden.every(i => i > 0), `falta una parte: ${orden}`);
  assert.deepEqual([...orden].sort((a, b) => a - b), orden);
  // El estado, con los mismos nombres que pregunta el ✓.
  assert.match(abierto, /className="en-espera" onClick=\{\(\) => onEspera\?\.\(!item\.espera\)\}[\s\S]{0,160}"Ya no está en espera" : "Dejar en espera"/);
  assert.match(abierto, /className="marcar-hecha" onClick=\{\(\) => onMarcar\?\.\(true\)\}[\s\S]{0,260}Terminada/);
  assert.match(abierto, /className="volver-a-abrir" onClick=\{\(\) => onMarcar\?\.\(false\)\}/);
  assert.equal(abierto.includes("¿YA ESTÁ?"), false);
  // Lo del cliente: una línea que dice qué ve, y se abre para lo demás.
  assert.match(abierto, /\{verCliente && laVeElCliente && \(\s+<div className="para-el-cliente"/);
  assert.match(abierto, /\{verCliente && !laVeElCliente && onCliente && editable && \(\s+<div className="no-lo-ve-el-cliente"/);
  assert.match(lista, /const resumenDelCliente = !laVeElCliente \? "no ve este punto" : \["lo ve",/);
  // Etapa, responsable y quitar: detrás de «Más».
  assert.match(abierto, /\{mas && onEtapa && etapas\.length > 0 && \(/);
  assert.match(abierto, /\{mas \? "Menos" : "Más: etapa, responsable, quitar"\}/);
  // Se cierra arriba, abajo y con la flecha; y agendar una reunión sigue siendo en el mismo punto.
  assert.equal((lista.match(/className="cerrar-punto" onClick=\{onAbrir\}/g) || []).length, 2);
  assert.match(lista, /className="abrir-o-cerrar" onClick=\{onAbrir\} aria-expanded=\{abierta\}/);
  assert.match(lista, /className="avisar-reunion" onClick=\{\(\) => onAvisar\(tarea\)\}/);
  // Corregir un punto es una ventana encima, no un cuadro al pie de toda la lista.
  assert.match(lista, /\{aTarea && \(\s+<div className="corregir-punto"\s+style=\{\{ position: "fixed", inset: 0,/);
});

test("EL PROYECTO: su estado es En curso o En espera, con «Dejar en espera» y «Retomar»; el recordatorio es opcional", () => {
  const estado = codigoDe("../src/modules/leads/EstadoDelLead.jsx");
  assert.match(estado, /\{ancho && <span style=\{rotulo\}>ETAPA<\/span>\}/);
  assert.match(estado, />TIPO<\/span>/);
  assert.match(estado, />ESTADO<\/div>/);
  assert.match(estado, /className="estado-del-proyecto"[\s\S]{0,260}En espera<\/> : estado\.clase === "vencido" \?[\s\S]{0,80}Vencido<\/> : "En curso"\}/);
  assert.match(estado, /className="dejar-en-espera" onClick=\{\(\) => setPidiendo\("esperar"\)\}/);
  assert.match(estado, /className="retomar" onClick=\{\(\) => guardar\(alResponder\(lead, hoy\)\)\}/);
  assert.match(estado, /className="seguir-en-espera" onClick=\{\(\) => setPidiendo\("posponer"\)\}/);
  // De quién se espera, de un toque; y se puede dejar sin recordatorio.
  assert.match(estado, /\{SE_ESPERA\.map\(q => <button key=\{q\} className="se-espera"/);
  assert.match(estado, /className="sin-recordatorio" onClick=\{\(\) => conRecordatorio\(null\)\}/);
  assert.match(estado, /pidiendo === "esperar" \? alEsperar\(\{ que: texto, recordarEl: dia, hoy \}\) : alPosponer\(\{ recordarEl: dia, hoy \}\)/);
  // Lo de antes no está: ni «próximo paso» como título, ni tres botones distintos, ni pedir una fecha en amarillo.
  assert.doesNotMatch(estado, /PRÓXIMO PASO|Insistí hoy|Ya respondió|Esperar al cliente|explicarSinPaso|alInsistir|por-que-importa/);
  // Sin nada abierto, lo que sigue se agrega ahí mismo, y la fecha no es obligatoria.
  assert.match(estado, /\{!estado\.paso && \(\s+<button className="agregar-que-sigue"/);
  assert.match(estado, /\{cuando\.dia \? "Agregar" : "Agregar sin fecha"\}/);
});

test("al cliente, un punto en espera se le dice «En espera»: ya no «hecho de nuestro lado», que no siempre es verdad", () => {
  assert.equal(ESTADOS.espera.dice, "En espera");
  assert.match(codigoDe("../src/portal/PortalCliente.jsx"), /espera: \{ dice: "En espera", color: colors\.warning \}/);
});
