// Beneficios: una cotización contra varios rubros, el precio real a mano, y
// cuándo manda Control de obra. Hernán, 18/11/2026: «Tengo una cotización a la
// que la subo manualmente, la podría comparar con un rubro del presupuesto o
// varios rubros del presupuesto; al momento solo me deja comparar con uno.
// Posterior a eso sería importante también poder ingresar precios o gastos
// manualmente para tener una idea hasta que vaya todo a control de obra y
// tener ya el total de beneficio real... o pérdida».
//
// Lo que definió, en el cuadro de opciones: contra varios, «total contra la
// suma»; a mano, «un solo precio real»; y con los gastos ya en Control,
// «manda Control de obra».
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rubrosDe, sonVarios, conmutar, paraGuardar, grupoDe, comoSeLlaman } from "../src/modules/controlObra/variosRubros.js";
import { compararContraPresupuesto } from "../src/modules/controlObra/compararProforma.js";
import { cuentaAMano, explicar, cambioDePrecio } from "../src/modules/controlObra/beneficioAMano.js";
import { beneficiosConControl, notaDeControl, resultadoDeLaObra, decididoPorControl } from "../src/modules/controlObra/resultadoDeLaObra.js";
import { netoPorRubro, totales } from "../src/modules/controlObra/cuentaBeneficios.js";
import { beneficiosSobreLoQueQueda } from "../src/modules/controlObra/beneficiosConOrdenes.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

// Los tres rubros de gypsum del Aeropuerto, como están en la base (con el IVA adentro),
// y las mesas de coworking, que tienen un beneficio cargado a mano.
const TUMBADO = { id: 1295, numero: 28, descripcion: "TUMBADO GYPSUM PLANO REGULAR", unidad: "m2", cantidad: 125.3, precio_unitario: 25.7715, total_base: 3229.17, iva_pct: 15, costo_unitario: null, avance_pct: 0 };
const PARED_1 = { id: 1301, numero: 34, descripcion: "PARED UNA CARA DE GYPSUM NORMAL", unidad: "m2", cantidad: 63.82, precio_unitario: 24.311, total_base: 1551.53, iva_pct: 15, costo_unitario: null, avance_pct: 0 };
const PARED_2 = { id: 1302, numero: 35, descripcion: "PARED DOBLE CARA DE GYPSUM NORMAL 10CM", unidad: "m2", cantidad: 15, precio_unitario: 43.171, total_base: 647.57, iva_pct: 15, costo_unitario: null, avance_pct: 0 };
const MESAS = { id: 1334, numero: 67, descripcion: "MESAS DE COWORKING EN ROBLE MARFIL CON BASE EN INOX", unidad: "u", cantidad: 2, precio_unitario: 1109.75, total_base: 2219.5, iva_pct: 15, costo_unitario: null, avance_pct: 0 };
const RUBROS = [TUMBADO, PARED_1, PARED_2, MESAS];
const sinIva = r => Math.round((r.total_base / 1.15) * 100) / 100;
const SUMA = Math.round((sinIva(TUMBADO) + sinIva(PARED_1) + sinIva(PARED_2)) * 100) / 100;

