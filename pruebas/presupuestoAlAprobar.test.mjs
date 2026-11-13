// El presupuesto a la vista de quien aprueba una compra: la misma cuenta del
// control de obra, leída para el rubro o la agrupación del pedido.
import { test } from "node:test";
import assert from "node:assert/strict";
import { presupuestoDelDestino } from "../src/modules/compras/presupuestoDelDestino.js";
import { calcularControl, comprometidoPorGrupo, agrupar } from "../src/modules/controlObra/calculos.js";

const rubros = [
  { id: 1311, obra_id: 13, numero: 45, descripcion: "Piso laminado", capitulo: "PISOS", capitulo_orden: 9, orden: 1, total_base: 5000, actividad_id: 169 },
  { id: 1312, obra_id: 13, numero: 46, descripcion: "Porcelanato", capitulo: "PISOS", capitulo_orden: 9, orden: 2, total_base: 3000, actividad_id: 169 },
  { id: 1400, obra_id: 13, numero: 60, descripcion: "Gypsum", capitulo: "TUMBADOS", capitulo_orden: 10, orden: 1, total_base: 4000, actividad_id: 167 },
];
const actividades = [
  { id: 167, obra_id: 13, nombre: "Tumbados y paredes", orden: 8 },
  { id: 169, obra_id: 13, nombre: "Pisos", orden: 9 },
  { id: 193, obra_id: 13, nombre: "Vivienda residentes", orden: 20, extra: true, presupuesto: 0 },
];
const facturas = [
  { id: 1, obra_id: 13, total: 1200, clase: "factura", _planillaNumero: 1 },
  { id: 2, obra_id: 13, total: 575, clase: "factura", _planillaNumero: 1 },
];
const asignaciones = [
  { id: 1, factura_id: 1, obra_rubro_id: 1311, monto: 1200 },
  { id: 2, factura_id: 2, obra_actividad_id: 193, monto: 575 },
];
const pagos = [{ factura_id: 1, monto: 1200 }, { factura_id: 2, monto: 575 }];
const s = (id, mas) => ({ id, lead_id: 15, obra_id: null, descripcion: `pedido ${id}`, estado: "aprobada", monto: null, monto_estimado: null, factura_id: null, obra_rubro_id: null, obra_actividad_id: null, ...mas });
const ESTE = s(30, { estado: "pendiente_aprobacion", obra_rubro_id: 1311, obra_actividad_id: 169, monto_estimado: 900 });
const solicitudes = [
  ESTE,
  s(31, { obra_rubro_id: 1311, obra_actividad_id: 169, monto_estimado: 400 }),                       // aprobado, mismo rubro
  s(32, { estado: "pendiente_aprobacion", obra_actividad_id: 169, monto_estimado: 250 }),            // espera visto, misma agrupación
  s(33, { estado: "comprada", obra_rubro_id: 1312, obra_actividad_id: 169, monto: 600 }),            // comprado, sin documento todavía
  s(34, { estado: "recibida", obra_rubro_id: 1311, monto: 1200, factura_id: 1 }),                    // ya está en el control
  s(35, { estado: "requiere_info", obra_rubro_id: 1311, monto_estimado: 9999 }),                     // devuelto: no es plata de la obra
  s(36, { obra_actividad_id: 193, monto_estimado: 575 }),                                            // otra agrupación
];
const todo = { rubros, actividades, facturas, asignaciones, pagos, solicitudes, adjuntos: [] };
const de = (destino, solicitud = ESTE, mas = {}) => presupuestoDelDestino({ ...todo, ...mas, destino, solicitud });

test("LO QUE PIDIÓ: al aprobar se ve cuánto tenía el rubro, cuánto va, cuánto está hablado y cuánto quedaría", () => {
  const p = de({ obra_rubro_id: 1311, obra_actividad_id: 169 });
  assert.deepEqual(p.principal, {
    tipo: "rubro", nombre: "45. Piso laminado",
    presupuesto: 5000, invertido: 1200, saldo: 3800,
    comprometido: 400, cuantos: 1, porAprobar: 0, cuantosPorAprobar: 0,
    disponible: 3400, quedaria: 2500, sinPresupuesto: false,
  });
  assert.equal(p.estePedido, 900);
  assert.equal(p.deDonde, "estimado");
});

test("cuando apunta a un rubro, también dice cómo queda su agrupación entera", () => {
  const p = de({ obra_rubro_id: 1311, obra_actividad_id: 169 });
  assert.deepEqual(p.agrupacion, {
    tipo: "agrupacion", nombre: "Pisos",
    presupuesto: 8000, invertido: 1200, saldo: 6800,
    // El aprobado del rubro y lo ya comprado sin documento del otro rubro.
    comprometido: 1000, cuantos: 2,
    // El que espera el visto se dice aparte: no está descontado.
    porAprobar: 250, cuantosPorAprobar: 1,
    disponible: 5800, quedaria: 4900, sinPresupuesto: false,
  });
});

