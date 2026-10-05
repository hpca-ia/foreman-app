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
export const codigoDe = orden => orden?.codigo || `OC-${String(orden?.numero ?? 0).padStart(2, "0")}`;

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
 * entra igual, en negativo: sacar un rubro de la base borraría la historia.
 */
export async function aprobarOrden(orden, lineas, quien, { aprobada_por, observaciones } = {}) {
  const filas = (lineas || []).map((l, i) => {
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
    contratante_nombre: aprobada_por?.trim() || orden.contratante_nombre || null,
    contratante_fecha: new Date().toISOString().split("T")[0],
    contratante_comentario: observaciones?.trim() || orden.contratante_comentario || null,
    ejecucion: orden.ejecucion === "por_definir" ? "ejecutado" : orden.ejecucion,
  });
}

/** Deshacer: se van sus rubros y vuelve a estar en revisión. */
export async function desaprobarOrden(orden) {
  await supabase.from("obra_rubros").delete().eq("orden_cambio_id", orden.id);
  return guardarOrden(orden.id, { estado: "enviada", aprobada_at: null, contratante_fecha: null });
}

/** Mandar el documento por correo. Queda escrito a quién y cuándo. */
export async function enviarOrden(orden, destinatarios, cuerpo, quien) {
  const limpios = (destinatarios || []).map(d => String(d).trim()).filter(Boolean);
  if (!limpios.length) return { error: "No hay a quién mandársela." };

  const r = await fetch("/api/aviso?de=orden", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orden_id: orden.id, destinatarios: limpios, cuerpo }),
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