test("los rubros de un beneficio: su lista, o el único de siempre", () => {
  assert.deepEqual(rubrosDe({ obra_rubro_id: 1295 }), [1295]);
  assert.deepEqual(rubrosDe({ obra_rubro_id: 1295, rubros: null }), [1295]);
  assert.deepEqual(rubrosDe({ obra_rubro_id: 1295, rubros: [1295, 1301, "1302", 1301] }), [1295, 1301, 1302]);
  assert.deepEqual(rubrosDe({ rubro_id: 7 }), [7]);          // un renglón leído
  assert.deepEqual(rubrosDe({}), []);
  assert.deepEqual(rubrosDe(null), []);
  assert.equal(sonVarios({ obra_rubro_id: 1295 }), false);
  assert.equal(sonVarios({ rubros: [1295, 1301] }), true);
  // Tocar un rubro lo suma; tocarlo de nuevo lo saca.
  assert.deepEqual(conmutar([1295], 1301), [1295, 1301]);
  assert.deepEqual(conmutar([1295, 1301], 1295), [1301]);
  assert.deepEqual(conmutar([], null), []);
  // El primero queda donde lo busca todo lo demás; la lista, solo si son varios.
  assert.deepEqual(paraGuardar([1295, 1301]), { obra_rubro_id: 1295, rubros: [1295, 1301] });
  assert.deepEqual(paraGuardar([1295]), { obra_rubro_id: 1295, rubros: null });
  assert.deepEqual(paraGuardar([]), { obra_rubro_id: null, rubros: null });
  assert.deepEqual(paraGuardar([7, 9], "rubro_id"), { rubro_id: 7, rubros: [7, 9] });
  assert.equal(comoSeLlaman([1295, 1301, 1302], RUBROS), "28 TUMBADO GYPSUM PLANO REGULAR, 34 PARED UNA CARA DE GYPSUM NORMAL y 1 más");
  assert.equal(comoSeLlaman([1295], RUBROS), "28 TUMBADO GYPSUM PLANO REGULAR");
  assert.equal(comoSeLlaman([], RUBROS), "");
});

test("LO QUE DEFINIÓ: contra varios rubros, el total de la cotización contra la suma, sin IVA", () => {
  const g = grupoDe([1295, 1301, 1302], RUBROS);
  assert.equal(g.presupuestado, SUMA);
  assert.equal(g.rubros.length, 3);
  // Lo que pesa cada uno suma uno.
  assert.ok(Math.abs(Object.values(g.pesos).reduce((t, p) => t + p, 0) - 1) < 1e-9);
  assert.ok(g.pesos[1295] > g.pesos[1301] && g.pesos[1301] > g.pesos[1302]);
  // Un contratista cotiza «gypsum» en un solo renglón: 3.500 contra los tres.
  const { lineas, conVarios } = compararContraPresupuesto([{ descripcion: "Gypsum completo", cantidad: 204, unidad: "m2", monto: 3500, rubro_id: 1295, rubros: [1295, 1301, 1302] }], RUBROS);
  const l = lineas[0];
  assert.equal(conVarios, 1);
  assert.equal(l.varios, true);
  assert.equal(l.presupuestado, SUMA);
  assert.equal(l.diferencia, Math.round((SUMA - 3500) * 100) / 100);
  // Ni precio unitario ni cantidad del rubro: son tres rubros distintos.
  assert.equal(l.porUnitario, false);
  assert.equal(l.cantidadRubro, null);
  assert.equal(l.puRubro, null);
  assert.deepEqual(l.rubrosDelGrupo.map(r => r.id), [1295, 1301, 1302]);
  // Contra el mismo renglón atado a UNO, que era lo único que se podía: una pérdida que no existe.
  const solo = compararContraPresupuesto([{ descripcion: "Gypsum completo", monto: 3500, rubro_id: 1295 }], RUBROS).lineas[0];
  assert.equal(solo.diferencia, Math.round((sinIva(TUMBADO) - 3500) * 100) / 100);
  assert.ok(solo.diferencia < 0 && l.diferencia > 0);
  // Con uno solo no cambió nada de lo que había.
  assert.equal(solo.varios, undefined);
  assert.deepEqual(compararContraPresupuesto([{ monto: 100, rubro_id: 1295, rubros: [1295] }], RUBROS).lineas[0].presupuestado, sinIva(TUMBADO));
  // Un rubro de la lista que ya no existe no rompe: queda el que sí.
  assert.equal(compararContraPresupuesto([{ monto: 100, rubro_id: 1295, rubros: [1295, 99999] }], RUBROS).lineas[0].presupuestado, sinIva(TUMBADO));
});

test("cargado a mano contra varios: la cuenta y cómo se explica", () => {
  const c = cuentaAMano({ obra_rubro_id: "1295", rubros: [1295, 1301, 1302], real: "3500" }, RUBROS);
  assert.equal(c.presupuestado, SUMA);
  assert.equal(c.diferencia, Math.round((SUMA - 3500) * 100) / 100);
  assert.match(explicar(c, v => Number(v).toFixed(2)), /^Contra la suma de los 3 rubros: \$\d+\.\d\d sin IVA\. Se compara el total de la cotización contra esa suma/);
  // Lo presupuestado escrito a mano sigue mandando.
  assert.equal(cuentaAMano({ obra_rubro_id: "1295", rubros: [1295, 1301], real: "3500", presupuestado: "4000" }, RUBROS).diferencia, 500);
});

