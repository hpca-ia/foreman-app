import { supabase } from "../../lib/supabase";
import { honorariosDe, rubroDeHonorarios } from "./honorariosDeOrden.js";

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
const SIN_125 = "Falta correr la migración 125 en Supabase para guardar el costo de la partida.";

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
    // Qué mueve la orden —puede ser más de una— y el honorario del contrato.
    afecta: Array.isArray(datos.afecta) ? datos.afecta : [],
    honorarios_pct: Number(datos.honorarios_pct) > 0 ? Number(datos.honorarios_pct) : null,
    contratista_nombre: datos.contratista_nombre?.trim() || "HCARQ SA",
    created_by: quien?.id ?? null, created_nombre: quien?.name || null,
  }).select().single();
  if (error && /afecta|honorarios_pct|schema cache/i.test(error.message)) {
    // Sin la 149 la orden se crea igual, sin esos dos datos: no vale la pena
    // frenar una orden entera por un campo nuevo.
    const { data: d2, error: e2 } = await supabase.from("ordenes_cambio").insert({
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
    if (e2) return { error: e2.message };
    return { orden: d2 };
  }
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

/**
 * PEDIR EL VISTO DE VERDAD: con una tarea, un correo y la orden adjunta.
 *
 * Marcar una fecha en la orden no es pedir nada. El Director se enteraba
 * porque alguien se acordaba de escribirle, y mientras tanto el precio no sale
 * y el trabajo no se ejecuta. Es el mismo agujero que tenía el acta.
 *
 * Va por la misma puerta que el visto de una compra: una tarea de aprobación
 * con su llave, el correo con el PDF, y dos botones que se contestan desde el
 * teléfono. Lo que se aprueba acá es que el precio puede salir al cliente —no
 * que el cliente lo aceptó—, que es la confusión que había.
 *
 * @param pdf  { nombre, contenido } el PDF de la orden, armado por la pantalla
 *   (acá no hay librería de PDF ni los enlaces firmados de los soportes).
 */
export async function pedirElVistoAlDirector(orden, quien, pdf = null) {
  const e = await pedirVisto(orden.id);
  if (e) return { error: e };

  // Quién da el visto: el Director. Si hubiera más de uno, el primero activo;
  // sin ninguno no hay a quién pedírselo y vale la pena decirlo.
  const { data: duenos } = await supabase.from("usuarios")
    .select("id,nombre,email,rol,activo").eq("rol", "owner").eq("activo", true);
  const director = (duenos || []).find(u => String(u.email || "").trim());
  if (!director) return { error: "No hay un Director con correo cargado a quien pedirle el visto." };

  // La tarea es el registro y el aviso: aparece en su tablero, entra al
  // resumen de la mañana y es la que lleva la llave del enlace del correo.
  const { data: tarea, error: errT } = await supabase.from("tasks").insert({
    title: `Dar el visto: ${codigoDe(orden)} · ${orden.titulo || ""}`.slice(0, 200),
    lead_id: orden.lead_id ?? null, assignee_id: director.id,
    type: "Gestión", status: "en-progreso",
    priority: orden.fecha_limite_aprobacion ? "urgente" : "media",
    due_date: orden.fecha_limite_aprobacion ? String(orden.fecha_limite_aprobacion).slice(0, 10) : null,
    notes: `Orden de cambio ${codigoDe(orden)}. Aprobar acá es dejar que el precio salga al cliente, `
      + "no que el cliente lo haya aceptado.",
    created_by: quien?.id ?? null,
    es_aprobacion: true, aprobacion_estado: "pendiente",
    orden_cambio_id: orden.id,
    // Si la devuelve, le toca a quien la armó.
    aprob_no_para: quien?.id ?? null,
  }).select().single();
  if (errT) {
    return { error: /column|schema cache/i.test(errT.message)
      ? "Falta correr la migración 133 para pedir el visto por correo." : errT.message };
  }

  const r = await fetch("/api/aviso?de=aprobar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tareaId: tarea.id, adjunto: pdf, conAdjuntos: false }),
  });
  const d = await r.json().catch(() => ({}));
  if (d?.error) return { ok: true, aviso: `La tarea quedó en el tablero de ${director.nombre}, pero el correo no salió: ${d.error}` };
  return { ok: true, pedidoA: director.nombre };
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
  // Lo que la orden prometía de beneficio se va con ella. Lo ya comprado se
  // queda —fue plata de verdad— y pierde la referencia a la orden sola.
  await supabase.from("obra_beneficios").delete().eq("orden_cambio_id", id).eq("estado", "previsto");
  const { data: cots } = await supabase.from("orden_cambio_cotizaciones").select("archivo_path").eq("orden_id", id);
  const papeles = (cots || []).map(c => c.archivo_path).filter(Boolean);
  if (papeles.length) await supabase.storage.from("task-files").remove(papeles);
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
  const fila = {
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
  };
  // El costo y la cotización de donde salió son de la 125. Sin ella la
  // partida entra igual —sin la partida no hay orden— y se avisa que el costo
  // no quedó guardado.
  const tieneCosto = linea.costo_unitario !== undefined && linea.costo_unitario !== null && linea.costo_unitario !== "";
  if (tieneCosto) fila.costo_unitario = Number(linea.costo_unitario) || 0;
  if (linea.cotizacion_id) fila.cotizacion_id = Number(linea.cotizacion_id);
  let { data, error } = await supabase.from("orden_cambio_lineas").insert(fila).select().single();
  if (error && falta(error) && (tieneCosto || fila.cotizacion_id)) {
    const { costo_unitario, cotizacion_id, ...sinCosto } = fila;
    ({ data, error } = await supabase.from("orden_cambio_lineas").insert(sinCosto).select().single());
    if (!error) return { linea: data, sinCosto: true };
  }
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
  // Vacío borra el costo: "no sé lo que cuesta" no es lo mismo que cero.
  if (campos.costo_unitario !== undefined) {
    limpio.costo_unitario = campos.costo_unitario === "" || campos.costo_unitario === null ? null : Number(campos.costo_unitario) || 0;
  }
  if (!Object.keys(limpio).length) return {};
  const { error } = await supabase.from("orden_cambio_lineas").update(limpio).eq("id", id);
  if (error && falta(error) && "costo_unitario" in limpio) return { error: SIN_125 };
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

  // EN LA BASE DEL CONTROL, QUE ES CON IVA.
  //
  // La orden se arma SIN IVA —así se cotiza, así se mide su margen y así va el
  // documento que firma el cliente, con el IVA al pie—. El control de
  // presupuesto, en cambio, tiene sus rubros con el impuesto adentro: es
  // contra eso que se descuenta lo que se gasta.
  //
  // Metiendo la línea tal cual, el adicional entraba un 15% corto y el
  // contrato vigente quedaba corto con él, sin que nada lo dijera.
  const { data: unRubro } = await supabase.from("obra_rubros")
    .select("iva_pct").eq("obra_id", orden.obra_id).not("iva_pct", "is", null).limit(1).maybeSingle();
  const iva = Number(unRubro?.iva_pct) || 0;
  const conIva = v => Math.round(v * (1 + iva / 100) * 100) / 100;

  // TODAS LAS LÍNEAS ENTRAN, las que suman y las que restan.
  //
  // Antes la reducción iba a buscar el rubro original del contrato y lo
  // tachaba. Eso editaba el presupuesto firmado, sacaba el rubro entero aunque
  // la orden redujera una parte, y dejaba el capítulo de la orden mostrando
  // solo las adiciones: ADICIONALES · OC-01 por $12.508,62 cuando esa orden
  // movía $3.849,94.
  //
  // El presupuesto original no se toca. La orden suma lo suyo y resta lo suyo,
  // en el mismo capítulo, y ahí se lee lo que de verdad hizo.
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
      precio_unitario: signo * conIva(Number(l.precio_unitario) || 0),
      total_base: signo * conIva((Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0)),
      iva_pct: iva,
      origen: "orden_cambio",
      orden_cambio_id: orden.id,
    };
  });

  // EL HONORARIO ENTRA APARTE, EN SU PROPIO CAPÍTULO.
  //
  // Sobre el neto de la orden se cobra el porcentaje del contrato —administrar
  // un adicional es trabajo igual que administrar el resto— pero no se reparte
  // dentro de los precios: cada partida tiene que seguir diciendo lo que
  // cuesta, porque ese es el número contra el que después se compara una
  // cotización. Y si la orden es negativa, el honorario también lo es.
  const cuenta = honorariosDe({ lineas, pct: orden.honorarios_pct });
  const honorario = rubroDeHonorarios(orden, cuenta, { conIva, iva });
  if (honorario) filas.push(honorario);

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
  // Y si esta orden es de las viejas, que tachaban un rubro del contrato en vez
  // de restar con una línea propia, ese rubro vuelve: deshacer la aprobación
  // tiene que dejar las cosas como estaban, también de ese lado.
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
    // QUIÉN LA MANDA, para que la respuesta le llegue a él.
    //
    // El remitente es una casilla de avisos que nadie lee. Una orden de cambio
    // se discute —"esto no es así", "¿de dónde sale ese precio?"— y el cliente
    // contesta apretando Responder, como contesta todo el mundo. Sin esto esa
    // respuesta se perdía, y además un correo que no se puede responder tiene
    // más chance de terminar en no deseados.
    body: JSON.stringify({ orden_id: orden.id, destinatarios: limpios, cuerpo, aprobadores: firman,
      de: quien?.email ? { nombre: quien.name || "", email: quien.email } : null }),
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

