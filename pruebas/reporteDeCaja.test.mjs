// El reporte de la caja, por período o por cierre: qué entra en cada uno.
import test from "node:test";
import assert from "node:assert/strict";
import { contenidoDelReporte, cierresParaElegir } from "../src/modules/cajaChica/reporte.js";

// Una caja con dos cierres, como la de Lizeth: el fondo, la reposición
// del primero —que es la plata del segundo— y la del segundo, todavía suelta.
const cierres = [
  { id: 15, numero: 1, hasta: "2026-10-21", gastos: 2, total_gastado: 300, total_abonado: 1000, saldo: 700, cerrado_nombre: "Johanna" },
  { id: 17, numero: 2, hasta: "2026-10-31", gastos: 2, total_gastado: 150, total_abonado: 300, saldo: 150 },
];
const anticipos = [
  { id: 9, fecha: "2026-10-08", monto: 1000, cierre_id: 15, descripcion: "Caja chica 1" },
  { id: 10, fecha: "2026-10-23", monto: 300, cierre_id: 17, descripcion: "Reposición caja chica 1" },
  { id: 12, fecha: "2026-11-05", monto: 150, cierre_id: null, descripcion: "Reposición caja chica 2" },
];
const gastos = [
  { id: 1, fecha: "2026-10-10", monto: 100, cierre_id: 15, archivo_url: "a" },
  { id: 2, fecha: "2026-10-20", monto: 200, cierre_id: 15 },
  // Con fecha del primer cierre, pero se rindió en el segundo.
  { id: 3, fecha: "2026-10-19", monto: 50, cierre_id: 17 },
  { id: 4, fecha: "2026-10-30", monto: 100, cierre_id: 17 },
  // De esos mismos días, devuelto al residente: no entró en ningún cierre.
  { id: 5, fecha: "2026-10-22", monto: 80, cierre_id: null, estado: "devuelto" },
  { id: 6, fecha: "2026-11-04", monto: 40, cierre_id: null },
];
const todo = { gastos, anticipos, cierres };

test("por cierre sale lo que se rindió en esa vuelta, no un rango de fechas", () => {
  const r = contenidoDelReporte({ ...todo, modo: "cierre", cierreId: 17 });
  assert.deepEqual(r.gastosF.map(g => g.id), [3, 4]);
  assert.equal(r.totalGastos, 150);
  // El 5 tiene fecha dentro del cierre 2 y no está: quedó afuera al cerrar.
  assert.equal(r.devueltosF.length, 0);
});

test("lo entregado es la plata de esa vuelta, y la reposición es la que llegó después", () => {
  const uno = contenidoDelReporte({ ...todo, modo: "cierre", cierreId: 15 });
  assert.deepEqual(uno.anticiposF.map(a => a.id), [9]);
  assert.equal(uno.totalAnticipos, 1000);
  assert.deepEqual(uno.reposiciones.map(a => a.id), [10]);
  assert.equal(uno.totalReposicion, 300);

  const dos = contenidoDelReporte({ ...todo, modo: "cierre", cierreId: 17 });
  assert.deepEqual(dos.anticiposF.map(a => a.id), [10]);
  assert.deepEqual(dos.reposiciones.map(a => a.id), [12]);
});

test("un cierre sin reposición cargada lo dice con cero, no con la de otro", () => {
  const sin = contenidoDelReporte({ gastos, cierres, anticipos: anticipos.slice(0, 2), modo: "cierre", cierreId: 17 });
  assert.deepEqual(sin.reposiciones, []);
  assert.equal(sin.totalReposicion, 0);
});

test("se nombra por su número y su corte", () => {
  const r = contenidoDelReporte({ ...todo, modo: "cierre", cierreId: "15" });
  assert.equal(r.etiqueta, "Cierre N° 1 · hasta el 2026-10-21");
  assert.equal(r.nombre, "Cierre 1");
  assert.deepEqual(r.cierresF.map(c => c.id), [15]);
});

test("si cuadra con lo firmado no avisa nada", () => {
  assert.equal(contenidoDelReporte({ ...todo, modo: "cierre", cierreId: 15 }).difiere, null);
  assert.equal(contenidoDelReporte({ ...todo, modo: "cierre", cierreId: 17 }).difiere, null);
});

test("si un gasto se corrigió después de cerrar, dice lo firmado contra lo de hoy", () => {
  const corregido = gastos.map(g => (g.id === 2 ? { ...g, monto: 180 } : g));
  const r = contenidoDelReporte({ gastos: corregido, anticipos, cierres, modo: "cierre", cierreId: 15 });
  assert.deepEqual(r.difiere, { firmado: { gastos: 2, total: 300, entregado: 1000 }, hoy: { gastos: 2, total: 280, entregado: 1000 } });
});

test("uno devuelto después de cerrado sale de la cuenta, y se avisa", () => {
  const devuelto = gastos.map(g => (g.id === 4 ? { ...g, estado: "devuelto" } : g));
  const r = contenidoDelReporte({ gastos: devuelto, anticipos, cierres, modo: "cierre", cierreId: 17 });
  assert.deepEqual(r.gastosF.map(g => g.id), [3]);
  assert.deepEqual(r.devueltosF.map(g => g.id), [4]);
  assert.equal(r.totalDevueltos, 100);
  assert.equal(r.difiere.hoy.gastos, 1);
});

test("un cierre que no existe no inventa nada", () => {
  const r = contenidoDelReporte({ ...todo, modo: "cierre", cierreId: 99 });
  assert.equal(r.cierre, null);
  assert.deepEqual(r.gastosF, []);
  assert.equal(r.totalGastos, 0);
});

test("por período sigue siendo por fechas, con los devueltos aparte", () => {
  const r = contenidoDelReporte({ ...todo, modo: "periodo", desde: "2026-10-01", hasta: "2026-10-31" });
  assert.deepEqual(r.gastosF.map(g => g.id), [1, 3, 2, 4]);
  assert.deepEqual(r.devueltosF.map(g => g.id), [5]);
  assert.equal(r.totalGastos, 450);
  assert.deepEqual(r.anticiposF.map(a => a.id), [9, 10]);
  assert.deepEqual(r.cierresF.map(c => c.numero), [1, 2]);
  assert.equal(r.etiqueta, "2026-10-01 a 2026-10-31");
  assert.equal(r.difiere, null);
});

test("por período sin «desde» va desde el inicio", () => {
  const r = contenidoDelReporte({ ...todo, modo: "periodo", desde: "", hasta: "2026-10-15" });
  assert.deepEqual(r.gastosF.map(g => g.id), [1]);
  assert.equal(r.etiqueta, "inicio a 2026-10-15");
});

test("cada anticipo dice qué es, igual que en la pantalla de la caja", () => {
  const r = contenidoDelReporte({ ...todo, modo: "periodo", desde: "", hasta: "" });
  assert.deepEqual(r.anticiposF.map(r.queEs), ["Fondo inicial", "Reposición tras el cierre 1", "Reposición tras el cierre 2"]);
});

test("para elegir, el cierre más nuevo va primero", () => {
  assert.deepEqual(cierresParaElegir(cierres).map(c => c.numero), [2, 1]);
});
