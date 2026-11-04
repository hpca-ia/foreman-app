import test from "node:test";
import assert from "node:assert/strict";
import { resumenDeLaCaja } from "../src/modules/cajaChica/resumen.js";
import { paraElReporte } from "../src/modules/cajaChica/lista.js";

const anticipos = [
  { id: 9, monto: 1000, fecha: "2026-10-08", descripcion: "Caja chica 1" },
  { id: 10, monto: 1016.49, fecha: "2026-10-23", descripcion: "Cierre caja 1" },
];
const cierres = [{ id: 15, numero: 1, hasta: "2026-10-21", gastos: 30, total_gastado: 1016.49, total_abonado: 1000, saldo: -16.49 }];

test("el primero es el fondo; el que llega después de un cierre es su reposición, lo llamen como lo llamen", () => {
  const f = resumenDeLaCaja({ anticipos, cierres });
  assert.deepEqual(f.map(x => x.tipo), ["reposicion", "cierre", "fondo"]);
  assert.equal(f[0].cierre.numero, 1);
  assert.match(f[0].dice, /tras el cierre 1/);
  assert.equal(f[2].dice, "Fondo inicial");
  assert.match(f[1].dice, /hasta el 2026-10-21 · 30 gastos/);
});

test("dos anticipos sin cierre en el medio: el segundo es plata de más, no una reposición", () => {
  const f = resumenDeLaCaja({ anticipos: [...anticipos, { id: 11, monto: 50, fecha: "2026-10-10" }], cierres });
  const extra = f.find(x => x.anticipo?.id === 11);
  assert.equal(extra.tipo, "anticipo");
});

test("a igual fecha el cierre va arriba: el abono con la fecha del corte entró en él", () => {
  const f = resumenDeLaCaja({
    anticipos: [{ id: 1, monto: 100, fecha: "2026-10-21" }],
    cierres: [{ id: 2, numero: 1, hasta: "2026-10-21", gastos: 3 }],
  });
  assert.deepEqual(f.map(x => x.tipo), ["cierre", "fondo"]);
});

test("los devueltos al residente quedan fuera del reporte, aparte y sin sumar", () => {
  const { gastos, devueltos } = paraElReporte([
    { id: 1, monto: 10, estado: "aprobado" }, { id: 2, monto: 13.5, estado: "devuelto" }, { id: 3, monto: 7, estado: "pendiente" },
  ]);
  assert.deepEqual(gastos.map(g => g.id), [1, 3]);
  assert.deepEqual(devueltos.map(g => g.id), [2]);
});