/**
 * INSISTIR: el mismo correo, otra vez, solo a quien no contestó.
 *
 * Una orden enviada y sin firmar es trabajo que no se ejecuta —o peor, trabajo
 * ya ejecutado que nadie se comprometió a pagar—. Y lo que pasa en la práctica
 * no es que el cliente se niegue: es que el correo quedó sepultado, o lo abrió
 * en el auto y se olvidó. Insistir es la mitad del trabajo de cobrar un
 * adicional, y hasta ahora había que hacerlo por WhatsApp, sin que quedara
 * registrado que se insistió.
 *
 * Va solo a los que faltan: al que ya firmó, un recordatorio de algo que
 * cumplió le enseña a ignorar los correos de FOREMAN.
 *
 * El enlace de cada uno es el mismo de siempre —el servidor no cambia la
 * llave al volver a mandar—, así que el cliente puede apretar el botón del
 * correo viejo o el del nuevo y los dos abren.
 */
export async function insistirConLaOrden(orden, faltan = [], quien, texto = null) {
  const firman = (faltan || [])
    .map(f => ({ id: f.id, nombre: f.nombre, email: f.email, rol: f.rol, empresa: f.empresa }))
    .filter(f => f.email);
  if (!firman.length) return { error: "No queda nadie a quien insistirle: ya firmaron todos." };

  const cuerpo = texto || "Les recordamos que esta orden de cambio sigue sin aprobación. "
    + "Mientras no esté aprobada, este trabajo no se ejecuta y el plazo de obra corre igual. "
    + "Si algo del detalle no está bien, escribilo en el enlace: queda como constancia y lo resolvemos.";

  const r = await enviarOrden(orden, [], cuerpo, quien, firman);
  if (r?.error) return r;
  return { ok: true, insistidoA: firman.map(f => f.nombre || f.email) };
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
  // LAS CUATRO LISTAS SON UNA SOLA PERSONA.
  //
  // El mismo arquitecto de la fiscalización está cargado como convocado del
  // acta, como invitado del pipeline, como asistente de las seis actas que ya
  // se hicieron y como firmante de las dos órdenes anteriores. Son cuatro
  // tablas por historia, no por decisión, y el que arma una orden no tiene por
  // qué saber en cuál quedó: termina tipeando un correo que ya está escrito
  // tres veces, y ahí es donde se cuela la letra cambiada que después rebota
  // sin que nadie lo note —un correo de aprobación que no llega se parece a un
  // cliente que no contestó—.
  //
  // Así que el directorio del proyecto se arma de las cuatro y se alimenta
  // solo: cada persona que entra a un acta o a una orden ya está disponible
  // para la próxima, sin que nadie la vuelva a cargar.
  //
  // `deSiempre` marca a los convocados, que es otra cosa: esos entran solos en
  // cada acta nueva. Un proveedor que vino una vez a una reunión queda en el
  // directorio —para no volver a tipearlo— pero no se cuela en todas las actas
  // del año.
  const [{ data: convocados }, { data: invitados }, { data: actas }, { data: obras }] = await Promise.all([
    supabase.from("obra_convocados").select("*").eq("lead_id", leadId).eq("activo", true).order("orden"),
    supabase.from("pipeline_invitados").select("*").eq("lead_id", leadId),
    supabase.from("obra_actas").select("id").eq("lead_id", leadId),
    supabase.from("obras").select("id").eq("lead_id", leadId),
  ]);

  const [{ data: asistentes }, { data: firmantes }] = await Promise.all([
    (actas || []).length
      ? supabase.from("acta_asistentes").select("nombre,empresa,cargo,email").in("acta_id", (actas || []).map(a => a.id))
      : Promise.resolve({ data: [] }),
    (obras || []).length
      ? supabase.from("ordenes_cambio").select("id").in("obra_id", (obras || []).map(o => o.id))
        .then(async ({ data: ords }) => ((ords || []).length
          ? supabase.from("orden_cambio_aprobaciones").select("nombre,empresa,rol,email").in("orden_id", ords.map(o => o.id))
          : { data: [] }))
      : Promise.resolve({ data: [] }),
  ]);

  const por = new Map();
  const poner = (nombre, empresa, rol, email, extra = {}) => {
    const limpio = String(email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(limpio)) return;
    const ya = por.get(limpio);
    if (!ya) { por.set(limpio, { nombre: nombre || "", empresa: empresa || "", rol: rol || "", email: limpio, ...extra }); return; }
    // Gana el dato que existe sobre el vacío, y el nombre más completo: el
    // firmante de una orden suele estar cargado como "Diners" y el convocado
    // del acta con nombre, empresa y cargo.
    if (String(nombre || "").length > String(ya.nombre || "").length) ya.nombre = nombre;
    if (!ya.empresa && empresa) ya.empresa = empresa;
    if (!ya.rol && rol) ya.rol = rol;
    Object.assign(ya, { ...extra, ...(ya.deSiempre ? { deSiempre: true } : {}) });
  };

  for (const c of convocados || []) poner(c.nombre, c.empresa, c.cargo, c.email, { id: `c${c.id}`, deSiempre: true });
  for (const i of invitados || []) poner(i.nombre, "", i.rol, i.email, { id: `i${i.id}`, recibe_ordenes: i.recibe_ordenes });
  for (const a of asistentes || []) poner(a.nombre, a.empresa, a.cargo, a.email, { deActas: true });
  for (const f of firmantes || []) poner(f.nombre, f.empresa, f.rol, f.email, { deOrdenes: true });
  return [...por.values()];
}

