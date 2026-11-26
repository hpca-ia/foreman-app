import { supabase } from "../../lib/supabase";
import { CONTRATO, textoDeNova } from "../../lib/modelos";
import { PEDIDO_DE_LECTURA, pedidoDeEmparejarPaquetes, jsonDeLaRespuesta, cotizacionDeLaLectura } from "./emparejarCotizacion.js";

// LAS COTIZACIONES DE UN PRESUPUESTO, GUARDADAS PARA COMPARARLAS.
//
// Cada cotización que se sube a la matriz queda acá sin entrar al presupuesto
// (migración 194): lo que cotizó la empresa con sus palabras, qué rubros del
// presupuesto cubre cada renglón y cuáles se le adjudicaron. La cuenta está en
// matrizDeCotizaciones.js; acá solo se lee el papel y se guarda.

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");
export const SIN_194 = "Para comparar cotizaciones falta correr la migración 194 en Supabase.";

/** @returns { cotizaciones } o { error, sinTabla } */
export async function cotizacionesDe(presupuestoId) {
  if (!presupuestoId) return { cotizaciones: [] };
  const { data, error } = await supabase.from("presupuesto_cotizaciones")
    .select("*").eq("presupuesto_id", presupuestoId).order("created_at").order("id");
  if (error) return { cotizaciones: [], sinTabla: falta(error), error: falta(error) ? SIN_194 : error.message };
  return { cotizaciones: data || [] };
}

export async function guardarCotizacion({ presupuestoId, proveedor, archivoId = null, renglones = [], totales = null, quien = null }) {
  const { data, error } = await supabase.from("presupuesto_cotizaciones").insert({
    presupuesto_id: presupuestoId, proveedor: proveedor || "", archivo_id: archivoId,
    renglones, totales, creado_por: quien?.id ?? null, creado_nombre: quien?.name || null,
  }).select().single();
  if (error) return { error: falta(error) ? SIN_194 : error.message };
  return { cotizacion: data };
}

/** Cambiar algo de una cotización: su nombre, a qué rubros va cada renglón, o lo que se le adjudicó. */
export async function actualizarCotizacion(id, campos) {
  const { error } = await supabase.from("presupuesto_cotizaciones")
    .update({ ...campos, updated_at: new Date().toISOString() }).eq("id", id);
  return error ? (falta(error) ? SIN_194 : error.message) : null;
}

export async function borrarCotizacion(id) {
  const { error } = await supabase.from("presupuesto_cotizaciones").delete().eq("id", id);
  return error ? error.message : null;
}

/** El archivo, como se le manda a NOVA: imagen, PDF, o la planilla pasada a texto. */
async function comoMensaje(file, pedido) {
  const enBase64 = () => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(file);
  });
  if ((file.type || "").startsWith("image/")) {
    return [{ type: "image", source: { type: "base64", media_type: file.type, data: await enBase64() } }, { type: "text", text: pedido }];
  }
  if (file.type === "application/pdf") {
    return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: await enBase64() } }, { type: "text", text: pedido }];
  }
  if (/\.(xlsx|xls|csv)$/i.test(file.name || "")) {
    const XLSX = await import("xlsx");
    const libro = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const texto = libro.SheetNames.map(h => XLSX.utils.sheet_to_csv(libro.Sheets[h])).join("\n");
    return [{ type: "text", text: `Excel:\n\n${texto.slice(0, 15000)}\n\n${pedido}` }];
  }
  const texto = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(file); });
  return [{ type: "text", text: `Archivo:\n\n${texto.slice(0, 8000)}\n\n${pedido}` }];
}

/**
 * NOVA lee la cotización y dice qué rubros del presupuesto cubre cada renglón.
 *
 * @param base  la de rubrosDeLaBase(): los rubros del presupuesto, numerados
 * @returns { proveedor, renglones, totales } o { error }
 */
export async function leerCotizacionDeArchivo(file, base = []) {
  try {
    const content = await comoMensaje(file, PEDIDO_DE_LECTURA + pedidoDeEmparejarPaquetes(base));
    const res = await fetch("/api/nova", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: CONTRATO, max_tokens: 16000, messages: [{ role: "user", content }] }),
    });
    const data = await res.json().catch(() => null);
    if (!data) return { error: res.status === 413 ? "El archivo pesa demasiado para mandarlo. Probá con menos páginas o con una foto."
      : `El servidor se cortó leyendo el archivo (${res.status}).` };
    if (data.error) return { error: "NOVA no pudo leerla: " + (data.error?.message || JSON.stringify(data.error)) };
    const leido = jsonDeLaRespuesta(textoDeNova(data));
    if (!leido?.rubros?.length) return { error: "NOVA no encontró rubros en ese archivo. Probá con una imagen más clara o con el PDF original." };
    const cot = cotizacionDeLaLectura(leido, base);
    if (!cot.renglones.length) return { error: "NOVA no encontró rubros en ese archivo." };
    return cot;
  } catch (e) {
    return { error: "No se pudo leer la cotización: " + (e?.message || e) };
  }
}
