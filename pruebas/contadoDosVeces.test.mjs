// Duplicados también mira la plata contada dos veces que no es «la misma
// factura dos veces»: pedidos de Compras ya facturados y facturas asignadas
// por más de lo que valen. Con las filas reales de la obra del Aeropuerto al
// 13/11/2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pedidosYaFacturados, facturasSobreasignadas } from "../src/modules/controlObra/contadoDosVeces.js";

const s = (id, descripcion, estado, mas = {}) => ({ id, lead_id: 15, descripcion, estado, monto: null, monto_estimado: null, factura_id: null, pagado_at: null, pagado_monto: null, proveedor: null, ...mas });
const solicitudes = [
  s(19, "PRESTACION DE SERVICIOS PROFESIONALES", "aprobada", { monto_estimado: 483, pagado_at: "2026-11-13", pagado_monto: 483 }),
  s(21, "Compra de compresor, malla, correas", "aprobada", { monto_estimado: 590.73, pagado_at: "2026-11-06", pagado_monto: 590.73 }),
  s(22, "Cotización de Gypsum tumbado y paredes", "aprobada", { monto_estimado: 4562, pagado_at: "2026-11-05", pagado_monto: 4562 }),
  s(24, "Departamento residentes mes 2", "aprobada", { monto_estimado: 575, pagado_at: "2026-11-12", pagado_monto: 575 }),
  s(25, "PISO LAMINADO COLOR PINO", "aprobada", { monto_estimado: 693.11, pagado_at: "2026-11-12", pagado_monto: 693.11 }),
  s(27, "Alisado y colocación de cuarzo", "aprobada", { monto_estimado: 2670.30, pagado_at: "2026-11-12", pagado_monto: 2670.30 }),
  s(31, "Perfiles hoirmigon", "aprobada"),
  s(18, "PRESTACIÒN DE SERVICIOS PROFESIONALES", "aprobada", { monto_estimado: 1725 }),
  s(29, "papel tapiz", "pendiente_aprobacion"),
  s(26, "Mantenimiento vehiculo", "requiere_info", { monto_estimado: 239 }),
  s(23, "Materiales para fundición de losa", "recibida", { monto: 1494.35, factura_id: 199 }),
];
const adjuntos = [
  { id: 1, solicitud_id: 19, tipo: "cotizacion", proveedor: "MEDINA ORDOÑEZ EIDER ALBERTO", monto: 483 },
  { id: 2, solicitud_id: 21, tipo: "cotizacion", proveedor: "MEGAMETALES S.A.", monto: 590.73 },
  { id: 3, solicitud_id: 22, tipo: "cotizacion", proveedor: "Kevin Ormaza", monto: 4562 },
  { id: 4, solicitud_id: 24, tipo: "cotizacion", proveedor: "BURGOS POZO MELBA GRACIELA", monto: 575 },
  { id: 5, solicitud_id: 25, tipo: "cotizacion", proveedor: "Pisos y acabados", monto: 693.11 },
  { id: 6, solicitud_id: 27, tipo: "cotizacion", proveedor: "Marmolería del Pacífico", monto: 2670.30 },
  { id: 7, solicitud_id: 31, tipo: "cotizacion", proveedor: "GRUPO COMERCIAL TERMIKON CIA. LTDA.", monto: 175.95 },
  { id: 8, solicitud_id: 31, tipo: "cotizacion", proveedor: "Otra ferretería", monto: 210 },
  { id: 9, solicitud_id: 18, tipo: "cotizacion", proveedor: "DE LA CRUZ VALLEJO LIZETH GERARDINE", monto: 1725 },
  { id: 10, solicitud_id: 29, tipo: "cotizacion", proveedor: "Decorhogar", monto: 988.40 },
  { id: 11, solicitud_id: 26, tipo: "cotizacion", proveedor: "MEGAMETALES S.A.", monto: 25.69 },
];
const f = (id, fecha, clase, razon_social, total, numero_factura = null) => ({ id, obra_id: 13, fecha, clase, razon_social, total, numero_factura });
const facturas = [
  f(95, "2026-10-20", "factura", "BURGOS POZO MELBA GRACIELA", 575, "001-002-000000198"),
  f(166, "2026-11-05", "anticipo", "KEVIN ALEXIS ORMAZA BUENO", 2281),
  f(171, "2026-10-31", "factura", "MEGAMETALES S.A.", 590.73, "009-100-000974104"),
  f(199, "2026-11-07", "factura", "Megametales S.A", 1494.35, "015-100-000503470"),
  f(208, "2026-11-07", "factura", "MEGAMETALES S.A.", 25.69),
  f(210, "2026-11-11", "factura", "STYLOSDKAS CIA. LTDA.", 693.11, "001-002-000002940"),
  f(215, "2026-11-08", "factura", "DE LA CRUZ VALLEJO LIZETH GERARDINE", 1518),
  f(220, "2026-11-09", "nota_credito", "MEGAMETALES S.A.", -30.85),
  f(242, "2026-10-26", "factura", "MEDINA ORDOÑEZ EIDER ALBERTO", 483, "001-001-000000001"),
  f(243, "2026-11-09", "factura", "BURGOS POZO MELBA GRACIELA", 575, "001-002-000000200"),
  f(244, "2026-11-13", "factura", "GRUPO COMERCIAL TERMIKON CIA. LTDA.", 175.95),
];
const pagos = [{ factura_id: 166, monto: 2281 }, { factura_id: 242, monto: 483 }, { factura_id: 243, monto: 575 }, { factura_id: 210, monto: 693.11 }];

