// Cómo se llama una orden de cambio y cómo se llama su archivo.
//
// Vive aparte del resto del módulo porque el resto del módulo habla con
// Supabase, y esto es una cuenta de texto que conviene tener probada: el
// nombre del archivo es lo único que distingue a una orden de las otras ocho
// dentro de la carpeta del proyecto.

export const codigoDe = orden => orden?.codigo || `OC-${String(orden?.numero ?? 0).padStart(2, "0")}`;

/**
 * El nombre del archivo de una orden: su código y su título.
 *
 * El PDF se llamaba por el proyecto —"OC-03 - Edificio Las Peñas.pdf"—, que es
 * el nombre de las nueve órdenes de ese proyecto. Quien lo recibe lo guarda y
 * después tiene que abrirlas una por una para encontrar la del cambio de
 * ventanería. Se llama como la orden, que es con lo que se la cita.
 */
export const nombreDelArchivo = orden => {
  const titulo = String(orden?.titulo || "").trim();
  // Lo que un sistema de archivos no acepta, y los espacios de sobra que deja
  // un título escrito a las apuradas.
  const limpio = titulo.replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, " ").slice(0, 80).trim();
  return limpio ? `${codigoDe(orden)} - ${limpio}` : codigoDe(orden);
};
