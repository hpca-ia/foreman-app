import { conCosto, vivo, sinIvaDelGasto } from "./eficienciaDeRubros.js";
import { baseSinIva } from "./contratoDeLaObra.js";
import { totales } from "./cuentaBeneficios.js";
// EL RESULTADO DE LA OBRA, no solo los beneficios.
//
// Tres cosas lo hacen, y van juntas en un número y separadas abajo:
//
//   · LO QUE SE GANÓ COMPRANDO: los beneficios con papel, los de las órdenes
//     de cambio y los cargados a mano. Era lo único que se contaba.
//   · LAS PÉRDIDAS EN LOS RUBROS: un rubro que ya gastó más de lo que tenía
//     presupuestado es plata que la obra perdió, se lo siga o no. Dejarla
//     fuera era mostrar un beneficio de $5.000 en una obra que ya iba
//     perdiendo en tres rubros.
//   · LOS RUBROS SEGUIDOS: un beneficio también puede salir de un rubro del
//     presupuesto y de las facturas que se le cargan en la planilla. Se trae
//     el rubro, se lo sigue factura a factura, y cuando termina lo que dejó
//     cuenta.
//
// CONTRA QUÉ SE MIDE UN RUBRO: contra su COSTO presupuestado si está cargado
// —eso es comprar mejor o peor que lo previsto— y, si no, contra lo que se
// cobra, que mezcla el margen con la compra pero es lo único que hay.
//
// TODO SIN IVA, como los beneficios y como Diferencias: el beneficio es
// líquido y el IVA no es nuestro. El control trae sus rubros con el IVA
// adentro, así que acá se llevan a su base: lo que se cobra, y lo gastado en
// facturas dividido por el porcentaje del rubro. El costo ya viene sin IVA.
//
// Sin base de datos: son las cuentas que dicen si la obra deja plata.

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

/** Un rubro del presupuesto medido contra sus facturas. */
export function seguimientoDeRubro(r, porRubro = {}) {
  const gastado = sinIvaDelGasto(r, porRubro?.[r.id]?.acumulado);
  const cobrado = baseSinIva(r);
  const costo = conCosto(r) ? c2(n(r.costo_unitario) * n(r.cantidad)) : null;
  const contra = costo != null ? "costo" : "cobrado";
  const presupuestado = costo ?? cobrado;
  const resultado = c2(presupuestado - gastado);
  const avance = n(r.avance_pct);
  const terminado = avance >= 100;
  // UNA PÉRDIDA ES HABER GASTADO MÁS DE LO PRESUPUESTADO, no un número
  // negativo. La reducción de una orden de cambio —"(–) piso de
  // microcemento", total en negativo— no tiene nada que comprar: sin gasto
  // no es pérdida de nada, aunque la resta dé negativo.
  const pasado = gastado > 0 && resultado < 0;
  const estado = pasado ? "pasado" : !gastado ? "sin_empezar" : terminado ? "terminado" : "en_curso";
  return {
    id: r.id, numero: String(r.numero ?? r.codigo ?? ""), descripcion: r.descripcion || "",
    unidad: r.unidad || "", cantidad: n(r.cantidad),
    cobrado, costo, gastado, avance, terminado, contra, presupuestado, resultado, estado,
    // Cuenta en el resultado si ya pasó: una pérdida ya pasó; un ahorro,
    // recién cuando el rubro terminó. Antes es lo que falta comprar.
    cuenta: pasado || (terminado && gastado > 0),
  };
}

/** Los rubros que ya gastaron más de su presupuesto, se sigan o no. */
export function perdidasEnRubros(rubros = [], porRubro = {}) {
  const filas = rubros.filter(vivo).map(r => seguimientoDeRubro(r, porRubro))
    .filter(f => f.estado === "pasado").sort((a, b) => a.resultado - b.resultado);
  return { filas, total: c2(filas.reduce((t, f) => t + f.resultado, 0)) };
}

/**
 * @param beneficios  los guardados de la obra (con papel, a mano, de órdenes)
 * @param rubros      los del control
 * @param seguidos    [{ id, obra_rubro_id }] los que se siguen
 * @param porRubro    lo que calculó calcularControl: `acumulado` es lo gastado
 */
export function resultadoDeLaObra({ beneficios = [], rubros = [], seguidos = [], porRubro = {} } = {}) {
  const t = totales(beneficios);
  const perdidas = perdidasEnRubros(rubros, porRubro);
  const porId = new Map(rubros.map(r => [String(r.id), r]));
  const seguimiento = seguidos.map(s => {
    const r = porId.get(String(s.obra_rubro_id));
    return r ? { seguido: s, ...seguimientoDeRubro(r, porRubro) } : null;
  }).filter(Boolean);
  // Lo que dejaron los seguidos ya terminados, en positivo: lo negativo ya
  // está en las pérdidas, que son de todos los rubros, y no se cuenta dos veces.
  const ganadoEnSeguidos = c2(seguimiento
    .filter(f => f.terminado && f.gastado > 0 && f.resultado > 0)
    .reduce((s, f) => s + f.resultado, 0));
  return {
    conPapel: t.neto, cuantosConPapel: t.cuantos,
    previsto: t.previsto, cuantosPrevistos: t.cuantosPrevistos,
    perdidas: perdidas.filas, perdidasTotal: perdidas.total,
    seguimiento, ganadoEnSeguidos,
    neto: c2(t.neto + perdidas.total + ganadoEnSeguidos),
  };
}
