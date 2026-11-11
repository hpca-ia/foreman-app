// EN CUÁNTO VA CADA OBRA, EN UNA LÍNEA: presupuesto, invertido, y la plata
// cargada que todavía no está en ningún rubro.
//
// Es la cuenta de la lista de Control de Obra. Vive acá, sin base ni pantalla,
// porque la usan dos lugares —esa lista y la ficha de los proyectos aprobados
// («En marcha»)— y no pueden decir números distintos de la misma obra: es
// dinero. Si cambia la regla, cambia en los dos a la vez.

import { contratoDe } from "./contratoDeLaObra.js";

/**
 * @param obras         [{ id }]
 * @param rubros        los de esas obras: id, obra_id, total_base, origen, iva_pct,
 *                      anulado_por_oc, orden_cambio_id, oculto, descripcion, capitulo
 * @param facturas      [{ id, obra_id, total }]
 * @param asignaciones  [{ factura_id, monto }]
 * @returns { [obraId]: { base, invertido, rubros, sinAsignar, contrato } }
 */
export function resumenDeObras(obras = [], rubros = [], facturas = [], asignaciones = []) {
  const obraDeFactura = {};
  (facturas || []).forEach(f => { obraDeFactura[f.id] = f.obra_id; });

  const r = {};
  obras.forEach(o => { r[o.id] = { base: 0, invertido: 0, rubros: 0, sinAsignar: 0 }; });
  // El contrato de cada obra: lo firmado, lo que las órdenes le movieron y
  // en cuánto va hoy. En la base del control, que maneja IVA.
  const porObra = {};
  (rubros || []).forEach(x => { (porObra[x.obra_id] = porObra[x.obra_id] || []).push(x); });
  obras.forEach(o => { r[o.id].contrato = contratoDe(porObra[o.id] || []); });
  (rubros || []).forEach(x => {
    if (!r[x.obra_id]) return;
    // UN RUBRO TACHADO POR UNA ORDEN DE CAMBIO NO SUMA.
    //
    // Cuando una orden quita algo del contrato, no agrega una línea en
    // negativo: tacha el rubro original. El control de presupuesto ya lo
    // excluía; esta lista no, así que la OC-01 sumaba sus adiciones y no
    // restaba su reducción, y el presupuesto de la obra quedaba $8.658,68
    // más alto de lo que es.
    if (x.anulado_por_oc || x.oculto) return;
    r[x.obra_id].base += contratoDe([x]).vigente;
    r[x.obra_id].rubros += 1;
  });
  const asignadoPorFactura = {};
  (asignaciones || []).forEach(a => {
    const oid = obraDeFactura[a.factura_id];
    if (r[oid]) r[oid].invertido += Number(a.monto) || 0;
    asignadoPorFactura[a.factura_id] = (asignadoPorFactura[a.factura_id] || 0) + (Number(a.monto) || 0);
  });

  // Plata que entró pero no está en ningún rubro: no aparece en el control,
  // así que el avance se vería más bajo de lo real sin este aviso.
  (facturas || []).forEach(f => {
    if (!r[f.obra_id]) return;
    const pendiente = (Number(f.total) || 0) - (asignadoPorFactura[f.id] || 0);
    if (pendiente > 0.009) r[f.obra_id].sinAsignar += pendiente;
  });
  return r;
}

/** Las columnas de `obra_rubros` que hacen falta para esa cuenta. */
export const COLUMNAS_DE_RUBRO = "id,obra_id,total_base,origen,iva_pct,anulado_por_oc,orden_cambio_id,oculto,descripcion,capitulo";
