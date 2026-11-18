import { supabase } from "../../lib/supabase";
import { COLUMNAS, comoActividad, delProyecto, filaNueva, alMarcar, notaDeOrigen } from "./tareasDelProyecto.js";
import { porTarea } from "./historialDeTarea.js";
import { esFoto, repartir, porQueNoEntra, rutaParaSubir, filaAlSubir } from "./archivosDelCliente.js";
import { filaDelPedido } from "./aprobaciones.js";
import { enlacesArchivos, subirArchivo } from "../../lib/archivos";

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
export const SIN_178 = "Falta correr la migración 178 en Supabase.";
export const SIN_171 = "Falta correr la migración 171 en Supabase.";
export const SIN_185 = "Para que el cliente lea las anotaciones falta correr la migración 185 en Supabase.";
export const SIN_186 = "Para pedirle la aprobación al cliente falta correr la migración 186 en Supabase.";
export const SIN_187 = "Para llevar el registro de aprobaciones falta correr la migración 187 en Supabase.";
export const SIN_188 = "Para ponerle fecha límite a una aprobación falta correr la migración 188 en Supabase.";

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
 * @returns { abiertas, hechas, tareas, sinMigracion, compartidas, sinCompartir, aprobaciones, sinAprobacion }
 *   `abiertas` y `hechas` con los nombres que usa la pantalla, ya en el orden
 *   en que se leen; `tareas`, las mismas filas enteras, por id; `compartidas`,
 *   los id de las que ve el cliente en su enlace; `aprobaciones`, por id, lo
 *   que se le pidió aprobar y qué contestó: { estado, respondido_at, nota }.
 */
export async function cargarTareas(leadId) {
  // Cuáles ve el cliente se pide aparte: si falta esa columna (migración 176)
  // la lista se sigue viendo entera, y solo no se ofrece compartir.
  // Y lo escrito para él —la descripción y la actualización de cada punto—,
  // también aparte: sin la migración 178 se comparte igual, solo con el
  // título y el estado.
  // Y lo que se le pidió aprobar, también aparte (migración 186): sin ella
  // todo lo demás anda, y solo no se ofrece pedirle la aprobación.
  const [{ data, error }, { data: vistas, error: eVistas }, { data: textos, error: eTextos }, { data: pedidas, error: ePedidas }] = await Promise.all([
    supabase.from("tasks").select(COLUMNAS).eq("lead_id", leadId).order("id"),
    supabase.from("tasks").select("id").eq("lead_id", leadId).eq("visible_cliente", true),
    supabase.from("tasks").select("id,cliente_descripcion,cliente_actualizacion,cliente_actualizado_at").eq("lead_id", leadId).eq("visible_cliente", true),
    supabase.from("tasks").select("id,cliente_aprueba,cliente_respuesta,cliente_respuesta_at,cliente_respuesta_nota").eq("lead_id", leadId).eq("cliente_aprueba", true),
  ]);
  // La fecha límite de cada pedido (migración 188), aparte: sin ella se pide igual, sin plazo.
  const { data: plazos, error: ePlazos } = ePedidas ? { data: [], error: null }
    : await supabase.from("tasks").select("id,cliente_aprueba_hasta").eq("lead_id", leadId).eq("cliente_aprueba", true);
  const hastaDe = Object.fromEntries((ePlazos ? [] : plazos || []).map(t => [t.id, t.cliente_aprueba_hasta || null]));
  if (error) return { abiertas: [], hechas: [], tareas: {}, compartidas: new Set(), paraElCliente: {}, aprobaciones: {}, sinMigracion: falta(error), error: error.message };
  const { abiertas, hechas } = delProyecto(data || []);
  return {
    abiertas: abiertas.map(comoActividad), hechas: hechas.map(comoActividad),
    tareas: Object.fromEntries([...abiertas, ...hechas].map(t => [t.id, t])),
    compartidas: new Set((eVistas ? [] : vistas || []).map(t => t.id)),
    sinCompartir: !!eVistas,
    paraElCliente: Object.fromEntries((eTextos ? [] : textos || []).map(t => [t.id, {
      descripcion: t.cliente_descripcion || "", actualizacion: t.cliente_actualizacion || "", actualizado_at: t.cliente_actualizado_at || null,
    }])),
    sinReporte: !!eTextos && !eVistas,
    aprobaciones: Object.fromEntries((ePedidas ? [] : pedidas || []).map(t => [t.id, {
      estado: ["aprobado", "observado"].includes(t.cliente_respuesta) ? t.cliente_respuesta : "pendiente",
      respondido_at: t.cliente_respuesta_at || null, nota: t.cliente_respuesta_nota || "", hasta: hastaDe[t.id] || null,
    }])),
    sinAprobacion: !!ePedidas && !eVistas,
    sinPlazo: !!ePlazos,
    sinMigracion: false,
  };
}

