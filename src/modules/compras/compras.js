import { supabase } from "../../lib/supabase";
import { sincronizarCapitulos } from "../controlObra/sincronizarCapitulos";

// El flujo de una compra, de punta a punta.
//
// Cinco estados y una regla: cada paso deja escrito quién lo dio y cuándo, y le
// deja una tarea al que sigue. La tarea es el aviso —aparece en su tablero, le
// llega el correo y entra al resumen de la mañana—; la solicitud es el registro.
//
//   borrador → pendiente_aprobacion → (requiere_info ↺) → aprobada → comprada → recibida
//
// Quien pide no compra y quien compra no aprueba: son tres personas distintas y
// el sistema lo sostiene, que es lo que hace que sirva de respaldo después.

export const ESTADOS = {
  borrador:             { label: "Borrador",        color: "#9CA3AF", quien: "quien la pidió" },
  pendiente_aprobacion: { label: "Esperando visto", color: "#B45309", quien: "el gerente" },
  requiere_info:        { label: "Devuelta",        color: "#B91C1C", quien: "quien la pidió" },
  aprobada:             { label: "Aprobada",        color: "#15803D", quien: "compras" },
  comprada:             { label: "Comprada",        color: "#0F3D3E", quien: "quien la pidió" },
  recibida:             { label: "Recibida",        color: "#6B7280", quien: null },
  anulada:              { label: "Anulada",         color: "#9CA3AF", quien: null },
};

export const ABIERTAS = ["pendiente_aprobacion", "requiere_info", "aprobada", "comprada"];

// Un pedido puede no ser de ninguna obra: papel para la oficina, el
// mantenimiento de la camioneta, una herramienta del taller. En la base eso es
// `lead_id` nulo; en el selector hace falta un valor que no sea "" —que ya
// significa "no elegiste nada"— para poder distinguir las dos cosas.
export const SIN_PROYECTO = "oficina";
export const leadDe = v => (v === SIN_PROYECTO || v === "" || v == null ? null : Number(v));

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

/**
 * ¿Esta persona ve esta compra?
 *
 * La misma regla que todo FOREMAN, dicha para una compra: es tuya, o entrás a
 * su proyecto. Antes no había regla —la pantalla traía la tabla entera— y un
 * residente de una obra veía, en "Abiertas" y en "Todas", lo que se estaba
 * comprando en las otras: montos, proveedores y a quién se le aprobó qué.
 *
 *   mia          · la pediste, la aprobaste, la compraste o la recibiste
 *   nivel        · tu nivel en el proyecto de la compra (null si no entrás)
 *   todasLasObras· gestiona compras o aprueba: necesita la lista completa para
 *                  hacer su trabajo, que es justamente mirar todas
 *
 * Una compra sin proyecto no la esconde de nadie que ya la tocó, pero tampoco
 * se la muestra a quien no tiene nada que ver con ella.
 */
export function veLaCompra({ compra, usuarioId, nivel = null, todasLasObras = false }) {
  const mia = compra?.solicitante_id === usuarioId
    || compra?.aprobador_id === usuarioId
    || compra?.comprado_por === usuarioId
    || compra?.recibido_por === usuarioId;
  return mia || todasLasObras || !!nivel;
}

/** @returns { solicitudes, sinTablas } */
export async function cargarSolicitudes(leadId = null) {
  let q = supabase.from("compras_solicitudes").select("*").order("created_at", { ascending: false });
  if (leadId) q = q.eq("lead_id", leadId);
  const { data, error } = await q;
  if (error) return { solicitudes: [], sinTablas: falta(error) };
  return { solicitudes: data || [], sinTablas: false };
}

export async function historialDe(solicitudId) {
  const { data } = await supabase.from("compras_historial")
    .select("*").eq("solicitud_id", solicitudId).order("created_at");
  return data || [];
}

export async function adjuntosDe(solicitudId) {
  const { data } = await supabase.from("compras_adjuntos")
    .select("*").eq("solicitud_id", solicitudId).order("created_at");
  return data || [];
}

