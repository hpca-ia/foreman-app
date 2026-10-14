// Cómo se agrupa un presupuesto para imprimirlo: capítulos con sus rubros,
// numerados y sumados.
//
// Vive aparte del documento porque es lo único que se puede probar sin un
// navegador —el otro archivo carga jsPDF y ExcelJS— y porque es el cuello de
// botella de todo lo que sale impreso: lo que esta función no copia, para el
// documento no existe.

import { etiquetaUnidad } from "../../lib/unidades.js";

const n = v => Number(v) || 0;
const r2 = v => Math.round(v * 100) / 100;

/** Capítulos con sus rubros, numerados como en pantalla (1, 1.1, 1.2…) y sin capítulos vacíos. */
export function estructura({ capitulos = [], items = [] }) {
  const orden = [...capitulos].sort((a, b) => a.orden - b.orden).map(c => c.nombre);
  // Un rubro cuyo capítulo no está en la lista no se pierde: va al final.
  items.forEach(i => { if (i.capitulo && !orden.includes(i.capitulo)) orden.push(i.capitulo); });
  if (items.some(i => !i.capitulo)) orden.push("");
  const salida = [];
  orden.forEach(nombre => {
    const suyos = items.filter(i => (i.capitulo || "") === nombre).sort((a, b) => n(a.orden) - n(b.orden));
    if (!suyos.length) return;
    const num = salida.length + 1;
    salida.push({
      numero: String(num),
      nombre: nombre || "OTROS",
      subtotal: r2(suyos.reduce((s, i) => s + n(i.total), 0)),
      rubros: suyos.map((i, k) => ({
        numero: `${num}.${k + 1}`, descripcion: i.descripcion || "", unidad: etiquetaUnidad(i.unidad),
        cantidad: n(i.cantidad), precio_unitario: n(i.precio_unitario), total: n(i.total),
        // LA ETAPA Y LA NOTA VIAJAN CON EL RUBRO.
        //
        // Acá se quedaban afuera, y eso rompía dos cosas sin que se notara:
        // el PDF por etapas salía con la columna ETAPA en blanco —el documento
        // decía que el presupuesto se cobra por etapas y después no decía cuál
        // es la de cada renglón, que es justo lo que el cliente va a mirar—, y
        // la advertencia escrita a mano en un rubro no se imprimía nunca,
        // aunque la pantalla de exportar la contara.
        //
        // Las dos las usa `tabla()` más abajo. Lo que esta función no copia,
        // para el documento no existe.
        etapa: String(i.etapa || "").trim(), nota: i.nota || "",
      })),
    });
  });
  return salida;
}
