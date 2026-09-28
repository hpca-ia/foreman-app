import { supabase } from "../../lib/supabase";

// El libro del día: lo que pasó en la obra, escrito el día que pasó.
//
// Un libro por proyecto y por día. Está abierto mientras es hoy —el residente
// entra y sale, agrega lo que va pasando— y al día siguiente queda cerrado
// solo: no hay reloj que disparar ni botón que acordarse de apretar, y la base
// no acepta escribir en el libro de ayer.
//
// El avance de obra no se escribe acá: se lee de Control de Obra, que es el
// único que lo sabe, y al cerrar el día queda la foto de cómo estaba.

export const CATEGORIAS = [
  { id: "personal",      label: "Personal en obra",   pista: "Cuántos y de qué: 8 albañiles, 2 electricistas…" },
  { id: "actividades",   label: "Actividades",        pista: "Qué se ejecutó hoy" },
  { id: "materiales",    label: "Materiales",         pista: "Qué llegó, cuánto y de quién" },
  { id: "equipo",        label: "Equipo y maquinaria", pista: "Qué hay en sitio: andamios, concretera…" },
  { id: "novedades",     label: "Novedades",          pista: "Lo que se salió de lo previsto" },
  { id: "decisiones",    label: "Decisiones",         pista: "Quién decidió qué, y por qué" },
  { id: "seguridad",     label: "Seguridad",          pista: "Incidentes, casi-accidentes, lo que se corrigió" },
  { id: "observaciones", label: "Observaciones",      pista: "Lo demás que valga la pena dejar escrito" },
];

export const CLIMAS = ["Despejado", "Nublado", "Llovizna", "Lluvia", "Lluvia fuerte"];

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

/** Hoy en Quito, que es donde está la obra y no donde está el servidor. */
export function hoyEnObra() {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date());
}

/** El libro de un día: si es hoy y no existe, se abre solo al entrar. */
export async function abrirDia(leadId, fecha, quien) {
  const { data, error } = await supabase.from("libro_obra_dias")
    .select("*").eq("lead_id", leadId).eq("fecha", fecha).maybeSingle();
  if (error) return { error: falta(error) ? "sin_tablas" : error.message };
  if (data) return { dia: data };
  if (fecha !== hoyEnObra()) return { dia: null };   // un día pasado sin libro: no se inventa

  const { data: creado, error: e2 } = await supabase.from("libro_obra_dias")
    .insert({ lead_id: leadId, fecha, created_by: quien?.id ?? null }).select().single();
  if (e2) {
    // Dos personas entrando a la vez: el único por proyecto y día lo impide, y
    // el que perdió la carrera se queda con el libro que abrió el otro.
    const { data: yaEsta } = await supabase.from("libro_obra_dias")
      .select("*").eq("lead_id", leadId).eq("fecha", fecha).maybeSingle();
    return yaEsta ? { dia: yaEsta } : { error: e2.message };
  }
  return { dia: creado };
}

export async function diasDe(leadId, cuantos = 30) {
  const { data, error } = await supabase.from("libro_obra_dias")
    .select("*").eq("lead_id", leadId).order("fecha", { ascending: false }).limit(cuantos);
  if (error) return { dias: [], sinTablas: falta(error) };
  return { dias: data || [], sinTablas: false };
}

export async function contenidoDe(diaId) {
  const [{ data: entradas }, { data: fotos }] = await Promise.all([
    supabase.from("libro_obra_entradas").select("*").eq("dia_id", diaId).order("created_at"),
    supabase.from("libro_obra_fotos").select("*").eq("dia_id", diaId).order("created_at"),
  ]);
  return { entradas: entradas || [], fotos: fotos || [] };
}

export async function anotar(dia, categoria, contenido, quien) {
  const texto = String(contenido || "").trim();
  if (!texto) return { error: "Escribí qué pasó." };
  const { data, error } = await supabase.from("libro_obra_entradas").insert({
    dia_id: dia.id, categoria, contenido: texto,
    autor_id: quien?.id ?? null, autor_nombre: quien?.name || null,
  }).select().single();
  if (error) return { error: /cerrado/i.test(error.message) ? "El libro de ese día ya está cerrado." : error.message };
  return { entrada: data };
}

