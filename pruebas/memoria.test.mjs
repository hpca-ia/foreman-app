import test from "node:test";
import assert from "node:assert/strict";
import { magnitudes, magnitudDe, rendimiento, UNIDAD } from "../src/modules/cronograma/magnitudes.js";
import { patronDe, memoriaEnPalabras, apunteDe, apunteEnUnaLinea } from "../src/modules/cronograma/apuntes.js";

// EL TAMAÑO DE UNA AGRUPACIÓN.
//
// De acá sale la duración —cantidad dividido para lo que rinde una cuadrilla—
// y de acá sale también el rendimiento que se aprende cuando alguien corrige
// esa duración. Tienen que ser el mismo número: si se calculan distinto, NOVA
// aprende un rendimiento medido sobre una cantidad que no usó.

test("las unidades escritas de veinte maneras son la misma unidad", () => {
  assert.equal(UNIDAD("M2"), "m2");
  assert.equal(UNIDAD("m²"), "m2");
  assert.equal(UNIDAD("mt2"), "m2");
  assert.equal(UNIDAD("metros cuadrados"), "m2");
  assert.equal(UNIDAD("ML"), "ml");
  assert.equal(UNIDAD("m"), "ml");
  assert.equal(UNIDAD("u"), "u");
  assert.equal(UNIDAD("c/u"), "u");
  assert.equal(UNIDAD("global"), "glb");
});

test("suma por unidad y pone primero la que define el tamaño", () => {
  const m = magnitudes([
    { cantidad: 300, unidad: "m2" },
    { cantidad: 150, unidad: "M2" },
    { cantidad: 12, unidad: "u" },
  ]);
  assert.deepEqual(m, [{ unidad: "m2", cantidad: 450 }, { unidad: "u", cantidad: 12 }]);
});

test("lo global no es una magnitud: no dice de qué tamaño es", () => {
  const m = magnitudes([{ cantidad: 1, unidad: "glb" }, { cantidad: 80, unidad: "m2" }]);
  assert.deepEqual(m, [{ unidad: "m2", cantidad: 80 }]);
});

test("lo anulado por una orden de cambio ya no es trabajo que haya que hacer", () => {
  const m = magnitudes([
    { cantidad: 400, unidad: "m2" },
    { cantidad: 1000, unidad: "m2", anulado_por_oc: true },
    { cantidad: 500, unidad: "m2", oculto: true },
  ]);
  assert.deepEqual(m, [{ unidad: "m2", cantidad: 400 }]);
});

test("el tamaño de UNA agrupación, entre los rubros de toda la obra", () => {
  const rubros = [
    { actividad_id: 7, cantidad: 200, unidad: "m2" },
    { actividad_id: 7, cantidad: 250, unidad: "m2" },
    { actividad_id: 9, cantidad: 999, unidad: "m3" },
  ];
  assert.deepEqual(magnitudDe(rubros, 7), { unidad: "m2", cantidad: 450 });
  // El id puede llegar como texto desde la base: comparar con === lo perdía.
  assert.deepEqual(magnitudDe(rubros, "7"), { unidad: "m2", cantidad: 450 });
  assert.equal(magnitudDe(rubros, null), null);
  assert.equal(magnitudDe(rubros, 42), null);
});

test("EL RENDIMIENTO ES LO QUE VIAJA A LA PRÓXIMA OBRA, no los días", () => {
  assert.deepEqual(rendimiento({ cantidad: 450, unidad: "m2" }, 25),
    { cantidad: 450, unidad: "m2", dias: 25, rinde: 18 });
});

test("sin cantidades no hay rendimiento, y no se inventa uno", () => {
  assert.equal(rendimiento(null, 25), null);
  assert.equal(rendimiento({ cantidad: 0, unidad: "m2" }, 25), null);
  assert.equal(rendimiento({ cantidad: 450, unidad: "m2" }, 0), null);
});