export async function crearSolicitud(datos, quien) {
  // Contra qué parte del presupuesto se pide, y cuánto se cree que va a ser.
  // Eso es lo que convierte una lista de pedidos en un control: sin capítulo y
  // sin monto no hay forma de saber cuánto más quieren gastar de un capítulo
  // que ya va al 80%.
  const fila = {
    lead_id: leadDe(datos.lead_id), obra_id: datos.obra_id || null,
    destino: datos.destino?.trim() || null,
    descripcion: datos.descripcion.trim(), justificacion: datos.justificacion?.trim() || null,
    necesita_para: datos.necesita_para || null, urgente: !!datos.urgente,
    capitulo: datos.capitulo || null,
    obra_actividad_id: datos.obra_actividad_id ? Number(datos.obra_actividad_id) : null,
    obra_rubro_id: datos.obra_rubro_id ? Number(datos.obra_rubro_id) : null,
    monto_estimado: datos.monto_estimado ? Number(datos.monto_estimado) : null,
    estado: "borrador", solicitante_id: quien?.id ?? null, solicitante_nombre: quien?.name || null,
  };
  let { data, error } = await supabase.from("compras_solicitudes").insert(fila).select().single();
  // Sin la 056 no existen esas tres columnas: la solicitud se crea igual.
  if (error && /column|schema cache/i.test(error.message)) {
    const { capitulo, obra_actividad_id, obra_rubro_id, monto_estimado, destino, ...resto } = fila;
    ({ data, error } = await supabase.from("compras_solicitudes").insert(resto).select().single());
  }
  if (error) return { error: falta(error) ? "Falta correr la migración 048." : error.message };
  await anotar(data.id, null, "borrador", quien, null);
  return { solicitud: data };
}

export async function guardarSolicitud(id, datos) {
  const campos = {
    descripcion: datos.descripcion.trim(), justificacion: datos.justificacion?.trim() || null,
    necesita_para: datos.necesita_para || null, urgente: !!datos.urgente,
    capitulo: datos.capitulo || null,
    obra_actividad_id: datos.obra_actividad_id ? Number(datos.obra_actividad_id) : null,
    obra_rubro_id: datos.obra_rubro_id ? Number(datos.obra_rubro_id) : null,
    monto_estimado: datos.monto_estimado ? Number(datos.monto_estimado) : null,
    destino: datos.destino?.trim() || null,
  };
  let { error } = await supabase.from("compras_solicitudes").update(campos).eq("id", id);
  if (error && /column|schema cache/i.test(error.message)) {
    const { capitulo, obra_actividad_id, obra_rubro_id, monto_estimado, destino, ...resto } = campos;
    ({ error } = await supabase.from("compras_solicitudes").update(resto).eq("id", id));
  }
  return error ? error.message : null;
}

/**
 * Los rubros de la obra de un proyecto, para poder apuntar la solicitud.
 *
 * Se piden por proyecto y no por obra porque quien pide está pensando en el
 * proyecto; la obra la encuentra el código.
 */
export async function rubrosDelProyecto(leadId) {
  if (!leadId) return { obra: null, rubros: [] };
  const { data: obras } = await supabase.from("obras").select("id,nombre,presupuesto_id").eq("lead_id", leadId).limit(1);
  const obra = obras?.[0];
  if (!obra) return { obra: null, rubros: [] };
  // Antes de ofrecer los capítulos, que sean los de hoy: si alguien reorganizó
  // el presupuesto después de activar la obra, acá salían los viejos y no
  // había desde dónde arreglarlo. No toca un solo monto.
  await sincronizarCapitulos(obra);
  // Las agrupaciones son contra qué se pide: "obra civil", "instalaciones".
  // El capítulo —cómo se contrató— se deduce del rubro cuando hay uno.
  const [{ data }, { data: acts }] = await Promise.all([
    supabase.from("obra_rubros")
      .select("id,numero,capitulo,descripcion,total_base,actividad_id").eq("obra_id", obra.id).order("orden"),
    supabase.from("obra_actividades").select("id,nombre,codigo,orden").eq("obra_id", obra.id).order("orden"),
  ]);
  return { obra, rubros: data || [], actividades: acts || [] };
}

/** Cada paso queda escrito: sin esto el flujo es una conversación de WhatsApp. */
export async function anotar(solicitudId, antes, despues, quien, comentario) {
  const { error } = await supabase.from("compras_historial").insert({
    solicitud_id: solicitudId, estado_anterior: antes, estado_nuevo: despues,
    usuario_id: quien?.id ?? null, usuario_nombre: quien?.name || null,
    comentario: comentario || null,
  });
  return error ? error.message : null;
}

/**
 * Mover la solicitud al siguiente paso y avisarle al que sigue.
 *
 * El aviso es una tarea de FOREMAN: así aparece en el tablero de esa persona,
 * le llega el correo y entra a su resumen de la mañana, sin inventar un segundo
 * sistema de alertas que después nadie mira.
 */
