import { test } from "node:test";
import assert from "node:assert/strict";
import { resumenDeTR, ERRORES_TR } from "../src/modules/controlObra/estadoDeLasTR.js";

// EL RESUMEN DE LAS TR (Hernán, 28/11/2026: «arma resumen de TR con
// errores»). Los casos son los del Aeropuerto, con sus números.

const completa = { id: 77, tr: 66, planilla_id: 1, clase: "factura", numero_factura: "001-001-000000123", archivo_url: "a.pdf",
  razon_social: "CASTRO ORTEGA JOSE JAVIER", total: 161, caja_gasto_id: 73, origen: "caja_chica" };
const errores = t => t.errores.map(e => e.clave);
const una = (r, tr) => r.trs.find(t => t.tr === tr);

test("la orden, el gasto de caja y la factura enganchados son una sola TR, y está completa", () => {
  const r = resumenDeTR({
    leadId: 15, facturas: [completa],
    solicitudes: [{ id: 12, tr: 66, estado: "recibida", factura_id: 77, descripcion: "Soldador" }],
    gastos: [{ id: 73, tr: 66, caja_id: 9, estado: "aprobado", obra_factura_id: 77, monto: 161 }],
    cajas: [{ id: 9, responsable_nombre: "Lizeth DLC" }],
  });
  assert.equal(r.trs.length, 1);
  assert.equal(r.trs[0].codigo, "PR15-TR66");
  assert.equal(r.trs[0].estado, "completa");
  assert.deepEqual(r.cuenta, { total: 1, completas: 1, enCurso: 0, conError: 0, anuladas: 0, porError: {} });
});

test("la ODC6: su factura no tiene papel ni número", () => {
  const r = resumenDeTR({
    leadId: 15,
    facturas: [{ id: 52, tr: 22, planilla_id: 1, clase: "factura", total: 184.92, razon_social: "Tello Freire Grecia Irene", origen: "manual" }],
    solicitudes: [{ id: 6, tr: 22, estado: "recibida", factura_id: 52, descripcion: "CAMISAS" }],
  });
  assert.deepEqual(errores(una(r, 22)), ["sin_papel", "sin_numero"]);
  assert.equal(una(r, 22).estado, "con_error");
  assert.equal(una(r, 22).monto, 184.92);
  assert.equal(una(r, 22).montoEsEstimado, false);
});

test("la ODC8: dice que tiene factura y en el control ya no está", () => {
  const r = resumenDeTR({ leadId: 15, facturas: [], solicitudes: [{ id: 8, tr: 24, estado: "recibida", factura_id: 27, descripcion: "VIVIENDA", monto: 575 }] });
  assert.deepEqual(errores(una(r, 24)), ["factura_borrada"]);
  assert.equal(una(r, 24).grave, true);
  // El monto es el de la orden: no hay gasto hecho que mostrar.
  assert.equal(una(r, 24).montoEsEstimado, true);
});

test("una orden comprada sin factura es un error; una sin comprar está en curso", () => {
  const r = resumenDeTR({ leadId: 15, solicitudes: [
    { id: 1, tr: 1, estado: "comprada", factura_id: null, descripcion: "cemento" },
    { id: 2, tr: 2, estado: "aprobada", factura_id: null, descripcion: "varilla" },
    { id: 3, tr: 3, estado: "anulada", factura_id: null, descripcion: "no va" },
  ] });
  assert.deepEqual(errores(una(r, 1)), ["sin_factura"]);
  assert.equal(una(r, 2).estado, "en_curso");
  assert.equal(una(r, 3).estado, "anulada");
  assert.equal(r.cuenta.conError, 1);
  assert.equal(r.cuenta.enCurso, 1);
  assert.equal(r.cuenta.anuladas, 1);
});

test("el gasto de caja chica: devuelto es un error, sin aprobar está en curso", () => {
  const r = resumenDeTR({ leadId: 15,
    facturas: [{ ...completa, id: 200, tr: 103, caja_gasto_id: 98 }, { ...completa, id: 201, tr: 104, caja_gasto_id: 99 }],
    gastos: [
      { id: 98, tr: 103, caja_id: 9, estado: "devuelto", devuelto_motivo: "la factura se debe cambiar", obra_factura_id: 200 },
      { id: 99, tr: 104, caja_id: 9, estado: "pendiente", obra_factura_id: 201 },
      { id: 100, tr: 105, caja_id: 9, estado: "aprobado", obra_factura_id: null, descripcion: "taxi", monto: 5 },
    ] });
  assert.deepEqual(errores(una(r, 103)), ["devuelto"]);
  assert.equal(una(r, 103).errores[0].dice, "la factura se debe cambiar");
  assert.equal(una(r, 104).estado, "en_curso");
  assert.deepEqual(errores(una(r, 105)), ["sin_control"]);
});

