// Los préstamos del rol: se anotan una vez y se descuentan rol a rol.
import test from "node:test";
import assert from "node:assert/strict";
import {
  cedulaLimpia, esDeLaPersona, estadoDelPrestamo, conEstado, descuentoDelRol, extrasConPrestamos,
  cuotasParaGuardar, nuevoPrestamo, nuevoAbono,
} from "../src/modules/manoDeObra/prestamos.js";
import { calcularNomina, PARAMETROS } from "../src/modules/manoDeObra/nomina.js";

const tello = { id: 23, nombre: "TELLO ORTIZ CARLOS INOCENCIO", cedula: "0915523492", salario_mensual: 500.98 };
const vivas = { id: 24, nombre: "VIVAS ALVAREZ JULIO ALBERTO", cedula: "0952763563", salario_mensual: 494.53 };
const prestamo = { id: 1, personal_id: 2, cedula: "0915523492", nombre: tello.nombre, fecha: "2026-11-03", monto: 300, cuota: 50 };

test("el préstamo sigue a la persona por su cédula, aunque haya reingresado con otra fila", () => {
  // Se le dio cuando era la fila 2; hoy es la 23. Es la misma persona.
  assert.equal(esDeLaPersona(prestamo, tello), true);
  assert.equal(esDeLaPersona(prestamo, vivas), false);
  assert.equal(cedulaLimpia(" 091-552349 2"), "0915523492");
});

test("sin cédula de un lado, se reconoce por la fila", () => {
  const sin = { id: 9, nombre: "Sin cédula" };
  assert.equal(esDeLaPersona({ personal_id: 9 }, sin), true);
  assert.equal(esDeLaPersona({ personal_id: 8 }, sin), false);
  // Dos personas sin cédula no se confunden entre sí.
  assert.equal(esDeLaPersona({ personal_id: null, cedula: "" }, { id: null, cedula: "" }), false);
});

test("el estado dice cuánto pagó, cuánto debe y cuántos roles le faltan", () => {
  assert.deepEqual(estadoDelPrestamo(prestamo, []), { pagado: 0, saldo: 300, cuotas: 0, faltan: 6, terminado: false });
  const dos = [{ prestamo_id: 1, monto: 50 }, { prestamo_id: 1, monto: 50 }, { prestamo_id: 7, monto: 999 }];
  assert.deepEqual(estadoDelPrestamo(prestamo, dos), { pagado: 100, saldo: 200, cuotas: 2, faltan: 4, terminado: false });
  const todo = Array.from({ length: 6 }, () => ({ prestamo_id: 1, monto: 50 }));
  assert.deepEqual(estadoDelPrestamo(prestamo, todo), { pagado: 300, saldo: 0, cuotas: 6, faltan: 0, terminado: true });
});

test("cien en cuotas de cincuenta son dos roles, no tres", () => {
  assert.equal(estadoDelPrestamo({ id: 1, monto: 100, cuota: 50 }, []).faltan, 2);
  assert.equal(estadoDelPrestamo({ id: 1, monto: 100, cuota: 33.34 }, []).faltan, 3);
  assert.equal(estadoDelPrestamo({ id: 1, monto: 100, cuota: 33.33 }, []).faltan, 4);
});

test("cada rol trae la cuota sola", () => {
  const d = descuentoDelRol({ persona: tello, prestamos: [prestamo], cuotas: [], hasta: "2026-11-30" });
  assert.equal(d.auto, 50); assert.equal(d.aplicado, 50); assert.equal(d.saldo, 300); assert.equal(d.saldoDespues, 250);
  assert.deepEqual(d.partes, [{ prestamo_id: 1, monto: 50, saldoDespues: 250 }]);
  assert.equal(d.manual, false); assert.equal(d.tiene, true);
});

test("la última cuota es lo que queda, no la cuota entera", () => {
  const cinco = Array.from({ length: 5 }, () => ({ prestamo_id: 1, monto: 50 }));
  const casi = { ...prestamo, monto: 270 };
  const d = descuentoDelRol({ persona: tello, prestamos: [casi], cuotas: cinco, hasta: "2027-04-30" });
  assert.equal(d.auto, 20); assert.equal(d.saldoDespues, 0);
});

test("un préstamo ya pagado no descuenta más, y la persona vuelve a no tener préstamos", () => {
  const seis = Array.from({ length: 6 }, () => ({ prestamo_id: 1, monto: 50 }));
  const d = descuentoDelRol({ persona: tello, prestamos: [prestamo], cuotas: seis, hasta: "2027-05-31" });
  assert.equal(d.tiene, false); assert.equal(d.auto, 0); assert.deepEqual(d.partes, []);
});

