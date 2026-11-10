import { supabase } from "../../lib/supabase";
import { COLUMNAS, comoActividad, delProyecto, filaNueva, alMarcar, estadoDelHito, notaDeOrigen } from "./tareasDelProyecto.js";

// El tubo de un proyecto: por qué hitos pasa y qué le falta a cada uno.
//
// Arquitectura y Construcción van en orden —son hitos, uno detrás de otro— y
// por eso un proyecto de esos tubos arranca con todas sus etapas puestas, en
// su orden, esperando turno. Un lead va sin orden: sus etapas se agregan
// cuando pasan, porque en un lead primero puede salir el plan masa y después
// el presupuesto.
//
// Lo vertical —lo que hay que hacer en cada hito— son TAREAS: las mismas que
// se ven en Tareas. Una tarea que pertenece a un hito lo dice en su fila
// (`lead_etapa_id`). No hay una «actividad» aparte que copiar ni que mantener
// pareja: ver tareasDelProyecto.js.

export const TUNELES = {
  arquitectura: { label: "Arquitectura", enOrden: true, color: "#4A7C8C" },
  construccion: { label: "Construcción", enOrden: true, color: "#1F7A4D" },
  lead: { label: "Lead", enOrden: false, color: "#8B92A5" },
};

/**
 * Lead u obra: dos cosas distintas que viven en la misma tabla.
 *
 * Un **lead** es una oportunidad: se persigue, se cotiza y puede no pasar
 * nada. No tiene obra, ni libro, ni facturas — nada que controlar todavía.
 *
 * Un **proyecto** es trabajo contratado: entró a Arquitectura o Construcción,
 * o se ganó. Ahí sí hay presupuesto que respetar, obra que controlar y libro
 * que escribir.
 *
 * Siguen en el mismo tubo a propósito —un proyecto aprobado no se va del
 * pipeline, todavía le quedan gestiones—, pero no se les pide lo mismo, y
 * llamar "proyecto" a los dos era la mitad de la confusión.
 */
export const esProyecto = lead =>
  lead?.resultado === "ganado"
  || !!lead?.obra_id                      // tiene obra: ya es trabajo, diga lo que diga su túnel
  || ["arquitectura", "construccion"].includes(lead?.tunel);

/** Cómo se le dice a esto en pantalla. */
export const queEs = lead => (esProyecto(lead) ? "proyecto" : "lead");

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");
// Para la bitácora: "9 oct" se lee, "2026-10-09" hay que traducirlo. Al mediodía
// para que la fecha no se corra un día al leerla desde Ecuador.
const enCriollo = f => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "");

/** El catálogo de etapas de un tubo, en orden. */
export const etapasDelTunel = (catalogo = [], tunel) =>
  catalogo.filter(e => (e.tunel || "lead") === tunel && e.activa !== false).sort((a, b) => a.orden - b.orden);

const SIN_170 = "Falta correr la migración 170 en Supabase.";

/**
 * Las etapas del proyecto y sus tareas.
 *
 * @returns { etapas, items, sueltas, tareas, sinTablas, sinMigracion }
 *   `items` son las tareas que están en una etapa, con los nombres que usa la
 *   pantalla; `sueltas`, las del proyecto que no están en ninguna; `tareas`,
 *   las mismas filas enteras, por id.
 */
export async function cargarTubo(leadId) {
  const [{ data: etapas, error }, { data: ts, error: e2 }] = await Promise.all([
    supabase.from("lead_etapas").select("*").eq("lead_id", leadId).order("orden"),
    supabase.from("tasks").select(COLUMNAS).eq("lead_id", leadId).order("ruta_orden").order("id"),
  ]);
  const vacio = { etapas: [], items: [], sueltas: [], tareas: {} };
  if (falta(error)) return { ...vacio, sinTablas: true };
  // Sin la 170 la tarea no sabe de qué etapa es: no hay con qué armar las
  // columnas, y es mejor decirlo que mostrar el proyecto vacío.
  if (falta(e2)) return { ...vacio, etapas: etapas || [], sinTablas: false, sinMigracion: true };
  const { enEtapas, sueltas } = delProyecto(ts || [], etapas || []);
  return {
    etapas: etapas || [],
    items: enEtapas.map(comoActividad),
    sueltas: sueltas.map(comoActividad),
    tareas: Object.fromEntries([...enEtapas, ...sueltas].map(t => [t.id, t])),
    sinTablas: false, sinMigracion: false,
  };
}