export async function moverA(solicitud, estado, { quien, comentario, paraQuien, titulo, extra = {} }) {
  const campos = { estado, ...extra };
  // La fecha del PRIMER pedido de visto: reenviar una devuelta no reinicia la
  // cuenta de cuánto tardó en aprobarse.
  if (estado === "pendiente_aprobacion" && !solicitud.enviado_at) campos.enviado_at = new Date().toISOString();
  if (estado === "aprobada") { campos.aprobador_id = quien?.id ?? null; campos.aprobador_nombre = quien?.name || null; campos.aprobado_at = new Date().toISOString(); }
  if (estado === "comprada") { campos.comprado_por = quien?.id ?? null; campos.comprado_nombre = quien?.name || null; campos.comprado_at = new Date().toISOString(); }
  if (estado === "recibida") { campos.recibido_por = quien?.id ?? null; campos.recibido_nombre = quien?.name || null; campos.recibido_at = new Date().toISOString(); }

  // La tarea anterior ya se cumplió: se cierra para que no quede dando vueltas
  // en el tablero de alguien que ya hizo lo suyo.
  if (solicitud.tarea_id) {
    await supabase.from("tasks").update({ status: "listo" }).eq("id", solicitud.tarea_id);
  }

  let tarea = null;
  if (paraQuien) {
    const { data } = await supabase.from("tasks").insert({
      title: titulo, lead_id: solicitud.lead_id, assignee_id: paraQuien,
      due_date: solicitud.necesita_para || null,
      priority: solicitud.urgente ? "urgente" : "media",
      status: "en-progreso", type: "Gestión",
      notes: `Gestión de compras · ${solicitud.descripcion}`,
      created_by: quien?.id ?? null,
      ...(estado === "pendiente_aprobacion" ? { es_aprobacion: true, aprobacion_estado: "pendiente" } : {}),
    }).select().single();
    tarea = data;
  }
  campos.tarea_id = tarea?.id ?? null;

  let { error } = await supabase.from("compras_solicitudes").update(campos).eq("id", solicitud.id);
  // Sin la 065 no existe `enviado_at`: la solicitud avanza igual.
  if (error && /column|schema cache/i.test(error.message)) {
    const { enviado_at, ...resto } = campos;
    ({ error } = await supabase.from("compras_solicitudes").update(resto).eq("id", solicitud.id));
  }
  if (error) return { error: error.message };
  await anotar(solicitud.id, solicitud.estado, estado, quien, comentario);

  // Y la bitácora del proyecto se entera, que es donde se lee la historia. Un
  // gasto de oficina no cuelga de ninguna, y su historia es la de abajo.
  if (solicitud.lead_id) await supabase.from("lead_movimientos").insert({
    lead_id: solicitud.lead_id, tipo: "compra", automatico: true,
    detalle: `${ESTADOS[estado]?.label || estado}: ${solicitud.descripcion}${comentario ? ` — ${comentario}` : ""}`,
    autor_id: quien?.id ?? null, autor_nombre: quien?.name || null,
  }).select();

  // El correo lo manda el servidor, igual que cualquier tarea encargada.
  if (tarea?.id) {
    fetch("/api/aviso?de=tarea", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tareaId: tarea.id }),
    }).catch(() => {});
  }
  return { ok: true };
}

// ── Los papeles de la solicitud ──────────────────────────────────────────
//
// Dos cosas distintas con el mismo mecanismo: los ANEXOS —la foto de lo que se
// rompió, el plano, la especificación— y las PROFORMAS, que además traen de
// quién son y cuánto cobran, porque son para comparar.

export async function subirAdjunto(solicitud, archivo, { tipo = "respaldo", proveedor, monto, nota, quien }) {
  const limpio = archivo.name.replace(/[^\w.\-]/g, "_").slice(-60);
  const ruta = `compra-${solicitud.id}/${Date.now()}-${limpio}`;
  const { error } = await supabase.storage.from("task-files").upload(ruta, archivo, { upsert: false });
  if (error) return { error: error.message };

  const fila = {
    solicitud_id: solicitud.id, tipo, storage_path: ruta, nombre: archivo.name,
    subido_por: quien?.id ?? null,
    proveedor: proveedor?.trim() || null,
    monto: monto ? Number(monto) : null,
    nota: nota?.trim() || null,
    // Se copia el rubro de la solicitud: así la colección de proformas se lee
    // por rubro sin tener que entrar solicitud por solicitud.
    obra_rubro_id: solicitud.obra_rubro_id || null,
    capitulo: solicitud.capitulo || null,
  };
  let { data, error: e2 } = await supabase.from("compras_adjuntos").insert(fila).select().single();
  // Sin la 059 no están las columnas nuevas: el archivo se guarda igual.
  if (e2 && /column|schema cache/i.test(e2.message)) {
    const { proveedor: p, monto: m, nota: nt, obra_rubro_id: r, capitulo: c, ...resto } = fila;
    ({ data, error: e2 } = await supabase.from("compras_adjuntos").insert(resto).select().single());
  }
  return e2 ? { error: e2.message } : { adjunto: data };
}