test("un préstamo dado después del último día del rol no entra en ese rol", () => {
  const d = descuentoDelRol({ persona: tello, prestamos: [prestamo], cuotas: [], hasta: "2026-10-31" });
  assert.equal(d.tiene, false); assert.equal(d.auto, 0);
});

test("un préstamo anulado no descuenta", () => {
  const d = descuentoDelRol({ persona: tello, prestamos: [{ ...prestamo, anulado: true }], cuotas: [], hasta: "2026-11-30" });
  assert.equal(d.tiene, false);
});

test("escribir 0 es no descontarle este rol: la deuda queda igual", () => {
  const d = descuentoDelRol({ persona: tello, prestamos: [prestamo], cuotas: [], escrito: "0", hasta: "2026-11-30" });
  assert.equal(d.manual, true); assert.equal(d.aplicado, 0); assert.equal(d.saldoDespues, 300); assert.deepEqual(d.partes, []);
});

test("lo escrito a mano se reparte empezando por el préstamo más viejo", () => {
  const viejo = { ...prestamo, id: 1, fecha: "2026-09-01", monto: 80, cuota: 40 };
  const nuevo = { ...prestamo, id: 2, fecha: "2026-11-03", monto: 300, cuota: 50 };
  const auto = descuentoDelRol({ persona: tello, prestamos: [nuevo, viejo], cuotas: [], hasta: "2026-11-30" });
  assert.equal(auto.auto, 90);
  assert.deepEqual(auto.partes.map(p => [p.prestamo_id, p.monto]), [[1, 40], [2, 50]]);

  const d = descuentoDelRol({ persona: tello, prestamos: [nuevo, viejo], cuotas: [], escrito: 100, hasta: "2026-11-30" });
  assert.deepEqual(d.partes, [{ prestamo_id: 1, monto: 80, saldoDespues: 0 }, { prestamo_id: 2, monto: 20, saldoDespues: 280 }]);
  assert.equal(d.aplicado, 100); assert.equal(d.sobra, 0); assert.equal(d.saldoDespues, 280);
});

test("si se escribe más de lo que debe, lo que sobra se dice y no baja ninguna deuda", () => {
  const d = descuentoDelRol({ persona: tello, prestamos: [{ ...prestamo, monto: 60 }], cuotas: [], escrito: "100", hasta: "2026-11-30" });
  assert.equal(d.aplicado, 60); assert.equal(d.sobra, 40); assert.equal(d.saldoDespues, 0);
});

test("la cuota entra sola en los descuentos del rol, y a quien no debe no se le toca nada", () => {
  const { extras, detalle } = extrasConPrestamos({
    personal: [tello, vivas], descuentos: { 24: { multas: "10" } }, prestamos: [prestamo], cuotas: [], hasta: "2026-11-30",
  });
  assert.equal(extras[23].prestamos, 50);
  assert.deepEqual(extras[24], { multas: "10" });
  assert.deepEqual(Object.keys(detalle), ["23"]);
});

test("lo escrito a mano para este rol le gana a la cuota, y los otros descuentos se conservan", () => {
  const { extras, detalle } = extrasConPrestamos({
    personal: [tello], descuentos: { 23: { prestamos: "0", anticipos: "100" } }, prestamos: [prestamo], cuotas: [], hasta: "2026-11-30",
  });
  assert.deepEqual(extras[23], { prestamos: "0", anticipos: "100" });
  assert.equal(detalle[23].aplicado, 0);
});

test("el rol calculado resta la cuota del a pagar", () => {
  const asistencia = { 23: Array.from({ length: 30 }, (_, i) => ({ fecha: `2026-11-${String(i + 1).padStart(2, "0")}`, presente: true, dias: 1 })) };
  const sin = calcularNomina({ personal: [tello], asistencia, extras: {}, par: PARAMETROS });
  const { extras } = extrasConPrestamos({ personal: [tello], descuentos: {}, prestamos: [prestamo], cuotas: [], hasta: "2026-11-30" });
  const con = calcularNomina({ personal: [tello], asistencia, extras, par: PARAMETROS });
  assert.equal(con.lineas[0].prestamos, 50);
  assert.equal(Math.round((sin.aPagar - con.aPagar) * 100) / 100, 50);
});

test("al cerrar el rol se guarda una cuota por cada préstamo descontado, colgada de su línea", () => {
  const viejo = { ...prestamo, id: 1, fecha: "2026-09-01", monto: 80, cuota: 40 };
  const nuevo = { ...prestamo, id: 2 };
  const { detalle } = extrasConPrestamos({ personal: [tello, vivas], descuentos: {}, prestamos: [viejo, nuevo], cuotas: [], hasta: "2026-11-30" });
  const filas = cuotasParaGuardar({
    lineas: [{ id: 501, personal_id: 23 }, { id: 502, personal_id: 24 }], detalle, rolId: 9, fecha: "2026-11-30", quien: { id: 1, name: "Hernan Cueva" },
  });
  assert.deepEqual(filas, [
    { prestamo_id: 1, rol_id: 9, rol_linea_id: 501, fecha: "2026-11-30", monto: 40, creado_por: 1, creado_nombre: "Hernan Cueva" },
    { prestamo_id: 2, rol_id: 9, rol_linea_id: 501, fecha: "2026-11-30", monto: 50, creado_por: 1, creado_nombre: "Hernan Cueva" },
  ]);
});

