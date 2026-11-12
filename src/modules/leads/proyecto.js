import { supabase } from "../../lib/supabase";
import { COLUMNAS, comoActividad, delProyecto, filaNueva, alMarcar, notaDeOrigen } from "./tareasDelProyecto.js";

// Lo que se guarda de un proyecto: lo que cambia en él —su etapa, su tipo, si
// espera al cliente—, sus tareas y su historia.
//
// Las decisiones no están acá: están en pipeline.js y en tareasDelProyecto.js,
// que no tocan la base y por eso se pueden probar. Esto es el brazo que
// escribe lo que ellas dicen.
//
// Lo que hay que hacer en un proyecto son TAREAS: las mismas que se ven en
// Tareas. No hay etapas por proyecto con su estado ni «estamos acá» —el lead
// está en una etapa y lo dice él (`leads.etapa`)—; la tarea lleva de etiqueta
// en cuál se escribió.

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");
// Para la bitácora: "9 oct" se lee, "2026-10-09" hay que traducirlo. Al mediodía
// para que la fecha no se corra un día al leerla desde Ecuador.
const enCriollo = f => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "");

const SIN_170 = "Falta correr la migración 170 en Supabase.";
export const SIN_176 = "Falta correr la migración 176 en Supabase.";
export const SIN_171 = "Falta correr la migración 171 en Supabase.";

/**
 * Guardar en el lead lo que decidió pipeline.js, y dejarlo escrito en su
 * historia.
 *
 * @param cambio  lo que devuelven alCambiarEtapa, alEsperar, alAprobar…:
 *                { campos, detalle, tipo?, etapa_de?, etapa_a? } o { error }
 * @returns { lead } con los campos ya puestos, o { error }
 */
export async function aplicar(lead, cambio, quien) {
  if (!cambio) return { lead };
  if (cambio.error) return { error: cambio.error };
  const { error } = await supabase.from("leads")
    .update({ ...cambio.campos, actualizado_at: new Date().toISOString() }).eq("id", lead.id);
  if (error) return { error: falta(error) ? SIN_171 : error.message };
  await anotar(lead.id, {
    tipo: cambio.tipo || "nota", detalle: cambio.detalle, quien,
    ...(cambio.tipo === "etapa" ? { extra: { etapa_de: cambio.etapa_de, etapa_a: cambio.etapa_a } } : {}),
  });
  return { lead: { ...lead, ...cambio.campos } };
}

/**
 * Las tareas del proyecto.
 *
 * @returns { abiertas, hechas, tareas, sinMigracion, compartidas, sinCompartir }
 *   `abiertas` y `hechas` con los nombres que usa la pantalla, ya en el orden
 *   en que se leen; `tareas`, las mismas filas enteras, por id; `compartidas`,
 *   los id de las que ve el cliente en su enlace.
 */
export async function cargarTareas(leadId) {
  // Cuáles ve el cliente se pide aparte: si falta esa columna (migración 176)
  // la lista se sigue viendo entera, y solo no se ofrece compartir.
  const [{ data, error }, { data: vistas, error: eVistas }] = await Promise.all([
    supabase.from("tasks").select(COLUMNAS).eq("lead_id", leadId).order("id"),
    supabase.from("tasks").select("id").eq("lead_id", leadId).eq("visible_cliente", true),
  ]);
  if (error) return { abiertas: [], hechas: [], tareas: {}, compartidas: new Set(), sinMigracion: falta(error), error: error.message };
  const { abiertas, hechas } = delProyecto(data || []);
  return {
    abiertas: abiertas.map(comoActividad), hechas: hechas.map(comoActividad),
    tareas: Object.fromEntries([...abiertas, ...hechas].map(t => [t.id, t])),
    compartidas: new Set((eVistas ? [] : vistas || []).map(t => t.id)),
    sinCompartir: !!eVistas,
    sinMigracion: false,
  };
}

