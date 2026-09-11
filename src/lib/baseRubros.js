import { supabase } from "./supabase";

// Todo presupuesto que entra a FOREMAN —para cotizar, para controlar una obra,
// o subido a propósito— alimenta la base de rubros. Cada aparición de un rubro
// deja su precio en el historial con cliente y fecha, que es lo que después
// permite cotizar mirando lo que de verdad costó y no lo que uno recuerda.
//
// La versión anterior hacía una consulta por rubro: 164 viajes a la base para
// un presupuesto mediano. Acá se lee todo una vez y se escribe en lote.

const norm = s => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * @param rubros  [{ descripcion, unidad, precio_unitario, capitulo }]
 * @param origen  { cliente, proyecto, fecha }  de dónde viene este precio
 * @returns { capitulosNuevos, rubrosNuevos, historial, error }
 */
export async function alimentarBase(rubros = [], origen = {}) {
  const utiles = rubros.filter(r => r?.descripcion && Number(r.precio_unitario) > 0);
  if (!utiles.length) return { capitulosNuevos: 0, rubrosNuevos: 0, historial: 0 };

  const fecha = origen.fecha || new Date().toISOString().split("T")[0];
  const cliente = origen.cliente || "";
  const proyecto = origen.proyecto || "";

  const [{ data: capsDB }, { data: rubrosDB }] = await Promise.all([
    supabase.from("capitulos").select("id,nombre"),
    supabase.from("rubros").select("id,descripcion"),
  ]);

  const capPorNombre = new Map((capsDB || []).map(c => [norm(c.nombre), c.id]));
  const rubroPorDesc = new Map((rubrosDB || []).map(r => [norm(r.descripcion), r.id]));

  // ── Capítulos que no existían ──
  const capsNuevos = [...new Set(utiles.map(r => r.capitulo).filter(Boolean))]
    .filter(c => !capPorNombre.has(norm(c)));
  if (capsNuevos.length) {
    const base = (capsDB || []).length;
    const { data } = await supabase.from("capitulos")
      .insert(capsNuevos.map((nombre, i) => ({ nombre, orden: base + i + 1 })))
      .select("id,nombre");
    (data || []).forEach(c => capPorNombre.set(norm(c.nombre), c.id));
  }

  // ── Rubros que no existían. Un mismo presupuesto puede repetir una
  //    descripción, así que se deduplica antes de insertar. ──
  const porInsertar = new Map();
  utiles.forEach(r => {
    const k = norm(r.descripcion);
    if (rubroPorDesc.has(k) || porInsertar.has(k)) return;
    porInsertar.set(k, {
      capitulo_id: capPorNombre.get(norm(r.capitulo)) ?? null,
      descripcion: String(r.descripcion).trim(),
      unidad: r.unidad || "",
      precio_referencia: Number(r.precio_unitario),
      activo: true,
    });
  });
  let rubrosNuevos = 0;
  const filas = [...porInsertar.values()];
  for (let i = 0; i < filas.length; i += 100) {
    const { data, error } = await supabase.from("rubros").insert(filas.slice(i, i + 100)).select("id,descripcion");
    if (error) return { capitulosNuevos: capsNuevos.length, rubrosNuevos, historial: 0, error: error.message };
    (data || []).forEach(r => { rubroPorDesc.set(norm(r.descripcion), r.id); rubrosNuevos++; });
  }

  // ── Historial de precios: una fila por aparición, siempre ──
  const hist = utiles
    .map(r => ({
      rubro_id: rubroPorDesc.get(norm(r.descripcion)),
      cliente_nombre: cliente,
      precio_unitario: Number(r.precio_unitario),
      proyecto_ref: proyecto,
      fecha,
    }))
    .filter(h => h.rubro_id);
  let historial = 0;
  for (let i = 0; i < hist.length; i += 200) {
    const { error } = await supabase.from("precios_historial").insert(hist.slice(i, i + 200));
    if (!error) historial += hist.slice(i, i + 200).length;
  }

  return { capitulosNuevos: capsNuevos.length, rubrosNuevos, historial };
}

export function resumenAlimentacion(r) {
  if (!r) return "";
  if (r.error) return "La base de rubros no se pudo alimentar: " + r.error;
  const partes = [];
  if (r.rubrosNuevos) partes.push(`${r.rubrosNuevos} rubros nuevos`);
  if (r.capitulosNuevos) partes.push(`${r.capitulosNuevos} capítulos nuevos`);
  if (r.historial) partes.push(`${r.historial} precios al historial`);
  return partes.length ? "Base de rubros: " + partes.join(" · ") : "";
}