test("LO QUE DEBERÍA APARECER: los pedidos de Compras que ya están facturados en el control, sin enganchar", () => {
  const r = pedidosYaFacturados({ solicitudes, facturas, adjuntos, pagos });
  assert.deepEqual(r.map(x => [x.pedido.id, x.candidatas[0].factura.id, x.seguro, x.deMas]), [
    // Seguros: mismo monto y mismo proveedor. Primero los que más pesan.
    [21, 171, true, 590.73],
    [24, 243, true, 575],
    [19, 242, true, 483],
    [31, 244, true, 175.95],
    // Posibles: el anticipo —mismo proveedor, pedido pagado— y el que solo coincide en monto.
    [22, 166, false, 2281],
    [25, 210, false, 693.11],
  ]);
  // Lo comprometido que el control cuenta de más.
  assert.equal(Math.round(r.reduce((t, x) => t + x.deMas, 0) * 100) / 100, 4798.79);
});

test("de un anticipo no sobra el pedido entero: sobra lo que vale el anticipo", () => {
  const r = pedidosYaFacturados({ solicitudes, facturas, adjuntos, pagos }).find(x => x.pedido.id === 22);
  assert.equal(r.monto, 4562);
  assert.equal(r.deMas, 2281);
  assert.equal(r.candidatas[0].factura.clase, "anticipo");
});

test("con dos facturas iguales libres se ofrecen las dos, la más nueva primero", () => {
  const r = pedidosYaFacturados({ solicitudes, facturas, adjuntos, pagos }).find(x => x.pedido.id === 24);
  assert.deepEqual(r.candidatas.map(c => c.factura.id), [243, 95]);
});

test("NO se avisa lo que puede ser otra compra: mismo proveedor, otro monto, y el pedido sin pagar", () => {
  const ids = pedidosYaFacturados({ solicitudes, facturas, adjuntos, pagos }).map(x => x.pedido.id);
  // #18: $1.725 pedidos y una factura de $1.518 de la misma persona. No es seguro que sea esa.
  assert.equal(ids.includes(18), false);
});

test("ni lo que no tiene nada parecido, ni lo devuelto, ni lo que ya está enganchado", () => {
  const ids = pedidosYaFacturados({ solicitudes, facturas, adjuntos, pagos }).map(x => x.pedido.id);
  assert.equal(ids.includes(27), false);   // pagado, y en el control no hay nada suyo
  assert.equal(ids.includes(29), false);   // espera el visto, sin factura parecida
  assert.equal(ids.includes(26), false);   // devuelto: no es plata de la obra, aunque haya una de $25,69
  assert.equal(ids.includes(23), false);   // ya tiene su factura
});

test("la factura de un pedido no se le ofrece a otro", () => {
  const otro = [...solicitudes, s(50, "Más materiales", "aprobada", { monto_estimado: 1494.35, proveedor: "Megametales" })];
  const r = pedidosYaFacturados({ solicitudes: otro, facturas, adjuntos, pagos }).find(x => x.pedido.id === 50);
  // La 199 es del pedido 23: no aparece. Tampoco hay otra por ese monto, y no está pagado.
  assert.equal(r, undefined);
});

test("al engancharlo deja de avisarse", () => {
  const ya = solicitudes.map(x => (x.id === 21 ? { ...x, factura_id: 171, estado: "comprada" } : x));
  assert.equal(pedidosYaFacturados({ solicitudes: ya, facturas, adjuntos, pagos }).some(x => x.pedido.id === 21), false);
});

test("sin pedidos o sin facturas no hay nada que avisar", () => {
  assert.deepEqual(pedidosYaFacturados({}), []);
  assert.deepEqual(pedidosYaFacturados({ solicitudes, facturas: [], adjuntos, pagos }), []);
  assert.deepEqual(pedidosYaFacturados({ solicitudes: [], facturas }), []);
});

