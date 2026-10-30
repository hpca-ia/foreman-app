import { supabase } from "../../lib/supabase";
import { enlacesFirmados } from "../../lib/enlacesFirmados";
// Las cuentas viven aparte: son lo único de este archivo que se puede probar
// sin un navegador, y son las que deciden qué se le cobra al cliente.
export { DECISIONES, comoVa } from "./cuentaDiferencias.js";

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
export async function guardarAnalisis({ obraId, titulo, proveedor, archivo, items, iva, lineas, quien }) {
  let ruta = null, nombre = null;
  if (archivo) {
    const limpio = String(archivo.name || "propuesta").replace(/[^\w.-]+/g, "_").slice(-60);
    ruta = `obra-${obraId}/analisis/${Date.now()}-${limpio}`;
    const { error } = await supabase.storage.from(BUCKET).upload(ruta, archivo, { upsert: false });
    if (error) return { error: `No se pudo subir el archivo: ${error.message}` };
    nombre = archivo.name || limpio;
  }
  const { data, error } = await supabase.from("obra_analisis").insert({
    obra_id: obraId, titulo: titulo || null, proveedor: proveedor || null,
    archivo_path: ruta, archivo_nombre: nombre,
    items: items || [], iva: Number(iva) || 0,
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
    orden: i,
  }));
  if (filas.length) {
    const { error: e2 } = await supabase.from("obra_analisis_lineas").insert(filas);
    if (e2) return { error: falta(e2) ? SIN_145 : e2.message, analisis: data };
  }
  return { analisis: data };
}

/** La decisión de una diferencia, con quién la tomó: eso es lo que vale después. */
export async function decidir(lineaId, decision, nota, quien) {
  const { error } = await supabase.from("obra_analisis_lineas").update({
    decision, nota: nota || null,
    decidido_por: quien?.id ?? null, decidido_nombre: quien?.name || null,
    decidido_at: new Date().toISOString(),
  }).eq("id", lineaId);
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
  const { error } = await supabase.from("obra_analisis").delete().eq("id", a.id);
  return error ? error.message : null;
}

/** Los enlaces a los papeles guardados, firmados de antemano. */
export async function enlacesDeAnalisis(lista = []) {
  const conPapel = lista.filter(a => a?.archivo_path).map(a => ({ id: a.id, storage_path: a.archivo_path }));
  if (!conPapel.length) return {};
  return enlacesFirmados(conPapel, BUCKET);
}