/**
 * Pedirle al cliente que apruebe un punto desde su enlace, o dejar de pedírselo.
 *
 * Pedir de nuevo borra la respuesta anterior DE LA TAREA: es para cuando algo
 * se corrigió o cambió el archivo, y hay que aprobar lo nuevo. Lo que había
 * contestado no se pierde: quedó en el registro y en el historial del punto.
 *
 * CADA PEDIDO ES UNA FILA DEL REGISTRO (migración 187). Al pedir entra una
 * nueva; al retirar el pedido, la que estaba abierta queda como retirada. Sin
 * la 187 se pide igual, y solo no queda en el registro.
 *
 * LA FECHA LÍMITE (migración 188) va en la tarea —la del pedido abierto— y en
 * la fila del registro, que la conserva aunque después se le vuelva a pedir
 * con otra. Sin la 188 se pide igual, sin plazo.
 *
 * @param item         el punto, como lo ve la lista
 * @param descripcion  lo escrito para el cliente sobre el punto: queda en el pedido
 * @param hasta        hasta qué día tiene para aprobar (AAAA-MM-DD), o nada
 * @returns null o el error
 */
export async function pedirAprobacion(item, pedir, quien, { descripcion = "", hasta = null } = {}) {
  const plazo = pedir ? String(hasta || "").slice(0, 10) || null : null;
  const campos = pedir
    ? { cliente_aprueba: true, cliente_respuesta: null, cliente_respuesta_at: null, cliente_respuesta_nota: null }
    : { cliente_aprueba: false };
  let { error } = await supabase.from("tasks").update({ ...campos, cliente_aprueba_hasta: plazo }).eq("id", item.id);
  // Sin la 188 esa columna no existe: se pide sin plazo.
  const sinPlazo = !!error && falta(error) && /cliente_aprueba_hasta/.test(error.message || "");
  if (sinPlazo) ({ error } = await supabase.from("tasks").update(campos).eq("id", item.id));
  if (error) return falta(error) ? SIN_186 : error.message;
  // El pedido que estaba abierto ya no vale: se retira. (Al pedir de nuevo
  // sobre uno contestado no hay ninguno abierto, y no pasa nada.)
  await supabase.from("aprobaciones_cliente")
    .update({ retirada_at: new Date().toISOString(), retirada_nombre: quien?.name || null })
    .eq("task_id", item.id).is("respuesta", null).is("retirada_at", null);
  // La hora del pedido se dice acá: de ella sale el orden y el número de cada
  // pedido, y no puede depender de que la base la ponga sola.
  if (pedir) {
    const fila = { ...filaDelPedido({ item, descripcion, quien, hasta: sinPlazo ? null : plazo }), pedida_at: new Date().toISOString() };
    const { error: eFila } = await supabase.from("aprobaciones_cliente").insert(fila);
    // Si lo que falta es solo la columna del plazo, la fila entra sin él.
    if (eFila && fila.vence_el && falta(eFila)) { const { vence_el, ...sinEl } = fila; await supabase.from("aprobaciones_cliente").insert(sinEl); }
  }
  await anotar(item.lead_id, {
    detalle: pedir
      ? `Le pidió al cliente que apruebe "${item.texto}"${plazo && !sinPlazo ? `, hasta el ${enCriollo(plazo)}` : ""}`
      : `Dejó de pedirle al cliente que apruebe "${item.texto}"`,
    quien, extra: { task_id: item.id },
  });
  return plazo && sinPlazo ? `Quedó pedido, pero sin fecha límite: ${SIN_188}` : null;
}

/**
 * Cambiarle la fecha límite a un pedido que sigue esperando, o quitársela.
 * Cambia en la tarea y en el pedido abierto del registro, y queda en el
 * historial del punto.
 * @returns null o el error
 */
export async function ponerPlazoDeAprobacion(item, hasta, quien) {
  const plazo = String(hasta || "").slice(0, 10) || null;
  const { error } = await supabase.from("tasks").update({ cliente_aprueba_hasta: plazo }).eq("id", item.id);
  if (error) return falta(error) ? SIN_188 : error.message;
  await supabase.from("aprobaciones_cliente").update({ vence_el: plazo }).eq("task_id", item.id).is("respuesta", null).is("retirada_at", null);
  await anotar(item.lead_id, {
    detalle: plazo ? `El cliente tiene hasta el ${enCriollo(plazo)} para aprobar "${item.texto}"` : `"${item.texto}" queda sin fecha límite para que el cliente apruebe`,
    quien, extra: { task_id: item.id },
  });
  return null;
}

