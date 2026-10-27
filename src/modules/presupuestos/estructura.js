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

// LOS RUBROS QUE NO SE COTIZAN.
//
// Un presupuesto de cliente trae rubros que no nos tocan —los pone otro, los
// provee el cliente, falta definirlos— marcados con la nota "NO COTIZA". Se
// quedan en el cuadro, en su lugar y con su número —el cliente los busca
// donde los puso él—, pero en vez de precio dicen NO COTIZA. Y además se
// listan al pie, cada uno con el porqué, que es lo que el cliente necesita
// para saber qué le falta contratar por otro lado.
const NO_COTIZA = /\bno\s+(se\s+)?cotiza(do|da|mos|n)?\b/i;

/** ¿La nota de este rubro dice que no se cotiza? */
export const esNoCotiza = i => NO_COTIZA.test(String(i?.nota || ""));

/** El porqué: lo que dice la nota además de "NO COTIZA". Vacío si no lo dice. */
export function motivoNoCotiza(nota) {
  let m = String(nota || "").replace(NO_COTIZA, " ").replace(/^[\s:;,.\-–—()]+|[\s:;,\-–—(]+$/g, "").replace(/\s+/g, " ").trim();
  // "NO COTIZA (falta diseño)": se fue el paréntesis de apertura, va el de cierre.
  if (m.endsWith(")") && (m.match(/\(/g) || []).length < (m.match(/\)/g) || []).length) m = m.slice(0, -1).trim();
  return m;
}

/** Capítulos con sus rubros, numerados como en pantalla (1, 1.1, 1.2…) y sin capítulos vacíos. */
export function estructura({ capitulos = [], items = [] }) {
  const orden = [...capitulos].sort((a, b) => a.orden - b.orden).map(c => c.nombre);
  // Un rubro cuyo capítulo no está en la lista no se pierde: va al final.
  items.forEach(i => { if (i.capitulo && !orden.includes(i.capitulo)) orden.push(i.capitulo); });
  if (items.some(i => !i.capitulo)) orden.push("");
  const salida = [];
  orden.forEach(nombre => {
    // Los extras van al final del capítulo, debajo de lo pedido, y suman
    // aparte: el capítulo dice cuánto es cada cosa.
    const delCap = items.filter(i => (i.capitulo || "") === nombre).sort((a, b) => n(a.orden) - n(b.orden));
    if (!delCap.length) return;
    const suyos = [...delCap.filter(i => !i.extra), ...delCap.filter(i => i.extra)];
    const suma = l => r2(l.reduce((s, i) => s + n(i.total), 0));
    const num = salida.length + 1;
    salida.push({
      numero: String(num),
      nombre: nombre || "OTROS",
      subtotal: suma(suyos),
      subtotalBase: suma(suyos.filter(i => !i.extra)),
      subtotalExtras: suma(suyos.filter(i => i.extra)),
      hayExtras: suyos.some(i => i.extra),
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
        // Y SU id, que es con lo que el documento sabe de qué rubro es cada
        // nota. Sin él, elegir que una nota no salga no tenía efecto: la
        // pantalla la excluía por id y el documento no tenía ninguno con qué
        // compararlo, así que salían todas igual.
        id: i.id,
        extra: !!i.extra,
        noCotiza: esNoCotiza(i),
      })),
    });
  });
  return salida;
}

/**
 * Los rubros que no se cotizan, en el orden del presupuesto, con su capítulo
 * y el porqué. Van al pie del cuadro.
 */
export function noCotizados({ capitulos = [], items = [] }) {
  const orden = [...capitulos].sort((a, b) => a.orden - b.orden).map(c => c.nombre);
  const pos = c => { const k = orden.indexOf(c); return k < 0 ? orden.length : k; };
  return items.filter(esNoCotiza)
    .sort((a, b) => (pos(a.capitulo) - pos(b.capitulo)) || (n(a.orden) - n(b.orden)))
    .map(i => ({
      id: i.id, capitulo: i.capitulo || "OTROS", descripcion: i.descripcion || "",
      unidad: etiquetaUnidad(i.unidad), cantidad: n(i.cantidad), total: n(i.total),
      motivo: motivoNoCotiza(i.nota),
    }));
}

// LAS HOJAS DEL EXCEL ORIGINAL.
//
// Un presupuesto que vino en un libro de varias hojas —la casa principal, la
// vivienda del cuidador, las obras exteriores— trae sus capítulos con el
// nombre de la hoja adelante: "CASA PRINCIPAL · OBRAS PRELIMINARES". Cuánto
// cuesta cada hoja es lo primero que pregunta el cliente, y sin esto había que
// sumarlo a mano. El separador es el que pone el lector al importar.
export const SEPARADOR_BLOQUE = " · ";

/** La hoja (o bloque) de un capítulo: lo que va antes de " · ", o "". */
export function bloqueDe(nombre) {
  const t = String(nombre || "");
  const i = t.indexOf(SEPARADOR_BLOQUE);
  return i > 0 ? t.slice(0, i).trim() : "";
}

/**
 * Los capítulos agrupados por hoja, con lo que suma cada una. Solo si hay dos
 * hojas o más: con una sola, agrupar no dice nada. Los capítulos sin hoja
 * forman su propio grupo ("Otros").
 *
 * @param caps [{ nombre, subtotal, subtotalBase?, subtotalExtras? }] en su orden
 * @returns [{ nombre, capitulos: [nombres], subtotal, subtotalBase, subtotalExtras }] o null
 */
export function porBloques(caps = []) {
  const nombres = [...new Set(caps.map(c => bloqueDe(c.nombre)))];
  if (nombres.filter(Boolean).length < 2) return null;
  return nombres.map(b => {
    const suyos = caps.filter(c => bloqueDe(c.nombre) === b);
    const suma = k => r2(suyos.reduce((s, c) => s + n(c[k] ?? (k === "subtotalBase" ? c.subtotal : 0)), 0));
    return {
      nombre: b || "Otros", capitulos: suyos.map(c => c.nombre),
      subtotal: suma("subtotal"), subtotalBase: suma("subtotalBase"), subtotalExtras: suma("subtotalExtras"),
    };
  });
}
