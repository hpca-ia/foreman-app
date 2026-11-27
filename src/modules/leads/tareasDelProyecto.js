// LO QUE HAY QUE HACER EN UN PROYECTO ES UNA TAREA. UNA SOLA.
//
// Antes eran dos cosas: la «actividad» o «gestión» que se escribía dentro de
// una etapa del pipeline (`lead_etapa_items`) y la tarea que se le creaba al
// lado (`tasks`) para que apareciera en el tablero. Cuarenta y una actividades,
// cuarenta y una tareas gemelas, y un montón de código copiando de una a la
// otra. Desde la fase 1 hay una fila: la tarea.
//
// Y desde la fase 2 el proyecto ya no tiene una columna por etapa: está en UNA
// etapa (ver pipeline.js) y sus tareas son una lista. La tarea guarda, como
// etiqueta, en qué etapa estaba el lead cuando se escribió (`etapa_id`): seis
// meses después se puede leer qué se hizo en el anteproyecto y qué en la
// negociación, sin que nadie haya tenido que acomodar nada en columnas.
//
// Acá están las reglas, sin base de datos, para poder probarlas.

import { diaCorto } from "./pipeline.js";

/** Los campos de la tarea que usa la pantalla del proyecto. */
export const COLUMNAS = "id,title,status,due_date,hora,priority,type,notes,assignee_id,responsable_externo,"
  + "lead_id,etapa_id,espera,nota,hecha_at,hecha_por,ruta_orden,compra_id,created_at,created_by,descartada";

/** Qué dice la nota de origen según el tipo: así el tablero sabe qué es. */
const ORIGEN = { "Reunión": "Reunión", "Gestión": "Gestión", "Envío": "Envío" };
export const notaDeOrigen = (tipo, nombreDelProyecto) =>
  `${ORIGEN[tipo] || "Tarea"} de ${nombreDelProyecto || ""}`.trim();

/**
 * La tarea, como la dibuja la lista del proyecto.
 *
 * La pantalla habla de `texto`, `hecho`, `hecho_por`; esto le da esos nombres
 * sobre la tarea. El `id` y el `tarea_id` son el mismo número: es la misma cosa.
 */
export function comoActividad(t) {
  return {
    id: t.id, tarea_id: t.id, lead_id: t.lead_id, etapa_id: t.etapa_id ?? null,
    texto: t.title || "", hecho: t.status === "listo",
    hecho_at: t.hecha_at || null, hecho_por: t.hecha_por || null,
    orden: t.ruta_orden ?? 0, espera: !!t.espera, nota: t.nota || "",
  };
}

const dia = f => String(f || "").slice(0, 10);

/**
 * EL CHECKLIST, REPARTIDO POR ETAPA.
 *
 * Un proyecto tiene a la vez cosas de varias etapas: la revisión eléctrica es
 * de Ingenierías y la cotización de MADEVAL es de Presupuesto. La etapa la
 * dice CADA PUNTO —no la etapa en la que está parado el proyecto—, y la lista
 * se lee por etapa para que no se mezclen.
 *
 * No es la vuelta de «una columna por etapa con su estado»: el proyecto sigue
 * estando en UNA etapa, la que dice arriba. Esto solo ordena sus puntos.
 *
 * @param items             los puntos, como los dibuja la lista (llevan `etapa_id`)
 * @param etapas            las del tipo del proyecto, en su orden
 * @param nombreDe          id → nombre, para una etapa que ya no es de este tipo
 * @param etapaDelProyecto  en cuál está el proyecto ahora
 * @returns [{ id, nombre, actual, items }] en el orden de las etapas; al final
 *          las de otra etapa y, último, lo que no tiene ninguna
 */
export function porEtapa(items = [], etapas = [], { nombreDe = () => null, etapaDelProyecto = null } = {}) {
  const lugar = new Map(etapas.map((e, i) => [e.id, i]));
  const grupos = new Map();
  for (const it of items || []) {
    const id = it.etapa_id || null;
    if (!grupos.has(id)) {
      grupos.set(id, {
        id,
        nombre: id ? etapas.find(e => e.id === id)?.nombre || nombreDe(id) || "Otra etapa" : "Sin etapa",
        actual: !!id && id === etapaDelProyecto,
        items: [],
      });
    }
    grupos.get(id).items.push(it);
  }
  const rango = g => (g.id == null ? 2e6 : lugar.has(g.id) ? lugar.get(g.id) : 1e6);
  return [...grupos.values()].sort((a, b) => rango(a) - rango(b));
}

