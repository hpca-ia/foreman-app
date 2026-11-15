// Lo que una orden de cambio quita —su renglón en negativo— no recibe gasto.
// Con los rubros reales de las agrupaciones de la OC-01 y la OC-03 del
// Aeropuerto (15/11/2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calcularControl, gastosDe, recibeGasto, agrupar } from "../src/modules/controlObra/calculos.js";
import { gastosEnRubroQuitado, alertasDeLaObra } from "../src/modules/controlObra/contadoDosVeces.js";

const r = (id, numero, descripcion, total_base, actividad_id, mas = {}) => ({ id, obra_id: 13, numero, descripcion, total_base, actividad_id, capitulo: "OC", capitulo_orden: 90, orden: numero, origen: "orden_cambio", ...mas });
const RUBROS = [
  // OC-01 · agrupación 195 «PISO PULIDO DE HORMIGÓN EN COLOR BLANCO»
  r(1433, 9100, "FUNDICIÓN DE LOSA EN CEMENTO BLANCO PULIDO", 10830.22, 195),
  r(1434, 9101, "PICADO DE MASILLADO Y LOSA 7 CM", 511.27, 195),
  r(1435, 9102, "TENDIDO DE MALLA ELECTROSOLDADA 10X10X3", 879.61, 195),
  r(1436, 9103, "DESALOJO Y ESTIBAJE DE MATERIALES", 287.50, 195),
  r(1440, 9190, "(–) PISO DE MICROCEMENTO PULIDO COLOR BLANCO", -8658.68, 195),
  // OC-03 · agrupación 196
  r(1444, 9300, "RESANE DE FIBROCEMENTO EN TUMBADO", 538.20, 196),
  r(1447, 9303, "PINTURA DE TUMBADO FIBROCEMENTO", 385.71, 196),
  r(1448, 9304, "(–) TUMBADO GYPSUM PLANO REGULAR", -1005.09, 196),
];
const actividades = [{ id: 195, nombre: "PISO PULIDO DE HORMIGON EN COLOR BLANCO", orden: 30 }, { id: 196, nombre: "RESANE Y PINTURA DE CIELO", orden: 31 }];
const f = (id, total, mas = {}) => ({ id, obra_id: 13, total, clase: "factura", fecha: "2026-11-09", _planillaNumero: 2, razon_social: `Proveedor ${id}`, ...mas });

test("un rubro en negativo, o tachado por una orden, no recibe gasto; uno en cero sí", () => {
  assert.equal(recibeGasto(RUBROS[4]), false);
  assert.equal(recibeGasto({ total_base: 500, anulado_por_oc: 7 }), false);
  assert.equal(recibeGasto({ total_base: 0 }), true);
  assert.equal(recibeGasto(RUBROS[0]), true);
  assert.equal(recibeGasto(null), false);
});

test("LO QUE ESTABA MAL: lo asignado a la agrupación de la OC-01 se repartía también al negativo", () => {
  // $653,23 de caja chica asignados a la agrupación entera, todo pagado.
  const facturas = [f(1, 653.23)];
  const asignaciones = [{ factura_id: 1, obra_actividad_id: 195, monto: 653.23 }];
  const c = calcularControl({ rubros: RUBROS, facturas, asignaciones, pagos: [{ factura_id: 1, monto: 653.23 }] });
  // El negativo no recibe nada.
  assert.equal(c[1440].acumulado, 0);
  // Los demás, a prorrata de lo que pesan entre ELLOS: $12.508,60.
  const base = 10830.22 + 511.27 + 879.61 + 287.50;
  // (al centavo: los que sobran del redondeo van a los más grandes)
  assert.ok(Math.abs(c[1433].acumulado - 653.23 * 10830.22 / base) < 0.02);
  assert.ok(Math.abs(c[1434].acumulado - 653.23 * 511.27 / base) < 0.02);
  // Y suman lo asignado, al centavo.
  const suma = [1433, 1434, 1435, 1436].reduce((t, id) => t + c[id].acumulado, 0);
  assert.equal(Math.round(suma * 100) / 100, 653.23);
  // Ninguno se pasa por un reparto: el picado de masillado ya no sale al 148%.
  assert.ok(c[1434].acumulado < 511.27);
});

test("la agrupación entera suma lo mismo que antes: solo cambia a qué rubro le toca", () => {
  const facturas = [f(1, 653.23), f(2, 98.45)];
  const asignaciones = [{ factura_id: 1, obra_actividad_id: 195, monto: 653.23 }, { factura_id: 2, obra_actividad_id: 196, monto: 98.45 }];
  const porRubro = calcularControl({ rubros: RUBROS, facturas, asignaciones, pagos: [] });
  const grupos = agrupar(RUBROS, porRubro, "actividad", actividades);
  const g = clave => grupos.find(x => x.clave === clave);
  assert.equal(Math.round(g("a195").acumulado * 100) / 100, 653.23);
  assert.equal(Math.round(g("a196").acumulado * 100) / 100, 98.45);
  // Y su presupuesto sigue siendo el de la orden: lo que agrega menos lo que quita.
  assert.equal(Math.round(g("a195").base * 100) / 100, 3849.92);
});

