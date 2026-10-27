import test from "node:test";
import assert from "node:assert/strict";
import {
  margenDeOrden, partidasDeCotizacion, totalDeCotizacion, rubroDeCadaLinea,
  planDeBeneficios, liquidacionInterna, tieneCosto,
} from "../src/modules/controlObra/cuentaOrdenCambio.js";
import { totalesPorOrigen } from "../src/modules/controlObra/cuentaBeneficios.js";

const codigoDe = o => o.codigo || `OC-${String(o.numero).padStart(2, "0")}`;
const subtotalesDe = ls => {
  const s = t => ls.filter(l => l.tipo === t).reduce((a, l) => a + l.cantidad * l.precio_unitario, 0);
  return { total: s("aumenta") - s("quita") };
};

test("un costo en cero es un costo; vacío es no saberlo", () => {
  assert.equal(tieneCosto({ costo_unitario: 0 }), true);
  assert.equal(tieneCosto({ costo_unitario: null }), false);
  assert.equal(tieneCosto({}), false);
});

test("el margen cuenta solo las adiciones con costo", () => {
  const m = margenDeOrden([
    { tipo: "aumenta", cantidad: 10, precio_unitario: 12, costo_unitario: 10 },  // 120 contra 100
    { tipo: "aumenta", cantidad: 2, precio_unitario: 50, costo_unitario: null }, // sin costo: no suma como cero
    { tipo: "quita", cantidad: 1, precio_unitario: 300, costo_unitario: 200 },   // reducción: no tiene cotización
  ]);
  assert.equal(m.cobrado, 120);
  assert.equal(m.costo, 100);
  assert.equal(m.margen, 20);
  assert.equal(m.pct, 16.7);
  assert.equal(m.sinCosto, 1);
});

test("la cotización leída nace con precio igual al costo, y el costo aparte", () => {
  const ps = partidasDeCotizacion([
    { descripcion: "Gypsum", cantidad: 3, unidad: "m2", monto: 100 },
    { descripcion: "Título", cantidad: 0, monto: 0 },
  ]);
  assert.equal(ps.length, 1);
  assert.equal(ps[0].precio_unitario, 33.33);
  assert.equal(ps[0].costo_unitario, 33.3333);
  assert.equal(totalDeCotizacion([{ monto: 100 }, { monto: 20.5 }]), 120.5);
});

test("cada partida encuentra su rubro por la descripción, aunque se repita", () => {
  const lineas = [
    { id: 1, tipo: "aumenta", descripcion: "Pintura" },
    { id: 2, tipo: "aumenta", descripcion: "Pintura" },
    { id: 3, tipo: "quita", descripcion: "Mampostería" },
  ];
  const rubros = [
    { id: 70, descripcion: "Pintura  ·  OC-03" },
    { id: 71, descripcion: "Pintura  ·  OC-03" },
  ];
  assert.deepEqual(rubroDeCadaLinea("OC-03", lineas, rubros), { 1: 70, 2: 71 });
});

const orden = { id: 5, numero: 3, estado: "aprobada", ejecucion: "ejecutado", anulada: false };
const lineas = { 5: [
  { id: 11, tipo: "aumenta", descripcion: "Pintura", cantidad: 10, precio_unitario: 12, costo_unitario: 10, cotizacion_id: 9 },
  { id: 12, tipo: "aumenta", descripcion: "Gypsum", cantidad: 1, precio_unitario: 500, costo_unitario: null },
] };
const cotizaciones = { 5: [{ id: 9, proveedor: "Pinturas Unidas", archivo_path: "orden-5/c.pdf", archivo_nombre: "c.pdf" }] };
const rubros = [{ id: 70, orden_cambio_id: 5, descripcion: "Pintura  ·  OC-03" }];

