import { supabase } from "../../lib/supabase";

// Las órdenes de cambio: lo que se pactó después.
//
// El presupuesto aprobado es un contrato. Cuando el cliente pide un adicional
// —o se saca algo de la obra— la tentación es corregir la línea base a mano, y
// ahí se pierde para siempre la historia de por qué la obra costó lo que
// costó: al final nadie sabe si se gastó de más o si se pidió de más.
//
// El documento es el que la oficina ya usa y firma, con sus cuatro capítulos:
//
//   Encabezado    · N°, fecha, tipo, lugar, título, emitido por, proyecto,
//                   cliente.
//   CAPÍTULO I    · Argumentos de la solicitud y soportes gráficos.
//   CAPÍTULO II   · Propuesta: ADICIONES y REDUCCIONES con sus subtotales, y
//                   el total. El signo lo pone el sistema.
//   CAPÍTULO III  · Impacto en cronograma.
//   CAPÍTULO IV   · Revisión y aprobación: contratista, fiscalización y
//                   contratante, cada uno con fecha y comentarios.
//
// Nada de esto toca la línea base. Al aprobarse, su resultado entra al control
// como adicionales, en su propia columna.

/** El código que se cita en las actas: OC-01, y a veces OC-08A. */
// El código y el nombre de archivo viven en su propio módulo, probado: acá
// adentro no se los podría probar sin levantar Supabase.
export { codigoDe, nombreDelArchivo } from "./nombreOrden";
import { codigoDe } from "./nombreOrden";

/** Qué pasó con ella en obra, que no es lo mismo que en qué paso va el papel. */
export const EJECUCION = {
  ejecutado:    { label: "Ejecutado", color: "success" },
  no_ejecutado: { label: "No ejecutado", color: "muted" },
  por_definir:  { label: "Por definir", color: "warning" },
};

export const ESTADOS_ORDEN = {
  borrador:  { label: "Borrador",  color: "muted",   pista: "Todavía se está armando" },
  enviada:   { label: "Enviada",   color: "warning", pista: "Mandada para revisión y aprobación" },
  aprobada:  { label: "Aprobada",  color: "success", pista: "Aceptada: ya cuenta en el control" },
  rechazada: { label: "Rechazada", color: "danger",  pista: "No se hace" },
};

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

export async function cargarOrdenes(obraId) {
  const { data, error } = await supabase.from("ordenes_cambio")
    .select("*").eq("obra_id", obraId).order("numero", { ascending: false });
  if (error) return { ordenes: [], lineas: {}, sinTablas: falta(error) };

  const ids = (data || []).map(o => o.id);
  const lineas = {}, fotos = {};
  if (ids.length) {
    const [{ data: ls }, { data: fs }] = await Promise.all([
      supabase.from("orden_cambio_lineas").select("*").in("orden_id", ids).order("orden"),
      supabase.from("orden_cambio_fotos").select("*").in("orden_id", ids).order("orden"),
    ]);
    (ls || []).forEach(l => { (lineas[l.orden_id] = lineas[l.orden_id] || []).push(l); });
    (fs || []).forEach(f => { (fotos[f.orden_id] = fotos[f.orden_id] || []).push(f); });
  }
  return { ordenes: data || [], lineas, fotos, sinTablas: false };
}

/** La siguiente, numerada sola: dos con el mismo número no se pueden citar. */
export async function crearOrden(obraId, datos, quien) {
  const { data: ultimas } = await supabase.from("ordenes_cambio")
    .select("numero").eq("obra_id", obraId).order("numero", { ascending: false }).limit(1);
  const numero = (ultimas?.[0]?.numero || 0) + 1;

  const { data, error } = await supabase.from("ordenes_cambio").insert({
    obra_id: obraId, numero,
    codigo: `OC-${String(numero).padStart(2, "0")}`,
    titulo: datos.titulo?.trim() || `Orden de cambio N°${numero}`,
    tipo: datos.tipo?.trim() || null,
    lugar: datos.lugar?.trim() || "Quito",
    fecha: datos.fecha || new Date().toISOString().split("T")[0],
    emitido_por: datos.emitido_por?.trim() || quien?.name || null,
    justificacion: datos.justificacion?.trim() || null,
    contratista_nombre: datos.contratista_nombre?.trim() || "HCARQ SA",
    created_by: quien?.id ?? null, created_nombre: quien?.name || null,
  }).select().single();
  if (error) return { error: falta(error) ? "Falta correr la migración 056." : error.message };
  return { orden: data };
}