test("LO QUE DEFINIÓ: un solo precio real, que se corrige a mano y no pierde lo que decía la cotización", () => {
  const b = { id: 35, presupuestado: 1930, real: 900, cotizado: null };
  // Costó 1.100 y no los 900 de la cotización.
  assert.deepEqual(cambioDePrecio(b, "1100"), { real: 1100, cotizado: 900 });
  assert.deepEqual(cambioDePrecio(b, "1100,50"), { real: 1100.5, cotizado: 900 });
  // La segunda corrección no pisa lo cotizado.
  assert.deepEqual(cambioDePrecio({ ...b, real: 1100, cotizado: 900 }, "1200"), { real: 1200 });
  // Sin cambio, vacío o algo que no es un precio: no se guarda nada.
  assert.equal(cambioDePrecio(b, "900"), null);
  assert.equal(cambioDePrecio(b, "900.00"), null);
  assert.equal(cambioDePrecio(b, ""), null);
  assert.equal(cambioDePrecio(b, "abc"), null);
  assert.equal(cambioDePrecio(b, "-5"), null);
  // Un beneficio que no tenía precio (un descuento, real 0) no inventa un cotizado de cero.
  assert.deepEqual(cambioDePrecio({ id: 1, real: 0, cotizado: null }, "50"), { real: 50 });
  // Se escribe en el renglón y se guarda solo al salir.
  const casillero = codigoDe("../src/modules/controlObra/PrecioReal.jsx");
  assert.match(casillero, /onBlur=\{guardar\}/);
  assert.match(casillero, /const r = await guardarBeneficio\(\{ id: beneficio\.id, \.\.\.cambio \}\);/);
  assert.match(casillero, /className="estado-del-precio" role="status"/);
});

// Las mesas: presupuestadas en 1.930, cargadas a mano en 900. En Control llevan 724,50 con IVA.
const DE_LAS_MESAS = { id: 35, obra_rubro_id: 1334, descripcion: "MESAS DE COWORKING", presupuestado: 1930, real: 900, estado: "confirmado", origen: "manual" };
const gasto = (id, conIva) => ({ [id]: { acumulado: conIva } });

test("LO QUE DEFINIÓ: mientras Control no tiene todo, sigue contando lo cargado a mano", () => {
  const { beneficios, ganado } = beneficiosConControl([DE_LAS_MESAS], { rubros: RUBROS, porRubro: gasto(1334, 724.5) });
  const b = beneficios[0];
  // Los números no se tocan: el rubro está a medio gastar y no decide nada.
  assert.equal(b.presupuestado, 1930);
  assert.equal(b.real, 900);
  assert.equal(b._control.manda, null);
  assert.equal(b._control.enControl, 630);
  assert.equal(ganado.total, 0);
  assert.equal(notaDeControl(b), "En Control de obra el rubro lleva $630.00 gastados: sigue contando lo cargado a mano hasta que esté todo.");
  // Sin gasto en Control no hay nada que decir.
  assert.equal(beneficiosConControl([DE_LAS_MESAS], { rubros: RUBROS, porRubro: {} }).beneficios[0]._control, undefined);
  assert.equal(notaDeControl(DE_LAS_MESAS), "");
});