/**
 * EL AVANCE DEL PROYECTO, ETAPA POR ETAPA.
 *
 * Hernán, 17/11/2026: «el pipeline es el progreso del proyecto que genera
 * actividades con fecha y estado... no todas las actividades tienen la misma
 * etapa». El checklist ya repartía sus puntos por etapa, pero el progreso no
 * se leía en ningún lado: para saber cuánto iba Ingenierías había que contar
 * a mano, y lo hecho quedaba plegado en una lista sin etapas.
 *
 * Cuenta todo —lo abierto y lo hecho—, menos las compras, que tienen su
 * módulo, y lo que se cerró con «ya no va».
 *
 * @param tareas   las filas enteras de las tareas del proyecto
 * @param etapas   las del tipo del proyecto, en su orden
 * @param elCamino si se muestran también las etapas del tipo que todavía no
 *                 tienen nada: mientras se persigue, es el camino que falta;
 *                 en un aprobado serían seis casilleros vacíos
 * @returns [{ id, nombre, hechas, total, actual, estado }] con estado
 *          «lista» · «en_curso» · «vacia»; al final las etapas que ya no son
 *          de este tipo y lo que no tiene ninguna
 */
export function avancePorEtapa(tareas = [], etapas = [], { nombreDe = () => null, etapaDelProyecto = null, elCamino = true } = {}) {
  const cuenta = new Map();
  for (const t of tareas || []) {
    if (!t || t.compra_id || t.type === "Compra" || t.descartada) continue;
    const id = t.etapa_id || null;
    const c = cuenta.get(id) || { hechas: 0, total: 0 };
    c.total += 1;
    if (t.status === "listo") c.hechas += 1;
    cuenta.set(id, c);
  }
  const fila = (id, nombre) => {
    const c = cuenta.get(id) || { hechas: 0, total: 0 };
    return { id, nombre, hechas: c.hechas, total: c.total, actual: !!id && id === etapaDelProyecto,
      estado: !c.total ? "vacia" : c.hechas === c.total ? "lista" : "en_curso" };
  };
  const delTipo = (etapas || []).map(e => fila(e.id, e.nombre)).filter(f => elCamino || f.total || f.actual);
  const otras = [...cuenta.keys()].filter(id => id && !(etapas || []).some(e => e.id === id))
    .map(id => fila(id, nombreDe(id) || "Otra etapa"));
  return [...delTipo, ...otras, ...(cuenta.has(null) ? [fila(null, "Sin etapa")] : [])];
}

/**
 * ¿Hace falta el título de cada etapa? Con todo en la etapa en la que está el
 * proyecto, no: arriba ya lo dice, y repetirlo es ruido. En cuanto hay puntos
 * de otra, sí: es lo que los separa.
 */
export const conTitulosDeEtapa = (grupos = [], etapaDelProyecto = null) =>
  grupos.length > 1 || (grupos.length === 1 && !!etapaDelProyecto && grupos[0].id !== etapaDelProyecto);

/**
 * Las tareas de un proyecto, como se leen en su pantalla.
 *
 * Las compras no: tienen su módulo, con su estado y su historia, y la tarea
 * que hoy las acompaña es solo el aviso a quien le toca el paso siguiente.
 *
 * @returns { abiertas, hechas }
 *   abiertas · primero lo que tiene fecha, por fecha —la primera es el próximo
 *              paso—; después lo que no tiene, y al fondo lo que está en espera
 *   hechas   · la más reciente arriba
 */