// ── Facturas asignadas por más de lo que valen ──
const asignaciones = [
  // La 171: una vez a la agrupación entera y otra vez repartida en cinco rubros.
  { id: 389, factura_id: 171, obra_rubro_id: null, obra_actividad_id: 196, monto: 590.73 },
  { id: 390, factura_id: 171, obra_rubro_id: 1444, obra_actividad_id: null, monto: 237.88 },
  { id: 391, factura_id: 171, obra_rubro_id: 1445, obra_actividad_id: null, monto: 83.87 },
  { id: 392, factura_id: 171, obra_rubro_id: 1446, obra_actividad_id: null, monto: 34.97 },
  { id: 393, factura_id: 171, obra_rubro_id: 1447, obra_actividad_id: null, monto: 170.48 },
  { id: 394, factura_id: 171, obra_rubro_id: 1449, obra_actividad_id: null, monto: 63.53 },
  // Las demás, bien.
  { id: 1, factura_id: 243, obra_rubro_id: null, obra_actividad_id: 193, monto: 575 },
  { id: 2, factura_id: 210, obra_rubro_id: 1311, obra_actividad_id: null, monto: 693.11 },
  { id: 3, factura_id: 220, obra_rubro_id: 1428, obra_actividad_id: null, monto: -30.85 },
  { id: 4, factura_id: 166, obra_rubro_id: 1295, obra_actividad_id: null, monto: 1140.50 },
  { id: 5, factura_id: 166, obra_rubro_id: 1296, obra_actividad_id: null, monto: 1140.50 },
];

test("LO QUE DEBERÍA APARECER: la factura de Megametales, asignada por el doble de lo que vale", () => {
  const r = facturasSobreasignadas({ facturas, asignaciones });
  assert.deepEqual(r.map(x => [x.factura.id, x.asignado, x.deMas, x.aRubros, x.aAgrupaciones]), [[171, 1181.46, 590.73, 5, 1]]);
});

test("asignada justo, repartida entre varios rubros, sin asignar o de menos: no se avisa", () => {
  const ids = facturasSobreasignadas({ facturas, asignaciones }).map(x => x.factura.id);
  assert.equal(ids.includes(166), false);   // 1.140,50 + 1.140,50 = 2.281
  assert.equal(ids.includes(199), false);   // sin ninguna asignación: es otro aviso, no este
  assert.deepEqual(facturasSobreasignadas({ facturas, asignaciones: [{ factura_id: 243, monto: 500 }] }), []);
});

test("una nota de crédito es negativa: asignada por su monto no está de más; por el doble, sí", () => {
  assert.equal(facturasSobreasignadas({ facturas, asignaciones }).some(x => x.factura.id === 220), false);
  const doble = [{ factura_id: 220, obra_rubro_id: 1428, monto: -30.85 }, { factura_id: 220, obra_rubro_id: 1429, monto: -30.85 }];
  assert.deepEqual(facturasSobreasignadas({ facturas, asignaciones: doble }).map(x => [x.factura.id, x.asignado, x.deMas]), [[220, -61.7, 30.85]]);
});

test("un centavo de redondeo no es una factura mal asignada", () => {
  const casi = [{ factura_id: 210, obra_rubro_id: 1, monto: 346.56 }, { factura_id: 210, obra_rubro_id: 2, monto: 346.56 }];
  assert.deepEqual(facturasSobreasignadas({ facturas, asignaciones: casi }), []);
});

// ── La misma factura dos veces, entre por donde entre ──
import { facturasRepetidas, documentosSinAsignar, pagadosSinDocumento, alertasDeLaObra } from "../src/modules/controlObra/contadoDosVeces.js";
import { readFileSync as leer } from "node:fs";

const tuti = (id, mas) => ({ id, obra_id: 13, fecha: "2026-10-30", clase: "factura", origen: "caja_chica", ruc: "0993152161001", numero_factura: "753-003-000015663", razon_social: "TIENDAS TUTI TTDE S.A.", total: 2.96, ...mas });

test("LO QUE ÉL VIO: la factura de Tuti entró dos veces por caja chica, una con archivo y otra a mano", () => {
  const r = facturasRepetidas([
    tuti(190, { caja_gasto_id: 182, created_at: "2026-11-10T07:36:28Z", archivo_hash: null }),
    tuti(189, { caja_gasto_id: 181, created_at: "2026-11-10T06:45:50Z", archivo_hash: "abc" }),
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].tipo, "exacto");
  // La primera es la que entró primero; la de después es la que sobra.
  assert.deepEqual(r[0].facturas.map(f => f.id), [189, 190]);
});

test("el número se compara sin guiones, puntos ni espacios; y entre orígenes distintos", () => {
  const r = facturasRepetidas([
    tuti(1, { origen: "manual", numero_factura: "753-003-000015663" }),
    tuti(2, { origen: "nova", numero_factura: "753003000015663", ruc: "0993152161001 " }),
  ]);
  assert.equal(r.length, 1);
});