/**
 * ENVIARLE ALGO AL CLIENTE PARA QUE LO APRUEBE, DE UNA VEZ.
 *
 * Hernán, 18/11/2026, con todo ya publicado: «¿desde dónde envío presupuestos,
 * planos, documentos para aprobar?». Eran cuatro pasos en dos lugares:
 * agregar el punto al checklist, mostrárselo al cliente, subirle el archivo y
 * pedirle que lo apruebe. Esto los hace seguidos, desde una sola ventana de la
 * pestaña «Aprobaciones»; el punto queda igual en el checklist, donde se le
 * sigue el rastro.
 *
 * SI SE ELIGIERON ARCHIVOS Y NO SUBIÓ NINGUNO, NO SE LE PIDE NADA: el cliente
 * tendría los botones de aprobar delante de un punto vacío. El punto queda
 * creado y a la vista, y se dice qué falló, para subirlo desde ahí.
 *
 * @param titulo       qué tiene que aprobar: es el título del punto
 * @param descripcion  unas palabras para él (opcional)
 * @param etapaId      en qué etapa del checklist queda
 * @param archivos     los File elegidos
 * @param hasta        hasta qué día tiene para aprobar, o nada
 * @returns { error } si no se pudo ni crear · { item, sinPedir, errores } si
 *          no subió nada · { item, subidos, errores, aviso } si quedó pedido
 */
export async function enviarParaAprobar({ lead, titulo, descripcion = "", etapaId = null, archivos = [], quien = null, hasta = null }) {
  const que = String(titulo || "").trim();
  if (!que) return { error: "Escribí qué tiene que aprobar: «Plano de cocina», «Presupuesto rev. 2»…" };
  const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("lead_id", lead.id);
  // El punto queda a cargo de quien lo envía: es quien va a esperar la respuesta.
  const r = await agregarTarea({
    lead, etapaId, titulo: que, tipo: "Gestión", orden: (count || 0) + 1,
    assignee_id: quien?.id ?? null, nombreResponsable: quien?.name || null, quien,
  });
  if (r.error) return { error: r.error };
  const item = r.item;
  const e = await mostrarAlCliente(item, true, quien);
  if (e) return { error: `El punto quedó en el checklist, pero no se le pudo mostrar al cliente: ${e}`, item };
  if (String(descripcion || "").trim()) await escribirleAlCliente(item, { descripcion });
  let subida = { subidos: 0, errores: [] };
  if (archivos.length) {
    subida = await subirParaElCliente({ lead, punto: item, archivos, quien });
    if (!subida.subidos) return { item, sinPedir: true, errores: subida.errores };
  }
  const e2 = await pedirAprobacion(item, true, quien, { descripcion, hasta });
  // «Quedó pedido, pero…» no es un error: es un aviso, y el pedido está hecho.
  if (e2 && !/^Quedó pedido/.test(e2)) return { error: `El punto quedó en el checklist, pero no se pudo pedir la aprobación: ${e2}`, item, errores: subida.errores };
  return { item, subidos: subida.subidos, errores: subida.errores, aviso: e2 || "" };
}

/**
 * Avisarle al cliente por correo que tiene un punto para aprobar. Lo manda el
 * servidor, con qué tiene que revisar y el botón a su enlace.
 *
 * @param correos  a quién: los correos elegidos
 * @returns { ok, enviadoA } o { error }
 */
export async function avisarDelPedido({ item, correos = [], whatsapps = [], mensaje = "", quien = null }) {
  try {
    const r = await fetch("/api/aviso?de=pedido", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: item.lead_id, taskId: item.id, correos, mensaje,
        ...(whatsapps.length ? { whatsapps } : {}),
        quien: quien ? { id: quien.id, name: quien.name, email: quien.email || null } : null,
      }),
    });
    const d = await r.json();
    // `porWhatsApp` es [{ nombre, telefono, ok, error }]: a quién le salió y a quién no.
    const porWhatsApp = Array.isArray(d.porWhatsApp) ? d.porWhatsApp : [];
    return d.ok
      ? { ok: true, enviadoA: d.enviadoA || [], porWhatsApp, correoError: d.correoError || "" }
      : { error: d.error || "No se pudo avisar.", porWhatsApp };
  } catch (e) {
    return { error: "No se pudo avisar: " + e.message };
  }
}

