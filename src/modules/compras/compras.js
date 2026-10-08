import { supabase } from "../../lib/supabase";
import { sincronizarCapitulos } from "../controlObra/sincronizarCapitulos";
import { solicitudesDeLaObra } from "../controlObra/calculos";
import { registrarPago as pagarFactura } from "../controlObra/pagos";

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
    clase: datos.clase || "material",
    obra_actividad_id: datos.obra_actividad_id ? Number(datos.obra_actividad_id) : null,
    obra_rubro_id: datos.obra_rubro_id ? Number(datos.obra_rubro_id) : null,
    monto_estimado: datos.monto_estimado ? Number(datos.monto_estimado) : null,
    estado: "borrador", solicitante_id: quien?.id ?? null, solicitante_nombre: quien?.name || null,
  };
  let { data, error } = await supabase.from("compras_solicitudes").insert(fila).select().single();
  // Sin la 056 no existen esas tres columnas: la solicitud se crea igual.
  if (error && /column|schema cache/i.test(error.message)) {
    const { capitulo, clase, obra_actividad_id, obra_rubro_id, monto_estimado, destino, ...resto } = fila;
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
    clase: datos.clase || "material",
    obra_actividad_id: datos.obra_actividad_id ? Number(datos.obra_actividad_id) : null,
    obra_rubro_id: datos.obra_rubro_id ? Number(datos.obra_rubro_id) : null,
    monto_estimado: datos.monto_estimado ? Number(datos.monto_estimado) : null,
    destino: datos.destino?.trim() || null,
  };
  let { error } = await supabase.from("compras_solicitudes").update(campos).eq("id", id);
  if (error && /column|schema cache/i.test(error.message)) {
    const { capitulo, clase, obra_actividad_id, obra_rubro_id, monto_estimado, destino, ...resto } = campos;
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
    const fila = {
      title: titulo, lead_id: solicitud.lead_id, assignee_id: paraQuien,
      due_date: solicitud.necesita_para || null,
      priority: solicitud.urgente ? "urgente" : "media",
      status: "en-progreso", type: "Compra",
      // El paso va escrito en la tarea: el tablero muestra "esperando visto" en
      // vez de "en proceso", que es cierto y no sirve para nada.
      compra_id: solicitud.id, compra_estado: estado,
      notes: `Gestión de compras · ${solicitud.descripcion}`,
      created_by: quien?.id ?? null,
      ...(estado === "pendiente_aprobacion" ? { es_aprobacion: true, aprobacion_estado: "pendiente" } : {}),
    };
    let { data } = await supabase.from("tasks").insert(fila).select().single();
    // Sin la 069 no existen esas tres columnas: el aviso sale igual, con el
    // aspecto de antes. Que falte una migración no puede frenar una compra.
    if (!data) {
      const { compra_id, compra_estado, type, ...resto } = fila;
      ({ data } = await supabase.from("tasks").insert({ ...resto, type: "Gestión" }).select().single());
    }
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

/** Ponerle nombre y precio a una proforma después de subirla. */
export async function actualizarAdjunto(id, campos) {
  const { error } = await supabase.from("compras_adjuntos").update({
    proveedor: campos.proveedor?.trim() || null,
    monto: campos.monto === "" || campos.monto == null ? null : Number(campos.monto),
  }).eq("id", id);
  return error ? error.message : null;
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
 * Borrar el pedido.
 *
 * Se pide desde el teléfono, parado en la obra, y se escribe mal: el proyecto
 * equivocado, dos veces el mismo, "200 sacos" donde iban 20. Sin poder
 * borrarlo, lo que queda es un pedido muerto en la lista de todos —que alguien
 * va a tener que anular, explicar o simplemente aprender a ignorar—. Una lista
 * con basura adentro se deja de leer, y entonces el módulo no sirve.
 *
 * Lo borra quien lo pidió mientras no se haya comprado: después hay plata
 * comprometida contra un rubro y un proveedor esperando. Gerencia y compras
 * borran también después, salvo que ya tenga factura en el control de obra:
 * ahí el gasto existe por su cuenta y borrar el pedido solo rompería el
 * vínculo, dejando una factura que nadie puede explicar de dónde salió.
 *
 * Se lleva lo suyo: las cotizaciones del depósito, el historial, y la tarea
 * que le dejó a alguien. Un aviso de algo que ya no existe es peor que
 * ninguno: el que lo abre no entiende qué pasó.
 */
export async function borrarSolicitud(solicitud) {
  if (solicitud.factura_id) {
    return "Esta compra ya tiene su factura en el control de obra. Borrá la factura allá si hace falta; el pedido es el respaldo de ese gasto.";
  }
  const adjuntos = await adjuntosDe(solicitud.id);
  const rutas = adjuntos.map(a => a.storage_path).filter(Boolean);
  if (rutas.length) await supabase.storage.from("task-files").remove(rutas);
  if (solicitud.tarea_id) await supabase.from("tasks").delete().eq("id", solicitud.tarea_id);
  // El historial y los adjuntos se van solos por la llave foránea, pero no
  // todas las bases tienen el borrado en cascada activo: se piden explícitos.
  await supabase.from("compras_adjuntos").delete().eq("solicitud_id", solicitud.id);
  await supabase.from("compras_historial").delete().eq("solicitud_id", solicitud.id);

  const { error } = await supabase.from("compras_solicitudes").delete().eq("id", solicitud.id);
  if (error) return error.message;

  if (solicitud.lead_id) {
    await supabase.from("lead_movimientos").insert({
      lead_id: solicitud.lead_id, tipo: "compra", automatico: true,
      detalle: `Pedido borrado: ${solicitud.descripcion}`,
    }).select();
  }
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
 * La compra entra al control de obra.
 *
 * Este es el momento en que la plata deja de estar hablada. Hasta acá la
 * solicitud estaba COMPROMETIDA contra su agrupación: se dijo que se iban a
 * gastar mil dólares. Con el documento cargado pasa a ser INVERTIDO y descuenta
 * el rubro de verdad.
 *
 * Entra el total del documento, no lo que se pagó. Una factura con un anticipo
 * del 40% ya se debe entera —el material ya está en obra y el rubro ya se
 * consumió—; lo que falta pagar es un problema de caja, no de avance, y vive en
 * Proveedores. Mezclar las dos cosas hace que una obra con buen crédito parezca
 * ir mejor que una que paga al contado.
 *
 * Faltaba justo este paso: Johanna marcaba "ya la compré" y alguien tenía que
 * acordarse de ir a cargar la factura a mano. Si no lo hacía, la compra quedaba
 * comprometida para siempre y el control mentía en los dos sentidos.
 */
export async function facturarCompra(solicitud, datos, quien) {
  const total = Number(datos.total) || 0;
  if (!(total > 0)) return { error: "¿Por cuánto es el documento?" };
  if (!solicitud.lead_id) return { error: "Un gasto de oficina no entra al control de una obra." };

  const { data: obras } = await supabase.from("obras").select("id").eq("lead_id", solicitud.lead_id).limit(1);
  const obra = obras?.[0];
  if (!obra) return { error: "Este proyecto todavía no tiene una obra activa en Control de Obra." };

  // A la planilla abierta; si no hay ninguna, queda sin corte y se asigna
  // después. Una factura sin planilla ya salió de la caja igual.
  const { data: planillas } = await supabase.from("planillas")
    .select("id,numero,estado").eq("obra_id", obra.id).order("numero");
  const abierta = (planillas || []).find(p => p.estado === "abierta") || (planillas || []).slice(-1)[0] || null;

  const fila = {
    obra_id: obra.id, planilla_id: abierta?.id || null,
    fecha: datos.fecha || new Date().toISOString().slice(0, 10),
    clase: datos.clase || "factura",
    tipo_documento: (datos.clase || "factura").toUpperCase(),
    numero_factura: datos.numero?.trim() || null,
    razon_social: datos.proveedor?.trim() || solicitud.proveedor || null,
    ruc: datos.ruc?.trim() || null,
    detalle: solicitud.descripcion,
    justificacion: solicitud.justificacion || null,
    total,
    origen: "manual",
    subido_por: quien?.id ?? null, subido_por_nombre: quien?.name || null,
  };
  let { data: factura, error } = await supabase.from("obra_facturas").insert(fila).select().single();
  if (error && /column|schema cache/i.test(error.message)) {
    const { clase, ...resto } = fila;
    ({ data: factura, error } = await supabase.from("obra_facturas").insert(resto).select().single());
  }
  if (error) return { error: "No se pudo cargar el documento: " + error.message };

  // Contra qué del presupuesto. Lo eligió quien pidió, hace semanas: volver a
  // preguntarlo acá es pedirle a Johanna que adivine de qué era la compra.
  const destino = solicitud.obra_rubro_id
    ? { obra_rubro_id: solicitud.obra_rubro_id }
    : solicitud.obra_actividad_id ? { obra_actividad_id: solicitud.obra_actividad_id } : null;
  if (destino) {
    await supabase.from("obra_asignaciones").insert({ factura_id: factura.id, ...destino, monto: total });
  }

  // Enganchada al pedido: con esto deja de contarse como comprometido —si no,
  // la misma plata pesaría dos veces sobre el mismo rubro.
  await supabase.from("compras_solicitudes").update({ factura_id: factura.id, obra_id: obra.id }).eq("id", solicitud.id);

  await anotar(solicitud.id, solicitud.estado, solicitud.estado, quien,
    `${(datos.clase || "factura") === "proforma" ? "Proforma" : "Factura"}${fila.numero_factura ? ` ${fila.numero_factura}` : ""} por $${total.toFixed(2)} cargada al control de obra${destino ? "" : " — falta asignarle el rubro"}`);

  return { factura, sinDestino: !destino, sinPlanilla: !abierta };
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

  // Y EL PAGO ENTRA AL CONTROL, que es donde se mira lo que se debe.
  //
  // Hasta acá esto solo marcaba el pedido como pagado. Proveedores calcula el
  // saldo restando los pagos de `obra_pagos` al total del documento, así que
  // una factura pagada desde Compras seguía apareciendo como que se debe: el
  // pago existía en una pantalla y no en la otra. Alguien iba a pagar dos
  // veces, o a discutir con un proveedor que ya había cobrado.
  //
  // Si el pedido todavía no tiene factura en el control no hay contra qué
  // registrarlo, y ahí la marca del pedido es todo lo que se puede guardar.
  if (solicitud.factura_id && campos.pagado_monto) {
    const { data: f } = await supabase.from("obra_facturas")
      .select("id,obra_id").eq("id", solicitud.factura_id).maybeSingle();
    if (f) {
      // Sin duplicar: si alguien ya registró este pago en el control —al
      // facturar, por ejemplo— no se suma de nuevo.
      const { data: ya } = await supabase.from("obra_pagos")
        .select("monto").eq("factura_id", f.id);
      const pagado = (ya || []).reduce((t, x) => t + (Number(x.monto) || 0), 0);
      const falta = Math.round((Number(campos.pagado_monto) - pagado) * 100) / 100;
      if (falta > 0.005) {
        await pagarFactura(f, { monto: falta, forma: "otro", nota: "Registrado desde Compras" }, quien);
      }
    }
  }

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

/**
 * Los pedidos de esta obra que todavía no tienen su factura.
 *
 * Son los que están pesando como "comprometido" en el control. Se ofrecen al
 * cargar una factura para poder engancharlos: hasta acá la factura entraba por
 * Control de Obra y el pedido se quedaba comprometido para siempre, así que la
 * misma plata pesaba dos veces sobre el mismo rubro —una como invertido y otra
 * como comprometido— y el comprometido no llegaba a cero nunca.
 *
 * `facturarCompra` sí los engancha, pero solo sirve cuando la factura se carga
 * DESDE la compra. Casi nunca pasa: la factura llega a la oficina y se carga
 * donde se cargan las facturas.
 */
export async function comprasSinFacturar(obraId, leadId) {
  const vivas = ["aprobada", "comprada", "recibida"];
  const campos = "id,descripcion,estado,monto,monto_estimado,proveedor,obra_id,lead_id,obra_rubro_id,obra_actividad_id";
  const base = () => supabase.from("compras_solicitudes").select(campos)
    .is("factura_id", null).in("estado", vivas);
  // LAS DOS, Y DESPUÉS SE UNEN. Pedir las del proyecto solo cuando la obra no
  // tiene ninguna propia esconde las que se pidieron antes de que la obra
  // existiera —que son la mayoría, porque el `obra_id` recién se escribe al
  // facturar—. `solicitudesDeLaObra` decide cuál es de quién.
  const [a, b] = await Promise.all([
    obraId ? base().eq("obra_id", obraId) : Promise.resolve({ data: [] }),
    leadId ? base().eq("lead_id", leadId) : Promise.resolve({ data: [] }),
  ]);
  return solicitudesDeLaObra([...(a.data || []), ...(b.data || [])], { id: obraId, lead_id: leadId });
}

/**
 * Enganchar un pedido a una factura que ya se cargó en el control.
 *
 * Con esto el pedido deja de contarse como comprometido. Y si el pedido sabía
 * contra qué iba y la factura no tiene asignación, se le pone: lo eligió quien
 * pidió, hace semanas, y volver a preguntarlo es pedirle a quien carga la
 * factura que adivine de qué era la compra.
 */
export async function engancharFactura(solicitud, factura, quien) {
  if (!solicitud?.id || !factura?.id) return "Falta el pedido o la factura.";
  const { error } = await supabase.from("compras_solicitudes")
    .update({ factura_id: factura.id, obra_id: factura.obra_id ?? solicitud.obra_id ?? null })
    .eq("id", solicitud.id);
  if (error) return error.message;

  const { data: yaTiene } = await supabase.from("obra_asignaciones")
    .select("id").eq("factura_id", factura.id).limit(1);
  const destino = solicitud.obra_rubro_id
    ? { obra_rubro_id: solicitud.obra_rubro_id }
    : solicitud.obra_actividad_id ? { obra_actividad_id: solicitud.obra_actividad_id } : null;
  if (!yaTiene?.length && destino) {
    await supabase.from("obra_asignaciones")
      .insert({ factura_id: factura.id, ...destino, monto: Number(factura.total) || 0 });
  }
  await anotar(solicitud.id, solicitud.estado, solicitud.estado, quien,
    `Enganchada a la factura ${factura.numero_factura || `#${factura.id}`} del control de obra`);
  return null;
}