export async function borrarAdjunto(adjunto) {
  await supabase.storage.from("task-files").remove([adjunto.storage_path]);
  const { error } = await supabase.from("compras_adjuntos").delete().eq("id", adjunto.id);
  return error ? error.message : null;
}

/** Enlaces temporales para abrirlos: el depósito es privado. */
export async function enlacesDeAdjuntos(adjuntos = []) {
  if (!adjuntos.length) return {};
  const { data } = await supabase.storage.from("task-files")
    .createSignedUrls(adjuntos.map(a => a.storage_path), 3600);
  const mapa = {};
  (data || []).forEach((x, i) => { if (x?.signedUrl) mapa[adjuntos[i].id] = x.signedUrl; });
  return mapa;
}

/**
 * Elegir con qué proforma se compra.
 *
 * El monto y el proveedor de la solicitud pasan a ser los de esa proforma: a
 * partir de acá, "cuánto cuesta esto" tiene una sola respuesta y un papel
 * detrás. Queda escrito en el historial, que es lo que contesta seis meses
 * después por qué se le compró a ese y no al más barato.
 */
export async function elegirProforma(solicitud, proforma, quien, comentario) {
  const campos = { proforma_id: proforma.id, proveedor: proforma.proveedor || solicitud.proveedor || null };
  if (proforma.monto) campos.monto = Number(proforma.monto);
  let { error } = await supabase.from("compras_solicitudes").update(campos).eq("id", solicitud.id);
  if (error && /column|schema cache/i.test(error.message)) {
    const { proforma_id, ...resto } = campos;
    ({ error } = await supabase.from("compras_solicitudes").update(resto).eq("id", solicitud.id));
  }
  if (error) return error.message;
  await anotar(solicitud.id, solicitud.estado, solicitud.estado, quien,
    `Proforma elegida: ${proforma.proveedor || proforma.nombre}${proforma.monto ? ` · $${Number(proforma.monto).toFixed(2)}` : ""}${comentario ? ` · ${comentario}` : ""}`);
  return null;
}

/**
 * El pedido estaba en el proyecto equivocado.
 *
 * Pasa: se pide desde el teléfono, el selector venía con otro proyecto cargado
 * y nadie lo mira hasta que la compra aparece en el control de la obra que no
 * es. Corregirlo tiene que poder hacerse, y solo gerencia o compras pueden —si
 * lo pudiera mover quien lo pidió, el pedido desaparecería de su propia vista
 * y de la de su gerente sin que ninguno de los dos se entere.
 *
 * El capítulo y el rubro se borran al mover: eran de la obra anterior, y
 * dejarlos apuntando ahí carga plata comprometida contra un rubro de otro
 * proyecto. Se vuelven a elegir, que es un clic y es honesto.
 */
export async function moverDeProyecto(solicitud, leadId, quien, nombreNuevo) {
  const campos = { lead_id: leadDe(leadId), capitulo: null, obra_actividad_id: null, obra_rubro_id: null, obra_id: null };
  let { error } = await supabase.from("compras_solicitudes").update(campos).eq("id", solicitud.id);
  if (error && /column|schema cache/i.test(error.message)) {
    const { capitulo, obra_actividad_id, obra_rubro_id, ...resto } = campos;
    ({ error } = await supabase.from("compras_solicitudes").update(resto).eq("id", solicitud.id));
  }
  if (error) return error.message;

  const donde = nombreNuevo || (campos.lead_id ? "otro proyecto" : "gasto de oficina");
  const detalle = `Pedido movido a ${donde}: ${solicitud.descripcion}`;
  await anotar(solicitud.id, solicitud.estado, solicitud.estado, quien,
    `Movido a ${donde} — hay que volver a elegir la agrupación`);
  // Las dos bitácoras se enteran: de dónde salió y a dónde entró. Un gasto de
  // oficina no tiene bitácora, así que esa punta simplemente no se escribe.
  const movimientos = [];
  if (solicitud.lead_id) movimientos.push({ lead_id: solicitud.lead_id, tipo: "compra", automatico: true, detalle,
    autor_id: quien?.id ?? null, autor_nombre: quien?.name || null });
  if (campos.lead_id) movimientos.push({ lead_id: campos.lead_id, tipo: "compra", automatico: true,
    detalle: `Pedido recibido de otro proyecto: ${solicitud.descripcion}`,
    autor_id: quien?.id ?? null, autor_nombre: quien?.name || null });
  if (movimientos.length) await supabase.from("lead_movimientos").insert(movimientos).select();
  return null;
}

