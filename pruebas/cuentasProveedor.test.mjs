import test from "node:test";
import assert from "node:assert/strict";
import { cuentasPorProveedor, totalesPorPagar } from "../src/modules/controlObra/cuentasProveedor.js";

const kywi = [
  { id: 1, ruc: "0990123456001", razon_social: "COMERCIAL KYWI S.A.", clase: "factura", total: 500 },
  { id: 2, ruc: "0990123456001", razon_social: "COMERCIAL KYWI S.A.", clase: "nota_credito", total: -99.97 },
];

test("una nota de crédito no baja lo que le debemos", () => {
  const [c] = cuentasPorProveedor(kywi, []);
  assert.equal(c.facturado, 500);
  assert.equal(c.saldo, 500);
  assert.equal(c.credito, 99.97);
});

test("la nota de crédito usada deja de estar a favor", () => {
  const [c] = cuentasPorProveedor([kywi[0], { ...kywi[1], facturada_con_id: 1 }], []);
  assert.equal(c.credito, 0);
  assert.equal(c.creditoUsado, 99.97);
  assert.equal(c.saldo, 500);
});

test("un documento en negativo sin clase también es crédito", () => {
  const [c] = cuentasPorProveedor([kywi[0], { id: 3, ruc: kywi[0].ruc, clase: "otro", total: -10 }], []);
  assert.equal(c.credito, 10);
  assert.equal(c.saldo, 500);
});

test("el crédito no se mezcla con lo pagado", () => {
  const [c] = cuentasPorProveedor(kywi, [{ factura_id: 1, monto: 200 }]);
  assert.equal(c.pagado, 200);
  assert.equal(c.saldo, 300);
  assert.equal(c.credito, 99.97);
});

test("los totales llevan el crédito aparte", () => {
  const t = totalesPorPagar(cuentasPorProveedor(kywi, [{ factura_id: 1, monto: 200 }]));
  assert.equal(t.saldo, 300);
  assert.equal(t.credito, 99.97);
  assert.equal(t.facturado, 500);
});

test("cada proveedor tiene su propio crédito", () => {
  const cs = cuentasPorProveedor([...kywi,
    { id: 9, ruc: "1790727203001", razon_social: "AVIANCA - ECUADOR S.A.", clase: "factura", total: 100 }], []);
  assert.equal(cs.find(c => c.ruc === "1790727203001").credito, 0);
  assert.equal(cs.find(c => c.ruc === "0990123456001").credito, 99.97);
});