test("el mismo archivo es la misma factura aunque no tenga número; parecidas solo si las fechas están cerca", () => {
  assert.equal(facturasRepetidas([{ id: 1, archivo_hash: "x", total: 5 }, { id: 2, archivo_hash: "x", total: 5 }])[0].tipo, "exacto");
  const cerca = [{ id: 1, razon_social: "Kywi", total: 19.71, fecha: "2026-11-11" }, { id: 2, razon_social: "KYWI", total: 19.71, fecha: "2026-11-13" }];
  assert.equal(facturasRepetidas(cerca)[0].tipo, "posible");
  const lejos = [{ id: 1, razon_social: "Kywi", total: 19.71, fecha: "2026-10-01" }, { id: 2, razon_social: "Kywi", total: 19.71, fecha: "2026-11-13" }];
  assert.deepEqual(facturasRepetidas(lejos), []);
});

test("la revisión de la obra entera vive en un solo lugar: no queda otra copia de la regla", () => {
  const dup = leer(new URL("../src/modules/controlObra/duplicados.js", import.meta.url), "utf8");
  assert.doesNotMatch(dup, /auditarObra/);
  // Y la de un documento que entra usa los mismos criterios: RUC + número, o el mismo archivo.
  assert.match(dup, /norm\(f\.numero_factura\) === norm\(numeroFactura\) && norm\(f\.ruc\) === norm\(ruc\)/);
  assert.match(dup, /f\.archivo_hash === archivoHash/);
});

test("documentos sin asignar: los que no descuentan de ningún rubro, o descuentan menos de lo que valen", () => {
  const r = documentosSinAsignar({ facturas, asignaciones: [...asignaciones, { factura_id: 210, monto: 600 }] });
  const de = Object.fromEntries(r.map(x => [x.factura.id, x.falta]));
  assert.equal(de[199], 1494.35);        // nada asignado
  assert.equal(de[210], undefined);      // 693,11 + 600 es de más, no de menos
  assert.equal(de[243], undefined);      // asignada justo
  assert.equal(de[220], undefined);      // la nota de crédito, asignada por su monto
  assert.equal(de[242], 483);
});

test("pagado en Compras sin documento en el control: solo lo que no tiene con qué engancharse", () => {
  const ya = pedidosYaFacturados({ solicitudes, facturas, adjuntos, pagos });
  const r = pagadosSinDocumento({ solicitudes, adjuntos, yaFacturados: ya });
  assert.deepEqual(r.map(x => [x.pedido.id, x.monto]), [[27, 2670.3]]);
});

test("todas juntas, y cuántas son: lo que dice la pestaña", () => {
  const a = alertasDeLaObra({ solicitudes, facturas: [...facturas, tuti(189, { created_at: "1" }), tuti(190, { created_at: "2" })], asignaciones, adjuntos, pagos });
  assert.equal(a.repetidas.length, 1);
  assert.equal(a.sobreasignadas.length, 1);
  assert.equal(a.pedidos.length, 6);
  assert.equal(a.pagados.length, 1);
  assert.equal(a.cuantas, a.repetidas.length + a.sobreasignadas.length + a.pedidos.length + a.pagados.length + a.sinAsignar.length);
  assert.deepEqual(alertasDeLaObra({}).cuantas, 0);
});

test("al guardar se revisa otra vez, en caja chica, en el control y en Compras", () => {
  const caja = leer(new URL("../src/modules/ModuloCajaChica.jsx", import.meta.url), "utf8");
  const agregar = caja.slice(caja.indexOf("async function agregarGasto()"), caja.indexOf("const devuelve = gastoForm.tipo"));
  assert.match(agregar, /dups = await buscarDuplicados\(/);
  assert.ok(agregar.indexOf("dups = await buscarDuplicados(") < agregar.indexOf("if (dups.exactos.length && !dupJustificacion.trim())"));
  assert.match(caja, /duplicado_de:dups\.exactos\[0\]\?\.id/);
  const modal = leer(new URL("../src/modules/controlObra/ModalFactura.jsx", import.meta.url), "utf8");
  const guardar = modal.slice(modal.indexOf("async function guardar()"), modal.indexOf("setGuardando(true); setError(\"\");"));
  assert.match(guardar, /d = await buscarDuplicados\(/);
  const compras = leer(new URL("../src/modules/compras/compras.js", import.meta.url), "utf8");
  const facturar = compras.slice(compras.indexOf("export async function facturarCompra("), compras.indexOf('from("obra_facturas").insert(fila)'));
  assert.match(facturar, /buscarDuplicados\(\{ obraId: obra\.id, ruc: datos\.ruc, numeroFactura: datos\.numero \}\)/);
});
