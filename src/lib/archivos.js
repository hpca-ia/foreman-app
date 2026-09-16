import { supabase } from "./supabase";

// Los archivos del equipo —facturas, fotos de gastos, presupuestos originales,
// adjuntos de tareas— están en un depósito privado. No tienen dirección fija:
// para verlos se pide un enlace que caduca, y solo se lo dan a quien tiene
// sesión. Antes cualquiera con el enlace abría la factura de una obra.
//
// En la base conviven dos formas de guardar un archivo: la ruta (lo nuevo) y la
// dirección pública completa (lo viejo). De las dos se saca la ruta.

const BUCKET = "task-files";
// El logo va aparte, en un depósito público: se muestra en correos y PDF, donde
// un enlace que caduca se vería roto. No es información de nadie.
export const BUCKET_PUBLICO = "publico";

export function rutaDe(valor) {
  const s = String(valor || "").trim();
  if (!s) return "";
  const m = s.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/[^/]+\/([^?]+)/);
  if (m) return decodeURIComponent(m[1]);
  return s.replace(/^\/+/, "");
}

/** Enlace temporal para ver o descargar. Por defecto, una hora. */
export async function enlaceArchivo(valor, segundos = 3600) {
  const ruta = rutaDe(valor);
  if (!ruta) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, segundos);
  return error ? null : data.signedUrl;
}

/** Varios de una vez, en el mismo orden. Los que fallan quedan en null. */
export async function enlacesArchivos(valores = [], segundos = 3600) {
  const rutas = valores.map(rutaDe);
  const utiles = rutas.filter(Boolean);
  if (!utiles.length) return rutas.map(() => null);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(utiles, segundos);
  if (error) return rutas.map(() => null);
  const porRuta = new Map((data || []).map(d => [d.path, d.signedUrl || null]));
  return rutas.map(r => (r ? porRuta.get(r) ?? null : null));
}

/**
 * Abre el archivo en otra pestaña. La pestaña se abre antes de pedir el enlace:
 * si se abriera después, el navegador lo tomaría por una ventana emergente y la
 * bloquearía.
 */
export async function abrirArchivo(valor, segundos = 3600) {
  const w = window.open("", "_blank", "noopener");
  const url = await enlaceArchivo(valor, segundos);
  if (!url) { if (w) w.close(); alert("No se pudo abrir el archivo."); return false; }
  if (w) w.location.href = url; else window.location.href = url;
  return true;
}

/** Sube y devuelve la ruta, que es lo que se guarda en la base. */
export async function subirArchivo(ruta, file, opciones = {}) {
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, file, {
    upsert: false, contentType: file.type || "application/octet-stream", ...opciones,
  });
  return { ruta: error ? null : ruta, error };
}
