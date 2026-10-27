import test from "node:test";
import assert from "node:assert/strict";
import { proveedoresDeTodo, totalesDeTodo, buscar } from "../src/modules/controlObra/proveedoresGlobal.js";

const nombre = id => ({ 1: "Plaza Lagos", 2: "Aeropuerto" }[id] || "");
const facturas = [
  { id: 10, obra_id: 1, ruc: "0990123456001", razon_social: "KYWI", clase: "factura", total: 300, fecha: "2026-09-01" },
  { id: 11, obra_id: 2, ruc: "0990123456001", razon_social: "COMERCIAL KYWI S.A.", clase: "factura", total: 200, fecha: "2026-10-01" },
  { id: 12, obra_id: 2, ruc: "0990123456001", razon_social: "KYWI", clase: "nota_credito", total: -50, fecha: "2026-10-05" },
  { id: 13, obra_id: 2, ruc: "1790727203001", razon_social: "AVIANCA - ECUADOR S.A.", clase: "factura", total: 113.37, fecha: "2026-10-02" },
  { id: 14, obra_id: 1, ruc: "0990123456001", razon_social: "KYWI", clase: "proforma", total: 9999, fecha: "2026-10-09" },
];
const pagos = [{ factura_id: 10, monto: 300 }, { factura_id: 11, monto: 50 }];

test("junta al mismo proveedor de todas las obras", () => {
  const [kywi] = proveedoresDeTodo(facturas, pagos, nombre);
  assert.equal(kywi.ruc, "0990123456001");
  assert.equal(kywi.comprado, 500);
  assert.equal(kywi.pagado, 350);
  assert.equal(kywi.saldo, 150);
  assert.equal(kywi.obras.length, 2);
});

test("y dice cuánto compró cada obra, con sus facturas", () => {
  const [kywi] = proveedoresDeTodo(facturas, pagos, nombre);
  const aero = kywi.obras.find(o => o.obraId === 2);
  assert.equal(aero.nombre, "Aeropuerto");
  assert.equal(aero.comprado, 200);
  assert.deepEqual(aero.documentos.map(d => d.id), [12, 11]);   // la más nueva arriba
});

test("el vale es crédito, no compra", () => {
  const [kywi] = proveedoresDeTodo(facturas, pagos, nombre);
  assert.equal(kywi.credito, 50);
  assert.equal(kywi.comprado, 500);
});

test("un vale ya usado deja de estar a favor", () => {
  const usada = facturas.map(f => (f.id === 12 ? { ...f, facturada_con_id: 11 } : f));
  const [kywi] = proveedoresDeTodo(usada, pagos, nombre);
  assert.equal(kywi.credito, 0);
});

test("una proforma no es una compra", () => {
  const [kywi] = proveedoresDeTodo(facturas, pagos, nombre);
  assert.equal(kywi.documentos, 3);
});

test("gana el nombre más completo", () => {
  const [kywi] = proveedoresDeTodo(facturas, pagos, nombre);
  assert.equal(kywi.nombre, "COMERCIAL KYWI S.A.");
});

test("los totales y la búsqueda", () => {
  const cs = proveedoresDeTodo(facturas, pagos, nombre);
  assert.deepEqual(totalesDeTodo(cs), { proveedores: 2, comprado: 613.37, pagado: 350, saldo: 263.37, credito: 50 });
  assert.equal(buscar(cs, "avianca").length, 1);
  assert.equal(buscar(cs, "0990123").length, 1);
  assert.equal(buscar(cs, "").length, 2);
});