/**
 * LA GENTE DE LAS OTRAS OBRAS, para cuando este proyecto todavía no tiene.
 *
 * "Traer los de siempre" no hacía nada en una obra nueva, y decía "ya están
 * todos los del proyecto": no era cierto —no había ninguno— y mandaba a
 * tipear cuatro correos a mano, que es de donde sale la letra cambiada que
 * después rebota sin que nadie lo note.
 *
 * Y casi siempre son los mismos: el mismo cliente abre la obra del aeropuerto
 * y la de Plaza Lagos con la misma gente. Se ofrecen los de los otros
 * proyectos, diciendo de cuál vienen, para elegir y traerlos.
 *
 * Gana el más completo: el convocado de un acta trae empresa y cargo.
 */
export async function genteDeOtrosProyectos(leadId) {
  const [{ data: convocados }, { data: leads }] = await Promise.all([
    supabase.from("obra_convocados").select("*").eq("activo", true).order("orden"),
    supabase.from("leads").select("id,nombre"),
  ]);
  const nombreDe = new Map((leads || []).map(l => [Number(l.id), l.nombre]));
  const por = new Map();
  for (const c of convocados || []) {
    if (Number(c.lead_id) === Number(leadId)) continue;
    const email = String(c.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) continue;
    const ya = por.get(email);
    const fila = {
      nombre: c.nombre || "", empresa: c.empresa || "", rol: c.cargo || "", email,
      proyectos: new Set([nombreDe.get(Number(c.lead_id)) || ""].filter(Boolean)),
    };
    if (!ya) { por.set(email, fila); continue; }
    fila.proyectos.forEach(x => ya.proyectos.add(x));
    if (String(fila.nombre).length > String(ya.nombre).length) ya.nombre = fila.nombre;
    if (!ya.empresa) ya.empresa = fila.empresa;
    if (!ya.rol) ya.rol = fila.rol;
  }
  return [...por.values()].map(x => ({ ...x, proyectos: [...x.proyectos] }));
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
