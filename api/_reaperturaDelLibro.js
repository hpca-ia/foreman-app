// La copia del servidor de src/modules/libro/reapertura.js: qué entradas del
// libro de obra NO viajan a lo que lee el cliente.
//
// La reapertura de un día se ve en FOREMAN y no en el papel. La observación
// automática que deja escrita —«Se reabrió el día para completarlo o
// corregirlo: …»— se reconoce por cómo empieza. pruebas/reaperturaDelLibro.test.mjs
// cuida que esta copia y la de la aplicación digan lo mismo.

export const NOTA_DE_REAPERTURA = "Se reabrió el día para completarlo o corregirlo:";

export const esNotaDeReapertura = e => String(e?.contenido || "").trimStart().startsWith(NOTA_DE_REAPERTURA);

/** Las entradas como las ve el cliente: todas menos las observaciones de reapertura. */
export const paraElCliente = (entradas = []) => (Array.isArray(entradas) ? entradas : []).filter(e => !esNotaDeReapertura(e));
