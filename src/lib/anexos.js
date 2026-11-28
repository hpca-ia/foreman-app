import { supabase } from "./supabase";

// EL ANEXO QUE EXPLICA UN GASTO (migración 201). Hernán, 28/11/2026: «pagan
// pases impersonales... ¿de quién? Esa explicación sería bueno que también la
// suban». Cuelga del gasto de caja chica, de la factura del control o de la
// compra, y se lee desde cualquiera de las tres.

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");
export const SIN_MIGRACION_ANEXOS = "Falta correr la migración 201 (anexos) en Supabase.";

/** Las condiciones `or` de PostgREST para lo que se tenga. */
function cuelgaDe({ gastoId, facturaId, solicitudIds = [] }) {
  const c = [];
  if (gastoId) c.push(`caja_gasto_id.eq.${Number(gastoId)}`);
  if (facturaId) c.push(`obra_factura_id.eq.${Number(facturaId)}`);
  const sols = solicitudIds.filter(Boolean).map(Number);
  if (sols.length) c.push(`solicitud_id.in.(${sols.join(",")})`);
  return c;
}

/**
 * Los anexos de un gasto, una factura o una compra —y de lo que está
 * enganchado a ellos: la factura de una compra trae los de la compra—.
 */
export async function anexosDe({ gastoId = null, facturaId = null, solicitudId = null }) {
  let solicitudIds = solicitudId ? [solicitudId] : [];
  if (facturaId) {
    const { data } = await supabase.from("compras_solicitudes").select("id").eq("factura_id", facturaId);
    solicitudIds = [...solicitudIds, ...(data || []).map(s => s.id)];
  }
  const c = cuelgaDe({ gastoId, facturaId, solicitudIds });
  if (!c.length) return { anexos: [] };
  const { data, error } = await supabase.from("anexos_de_gasto").select("*").or(c.join(",")).order("created_at");
  if (error) return { anexos: [], sinTabla: falta(error) };
  return { anexos: data || [] };
}

/** Cuántos anexos tiene cada gasto de caja chica: { caja_gasto_id: n }. */
export async function cuantosPorGasto(gastos = []) {
  const cuenta = {};
  const porFactura = {};
  gastos.forEach(g => { if (g.obra_factura_id) porFactura[g.obra_factura_id] = g.id; });
  const ids = gastos.map(g => g.id).filter(Boolean);
  for (let i = 0; i < ids.length; i += 150) {
    const parte = ids.slice(i, i + 150);
    const facturas = parte.map(id => gastos.find(g => g.id === id)?.obra_factura_id).filter(Boolean);
    const c = [`caja_gasto_id.in.(${parte.join(",")})`, ...(facturas.length ? [`obra_factura_id.in.(${facturas.join(",")})`] : [])];
    const { data, error } = await supabase.from("anexos_de_gasto").select("id,caja_gasto_id,obra_factura_id").or(c.join(","));
    if (error) return cuenta;
    for (const a of data || []) {
      const g = a.caja_gasto_id || porFactura[a.obra_factura_id];
      if (g) cuenta[g] = (cuenta[g] || 0) + 1;
    }
  }
  return cuenta;
}

/**
 * Agregar un anexo: un texto, un archivo, o los dos.
 *
 * @param carpeta  dónde se guarda el archivo en el depósito: la de la caja
 *   (`caja-8`), la de la obra (`obra-13`) o la de la compra (`compra-6`), para
 *   que en Ajustes → Archivos quede con lo suyo.
 */
export async function agregarAnexo({ gastoId = null, facturaId = null, solicitudId = null, carpeta, archivo = null, nota = "", quien }) {
  const texto = String(nota || "").trim();
  if (!texto && !archivo) return { error: "Escribí para qué o para quién fue, o subí el archivo." };
  if (!gastoId && !facturaId && !solicitudId) return { error: "No se sabe de qué gasto es." };
  let storage_path = null, nombre = null;
  if (archivo) {
    const limpio = archivo.name.replace(/[^\w.-]/g, "_").slice(-60);
    storage_path = `${carpeta}/anexo-${Date.now()}-${limpio}`;
    nombre = archivo.name;
    const { error } = await supabase.storage.from("task-files").upload(storage_path, archivo, { upsert: false });
    if (error) return { error: "No se pudo subir el archivo: " + error.message };
  }
  const { data, error } = await supabase.from("anexos_de_gasto").insert({
    caja_gasto_id: gastoId, obra_factura_id: facturaId, solicitud_id: solicitudId,
    nota: texto || null, storage_path, nombre,
    subido_por: quien?.id ?? null, subido_por_nombre: quien?.name || null,
  }).select().single();
  if (error) {
    if (storage_path) await supabase.storage.from("task-files").remove([storage_path]);
    return { error: falta(error) ? SIN_MIGRACION_ANEXOS : error.message };
  }
  return { anexo: data };
}

/** Quitar un anexo, con su archivo. */
export async function quitarAnexo(a) {
  const { error } = await supabase.from("anexos_de_gasto").delete().eq("id", a.id);
  if (error) return { error: error.message };
  if (a.storage_path) await supabase.storage.from("task-files").remove([a.storage_path]);
  return {};
}
