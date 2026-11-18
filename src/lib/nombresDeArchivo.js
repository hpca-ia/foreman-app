// DE QUÉ RUTA ES UN ARCHIVO, CÓMO SE LLAMA Y CÓMO SE MUESTRA.
//
// Lo que se decide sin tocar el depósito, para poder probarlo. Lo usa
// lib/archivos.js, que es quien pide los enlaces y abre los archivos.
//
// En la base conviven dos formas de guardar un archivo: la ruta (lo nuevo) y la
// dirección pública completa (lo viejo). De las dos se saca la ruta.

export function rutaDe(valor) {
  const s = String(valor || "").trim();
  if (!s) return "";
  const m = s.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/[^/]+\/([^?]+)/);
  if (m) return decodeURIComponent(m[1]);
  return s.replace(/^\/+/, "");
}

/** Cómo se muestra, por su nombre o su ruta: "imagen" · "pdf" · "otro". */
export const tipoParaVer = nombre => {
  const n = String(nombre || "").split(/[?#]/)[0];
  return /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(n) ? "imagen" : /\.pdf$/i.test(n) ? "pdf" : "otro";
};

const EXTENSION = /\.[A-Za-z0-9]{2,5}$/;

/**
 * Qué es un papel —imagen, PDF u otra cosa— mirando su nombre y, si el nombre
 * no lo dice, su ruta. Una cotización se llama a veces como el proveedor,
 * «MADEVAL», y es su archivo el que termina en .pdf.
 */
export const tipoDelPapel = (nombre, ruta) => (tipoParaVer(nombre) !== "otro" ? tipoParaVer(nombre) : tipoParaVer(rutaDe(ruta)));

/**
 * El nombre con que se muestra y se baja: el que se le dio al cargarlo, o el
 * del depósito sin el número que lleva adelante. Si el nombre dado no trae su
 * terminación —«.pdf»—, se le pone la del archivo: bajado sin ella, la
 * computadora no sabe con qué abrirlo.
 */
export function nombreDeArchivo(valor, nombre = "") {
  const dado = String(nombre || "").trim();
  const terminacion = (rutaDe(valor).match(EXTENSION) || [""])[0];
  if (dado) return EXTENSION.test(dado) || !terminacion ? dado : `${dado}${terminacion}`;
  let ultimo = rutaDe(valor).split("/").pop() || "";
  try { ultimo = decodeURIComponent(ultimo); } catch { /* queda como vino */ }
  return ultimo.replace(/^\d{10,}(-\d+)?-/, "") || "archivo";
}

/**
 * La dirección de un PDF para LEERLO adentro: a lo ancho de donde está y sin
 * el panel de miniaturas, que en un cuadro angosto se come la hoja. Son los
 * parámetros que entiende el visor de PDF del navegador; lo demás no cambia.
 */
export const paraLeer = (url, nombre = "") =>
  (url && tipoParaVer(nombre || url) === "pdf" && !String(url).includes("#") ? `${url}#navpanes=0&view=FitH` : url);
