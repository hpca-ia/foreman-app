import { conCosto, vivo, sinIvaDelGasto } from "./eficienciaDeRubros.js";
import { baseSinIva } from "./contratoDeLaObra.js";
import { totales } from "./cuentaBeneficios.js";
import { precioDelContrato } from "./clasesDePartida.js";
import { ordenCuenta } from "./cuentaOrdenCambio.js";
import { codigoDe } from "./nombreOrden.js";
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
/**
 * LO QUE UNA ORDEN APROBADA LE QUITÓ A CADA RUBRO, en cantidad.
 *
 * Una reducción no borra el rubro: entra en negativo en el capítulo de su
 * orden y el rubro del contrato queda como estaba. Para saber cuánto queda
 * aprobado de verdad hay que restarle lo que las órdenes que cuentan le
 * sacaron.
 */
export function reduccionesAprobadas(ordenes = [], lineasDeOrdenes = {}) {
  const por = {};
  for (const o of ordenes) {
    if (!ordenCuenta(o)) continue;
    for (const l of lineasDeOrdenes[o.id] || []) {
      if (l.tipo !== "quita" || !l.obra_rubro_id) continue;
      por[l.obra_rubro_id] = (por[l.obra_rubro_id] || 0) + n(l.cantidad);
    }
  }
  return por;
}

/**
 * EL BENEFICIO DE LO YA APROBADO, RUBRO POR RUBRO.
 *
 * Un rubro que el cliente aprobó a un precio y del que se sabe el costo ya
 * deja beneficio: precio menos costo, por la cantidad que sigue aprobada. No
 * hace falta una proforma abierta ni una decisión de nadie —vive en el rubro—,
 * así que borrar el análisis de donde salió el costo no lo hace desaparecer.
 *
 *   · Lo que una orden de cambio AUMENTA no está acá: eso entra con la orden,
 *     el día que el cliente la aprueba.
 *   · Lo que una orden aprobada REDUJO ya está descontado: lo que queda
 *     conserva su beneficio.
 *   · El rubro que ya tiene un beneficio cargado a mano no se cuenta dos
 *     veces: manda el que alguien escribió con su papel.
 *
 * Sin IVA, como todo Beneficios. Solo sobre la cantidad YA aprobada: lo que
 * está en una orden de cambio sin aprobar no cuenta todavía.
 *
 * Y UN COSTO QUE NO SE PARECE AL PRECIO NO SE CUENTA. Unas mamparas de $6.000
 * con $150 de costo cargado no dejan $5.850: tienen un costo mal puesto. Se
 * listan aparte, marcadas, para que alguien lo corrija, y no entran al total.
 */
export function beneficioDeLoAprobado({ rubros = [], beneficios = [], reducciones = {}, deltas = {}, modalidad = "rubros" } = {}) {
  const aMano = new Set(beneficios.filter(b => b?.obra_rubro_id && b.origen === "manual").map(b => String(b.obra_rubro_id)));
  const filas = rubros.filter(vivo)
    .filter(r => r.origen !== "orden_cambio" && conCosto(r) && !aMano.has(String(r.id)))
    .map(r => {
      const contratada = n(r.cantidad);
      const reducida = Math.min(contratada, n(reducciones[r.id]));
      const aprobada = Math.round((contratada - reducida) * 10000) / 10000;
      // LO EJECUTADO, SI YA SE MIDIÓ (liquidacion.js). La diferencia contra lo
      // vigente mueve la cantidad de este rubro: por rubros se cobra y cuesta
      // lo ejecutado; llave en mano se cobra lo aprobado y cuesta lo ejecutado.
      const delta = n(deltas[r.id]);
      const ejecutada = Math.max(0, Math.round((aprobada + delta) * 10000) / 10000);
      const llave = modalidad === "llave_en_mano";
      const cantidad = llave ? aprobada : ejecutada;
      const precio = precioDelContrato(r);
      const costo = n(r.costo_unitario);
      if (precio == null || !(cantidad > 0)) return null;
      return {
        id: r.id, numero: String(r.numero ?? r.codigo ?? ""), descripcion: r.descripcion || "",
        unidad: r.unidad || "", contratada, reducida, cantidad, precio, costo,
        aprobada, ejecutada, delta, medida: delta !== 0, llave,
        seCobra: c2(precio * cantidad), cuesta: c2(costo * ejecutada),
        beneficio: llave && delta ? c2(precio * cantidad - costo * ejecutada) : c2((precio - costo) * cantidad),
        dudoso: costo < precio / 2 || costo > precio * 2,
      };
    }).filter(Boolean).sort((a, b) => (a.dudoso - b.dudoso) || (b.beneficio - a.beneficio));
  const firmes = filas.filter(f => !f.dudoso);
  return {
    filas, cuantos: firmes.length, dudosos: filas.length - firmes.length,
    total: c2(firmes.reduce((t, f) => t + f.beneficio, 0)),
  };
}

