import { supabase } from "../../lib/supabase";
import { dueno, filaDe } from "./dueno";
import { fotoDe } from "./compararVersion";

// Guardar y leer las fotos del cronograma.
//
// La cuenta —qué cambió entre una foto y hoy— vive en `compararVersion.js`,
// que no habla con nadie y por eso se puede probar. Acá solo está el ir y
// venir con la base.

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

/**
 * Guardar el cronograma de hoy como una versión.
 *
 * EL MOTIVO IMPORTA MÁS QUE LA FECHA. "Antes de la orden de cambio 3" o "lo que
 * se firmó con el cliente" convierte una lista de fechas en una historia; sin
 * él, dentro de tres meses son seis versiones indistinguibles y nadie sabe cuál
 * mirar.
 */
export async function guardarVersion({ lead, obra, actividades, dependencias, plan, motivo, lineaBase, quien }) {
  const foto = fotoDe(actividades, dependencias);
  const fin = actividades.reduce((m, a) => (String(a.fin || "") > m ? String(a.fin).slice(0, 10) : m), "");
  const fila = {
    ...filaDe(lead), obra_id: obra?.id || lead.obra_id || null,
    nombre: new Date().toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" }),
    motivo: String(motivo || "").trim().slice(0, 300) || null,
    es_linea_base: !!lineaBase,
    foto, dias: plan?.duracion ?? null, fin: fin || null,
    creado_por: quien?.id ?? null, creado_nombre: quien?.name || null,
  };
  let { data, error } = await supabase.from("cronograma_versiones").insert(fila).select().single();
  // Ya hay una línea base: la nueva entra como versión normal en vez de
  // fallar. Dos líneas base harían que "atrasado" deje de querer decir algo.
  if (error && /crono_una_linea_base|duplicate key/i.test(error.message)) {
    ({ data, error } = await supabase.from("cronograma_versiones")
      .insert({ ...fila, es_linea_base: false }).select().single());
    if (!error) return { version: data, avisoLineaBase: true };
  }
  if (error) return { error: falta(error) ? "Falta correr la migración 099." : error.message };
  return { version: data };
}

/** Las versiones guardadas, de la más nueva a la más vieja. */
export async function versionesDe(leadId) {
  const d = dueno(leadId);
  if (!d?.id) return [];
  const { data } = await supabase.from("cronograma_versiones")
    .select("id,nombre,motivo,es_linea_base,dias,fin,creado_nombre,created_at")
    .eq(d.campo, d.id).order("created_at", { ascending: false });
  return data || [];
}

/** La foto de una versión, que es grande y por eso se pide solo al abrirla. */
export async function fotoDeVersion(id) {
  const { data } = await supabase.from("cronograma_versiones").select("foto").eq("id", id).maybeSingle();
  return data?.foto || null;
}

export async function borrarVersion(id) {
  const { error } = await supabase.from("cronograma_versiones").delete().eq("id", id);
  return error ? error.message : null;
}