test("si apunta a toda la agrupación, la cuenta es la de la agrupación y no hay segundo cuadro", () => {
  const p = de({ obra_rubro_id: null, obra_actividad_id: 169 }, { ...ESTE, obra_rubro_id: null });
  assert.equal(p.principal.tipo, "agrupacion");
  assert.equal(p.principal.disponible, 5800);
  assert.equal(p.agrupacion, null);
});

test("ES LA CUENTA DEL CONTROL: presupuestado y gastado son los de su tabla, agrupación por agrupación", () => {
  const porRubro = calcularControl({ rubros, facturas, asignaciones, pagos, planillaNumero: null });
  const grupos = agrupar(rubros, porRubro, "actividad", actividades, comprometidoPorGrupo(solicitudes, rubros, []));
  for (const a of actividades) {
    const g = grupos.find(x => x.clave === `a${a.id}`);
    const p = de({ obra_actividad_id: a.id }, { ...ESTE, obra_rubro_id: null, obra_actividad_id: a.id });
    assert.equal(p.principal.presupuesto, g.base, `presupuesto de ${a.nombre}`);
    assert.equal(p.principal.invertido, g.acumulado, `invertido de ${a.nombre}`);
    assert.equal(p.principal.saldo, g.saldo, `saldo de ${a.nombre}`);
  }
});

test("este pedido no se cuenta dos veces: sale de «otros pedidos» y entra una sola vez, abajo", () => {
  // El mismo pedido, ya aprobado: sigue sin estar entre los «otros».
  const p = de({ obra_rubro_id: 1311 }, { ...ESTE, estado: "aprobada" });
  assert.equal(p.principal.comprometido, 400);
  assert.equal(p.principal.quedaria, 2500);
});

test("el estimado que se está escribiendo cambia el «quedaría» sin guardar nada", () => {
  assert.equal(de({ obra_rubro_id: 1311 }, { ...ESTE, monto_estimado: 3500 }).principal.quedaria, -100);
  assert.equal(de({ obra_rubro_id: 1311 }, { ...ESTE, monto_estimado: null }).principal.quedaria, 3400);
  assert.equal(de({ obra_rubro_id: 1311 }, { ...ESTE, monto_estimado: null }).estePedido, 0);
});

test("si el pedido tiene cotización, vale la cotización y no el estimado", () => {
  const p = de({ obra_rubro_id: 1311 }, ESTE, { adjuntos: [{ id: 1, solicitud_id: 30, tipo: "cotizacion", monto: 1100 }] });
  assert.equal(p.estePedido, 1100);
  assert.equal(p.deDonde, "su única proforma");
  assert.equal(p.principal.quedaria, 2300);
});

test("corregir contra qué va rehace la cuenta con el otro rubro", () => {
  const p = de({ obra_rubro_id: 1400, obra_actividad_id: 167 });
  assert.equal(p.principal.nombre, "60. Gypsum");
  assert.deepEqual([p.principal.presupuesto, p.principal.invertido, p.principal.comprometido, p.principal.quedaria], [4000, 0, 0, 3100]);
  assert.equal(p.agrupacion.nombre, "Tumbados y paredes");
});

test("una agrupación sin presupuesto lo dice: lo que se gaste ahí es por fuera", () => {
  const p = de({ obra_actividad_id: 193 }, s(40, { estado: "pendiente_aprobacion", obra_actividad_id: 193, monto_estimado: 575 }));
  assert.equal(p.principal.sinPresupuesto, true);
  assert.equal(p.principal.invertido, 575);
  assert.equal(p.principal.comprometido, 575);   // el del mes que ya está aprobado
});

test("un pedido que no apunta a nada del presupuesto no tiene cuenta que mostrar", () => {
  assert.equal(de({ obra_rubro_id: null, obra_actividad_id: null }), null);
  assert.equal(de({ obra_rubro_id: 999999 }), null);
  assert.equal(de({}), null);
});

test("un rubro que una orden de cambio sacó del contrato no tiene presupuesto", () => {
  const tachados = rubros.map(r => (r.id === 1400 ? { ...r, anulado_por_oc: 7 } : r));
  const p = de({ obra_rubro_id: 1400 }, ESTE, { rubros: tachados });
  assert.equal(p.principal.presupuesto, 0);
  assert.equal(p.principal.sinPresupuesto, true);
});