/**
 * El visto del Director, antes de que la orden salga al cliente.
 *
 * Quien arma la orden suele ser el residente, y lo que viaja es un precio: una
 * vez que el cliente lo vio, bajarlo es una negociación y subirlo es
 * imposible. Ese control existe en la oficina pero vive en un WhatsApp —"¿la
 * mando?" / "dale"— que seis meses después no encuentra nadie.
 *
 * No mueve el estado: `estado` cuenta dónde está la orden frente al CLIENTE, y
 * meter ahí un paso interno mezcla dos conversaciones en una sola columna.
 */
export async function pedirVisto(ordenId) {
  const { error } = await supabase.from("ordenes_cambio")
    .update({ visto_pedido_at: new Date().toISOString() }).eq("id", ordenId);
  return error ? (falta(error) ? "Falta correr la migración 078." : error.message) : null;
}

export async function darVisto(orden, quien, comentario) {
  const { error } = await supabase.from("ordenes_cambio").update({
    visto_at: new Date().toISOString(),
    visto_por: quien?.id ?? null, visto_nombre: quien?.name || null,
    visto_comentario: comentario?.trim() || null,
  }).eq("id", orden.id);
  return error ? (falta(error) ? "Falta correr la migración 078." : error.message) : null;
}

export async function quitarVisto(ordenId) {
  const { error } = await supabase.from("ordenes_cambio")
    .update({ visto_at: null, visto_por: null, visto_nombre: null, visto_comentario: null }).eq("id", ordenId);
  return error ? error.message : null;
}

export async function guardarOrden(id, campos) {
  const { error } = await supabase.from("ordenes_cambio")
    .update({ ...campos, updated_at: new Date().toISOString() }).eq("id", id);
  return error ? error.message : null;
}

/**
 * Borrarla, con todo lo que dejó puesto.
 *
 * Una orden aprobada metió rubros en el control de obra. Si se borra la orden
 * y esos rubros se quedan, aparecen en el presupuesto sin que exista ya el
 * papel que los justifica: nadie puede explicar de dónde salieron y el total
 * de la obra tiene una plata que no está en ningún contrato. Se van con ella.
 *
 * Los soportes también: son archivos de una orden que ya no existe.
 */
export async function borrarOrden(id) {
  await supabase.from("obra_rubros").delete().eq("orden_cambio_id", id);
  await supabase.from("obra_rubros").update({ anulado_por_oc: null }).eq("anulado_por_oc", id);
  const { data: fotos } = await supabase.from("orden_cambio_fotos").select("storage_path").eq("orden_id", id);
  const rutas = (fotos || []).map(f => f.storage_path).filter(Boolean);
  if (rutas.length) await supabase.storage.from("task-files").remove(rutas);
  const { error } = await supabase.from("ordenes_cambio").delete().eq("id", id);
  return error ? error.message : null;
}

/** El ITEM de la tabla: ADIC-01, ADIC-02, RED-01… numerado por su lado. */
export function siguienteItem(lineas = [], tipo) {
  const prefijo = tipo === "quita" ? "RED" : "ADIC";
  const n = lineas.filter(l => l.tipo === tipo).length + 1;
  return `${prefijo}-${String(n).padStart(2, "0")}`;
}

