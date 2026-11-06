// CADA ORDEN DE CAMBIO APROBADA TIENE SU AGRUPACIÓN.
//
// Una compra se pide contra una AGRUPACIÓN —obra civil, iluminación— y, si se
// sabe, contra un rubro de esa agrupación. Así se pide en Compras, así se
// apunta un gasto de caja chica y así se reparte una factura.
//
// Una orden aprobada mete sus rubros al control, pero entraban sin agrupación:
// estaban en el presupuesto y en el control, sumaban al contrato vigente, y no
// había desde dónde comprarles nada. En el desplegable de Compras no aparecían
// —se elige primero la agrupación y ellos no estaban en ninguna—, así que lo
// que se compraba para un adicional se cargaba a otro rubro o quedaba suelto.
//
// La orden es, para la obra, un trabajo más que se ejecuta: su agrupación es
// ella misma. «OC-01 · Piso pulido de hormigón», con sus partidas adentro.
// Con eso aparece sola en todos los lugares donde se elige contra qué va un
// gasto, sin enseñarle nada nuevo a ninguna pantalla.
//
// REGLAS
//   · Una agrupación por orden, con su código: OC-01. Una modificación
//     —OC-04-A— es de la 04 y va a la misma.
//   · Solo se acomoda lo que no tiene agrupación. Si alguien mudó una partida
//     a otra a mano, se respeta: sabía por qué.
//   · El honorario de la orden no es un trabajo: va con el honorario del
//     contrato, si ese está en alguna agrupación. Si no, se queda como está.
//
// Sin base de datos: dice qué falta crear y qué hay que mudar.

import { numeroPrincipal, codigoPrincipal } from "./numeracionDeOrdenes.js";

/** Con qué origen quedan marcadas, para saber que las armó el sistema. */
export const ORIGEN_ORDEN = "orden_cambio";
/** Dónde se ordenan: después de las del contrato (1, 2, 3…) y antes de las extras (9001…). */
export const ORDEN_BASE = 8000;

const esHonorario = r => /honorario/i.test(r?.capitulo || "") || /honorario/i.test(r?.descripcion || "");
const viva = o => o?.estado === "aprobada" && !o?.anulada && !o?.reemplazada_at;
const mismoCodigo = (a, codigo) => String(a?.codigo || "").trim().toUpperCase() === codigo;

/** ¿Esta agrupación es la de una orden de cambio? */
export const esDeOrden = a => a?.origen === ORIGEN_ORDEN || /^OC-\d+$/i.test(String(a?.codigo || "").trim());

/**
 * Qué agrupaciones faltan y qué rubros hay que mudar.
 *
 * @param ordenes      las de la obra
 * @param rubros       los del control: id, capitulo, descripcion, origen, actividad_id, orden_cambio_id
 * @param actividades  las agrupaciones que la obra ya tiene: id, codigo
 * @returns {
 *   crear: [{ codigo, nombre, orden }],
 *   mover: [{ codigo | actividadId, rubros: [id] }]   // `codigo` cuando va a una que hay que crear
 * }
 */
export function loQueFaltaAgrupar({ ordenes = [], rubros = [], actividades = [] } = {}) {
  const crear = [];
  const mover = [];

  // Dónde está el honorario del contrato: ahí va el de cada orden.
  const delContrato = (rubros || []).find(r => r.origen !== "orden_cambio" && esHonorario(r) && r.actividad_id != null);
  const honorarios = [];

  for (const o of (ordenes || []).filter(viva)) {
    const suyos = (rubros || []).filter(r => Number(r.orden_cambio_id) === Number(o.id) && r.actividad_id == null);
    if (!suyos.length) continue;

    const trabajos = suyos.filter(r => !esHonorario(r));
    if (trabajos.length) {
      const numero = numeroPrincipal(o);
      const codigo = codigoPrincipal(numero);
      const ya = (actividades || []).find(a => mismoCodigo(a, codigo));
      if (!ya && !crear.some(x => x.codigo === codigo)) {
        crear.push({ codigo, nombre: String(o.titulo || "").trim() || "Orden de cambio", orden: ORDEN_BASE + numero });
      }
      const destino = ya ? { actividadId: ya.id } : { codigo };
      const junto = mover.find(m => (ya ? m.actividadId === ya.id : m.codigo === codigo));
      if (junto) junto.rubros.push(...trabajos.map(r => r.id));
      else mover.push({ ...destino, rubros: trabajos.map(r => r.id) });
    }
    if (delContrato) honorarios.push(...suyos.filter(esHonorario).map(r => r.id));
  }
  if (honorarios.length) mover.push({ actividadId: delContrato.actividad_id, rubros: honorarios });

  return { crear, mover };
}
