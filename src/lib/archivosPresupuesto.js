import { supabase } from "./supabase";
import { subirArchivo, abrirArchivo } from "./archivos";

// Los archivos originales de un presupuesto: el Excel con que se armó, las
// proformas de los proveedores, el PDF que mandó el cliente.
//
// Antes se leían y se descartaban. Pero lo que prueba qué se cotizó y a qué
// precio no es lo que FOREMAN entendió, es el papel que llegó; y cuando algo
// no cuadra, la única forma de saber quién se equivocó es volver al original.
//
// Viven en el depósito privado, bajo la carpeta del presupuesto, y se anotan
// en la base para saber qué es cada uno. Guardar no puede romper una
// importación: si falla, se avisa y el presupuesto entra igual.

const limpio = n => String(n || "archivo").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\- ]+/g, "_").slice(-80);

/**
 * @param tipo  "presupuesto" (el original con que se armó) | "cotizacion" | "otro"
 * @returns { archivo } o { error, faltaMigracion }
 */
export async function guardarOriginal(presupuestoId, file, tipo = "otro", usuario = null) {
  if (!presupuestoId || !file) return { error: "sin archivo" };
  const ruta = `presupuestos/${presupuestoId}/${Date.now()}-${limpio(file.name)}`;
  const { error } = await subirArchivo(ruta, file);
  if (error) return { error: error.message || String(error) };

  const fila = {
    presupuesto_id: presupuestoId, tipo, nombre: file.name, ruta, bytes: file.size,
    subido_por: usuario?.id ?? null, subido_por_nombre: usuario?.name || usuario?.nombre || null,
  };
  const { data, error: e2 } = await supabase.from("presupuesto_archivos").insert(fila).select().single();
  if (e2) {
    // El archivo ya está guardado; lo que falta es dónde anotarlo.
    return { error: e2.message, faltaMigracion: /relation|schema cache|does not exist/i.test(e2.message), ruta };
  }
  return { archivo: data };
}

export async function listarOriginales(presupuestoId) {
  const { data, error } = await supabase.from("presupuesto_archivos")
    .select("*").eq("presupuesto_id", presupuestoId).order("created_at", { ascending: false });
  if (error) return { archivos: [], faltaMigracion: /relation|schema cache|does not exist/i.test(error.message), error: error.message };
  return { archivos: data || [] };
}

export async function borrarOriginal(archivo) {
  if (archivo.ruta && !archivo.soltado_at) await supabase.storage.from("task-files").remove([archivo.ruta]);
  const { error } = await supabase.from("presupuesto_archivos").delete().eq("id", archivo.id);
  return error ? error.message : null;
}

export const abrirOriginal = archivo => abrirArchivo(archivo.ruta);