// Dos llamadas a la vez ponían las etapas dos veces: las dos leían "faltan" y
// las dos insertaban. Pasa al abrir y cerrar rápido un proyecto, o con la app
// abierta en dos pestañas. Mientras una está trabajando, la otra espera su
// resultado en vez de empezar de nuevo.
const enCurso = new Map();

/**
 * Un proyecto de un tubo en orden tiene todas sus etapas desde el principio:
 * así se ve el camino completo y cuánto falta, no solo dónde se está.
 */
export function asegurarEtapas(lead, catalogo) {
  if (enCurso.has(lead.id)) return enCurso.get(lead.id);
  const trabajo = ponerEtapasQueFaltan(lead, catalogo).finally(() => enCurso.delete(lead.id));
  enCurso.set(lead.id, trabajo);
  return trabajo;
}

async function ponerEtapasQueFaltan(lead, catalogo) {
  const tunel = lead.tunel || "lead";
  if (!TUNELES[tunel]?.enOrden) return null;
  const delTunel = etapasDelTunel(catalogo, tunel);
  if (!delTunel.length) return null;

  const { data: puestas, error } = await supabase.from("lead_etapas").select("etapa_id").eq("lead_id", lead.id);
  if (error) return falta(error) ? "sin_tablas" : error.message;
  const ya = new Set((puestas || []).map(e => e.etapa_id));
  const faltantes = delTunel.filter(e => !ya.has(e.id));
  if (!faltantes.length) return null;

  const { error: e2 } = await supabase.from("lead_etapas").insert(
    faltantes.map(e => ({ lead_id: lead.id, etapa_id: e.id, orden: e.orden, estado: "pendiente" }))
  );
  return e2 ? e2.message : null;
}

/** Las tareas que una etapa trae puestas en Ajustes, sumadas a este proyecto. */
export async function sembrarChecklist(lead, etapa, quien) {
  const { data: plantilla, error } = await supabase.from("pipeline_etapa_items")
    .select("texto,orden").eq("etapa_id", etapa.etapa_id).eq("activo", true).order("orden");
  if (error || !plantilla?.length) return [];
  const { data } = await supabase.from("tasks").insert(
    plantilla.map(p => filaNueva({ lead, etapa, titulo: p.texto, orden: p.orden, tipo: "Gestión", creadoPor: quien?.id ?? lead.created_by ?? null }))
  ).select(COLUMNAS);
  return data || [];
}

/**
 * Sumar una tarea al proyecto, en una etapa o en ninguna.
 *
 * Una sola fila en `tasks`: la misma que ve su responsable en Tareas. Antes
 * eran dos —la actividad de la etapa y la tarea— y había que crearlas una
 * detrás de la otra y dejarlas enganchadas.
 *
 * @param hecha        un envío ya ocurrió: nace cerrado y queda de registro
 * @param nombreEtapa  para decirlo en la bitácora si con esto el hito cierra
 * @returns { tarea, item } o { error }
 */
export async function agregarTarea({
  lead, etapa = null, titulo, orden = 0, tipo = "Gestión", assignee_id = null, due_date = null, hora = null,
  urgente = false, responsable_externo = null, hecha = false, quien = null, nombreResponsable = null, nombreEtapa,
}) {
  const fila = filaNueva({
    lead, etapa, titulo, orden, tipo, assignee_id, due_date, hora, urgente, responsable_externo, hecha,
    creadoPor: quien?.id ?? lead.created_by ?? null, quienNombre: quien?.name || null,
  });
  if (!fila.title) return { error: "Escribí qué hay que hacer." };
  const { data: tarea, error } = await supabase.from("tasks").insert(fila).select(COLUMNAS).single();
  if (error) return { error: falta(error) ? SIN_170 : error.message };

  // Un envío no se «suma» ni se «encarga»: se registra, y eso lo anota quien
  // lo llama, con a quién fue.
  if (!hecha) {
    await anotar(lead.id, { detalle: `Sumó "${tarea.title}"`, quien });
    // Encargarle algo a alguien es de las cosas que hay que poder rastrear.
    if (assignee_id || responsable_externo) {
      await anotar(lead.id, {
        detalle: `Le encargó "${tarea.title}" a ${responsable_externo || nombreResponsable || "alguien del equipo"}`
          + (due_date ? `, para el ${enCriollo(due_date)}${hora ? ` a las ${hora}` : ""}` : ""),
        quien,
      });
    }
  }
  await alDiaElHito(tarea.lead_etapa_id, quien, nombreEtapa);
  return { tarea, item: comoActividad(tarea) };
}