/**
 * LAS ÓRDENES DE CAMBIO POR APROBAR, Y LO QUE DEJARÍAN.
 *
 * Lo que una orden agrega o aumenta es beneficio recién cuando el cliente la
 * aprueba: antes no hay nada vendido. Pero hace falta verlo antes —es lo que
 * dice cuánto hay en juego en esa firma—, igual que un rubro en seguimiento se
 * muestra aunque no cuente hasta terminar.
 *
 *   · Lo que AGREGA deja su precio menos su costo, por su cantidad. Una partida
 *     sin costo no se puede medir, y se dice cuántas son.
 *   · Lo que REDUCE saca el beneficio que esas unidades tenían en el rubro: su
 *     precio aprobado menos su costo cargado. Si el rubro no tiene costo, no se
 *     sabe cuánto dejaba y no se resta nada.
 *
 * Es aproximado y no suma al resultado. En borrador o enviada; la anulada y la
 * reemplazada por una modificación ya no esperan ninguna firma.
 */
export function ordenesPorAprobar({ ordenes = [], lineasDeOrdenes = {}, rubros = [] } = {}) {
  const porId = new Map(rubros.map(r => [String(r.id), r]));
  const filas = ordenes
    .filter(o => (o.estado === "borrador" || o.estado === "enviada") && !o.anulada && !o.reemplazada_at)
    .map(o => {
      const ls = lineasDeOrdenes[o.id] || [];
      const agrega = ls.filter(l => l.tipo !== "quita");
      const conSuCosto = agrega.filter(l => n(l.costo_unitario) > 0);
      const dejan = c2(conSuCosto.reduce((t, l) => t + (n(l.precio_unitario) - n(l.costo_unitario)) * n(l.cantidad), 0));
      const sacan = c2(ls.filter(l => l.tipo === "quita" && l.obra_rubro_id).reduce((t, l) => {
        const r = porId.get(String(l.obra_rubro_id));
        const precio = r && conCosto(r) ? precioDelContrato(r) : null;
        return precio == null ? t : t + (precio - n(r.costo_unitario)) * Math.min(n(l.cantidad), n(r.cantidad));
      }, 0));
      return {
        id: o.id, codigo: codigoDe(o), titulo: o.titulo || "", estado: o.estado,
        esModificacion: !!o.revision_de, partidas: ls.length,
        dejan, sacan, sinCosto: agrega.length - conSuCosto.length,
        beneficio: c2(dejan - sacan),
      };
    })
    .filter(x => x.partidas > 0);
  return { filas, total: c2(filas.reduce((t, x) => t + x.beneficio, 0)) };
}

export function resultadoDeLaObra({ beneficios = [], rubros = [], seguidos = [], porRubro = {}, ordenes = [], lineasDeOrdenes = {}, deltas = {}, modalidad = "rubros" } = {}) {
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
  const aprobados = beneficioDeLoAprobado({ rubros, beneficios, reducciones: reduccionesAprobadas(ordenes, lineasDeOrdenes), deltas, modalidad });
  return {
    conPapel: t.neto, cuantosConPapel: t.cuantos,
    previsto: t.previsto, cuantosPrevistos: t.cuantosPrevistos,
    perdidas: perdidas.filas, perdidasTotal: perdidas.total,
    seguimiento, ganadoEnSeguidos,
    // Lo que deja lo ya aprobado, rubro por rubro.
    aprobados,
    // Lo que dejarían las órdenes que esperan firma: a la vista, sin sumar.
    porAprobar: ordenesPorAprobar({ ordenes, lineasDeOrdenes, rubros }),
    // LO YA APROBADO ES BENEFICIO, Y SUMA. Un rubro que el cliente aprobó a un
    // precio y del que se sabe el costo ya dejó esa diferencia: no es una
    // promesa de una proforma, es el contrato. Y cierra con lo demás: si
    // después el rubro gasta más que su costo, esa pérdida entra por los
    // pasados, y la suma de las dos es lo que de verdad dejó —precio menos lo
    // gastado—.
    neto: c2(t.neto + perdidas.total + ganadoEnSeguidos + aprobados.total),
  };
}