test("al aprobar, cada partida con costo deja un beneficio previsto con su papel", () => {
  const p = planDeBeneficios({ obraId: 1, ordenes: [orden], lineasPorOrden: lineas, rubros, cotizaciones, existentes: [], codigoDe });
  assert.equal(p.insertar.length, 1);
  const b = p.insertar[0];
  assert.equal(b.estado, "previsto");
  assert.equal(b.origen, "orden_cambio");
  assert.equal(b.presupuestado, 120);
  assert.equal(b.real, 100);
  assert.equal(b.obra_rubro_id, 70);
  assert.equal(b.proveedor, "Pinturas Unidas");
  assert.equal(b.archivo_path, "orden-5/c.pdf");
});

test("si cambia el costo se corrige lo previsto, y lo ya comprado no se toca", () => {
  const caro = { 5: [{ ...lineas[5][0], costo_unitario: 11 }] };
  const previsto = { id: 100, orden_cambio_id: 5, orden_cambio_linea_id: 11, estado: "previsto", presupuestado: 120, real: 100 };
  let p = planDeBeneficios({ obraId: 1, ordenes: [orden], lineasPorOrden: caro, rubros, cotizaciones, existentes: [previsto], codigoDe });
  assert.equal(p.actualizar.length, 1);
  assert.equal(p.actualizar[0].campos.real, 110);
  p = planDeBeneficios({ obraId: 1, ordenes: [orden], lineasPorOrden: caro, rubros, cotizaciones,
    existentes: [{ ...previsto, estado: "confirmado", real: 95 }], codigoDe });
  assert.deepEqual([p.insertar.length, p.actualizar.length, p.borrar.length], [0, 0, 0]);
});

test("deshacer la aprobación se lleva lo previsto y deja lo comprado", () => {
  const p = planDeBeneficios({
    obraId: 1, ordenes: [{ ...orden, estado: "enviada" }], lineasPorOrden: lineas, rubros, cotizaciones, codigoDe,
    existentes: [
      { id: 100, orden_cambio_id: 5, orden_cambio_linea_id: 11, estado: "previsto" },
      { id: 101, orden_cambio_id: 5, orden_cambio_linea_id: 12, estado: "confirmado" },
    ],
  });
  assert.deepEqual(p.borrar, [100]);
  assert.equal(p.insertar.length, 0);
});

test("una orden no ejecutada no deja beneficio", () => {
  const p = planDeBeneficios({ obraId: 1, ordenes: [{ ...orden, ejecucion: "no_ejecutado" }], lineasPorOrden: lineas, rubros, cotizaciones, existentes: [], codigoDe });
  assert.equal(p.insertar.length, 0);
});

test("la liquidación usa el costo real si ya se compró, y avisa lo que no tiene costo", () => {
  const l = liquidacionInterna({
    ordenes: [orden, { id: 6, numero: 4, estado: "enviada" }], lineasPorOrden: lineas, cotizaciones, subtotalesDe, codigoDe,
    beneficios: [{ orden_cambio_linea_id: 11, estado: "confirmado", real: 90 }],
  });
  assert.equal(l.filas.length, 1);                  // solo las aprobadas
  const f = l.filas[0];
  assert.equal(f.total, 620);
  assert.equal(f.costoCotizado, 100);
  assert.equal(f.costoReal, 90);
  assert.equal(f.margen, 30);
  assert.equal(f.sinCosto, 1);
  assert.deepEqual(f.proveedores, ["Pinturas Unidas"]);
  assert.equal(l.total.ordenesSinCosto, 1);
});

test("los beneficios de compras y los de órdenes se cuentan aparte", () => {
  const t = totalesPorOrigen([
    { presupuestado: 1000, real: 800 },
    { presupuestado: 120, real: 100, origen: "orden_cambio", estado: "confirmado" },
    { presupuestado: 500, real: 300, origen: "orden_cambio", estado: "previsto" },
  ]);
  assert.equal(t.compras.neto, 200);
  assert.equal(t.ordenes.neto, 20);
  assert.equal(t.ordenes.previsto, 200);
  assert.equal(t.obra.neto, 220);
});