/**
 * Sumar una tarea al proyecto.
 *
 * Una sola fila en `tasks`: la misma que ve su responsable en Tareas.
 *
 * @param etapaId  en qué etapa está el lead ahora: queda de etiqueta en la tarea
 * @param hecha    un envío ya ocurrió: nace cerrado y queda de registro
 * @returns { tarea, item } o { error }
 */
export async function agregarTarea({
  lead, etapaId = null, titulo, orden = 0, tipo = "Gestión", assignee_id = null, due_date = null, hora = null,
  urgente = false, responsable_externo = null, hecha = false, quien = null, nombreResponsable = null,
}) {
  const fila = filaNueva({
    lead, etapaId, titulo, orden, tipo, assignee_id, due_date, hora, urgente, responsable_externo, hecha,
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
  return { tarea, item: comoActividad(tarea) };
}

/**
 * Sumar varias de una vez: la lista que se pega, una tarea por renglón.
 *
 * Son gestiones —se marcan cuando pasan—, todas con el mismo responsable y la
 * misma fecha si se eligieron. No sale un correo por cada una: a quien las
 * tenga le aparecen en su bandeja y en el correo de la mañana.
 *
 * @param alCliente  nacen ya a la vista del cliente en su enlace
 * @returns { cuantas } o { error }
 */
export async function agregarVarias({
  lead, etapaId = null, titulos = [], desde = 0, assignee_id = null, responsable_externo = null, due_date = null,
  alCliente = false, quien = null, nombreResponsable = null,
}) {
  const filas = titulos.map((titulo, i) => ({
    ...filaNueva({
      lead, etapaId, titulo, orden: desde + i + 1, tipo: "Gestión", assignee_id, due_date, responsable_externo,
      creadoPor: quien?.id ?? lead.created_by ?? null, quienNombre: quien?.name || null,
    }),
    ...(alCliente ? { visible_cliente: true } : {}),
  })).filter(f => f.title);
  if (!filas.length) return { error: "No hay ningún renglón para agregar." };
  const { error } = await supabase.from("tasks").insert(filas);
  if (error) return { error: falta(error) ? (alCliente ? SIN_176 : SIN_170) : error.message };

  const aQuien = responsable_externo || nombreResponsable;
  await anotar(lead.id, {
    detalle: `Sumó ${filas.length} ${filas.length === 1 ? "tarea" : "tareas"} de una lista`
      + (aQuien ? `, a cargo de ${aQuien}` : "") + (due_date ? `, para el ${enCriollo(due_date)}` : "")
      + (alCliente ? ", a la vista del cliente" : "") + `: ${filas.map(f => f.title).join("; ")}.`,
    quien,
  });
  return { cuantas: filas.length };
}

/**
 * Mostrarle una tarea al cliente en su enlace, o dejar de mostrársela.
 *
 * El cliente ve qué dice y si está lista. Queda escrito en la historia del
 * proyecto: qué se le mostró y quién lo decidió.
 *
 * @param items  una o varias tareas, como las ve la lista
 */
export async function mostrarAlCliente(items, ver, quien) {
  const lista = [].concat(items || []).filter(Boolean);
  if (!lista.length) return null;
  const { error } = await supabase.from("tasks").update({ visible_cliente: !!ver }).in("id", lista.map(i => i.id));
  if (error) return falta(error) ? SIN_176 : error.message;
  await anotar(lista[0].lead_id, {
    detalle: lista.length === 1
      ? `${ver ? "Le mostró al cliente" : "Dejó de mostrarle al cliente"} "${lista[0].texto}"`
      : `${ver ? "Le mostró al cliente" : "Dejó de mostrarle al cliente"} ${lista.length} tareas: ${lista.map(i => i.texto).join("; ")}.`,
    quien,
  });
  return null;
}

/**
 * Marcar una tarea del proyecto como hecha, o volver a abrirla.
 *
 * @param item    la tarea como la ve la lista (comoActividad)
 * @param quien   el nombre de quien la marca, que queda escrito en ella
 * @param autor   la persona, para la bitácora
 */
export async function marcarItem(item, hecho, quien, autor) {
  const { error } = await supabase.from("tasks").update(alMarcar(hecho, quien || autor?.name || null)).eq("id", item.id);
  if (error) return falta(error) ? SIN_170 : error.message;
  await anotar(item.lead_id, { detalle: `${hecho ? "Hizo" : "Volvió a abrir"} "${item.texto}"`, quien: autor });
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

/** Ponerle o correrle la fecha a una tarea, de un toque. */
export async function ponerFecha(item, fecha, quien) {
  const { error } = await supabase.from("tasks").update({ due_date: fecha || null }).eq("id", item.id);
  if (error) return error.message;
  await anotar(item.lead_id, {
    detalle: fecha ? `"${item.texto}" queda para el ${enCriollo(fecha)}` : `"${item.texto}" se queda sin fecha`, quien,
  });
  return null;
}

/** Lo que hay que saber de esa tarea y solo sabe quien la trabajó. */
export async function guardarNota(item, nota) {
  const { error } = await supabase.from("tasks").update({ nota: nota || null }).eq("id", item.id);
  return error ? (falta(error) ? "falta_migracion" : error.message) : null;
}

/**
 * Una tarea que ya se hizo de nuestro lado y ahora depende de un tercero: el
 * permiso pedido, la muestra del proveedor. No es pendiente —no hay nada que
 * hacer— ni hecha —todavía no llega—.
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
  if (!error) await anotar(item.lead_id, { detalle: `Quitó "${item.texto}"`, quien });
  return error ? error.message : null;
}

/**
 * La bitácora: qué pasó en este proyecto, en orden.
 *
 * Se escribe sola con el trabajo —una tarea que se agrega, una que se hace,
 * una que se le encarga a alguien, un cambio de etapa, una insistencia al
 * cliente— para que a fin de mes se pueda contar el proyecto sin acordarse de
 * nada. Si falta la columna `automatico` (migración 024) la fila entra igual:
 * perder el movimiento por una columna sería perder justo lo que se quería
 * guardar.
 */
export async function anotar(leadId, { tipo = "actividad", detalle, quien, automatico = true, extra = {} }) {
  if (!leadId || !detalle) return null;
  const fila = { lead_id: leadId, tipo, automatico, detalle, autor_id: quien?.id ?? null, autor_nombre: quien?.name ?? null, ...extra };
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
 * Dejar constancia en el proyecto de que se le mandó algo al cliente.
 *
 * Lo usa el presupuesto cuando se marca como enviado: hasta ahora eso quedaba
 * solo en la ficha del presupuesto, y en el pipeline —que es donde se mira
 * "¿en qué va este proyecto?"— no aparecía nada. El resultado era el clásico
 * "¿ya le mandamos la propuesta?" preguntado por WhatsApp.
 *
 * Entra como Envío YA CERRADO, porque ya pasó. Antes nacía abierto y se lo
 * marcaba después, y ese segundo paso no llegaba a la tarea: el «Presupuesto
 * enviado» del Aéreo estuvo abierto y vencido desde el 7 de octubre, a nombre
 * del cliente.
 */
export async function registrarEnvio(lead, { titulo, destinatario, fecha, quien }) {
  if (!lead?.id) return { error: "Sin proyecto" };
  // En qué etapa está hoy: queda de etiqueta. Si no se puede leer, el registro
  // entra igual, sin ella.
  const { data: fila } = await supabase.from("leads").select("etapa,resultado").eq("id", lead.id).maybeSingle();
  const r = await agregarTarea({
    lead, etapaId: fila && !fila.resultado ? fila.etapa : null, titulo, tipo: "Envío", due_date: fecha || null,
    responsable_externo: destinatario || null, hecha: true, quien,
  });
  if (r.error) return { error: r.error };

  await anotar(lead.id, { detalle: `Envío a ${destinatario || "el cliente"}: ${titulo}.`, quien, tipo: "nota" });
  return { item: r.item };
}