test("el detalle de un rubro dice la misma plata que su fila", () => {
  const facturas = [f(1, 653.23)];
  const asignaciones = [{ factura_id: 1, obra_actividad_id: 195, monto: 653.23 }];
  const c = calcularControl({ rubros: RUBROS, facturas, asignaciones, pagos: [] });
  for (const id of [1433, 1434, 1435, 1436, 1440]) {
    const det = gastosDe({ rubroId: id }, { facturas, asignaciones, rubros: RUBROS });
    const suma = Math.round(det.reduce((t, x) => t + x.monto, 0) * 100) / 100;
    assert.equal(suma, Math.round(c[id].acumulado * 100) / 100, `rubro ${id}`);
  }
  assert.deepEqual(gastosDe({ rubroId: 1440 }, { facturas, asignaciones, rubros: RUBROS }), []);
});

test("si en la agrupación solo queda el negativo, lo asignado no se reparte: queda a la agrupación", () => {
  const solo = [r(1, 1, "nuevo", 0, 300), r(2, 2, "(–) quitado", -500, 300)];
  const c = calcularControl({ rubros: [r(2, 2, "(–) quitado", -500, 300)], facturas: [f(1, 40)], asignaciones: [{ factura_id: 1, obra_actividad_id: 300, monto: 40 }], pagos: [] });
  assert.equal(c[2].acumulado, 0);
  assert.equal(c._porActividad[300].anterior + c._porActividad[300].periodo, 40);
  // Con un rubro en cero al lado, va a ese.
  const c2 = calcularControl({ rubros: solo, facturas: [f(1, 40)], asignaciones: [{ factura_id: 1, obra_actividad_id: 300, monto: 40 }], pagos: [] });
  assert.equal(c2[1].acumulado, 40);
  assert.equal(c2[2].acumulado, 0);
});

// ── Lo que ya quedó asignado directo al negativo ──
const DIRECTAS = [
  { id: 407, factura_id: 185, obra_rubro_id: 1440, monto: 269.94 },
  { id: 413, factura_id: 191, obra_rubro_id: 1440, monto: 1.00 },
  { id: 442, factura_id: 219, obra_rubro_id: 1440, monto: 143.32 },
  { id: 445, factura_id: 222, obra_rubro_id: 1440, monto: 6.00 },
  { id: 500, factura_id: 300, obra_rubro_id: 1433, monto: 50 },
];
const FACTURAS = [
  f(185, 269.94, { fecha: "2026-11-06", razon_social: "GERARDO ORTIZ E HIJOS CIA LTDA", origen: "caja_chica" }),
  f(191, 1.00, { fecha: "2026-11-09", razon_social: "CANDY CUP", origen: "caja_chica" }),
  f(219, 143.32, { fecha: "2026-11-10", razon_social: "COMERCIAL KYWI S.A.", origen: "caja_chica" }),
  f(222, 6.00, { fecha: "2026-11-10", razon_social: "COMERCIAL KYWI S.A.", origen: "caja_chica" }),
  f(300, 50, {}),
];

test("LOS CUATRO DE CAJA CHICA asignados directo al negativo aparecen en Alertas", () => {
  const r2 = gastosEnRubroQuitado({ rubros: RUBROS, facturas: FACTURAS, asignaciones: DIRECTAS });
  assert.deepEqual(r2.map(x => [x.factura.id, x.asignacion.monto, x.rubro.numero]), [[219, 143.32, 9190], [222, 6, 9190], [191, 1, 9190], [185, 269.94, 9190]]);
  assert.equal(Math.round(r2.reduce((t, x) => t + x.asignacion.monto, 0) * 100) / 100, 420.26);
  const a = alertasDeLaObra({ rubros: RUBROS, facturas: FACTURAS, asignaciones: DIRECTAS });
  assert.equal(a.enQuitados.length, 4);
  assert.ok(a.cuantas >= 4);
});

test("sin rubros quitados no hay nada que avisar", () => {
  assert.deepEqual(gastosEnRubroQuitado({ rubros: RUBROS.filter(x => x.total_base > 0), facturas: FACTURAS, asignaciones: DIRECTAS }), []);
  assert.deepEqual(gastosEnRubroQuitado({}), []);
});

test("el renglón quitado no se ofrece para asignar en caja chica, en la factura del control ni en Compras", () => {
  const leer = p => readFileSync(new URL(p, import.meta.url), "utf8");
  assert.match(leer("../src/modules/cajaChica/SelectorActividad.jsx"), /filter\(r => !r\.oculto && recibeGasto\(r\)\)/);
  assert.match(leer("../src/modules/ModuloCajaChica.jsx"), /setRubrosObra\(\(data \|\| \[\]\)\.filter\(r => !r\.oculto && recibeGasto\(r\)\)\)/);
  const modal = leer("../src/modules/controlObra/ModalFactura.jsx");
  assert.equal((modal.match(/recibeGasto\(r\)/g) || []).length, 3);
  assert.match(leer("../src/modules/compras/ModalSolicitud.jsx"), /!\(Number\(r\.total_base\) < 0\)/);
});
