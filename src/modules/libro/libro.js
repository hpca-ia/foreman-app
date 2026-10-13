import { supabase } from "../../lib/supabase";
import { enlacesFirmados } from "../../lib/enlacesFirmados";

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
/**
 * En qué estado está un día del libro. UNA sola respuesta, para todas las
 * pantallas.
 *
 * Existe porque cada pantalla lo decidía por su cuenta y decían cosas
 * distintas del mismo día: la lista miraba solo `estado` y mostraba "Abierto",
 * y adentro el día salía con candado porque ahí además se exigía que fuera
 * hoy. Abrir algo que la lista promete abierto y encontrarlo cerrado es de las
 * cosas que hacen desconfiar de todo lo demás.
 *
 * Y LA VERDAD ES LA DEL CANDADO: en el libro de obra solo se escribe el mismo
 * día. No es una restricción técnica, es lo que hace que el libro valga como
 * registro —uno rellenado tres semanas después no prueba nada—. Lo que
 * faltaba era NOMBRAR ese estado: un día pasado que nadie cerró no está
 * abierto, quedó SIN CERRAR, y es distinto de uno que se cerró como se debe.
 * Esa diferencia importa: un libro lleno de días sin cerrar dice que el
 * residente no está cerrando, y antes no se veía en ningún lado.
 */
export function estadoDelDia(dia, hoy = hoyEnObra()) {
  if (!dia) return { clave: "sin_abrir", etiqueta: "Sin abrir", seEscribe: false };
  if (dia.estado === "aprobado") return { clave: "aprobado", etiqueta: "Aprobado", seEscribe: false };
  if (dia.estado === "cerrado") return { clave: "cerrado", etiqueta: "Cerrado", seEscribe: false };
  if (dia.fecha === hoy) return { clave: "abierto", etiqueta: "Abierto", seEscribe: true };
  // REABIERTO: un día pasado que alguien volvió a abrir a propósito, con su
  // motivo. Se puede escribir, y se ve que se escribió después —que es la
  // mitad del asunto: un libro editable en silencio no vale como registro.
  if (dia.reabierto_at) return { clave: "reabierto", etiqueta: "Reabierto", seEscribe: true };
  return { clave: "sin_cerrar", etiqueta: "Sin cerrar", seEscribe: false };
}

/**
 * Volver a abrir un día para completarlo o corregirlo.
 *
 * El motivo NO es opcional. Sin él, una reapertura no se puede distinguir de
 * una corrección conveniente, y ahí el libro deja de servir para lo único que
 * sirve: ser la versión de los hechos que las dos partes aceptan.
 *
 * Se cuenta cuántas veces se reabrió. Una es un olvido —el residente se fue a
 * las siete sin cargar la entrega de hormigón—; cinco es que el libro no se
 * está llevando, y eso hay que poder verlo sin leer cada día.
 */
export async function reabrirDia(dia, quien, motivo) {
  const porque = String(motivo || "").trim();
  if (!porque) return "Escribí por qué se reabre: queda en el libro.";
  const { data, error } = await supabase.from("libro_obra_dias").update({
    estado: "abierto",
    reabierto_at: new Date().toISOString(),
    reabierto_por: quien?.id ?? null,
    reabierto_nombre: quien?.name || null,
    reabierto_motivo: porque.slice(0, 300),
    reaperturas: (Number(dia.reaperturas) || 0) + 1,
  }).eq("id", dia.id).select();
  if (error) {
    return falta(error) ? "Falta correr la migración 095 para poder reabrir un día." : error.message;
  }
  if (!data?.length) return "No se pudo reabrir: la base no dejó tocar ese día.";
  // Y queda escrito EN EL LIBRO, no solo en una columna. Quien lo lea seis
  // meses después tiene que encontrarlo leyendo, no auditando la base.
  await anotar(dia, "observaciones",
    `Se reabrió el día para completarlo o corregirlo: ${porque}`, quien);
  return null;
}

/** Volver a cerrarlo después de completarlo. */
export async function cerrarDia(dia) {
  const { error } = await supabase.from("libro_obra_dias")
    .update({ estado: "cerrado", cerrado_at: new Date().toISOString() }).eq("id", dia.id);
  return error ? error.message : null;
}

export async function abrirDia(leadId, fecha, quien) {
  const { data, error } = await supabase.from("libro_obra_dias")
    .select("*").eq("lead_id", leadId).eq("fecha", fecha).maybeSingle();
  if (error) return { error: falta(error) ? "sin_tablas" : error.message };
  if (data) return { dia: data };
  if (fecha !== hoyEnObra()) return { dia: null };   // se abre aparte, con motivo

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

/**
 * ABRIR UN DÍA QUE NADIE ABRIÓ, después.
 *
 * Pasa y va a seguir pasando: el residente no entró, se cortó el internet, el
 * día se fue. Hasta ahora ese día no existía en ningún lado —no se podía ver,
 * ni completar, ni explicar— y el libro quedaba con un agujero que ni
 * siquiera se veía como agujero. Es lo peor que le puede pasar a un registro:
 * un día vacío y dicho es un registro, un día ausente es una duda.
 *
 * Nace ya marcado como escrito después, con el motivo y con el nombre de quien
 * lo abrió. No es lo mismo que un día llevado en el momento y el libro no
 * puede decir que sí: ahí está la mitad del valor de todo esto.
 */
export async function abrirDiaPasado(leadId, fecha, quien, motivo) {
  const porque = String(motivo || "").trim();
  if (!porque) return { error: "Escribí por qué se abre hoy un día que ya pasó: queda en el libro." };
  const ahora = new Date().toISOString();
  const { data, error } = await supabase.from("libro_obra_dias").insert({
    lead_id: leadId, fecha, created_by: quien?.id ?? null,
    estado: "abierto",
    reabierto_at: ahora, reabierto_por: quien?.id ?? null, reabierto_nombre: quien?.name || null,
    reabierto_motivo: porque, reaperturas: 1,
  }).select().single();
  if (error) {
    // Sin la 095 no existen las columnas de reapertura: el día se abre igual
    // —que es lo que hace falta— y el motivo se deja como primera anotación.
    if (/column|schema cache/i.test(error.message)) {
      const { data: simple, error: e2 } = await supabase.from("libro_obra_dias")
        .insert({ lead_id: leadId, fecha, created_by: quien?.id ?? null, estado: "abierto" }).select().single();
      if (e2) return { error: e2.message };
      await anotar(simple, "nota", `Día abierto el ${hoyEnObra()} por ${quien?.name || "alguien"}: ${porque}`, quien);
      return { dia: simple };
    }
    return { error: error.message };
  }
  return { dia: data };
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
export async function enlacesDeFotos(archivos = []) {
  return enlacesFirmados(archivos);
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