test("LO QUE DEFINIÓ: cuando el rubro terminó en Control, manda Control y lo de mano deja de sumar", () => {
  const terminadas = RUBROS.map(r => (r.id === 1334 ? { ...r, avance_pct: 100 } : r));
  const { beneficios, ganado } = beneficiosConControl([DE_LAS_MESAS], { rubros: terminadas, porRubro: gasto(1334, 724.5) });
  const b = beneficios[0];
  assert.equal(b._control.manda, "todo");
  // Lo cargado a mano ya no cuenta…
  assert.equal(b.presupuestado, 0);
  assert.equal(b.real, 0);
  assert.deepEqual(b._control.original, { presupuestado: 1930, real: 900 });
  // …y cuenta lo que dejó el rubro según sus facturas: 1.930 menos 630.
  assert.equal(ganado.filas.length, 1);
  assert.equal(ganado.total, 1300);
  assert.equal(notaDeControl(b), "Manda Control de obra · 67 terminó: gastó $630.00 de $1930.00, +$1300.00 · lo cargado a mano era +$1030.00 y ya no suma");
  // En el resultado de la obra: una sola vez.
  const res = resultadoDeLaObra({ beneficios: [DE_LAS_MESAS], rubros: terminadas, porRubro: gasto(1334, 724.5) });
  assert.equal(res.conPapel, 0);
  assert.equal(res.segunControl.total, 1300);
  assert.equal(res.neto, 1300);
  // Si además se lo sigue, lo cuenta el seguimiento y no dos veces.
  const seguido = resultadoDeLaObra({ beneficios: [DE_LAS_MESAS], rubros: terminadas, seguidos: [{ id: 1, obra_rubro_id: 1334 }], porRubro: gasto(1334, 724.5) });
  assert.equal(seguido.ganadoEnSeguidos, 1300);
  assert.equal(seguido.segunControl.total, 0);
  assert.equal(seguido.neto, 1300);
  // Pasar dos veces por la regla no le saca dos veces.
  assert.deepEqual(beneficiosConControl(beneficios, { rubros: terminadas, porRubro: gasto(1334, 724.5) }).beneficios[0], b);
});

test("y si el rubro se pasó de su presupuesto, la pérdida es la de Control: el beneficio de mano no la tapa", () => {
  // Las mesas terminaron costando 2.875 con IVA: 2.500 sin IVA contra 1.930.
  const porRubro = gasto(1334, 2875);
  const sinLaRegla = totales([DE_LAS_MESAS]).neto;
  const res = resultadoDeLaObra({ beneficios: [DE_LAS_MESAS], rubros: RUBROS, porRubro });
  assert.equal(sinLaRegla, 1030);
  assert.equal(res.contados[0]._control.manda, "todo");
  assert.equal(res.conPapel, 0);
  assert.equal(res.perdidasTotal, -570);
  // Antes: +1.030 de mano y −570 de Control, +460 en una obra que perdió 570 en ese rubro.
  assert.equal(res.neto, -570);
  assert.equal(decididoPorControl({ estado: "pasado", gastado: 2500 }), true);
  assert.equal(decididoPorControl({ estado: "en_curso", gastado: 100 }), false);
  assert.equal(decididoPorControl({ estado: "terminado", gastado: 0 }), false);
});

test("contra varios rubros, Control saca solo la parte del rubro que ya decidió", () => {
  const gypsum = { id: 90, obra_rubro_id: 1295, rubros: [1295, 1301, 1302], descripcion: "Gypsum completo", presupuestado: SUMA, real: 3500, estado: "confirmado", origen: "manual" };
  // El tumbado se pasó en Control; las dos paredes siguen abiertas.
  const porRubro = { ...gasto(1295, 4600), ...gasto(1301, 115) };
  const { beneficios } = beneficiosConControl([gypsum], { rubros: RUBROS, porRubro });
  const b = beneficios[0];
  assert.equal(b._control.manda, "parte");
  const queda = 1 - grupoDe([1295, 1301, 1302], RUBROS).pesos[1295];
  assert.equal(b.presupuestado, Math.round(SUMA * queda * 100) / 100);
  assert.equal(b.real, Math.round(3500 * queda * 100) / 100);
  assert.match(notaDeControl(b), /^Manda Control de obra en una parte · 28 se pasó: gastó \$4000\.00 de .* cuenta solo la parte de los rubros que siguen abiertos$/);
  // Lo de una orden de cambio no entra en esta regla: es lo cobrado contra su cotización.
  const deOrden = { id: 91, obra_rubro_id: 1295, presupuestado: 500, real: 300, origen: "orden_cambio", orden_cambio_id: 5 };
  assert.equal(beneficiosConControl([deOrden], { rubros: RUBROS, porRubro }).beneficios[0], deOrden);
});

