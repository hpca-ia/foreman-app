// De Compras al control de obra: las decisiones, con los pedidos reales del
// 13/11/2026 —los seis que quedaron pagados en Compras sin entrar al control—
// y las facturas que alguien cargó a mano desde la planilla.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  faltaEnElControl, documentoSugerido, abonoAlControl, mismoProveedor, candidatasDelControl, pagoAlEnganchar,
} from "../src/modules/compras/alControl.js";

// ── Los pedidos, como están en la base ──
const P19 = { id: 19, lead_id: 15, estado: "aprobada", descripcion: "PRESTACION DE SERVICIOS PROFESIONALES", monto: null, monto_estimado: 483, pagado_monto: 483, pagado_at: "2026-11-13T15:00:00Z", factura_id: null, obra_rubro_id: 1425 };
const P21 = { id: 21, lead_id: 15, estado: "aprobada", descripcion: "Compra de compresor, malla, correas", monto: null, monto_estimado: 590.73, pagado_monto: 590.73, pagado_at: "2026-11-06T15:00:00Z", factura_id: null, obra_actividad_id: 164 };
const P22 = { id: 22, lead_id: 15, estado: "aprobada", descripcion: "Cotización de Gypsum tumbado y paredes", monto: null, monto_estimado: 4562, pagado_monto: 4562, pagado_at: "2026-11-05T15:00:00Z", factura_id: null, obra_actividad_id: 167 };
const P27 = { id: 27, lead_id: 15, estado: "aprobada", descripcion: "Alisado y colocación de cuarzo", monto: null, monto_estimado: 2670.30, pagado_monto: 2670.30, pagado_at: "2026-11-12T15:00:00Z", factura_id: null, obra_actividad_id: 195 };
const ADJ = {
  19: [{ id: 1, tipo: "cotizacion", proveedor: "MEDINA ORDOÑEZ EIDER ALBERTO", monto: 483, storage_path: "compra-19/reporte.pdf", nombre: "reporte.pdf" }, { id: 2, tipo: "pago", proveedor: "PAGO EIDER", monto: null, storage_path: "compra-19/pago.pdf", nombre: "PAGO EIDER.pdf" }],
  21: [{ id: 3, tipo: "cotizacion", proveedor: "MEGAMETALES S.A.", monto: 590.73, storage_path: "compra-21/2megametales.pdf", nombre: "2megametales.pdf", created_at: "2026-10-30T10:00:00Z" },
       { id: 4, tipo: "respaldo", proveedor: "Megametales S.A", monto: 590.73, storage_path: "compra-21/Factura.pdf", nombre: "Factura.pdf", created_at: "2026-11-04T10:00:00Z" },
       { id: 5, tipo: "pago", proveedor: "DEVOLUCION PAGO METAMETALES", monto: 590.73, storage_path: "compra-21/pago.pdf", nombre: "pago.pdf", created_at: "2026-11-06T10:00:00Z" },
       { id: 6, tipo: "respaldo", proveedor: "Megametales S.A", monto: 590.73, storage_path: "compra-21/3110.pdf", nombre: "3110.pdf", created_at: "2026-11-06T11:00:00Z" }],
  22: [{ id: 7, tipo: "cotizacion", proveedor: "Kevin Ormaza", monto: 4562, storage_path: "compra-22/a23.jpeg", nombre: "a23.jpeg" }, { id: 8, tipo: "pago", proveedor: "report-aOPSh", monto: null }],
  27: [{ id: 9, tipo: "cotizacion", proveedor: "Marmolería del Pacífico", monto: 2670.30, storage_path: "compra-27/cuarzo.pdf", nombre: "cuarzo.pdf" }],
};
// ── Lo que hay en el control de esa obra, cargado desde la planilla ──
const FACTURAS = [
  { id: 95, fecha: "2026-10-20", clase: "factura", razon_social: "BURGOS POZO MELBA GRACIELA", total: 575 },
  { id: 166, fecha: "2026-11-05", clase: "anticipo", razon_social: "KEVIN ALEXIS ORMAZA BUENO", total: 2281 },
  { id: 171, fecha: "2026-10-31", clase: "factura", razon_social: "MEGAMETALES S.A.", total: 590.73 },
  { id: 199, fecha: "2026-11-07", clase: "factura", razon_social: "Megametales S.A", total: 1494.35 },
  { id: 208, fecha: "2026-11-07", clase: "factura", razon_social: "MEGAMETALES S.A.", total: 25.69 },
  { id: 210, fecha: "2026-11-11", clase: "factura", razon_social: "STYLOSDKAS CIA. LTDA.", total: 693.11 },
  { id: 220, fecha: "2026-11-09", clase: "nota_credito", razon_social: "MEGAMETALES S.A.", total: -30.85 },
  { id: 242, fecha: "2026-10-26", clase: "factura", razon_social: "MEDINA ORDOÑEZ EIDER ALBERTO", total: 483 },
  { id: 243, fecha: "2026-11-09", clase: "factura", razon_social: "BURGOS POZO MELBA GRACIELA", total: 575 },
];
const PAGOS = [{ factura_id: 95, monto: 575 }, { factura_id: 166, monto: 2281 }, { factura_id: 199, monto: 1494.35 }, { factura_id: 210, monto: 693.11 }, { factura_id: 242, monto: 483 }, { factura_id: 243, monto: 575 }];
const ENGANCHADAS = [199];   // la del pedido 23
const control = adjuntos => ({ facturas: FACTURAS, enganchadas: ENGANCHADAS, adjuntos, pagos: PAGOS });

