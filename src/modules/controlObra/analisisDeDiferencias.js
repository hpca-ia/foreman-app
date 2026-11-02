import { supabase } from "../../lib/supabase";
import { enlacesFirmados } from "../../lib/enlacesFirmados";
// Las cuentas viven aparte: son lo único de este archivo que se puede probar
// sin un navegador, y son las que deciden qué se le cobra al cliente.
export { DECISIONES, decisionesPara, comoVa, recalcularContra, queSaleDe } from "./cuentaDiferencias.js";

// EL ANÁLISIS DE DIFERENCIAS, GUARDADO.
//
// Comparar una propuesta nueva contra el presupuesto no es un cálculo: es una
// conversación. Cada diferencia hay que mirarla, discutirla con el residente o
// con el cliente, y algunas se van a caer —"eso ya estaba incluido", "esa
// cantidad la medimos mal nosotros"—. Eso lleva días, y todo vivía en la
// pantalla: salir del módulo y volver borraba la lectura entera.
//
// Nadie va a discutir un adicional de quince mil dólares contra algo que se
// pierde al cambiar de pestaña.

const BUCKET = "task-files";
const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");
export const SIN_145 = "Falta correr la migración 145 para guardar el análisis de diferencias.";

export async function analisisDe(obraId) {
  const { data, error } = await supabase.from("obra_analisis")
    .select("*").eq("obra_id", obraId).order("created_at", { ascending: false });
  if (error) return { analisis: [], error: falta(error) ? SIN_145 : error.message };
  return { analisis: data || [] };
}

export async function lineasDe(analisisId) {
  const { data, error } = await supabase.from("obra_analisis_lineas")
    .select("*").eq("analisis_id", analisisId).order("orden");
  if (error) return { lineas: [], error: falta(error) ? SIN_145 : error.message };
  return { lineas: data || [] };
}

/**
 * Guardar una lectura nueva, con el papel y lo que NOVA leyó.
 *
 * El archivo se guarda tal como llegó: lo que se discute con el proveedor es su
 * papel, no nuestra lectura de su papel.
 */
export async function guardarAnalisis({ obraId, titulo, proveedor, archivo, items, iva, descuento, lineas, quien,
  modo = "contrato", b = null, fecha = null, totales = null }) {
  let ruta = null, nombre = null;
  if (archivo) {
    const limpio = String(archivo.name || "propuesta").replace(/[^\w.-]+/g, "_").slice(-60);
    ruta = `obra-${obraId}/analisis/${Date.now()}-${limpio}`;
    const { error } = await supabase.storage.from(BUCKET).upload(ruta, archivo, { upsert: false });
    if (error) return { error: `No se pudo subir el archivo: ${error.message}` };
    nombre = archivo.name || limpio;
  }
  // La segunda cotización, cuando se comparan dos papeles entre sí.
  let rutaB = null, nombreB = null;
  if (b?.archivo) {
    const limpioB = String(b.archivo.name || "propuesta-b").replace(/[^\w.-]+/g, "_").slice(-60);
    rutaB = `obra-${obraId}/analisis/${Date.now()}-b-${limpioB}`;
    const { error } = await supabase.storage.from(BUCKET).upload(rutaB, b.archivo, { upsert: false });
    if (error) return { error: `No se pudo subir la segunda cotización: ${error.message}` };
    nombreB = b.archivo.name || limpioB;
  }

  const { data, error } = await supabase.from("obra_analisis").insert({
    obra_id: obraId, titulo: titulo || null, proveedor: proveedor || null,
    archivo_path: ruta, archivo_nombre: nombre,
    items: items || [], iva: Number(iva) || 0,
    // El descuento ofrecido al pie, entero: es lo que hay que acordarse de
    // pedir cuando llegue la factura.
    descuento: Number(descuento) || 0,
    modo,
    fecha_cotizacion: fecha || null, fecha_cotizacion_b: b?.fecha || null,
    // El pie del papel, tal como está escrito: es contra esto que se comprueba
    // la lectura, y sin él no hay con qué contrastarla.
    totales: totales || null, totales_b: b?.totales || null,
    items_b: b?.items || null, proveedor_b: b?.proveedor || null,
    descuento_b: Number(b?.descuento) || 0,
    archivo_b_path: rutaB, archivo_b_nombre: nombreB,
    creado_por: quien?.id ?? null, creado_nombre: quien?.name || null,
  }).select().single();
  if (error) {
    if (ruta) await supabase.storage.from(BUCKET).remove([ruta]);
    return { error: falta(error) ? SIN_145 : error.message };
  }

  const filas = (lineas || []).map((l, i) => ({
    analisis_id: data.id,
    descripcion: String(l.descripcion || "").slice(0, 300),
    unidad: l.unidad || null,
    cantidad: Number(l.cantidad) || 0,
    monto: Number(l.monto) || 0,
    obra_rubro_id: l.obra_rubro_id || null,
    hallazgo: l.hallazgo || null,
    // El renglón del papel, para poder ver la cotización contra el presupuesto
    // sin abrir el PDF.
    texto_papel: l.textoPapel || null,
    unidad_papel: l.unidadPapel || null,
    cantidad_papel: l.cantidadPapel ?? null,
    monto_papel: l.montoPapel ?? null,
    orden: i,
  }));
  if (filas.length) {
    let { error: e2 } = await supabase.from("obra_analisis_lineas").insert(filas);
    // Sin la 155 el análisis entra igual, sin el texto del papel: vale más
    // guardarlo que frenarlo por una columna nueva.
    if (e2 && /texto_papel|unidad_papel|cantidad_papel|monto_papel|column|schema cache/i.test(e2.message)) {
      const sinPapel = filas.map(({ texto_papel, unidad_papel, cantidad_papel, monto_papel, ...r }) => r);
      ({ error: e2 } = await supabase.from("obra_analisis_lineas").insert(sinPapel));
    }
    if (e2) return { error: falta(e2) ? SIN_145 : e2.message, analisis: data };
  }
  return { analisis: data };
}