/**
 * Cómo está el WhatsApp de FOREMAN: si el número ya está configurado en Meta
 * —y entonces el aviso sale solo— y, con `leadId`, qué pasó con cada WhatsApp
 * que salió por ese proyecto. Si no se puede preguntar, se toma como que no
 * está: la pantalla sigue ofreciendo el botón que abre el WhatsApp de uno.
 * @returns { configurado, falta, plantilla, webhook, ultimaPrueba, sinMigracion, estados }
 */
export async function whatsappDeForeman(leadId = null) {
  try {
    const r = await fetch(`/api/aviso?de=whatsapp${leadId ? `&lead=${leadId}` : ""}`);
    const d = await r.json();
    return { configurado: d?.configurado === true, falta: d?.falta || [], plantilla: d?.plantilla || null, webhook: d?.webhook || "",
      ultimaPrueba: d?.ultimaPrueba || null, sinMigracion: !!d?.sinMigracion, estados: Array.isArray(d?.estados) ? d.estados : [] };
  } catch {
    return { configurado: false, falta: [], plantilla: null, webhook: "", ultimaPrueba: null, sinMigracion: false, estados: [] };
  }
}

/** Manda la plantilla, con datos de prueba, al celular de quien la pide. @returns { ok, enviadoA, termina } | { error } */
export async function probarWhatsApp(usuarioId) {
  try {
    const r = await fetch("/api/aviso?de=whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuarioId }) });
    const d = await r.json();
    return d.ok ? d : { error: d.error || "No se pudo mandar la prueba." };
  } catch (e) {
    return { error: "No se pudo mandar la prueba: " + e.message };
  }
}

/**
 * El enlace del cliente de este proyecto, o null si no está prendido: sin él
 * no tiene dónde aprobar, y no hay nada que mandarle.
 */
export async function enlaceDelClienteDe(leadId) {
  const { data, error } = await supabase.from("leads").select("portal_token,portal_activo").eq("id", leadId).maybeSingle();
  if (error || !data?.portal_token || !data.portal_activo) return null;
  return `${window.location.origin}/?cliente=${data.portal_token}`;
}

/**
 * El registro de aprobaciones de un proyecto, tal cual está en la base, y lo
 * que hoy tienen para mirar los puntos que esperan respuesta.
 *
 * @returns { filas, archivosDeAhora: { [task_id]: [archivos] }, sinMigracion }
 */
export async function cargarAprobaciones(leadId) {
  const { data, error } = await supabase.from("aprobaciones_cliente").select("*").eq("lead_id", leadId).order("pedida_at");
  if (error) return { filas: [], archivosDeAhora: {}, sinMigracion: falta(error), error: falta(error) ? null : error.message };
  const abiertos = (data || []).filter(f => !f.respuesta && !f.retirada_at && f.task_id != null).map(f => f.task_id);
  let archivosDeAhora = {};
  if (abiertos.length) {
    const { data: suyos } = await supabase.from("proyecto_archivos").select("id,task_id,nombre,storage_path,created_at")
      .eq("lead_id", leadId).eq("visible_cliente", true).in("task_id", abiertos).order("created_at");
    archivosDeAhora = porTarea(suyos || []);
  }
  return { filas: data || [], archivosDeAhora, sinMigracion: false };
}

/**
 * Lo que se le escribe al cliente sobre un punto del checklist: qué es y qué
 * hay de nuevo. La fecha de la actualización se pone sola cuando el texto
 * cambia, para que él lea cuán fresca es.
 *
 * @param campos  { descripcion } y/o { actualizacion }: solo lo que cambió
 * @returns null o el error
 */
export async function escribirleAlCliente(item, campos = {}, ahora = new Date()) {
  const cambio = {};
  if (campos.descripcion !== undefined) cambio.cliente_descripcion = String(campos.descripcion || "").trim() || null;
  if (campos.actualizacion !== undefined) {
    cambio.cliente_actualizacion = String(campos.actualizacion || "").trim() || null;
    cambio.cliente_actualizado_at = cambio.cliente_actualizacion ? ahora.toISOString() : null;
  }
  if (!Object.keys(cambio).length) return null;
  const { error } = await supabase.from("tasks").update(cambio).eq("id", item.id);
  return error ? (falta(error) ? SIN_178 : error.message) : null;
}

/**
 * Mandarle el checklist por correo: lo mismo que ve en su enlace.
 *
 * @param invitados  ids de la gente de afuera del proyecto
 * @param otros      correos escritos a mano
 * @returns { ok, enviadoA } o { error }
 */
export async function enviarChecklist({ lead, invitados = [], otros = [], mensaje = "", quien = null }) {
  try {
    const r = await fetch("/api/aviso?de=checklist", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id, invitados, otros, mensaje,
        quien: quien ? { id: quien.id, name: quien.name, email: quien.email || null } : null,
      }),
    });
    const d = await r.json();
    return d.ok ? { ok: true, enviadoA: d.enviadoA || [] } : { error: d.error || "No se pudo enviar." };
  } catch (e) {
    return { error: "No se pudo enviar: " + e.message };
  }
}

