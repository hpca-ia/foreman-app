// QUÉ ENTRA EN EL REPORTE DE LA CAJA: POR PERÍODO O POR CIERRE.
//
// Son dos preguntas distintas y no se contestan con el mismo filtro.
//
//   · POR PERÍODO: lo que tiene fecha entre dos días. Sirve para «qué se
//     gastó en octubre».
//   · POR CIERRE: lo que se rindió en esa vuelta. No es un rango de fechas:
//     un gasto devuelto al residente queda afuera del cierre aunque tenga
//     fecha de esos días, y entra en el cierre que lo encuentre corregido; un
//     papel viejo cargado tarde entra en la vuelta en que se cargó. En la caja
//     de Lizeth hay gastos del 22 de octubre que no están en el cierre que
//     va «hasta el 31 de octubre». Lo que manda es la marca que deja el
//     cierre en cada gasto.
//
// Un cierre además GUARDA su foto —cuántos gastos, cuánto se gastó—, y esa
// foto no cambia aunque después alguien corrija un gasto. Si lo de hoy no
// suma lo que se firmó, el reporte lo dice en vez de mostrar un total que no
// coincide con la rendición sin explicar por qué.
//
// Sin base ni pantalla: se puede probar (pruebas/reporteDeCaja.test.mjs).

import { deLaVuelta, paraElReporte } from "./lista.js";
import { resumenDeLaCaja } from "./resumen.js";

const n = v => Number(v) || 0;
const r2 = v => Math.round(v * 100) / 100;
const dia = f => String(f || "").slice(0, 10);
const porDia = (a, b) => dia(a.fecha).localeCompare(dia(b.fecha)) || n(a.id) - n(b.id);
const suma = lista => r2(lista.reduce((t, x) => t + n(x.monto), 0));
const mismo = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * @param modo      "periodo" | "cierre"
 * @param desde     con modo "periodo": desde qué día (vacío = desde el inicio)
 * @param hasta     con modo "periodo": hasta qué día (vacío = hasta hoy)
 * @param cierreId  con modo "cierre": cuál
 * @returns {{
 *   modo, cierre, etiqueta, nombre,
 *   gastosF, devueltosF, anticiposF, reposiciones, cierresF,
 *   totalGastos, totalAnticipos, totalDevueltos, totalReposicion,
 *   queEs, difiere }}
 *   `anticiposF` es, por cierre, lo entregado para esa vuelta; `reposiciones`,
 *   lo que llegó después para reponerla. `difiere` es null o lo que se firmó
 *   contra lo que hay hoy.
 */
export function contenidoDelReporte({ gastos = [], anticipos = [], cierres = [], modo = "periodo", desde = "", hasta = "", cierreId = null }) {
  // Qué es cada anticipo —el fondo, la reposición de qué cierre—, dicho como
  // lo dice la pantalla de la caja.
  const filas = new Map(resumenDeLaCaja({ anticipos, cierres }).filter(f => f.anticipo).map(f => [String(f.anticipo.id), f]));
  const queEs = a => filas.get(String(a.id))?.dice || "Anticipo";

  if (modo === "cierre") {
    const cierre = cierres.find(c => mismo(c.id, cierreId)) || null;
    if (!cierre) {
      return { modo, cierre: null, etiqueta: "", nombre: "", gastosF: [], devueltosF: [], anticiposF: [], reposiciones: [], cierresF: [],
        totalGastos: 0, totalAnticipos: 0, totalDevueltos: 0, totalReposicion: 0, queEs, difiere: null };
    }
    // LOS DEVUELTOS AL RESIDENTE QUEDAN FUERA, también acá: si a uno lo
    // devolvieron después de cerrado, ya no es un gasto de la caja, y la
    // diferencia con lo firmado se dice abajo.
    const { gastos: gastosF, devueltos: devueltosF } = paraElReporte(deLaVuelta(gastos, cierre.id).sort(porDia));
    const anticiposF = anticipos.filter(a => mismo(a.cierre_id, cierre.id)).sort(porDia);
    const reposiciones = anticipos.filter(a => {
      const f = filas.get(String(a.id));
      return f?.tipo === "reposicion" && mismo(f.cierre?.id, cierre.id);
    }).sort(porDia);

    const totalGastos = suma(gastosF), totalAnticipos = suma(anticiposF);
    const firmado = { gastos: n(cierre.gastos), total: r2(n(cierre.total_gastado)), entregado: r2(n(cierre.total_abonado)) };
    const cambio = Math.abs(firmado.total - totalGastos) > 0.005 || firmado.gastos !== gastosF.length
      || Math.abs(firmado.entregado - totalAnticipos) > 0.005;

    return {
      modo, cierre,
      etiqueta: `Cierre N° ${cierre.numero} · hasta el ${dia(cierre.hasta)}`,
      nombre: `Cierre ${cierre.numero}`,
      gastosF, devueltosF, anticiposF, reposiciones, cierresF: [cierre],
      totalGastos, totalAnticipos, totalDevueltos: suma(devueltosF), totalReposicion: suma(reposiciones),
      queEs,
      difiere: cambio ? { firmado, hoy: { gastos: gastosF.length, total: totalGastos, entregado: totalAnticipos } } : null,
    };
  }

  const enRango = f => (!desde || dia(f) >= desde) && (!hasta || dia(f) <= hasta);
  // LOS DEVUELTOS AL RESIDENTE QUEDAN FUERA. Están mal cargados y hasta que
  // se corrijan no son un gasto de la caja: sumarlos era cobrarle a la obra
  // un papel que administración rechazó. Van aparte, para que no se pierdan.
  const { gastos: gastosF, devueltos: devueltosF } = paraElReporte(gastos.filter(g => enRango(g.fecha)).sort(porDia));
  const anticiposF = anticipos.filter(a => enRango(a.fecha)).sort(porDia);
  const cierresF = cierres.filter(c => enRango(c.hasta)).sort((a, b) => n(a.numero) - n(b.numero));

  return {
    modo: "periodo", cierre: null,
    etiqueta: `${desde || "inicio"} a ${hasta || "hoy"}`,
    nombre: desde || "inicio",
    gastosF, devueltosF, anticiposF, reposiciones: [], cierresF,
    totalGastos: suma(gastosF), totalAnticipos: suma(anticiposF), totalDevueltos: suma(devueltosF), totalReposicion: 0,
    queEs, difiere: null,
  };
}

/** Los cierres para elegir, el más nuevo arriba. */
export const cierresParaElegir = (cierres = []) => [...cierres].sort((a, b) => n(b.numero) - n(a.numero));
