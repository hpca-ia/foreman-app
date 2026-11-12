// EL PDF GUARDADO DE CADA DÍA, Y CON QUÉ DIBUJO SE HIZO.
//
// Al cerrar un día se imprime y el PDF queda colgado del día. Abrir «el PDF
// del día» mostraba siempre ese guardado, sin mirar con qué código se había
// hecho. Cuando se corrigió el dibujo —los renglones que se cortaban en el
// margen, las fotos de tres centímetros— el libro entero salió bien, porque
// se arma de nuevo cada vez, pero cada día suelto siguió mostrando su PDF
// viejo, con los renglones cortados: en el Aeropuerto, veinte días.
//
// Ahora el nombre del archivo lleva la versión del dibujo. Un guardado hecho
// con un dibujo anterior no se muestra: se vuelve a armar con los datos del
// día —que cerrado no cambian— y se guarda el nuevo. Lo que dice es lo mismo;
// cambia cómo está puesto en la hoja.
//
// LA VERSIÓN VA EN EL NOMBRE Y NO EN UNA FECHA DE CORTE a propósito: una
// pestaña que quedó abierta con el código viejo sigue guardando PDF viejos
// después del arreglo, y por la fecha parecerían buenos. Por el nombre no.
//
// CUÁNDO SUBIRLA: cada vez que se corrija algo del dibujo del día
// (pdfDiaDeObra.js) que deje mal los que ya están guardados.
//
// Sin base ni pantalla: se puede probar (pruebas/pdfGuardadoDelLibro.test.mjs).

/**
 * 1: como salió hasta el 12/11/2026.
 * 2: renglones que entran en la hoja y fotos al doble.
 * 3: sin la nota de que el día se reabrió, que el cliente no tiene que ver.
 */
export const VERSION_DEL_DIBUJO = 3;

/** Dónde se guarda el PDF de un día: con su fecha, el momento y la versión del dibujo. */
export function rutaDelPdfDelDia(dia, ahora = Date.now()) {
  return `libro/${dia.lead_id}/dia-${String(dia.fecha).slice(0, 10)}-${ahora}-v${VERSION_DEL_DIBUJO}.pdf`;
}

/** Con qué dibujo se hizo un PDF guardado. Los de antes de llevar versión son del 1. */
export function versionDelPdf(ruta) {
  const m = /-v(\d+)\.pdf(?:$|[?#])/i.exec(String(ruta || ""));
  return m ? Number(m[1]) : 1;
}

/** ¿El día tiene un PDF guardado y hecho con el dibujo de hoy? */
export const pdfAlDia = dia => !!dia?.pdf_url && versionDelPdf(dia.pdf_url) >= VERSION_DEL_DIBUJO;

/** ¿Tiene uno guardado, pero con un dibujo anterior? Es el que hay que rehacer. */
export const pdfViejo = dia => !!dia?.pdf_url && !pdfAlDia(dia);