/**
 * Sumar una tarea al proyecto.
 *
 * Una sola fila en `tasks`: la misma que ve su responsable en Tareas.
 *
 * @param etapaId  en qué etapa está el lead ahora: queda de etiqueta en la tarea
 * @param hecha    un envío ya ocurrió: nace cerrado y queda de registro
 * @param vieneDe  { id, texto } del punto que se terminó y del que esta sigue:
 *                 queda escrito en el historial de las dos
 * @returns { tarea, item } o { error }
 */
export async function agregarTarea({
  lead, etapaId = null, titulo, orden = 0, tipo = "Gestión", assignee_id = null, due_date = null, hora = null,
  urgente = false, responsable_externo = null, hecha = false, quien = null, nombreResponsable = null, vieneDe = null,
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
    await anotar(lead.id, {
      detalle: `Sumó "${tarea.title}"${vieneDe?.texto ? `, que viene de "${vieneDe.texto}"` : ""}`, quien, extra: { task_id: tarea.id },
    });
    // La continuidad se lee desde los dos lados: en la que nace, de dónde
    // viene; en la que se terminó, con qué siguió.
    if (vieneDe?.id) {
      await anotar(lead.id, { detalle: `"${vieneDe.texto}" sigue con "${tarea.title}"`, quien, extra: { task_id: vieneDe.id } });
    }
    // Encargarle algo a alguien es de las cosas que hay que poder rastrear.
    if (assignee_id || responsable_externo) {
      await anotar(lead.id, {
        detalle: `Le encargó "${tarea.title}" a ${responsable_externo || nombreResponsable || "alguien del equipo"}`
          + (due_date ? `, para el ${enCriollo(due_date)}${hora ? ` a las ${hora}` : ""}` : ""),
        quien, extra: { task_id: tarea.id },
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
    // Un renglón que habla de varias no es de ninguna: queda en la bitácora
    // del proyecto y no en el historial de cada una.
    ...(lista.length === 1 ? { extra: { task_id: lista[0].id } } : {}),
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
  await anotar(item.lead_id, { detalle: `${hecho ? "Hizo" : "Volvió a abrir"} "${item.texto}"`, quien: autor, extra: { task_id: item.id } });
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

/**
 * Ponerle o correrle la fecha a una tarea, de un toque.
 *
 * Con `hora` es agendar: «la reunión con Madeval, el 18 a las 10». El punto
 * sigue siendo el mismo —no nace una tarea aparte para la reunión— y el paso
 * queda en su historial.
 *
 * @param hora  "10:00", o null para todo el día. Si no se pasa, la hora que
 *              tuviera no se toca. Sin día no hay hora: se va con él.
 */
export async function ponerFecha(item, fecha, quien, hora = undefined) {
  const campos = { due_date: fecha || null };
  if (!fecha) campos.hora = null;
  else if (hora !== undefined) campos.hora = hora || null;
  const { error } = await supabase.from("tasks").update(campos).eq("id", item.id);
  if (error) return error.message;
  await anotar(item.lead_id, {
    detalle: fecha ? `"${item.texto}" queda para el ${enCriollo(fecha)}${campos.hora ? ` a las ${campos.hora}` : ""}` : `"${item.texto}" se queda sin fecha`,
    quien, extra: { task_id: item.id },
  });
  return null;
}

/**
 * De qué etapa es un punto. La etapa la dice la tarea: se puede cargar hoy
 * algo de Presupuesto con el proyecto todavía en Ingenierías, sin tener que
 * mover el proyecto de etapa para cargarlo y volverlo después.
 *
 * @param nombres  { de, a }: cómo se llaman, para dejarlo escrito
 * @returns null o el error
 */
export async function moverDeEtapa(item, etapaId, { de = null, a = null } = {}, quien) {
  const { error } = await supabase.from("tasks").update({ etapa_id: etapaId || null }).eq("id", item.id);
  if (error) return falta(error) ? SIN_170 : error.message;
  await anotar(item.lead_id, {
    detalle: `"${item.texto}" ${etapaId ? `pasa a la etapa ${a || "elegida"}` : "queda sin etapa"}${de ? ` (estaba en ${de})` : ""}`,
    quien, extra: { task_id: item.id },
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
    await anotar(item.lead_id, {
      detalle: `"${item.texto}" ${espera ? "queda esperando a un tercero" : "ya no espera"}`, quien, extra: { task_id: item.id },
    });
  }
  return error ? (falta(error) ? "falta_migracion" : error.message) : null;
}

/** Borrar una tarea del proyecto. Es la misma de Tareas: se va de los dos lados. */
export async function borrarItem(item, quien) {
  // LO QUE EL CLIENTE VEÍA EN ESTE PUNTO DEJA DE VERSE. Los archivos no se
  // borran con el punto —quedan en los del proyecto—, pero sin el punto
  // pasarían a mostrarse como «del proyecto», que nadie decidió. Si esa
  // columna todavía no existe (migración 184), no hay nada que apagar.
  await supabase.from("proyecto_archivos").update({ visible_cliente: false }).eq("task_id", item.id);
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
  // Sin la 181 no existe `task_id`: el renglón entra igual en la bitácora del
  // proyecto, solo que sin decir de qué tarea es.
  if (error && /column|schema cache/i.test(error.message) && fila.task_id !== undefined) {
    const { task_id: deCual, ...sinTarea } = fila;
    ({ error } = await supabase.from("lead_movimientos").insert(sinTarea));
    if (error && /column|schema cache/i.test(error.message)) {
      const { automatico: auto, ...resto } = sinTarea;
      ({ error } = await supabase.from("lead_movimientos").insert(resto));
    }
  } else if (error && /column|schema cache/i.test(error.message)) {
    const { automatico: auto, ...resto } = fila;
    ({ error } = await supabase.from("lead_movimientos").insert(resto));
  }
  return error ? error.message : null;
}

/** Lo que se corrigió, a la bitácora: quién la movió y de qué a qué. */
export const anotarCorreccion = (lead, detalle, quien, tareaId = null) =>
  anotar(lead.id, { detalle, quien, ...(tareaId ? { extra: { task_id: tareaId } } : {}) });

/**
 * El historial de las tareas del proyecto, de una sola pasada.
 *
 * Son dos cosas que se leen juntas en cada punto del checklist: lo que alguien
 * anotó en la tarea (sus comentarios, los mismos de Tareas) y lo que la
 * bitácora del proyecto dice de ella (migración 181).
 *
 * Cada anotación trae si la lee el cliente (`visible_cliente`, migración
 * 185). Sin esa columna se leen igual, todas internas, y `sinNotasAlCliente`
 * lo dice para que la pantalla no ofrezca lo que no se puede guardar.
 *
 * @param ids  las tareas del proyecto
 * @returns { comentarios, movimientos } por id de tarea, y `sinEnlace` si
 *          falta la 181: ahí se ve lo anotado, y lo automático todavía no
 */
export async function cargarHistorial(leadId, ids = []) {
  if (!leadId || !ids.length) return { comentarios: {}, movimientos: {}, sinEnlace: false, sinNotasAlCliente: false };
  const [anotado, { data: movs, error: eMovs }] = await Promise.all([
    lasNotas(q => q.in("task_id", ids)),
    supabase.from("lead_movimientos").select("id,task_id,detalle,autor_nombre,automatico,created_at")
      .eq("lead_id", leadId).not("task_id", "is", null).order("created_at"),
  ]);
  return {
    comentarios: porTarea(anotado.notas),
    movimientos: porTarea(eMovs ? [] : movs || []),
    sinEnlace: !!eMovs && falta(eMovs),
    sinNotasAlCliente: anotado.sinMarca,
  };
}

// Lo anotado, con la marca de si lo lee el cliente; y sin ella si la columna
// todavía no está.
const NOTA = "id,task_id,texto,autor_id,autor_nombre,created_at";
async function lasNotas(filtro) {
  let { data, error } = await filtro(supabase.from("tarea_comentarios").select(`${NOTA},visible_cliente`)).order("created_at");
  const sinMarca = !!error && falta(error);
  if (sinMarca) ({ data, error } = await filtro(supabase.from("tarea_comentarios").select(NOTA)).order("created_at"));
  return { notas: error ? [] : data || [], sinMarca };
}

/**
 * El historial de una sola tarea: para la ventana de la tarea y la bandeja,
 * que no tienen el proyecto entero a mano. Una tarea sin proyecto no tiene
 * bitácora: su historial es lo anotado, más cuándo entró y cuándo se hizo.
 *
 * @returns { comentarios, movimientos, sinNotasAlCliente }
 */
export async function cargarHistorialDeTarea(taskId) {
  if (!taskId) return { comentarios: [], movimientos: [], sinNotasAlCliente: false };
  const [anotado, { data: movs, error: eMovs }] = await Promise.all([
    lasNotas(q => q.eq("task_id", taskId)),
    supabase.from("lead_movimientos").select("id,task_id,detalle,autor_nombre,automatico,created_at").eq("task_id", taskId).order("created_at"),
  ]);
  return { comentarios: anotado.notas, movimientos: eMovs ? [] : movs || [], sinNotasAlCliente: anotado.sinMarca };
}

/**
 * Anotar qué pasó con un punto: «llamé, quedan en confirmar la reunión».
 *
 * Es un comentario de la tarea —el mismo hilo que se ve en Tareas—, con fecha
 * y con nombre. Les llega por correo a los involucrados, menos a quien lo
 * escribe; si el correo falla, lo anotado ya quedó.
 *
 * LA ANOTACIÓN PUEDE SER LA ACTUALIZACIÓN QUE LEE EL CLIENTE. Hernán,
 * 17/11/2026: «cliente debe ver las actualizaciones de cada uno». Con
 * `alCliente` queda marcada (migración 185) y sale en su enlace debajo del
 * punto, con su fecha. Sin marcar es interna.
 *
 * @param alCliente  que la lea el cliente en su enlace
 * @returns null o el error
 */
export async function anotarEnLaTarea(item, texto, quien, { alCliente = false } = {}) {
  const limpio = String(texto || "").trim();
  if (!limpio) return "Escribí qué pasó.";
  const fila = { task_id: item.id, texto: limpio, autor_id: quien?.id ?? null, autor_nombre: quien?.name ?? null };
  let { error } = await supabase.from("tarea_comentarios").insert(alCliente ? { ...fila, visible_cliente: true } : fila);
  // Sin la 185 se anota igual, interna, y se dice que el cliente no la lee.
  let sinMarca = false;
  if (error && alCliente && falta(error)) {
    sinMarca = true;
    ({ error } = await supabase.from("tarea_comentarios").insert(fila));
  }
  if (error) return "No se pudo anotar: " + error.message;
  fetch("/api/aviso?de=comentario", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId: item.id, texto: limpio, autorId: quien?.id ?? null }),
  }).catch(() => {});
  return sinMarca ? `Quedó anotado, pero el cliente no lo lee: ${SIN_185}` : null;
}

/**
 * Que el cliente lea una anotación que ya estaba escrita, o deje de leerla.
 *
 * Queda dicho en la historia del proyecto —qué se le mostró y quién lo
 * decidió—, sin sumar un renglón al historial del punto: ahí la anotación
 * misma dice si la lee.
 *
 * @param nota   { id, texto }
 * @param punto  el punto del checklist, como lo ve la lista, o la tarea
 * @returns null o el error
 */
export async function mostrarNotaAlCliente(nota, ver, { punto = null, quien = null } = {}) {
  if (!nota?.id) return "No se encontró esa anotación.";
  const { error } = await supabase.from("tarea_comentarios").update({ visible_cliente: !!ver }).eq("id", nota.id);
  if (error) return falta(error) ? SIN_185 : error.message;
  const leadId = punto?.lead_id;
  if (leadId) {
    const corto = String(nota.texto || "").trim().replace(/\s+/g, " ");
    await anotar(leadId, {
      detalle: `${ver ? "Le mostró al cliente" : "Dejó de mostrarle al cliente"} una anotación de "${punto.texto || punto.title || ""}"`
        + (corto ? `: «${corto.length > 90 ? `${corto.slice(0, 90)}…` : corto}»` : "") + ".",
      quien,
    });
  }
  return null;
}

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

// ── LAS FOTOS Y LOS ARCHIVOS QUE VE EL CLIENTE ─────────────────────────────
//
// Del proyecto y de cada punto del checklist (migración 184). Las reglas —qué
// entra, dónde se guarda, cómo se reparten— están en archivosDelCliente.js.

export const SIN_184 = "Falta correr la migración 184 en Supabase para mostrarle fotos y archivos al cliente.";

/**
 * Lo que el cliente ve de este proyecto, ya repartido, con el enlace de cada
 * foto para la miniatura.
 *
 * @returns { delProyecto, porTarea, enlaces: { [id]: url }, sinMigracion }
 */
export async function cargarArchivosDelCliente(leadId) {
  const { data, error } = await supabase.from("proyecto_archivos")
    .select("*").eq("lead_id", leadId).eq("visible_cliente", true).order("created_at");
  if (error) return { delProyecto: [], porTarea: {}, enlaces: {}, sinMigracion: falta(error) };
  const fotos = (data || []).filter(esFoto);
  const urls = fotos.length ? await enlacesArchivos(fotos.map(a => a.storage_path)) : [];
  return {
    ...repartir(data || []),
    enlaces: Object.fromEntries(fotos.map((a, i) => [a.id, urls[i] || null])),
    sinMigracion: false,
  };
}

/**
 * Subir fotos o archivos para que los vea el cliente.
 *
 * De a uno: si uno no entra o falla, los demás siguen, y se dice cuál no.
 * Queda escrito en la historia del proyecto qué se le mostró.
 *
 * @param punto  el punto del checklist (como lo ve la lista), o null si es del proyecto
 * @returns { subidos, errores: [texto] }
 */
export async function subirParaElCliente({ lead, punto = null, archivos = [], quien = null }) {
  const errores = [];
  const subidos = [];
  const ahora = Date.now();
  let n = 0;
  for (const archivo of archivos) {
    const no = porQueNoEntra(archivo);
    if (no) { errores.push(no); continue; }
    const ruta = rutaParaSubir(lead.id, archivo.name, ahora, n++);
    const r = await subirArchivo(ruta, archivo);
    if (r.error) { errores.push(`«${archivo.name}» no se pudo subir: ${r.error.message || r.error}`); continue; }
    const { error } = await supabase.from("proyecto_archivos").insert(filaAlSubir({ leadId: lead.id, taskId: punto?.id ?? null, archivo, ruta, quien }));
    if (error) {
      // No quedó anotado: el archivo suelto en el depósito no lo vería nadie.
      await supabase.storage.from("task-files").remove([ruta]);
      errores.push(falta(error) ? SIN_184 : `«${archivo.name}» no se pudo guardar: ${error.message}`);
      if (falta(error)) break;
      continue;
    }
    subidos.push(archivo.name);
  }
  if (subidos.length) {
    await anotar(lead.id, {
      detalle: `Le mostró al cliente ${subidos.length === 1 ? `«${subidos[0]}»` : `${subidos.length} archivos (${subidos.join(", ")})`}`
        + (punto ? ` en "${punto.texto}"` : " del proyecto") + ".",
      quien, ...(punto ? { extra: { task_id: punto.id } } : {}),
    });
  }
  return { subidos: subidos.length, errores };
}

/**
 * ¿Este archivo es parte de una aprobación que el cliente ya contestó?
 * Entonces es sustento: se puede dejar de mostrar, pero no se borra.
 */
export async function esDeUnaAprobacion(a) {
  const { data, error } = await supabase.from("aprobaciones_cliente").select("id")
    .eq("lead_id", a.lead_id).not("respuesta", "is", null).contains("archivos", [{ id: a.id }]).limit(1);
  return !error && (data || []).length > 0;
}

/**
 * Quitar algo que el cliente veía: se borra el archivo y su anotación.
 *
 * LO QUE EL CLIENTE YA APROBÓ NO SE BORRA. Si el archivo es parte de una
 * aprobación contestada, deja de verse en el punto y en su enlace, pero queda
 * guardado: el registro tiene que poder abrir lo que se aprobó.
 *
 * @returns null o el error; "guardado" si solo dejó de mostrarse
 */
export async function quitarArchivoDelCliente(a) {
  if (await esDeUnaAprobacion(a)) {
    const { error } = await supabase.from("proyecto_archivos").update({ visible_cliente: false }).eq("id", a.id);
    return error ? error.message : "guardado";
  }
  const { error } = await supabase.from("proyecto_archivos").delete().eq("id", a.id);
  if (error) return error.message;
  await supabase.storage.from("task-files").remove([a.storage_path]);
  return null;
}

/**
 * Mostrarle al cliente un archivo del proyecto que ya estaba cargado, o dejar
 * de mostrárselo. No lo borra: sigue en los archivos del proyecto.
 * @returns null o el error
 */
export async function mostrarArchivoAlCliente(a, ver) {
  const { error } = await supabase.from("proyecto_archivos").update({ visible_cliente: !!ver }).eq("id", a.id);
  return error ? (falta(error) ? SIN_184 : error.message) : null;
}