/**
 * Se pagó.
 *
 * No mueve el estado y es a propósito: el estado contesta a quién le toca
 * ahora —comprar, recibir—, y el pago no se mete en esa fila. Se paga por
 * adelantado, contra entrega o a treinta días, y en los tres casos la compra
 * sigue su camino. Es una fecha al costado, no un paso más.
 *
 * El monto es opcional: muchas veces se paga exactamente lo de la proforma y
 * repetirlo es trabajo de más. En blanco, vale el de la compra.
 */
export async function registrarPago(solicitud, { monto, quien, comentario }) {
  const campos = {
    pagado_at: new Date().toISOString(),
    pagado_por: quien?.id ?? null,
    pagado_nombre: quien?.name || null,
    pagado_monto: monto ? Number(monto) : (solicitud.monto ?? null),
  };
  const { error } = await supabase.from("compras_solicitudes").update(campos).eq("id", solicitud.id);
  if (error) return /column|schema cache/i.test(error.message) ? "Falta correr la migración 065." : error.message;

  const cuanto = campos.pagado_monto ? ` · $${Number(campos.pagado_monto).toFixed(2)}` : "";
  await anotar(solicitud.id, solicitud.estado, solicitud.estado, quien, `Pagado${cuanto}${comentario ? ` · ${comentario}` : ""}`);
  if (solicitud.lead_id) await supabase.from("lead_movimientos").insert({
    lead_id: solicitud.lead_id, tipo: "compra", automatico: true,
    detalle: `Pagado${cuanto}: ${solicitud.descripcion}`,
    autor_id: quien?.id ?? null, autor_nombre: quien?.name || null,
  }).select();
  return null;
}

/** Se pagó por error, o se deshizo el pago. */
export async function deshacerPago(solicitud, quien) {
  const { error } = await supabase.from("compras_solicitudes")
    .update({ pagado_at: null, pagado_por: null, pagado_nombre: null, pagado_monto: null })
    .eq("id", solicitud.id);
  if (error) return error.message;
  await anotar(solicitud.id, solicitud.estado, solicitud.estado, quien, "Se deshizo el pago");
  return null;
}

/**
 * Todas las proformas de un proyecto, agrupadas por rubro del presupuesto.
 *
 * Es el historial de precios que la oficina ya tiene y no puede consultar:
 * "¿a cómo nos han cotizado el hormigón este año?" hoy se contesta buscando en
 * WhatsApp.
 */
export async function proformasPorRubro(leadId) {
  const { data: solicitudes } = await supabase.from("compras_solicitudes")
    .select("id,descripcion,capitulo,obra_rubro_id,estado,proforma_id").eq("lead_id", leadId);
  const ids = (solicitudes || []).map(s => s.id);
  if (!ids.length) return { grupos: [], solicitudes: [] };

  const { data: adjuntos } = await supabase.from("compras_adjuntos")
    .select("*").in("solicitud_id", ids).eq("tipo", "cotizacion").order("created_at", { ascending: false });

  const porSolicitud = new Map((solicitudes || []).map(s => [s.id, s]));
  const grupos = new Map();
  (adjuntos || []).forEach(a => {
    const s = porSolicitud.get(a.solicitud_id);
    const clave = a.capitulo || s?.capitulo || "SIN CAPÍTULO";
    if (!grupos.has(clave)) grupos.set(clave, { capitulo: clave, proformas: [] });
    grupos.get(clave).proformas.push({ ...a, solicitud: s, elegida: s?.proforma_id === a.id });
  });
  return { grupos: [...grupos.values()].sort((a, b) => a.capitulo.localeCompare(b.capitulo)), solicitudes: solicitudes || [] };
}