test("un pedido de obra aprobado y sin documento todavía falta en el control; uno de oficina no", () => {
  assert.equal(faltaEnElControl(P19), true);
  assert.equal(faltaEnElControl({ ...P19, estado: "comprada" }), true);
  assert.equal(faltaEnElControl({ ...P19, factura_id: 242 }), false);
  assert.equal(faltaEnElControl({ ...P19, estado: "pendiente_aprobacion" }), false);
  assert.equal(faltaEnElControl({ ...P19, estado: "requiere_info" }), false);
  assert.equal(faltaEnElControl({ ...P19, lead_id: null }), false);
  assert.equal(faltaEnElControl(null), false);
});

test("lo que ya se sabe del documento sale del pedido: de quién es, por cuánto y con qué papel", () => {
  // Con una sola cotización: es esa.
  assert.deepEqual(documentoSugerido(P19, ADJ[19]), {
    proveedor: "MEDINA ORDOÑEZ EIDER ALBERTO", total: 483, de: "su única proforma",
    papel: ADJ[19][0],
  });
  // Si ya se subió la factura como respaldo, el papel es el último respaldo, no la cotización.
  const d = documentoSugerido(P21, ADJ[21]);
  assert.equal(d.papel.nombre, "3110.pdf");
  assert.equal(d.total, 590.73);
  assert.equal(d.proveedor, "Megametales S.A");
});

test("el comprobante de pago nunca hace de documento ni de proveedor", () => {
  const d = documentoSugerido(P22, ADJ[22]);
  assert.equal(d.proveedor, "Kevin Ormaza");
  assert.equal(d.papel.nombre, "a23.jpeg");
});

test("con varias cotizaciones sin elegir no se adivina el papel; elegida una, es esa", () => {
  const dos = [{ id: 1, tipo: "cotizacion", proveedor: "A", monto: 100, nombre: "a.pdf" }, { id: 2, tipo: "cotizacion", proveedor: "B", monto: 90, nombre: "b.pdf" }];
  const sinElegir = documentoSugerido({ id: 5, monto: null }, dos);
  assert.equal(sinElegir.papel, null);
  assert.equal(sinElegir.proveedor, "");
  assert.equal(sinElegir.total, 90);
  const elegida = documentoSugerido({ id: 5, monto: null, proforma_id: 1, proveedor: "A" }, dos);
  assert.equal(elegida.papel.nombre, "a.pdf");
  assert.equal(elegida.total, 100);
});

test("sin nada cargado no inventa: sin proveedor, sin papel y en cero", () => {
  assert.deepEqual(documentoSugerido({ id: 9 }, []), { proveedor: "", total: 0, de: "sin monto", papel: null });
});

// ── El pago ──