export function delProyecto(tareas = []) {
  const suyas = (tareas || []).filter(t => !t.compra_id && t.type !== "Compra");
  const peso = t => (t.espera ? 2 : t.due_date ? 0 : 1);
  const abiertas = suyas.filter(t => t.status !== "listo").sort((a, b) =>
    peso(a) - peso(b)
    || dia(a.due_date).localeCompare(dia(b.due_date))
    || (a.ruta_orden ?? 0) - (b.ruta_orden ?? 0)
    || Number(a.id) - Number(b.id));
  const cuando = t => String(t.hecha_at || t.due_date || t.created_at || "");
  const hechas = suyas.filter(t => t.status === "listo").sort((a, b) =>
    cuando(b).localeCompare(cuando(a)) || Number(b.id) - Number(a.id));
  return { abiertas, hechas };
}

/**
 * La fila que se guarda al sumar una tarea a un proyecto.
 *
 * @param etapaId  en qué etapa está el lead ahora: queda de etiqueta
 * @param hecha    un envío ya ocurrió: nace cerrado y queda de registro
 */
export function filaNueva({
  lead, etapaId = null, titulo, orden = 0, tipo = "Gestión", assignee_id = null, due_date = null, hora = null,
  urgente = false, responsable_externo = null, creadoPor = null, hecha = false, quienNombre = null, ahora = new Date(),
}) {
  return {
    title: String(titulo || "").trim(),
    lead_id: lead.id,
    etapa_id: etapaId || null,
    ruta_orden: orden,
    assignee_id: assignee_id || null,
    due_date: due_date || null,
    priority: urgente ? "urgente" : "media",
    type: tipo || "Otro",
    created_by: creadoPor ?? null,
    notes: notaDeOrigen(tipo, lead.nombre),
    ...(hora ? { hora } : {}),
    ...(responsable_externo ? { responsable_externo } : {}),
    ...alMarcar(hecha, quienNombre, ahora),
  };
}

// ─── UNA ACTIVIDAD ES UN TEMA QUE AVANZA ───────────────────────────────────
//
// Hernán, 26/11/2026: «Cuando tienes una actividad o tarea, pasar a la
// siguiente es confuso. Ya tengo la actividad FOGA, ¿el check quiere decir
// completada? En efecto se completó pero quiero que quede en stand-by hasta
// tener nuevo paso... ¿se cierra y se abre nueva?».
//
// Se cerraba y se abría una nueva. El ✓ mandaba el punto a «hechos» y
// preguntaba «¿qué sigue?» arriba de la lista; lo que se escribiera nacía como
// OTRO punto, con ese texto de nombre y el historial vacío. Las cuatro veces
// que se usó en RES BG se escribió un estado —«STBY, gestionar reunión para
// consultas», «Base recibida para presupuesto»— y después hubo que renombrar
// cada uno para devolverle el tema: FOGA, Sanitario, Eléctrico, Estructural.
// Y el «espera a un tercero» estaba al fondo del punto abierto: en toda la
// base no se había marcado nunca.
//
// Ahora el punto es el TEMA, y no se cierra para avanzar. El ✓ pregunta ahí
// mismo qué pasó, y hace una de tres cosas:
//
//   AVANZÓ      se anota en el MISMO punto qué pasó o qué sigue —con su fecha,
//               si la tiene—. Sigue llamándose igual, con todo su historial.
//   EN ESPERA   se hizo lo que tocaba y todavía no hay paso nuevo. Queda en la
//               lista, al fondo de su etapa, hasta que se retome.
//   TERMINADA   ya no hay más que hacer: recién ahí pasa a «hechos».

/**
 * EN QUÉ ESTÁ UNA ACTIVIDAD, en palabras: lo que dice la pastilla de su fila.
 *
 * @param item   el punto, como lo dibuja la lista
 * @param tarea  su fila: de ahí sale para cuándo es
 * @param hoy    AAAA-MM-DD
 * @returns { clase, dice } con clase «hecha» · «espera» · «vencida» · «fecha» · «curso»
 */
export function estadoDeActividad(item, tarea = null, hoy = "") {
  if (item?.hecho) return { clase: "hecha", dice: "Hecha" };
  if (item?.espera) return { clase: "espera", dice: "En espera" };
  const para = dia(tarea?.due_date);
  if (para && hoy && para < hoy) return { clase: "vencida", dice: `Venció el ${diaCorto(para)}` };
  if (para) return { clase: "fecha", dice: `${para === hoy ? "Para hoy" : `Para el ${diaCorto(para)}`}${tarea?.hora ? ` ${tarea.hora}` : ""}` };
  return { clase: "curso", dice: "En curso" };
}

