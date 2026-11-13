// EL PRESUPUESTO DE AQUELLO CONTRA LO QUE SE PIDE, PARA APROBAR MIRÁNDOLO.
//
// Quien aprueba una compra decide con la plata de un rubro o de una
// agrupación: cuánto tenía, cuánto se lleva gastado, cuánto ya está hablado en
// otros pedidos y cuánto queda si aprueba este. Hasta acá el pedido mostraba
// la cotización y el nombre del rubro, y el presupuesto había que ir a mirarlo
// a Control de Obra con el pedido de memoria.
//
// ES LA CUENTA DEL CONTROL, NO OTRA. Se arma con las mismas funciones que la
// tabla de Control de Obra —`calcularControl`, `agrupar`,
// `comprometidoPorGrupo`—, así que un rubro no puede decir un número acá y
// otro allá. Sin base ni pantalla: recibe las filas y devuelve la cuenta.

import { calcularControl, comprometidoPorGrupo, agrupar, montoDeSolicitud } from "../controlObra/calculos.js";

const n = v => Number(v) || 0;
const r2 = v => Math.round(n(v) * 100) / 100;
const mismo = (a, b) => a != null && b != null && Number(a) === Number(b);
// Ya se compró y su documento todavía no entró al control: plata que salió y
// no está en el invertido. Para quien aprueba pesa igual que lo comprometido.
const COMPRADAS = ["comprada", "recibida"];

/**
 * @param destino      { obra_rubro_id, obra_actividad_id }: lo que dice el
 *                     pedido AHORA, también si quien aprueba lo está corrigiendo
 * @param solicitud    el pedido que se está mirando
 * @param solicitudes  los pedidos de esa obra
 * @param adjuntos     las cotizaciones de esos pedidos (de ahí sale su monto)
 * @returns null si el pedido no apunta a nada del presupuesto; si no,
 *   { principal, agrupacion, estePedido, deDonde }
 *   `principal` es el rubro si apunta a uno, o la agrupación; `agrupacion` es
 *   la del rubro, cuando el principal es un rubro. Cada una:
 *   { tipo, nombre, presupuesto, invertido, saldo, comprometido, porAprobar,
 *     disponible, quedaria, cuantos, sinPresupuesto }
 */
export function presupuestoDelDestino({
  destino = {}, solicitud = {}, rubros = [], actividades = [], facturas = [], asignaciones = [], pagos = [],
  solicitudes = [], adjuntos = [],
}) {
  const rubro = destino.obra_rubro_id ? rubros.find(r => mismo(r.id, destino.obra_rubro_id)) || null : null;
  const actividadId = rubro ? rubro.actividad_id ?? null : destino.obra_actividad_id || null;
  const actividad = actividadId != null ? actividades.find(a => mismo(a.id, actividadId)) || null : null;
  if (!rubro && !actividad) return null;

  // Lo mismo que hace la pantalla del control, en el mismo orden.
  const porRubro = calcularControl({ rubros, facturas, asignaciones, pagos, planillaNumero: null });
  const otros = (solicitudes || []).filter(s => !mismo(s.id, solicitud.id));
  const comprometido = comprometidoPorGrupo(otros, rubros, adjuntos);
  const grupos = agrupar(rubros, porRubro, "actividad", actividades, comprometido);

  // Este pedido, con lo que dice ahora: el estimado que se está escribiendo le
  // gana al guardado.
  const este = montoDeSolicitud(solicitud, adjuntos);
  const estePedido = r2(este.monto);

  const actividadDe = s => {
    if (s.obra_rubro_id) return rubros.find(r => mismo(r.id, s.obra_rubro_id))?.actividad_id ?? null;
    return s.obra_actividad_id ?? null;
  };
  const cuenta = ({ tipo, nombre, base, invertido, deOtros, comprados }) => {
    const firmes = deOtros.filter(d => d.firme);
    const blandos = deOtros.filter(d => !d.firme);
    const yaComprado = comprados.reduce((t, s) => t + montoDeSolicitud(s, adjuntos).monto, 0);
    const hablado = r2(firmes.reduce((t, d) => t + d.monto, 0) + yaComprado);
    const saldo = r2(base - invertido);
    const disponible = r2(saldo - hablado);
    return {
      tipo, nombre,
      presupuesto: r2(base), invertido: r2(invertido), saldo,
      comprometido: hablado, cuantos: firmes.length + comprados.length,
      porAprobar: r2(blandos.reduce((t, d) => t + d.monto, 0)), cuantosPorAprobar: blandos.length,
      disponible, quedaria: r2(disponible - estePedido),
      // Sin presupuesto no hay «queda»: todo lo que se gaste ahí es por fuera.
      sinPresupuesto: !(base > 0),
    };
  };

  const delRubro = rubro && cuenta({
    tipo: "rubro",
    nombre: `${rubro.numero != null ? `${rubro.numero}. ` : ""}${rubro.descripcion || "Rubro"}`,
    base: rubro.anulado_por_oc ? 0 : n(rubro.total_base),
    invertido: n(porRubro[rubro.id]?.acumulado),
    deOtros: comprometido.detalle.filter(d => mismo(d.rubroId, rubro.id)),
    comprados: otros.filter(s => COMPRADAS.includes(s.estado) && !s.factura_id && mismo(s.obra_rubro_id, rubro.id)),
  });

  const grupo = actividad ? grupos.find(g => g.clave === `a${actividad.id}`) || null : null;
  const deLaAgrupacion = actividad && cuenta({
    tipo: "agrupacion",
    nombre: actividad.nombre || "Agrupación",
    base: n(grupo?.base), invertido: n(grupo?.acumulado),
    deOtros: comprometido.detalle.filter(d => d.claveAct === `a${actividad.id}`),
    comprados: otros.filter(s => COMPRADAS.includes(s.estado) && !s.factura_id && mismo(actividadDe(s), actividad.id)),
  });

  return {
    principal: delRubro || deLaAgrupacion,
    agrupacion: delRubro ? deLaAgrupacion || null : null,
    estePedido, deDonde: este.de,
  };
}