test("lo que se escribe es ESTE pago; en blanco, lo que falta", () => {
  assert.deepEqual(abonoAlControl({ total: 4562, pagado: 0, escrito: "2281" }), { monto: 2281, pendiente: 4562 });
  // El saldo de una factura ya abonada: antes no se registraba nada.
  assert.deepEqual(abonoAlControl({ total: 4562, pagado: 2281, escrito: "2281" }), { monto: 2281, pendiente: 2281 });
  assert.deepEqual(abonoAlControl({ total: 4562, pagado: 2281, escrito: "" }), { monto: 2281, pendiente: 2281 });
  assert.deepEqual(abonoAlControl({ total: 4562, pagado: 2281 }), { monto: 2281, pendiente: 2281 });
  assert.deepEqual(abonoAlControl({ total: 693.11, pagado: 0, escrito: null }), { monto: 693.11, pendiente: 693.11 });
});

test("no se registra un pago mayor que lo que falta de ese documento", () => {
  const r = abonoAlControl({ total: 590.73, pagado: 500, escrito: "200" });
  assert.equal(r.error, "De ese documento quedan por pagar $90.73: no se puede registrar un pago mayor.");
  assert.equal(abonoAlControl({ total: 483, pagado: 483, escrito: "10" }).error, "Ese documento ya está pagado entero en el control.");
  assert.deepEqual(abonoAlControl({ total: 483, pagado: 483, escrito: "" }), { monto: 0, pendiente: 0 });
});

test("el saldo de un anticipo no se paga contra el anticipo: va con la factura final", () => {
  const r = abonoAlControl({ total: 2281, pagado: 2281, escrito: "2281", esAnticipo: true });
  assert.match(r.error, /^Ese documento ya está pagado entero en el control\. Si es el saldo de lo que se anticipó, va con la factura final/);
});

test("un monto que no es un número no pasa", () => {
  assert.equal(abonoAlControl({ total: 100, pagado: 0, escrito: "abc" }).error, "Escribí cuánto se pagó.");
  assert.equal(abonoAlControl({ total: 100, pagado: 0, escrito: "-5" }).error, "Escribí cuánto se pagó.");
});

test("los centavos no dejan un saldo fantasma", () => {
  assert.deepEqual(abonoAlControl({ total: 1494.35, pagado: 1459.88, escrito: "34.47" }), { monto: 34.47, pendiente: 34.47 });
  assert.deepEqual(abonoAlControl({ total: 0.3, pagado: 0.1, escrito: "0.2" }), { monto: 0.2, pendiente: 0.2 });
});

// ── Reconocer la factura que ya se cargó desde la planilla ──

test("el mismo proveedor escrito de dos maneras es el mismo", () => {
  assert.equal(mismoProveedor("Kevin Ormaza", "KEVIN ALEXIS ORMAZA BUENO"), true);
  assert.equal(mismoProveedor("Megametales S.A", "MEGAMETALES S.A."), true);
  assert.equal(mismoProveedor("MEDINA ORDOÑEZ EIDER ALBERTO", "Medina Ordonez Eider"), true);
  assert.equal(mismoProveedor("BURGOS POZO MELBA GRACIELA", "MEDINA ORDOÑEZ EIDER ALBERTO"), false);
  // Dos personas que comparten un solo apellido no son la misma.
  assert.equal(mismoProveedor("Juan Burgos Mora", "BURGOS POZO MELBA GRACIELA"), false);
  // Lo que está en todos los nombres no cuenta.
  assert.equal(mismoProveedor("Ferretería S.A.", "Megametales S.A."), false);
  assert.equal(mismoProveedor("", "MEGAMETALES"), false);
  assert.equal(mismoProveedor(null, null), false);
});

test("#19 servicios profesionales: la factura 242 del control es la suya", () => {
  const c = candidatasDelControl(P19, control(ADJ[19]));
  assert.deepEqual(c.map(x => [x.factura.id, x.mismoMonto, x.mismoProveedor, x.pagado]), [[242, true, true, 483]]);
});

test("#21 Megametales: de todas las de ese proveedor, la del mismo monto; y en el control figura impaga", () => {
  const c = candidatasDelControl(P21, control(ADJ[21]));
  assert.deepEqual(c.map(x => [x.factura.id, x.pagado]), [[171, 0]]);
});

test("#22 gypsum: no hay nada por $4.562, pero sí el anticipo de $2.281 a ese proveedor", () => {
  const c = candidatasDelControl(P22, control(ADJ[22]));
  assert.deepEqual(c.map(x => [x.factura.id, x.factura.clase, x.mismoMonto, x.mismoProveedor]), [[166, "anticipo", false, true]]);
});