/**
 * AVANZÓ: lo que se anota en la misma actividad, y lo que cambia con eso.
 *
 * @param item      el punto
 * @param texto     qué pasó, o qué sigue
 * @param due_date  para cuándo queda (opcional): sin día, su fecha no se toca
 * @returns { error } o { nota, fecha?, sacarDeEspera }
 */
//
// Sin día nuevo, la fecha que tenía se deja, salvo que ya haya pasado: era la
// del paso de antes, y dejarla volvía a pintar «Venció» —o, si estaba en
// espera, ponía al proyecto «Vencido»— justo después de contar que avanzó.
// @param vence  la fecha que tiene la tarea ahora
// @returns { nota, fecha?, sacarDeEspera }: `fecha` es el día nuevo, null para
//          quitarla, o no viene si no se toca
export function alAvanzar({ item = null, texto, due_date = "", vence = "", hoy = "" } = {}) {
  const nota = String(texto || "").trim();
  if (!nota) return { error: "Escribí qué pasó, o qué sigue." };
  const fecha = dia(due_date);
  const vieja = dia(vence);
  const quitar = !fecha && !!vieja && !!hoy && vieja < hoy;
  return { nota, ...(fecha ? { fecha } : quitar ? { fecha: null } : {}), sacarDeEspera: !!item?.espera };
}

/**
 * Lo que cambia en la tarea al marcarla hecha, o al volver a abrirla.
 * En los dos casos deja de estar en espera: una terminada no espera nada, y la
 * que se vuelve a abrir vuelve en curso. Si no, «en espera → Terminada →
 * Volver a abrir» la traía de vuelta en espera, al fondo de la lista.
 */
export function alMarcar(hecha, quienNombre = null, ahora = new Date()) {
  return hecha
    ? { status: "listo", hecha_at: ahora.toISOString(), hecha_por: quienNombre || null, espera: false }
    : { status: "en-progreso", hecha_at: null, hecha_por: null, espera: false };
}

// ─── El checklist: pegar una lista y ver cuánto falta ──────────────────────

// Lo que trae adelante un renglón copiado de otro lado: una viñeta, un número,
// una casilla. No es parte de lo que hay que hacer.
const ADORNO = /^\s*(?:[-–—•·*▪■□☐☑✓✔]+|\[[ xX✓]?\]|\(?\d{1,3}[.)-])\s*/;
const sinAdorno = r => { let t = String(r || ""); for (let i = 0; i < 3; i++) t = t.replace(ADORNO, ""); return t.trim(); };
const parecido = t => String(t || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

/**
 * Una lista pegada, renglón por renglón: una tarea por cada uno.
 *
 * @param yaEstan  los títulos de las tareas ABIERTAS del proyecto: pegar dos
 *                 veces la misma lista no las duplica
 * @returns { nuevos, repetidos }  los que entran y los que ya estaban
 */
export function renglonesDeLista(texto, yaEstan = []) {
  const vistos = new Set(yaEstan.map(parecido));
  const nuevos = [], repetidos = [];
  String(texto || "").split(/\r?\n/).map(sinAdorno).filter(Boolean).forEach(t => {
    // Un título de más de 200 letras no es un renglón de un checklist: se
    // corta ahí, que es lo que entra en una fila sin romper la lista.
    const titulo = t.slice(0, 200);
    const clave = parecido(titulo);
    if (vistos.has(clave)) { repetidos.push(titulo); return; }
    vistos.add(clave); nuevos.push(titulo);
  });
  return { nuevos, repetidos };
}

/**
 * Cuánto va: hechas de cuántas.
 *
 * No cuentan las compras —tienen su módulo— ni lo que se cerró con «ya no
 * va»: eso no se hizo y tampoco falta.
 */
export function avanceDe(tareas = []) {
  const suyas = (tareas || []).filter(t => !t.compra_id && t.type !== "Compra" && !t.descartada);
  return { hechas: suyas.filter(t => t.status === "listo").length, total: suyas.length };
}
