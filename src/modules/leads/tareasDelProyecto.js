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
 * Las tareas de un proyecto, como se leen en su pantalla.
 *
 * Las compras no: tienen su módulo, con su estado y su historia, y la tarea
 * que hoy las acompaña es solo el aviso a quien le toca el paso siguiente.
 *
 * @returns { abiertas, hechas }
 *   abiertas · primero lo que tiene fecha, por fecha —la primera es el próximo
 *              paso—; después lo que no tiene, y al fondo lo que ya se hizo de
 *              nuestro lado y espera a un tercero
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

/** Lo que cambia en la tarea al marcarla hecha, o al volver a abrirla. */
export function alMarcar(hecha, quienNombre = null, ahora = new Date()) {
  return hecha
    ? { status: "listo", hecha_at: ahora.toISOString(), hecha_por: quienNombre || null }
    : { status: "en-progreso", hecha_at: null, hecha_por: null };
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