export async function agregarLinea(ordenId, linea, yaPuestas = []) {
  const tipo = linea.tipo === "quita" ? "quita" : "aumenta";
  const { data, error } = await supabase.from("orden_cambio_lineas").insert({
    orden_id: ordenId, tipo,
    item: linea.item?.trim() || siguienteItem(yaPuestas, tipo),
    rubro_codigo: linea.rubro_codigo?.trim() || null,
    obra_rubro_id: linea.obra_rubro_id ? Number(linea.obra_rubro_id) : null,
    capitulo: linea.capitulo || null,
    descripcion: linea.descripcion.trim(),
    especificacion: linea.especificacion?.trim() || null,
    unidad: linea.unidad || null,
    cantidad: Number(linea.cantidad) || 0,
    precio_unitario: Number(linea.precio_unitario) || 0,
    orden: Number(linea.orden) || 0,
    obra_rubro_id: linea.obra_rubro_id || null,
  }).select().single();
  return error ? { error: error.message } : { linea: data };
}

/** Los tres números del CAPÍTULO II, que es lo que se firma. */
export function subtotales(lineas = []) {
  const suma = t => lineas.filter(l => l.tipo === t)
    .reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0), 0);
  const adiciones = suma("aumenta");
  const reducciones = suma("quita");
  return { adiciones, reducciones, total: adiciones - reducciones };
}

/**
 * Corregir una partida ya guardada.
 *
 * Una orden de cambio se arma de a poco: el argumento el día del problema, las
 * partidas cuando llega la cotización, y el precio cambia una vez más antes de
 * mandarla. Sin esto la única manera de corregir una cantidad era borrar la
 * línea y volver a escribirla entera.
 */
export async function guardarLinea(id, campos) {
  const limpio = {};
  if (campos.descripcion != null) limpio.descripcion = String(campos.descripcion).trim();
  if (campos.unidad != null) limpio.unidad = String(campos.unidad).trim() || null;
  if (campos.cantidad != null) limpio.cantidad = Number(campos.cantidad) || 0;
  if (campos.precio_unitario != null) limpio.precio_unitario = Number(campos.precio_unitario) || 0;
  if (!Object.keys(limpio).length) return {};
  const { error } = await supabase.from("orden_cambio_lineas").update(limpio).eq("id", id);
  return error ? { error: error.message } : {};
}

export async function borrarLinea(id) {
  const { error } = await supabase.from("orden_cambio_lineas").delete().eq("id", id);
  return error ? error.message : null;
}

/**
 * Aprobar una orden: recién acá toca el control de obra.
 *
 * Lo que la orden agrega entra como rubro de la obra con `origen` en
 * 'orden_cambio', para que se vea aparte de la línea base y se pueda decir en
 * cualquier momento "esto es contrato y esto se pactó después". Lo que quita
 * Lo que QUITA, cuando apunta a un rubro del presupuesto, no entra como una
 * línea negativa al final: marca ese rubro como anulado. El neto es el mismo,
 * pero la lectura cambia por completo —antes el rubro seguía ahí con su monto
 * entero, como si se fuera a hacer, y alguien lo planificaba y lo compraba. La
 * plata estaba corregida; la obra no se enteraba.
 *
 * Se marca y no se borra: un presupuesto es un documento con historia, y el
 * día que alguien pregunte por qué no se hizo la mampostería del eje 4, la
 * respuesta tiene que estar a la vista con el número de la orden.
 *
 * Una quita escrita a mano —sin rubro al que apuntar— sigue entrando en
 * negativo: no hay nada que tachar.
 */