export async function borrarEntrada(id) {
  const { error } = await supabase.from("libro_obra_entradas").delete().eq("id", id);
  return error ? error.message : null;
}

export async function guardarClima(diaId, clima) {
  const { error } = await supabase.from("libro_obra_dias").update({ clima }).eq("id", diaId);
  return error ? error.message : null;
}

/** La foto va al depósito privado y su ruta al libro. */
export async function subirFoto(dia, archivo, descripcion, quien) {
  const limpio = archivo.name.replace(/[^\w.\-]/g, "_").slice(-60);
  const ruta = `libro-${dia.id}/${Date.now()}-${limpio}`;
  const { error } = await supabase.storage.from("task-files").upload(ruta, archivo, { upsert: false });
  if (error) return { error: error.message };
  const { data, error: e2 } = await supabase.from("libro_obra_fotos").insert({
    dia_id: dia.id, storage_path: ruta, descripcion: descripcion?.trim() || null,
    autor_id: quien?.id ?? null, autor_nombre: quien?.name || null,
  }).select().single();
  return e2 ? { error: e2.message } : { foto: data };
}

export async function borrarFoto(foto) {
  await supabase.storage.from("task-files").remove([foto.storage_path]);
  const { error } = await supabase.from("libro_obra_fotos").delete().eq("id", foto.id);
  return error ? error.message : null;
}

/** Enlaces temporales para mirar las fotos, que el depósito es privado. */
export async function enlacesDeFotos(fotos = []) {
  if (!fotos.length) return {};
  const { data } = await supabase.storage.from("task-files")
    .createSignedUrls(fotos.map(f => f.storage_path), 3600);
  const mapa = {};
  (data || []).forEach((x, i) => { if (x?.signedUrl) mapa[fotos[i].id] = x.signedUrl; });
  return mapa;
}

/**
 * Cómo va la obra hoy, leído de Control de Obra.
 *
 * El libro no calcula avance ni lo guarda dos veces: lo lee de donde vive y,
 * al cerrar el día, deja la foto de cómo estaba. Si el proyecto todavía no
 * tiene obra activa, no hay nada que mostrar y tampoco pasa nada.
 */
export async function avanceDeLaObra(leadId) {
  const { data: obras } = await supabase.from("obras").select("id,nombre").eq("lead_id", leadId).limit(1);
  const obra = obras?.[0];
  if (!obra) return null;

  const [{ data: rubros }, { data: facturas }] = await Promise.all([
    supabase.from("obra_rubros").select("id,capitulo,total_base").eq("obra_id", obra.id),
    supabase.from("obra_facturas").select("id").eq("obra_id", obra.id),
  ]);
  if (!rubros?.length) return { obra: obra.nombre, capitulos: [], base: 0, invertido: 0 };

  const ids = (facturas || []).map(f => f.id);
  let asignaciones = [];
  if (ids.length) {
    const { data } = await supabase.from("obra_asignaciones").select("obra_rubro_id,monto").in("factura_id", ids);
    asignaciones = data || [];
  }
  const gastadoPorRubro = {};
  asignaciones.forEach(a => { gastadoPorRubro[a.obra_rubro_id] = (gastadoPorRubro[a.obra_rubro_id] || 0) + Number(a.monto || 0); });

  const porCapitulo = {};
  rubros.forEach(r => {
    const c = (porCapitulo[r.capitulo || "Sin capítulo"] ||= { capitulo: r.capitulo || "Sin capítulo", base: 0, invertido: 0 });
    c.base += Number(r.total_base || 0);
    c.invertido += gastadoPorRubro[r.id] || 0;
  });
  const capitulos = Object.values(porCapitulo).sort((a, b) => b.base - a.base);
  return {
    obra: obra.nombre,
    capitulos,
    base: capitulos.reduce((s, c) => s + c.base, 0),
    invertido: capitulos.reduce((s, c) => s + c.invertido, 0),
  };
}
