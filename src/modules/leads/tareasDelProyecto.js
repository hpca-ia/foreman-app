// LO QUE HAY QUE HACER EN UN PROYECTO ES UNA TAREA. UNA SOLA.
//
// Antes eran dos cosas: la «actividad» o «gestión» que se escribía dentro de
// una etapa del pipeline (`lead_etapa_items`) y la tarea que se le creaba al
// lado (`tasks`) para que apareciera en el tablero. Cuarenta y una actividades,
// cuarenta y una tareas gemelas, y un montón de código copiando de una a la
// otra: marcar la actividad cerraba la tarea, cerrar la tarea marcaba la
// actividad, corregir el texto de una reescribía la otra. Cuando ese código
// fallaba quedaban desparejas —una actividad hecha con su tarea abierta, otra
// apuntando a una tarea que alguien había borrado— y desde la pantalla lo que
// se veía era lo mismo dos veces, a veces distinto.
//
// Ahora hay una fila: la tarea. Si pertenece a una etapa de un proyecto, lo
// dice ella (`lead_etapa_id`), y la columna de esa etapa la muestra. Marcarla
// en el proyecto o en Tareas es tocar la misma fila; no hay nada que copiar.
//
// Acá están las reglas, sin base de datos, para poder probarlas.

/** Los campos de la tarea que usa la pantalla del proyecto. */
export const COLUMNAS = "id,title,status,due_date,hora,priority,type,notes,assignee_id,responsable_externo,"
  + "lead_id,lead_etapa_id,etapa_id,espera,nota,hecha_at,hecha_por,ruta_orden,compra_id,created_at";

/** Qué dice la nota de origen según el tipo: así el tablero sabe qué es. */
const ORIGEN = { "Reunión": "Reunión", "Gestión": "Gestión", "Envío": "Envío" };
export const notaDeOrigen = (tipo, nombreDelProyecto) =>
  `${ORIGEN[tipo] || "Tarea"} de ${nombreDelProyecto || ""}`.trim();

/**
 * La tarea, como la dibuja la columna de su etapa.
 *
 * La pantalla del proyecto se escribió cuando la actividad era otra fila, y
 * habla de `texto`, `hecho`, `hecho_por`. Esto le da esos nombres sobre la
 * tarea, para no tener dos pantallas distintas mientras el pipeline se
 * rehace. El `id` y el `tarea_id` son el mismo número: es la misma cosa.
 */
export function comoActividad(t) {
  return {
    id: t.id, tarea_id: t.id, lead_id: t.lead_id, lead_etapa_id: t.lead_etapa_id ?? null,
    texto: t.title || "", hecho: t.status === "listo",
    hecho_at: t.hecha_at || null, hecho_por: t.hecha_por || null,
    orden: t.ruta_orden ?? 0, espera: !!t.espera, nota: t.nota || "",
  };
}

/**
 * Las tareas de un proyecto que se ven en su pantalla.
 *
 * Las compras no: tienen su módulo, con su estado y su historia, y la tarea
 * que hoy las acompaña es solo el aviso a quien le toca el paso siguiente.
 * Mostrarlas acá sería llenar el proyecto de «Comprar: …» y «Recibir: …».
 *
 * @returns { enEtapas, sueltas }  las que están en una etapa, y las del
 *   proyecto que no están en ninguna (se crearon desde Tareas o desde un acta)
 */
export function delProyecto(tareas = [], etapas = []) {
  const vivas = new Set((etapas || []).map(e => Number(e.id)));
  const suyas = (tareas || []).filter(t => !t.compra_id && t.type !== "Compra");
  const enEtapa = t => t.lead_etapa_id != null && vivas.has(Number(t.lead_etapa_id));
  return { enEtapas: suyas.filter(enEtapa), sueltas: suyas.filter(t => !enEtapa(t)) };
}

/**
 * La fila que se guarda al sumar una tarea a una etapa.
 *
 * @param hecha  un envío ya ocurrió: nace cerrado y queda de registro
 */
export function filaNueva({
  lead, etapa = null, titulo, orden = 0, tipo = "Gestión", assignee_id = null, due_date = null, hora = null,
  urgente = false, responsable_externo = null, creadoPor = null, hecha = false, quienNombre = null, ahora = new Date(),
}) {
  return {
    title: String(titulo || "").trim(),
    lead_id: lead.id,
    // De qué etapa es: la fila de este proyecto, y el nombre de catálogo, que
    // es el que sobrevive cuando las etapas por proyecto dejen de existir.
    lead_etapa_id: etapa?.id ?? null,
    etapa_id: etapa?.etapa_id ?? null,
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

/**
 * En qué queda un hito según sus tareas: arranca cuando se cierra la primera
 * y cierra con la última. NUNCA HACIA ATRÁS: un hito que alguien marcó a mano
 * no vuelve a pendiente porque se le sume una tarea nueva; volver atrás lo
 * decide una persona.
 *
 * @returns el estado que le corresponde, o null si no hay que tocarlo
 */
export function estadoDelHito(estadoActual, tareas = []) {
  if (estadoActual === "omitida" || !tareas.length) return null;
  const hechas = tareas.filter(t => t.status === "listo").length;
  const debe = hechas === tareas.length ? "hecha" : hechas > 0 ? "en_curso" : estadoActual;
  return debe === estadoActual ? null : debe;
}