export async function aprobarOrden(orden, lineas, quien, { aprobada_por, observaciones } = {}) {
  const anulan = (lineas || []).filter(l => l.tipo === "quita" && l.obra_rubro_id);
  if (anulan.length) {
    const { error } = await supabase.from("obra_rubros")
      .update({ anulado_por_oc: orden.id })
      .in("id", anulan.map(l => Number(l.obra_rubro_id)));
    if (error && !/column|schema cache/i.test(error.message)) return error.message;
  }

  const filas = (lineas || []).filter(l => !(l.tipo === "quita" && l.obra_rubro_id)).map((l, i) => {
    const signo = l.tipo === "quita" ? -1 : 1;
    return {
      obra_id: orden.obra_id,
      numero: 9000 + orden.numero * 100 + i,
      capitulo: l.capitulo || `ADICIONALES · ${codigoDe(orden)}`,
      capitulo_orden: 9000 + orden.numero,
      orden: 9000000 + orden.numero * 1000 + i,
      descripcion: `${l.tipo === "quita" ? "(–) " : ""}${l.descripcion}  ·  ${codigoDe(orden)}`,
      unidad: l.unidad || "",
      cantidad: Number(l.cantidad) || 0,
      precio_unitario: signo * (Number(l.precio_unitario) || 0),
      total_base: signo * (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0),
      origen: "orden_cambio",
      orden_cambio_id: orden.id,
    };
  });

  if (filas.length) {
    let { error } = await supabase.from("obra_rubros").insert(filas);
    // Sin las columnas de la Fase 2 entra igual, sin poder distinguirse.
    if (error && /column|schema cache/i.test(error.message)) {
      const limpias = filas.map(({ origen, orden_cambio_id, ...resto }) => resto);
      ({ error } = await supabase.from("obra_rubros").insert(limpias));
    }
    if (error) return error.message;
  }

  return guardarOrden(orden.id, {
    estado: "aprobada",
    aprobada_at: new Date().toISOString(),
    // Aprobar deja también el visto interno: son la misma decisión. Separados,
    // alguien "daba el visto", la orden seguía en borrador, y el consolidado
    // —que suma solo las aprobadas— no la contaba. Dos botones para una cosa
    // y un total que no cuadra.
    visto_at: orden.visto_at || new Date().toISOString(),
    visto_por: orden.visto_por ?? (quien?.id ?? null),
    visto_nombre: orden.visto_nombre || quien?.name || null,
    contratante_nombre: aprobada_por?.trim() || orden.contratante_nombre || null,
    contratante_fecha: new Date().toISOString().split("T")[0],
    contratante_comentario: observaciones?.trim() || orden.contratante_comentario || null,
    ejecucion: orden.ejecucion === "por_definir" ? "ejecutado" : orden.ejecucion,
  });
}

/** Deshacer: se van sus rubros y vuelve a estar en revisión. */
export async function desaprobarOrden(orden) {
  await supabase.from("obra_rubros").delete().eq("orden_cambio_id", orden.id);
  // Los rubros que la orden había tachado vuelven al presupuesto: deshacer la
  // aprobación tiene que dejar las cosas como estaban, también de este lado.
  await supabase.from("obra_rubros").update({ anulado_por_oc: null }).eq("anulado_por_oc", orden.id);
  return guardarOrden(orden.id, { estado: "enviada", aprobada_at: null, contratante_fecha: null });
}

/** Mandar el documento por correo. Queda escrito a quién y cuándo. */
/**
 * @param aprobadores [{nombre, email, rol}] — los que TIENEN QUE FIRMAR.
 *   Cada uno recibe su propio enlace: la firma es de alguien, y con una llave
 *   compartida cualquiera podría aprobar en nombre de los otros. Los demás
 *   reciben la misma orden sin botón, de puro informativa.
 */
export async function enviarOrden(orden, destinatarios, cuerpo, quien, aprobadores = []) {
  const limpios = (destinatarios || []).map(d => String(d).trim()).filter(Boolean);
  const firman = (aprobadores || []).filter(a => a?.email);
  if (!limpios.length && !firman.length) return { error: "No hay a quién mandársela." };

  // UN BORRADOR NO SE MANDA. Ahora una orden se puede guardar sin partidas
  // —el argumento se escribe el día del problema y el precio llega después—,
  // así que hay que atajar el caso acá: lo que recibiría el cliente sería un
  // documento formal con el cuadro de partidas vacío.
  const { count } = await supabase.from("orden_cambio_lineas")
    .select("id", { count: "exact", head: true }).eq("orden_id", orden.id);
  if (!count) return { error: "Esta orden todavía no tiene partidas: es un borrador. Agregale las partidas antes de mandarla." };

  const r = await fetch("/api/aviso?de=orden", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orden_id: orden.id, destinatarios: limpios, cuerpo, aprobadores: firman }),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) return { error: datos.error || "No se pudo mandar el correo." };

  await supabase.from("orden_cambio_envios").insert({
    orden_id: orden.id, destinatarios: limpios,
    enviado_por: quien?.id ?? null, enviado_nombre: quien?.name || null,
  });
  if (orden.estado === "borrador") {
    await guardarOrden(orden.id, { estado: "enviada", enviada_at: new Date().toISOString() });
  }
  return { ok: true, enviadoA: datos.enviadoA || limpios };
}