test("lo que ya se apoyaba en un solo rubro sigue andando con varios", () => {
  const gypsum = { id: 90, obra_rubro_id: 1295, rubros: [1295, 1301, 1302], presupuestado: SUMA, real: 3500, estado: "confirmado", origen: "manual", cantidad: null };
  // La marca verde o roja de cada rubro en el control: repartida según lo que pesa cada uno.
  const neto = netoPorRubro([gypsum, DE_LAS_MESAS], RUBROS);
  assert.equal(neto[1334], 1030);
  assert.ok(Math.abs(neto[1295] + neto[1301] + neto[1302] - (SUMA - 3500)) < 0.02);
  assert.ok(neto[1295] > neto[1301] && neto[1301] > neto[1302]);
  // Sin los rubros a mano, entero al primero, que es lo que se hacía.
  assert.equal(netoPorRubro([gypsum])[1295], Math.round((SUMA - 3500) * 100) / 100);
  // Una orden que le quita cantidad al primer rubro no achica un beneficio que va contra tres.
  const ordenes = [{ id: 9, codigo: "OC-03", estado: "aprobada" }];
  const lineasDeOrdenes = { 9: [{ tipo: "quita", obra_rubro_id: 1295, cantidad: 39 }] };
  assert.equal(beneficiosSobreLoQueQueda([{ ...gypsum, cantidad: 200 }], { rubros: RUBROS, ordenes, lineasDeOrdenes })[0]._porOrden, undefined);
  // Y el rubro con un beneficio a mano contra varios tampoco se cuenta dos veces por su costo.
  const fuente = codigoDe("../src/modules/controlObra/resultadoDeLaObra.js");
  assert.match(fuente, /b\?\.origen === "manual" && b\._control\?\.manda !== "todo"\)\s+\.flatMap\(b => rubrosDe\(b\)\)/);
});

test("la pantalla: se eligen varios, se guardan con su lista, y sin la migración 190 se dice", () => {
  const panel = codigoDe("../src/modules/controlObra/PanelBeneficios.jsx");
  // Elegir en el presupuesto suma o saca; el primero se elige y se cierra, para sumar queda abierto.
  assert.match(panel, /const ids = conmutar\(rubrosDe\(a\), rb\.id\);/);
  assert.match(panel, /if \(!yaHabia\) setVerPresupuesto\(false\);/);
  // Se guarda el primero donde siempre y la lista entera.
  assert.match(panel, /obra_id: obra\.id, \.\.\.paraGuardar\(susRubros\),/);
  assert.match(panel, /obra_id: obra\.id, \.\.\.paraGuardar\(rubrosDe\(l\)\),/);
  // Cambiar los rubros vuelve a calcular lo presupuestado.
  assert.match(panel, /rubros: ids, obra_rubro_id: ids\[0\] \? String\(ids\[0\]\) : "", presupuestado: "",/);
  // El precio real se escribe en el renglón, salvo que ya mande Control o lo haya ajustado una orden.
  assert.match(panel, /const seEscribe = !esDeOrden\(b\) && !b\._porOrden && !b\._control\?\.manda;/);
  // Lo que cuenta sale del resultado, con lo de Control ya sacado.
  assert.match(panel, /const contados = res\.contados;/);
  const guardar = codigoDe("../src/modules/controlObra/beneficios.js");
  assert.match(guardar, /if \(vaContraVarios\(campos\)\) return \{ error: SIN_190 \};/);
  assert.match(guardar, /if \(filas\.some\(vaContraVarios\)\) return \{ error: SIN_190, guardados: 0 \};/);
});

test("la migración 190 solo agrega columnas vacías", () => {
  const sql = leer("../supabase/migrations/190_beneficios_contra_varios_rubros.sql");
  const sinComentarios = sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  assert.match(sinComentarios, /alter table public\.obra_beneficios\s+add column if not exists rubros\s+jsonb,\s+add column if not exists cotizado numeric;/);
  assert.match(sinComentarios, /alter table public\.obra_analisis_lineas\s+add column if not exists rubros jsonb;/);
  assert.equal(/\b(drop|delete|update|truncate|insert|create policy|grant)\b/i.test(sinComentarios), false);
});
