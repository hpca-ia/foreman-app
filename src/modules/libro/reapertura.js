// LA REAPERTURA DE UN DÍA SE VE EN EL SISTEMA, NO EN LO QUE LEE EL CLIENTE.
//
// «La nota de si se reabrió y se cerró: eliminala, en el PDF. En el sistema se
// puede ver. No queremos que el cliente vea esa info» (Hernán, 12/11/2026).
//
// Cuando se reabre un día quedan dos rastros: los datos del día —quién lo
// reabrió, cuándo, por qué y cuántas veces— y una observación automática
// escrita adentro del libro, «Se reabrió el día para completarlo o corregirlo:
// …». Los dos siguen existiendo y se ven en FOREMAN: en el día, en la lista y
// en «El libro». Lo que cambia es que NO SALEN EN EL PAPEL: ni en el PDF del
// día, ni en el libro entero, ni en la página donde el cliente lo revisa.
//
// La observación automática no tiene una marca propia en la base: se la
// reconoce por cómo empieza. Por eso el texto con el que se escribe y el
// texto con el que se la reconoce salen de acá los dos, y no pueden
// desencontrarse. La copia del servidor es api/_reaperturaDelLibro.js;
// pruebas/reaperturaDelLibro.test.mjs cuida que digan lo mismo.

/** Así empieza la observación que deja escrita una reapertura. */
export const NOTA_DE_REAPERTURA = "Se reabrió el día para completarlo o corregirlo:";

/** La observación que se escribe al reabrir, con su motivo. */
export const notaDeReapertura = motivo => `${NOTA_DE_REAPERTURA} ${String(motivo || "").trim()}`;

/** ¿Esta entrada es la observación automática de una reapertura? */
export const esNotaDeReapertura = e => String(e?.contenido || "").trimStart().startsWith(NOTA_DE_REAPERTURA);

/** Las entradas como van al papel: todas menos las observaciones de reapertura. */
export const paraElPapel = (entradas = []) => (entradas || []).filter(e => !esNotaDeReapertura(e));
