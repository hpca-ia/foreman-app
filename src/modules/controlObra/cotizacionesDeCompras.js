import { supabase } from "../../lib/supabase";

// LAS COTIZACIONES QUE YA ESTÁN EN COMPRAS, PARA LEERLAS EN DIFERENCIAS.
//
// Un pedido de compra nace con su cotización adjunta: el papel ya está en
// FOREMAN. Para compararlo contra el presupuesto había que bajarlo del pedido a
// la computadora y volver a subirlo en Diferencias, que es el mismo archivo
// yendo y viniendo —y en el teléfono, directamente no se hacía—.
//
// Acá se listan las cotizaciones de los pedidos de la obra y se baja la que se
// elija como un archivo igual al que alguien subiría a mano: lo que sigue —la
// lectura, el emparejamiento, la comparación— no sabe de dónde vino.

const BUCKET = "task-files";

// Por si el nombre guardado no trae extensión: el lector decide cómo leer por
// el tipo del archivo, y un PDF sin ".pdf" ni tipo se leería como texto.
const TIPOS = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  heic: "image/heic", gif: "image/gif", csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12", xls: "application/vnd.ms-excel",
};
const extension = s => (/\.([a-z0-9]{2,5})$/i.exec(String(s || "")) || [])[1]?.toLowerCase() || "";

/**
 * El nombre con el que se le entrega el archivo al lector: el que le pusieron
 * al subirlo, con la extensión de donde está guardado si no traía ninguna.
 */
export function nombreDelArchivo(adjunto) {
  const nombre = String(adjunto?.nombre || "").trim() || "cotizacion";
  if (extension(nombre) && TIPOS[extension(nombre)]) return nombre;
  const ext = extension(adjunto?.storage_path);
  return ext ? `${nombre}.${ext}` : nombre;
}

/** El tipo del archivo: el que diga el almacenamiento, y si no, el de su extensión. */
export function tipoDelArchivo(nombre, tipoGuardado = "") {
  const generico = !tipoGuardado || tipoGuardado === "application/octet-stream";
  return generico ? (TIPOS[extension(nombre)] || tipoGuardado || "") : tipoGuardado;
}

/**
 * Las cotizaciones adjuntas a los pedidos de compra de la obra, de la más
 * nueva a la más vieja. Los pedidos se buscan por la obra y también por el
 * proyecto: muchos se piden antes de que la obra exista y quedan atados solo
 * al proyecto.
 */
export async function cotizacionesDeCompras(obra) {
  if (!obra?.id) return { cotizaciones: [] };
  let q = supabase.from("compras_solicitudes").select("id,descripcion,proveedor,estado,created_at,obra_id,lead_id");
  q = obra.lead_id ? q.or(`obra_id.eq.${obra.id},lead_id.eq.${obra.lead_id}`) : q.eq("obra_id", obra.id);
  const { data: pedidos, error } = await q;
  if (error) return { cotizaciones: [], error: error.message };
  if (!pedidos?.length) return { cotizaciones: [] };
  const { data: adjuntos, error: e2 } = await supabase.from("compras_adjuntos").select("*")
    .in("solicitud_id", pedidos.map(p => p.id)).eq("tipo", "cotizacion").order("created_at", { ascending: false });
  if (e2) return { cotizaciones: [], error: e2.message };
  const porId = new Map(pedidos.map(p => [p.id, p]));
  return {
    cotizaciones: (adjuntos || []).map(a => {
      const p = porId.get(a.solicitud_id) || {};
      return {
        id: a.id, storage_path: a.storage_path, nombre: nombreDelArchivo(a),
        pedido: p.descripcion || "", pedidoId: a.solicitud_id, estado: p.estado || "",
        proveedor: a.proveedor || p.proveedor || "", fecha: String(a.created_at || "").slice(0, 10),
      };
    }),
  };
}

/** El archivo de una cotización de Compras, como si alguien lo acabara de elegir. */
export async function bajarCotizacion(cotizacion) {
  const { data, error } = await supabase.storage.from(BUCKET).download(cotizacion.storage_path);
  if (error || !data) return { error: `No se pudo traer el archivo del pedido: ${error?.message || "no está"}` };
  const tipo = tipoDelArchivo(cotizacion.nombre, data.type);
  return { file: new File([data], cotizacion.nombre, { type: tipo }) };
}