/**
 * El estado de un hito sale de sus tareas: arranca cuando se cierra la primera
 * y cierra cuando se cierra la última. Antes había que acordarse de apretar
 * "Arrancar" y "Cerrar", y el tubo mostraba en pendiente etapas donde ya se
 * estaba trabajando.
 *
 * Esto corre al tocar una tarea, nunca al abrir el proyecto: si corriera al
 * abrirlo, una etapa reabierta a mano —con todo marcado— se volvía a cerrar
 * sola al primer refresco y el botón "Reabrir" parecía roto. Reabrir es una
 * decisión de una persona y manda hasta que alguien vuelva a mover una tarea
 * de esa etapa.
 *
 * Corre también cuando la tarea se cierra desde Tareas: es la misma fila, así
 * que el hito se entera venga de donde venga el cambio.
 */
export async function alDiaElHito(leadEtapaId, quien, nombre) {
  if (!leadEtapaId) return null;
  const [{ data: etapa }, { data: suyas }] = await Promise.all([
    supabase.from("lead_etapas").select("*").eq("id", leadEtapaId).maybeSingle(),
    supabase.from("tasks").select("id,status,type,compra_id").eq("lead_etapa_id", leadEtapaId),
  ]);
  if (!etapa) return null;
  // Las compras no cuentan: no son trabajo del hito, son avisos de su módulo.
  const debe = estadoDelHito(etapa.estado, (suyas || []).filter(t => !t.compra_id && t.type !== "Compra"));
  if (!debe) return null;
  // El cierre sí es noticia del proyecto; arrancar no: sería una fila de
  // bitácora por cada tilde.
  return cambiarEstadoEtapa(etapa, debe, quien, debe === "hecha", nombre);
}

/**
 * Marcar una tarea del proyecto como hecha, o volver a abrirla.
 *
 * @param item    la tarea como la ve la columna (comoActividad)
 * @param quien   el nombre de quien la marca, que queda escrito en ella
 * @param autor   la persona, para la bitácora
 */
export async function marcarItem(item, hecho, quien, autor, nombreEtapa) {
  const { error } = await supabase.from("tasks").update(alMarcar(hecho, quien || autor?.name || null)).eq("id", item.id);
  if (error) return falta(error) ? SIN_170 : error.message;
  await anotar(item.lead_id, { detalle: `${hecho ? "Hizo" : "Volvió a abrir"} "${item.texto}"`, quien: autor });
  await alDiaElHito(item.lead_etapa_id, autor, nombreEtapa);
  return null;
}

/**
 * Corregir una tarea del proyecto: qué dice, de quién es, para cuándo y qué es.
 * @returns { tarea } o { error }
 */
export async function asegurarTarea(item, datos) {
  const campos = {
    title: (datos.titulo || item.texto || "").trim(),
    assignee_id: datos.assignee_id || null,
    due_date: datos.due_date || null,
    hora: datos.hora || null,
    // Corregir qué es —gestión, tarea o reunión— cambia dónde se la ve, así que
    // se guarda igual que al crearla: en el tipo y en la nota.
    ...(datos.tipo ? { type: datos.tipo, notes: notaDeOrigen(datos.tipo, datos.lead?.nombre) } : {}),
    ...(datos.responsable_externo !== undefined ? { responsable_externo: datos.responsable_externo } : {}),
  };
  const { data, error } = await supabase.from("tasks").update(campos).eq("id", item.id).select(COLUMNAS).maybeSingle();
  if (error) return { error: falta(error) ? SIN_170 : error.message };
  // La borraron mientras se la editaba: se dice, en vez de guardar en la nada.
  if (!data) return { error: "Esa tarea ya no existe: alguien la borró." };
  return { tarea: data };
}

/** Lo que hay que saber de esa tarea y solo sabe quien la trabajó. */
export async function guardarNota(item, nota) {
  const { error } = await supabase.from("tasks").update({ nota: nota || null }).eq("id", item.id);
  return error ? (falta(error) ? "falta_migracion" : error.message) : null;
}

/**
 * Una tarea que ya se hizo de nuestro lado y ahora depende de un tercero: el
 * permiso pedido, la respuesta del cliente, la muestra del proveedor. No es
 * pendiente —no hay nada que hacer— ni hecha —todavía no llega—.
 */
