import test from "node:test";
import assert from "node:assert/strict";
import { estadoDeCaja, porPlanilla } from "../src/modules/controlObra/cajaDelProyecto.js";

const anticipo = (monto, fecha) => ({ monto, fecha, clase: "anticipo" });

test("LA CAJA CUENTA LA PLATA QUE SALIÓ, no las facturas emitidas", () => {
  // Una factura de 20.000 con un anticipo pagado de 5.000 sacó 5.000 del banco.
  const r = estadoDeCaja({
    fondos: [anticipo(30000, "2026-01-10")],
    facturas: [{ id: 1, total: 20000 }],
    pagos: [{ factura_id: 1, monto: 5000 }],
  });
  assert.equal(r.pagado, 5000);
  assert.equal(r.saldo, 25000, "quedan 25.000, no 10.000");
  assert.equal(r.porPagar, 15000, "y 15.000 de deuda con el proveedor");
  assert.equal(r.facturado, 20000);
});

test("SIN NINGÚN PAGO CARGADO se sigue contando por facturas", () => {
  // Una obra que todavía no lleva Proveedores: decir que no salió nada sería
  // mentir al revés, y mostrar la caja perfecta el día que peor está.
  const r = estadoDeCaja({ fondos: [anticipo(30000)], facturas: [{ id: 1, total: 20000 }], pagos: [] });
  assert.equal(r.gastado, 20000);
  assert.equal(r.saldo, 10000);
  assert.equal(r.seLlevanPagos, false);
});

test("una proforma no es un gasto: todavía no se le debe a nadie", () => {
  const r = estadoDeCaja({
    fondos: [anticipo(10000)],
    facturas: [{ id: 1, total: 4000 }, { id: 2, total: 9000, clase: "proforma" }],
    pagos: [{ factura_id: 1, monto: 4000 }],
  });
  assert.equal(r.facturado, 4000);
  assert.equal(r.porPagar, 0);
  assert.equal(r.saldo, 6000);
});

test("pagar de más no deja una deuda negativa", () => {
  const r = estadoDeCaja({
    fondos: [], facturas: [{ id: 1, total: 100 }], pagos: [{ factura_id: 1, monto: 150 }],
  });
  assert.equal(r.porPagar, 0);
});

test("lo que se sacó de la caja para otra cosa resta igual", () => {
  const r = estadoDeCaja({
    fondos: [anticipo(10000), { monto: -2000, clase: "devolucion" }],
    facturas: [{ id: 1, total: 3000 }], pagos: [{ factura_id: 1, monto: 3000 }],
  });
  assert.equal(r.salido, 2000);
  assert.equal(r.saldo, 5000);
});

test("el corte por planilla también cuenta lo pagado", () => {
  const filas = porPlanilla({
    planillas: [{ id: 7, numero: 1, fecha_hasta: "2026-02-28" }],
    facturas: [{ id: 1, total: 20000, planilla_id: 7 }],
    fondos: [anticipo(30000, "2026-01-10")],
    pagos: [{ factura_id: 1, monto: 5000 }],
  });
  assert.equal(filas[0].gasto, 5000);
  assert.equal(filas[0].recibido, 30000);
  assert.equal(filas[0].saldo, 25000);
});

test("una factura sin planilla pesa igual: la plata no espera al corte", () => {
  const filas = porPlanilla({
    planillas: [{ id: 7, numero: 1 }],
    facturas: [{ id: 1, total: 1000, planilla_id: 7 }, { id: 2, total: 4000, planilla_id: null }],
    fondos: [anticipo(10000)],
    pagos: [{ factura_id: 1, monto: 1000 }, { factura_id: 2, monto: 4000 }],
  });
  assert.equal(filas.length, 2);
  assert.equal(filas[1].nombre, "Sin planilla todavía");
  assert.equal(filas[1].gasto, 4000);
});

test("una obra en cero no revienta", () => {
  const r = estadoDeCaja({});
  assert.deepEqual([r.entrado, r.gastado, r.saldo, r.porPagar], [0, 0, 0, 0]);
});

// Un pago con una nota de crédito salda la factura y no mueve plata.
test("el vale no sale de la caja del proyecto", () => {
  const facturas = [{ id: 1, total: 1000 }];
  const pagos = [{ factura_id: 1, monto: 900 }, { factura_id: 1, monto: 100, nota_credito_id: 7 }];
  const e = estadoDeCaja({ fondos: [{ monto: 1000 }], facturas, pagos });
  assert.equal(e.pagado, 900);
  assert.equal(e.saldo, 100);
});

test("la deuda se suma documento por documento, y el vale no la baja", () => {
  const facturas = [
    { id: 1, total: 11500, clase: "factura" },
    { id: 2, total: 213.68, clase: "factura" },
    { id: 3, total: -105.06, clase: "nota_credito" },
    { id: 4, total: 5000, clase: "anticipo" },
    { id: 5, total: 900, clase: "proforma" },
  ];
  const pagos = [{ factura_id: 1, monto: 7000 }, { factura_id: 4, monto: 5000 }];
  const e = estadoDeCaja({ fondos: [{ monto: 71455.24 }], facturas, pagos });
  assert.equal(e.porPagar, 4713.68);      // 4500 de la primera + 213.68 de la segunda
  assert.equal(e.credito, 105.06);        // el vale, aparte
  assert.equal(e.anticipado, 5000);
  assert.equal(e.facturado, 16713.68);    // sin la proforma y sin el vale
  assert.equal(e.pagado, 12000);
  assert.equal(e.saldo, 59455.24);
});

test("un pago de más no cancela la deuda de otra factura", () => {
  const e = estadoDeCaja({
    fondos: [{ monto: 1000 }],
    facturas: [{ id: 1, total: 100, clase: "factura" }, { id: 2, total: 200, clase: "factura" }],
    pagos: [{ factura_id: 1, monto: 150 }],
  });
  assert.equal(e.porPagar, 200);
});