test("lo que Alertas ya encontró se junta por TR: repetida, asignada de más, sin asignar", () => {
  const a = { ...completa, id: 1, tr: 209, caja_gasto_id: null };
  const b = { ...completa, id: 2, tr: 210, caja_gasto_id: null };
  const c = { ...completa, id: 3, tr: 211, caja_gasto_id: null };
  const r = resumenDeTR({ leadId: 15, facturas: [a, b, c], alertas: {
    repetidas: [{ tipo: "exacto", justificado: false, facturas: [a, b] }, { tipo: "posible", justificado: false, facturas: [a, c] }],
    sobreasignadas: [{ factura: b }],
    sinAsignar: [{ factura: c, falta: 6.01 }],
  } });
  assert.deepEqual(errores(una(r, 209)), ["repetida"]);
  assert.deepEqual(errores(una(r, 210)), ["repetida", "de_mas"]);
  // Las «parecidas» no cuentan como repetidas: no hay certeza.
  assert.deepEqual(errores(una(r, 211)), ["sin_asignar"]);
  assert.equal(una(r, 211).errores[0].dice, "$6.01 sin rubro");
  // Las graves primero.
  assert.deepEqual(r.trs.map(t => t.tr), [209, 210, 211]);
  assert.equal(r.cuenta.porError.repetida, 2);
});

test("una repetida ya justificada no vuelve a salir", () => {
  const a = { ...completa, id: 1, tr: 1, caja_gasto_id: null };
  const b = { ...completa, id: 2, tr: 2, caja_gasto_id: null, duplicado_de: 1 };
  const r = resumenDeTR({ facturas: [a, b], alertas: { repetidas: [{ tipo: "exacto", justificado: true, facturas: [a, b] }] } });
  assert.equal(r.cuenta.conError, 0);
});

test("el anticipo espera su factura; el recibo no necesita número; el SRI y el pendiente se dicen", () => {
  const r = resumenDeTR({ leadId: 15, facturas: [
    { id: 1, tr: 127, planilla_id: 1, clase: "anticipo", total: 5000, razon_social: "CUEVA" },
    { id: 2, tr: 128, planilla_id: 1, clase: "recibo", total: 10, archivo_url: "r.jpg" },
    { id: 3, tr: 219, planilla_id: 1, clase: "factura", numero_factura: "001", archivo_url: "f.pdf", total: 575, sri_estado: "grave",
      sri_hallazgos: [{ nivel: "grave", dice: "El SRI no tiene autorizado este comprobante" }, { nivel: "aviso", dice: "otra cosa" }] },
    { id: 4, tr: 300, planilla_id: null, clase: "factura", numero_factura: "002", archivo_url: "g.pdf", total: 20 },
  ], solicitudes: [{ id: 6, tr: 128, estado: "recibida", factura_id: 2 }],
  pendientes: { 6: [{ tipo: "factura", texto: "no llega la factura", para_nombre: "Johanna" }] } });
  assert.deepEqual(errores(una(r, 127)), ["anticipo"]);
  assert.deepEqual(errores(una(r, 128)), ["pendiente"]);
  assert.equal(una(r, 128).errores[0].dice, "no llega la factura · lo resuelve Johanna");
  assert.deepEqual(errores(una(r, 219)), ["sri"]);
  assert.equal(una(r, 219).errores[0].dice, "El SRI no tiene autorizado este comprobante");
  assert.deepEqual(errores(una(r, 300)), ["sin_planilla"]);
});

test("sin la 202 nadie tiene TR: igual se agrupan por sus enganches", () => {
  const r = resumenDeTR({ leadId: 15,
    facturas: [{ ...completa, tr: undefined }],
    solicitudes: [{ id: 12, estado: "recibida", factura_id: 77 }],
    gastos: [{ id: 73, caja_id: 9, estado: "aprobado", obra_factura_id: 77 }] });
  assert.equal(r.trs.length, 1);
  assert.equal(r.trs[0].codigo, "");
  assert.equal(r.trs[0].estado, "completa");
});

test("cada error tiene qué decir y qué hacer", () => {
  for (const [k, e] of Object.entries(ERRORES_TR)) assert.ok(e.corto && e.hacer, k);
});
