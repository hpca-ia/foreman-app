import { supabase } from "./supabase";
import { rutaDe, tipoParaVer, tipoDelPapel, nombreDeArchivo, paraLeer } from "./nombresDeArchivo.js";

// Lo que no toca la base —de qué ruta es, cómo se llama, cómo se muestra— está
// en nombresDeArchivo.js, y se ofrece también desde acá.
export { rutaDe, tipoParaVer, tipoDelPapel, nombreDeArchivo, paraLeer };

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

// ── VER UN ARCHIVO, Y BAJARLO ──────────────────────────────────────────────
//
// Hernán, 18/11/2026, con una cotización abierta en Compras: «en compras y en
// todos los módulos no se leen bien los archivos. Además me gustaría poder
// descargar». La cotización se veía en un cuadro de 420 px de alto, con el
// visor del navegador adentro y su panel de miniaturas comiéndose la mitad; y
// «descargar» era un ícono que la abría en otra pestaña, con el nombre que le
// puso el depósito —«1795032943439-CION_…»— en vez del suyo.
//
// Ahora todo archivo se abre igual en todo FOREMAN: GRANDE, encima de lo que
// se estaba mirando (VisorDeArchivo), con «Descargar» —que lo baja con su
// nombre— y «Abrir en otra pestaña». En el teléfono se sigue abriendo aparte:
// ahí un PDF adentro de la página no se dibuja.

/** Enlace que BAJA el archivo, con su nombre, en vez de abrirlo. */
export async function enlaceParaBajar(valor, nombre = "", segundos = 300) {
  const ruta = rutaDe(valor);
  if (!ruta) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, segundos, { download: nombreDeArchivo(valor, nombre) });
  return error ? null : data.signedUrl;
}

/** Baja el archivo a la computadora, con su nombre. @returns si se pudo */
export async function descargarArchivo(valor, nombre = "") {
  const url = await enlaceParaBajar(valor, nombre);
  if (!url) { alert("No se pudo descargar el archivo."); return false; }
  const a = document.createElement("a");
  a.href = url; a.download = nombreDeArchivo(valor, nombre); a.rel = "noreferrer";
  document.body.appendChild(a); a.click(); a.remove();
  return true;
}

const esTelefono = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

// El visor de FOREMAN, si está en pantalla: lo pone VisorDeArchivo al montarse.
let visor = null;
/** @returns cómo sacarlo */
export function ponerVisor(mostrar) {
  visor = mostrar;
  return () => { if (visor === mostrar) visor = null; };
}

/**
 * Abre el archivo: grande y adentro de FOREMAN, con su botón de descargar.
 *
 * En el teléfono, o si se pide `aparte`, se abre en otra pestaña. Ahí la
 * pestaña se abre antes de pedir el enlace: si se abriera después, el
 * navegador lo tomaría por una ventana emergente y la bloquearía.
 *
 * @param opciones  { nombre, aparte, segundos } — o los segundos, como antes
 */
export async function abrirArchivo(valor, opciones = {}) {
  const o = typeof opciones === "number" ? { segundos: opciones } : opciones || {};
  if (visor && !o.aparte && !esTelefono() && rutaDe(valor)) {
    visor({ valor, nombre: nombreDeArchivo(valor, o.nombre) });
    return true;
  }
  const w = window.open("", "_blank", "noopener");
  const url = await enlaceArchivo(valor, o.segundos || 3600);
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