export async function marcarEspera(item, espera, quien) {
  const { error } = await supabase.from("tasks").update({ espera: !!espera }).eq("id", item.id);
  if (!error) {
    await anotar(item.lead_id, { detalle: `"${item.texto}" ${espera ? "queda esperando a un tercero" : "ya no espera"}`, quien });
  }
  return error ? (falta(error) ? "falta_migracion" : error.message) : null;
}

/** Borrar una tarea del proyecto. Es la misma de Tareas: se va de los dos lados. */
export async function borrarItem(item, quien) {
  const { error } = await supabase.from("tasks").delete().eq("id", item.id);
  if (!error) {
    await anotar(item.lead_id, { detalle: `Quitó "${item.texto}"`, quien });
    await alDiaElHito(item.lead_etapa_id, quien);
  }
  return error ? error.message : null;
}

/**
 * La bitácora: qué pasó en este proyecto, en orden.
 *
 * Se escribe sola con el trabajo —una actividad que se agrega, una que se
 * hace, una que se le encarga a alguien, un hito que cierra, un arreglo— para
 * que a fin de mes se pueda contar la obra sin acordarse de nada. Si falta la
 * columna `automatico` (migración 024) la fila entra igual: perder el
 * movimiento por una columna sería perder justo lo que se quería guardar.
 */
export async function anotar(leadId, { tipo = "actividad", detalle, quien, automatico = true }) {
  if (!leadId || !detalle) return null;
  const fila = { lead_id: leadId, tipo, automatico, detalle, autor_id: quien?.id ?? null, autor_nombre: quien?.name ?? null };
  let { error } = await supabase.from("lead_movimientos").insert(fila);
  if (error && /column|schema cache/i.test(error.message)) {
    const { automatico: auto, ...resto } = fila;
    ({ error } = await supabase.from("lead_movimientos").insert(resto));
  }
  return error ? error.message : null;
}

/** Lo que se corrigió, a la bitácora: quién la movió y de qué a qué. */
export const anotarCorreccion = (lead, detalle, quien) => anotar(lead.id, { detalle, quien });

/**
 * Mover un hito a la izquierda o a la derecha dentro de este proyecto.
 *
 * El orden de Ajustes es el predeterminado, no una ley: un proyecto puede
 * hacer las ingenierías antes que el anteproyecto, o volver a una etapa
 * anterior. El orden es de cada proyecto, y por eso se guarda acá y no en el
 * catálogo, que es de toda la oficina.
 *
 * Se renumera la fila entera —10, 20, 30…— en vez de cambiarle el número a dos.
 * Intercambiar servía solo si los números eran distintos, y no lo eran: los
 * proyectos de antes tenían todas sus etapas en cero o repetidas, así que la
 * flecha no movía nada y parecía rota.
 */
export async function moverEtapa(columnas, etapa, haciaLaDerecha) {
  const i = columnas.findIndex(e => e.id === etapa.id);
  const j = i + (haciaLaDerecha ? 1 : -1);
  if (i < 0 || j < 0 || j >= columnas.length) return null;
  const lista = [...columnas];
  [lista[i], lista[j]] = [lista[j], lista[i]];

  const cambios = lista
    .map((e, k) => ({ id: e.id, antes: e.orden, orden: (k + 1) * 10 }))
    .filter(x => x.antes !== x.orden);
  const errores = await Promise.all(
    cambios.map(x => supabase.from("lead_etapas").update({ orden: x.orden }).eq("id", x.id))
  );
  return errores.find(r => r.error)?.error?.message || null;
}

/**
 * Cerrar un hito, o volver a abrirlo.
 *
 * Casi siempre esto pasa solo: el hito arranca cuando se marca su primera
 * actividad y se cierra cuando se marca la última. Esos cambios no se anotan
 * en la bitácora —serían una fila por cada tilde—, salvo el cierre, que sí es
 * una noticia del proyecto.
 */
export async function cambiarEstadoEtapa(etapa, estado, quien, anotarlo = true, nombre) {
  const campos = { estado, hecha_at: estado === "hecha" ? new Date().toISOString() : null };
  const { error } = await supabase.from("lead_etapas").update(campos).eq("id", etapa.id);
  if (error) return error.message;
  if (!anotarlo) { await alDiaLaEtapaDelProyecto(etapa, estado); return null; }
  // En qué va el proyecto lo dice el tubo, y de ahí lo lee la lista del
  // pipeline. Sin este empate, un proyecto de Construcción seguía figurando en
  // la etapa con la que nació —"Lead"— aunque ya estuviera en obra gris.
  await alDiaLaEtapaDelProyecto(etapa, estado);
  await supabase.from("lead_movimientos").insert({
    lead_id: etapa.lead_id, tipo: "etapa", automatico: true,
    detalle: `${estado === "hecha" ? "Cerró" : estado === "en_curso" ? "Arrancó" : estado === "omitida" ? "Omitió" : "Reabrió"} la etapa${nombre ? ` ${nombre}` : ""}`,
    autor_id: quien?.id ?? null, autor_nombre: quien?.name ?? null,
  }).select();
  return null;
}

