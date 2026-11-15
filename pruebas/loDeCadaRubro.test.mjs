// El presupuesto al costado del pedido de Compras: debajo de cada rubro,
// cuánto lleva gastado y cuánto está pedido, en porcentaje de lo que tiene.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loDeCadaRubro } from "../src/modules/compras/presupuestoDelDestino.js";

const rubros = [
  { id: 1, numero: 1, descripcion: "Hormigón", total_base: 1000, actividad_id: 10, capitulo: "OBRA CIVIL" },
  { id: 2, numero: 2, descripcion: "Gypsum", total_base: 2000, actividad_id: 10, capitulo: "ACABADOS" },
  { id: 3, numero: 3, descripcion: "Pintura", total_base: 500, actividad_id: 11, capitulo: "ACABADOS" },
  { id: 4, numero: 4, descripcion: "Sin plata", total_base: 0, actividad_id: 11, capitulo: "ACABADOS" },
];
const facturas = [{ id: 100, obra_id: 1, clase: "factura", total: 600, fecha: "2026-11-01", planilla_id: 5, _planillaNumero: 1 }, { id: 101, obra_id: 1, clase: "factura", total: 50, fecha: "2026-11-01", planilla_id: 5, _planillaNumero: 1 }];
const asignaciones = [{ factura_id: 100, obra_rubro_id: 1, monto: 600 }, { factura_id: 101, obra_rubro_id: 4, monto: 50 }];
const solicitudes = [
  { id: 7, estado: "aprobada", obra_rubro_id: 1, monto_estimado: 500, factura_id: null },
  { id: 8, estado: "aprobada", obra_rubro_id: 2, monto_estimado: 400, factura_id: null },
  { id: 9, estado: "pendiente_aprobacion", obra_rubro_id: 3, monto_estimado: 100, factura_id: null },
];

test("gastado y pedido en porcentaje; el que se pasa se marca", () => {
  const r = loDeCadaRubro({ solicitud: { id: 99 }, rubros, facturas, asignaciones, pagos: [], solicitudes, adjuntos: [] });
  assert.deepEqual(r[1], { texto: "gastado 60% · en pedidos 50% — se pasa", alerta: true });
  assert.deepEqual(r[2], { texto: "en pedidos 20%", alerta: false });
});

test("lo que espera el visto no cuenta como pedido; sin nada no hay línea", () => {
  const r = loDeCadaRubro({ solicitud: { id: 99 }, rubros, facturas, asignaciones, pagos: [], solicitudes, adjuntos: [] });
  assert.equal(r[3], undefined);
});

test("un rubro sin presupuesto con gasto se avisa", () => {
  const r = loDeCadaRubro({ solicitud: { id: 99 }, rubros, facturas, asignaciones, pagos: [], solicitudes, adjuntos: [] });
  assert.equal(r[4].alerta, true);
});

test("el pedido que se está mirando no se cuenta a sí mismo", () => {
  const r = loDeCadaRubro({ solicitud: { id: 8 }, rubros, facturas, asignaciones, pagos: [], solicitudes, adjuntos: [] });
  assert.equal(r[2], undefined);
});