// CÓMO SE LE DICTA LA MEMORIA A NOVA.
//
// Acá estaba el agujero: los apuntes de cronograma guardan un rendimiento y se
// dictaban con el molde del valorado, que habla de porcentajes y de anticipos.
// Donde el apunte decía "35 días hábiles" salía escrito en la consulta "el
// primer pago 35 meses antes de instalar". El dato bueno quedaba en un
// paréntesis, al lado de una frase que lo contradecía.

test("el apunte de cronograma se dicta como rendimiento, no como forma de pago", () => {
  const t = memoriaEnPalabras([{
    patron: "mamposteria bloque", perfil: "duracion", anticipacion: 25,
    rendimiento: { cantidad: 450, unidad: "m2", dias: 25, rinde: 18 }, veces: 3,
  }], "cronograma");
  assert.match(t, /18 m2 por día/);
  assert.match(t, /450 m2 en 25 días hábiles/);
  assert.match(t, /corregido 3 veces/);
  // LO QUE NUNCA MÁS DEBE APARECER.
  assert.doesNotMatch(t, /primer pago/);
  assert.doesNotMatch(t, /antes de instalar/);
  assert.doesNotMatch(t, /%/);
});

test("un apunte sin cantidades se dicta como flojo, y se dice por qué", () => {
  const t = memoriaEnPalabras([{
    patron: "gastos generales", perfil: "duracion", rendimiento: { dias: 120 }, veces: 1,
  }], "cronograma");
  assert.match(t, /120 días hábiles en una obra anterior/);
  assert.match(t, /sin cantidades/);
  assert.doesNotMatch(t, /por día/);
});

test("el apunte viejo, guardado antes de la 100, se sigue entendiendo", () => {
  // Hasta la 100 los días vivían en `anticipacion`, que es la columna del
  // valorado. Los apuntes ya guardados no se van a reescribir solos.
  const t = memoriaEnPalabras([
    { patron: "enlucido paleteado", perfil: "duracion", anticipacion: 40, veces: 2 },
  ], "cronograma");
  assert.match(t, /40 días hábiles en una obra anterior/);
  assert.doesNotMatch(t, /primer pago/);
});

test("el valorado sigue hablando de pagos: no se rompió al separarlos", () => {
  const t = memoriaEnPalabras([{
    patron: "ventaneria aluminio", perfil: "importacion", veces: 2,
    pagos: [{ pct: 50 }, { pct: 30 }, { pct: 20 }], anticipacion: 2,
  }], "valorado");
  assert.match(t, /50% \/ 30% \/ 20%/);
  assert.match(t, /el primer pago 2 meses antes de instalar/);
  assert.match(t, /confirmado 2 veces/);
});

test("sin apuntes no se dice nada: una consulta no lleva encabezados vacíos", () => {
  assert.equal(memoriaEnPalabras([], "cronograma"), "");
  // Un apunte sin días ni rendimiento no aporta nada y no debe dejar el
  // encabezado colgado con una lista vacía debajo.
  assert.equal(memoriaEnPalabras([{ patron: "algo", perfil: "duracion" }], "cronograma"), "");
});

test("el patrón reconoce el mismo trabajo escrito distinto", () => {
  assert.equal(patronDe("PROVISIÓN E INSTALACIÓN DE MAMPOSTERÍA DE BLOQUE"), patronDe("Mampostería de bloque"));
  assert.equal(patronDe("Enlucido paleteado interior"), "enlucido paleteado interior");
  assert.equal(patronDe("de la y en"), "");
});

test("la pantalla encuentra el apunte por el nombre de la actividad", () => {
  const memoria = [{ patron: "mamposteria bloque", rendimiento: { rinde: 18, unidad: "m2" }, veces: 3 }];
  const a = apunteDe(memoria, "Provisión de mampostería de bloque");
  assert.ok(a);
  assert.match(apunteEnUnaLinea(a), /18 m2 por día/);
  assert.match(apunteEnUnaLinea(a), /corregido 3 veces/);
  assert.equal(apunteDe(memoria, "Estructura metálica"), null);
  assert.equal(apunteEnUnaLinea(null), "");
});
