import test from "node:test";
import assert from "node:assert/strict";
import { calcularNomina, PARAMETROS } from "../src/modules/manoDeObra/nomina.js";
import {
  lineasParaGuardar, desgloseRecibo, seSolapan, estadoDelRol, agruparPagos, gastoDelPago, resumenDePago,
} from "../src/modules/manoDeObra/rolPagado.js";

const personal = [
  { id: 1, nombre: "Juan Pérez", cedula: "1712345678", cargo: "Albañil", salario_mensual: 600, acumula_fondos: true },
  { id: 2, nombre: "Luis Mora", cedula: "1798765432", cargo: "Peón", salario_mensual: 482 },
];
const dias = n => Array.from({ length: n }, (_, i) => ({ fecha: `2026-10-${String(i + 1).padStart(2, "0")}`, dias: 1 }));
const nomina = calcularNomina({
  personal,
  asistencia: { 1: [...dias(15), { fecha: "2026-10-16", dias: 1, he50: 4 }], 2: dias(10) },
  extras: { 1: { anticipos: 100, prestamos: 20 } },
  par: PARAMETROS,
});

test("el recibo llega al mismo 'a pagar' que el cálculo, con el anticipo aparte", () => {
  nomina.lineas.forEach(l => {
    const b = desgloseRecibo(l);
    assert.equal(b.aPagar, l.aPagar);
    assert.equal(b.anticipo, Number(l.anticipos));
  });
  const juan = desgloseRecibo(nomina.lineas[0]);
  assert.equal(juan.totalMensual, Math.round((juan.aPagar + 100) * 100) / 100);
});

test("al cerrar se congela lo que dice el recibo, con la cédula", () => {
  const filas = lineasParaGuardar(nomina, 7);
  assert.equal(filas.length, 2);
  assert.equal(filas[0].rol_id, 7);
  assert.equal(filas[0].cedula, "1712345678");
  assert.equal(filas[0].anticipos, 100);
  assert.equal(filas[0].a_pagar, nomina.lineas[0].aPagar);
  assert.equal(filas[0].calculo.persona.acumula_fondos, true);
  assert.equal(filas[0].calculo.persona.nombre, undefined, "la persona no se copia entera: solo lo que explica el cálculo");
});

test("dos roles que comparten un día se pisan; uno que empieza al día siguiente no", () => {
  const oct = { desde: "2026-10-01", hasta: "2026-10-15" };
  assert.equal(seSolapan(oct, { desde: "2026-10-15", hasta: "2026-10-31" }), true);
  assert.equal(seSolapan(oct, { desde: "2026-10-16", hasta: "2026-10-31" }), false);
});

test("el rol queda pagado cuando nadie tiene algo por cobrar", () => {
  const lineas = [
    { id: 1, a_pagar: 300, pagado_at: "2026-10-30" },
    { id: 2, a_pagar: 0 },   // el anticipo se comió todo: no hay qué pagarle
    { id: 3, a_pagar: 250 },
  ];
  assert.equal(estadoDelRol(lineas), "cerrado");
  assert.equal(estadoDelRol(lineas.map(l => ({ ...l, pagado_at: l.pagado_at || (l.a_pagar ? "x" : null) }))), "pagado");
  assert.deepEqual(resumenDePago(lineas), { pagado: 300, pendiente: 250, personasPagadas: 1, personasPendientes: 1 });
});

test("con el rol firmado, un gasto por persona; con factura, uno para todas", () => {
  const lineas = [{ id: 1, a_pagar: 10 }, { id: 2, a_pagar: 20 }, { id: 3, a_pagar: 5, pagado_at: "x" }];
  assert.equal(agruparPagos(lineas, "rol").length, 2);
  assert.deepEqual(agruparPagos(lineas, "factura").map(g => g.length), [2]);
});

test("el gasto entra a control como mano de obra, por lo pagado y sin asignar", () => {
  const rol = { desde: "2026-10-01", hasta: "2026-10-15" };
  const uno = gastoDelPago({ lineas: [{ nombre: "Juan Pérez", cedula: "1712345678", cargo: "Albañil", a_pagar: 312.4 }], soporte: "rol", fecha: "2026-10-16", rol, obraId: 9 });
  assert.equal(uno.tipo, "mano_obra");
  assert.equal(uno.origen, "rol");
  assert.equal(uno.tipo_documento, "ROL DE PAGOS");
  assert.equal(uno.total, 312.4);
  assert.equal(uno.razon_social, "Juan Pérez");
  assert.equal(uno.ruc, "1712345678");

  const fac = gastoDelPago({
    lineas: [{ nombre: "A", a_pagar: 100.1 }, { nombre: "B", a_pagar: 200.2 }],
    soporte: "factura", factura: { numero: "001-001-123", ruc: "1790000000001", razon_social: "Cuadrillas SA" },
    fecha: "2026-10-16", rol, obraId: 9,
  });
  assert.equal(fac.total, 300.3);
  assert.equal(fac.tipo_documento, "FACTURA");
  assert.equal(fac.numero_factura, "001-001-123");
  assert.equal(fac.razon_social, "Cuadrillas SA");
  assert.match(fac.detalle, /2 personas: A, B/);
});
