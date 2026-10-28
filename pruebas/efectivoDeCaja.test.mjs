import test from "node:test";
import assert from "node:assert/strict";
import { efectivoDe, efectivoGastado, valesPorUsar, estadoDeLaCaja } from "../src/modules/cajaChica/efectivo.js";

// El caso real: KYWI devolvió $105,06 en dos notas de crédito y con eso se
// pagaron dos compras posteriores; el resto salió del efectivo.
const vale1 = { id: 97, tipo: "nota_credito", monto: -99.97, obra_factura_id: 103 };
const vale2 = { id: 78, tipo: "nota_credito", monto: -5.09, obra_factura_id: 82 };
const compra1 = { id: 92, tipo: "factura", monto: 97.05, obra_factura_id: 98, pagado_con_nota: 97.05 };
const compra2 = { id: 95, tipo: "factura", monto: 21.17, obra_factura_id: 101, pagado_con_nota: 8.01 };
// Los pagos del control: el vale de $99,97 se repartió entre las dos compras.
const pagos = [
  { factura_id: 98, monto: 97.05, nota_credito_id: 103 },
  { factura_id: 101, monto: 2.92, nota_credito_id: 103 },
  { factura_id: 101, monto: 5.09, nota_credito_id: 82 },
  { factura_id: 101, monto: 13.16 },
];

test("un vale no devuelve billetes a la caja", () => {
  assert.equal(efectivoDe(vale1), 0);
  assert.equal(efectivoDe(vale2), 0);
});

test("lo pagado con el vale no sale de la caja; la diferencia sí", () => {
  assert.equal(efectivoDe(compra1), 0);
  assert.equal(efectivoDe(compra2), 13.16);
});

test("un gasto normal sale entero", () => {
  assert.equal(efectivoDe({ monto: 40 }), 40);
  assert.equal(efectivoDe({ monto: 40, pagado_con_nota: null }), 40);
});

test("el vale no puede pagar más que el gasto", () => {
  assert.equal(efectivoDe({ monto: 10, pagado_con_nota: 50 }), 0);
});

test("el efectivo de estas cuatro líneas es la compra que sí se pagó", () => {
  assert.equal(efectivoGastado([vale1, vale2, compra1, compra2]), 13.16);
});

test("un vale usado en parte sigue valiendo el resto", () => {
  const { vales, total } = valesPorUsar([vale2], [{ factura_id: 101, monto: 3, nota_credito_id: 82 }]);
  assert.equal(total, 2.09);
  assert.equal(vales[0].disponible, 2.09);
  assert.equal(vales[0].usado, 3);
});

test("un vale sin usar está entero y se ve aparte del efectivo", () => {
  const e = estadoDeLaCaja({
    anticipos: [{ monto: 1000 }],
    gastos: [{ monto: 200 }, vale1],
  });
  assert.equal(e.gastado, 200);
  assert.equal(e.disponible, 800);
  assert.equal(e.enVales, 99.97);
});

test("aplicado el vale, la caja dice lo mismo que antes pero por la razón correcta", () => {
  const e = estadoDeLaCaja({ anticipos: [{ monto: 1000 }], gastos: [vale1, vale2, compra1, compra2], pagos });
  assert.equal(e.gastado, 13.16);
  assert.equal(e.enVales, 0);
  assert.equal(e.disponible, 986.84);
});