// ── Los soportes gráficos del CAPÍTULO I ─────────────────────────────────
//
// La foto de lo que se encontró y el plano con la solución. Van al depósito
// privado, como las del libro de obra, y viajan adjuntas en el correo: un
// enlace que caduca deja el respaldo inservible justo cuando alguien lo
// necesita, seis meses después, para justificar un adicional.

/** Guardar o corregir a quien firma. Mientras no se mandó, se edita. */
/**
 * Subir o bajar una partida dentro de su grupo.
 *
 * EL ORDEN DE LAS PARTIDAS ES EL ORDEN EN QUE SE LEE EL CAMBIO. NOVA las carga
 * en el orden en que vienen en la proforma del proveedor, que es el de él:
 * primero lo que factura más fácil. El que aprueba las lee en el orden del
 * trabajo —primero lo que se demuele, después lo que se construye— y una lista
 * desordenada obliga a saltar de arriba abajo para entender un cambio que es
 * uno solo.
 *
 * Las adiciones se mueven entre adiciones y las reducciones entre
 * reducciones: son dos cuadros con su propio subtotal, y una reducción en
 * medio de las adiciones no es un orden, es un error de lectura.
 *
 * Se renumera el grupo entero en vez de intercambiar dos filas: el `item`
 * —ADIC-03— es una etiqueta de posición, y un cuadro que va 01, 03, 02 se lee
 * como si faltara una partida.
 */
export async function moverLinea(lineas, id, direccion) {
  const todas = [...(lineas || [])];
  const esta = todas.find(l => l.id === id);
  if (!esta) return "Esa partida ya no está.";
  const mismoGrupo = l => (l.tipo === "quita") === (esta.tipo === "quita");
  const grupo = todas.filter(mismoGrupo);
  const i = grupo.findIndex(l => l.id === id);
  const j = i + (direccion < 0 ? -1 : 1);
  if (j < 0 || j >= grupo.length) return null;
  [grupo[i], grupo[j]] = [grupo[j], grupo[i]];

  // El `orden` se reparte sobre la lista completa para que la otra mitad no
  // quede intercalada, y el `item` por posición dentro del grupo.
  const otros = todas.filter(l => !mismoGrupo(l));
  const completa = esta.tipo === "quita" ? [...otros, ...grupo] : [...grupo, ...otros];
  const prefijo = l => (l.tipo === "quita" ? "RED" : "ADIC");
  const cuantas = { ADIC: 0, RED: 0 };
  const posicion = {};
  for (const l of completa) posicion[l.id] = ++cuantas[prefijo(l)];
  for (let k = 0; k < completa.length; k++) {
    const l = completa[k];
    const item = `${prefijo(l)}-${String(posicion[l.id]).padStart(2, "0")}`;
    if (l.orden === k && l.item === item) continue;
    const { error } = await supabase.from("orden_cambio_lineas")
      .update({ orden: k, item }).eq("id", l.id);
    if (error) return error.message;
  }
  return null;
}

/**
 * La gente del proyecto, de las dos listas donde vive.
 *
 * Los involucrados se cargan una vez: los convocados del acta de reunión
 * —nombre, empresa, cargo y correo— y los invitados del pipeline. Son dos
 * tablas por historia, no por decisión, y el que arma una orden de cambio no
 * tiene por qué saber en cuál quedó cada uno: termina volviendo a tipear
 * correos que ya están escritos, que es de donde sale la letra cambiada que
 * después rebota.
 *
 * Se juntan y se deduplica por correo, que es la identidad que importa para
 * mandar. Gana el convocado, que trae empresa y cargo.
 */
