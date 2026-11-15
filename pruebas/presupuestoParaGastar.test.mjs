// En el control del gasto, lo que una orden quita y su renglón negativo se
// cancelan, y la agrupación de la orden queda con sus adiciones enteras.
// Con los rubros y las líneas reales de la OC-01 y la OC-03 del Aeropuerto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rubrosParaGastar, notaDeLaOrden, codigoDeOrden } from "../src/modules/controlObra/presupuestoParaGastar.js";
import { calcularControl, agrupar, totalesObra, recibeGasto } from "../src/modules/controlObra/calculos.js";
import { gastosEnRubroQuitado } from "../src/modules/controlObra/contadoDosVeces.js";
import { contratoDe } from "../src/modules/controlObra/contratoDeLaObra.js";

const r = (id, numero, descripcion, total_base, actividad_id, mas = {}) => ({ id, obra_id: 13, numero, descripcion, total_base, actividad_id, iva_pct: 15, origen: "base", capitulo: "C", capitulo_orden: 1, orden: numero, ...mas });
const oc = (id, numero, descripcion, total_base, actividad_id, orden_cambio_id) => r(id, numero, descripcion, total_base, actividad_id, { origen: "orden_cambio", orden_cambio_id });
const RUBROS = [
  r(1295, 28, "TUMBADO GYPSUM PLANO REGULAR", 3228.74, 167),
  r(1296, 29, "TUMBADO GYPSUM RH", 1500, 167),
  r(1308, 41, "PISO DE MICROCEMENTO PULIDO COLOR BLANCO", 8658.68, 183),
  r(1319, 52, "MICROCEMENTO EN PAREDES COLOR BLANCO", 2445.19, 183),
  oc(1433, 9100, "FUNDICIÓN DE LOSA EN CEMENTO BLANCO PULIDO", 10830.22, 195, 5),
  oc(1434, 9101, "PICADO DE MASILLADO Y LOSA 7 CM", 511.27, 195, 5),
  oc(1435, 9102, "TENDIDO DE MALLA ELECTROSOLDADA", 879.61, 195, 5),
  oc(1436, 9103, "DESALOJO Y ESTIBAJE DE MATERIALES", 287.50, 195, 5),
  oc(1440, 9190, "(–) PISO DE MICROCEMENTO PULIDO COLOR BLANCO", -8658.68, 195, 5),
  oc(1444, 9300, "RESANE DE FIBROCEMENTO EN TUMBADO", 538.20, 196, 9),
  oc(1447, 9303, "PINTURA DE TUMBADO FIBROCEMENTO", 798.33, 196, 9),
  oc(1448, 9304, "(–) TUMBADO GYPSUM PLANO REGULAR", -1005.09, 196, 9),
];
const QUITAS = {
  ordenes: [{ id: 5, codigo: "OC-01", numero: 1 }, { id: 9, codigo: "OC-03", numero: 3 }],
  lineas: [
    { orden_id: 5, tipo: "quita", obra_rubro_id: 1308, cantidad: 95.61, precio_unitario: 78.75 },
    { orden_id: 9, tipo: "quita", obra_rubro_id: 1295, cantidad: 39, precio_unitario: 22.41 },
  ],
};
const actividades = [167, 183, 195, 196].map((id, i) => ({ id, nombre: `A${id}`, orden: i }));
const de = (lista, id) => lista.find(x => x.id === id);

test("LO QUE DEFINIÓ: el rubro del contrato y el negativo de la ODC se anulan", () => {
  const { rubros, descuadres } = rubrosParaGastar(RUBROS, QUITAS);
  assert.deepEqual(descuadres, []);
  // El microcemento quitado entero: anulado.
  assert.deepEqual([de(rubros, 1308).total_base, de(rubros, 1308)._anuladoPor, de(rubros, 1308)._base_original], [0, "OC-01", 8658.68]);
  // Su negativo: en cero, cancelado con el rubro 41.
  assert.deepEqual([de(rubros, 1440).total_base, de(rubros, 1440)._cancela], [0, { codigo: "OC-01", con: [41] }]);
  // Ninguno de los dos recibe gasto.
  assert.equal(recibeGasto(de(rubros, 1308)), false);
  assert.equal(recibeGasto(de(rubros, 1440)), false);
});

test("y queda el total de las adiciones disponible para el control de obra", () => {
  const { rubros } = rubrosParaGastar(RUBROS, QUITAS);
  const grupos = agrupar(rubros, calcularControl({ rubros, facturas: [], asignaciones: [] }), "actividad", actividades);
  const g = id => Math.round(grupos.find(x => x.clave === `a${id}`).base * 100) / 100;
  assert.equal(g(195), 12508.60);   // OC-01: la obra nueva entera
  assert.equal(g(196), 1336.53);    // OC-03
  assert.equal(g(183), 2445.19);    // Recubrimientos duros: sin el microcemento de piso
  assert.equal(g(167), 3723.65);    // Gypsum: con lo que sigue del plano regular
});

test("una orden que quita una parte deja el rubro con lo que sigue haciéndose", () => {
  const { rubros } = rubrosParaGastar(RUBROS, QUITAS);
  const g = de(rubros, 1295);
  assert.deepEqual([g.total_base, g._anuladoPor, g._rebaja], [2223.65, undefined, [{ codigo: "OC-03", monto: 1005.09, cantidad: 39 }]]);
  assert.equal(recibeGasto(g), true);
  assert.equal(notaDeLaOrden({ ...g, unidad: "m2" }), "OC-03 eliminó 39 m2 · −$1.005,09 · quedan $2.223,65");
});