test("#27 cuarzo: en el control no hay nada suyo, y no se le ofrece lo de otro", () => {
  assert.deepEqual(candidatasDelControl(P27, control(ADJ[27])), []);
});

test("una factura que ya es de otro pedido no se vuelve a ofrecer, ni una nota de crédito", () => {
  const p = { id: 50, lead_id: 15, estado: "aprobada", monto_estimado: 1494.35, proveedor: "Megametales" };
  assert.deepEqual(candidatasDelControl(p, control([])).map(x => x.factura.id), [208, 171]);
  assert.equal(candidatasDelControl(p, { ...control([]), enganchadas: [] })[0].factura.id, 199);
});

test("con dos facturas del mismo monto y proveedor se ofrecen las dos: elige la persona", () => {
  const p24 = { id: 24, lead_id: 15, estado: "aprobada", monto_estimado: 575, pagado_monto: 575, pagado_at: "2026-11-12" };
  const c = candidatasDelControl(p24, control([{ id: 1, tipo: "cotizacion", proveedor: "BURGOS POZO MELBA GRACIELA", monto: 575 }]));
  // La más nueva primero: es la del mes 2.
  assert.deepEqual(c.map(x => x.factura.id), [243, 95]);
});

// ── Al enganchar, los dos lados dicen lo mismo ──

test("#21: Compras dice pagado $590,73 y el control no tiene el pago: se registra", () => {
  assert.deepEqual(pagoAlEnganchar({ total: 590.73, pagadoEnControl: 0, pagadoEnCompras: 590.73, estabaPagado: true }), { registrar: 590.73, pagado: 590.73 });
});

test("#19: el control ya lo tiene pagado: no se registra de nuevo", () => {
  assert.deepEqual(pagoAlEnganchar({ total: 483, pagadoEnControl: 483, pagadoEnCompras: 483, estabaPagado: true }), { registrar: 0, pagado: 483 });
});

test("#22: Compras decía $4.562 pagados y salieron $2.281: no se paga de más, y el pedido queda con lo cierto", () => {
  assert.deepEqual(pagoAlEnganchar({ total: 2281, pagadoEnControl: 2281, pagadoEnCompras: 4562, estabaPagado: true }), { registrar: 0, pagado: 2281 });
  // Y si el control no tuviera el pago, se registraría hasta lo que vale el documento, no más.
  assert.deepEqual(pagoAlEnganchar({ total: 2281, pagadoEnControl: 0, pagadoEnCompras: 4562, estabaPagado: true }), { registrar: 2281, pagado: 2281 });
});

test("un pedido que no estaba pagado no inventa un pago; si el control tiene uno, se entera", () => {
  assert.deepEqual(pagoAlEnganchar({ total: 800, pagadoEnControl: 0, pagadoEnCompras: null, estabaPagado: false }), { registrar: 0, pagado: 0 });
  assert.deepEqual(pagoAlEnganchar({ total: 800, pagadoEnControl: 300, pagadoEnCompras: null, estabaPagado: false }), { registrar: 0, pagado: 300 });
});

// ── Las puertas por las que la plata entra al control ──
const compras = readFileSync(new URL("../src/modules/compras/compras.js", import.meta.url), "utf8");

test("pagar con el documento en el control registra un abono en el control, por lo que falta o lo que se escribió", () => {
  const cuerpo = compras.slice(compras.indexOf("export async function registrarPago("), compras.indexOf("export async function marcarPagoDelPedido("));
  assert.match(cuerpo, /abonoAlControl\(\{ total: f\.total, pagado: antes, escrito: monto/);
  assert.match(cuerpo, /pagarFactura\(f, \{ monto: a\.monto/);
  // Y si el control no lo acepta, el pedido no queda marcado como pagado.
  assert.ok(cuerpo.indexOf("if (a.error) return a.error;") < cuerpo.indexOf('from("compras_solicitudes").update(campos)'));
});

test("el documento que entra al control lleva su papel: el respaldo o la cotización del pedido", () => {
  assert.match(compras, /: await papelDelPedido\(solicitud\);/);
  assert.match(compras, /documentoSugerido\(solicitud, data \|\| \[\]\)\.papel/);
});