/** La decisión de una diferencia, con quién la tomó: eso es lo que vale después. */
export async function decidir(lineaId, decision, nota, quien) {
  const campos = {
    decision,
    decidido_por: quien?.id ?? null, decidido_nombre: quien?.name || null,
    decidido_at: new Date().toISOString(),
    // DECIDIR ES HABER REVISADO. Marcar la decisión y que el renglón siguiera
    // apareciendo como "sin mirar" obligaba a hacer dos clics para decir una
    // sola cosa, y el que hace dos clics por renglón deja de hacerlos en el
    // quince.
    revisado_at: new Date().toISOString(),
    revisado_por: quien?.id ?? null, revisado_nombre: quien?.name || null,
  };
  // La nota solo se pisa cuando viene una: decidir no puede borrar lo que
  // alguien escribió sobre ese renglón.
  if (nota !== undefined && nota !== null) campos.nota = nota || null;
  let { error } = await supabase.from("obra_analisis_lineas").update(campos).eq("id", lineaId);
  if (error && /revisado|column|schema cache/i.test(error.message)) {
    const { revisado_at, revisado_por, revisado_nombre, ...viejos } = campos;
    ({ error } = await supabase.from("obra_analisis_lineas").update(viejos).eq("id", lineaId));
  }
  return error ? error.message : null;
}

/**
 * YA LA MIRÉ, AUNQUE TODAVÍA NO LA DECIDA.
 *
 * Revisar y decidir son dos cosas distintas. Hay renglones que uno mira,
 * entiende, y deja pendientes a propósito —"esto lo hablo con Jorge el lunes"—
 * y en la pantalla se veían igual que los que nadie abrió todavía. Al volver al
 * día siguiente no había forma de saber dónde se había quedado, así que se
 * empezaba de nuevo desde arriba: por eso los últimos renglones de una lista
 * larga no los revisaba nunca nadie.
 */
export async function marcarRevisada(lineaId, revisada, quien) {
  const { error } = await supabase.from("obra_analisis_lineas").update({
    revisado_at: revisada ? new Date().toISOString() : null,
    revisado_por: revisada ? (quien?.id ?? null) : null,
    revisado_nombre: revisada ? (quien?.name || null) : null,
  }).eq("id", lineaId);
  return error ? (/revisado|column|schema cache/i.test(error.message)
    ? "Falta correr la migración 153 para poder marcar lo revisado." : error.message) : null;
}

/**
 * CONTRA QUÉ RUBRO SE COMPARA ESTA DIFERENCIA.
 *
 * NOVA empareja por descripción y acierta casi siempre, pero "pintura de
 * fibrocemento" puede calzar con tres rubros parecidos y elegir el que no es.
 * Cuando pasa, todo lo que sigue sale mal: la cantidad contratada, el precio
 * contra el que se compara y la decisión de si ya estaba incluido.
 *
 * Y es la herramienta que faltaba para decir "esto ya estaba": no alcanza con
 * marcarlo, hay que poder señalar EN CUÁL rubro estaba, que es lo que el
 * proveedor va a pedir cuando vuelva a reclamarlo.
 */
