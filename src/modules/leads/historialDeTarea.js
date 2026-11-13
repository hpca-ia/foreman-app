// EL HISTORIAL DE UN PUNTO DEL CHECKLIST.
//
// Un punto del checklist no es una casilla: es una gestión. «MADEVAL» quiere
// decir que hay que contactarlos, fijar la reunión, tenerla y recibir la
// cotización, y de todo eso hay que poder leer después qué pasó y cuándo.
//
// Antes esa historia estaba repartida en tres lados: los «comentarios» de la
// tarea, una nota suelta que se pisaba cada vez que se escribía, y la bitácora
// del proyecto, donde lo que se le hizo a esa tarea quedaba mezclado con lo de
// todas las demás. Acá se junta en una sola lista, en orden:
//
//   · lo que alguien ANOTÓ —«llamé, quedan en confirmar la reunión»—, que son
//     los comentarios de la tarea, los mismos que se ven en Tareas;
//   · lo que PASÓ SOLO —se agregó, se le encargó a alguien, se le puso fecha,
//     quedó esperando a un tercero, se hizo—, que es lo que la bitácora del
//     proyecto dice de esa tarea (migración 181: cada renglón sabe de cuál es).
//
// Es cuenta pura: no toca la base.

// Lo que la bitácora escribe al crear la tarea. El alta sale de la tarea misma
// —que sabe cuándo y quién—, así que ese renglón no se repite.
const ES_ALTA = /^Sumó "/;
// Los renglones que dicen que se hizo: si hay alguno, no se deduce otro.
const ES_CIERRE = /^(Hizo "|Hecho: )/;

/**
 * Lo que la bitácora del proyecto dice de una tarea, dicho ADENTRO de ella.
 *
 * Afuera hace falta el nombre —«Hizo "MADEVAL"»—; adentro es ruido, y con el
 * título corregido además queda viejo. Se reconoce por la forma de la frase y
 * no por el título, que pudo haber cambiado después.
 */
export function dichoAdentro(detalle) {
  const d = String(detalle || "").trim();
  let m;
  if (ES_CIERRE.test(d)) return "Se marcó como hecha";
  if (/^Volvió a abrir "/.test(d)) return "Se volvió a abrir";
  if ((m = d.match(/^Le encargó ".*" a (.+)$/))) return `Se le encargó a ${m[1]}`;
  if ((m = d.match(/^".*" queda para el (.+)$/))) return `Queda para el ${m[1]}`;
  if (/^".*" se queda sin fecha$/.test(d)) return "Se queda sin fecha";
  if (/^".*" queda esperando a un tercero$/.test(d)) return "Queda esperando a un tercero";
  if (/^".*" ya no espera$/.test(d)) return "Ya no espera a un tercero";
  if (/^Le mostró al cliente "/.test(d)) return "Se le mostró al cliente";
  if (/^Dejó de mostrarle al cliente "/.test(d)) return "Se le dejó de mostrar al cliente";
  if ((m = d.match(/^Arregló ".*": (.+)$/))) return `Se corrigió: ${m[1]}`;
  return d;
}

/**
 * El historial de una tarea, del primer renglón al último.
 *
 * @param tarea        la fila de `tasks`
 * @param comentarios  lo que se anotó en ella (`tarea_comentarios`)
 * @param movimientos  lo que la bitácora del proyecto dice de ella
 * @param nombreDe     id de usuario → nombre, para decir quién la agregó
 * @returns [{ id, cuando, quien, texto, automatico }]
 */
export function historialDe({ tarea, comentarios = [], movimientos = [], nombreDe = () => null }) {
  const filas = [];
  if (tarea?.created_at) {
    filas.push({ id: "alta", cuando: tarea.created_at, quien: nombreDe(tarea.created_by) || null, texto: "Se agregó al checklist", automatico: true });
  }
  let hayCierre = false;
  for (const m of movimientos || []) {
    const detalle = String(m.detalle || "");
    if (ES_ALTA.test(detalle)) continue;
    if (ES_CIERRE.test(detalle)) hayCierre = true;
    filas.push({ id: `m${m.id}`, cuando: m.created_at, quien: m.autor_nombre || null, texto: dichoAdentro(detalle), automatico: m.automatico !== false });
  }
  for (const c of comentarios || []) {
    const texto = String(c.texto || "").trim();
    if (!texto) continue;
    filas.push({ id: `c${c.id}`, cuando: c.created_at, quien: c.autor_nombre || null, texto, automatico: false });
  }
  // Una tarea hecha antes de la 181, o marcada desde Tareas: la bitácora no
  // lo dice de ella, pero la tarea sabe cuándo se hizo y quién la marcó.
  if (!hayCierre && tarea?.status === "listo" && tarea.hecha_at) {
    filas.push({ id: "hecha", cuando: tarea.hecha_at, quien: tarea.hecha_por || null, texto: "Se marcó como hecha", automatico: true });
  }
  // En orden; lo que empata en el minuto queda como llegó.
  return filas
    .map((f, i) => ({ f, i, t: new Date(f.cuando).getTime() || 0 }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map(x => x.f);
}

/**
 * Lo último que alguien anotó: es lo que se lee en la fila sin abrirla, para
 * repasar el checklist de un vistazo. Lo automático no cuenta: «se le puso
 * fecha» no dice en qué va la gestión.
 */
export function ultimaAnotacion(comentarios = []) {
  const escritos = (comentarios || []).filter(c => String(c.texto || "").trim());
  if (!escritos.length) return null;
  return escritos.reduce((a, b) => (new Date(b.created_at) >= new Date(a.created_at) ? b : a));
}

/** Los renglones de varias tareas, repartidos por tarea. */
export function porTarea(filas = []) {
  const mapa = {};
  for (const f of filas || []) {
    if (f?.task_id == null) continue;
    (mapa[f.task_id] = mapa[f.task_id] || []).push(f);
  }
  return mapa;
}
