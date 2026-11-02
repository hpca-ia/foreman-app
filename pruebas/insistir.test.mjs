import test from "node:test";
import assert from "node:assert/strict";
import { reclamo, laMejor, leerHastaQueCuadre } from "../src/modules/lectura/insistir.js";
import { revisarLectura } from "../src/modules/lectura/aritmetica.js";

// El papel: cuatro renglones que suman 16.200, y el pie lo dice.
const PAPEL = { subtotal: 16200, iva: 1944, total: 18144 };
const COMPLETA = [
  { descripcion: "Punto de iluminación EMT", cantidad: 100, unitario: 33, monto: 3300 },
  { descripcion: "Cable THHN 12 AWG",        cantidad: 500, unitario: 4,  monto: 2000 },
  { descripcion: "Tablero trifásico",        cantidad: 1,   unitario: 180, monto: 180 },
  { descripcion: "Acometida eléctrica",      cantidad: 1,   unitario: 10720, monto: 10720 },
];

// `leer` de mentira: devuelve las lecturas que se le pongan, en orden, y anota
// con qué reclamo la llamaron. Así se prueba el criterio del lazo sin modelo.
function modeloDe(...lecturas) {
  const reclamos = [];
  let i = 0;
  const leer = async (r) => { reclamos.push(r); return lecturas[Math.min(i++, lecturas.length - 1)]; };
  return { leer, reclamos, llamadas: () => i };
}

test("si la primera lectura cuadra, no se le pregunta dos veces", async () => {
  const m = modeloDe({ items: COMPLETA, totales: PAPEL });
  const r = await leerHastaQueCuadre({ leer: m.leer, vueltas: 3 });
  assert.equal(r.cerro, true);
  assert.equal(m.llamadas(), 1);
  assert.equal(r.vuelta, 1);
  assert.equal(r.items.length, 4);
});

test("falta un renglón: se le dice cuánto falta y la segunda vuelta cierra", async () => {
  // Esto es lo que pasó de verdad con una proforma de 42 renglones de la que
  // se leyeron 28: la suma daba menos y se guardaba igual con una advertencia.
  const incompleta = COMPLETA.slice(0, 3);          // suman 5.480 de 16.200
  const m = modeloDe({ items: incompleta, totales: PAPEL }, { items: COMPLETA, totales: PAPEL });
  const r = await leerHastaQueCuadre({ leer: m.leer, vueltas: 3 });

  assert.equal(m.llamadas(), 2);
  assert.equal(r.cerro, true);
  assert.equal(r.items.length, 4);
  // La primera vuelta va sin reclamo; la segunda lleva el número exacto.
  assert.equal(m.reclamos[0], null);
  assert.match(m.reclamos[1], /Faltan \$10720\.00/);
  assert.match(m.reclamos[1], /suman \$5480\.00 y el papel dice \$16200\.00/);
  assert.match(m.reclamos[1], /sin transcribir/);
});

test("entró un subtotal como renglón: el reclamo dice que sobra y qué suele ser", () => {
  const conSubtotal = [...COMPLETA, { descripcion: "SUBTOTAL", cantidad: 0, unitario: 0, monto: 5480 }];
  const texto = reclamo(revisarLectura(conSubtotal, PAPEL, 0));
  assert.match(texto, /Sobran \$5480\.00/);
  assert.match(texto, /subtotal de capítulo/);
  assert.match(texto, /escrito en letras al pie/);
});

test("un renglón que no multiplica se nombra, con sus tres números", () => {
  const mal = COMPLETA.map((x, i) => i === 1 ? { ...x, monto: 2450 } : x);
  const texto = reclamo(revisarLectura(mal, { ...PAPEL, subtotal: 16650 }, 0));
  assert.match(texto, /«Cable THHN 12 AWG» da \$2000\.00 y le pusiste \$2450\.00/);
  assert.match(texto, /el que manda es el que está impreso/);
});

test("nunca se le pide que ajuste los números para que cierren", () => {
  const texto = reclamo(revisarLectura(COMPLETA.slice(0, 2), PAPEL, 0));
  assert.match(texto, /No corrijas los números para que cierren/);
});

test("si no cuadra ni a las tres, devuelve la mejor y avisa que no cerró", async () => {
  const m = modeloDe(
    { items: COMPLETA.slice(0, 1), totales: PAPEL },   // suman 3.300
    { items: COMPLETA.slice(0, 3), totales: PAPEL },   // suman 5.480 ← la más cerca
    { items: COMPLETA.slice(0, 2), totales: PAPEL },   // suman 5.300
  );
  const r = await leerHastaQueCuadre({ leer: m.leer, vueltas: 3 });

  assert.equal(m.llamadas(), 3);
  assert.equal(r.cerro, false);
  assert.equal(r.items.length, 3);            // se quedó con la de la vuelta 2
  assert.equal(r.vuelta, 2);
  assert.equal(r.historia.length, 3);
});

test("la que cuadra gana aunque llegue última", async () => {
  const m = modeloDe(
    { items: COMPLETA.slice(0, 3), totales: PAPEL },
    { items: COMPLETA.slice(0, 2), totales: PAPEL },
    { items: COMPLETA, totales: PAPEL },
  );
  const r = await leerHastaQueCuadre({ leer: m.leer, vueltas: 3 });
  assert.equal(r.cerro, true);
  assert.equal(r.vuelta, 3);
});

test("no se mezclan dos lecturas para armar una tercera", async () => {
  // Juntar los renglones de dos vueltas haría cuadrar la suma inventando un
  // documento que nadie firmó. Se elige una lectura, entera.
  const m = modeloDe(
    { items: [COMPLETA[0], COMPLETA[1]], totales: PAPEL },
    { items: [COMPLETA[2], COMPLETA[3]], totales: PAPEL },
  );
  const r = await leerHastaQueCuadre({ leer: m.leer, vueltas: 2 });
  assert.equal(r.cerro, false);
  assert.equal(r.items.length, 2);
  assert.ok(r.items.every(x => [COMPLETA[2], COMPLETA[3]].includes(x)));
});

test("sin subtotal en el papel no hay contra qué comprobar: no insiste", async () => {
  // Volver a leer sería pedirle al modelo que adivine distinto. Eso lo mira
  // una persona, no se resuelve insistiendo.
  const m = modeloDe({ items: COMPLETA, totales: null });
  const r = await leerHastaQueCuadre({ leer: m.leer, vueltas: 3 });
  assert.equal(m.llamadas(), 1);
  assert.equal(r.cerro, false);
  assert.equal(r.revision.cuadra, null);
});

test("entre dos que no cuadran, la que tiene menos renglones rotos", () => {
  const a = { revision: revisarLectura(COMPLETA.map((x, i) => i < 2 ? { ...x, monto: x.monto + 7 } : x), PAPEL, 0) };
  const b = { revision: revisarLectura(COMPLETA.map((x, i) => i < 1 ? { ...x, monto: x.monto + 7 } : x), PAPEL, 0) };
  assert.equal(laMejor(a, b), b);
  assert.equal(laMejor(b, a), b);
});