/**
 * La etapa del proyecto sigue al hito: al arrancar uno, ese es; al cerrarlo,
 * pasa al primero que quede abierto.
 */
async function alDiaLaEtapaDelProyecto(etapa, estado) {
  let etapaId = null;
  if (estado === "en_curso") etapaId = etapa.etapa_id;
  else if (estado === "hecha") {
    const { data } = await supabase.from("lead_etapas")
      .select("id,etapa_id,estado,orden").eq("lead_id", etapa.lead_id).order("orden");
    const abiertas = (data || []).filter(e => e.id !== etapa.id && e.estado !== "hecha" && e.estado !== "omitida");
    // Si alguien dijo expresamente "estamos acá" en otra etapa, el proyecto se
    // queda ahí: una decisión de una persona pesa más que el orden del tubo.
    const declarada = [...abiertas].reverse().find(e => e.estado === "en_curso");
    // Si no, la que sigue a la que se cerró; y si esa era la última, la primera
    // que quede abierta. Sin esto, cerrar obra gris devolvía el proyecto a una
    // etapa anterior que nadie había cerrado, y parecía que retrocedió.
    etapaId = (declarada || abiertas.find(e => e.orden > etapa.orden) || abiertas[0])?.etapa_id || null;
  }
  if (etapaId) await supabase.from("leads").update({ etapa: etapaId }).eq("id", etapa.lead_id);
}

/** Cuánto lleva hecho un hito, según sus actividades. */
export function avanceDe(items = []) {
  if (!items.length) return null;
  return Math.round(items.filter(i => i.hecho).length / items.length * 100);
}

/**
 * Dejar constancia en el pipeline de que se le mandó algo al cliente.
 *
 * Lo usa el presupuesto cuando se marca como enviado: hasta ahora eso quedaba
 * solo en la ficha del presupuesto, y en el pipeline —que es donde se mira
 * "¿en qué va este proyecto?"— no aparecía nada. El resultado era el clásico
 * "¿ya le mandamos la propuesta?" preguntado por WhatsApp.
 *
 * Entra como Envío en la etapa que se diga —Presupuesto, por defecto—, YA
 * CERRADO, porque ya pasó. Antes nacía abierto y se lo marcaba después, y ese
 * segundo paso no llegaba a la tarea: el «Presupuesto enviado» del Aéreo
 * estuvo abierto y vencido desde el 7 de octubre, a nombre del cliente.
 * Si esa etapa no existe en el tubo del proyecto se crea: que falte la etapa
 * no es razón para perder el registro.
 */
export async function registrarEnvio(lead, { titulo, destinatario, fecha, quien, etapaId = "presupuesto", nombreEtapa = "Presupuesto" }) {
  if (!lead?.id) return { error: "Sin proyecto" };

  let { data: etapa } = await supabase.from("lead_etapas")
    .select("*").eq("lead_id", lead.id).eq("etapa_id", etapaId).maybeSingle();

  if (!etapa) {
    const { data: ultimas } = await supabase.from("lead_etapas")
      .select("orden").eq("lead_id", lead.id).order("orden", { ascending: false }).limit(1);
    const { data: creada, error } = await supabase.from("lead_etapas").insert({
      lead_id: lead.id, etapa_id: etapaId, orden: (ultimas?.[0]?.orden || 0) + 10, estado: "en_curso",
    }).select().single();
    if (error) return { error: falta(error) ? "Falta correr la migración 040." : error.message };
    etapa = creada;
  }

  const { count } = await supabase.from("tasks")
    .select("id", { count: "exact", head: true }).eq("lead_etapa_id", etapa.id);

  const r = await agregarTarea({
    lead, etapa, titulo, orden: (count || 0) + 1, tipo: "Envío", due_date: fecha || null,
    responsable_externo: destinatario || null, hecha: true, quien, nombreEtapa,
  });
  if (r.error) return { error: r.error };

  await anotar(lead.id, { detalle: `Envío a ${destinatario || "el cliente"}: ${titulo}.`, quien, tipo: "nota" });
  return { item: r.item };
}