export async function gentePara(leadId) {
  if (!leadId) return [];
  const [{ data: convocados }, { data: invitados }] = await Promise.all([
    supabase.from("obra_convocados").select("*").eq("lead_id", leadId).eq("activo", true).order("orden"),
    supabase.from("pipeline_invitados").select("*").eq("lead_id", leadId),
  ]);
  const por = new Map();
  const poner = (nombre, empresa, rol, email, extra) => {
    const limpio = String(email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(limpio) || por.has(limpio)) return;
    por.set(limpio, { nombre: nombre || "", empresa: empresa || "", rol: rol || "", email: limpio, ...extra });
  };
  for (const c of convocados || []) poner(c.nombre, c.empresa, c.cargo, c.email, { id: `c${c.id}` });
  for (const i of invitados || []) poner(i.nombre, "", i.rol, i.email, { id: `i${i.id}`, recibe_ordenes: i.recibe_ordenes });
  return [...por.values()];
}

export async function guardarAprobador(fila) {
  const { id, ...campos } = fila;
  const q = id
    ? supabase.from("orden_cambio_aprobaciones").update(campos).eq("id", id)
    : supabase.from("orden_cambio_aprobaciones").insert(campos);
  const { data, error } = await q.select().single();
  if (error) return { error: /relation|column|schema cache/i.test(error.message)
    ? "Falta correr la migración 118 para la aprobación por correo." : error.message };
  return { aprobador: data };
}

export async function borrarAprobador(id) {
  const { error } = await supabase.from("orden_cambio_aprobaciones").delete().eq("id", id);
  return error ? error.message : null;
}

/** Quiénes tienen que firmar esta orden, y quién firmó ya. */
export async function aprobacionesDe(ordenId) {
  const { data, error } = await supabase.from("orden_cambio_aprobaciones")
    .select("*").eq("orden_id", ordenId).order("id");
  if (error) return [];
  return data || [];
}

/**
 * La lista de quién firma, para varias órdenes de una vez.
 *
 * El panel muestra todas las órdenes de la obra abiertas a la vez; pedir la
 * lista de firmantes de a una es una consulta por orden y un parpadeo por
 * orden.
 */
export async function aprobacionesDeOrdenes(ids) {
  if (!ids?.length) return {};
  const { data, error } = await supabase.from("orden_cambio_aprobaciones")
    .select("*").in("orden_id", ids).order("id");
  if (error) return {};
  const por = {};
  for (const f of data || []) (por[f.orden_id] = por[f.orden_id] || []).push(f);
  return por;
}

export async function subirSoporte(orden, archivo, descripcion, quien, cuantasHay = 0) {
  const limpio = archivo.name.replace(/[^\w.\-]/g, "_").slice(-60);
  const ruta = `orden-${orden.id}/${Date.now()}-${limpio}`;
  const { error } = await supabase.storage.from("task-files").upload(ruta, archivo, { upsert: false });
  if (error) return { error: error.message };
  const { data, error: e2 } = await supabase.from("orden_cambio_fotos").insert({
    orden_id: orden.id, storage_path: ruta, descripcion: descripcion?.trim() || null,
    orden: cuantasHay, autor_id: quien?.id ?? null, autor_nombre: quien?.name || null,
  }).select().single();
  return e2 ? { error: e2.message } : { foto: data };
}

export async function borrarSoporte(foto) {
  await supabase.storage.from("task-files").remove([foto.storage_path]);
  const { error } = await supabase.from("orden_cambio_fotos").delete().eq("id", foto.id);
  return error ? error.message : null;
}

/** Enlaces temporales para mirarlos en pantalla, que el depósito es privado. */
export async function enlacesDeSoportes(fotos = []) {
  if (!fotos.length) return {};
  const { data } = await supabase.storage.from("task-files")
    .createSignedUrls(fotos.map(f => f.storage_path), 3600);
  const mapa = {};
  (data || []).forEach((x, i) => { if (x?.signedUrl) mapa[fotos[i].id] = x.signedUrl; });
  return mapa;
}