test("si este rol no se le descontó nada, no se guarda ninguna cuota", () => {
  const { detalle } = extrasConPrestamos({ personal: [tello], descuentos: { 23: { prestamos: 0 } }, prestamos: [prestamo], cuotas: [], hasta: "2026-11-30" });
  assert.deepEqual(cuotasParaGuardar({ lineas: [{ id: 501, personal_id: 23 }], detalle, rolId: 9, fecha: "2026-11-30" }), []);
});

test("seis roles seguidos dejan el préstamo en cero, ni un centavo más ni uno menos", () => {
  let cuotas = [];
  for (let mes = 0; mes < 8; mes++) {
    const { detalle } = extrasConPrestamos({ personal: [tello], descuentos: {}, prestamos: [prestamo], cuotas, hasta: "2027-12-31" });
    cuotas = [...cuotas, ...cuotasParaGuardar({ lineas: [{ id: 600 + mes, personal_id: 23 }], detalle, rolId: mes + 1, fecha: "2027-12-31" })];
  }
  assert.equal(cuotas.length, 6);
  assert.deepEqual(estadoDelPrestamo(prestamo, cuotas), { pagado: 300, saldo: 0, cuotas: 6, faltan: 0, terminado: true });
});

test("un préstamo nuevo pide a quién, cuánto, cuándo y la cuota", () => {
  const base = { persona: tello, lead: { id: 15 }, fecha: "2026-11-03", monto: 300, cuota: 50, quien: { id: 1, name: "Hernan Cueva" } };
  assert.deepEqual(nuevoPrestamo(base).fila, {
    lead_id: 15, personal_id: 23, cedula: "0915523492", nombre: tello.nombre, fecha: "2026-11-03", monto: 300, cuota: 50, motivo: null, anulado: false,
    creado_por: 1, creado_nombre: "Hernan Cueva",
  });
  assert.match(nuevoPrestamo({ ...base, persona: null }).error, /a quién/);
  assert.match(nuevoPrestamo({ ...base, monto: "" }).error, /cuánto se le presta/);
  assert.match(nuevoPrestamo({ ...base, fecha: "" }).error, /fecha/);
  assert.match(nuevoPrestamo({ ...base, cuota: "" }).error, /cada rol/);
  assert.match(nuevoPrestamo({ ...base, cuota: 400 }).error, /más que el préstamo/);
});

test("dicho en cuántos roles, la cuota sale sola y termina justo en esos roles", () => {
  assert.equal(nuevoPrestamo({ persona: tello, fecha: "2026-11-03", monto: 300, roles: 6 }).fila.cuota, 50);
  const tres = nuevoPrestamo({ persona: tello, fecha: "2026-11-03", monto: 100, roles: 3 }).fila;
  assert.equal(tres.cuota, 33.34);
  assert.equal(estadoDelPrestamo({ id: 1, ...tres }, []).faltan, 3);
});

test("un abono a mano no puede ser más que lo que debe", () => {
  const cuotas = [{ prestamo_id: 1, monto: 250 }];
  assert.match(nuevoAbono({ prestamo, cuotas, fecha: "2026-12-01", monto: 60 }).error, /Debe \$50\.00/);
  const r = nuevoAbono({ prestamo, cuotas, fecha: "2026-12-01", monto: 50, nota: "Pagó en efectivo al salir", quien: { id: 1, name: "Hernan Cueva" } });
  assert.deepEqual(r.fila, { prestamo_id: 1, rol_id: null, rol_linea_id: null, fecha: "2026-12-01", monto: 50, nota: "Pagó en efectivo al salir", creado_por: 1, creado_nombre: "Hernan Cueva" });
});

test("la lista va del más viejo al más nuevo, con su estado", () => {
  const lista = conEstado([{ ...prestamo, id: 2, fecha: "2026-11-03" }, { ...prestamo, id: 1, fecha: "2026-09-01", monto: 80, cuota: 40 }, { ...prestamo, id: 3, anulado: true }],
    [{ prestamo_id: 1, monto: 80 }]);
  assert.deepEqual(lista.map(p => [p.id, p.saldo, p.terminado]), [[1, 0, true], [2, 300, false]]);
});
