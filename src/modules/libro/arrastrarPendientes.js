/**
 * LO QUE QUEDÓ SIN HACER PASA A LA SEMANA QUE VIENE. CON SU MOTIVO.
 *
 * El plan de la semana se escribía desde cero, y lo primero que se escribía
 * era lo mismo que la semana pasada: lo que no se alcanzó. El PDF y el correo
 * ya lo listaban —"quedaron sin hacer"— pero como lectura, no como tareas:
 * alguien tenía que volver a tipearlas, y en el camino se perdía el motivo
 * por el que no se hicieron, que es justo lo que hay que saber para que esta
 * vez sí.
 *
 * Esto arma la propuesta: cada tarea que quedó, puesta en el primer día del
 * período nuevo —de ahí se la mueve al día que corresponda—, con el motivo
 * de la semana pasada convertido en la nota de esta. Y nada se repite: si la
 * tarea ya está en la semana nueva, porque la trajo el cronograma o porque
 * alguien la escribió, no se la pone dos veces.
 *
 * No hay modelo acá. Qué quedó sin hacer es un dato, no una opinión.
 */

const pelado = t => String(t || "").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Las tareas de un período que no se hicieron. Materiales y compromisos de afuera no son tareas. */
export function loQueQuedo(items = []) {
  return items.filter(i => !["material", "externo"].includes(i.tipo || "tarea") && !i.hecha);
}

/**
 * ¿Esta tarea ya está en la semana nueva? Por la actividad del cronograma si
 * las dos la tienen; si no, por el texto, sin tildes ni mayúsculas.
 */
export function yaEsta(tarea, items = []) {
  const idC = tarea.cronograma_actividad_id || null;
  const idO = tarea.obra_actividad_id || null;
  const texto = pelado(tarea.texto);
  return items.some(i => {
    if (["material", "externo"].includes(i.tipo || "tarea")) return false;
    if (idC && i.cronograma_actividad_id && i.cronograma_actividad_id === idC) return true;
    if (idO && i.obra_actividad_id && i.obra_actividad_id === idO) return true;
    return !!texto && pelado(i.texto) === texto;
  });
}

/**
 * La propuesta: qué tareas traer y con qué nota, y cuáles no porque ya están.
 *
 * @param quedaron  las tareas sin hacer del período anterior.
 * @param items     lo que ya tiene la semana nueva.
 * @param fechas    los días de la semana nueva, en orden.
 */
export function propuestaDeArrastre({ quedaron = [], items = [], fechas = [] } = {}) {
  const primerDia = fechas[0] || null;
  const traer = [], yaEstaban = [];
  for (const t of quedaron) {
    if (yaEsta(t, items)) { yaEstaban.push(t); continue; }
    const motivo = String(t.motivo || "").trim();
    const notaVieja = String(t.nota || "").trim();
    traer.push({
      fecha: primerDia,
      texto: String(t.texto || "").trim(),
      // La nota de la tarea nueva dice por qué no se hizo la vez pasada; y si
      // la tarea ya traía su nota —a qué hora llega el material, quién la
      // hace—, viaja también: eso no cambió.
      nota: [motivo ? `La semana pasada no se hizo: ${motivo}.` : "La semana pasada quedó sin hacer.", notaVieja]
        .filter(Boolean).join(" "),
      cronograma_actividad_id: t.cronograma_actividad_id || null,
      obra_actividad_id: t.obra_actividad_id || null,
    });
  }
  return { traer, yaEstaban };
}

/** Cómo se dice en pantalla lo que va a pasar, antes de hacerlo. */
export function comoSeDice({ traer = [], yaEstaban = [] } = {}) {
  if (!traer.length && !yaEstaban.length) return "La semana pasada no dejó nada sin hacer.";
  const partes = [];
  if (traer.length) partes.push(`${traer.length} ${traer.length === 1 ? "tarea que quedó sin hacer" : "tareas que quedaron sin hacer"} la semana pasada`);
  if (yaEstaban.length) partes.push(`${yaEstaban.length} ya ${yaEstaban.length === 1 ? "está" : "están"} en esta semana`);
  return partes.join(" · ");
}