test("el total de la obra no se mueve un centavo", () => {
  const antes = totalesObra(agrupar(RUBROS, calcularControl({ rubros: RUBROS }), "actividad", actividades)).base;
  const { rubros } = rubrosParaGastar(RUBROS, QUITAS);
  const despues = totalesObra(agrupar(rubros, calcularControl({ rubros }), "actividad", actividades)).base;
  assert.equal(Math.round(despues * 100), Math.round(antes * 100));
});

test("el contrato no cambia: se sigue leyendo con los rubros tal cual", () => {
  const c = contratoDe(RUBROS);
  assert.equal(Math.round(c.reducciones * 100) / 100, 9663.77);
  // Lo que se le pasa a contratoDe en la pantalla son los rubros de la base, no los del control.
  const vista = readFileSync(new URL("../src/modules/controlObra/VistaObra.jsx", import.meta.url), "utf8");
  assert.match(vista, /<PanelPresupuestoActualizado obra=\{obra\} rubros=\{rubros\}/);
  assert.match(vista, /<PanelBeneficios obra=\{obra\} rubros=\{rubros\}/);
  assert.match(vista, /<PanelCurar obra=\{obra\} rubros=\{rubros\}/);
  assert.match(vista, /calcularControl\(\{ rubros: rubrosControl,/);
  assert.match(vista, /agrupar\(rubrosControl, porRubro/);
});

test("si lo que quita la orden no da lo mismo que su negativo, esa orden se deja como estaba", () => {
  const malas = { ...QUITAS, lineas: [{ orden_id: 5, tipo: "quita", obra_rubro_id: 1308, cantidad: 50, precio_unitario: 78.75 }, QUITAS.lineas[1]] };
  const { rubros, descuadres } = rubrosParaGastar(RUBROS, malas);
  assert.deepEqual(descuadres, [{ codigo: "OC-01", negativo: 8658.68, resta: 4528.13 }]);
  assert.equal(de(rubros, 1308).total_base, 8658.68);
  assert.equal(de(rubros, 1440).total_base, -8658.68);
  // La otra sí se cancela.
  assert.equal(de(rubros, 1295).total_base, 2223.65);
  // Una orden con negativo y sin línea «quita» tampoco se toca.
  assert.deepEqual(rubrosParaGastar(RUBROS, { ordenes: QUITAS.ordenes, lineas: [] }).descuadres.map(d => d.codigo), ["OC-01", "OC-03"]);
});

test("sin órdenes que quiten nada, los rubros salen tal cual", () => {
  const sinNegativos = RUBROS.filter(x => x.total_base >= 0);
  assert.equal(rubrosParaGastar(sinNegativos, QUITAS).rubros, sinNegativos);
  assert.deepEqual(rubrosParaGastar([], {}).rubros, []);
});

test("lo gastado directo en el rubro anulado no desaparece: sigue contando y sale en Alertas", () => {
  const { rubros } = rubrosParaGastar(RUBROS, QUITAS);
  const facturas = [{ id: 1, total: 200, clase: "factura", fecha: "2026-11-01", _planillaNumero: 1 }];
  const asignaciones = [{ id: 7, factura_id: 1, obra_rubro_id: 1308, monto: 200 }];
  const pr = calcularControl({ rubros, facturas, asignaciones });
  assert.equal(pr[1308].acumulado, 200);
  assert.equal(pr[1308].saldo, -200);
  const g = agrupar(rubros, pr, "actividad", actividades).find(x => x.clave === "a183");
  assert.equal(g.acumulado, 200);
  assert.deepEqual(gastosEnRubroQuitado({ rubros, facturas, asignaciones }).map(x => x.rubro.numero), [41]);
});

test("la cantidad también: lo que queda por hacer", () => {
  const conCantidad = RUBROS.map(x => (x.id === 1295 ? { ...x, cantidad: 125.29 } : x.id === 1308 ? { ...x, cantidad: 95.61 } : x));
  const { rubros } = rubrosParaGastar(conCantidad, QUITAS);
  assert.deepEqual([de(rubros, 1295).cantidad, de(rubros, 1295)._cantidad_original], [86.29, 125.29]);
  assert.equal(de(rubros, 1308).cantidad, 0);
});

test("cómo se dice en la tabla", () => {
  const { rubros } = rubrosParaGastar(RUBROS, QUITAS);
  assert.equal(notaDeLaOrden(de(rubros, 1308)), "Eliminado por OC-01 · era $8.658,68");
  assert.equal(notaDeLaOrden(de(rubros, 1440)), "Lo que OC-01 elimina: resta del rubro 41, arriba");
  assert.equal(notaDeLaOrden(de(rubros, 1433)), "");
  assert.equal(codigoDeOrden({ numero: 4 }), "OC-04");
});

test("los que eligen un rubro para cargar gasto usan la misma cuenta", () => {
  const leer = p => readFileSync(new URL(p, import.meta.url), "utf8");
  assert.match(leer("../src/modules/cajaChica/SelectorActividad.jsx"), /rubrosParaGastarDe\(obraId, rs \|\| \[\]\)\)\.filter\(r => !r\.oculto && recibeGasto\(r\)\)/);
  assert.match(leer("../src/modules/ModuloCajaChica.jsx"), /await rubrosParaGastarDe\(id, data \|\| \[\]\)/);
  const compras = leer("../src/modules/compras/compras.js");
  assert.equal((compras.match(/rubrosParaGastarDe\(obra\.id,/g) || []).length, 2);
  assert.doesNotMatch(leer("../src/modules/compras/ModalSolicitud.jsx"), /total_base\) < 0/);
});