export async function reEmparejar(lineaId, rubroId, recalculado = null) {
  // AL CAMBIAR EL RUBRO CAMBIA LO QUE EL RENGLÓN ES: un trabajo "nuevo" al que
  // se le señala su rubro pasa a ser el mismo trabajo a otro precio o con otra
  // cantidad, y lo que se cobra —o lo que queda a favor— es la diferencia, no
  // el monto entero. Sin rehacer la cuenta, la tarjeta sigue diciendo "no está
  // en el contrato" al lado del rubro que lo contiene.
  const campos = { obra_rubro_id: rubroId || null };
  if (recalculado) {
    campos.hallazgo = recalculado.hallazgo;
    campos.cantidad = recalculado.cantidad;
    campos.monto = recalculado.monto;
  }
  const { error } = await supabase.from("obra_analisis_lineas").update(campos).eq("id", lineaId);
  return error ? error.message : null;
}

/**
 * EL PRECIO QUE SE LE VA A COBRAR AL CLIENTE POR ESTA DIFERENCIA.
 *
 * Solo para lo que NO tiene precio en el contrato: si el rubro ya está
 * contratado, manda el precio que el cliente firmó y no hay nada que elegir.
 *
 * Puede ser un número puesto a mano o el precio de un rubro parecido que ya
 * está en el contrato —que es lo que se hace en obra—: si el cliente aceptó $12
 * el metro de resane, el resane del otro ambiente va a $12, y la orden se
 * defiende sola porque ese precio ya lo había aceptado. Por eso se guarda de
 * qué rubro salió: "este precio es el del rubro 4.12, que usted ya aprobó" es
 * una frase que cierra una discusión.
 */
export async function ponerPrecio(lineaId, precio, deRubro = null) {
  const { error } = await supabase.from("obra_analisis_lineas").update({
    precio_unitario: Number(precio) > 0 ? Number(precio) : null,
    precio_de_rubro: deRubro || null,
  }).eq("id", lineaId);
  return error ? (/precio_unitario|precio_de_rubro|column|schema cache/i.test(error.message)
    ? "Falta correr la migración 158 para poder ponerle precio a una diferencia." : error.message) : null;
}

/**
 * ESTOS RENGLONES YA SALIERON EN UNA ORDEN.
 *
 * Es lo único que hacía falta para no mandar dos veces lo mismo, y es mucho
 * menos que cerrar el análisis entero: los que no salieron siguen vivos, se
 * siguen decidiendo y arman la orden siguiente.
 */
export async function marcarEnOrden(ids = [], ordenId) {
  if (!ids.length) return null;
  const { error } = await supabase.from("obra_analisis_lineas")
    .update({ orden_cambio_id: ordenId }).in("id", ids);
  return error ? (/orden_cambio_id|column|schema cache/i.test(error.message)
    ? "Falta correr la migración 159 para armar la orden por partes." : error.message) : null;
}

/** Lo que se anotó sobre un renglón, que se puede escribir en cualquier momento. */
export async function anotar(lineaId, nota) {
  const { error } = await supabase.from("obra_analisis_lineas")
    .update({ nota: String(nota || "").trim() || null }).eq("id", lineaId);
  return error ? error.message : null;
}

export async function emparejarCon(lineaId, obraRubroId) {
  const { error } = await supabase.from("obra_analisis_lineas")
    .update({ obra_rubro_id: obraRubroId || null }).eq("id", lineaId);
  return error ? error.message : null;
}

export async function cerrarAnalisis(id, ordenCambioId = null) {
  const { error } = await supabase.from("obra_analisis").update({
    estado: "resuelto", orden_cambio_id: ordenCambioId, updated_at: new Date().toISOString(),
  }).eq("id", id);
  return error ? error.message : null;
}

export async function borrarAnalisis(a) {
  if (a.archivo_path) await supabase.storage.from(BUCKET).remove([a.archivo_path]);
  // LO QUE ESTE ANÁLISIS DEJÓ EN BENEFICIOS SE VA CON ÉL.
  //
  // Sus eficiencias y su descuento viven en obra_beneficios con la marca del
  // análisis, y al borrarlo quedaban ahí sumando para siempre: un beneficio
  // huérfano, sin papel que lo sostenga, que nadie puede ir a verificar y que
  // nadie sabe de dónde salió. Peor que no tenerlo.
  await supabase.from("obra_beneficios").delete()
    .eq("obra_id", a.obra_id).like("nota", `%[dif:${a.id}]%`);
  const { error } = await supabase.from("obra_analisis").delete().eq("id", a.id);
  return error ? error.message : null;
}

/** Los enlaces a los papeles guardados, firmados de antemano. */
export async function enlacesDeAnalisis(lista = []) {
  const conPapel = lista.filter(a => a?.archivo_path).map(a => ({ id: a.id, storage_path: a.archivo_path }));
  if (!conPapel.length) return {};
  return enlacesFirmados(conPapel, BUCKET);
}
