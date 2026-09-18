import { supabase } from "../../lib/supabase";
import { GRUPOS_NOTAS } from "./notasContrato";

// Lo que acompaña a un presupuesto cuando sale, guardado en la base: el
// catálogo de notas que llena la oficina, lo predeterminado de la oficina y lo
// que eligió cada presupuesto la última vez que se exportó.
//
// Sin la migración 026 nada de esto se cae: las notas de fábrica sirven igual,
// solo que no se pueden cambiar para todos.

const CLAVE = "exportacion_presupuesto";

/** Las notas de fábrica, con ids que no chocan con los de la base. */
function deFabrica() {
  let k = 0;
  return GRUPOS_NOTAS.flatMap(g => g.notas.map((x, i) => ({ id: `fabrica-${x.id}`, grupo: g.titulo, texto: x.texto, marcada: x.marcada, orden: (i + 1) * 10, _pos: k++ })));
}

/**
 * Agrupa respetando el orden en que aparece cada grupo (el de carga) y, dentro
 * de cada uno, el orden elegido. Ordenar los grupos por nombre ponía
 * "Garantía" antes que "Precios".
 */
export function agrupar(notas) {
  const grupos = [];
  notas.forEach(x => {
    let g = grupos.find(y => y.titulo === x.grupo);
    if (!g) { g = { titulo: x.grupo, notas: [] }; grupos.push(g); }
    g.notas.push(x);
  });
  grupos.forEach(g => g.notas.sort((a, b) => (a.orden - b.orden) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true })));
  return grupos;
}

export async function leerCatalogo() {
  // También las retiradas: un presupuesto que ya la llevaba la conserva al
  // volver a exportarse. La ventana solo muestra las activas y esas.
  const { data, error } = await supabase.from("notas_presupuesto").select("*").order("id");
  if (error) return { notas: deFabrica(), sinBase: true };
  return { notas: data || [], sinBase: false };
}

/** Crea o corrige una nota del catálogo. Devuelve la nota guardada o { error }. */
export async function guardarNota(nota, usuarioId) {
  const fila = { grupo: nota.grupo || "General", texto: nota.texto, marcada: !!nota.marcada, orden: nota.orden ?? 999, actualizado_at: new Date().toISOString() };
  const r = nota.id && !String(nota.id).startsWith("fabrica-")
    ? await supabase.from("notas_presupuesto").update(fila).eq("id", nota.id).select().single()
    : await supabase.from("notas_presupuesto").insert({ ...fila, creado_por: usuarioId ?? null }).select().single();
  if (r.error) return { error: r.error.message };
  // Sin fila de vuelta la nota no quedó guardada, aunque no haya error: pasa
  // si la base no deja escribir.
  return r.data || { error: "la base no devolvió la nota guardada" };
}

/** Retirar no borra: un presupuesto ya exportado puede seguir citando esa nota. */
export async function retirarNota(id) {
  const { error } = await supabase.from("notas_presupuesto").update({ activa: false, actualizado_at: new Date().toISOString() }).eq("id", id);
  return error ? error.message : null;
}

export async function leerPredeterminados() {
  const { data, error } = await supabase.from("ajustes_oficina").select("valor").eq("clave", CLAVE).maybeSingle();
  return error ? null : data?.valor || null;
}

export async function guardarPredeterminados(valor, usuarioId) {
  const { error } = await supabase.from("ajustes_oficina").upsert({ clave: CLAVE, valor, actualizado_por: usuarioId ?? null, actualizado_at: new Date().toISOString() });
  return error ? error.message : null;
}

/** Lo elegido para este presupuesto: al volver a exportarlo sale igual. */
export async function guardarEleccion(presupuestoId, eleccion) {
  const { error } = await supabase.from("presupuestos").update({ exportacion: eleccion }).eq("id", presupuestoId);
  return error ? error.message : null;
}
