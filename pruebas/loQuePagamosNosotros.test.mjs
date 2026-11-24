// Diferencias: lo que se decide «Lo pagamos nosotros», y lo que le pasa a
// Beneficios cuando un análisis se vuelve a abrir.
//
// 24/11/2026. Buscando por dónde una diferencia contra varios rubros apuntaba
// solo al primero, aparecieron dos cosas con las filas del Aeropuerto:
//
//   · La tarjeta decía la cuenta al revés. El tablero cotizado en $115,56 y
//     pagado con el rubro 3, vendido en $1.008: «cuesta $892,44: quedan
//     $115,56 a favor». En Beneficios estaba bien —$1.008 → $115,56—, porque
//     las dos cuentas estaban hechas por separado.
//
//   · Abrir el análisis le sacaba el «Confirmar» a sus beneficios. Las filas
//     se borraban y se escribían de nuevo como previstas cada vez: el
//     descuento de $1.049,41 y los $892,44 del tablero, confirmados, volvieron
//     a previstos por abrir la proforma para leerla.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  loQuePagamosNosotros, deDondeSaleLoNuestro, conciliarEficiencias, eficienciaContraVarios,
} from "../src/modules/controlObra/cuentaBeneficios.js";
import { decisionesPara } from "../src/modules/controlObra/cuentaDiferencias.js";
import { compararContraPresupuesto } from "../src/modules/controlObra/compararProforma.js";
import { loQueNoEstaPresupuestado, partidasParaOrden } from "../src/modules/controlObra/extraParaCobrar.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

// Sus filas del Aeropuerto (obra 13), como están en la base.
const ACOMETIDA = { id: 1270, numero: 3, descripcion: "IMSTALACION DE ACOMETIDA ELECTRICA PROVISIONAL, TABLERO Y LUMINARIAS", unidad: "glb", cantidad: 1, total_base: 1159.2, iva_pct: 15, costo_unitario: null };
const TUMBADO = { id: 1295, numero: 28, descripcion: "TUMBADO GYPSUM PLANO REGULAR", unidad: "m2", cantidad: 125.3, total_base: 3229.17, iva_pct: 15, costo_unitario: null };
const PARED_1 = { id: 1301, numero: 34, descripcion: "PARED UNA CARA DE GYPSUM NORMAL", unidad: "m2", cantidad: 63.82, total_base: 1551.53, iva_pct: 15, costo_unitario: null };
const PARED_2 = { id: 1302, numero: 35, descripcion: "PARED DOBLE CARA DE GYPSUM NORMAL 10CM", unidad: "m2", cantidad: 15, total_base: 647.57, iva_pct: 15, costo_unitario: null };
const RUBROS = [ACOMETIDA, TUMBADO, PARED_1, PARED_2];
const SUMA = 4720.23; // lo que suman acá los tres de gypsum, sin IVA: 2.807,97 + 1.349,16 + 563,10

// La línea 680 del análisis 21: el alquiler del tablero, más barato que el rubro.
const TABLERO = { id: 680, hallazgo: "bajo_precio", decision: "nuestro", obra_rubro_id: 1270, rubros: null,
  descripcion: "Suministro de 1 tablero eléctrico industrial.", unidad: "Mes", cantidad: 1, monto: 892.44,
  cantidad_papel: 1, monto_papel: 115.56 };
const DRYWALL = (papel, dif) => ({ hallazgo: dif > 0 ? "subio_precio" : "bajo_precio", decision: "nuestro",
  obra_rubro_id: 1295, rubros: [1295, 1301, 1302], descripcion: "…que lo que suman",
  texto_papel: "Trabajos en drywall: tumbado y paredes", unidad: "glb", cantidad: 1, monto: Math.abs(dif), monto_papel: papel });

test("SU FILA: el tablero cuesta lo que cobra el papel, $115,56, y quedan $892,44 —no al revés—", () => {
  const fila = loQuePagamosNosotros(TABLERO, RUBROS, { proveedor: "SOLEK C&P S.A.S", titulo: "PROFORMA.pdf" });
  // Lo mismo que ya tenía guardado Beneficios para ese análisis.
  assert.equal(fila.obra_rubro_id, 1270);
  assert.equal(fila.presupuestado, 1008);
  assert.equal(fila.real, 115.56);
  assert.equal(fila.nota, "Se hace con la plata de un rubro ya contratado (rubro 3) · PROFORMA.pdf");
  // Y la tarjeta dice esos mismos números.
  assert.deepEqual(deDondeSaleLoNuestro(TABLERO, RUBROS),
    { varios: false, deDonde: "del rubro 3", vendido: 1008, cuesta: 115.56, queda: 892.44 });
});

test("una diferencia que no es de precio cuesta su monto entero, como siempre", () => {
  // Un trabajo nuevo de $380 que se hace con la plata del rubro 3.
  const nuevo = { hallazgo: "nuevo", decision: "nuestro", obra_rubro_id: 1270, descripcion: "Tablero", unidad: "u", cantidad: 1, monto: 380, monto_papel: 380 };
  assert.deepEqual(deDondeSaleLoNuestro(nuevo, RUBROS),
    { varios: false, deDonde: "del rubro 3", vendido: 1008, cuesta: 380, queda: 628 });
});

test("CONTRA VARIOS RUBROS: se nombran todos, y la cuenta es el total del papel contra lo que suman", () => {
  // A favor: el papel cotiza $4.312 por lo que se vendió en $4.720,23.
  const aFavor = DRYWALL(4312, 4312 - SUMA);
  assert.deepEqual(deDondeSaleLoNuestro(aFavor, RUBROS),
    { varios: true, deDonde: "de los rubros 28, 34 y 35", vendido: SUMA, cuesta: 4312, queda: 408.23 });
  // La fila de Beneficios es la de siempre para un grupo, con sus tres rubros.
  assert.deepEqual(loQuePagamosNosotros(aFavor, RUBROS, null), eficienciaContraVarios(aFavor, RUBROS, null));
  assert.deepEqual(loQuePagamosNosotros(aFavor, RUBROS, null).rubros, [1295, 1301, 1302]);
});

test("si cuesta más de lo que se vendió, queda EN CONTRA: no se dice «quedan a favor» con el signo cambiado", () => {
  const enContra = DRYWALL(6000, 6000 - SUMA);
  const s = deDondeSaleLoNuestro(enContra, RUBROS);
  assert.deepEqual(s, { varios: true, deDonde: "de los rubros 28, 34 y 35", vendido: SUMA, cuesta: 6000, queda: -1279.77 });
  const panel = codigoDe("../src/modules/controlObra/PanelDiferencias.jsx");
  assert.match(panel, /: sale\.queda < 0\s+\? <>Se hace con la plata \{sale\.deDonde\}/);
  assert.match(panel, /más de lo que se vendió, que salen del\s+margen del proyecto y ya están en Beneficios, en contra\./);
});

test("sin rubro, o con un rubro que ya no está, no hay contra qué medir", () => {
  assert.equal(loQuePagamosNosotros({ ...TABLERO, obra_rubro_id: null }, RUBROS), null);
  assert.equal(deDondeSaleLoNuestro({ ...TABLERO, obra_rubro_id: null }, RUBROS), null);
  assert.equal(deDondeSaleLoNuestro({ ...TABLERO, obra_rubro_id: 9999 }, RUBROS), null);
  // Un grupo del que quedó un solo rubro vivo ya no es un grupo.
  assert.equal(deDondeSaleLoNuestro(DRYWALL(4312, -408.23), [TUMBADO]), null);
  // Un rubro sin cantidad no tiene precio contra el que medir.
  assert.equal(deDondeSaleLoNuestro(TABLERO, [{ ...ACOMETIDA, cantidad: 0 }]), null);
});

test("la tarjeta y Beneficios salen de la misma cuenta", () => {
  const panel = codigoDe("../src/modules/controlObra/PanelDiferencias.jsx");
  assert.match(panel, /\.\.\.frescas\.filter\(x => x\.decision === "nuestro" && x\.obra_rubro_id\)\s+\.map\(x => loQuePagamosNosotros\(x, vivos, an\)\)\s+\.filter\(x => x && x\.presupuestado > 0\),/);
  assert.match(panel, /const sale = deDondeSaleLoNuestro\(l, vivos\);/);
  // La frase ya no se arma con el monto de la diferencia.
  assert.doesNotMatch(panel, /y cuesta \$\{fmt\(l\.monto\)\}: quedan/);
  assert.doesNotMatch(panel, /fmt\(puRubro \* Number\(l\.cantidad\) - Number\(l\.monto\)\)/);
  // Contra varios, alcanza con que uno haya venido de una orden de cambio.
  assert.match(panel, /const deOrden = \(deVarios \? grupo\.rubros : rubro \? \[rubro\] : \[\]\)\.some\(r => r\.origen === "orden_cambio"\);/);
});

test("EL PDF: contra varios rubros los nombra a todos, y el precio del contrato va sin IVA", () => {
  const pdf = codigoDe("../src/modules/controlObra/pdfDiferencias.js");
  assert.match(pdf, /const grupo = rubrosDe\(l\)\.length > 1 \? grupoDe\(rubrosDe\(l\), rubros\) : null;/);
  assert.match(pdf, /deVarios \? `\$\{grupo\.rubros\.map\(nombre\)\.join\("\\n"\)\}\\n\(el total del papel contra lo que suman los \$\{grupo\.rubros\.length\}\)`/);
  assert.match(pdf, /deVarios \? `suman \$\$\{plata\(grupo\.presupuestado\)\}`/);
  // El total del rubro lleva el IVA adentro; al lado va el costo de la propuesta, que no lo tiene.
  assert.match(pdf, /const pu = r && n\(r\.cantidad\) \? baseSinIva\(r\) \/ n\(r\.cantidad\) : null;/);
  assert.doesNotMatch(pdf, /n\(r\.total_base\) \/ n\(r\.cantidad\)/);
});

// ── A LA ORDEN DE CAMBIO NO LLEGA ───────────────────────────────────────────
//
// Tenía anotado que una diferencia contra varios rubros que se cobra entraba a
// la orden apuntando solo al primero. No puede pasar: contra varios rubros la
// diferencia es siempre de precio, y a una de precio no se le ofrece «se le
// cobra al cliente». Si eso cambia algún día, la partida de la orden guarda un
// solo rubro y hay que resolverlo antes.
test("una diferencia contra varios rubros es siempre de precio, y una de precio no se cobra", () => {
  const drywall = monto => ({ descripcion: "Trabajos en drywall: tumbado y paredes", cantidad: 239, unidad: "m2", monto, rubro_id: 1295, rubros: [1295, 1301, 1302] });
  for (const monto of [4312, 6000]) {
    const h = loQueNoEstaPresupuestado(compararContraPresupuesto([drywall(monto)], RUBROS));
    const suyas = [...h.todo, ...h.menos].filter(x => x.varios);
    assert.equal(suyas.length, 1);
    assert.ok(["subio_precio", "bajo_precio"].includes(suyas[0].hallazgo));
    assert.ok(!decisionesPara(suyas[0].hallazgo).includes("cobrar"));
  }
  assert.ok(decisionesPara("subio_precio").includes("nuestro"));
  // Y lo que bajó de precio ni siquiera se arma como partida.
  const baja = loQueNoEstaPresupuestado(compararContraPresupuesto([drywall(4312)], RUBROS));
  assert.equal(partidasParaOrden(baja, 20).length, 0);
});

// ── ABRIR UN ANÁLISIS NO LE SACA EL «CONFIRMAR» A SUS BENEFICIOS ────────────
const DESCUENTO = { descripcion: "Descuento especial ofrecido por SOLEK C&P S.A.S", cantidad: 1, unidad: "glb", presupuestado: 1049.41, real: 0, proveedor: "SOLEK C&P S.A.S", obra_rubro_id: null, nota: "Lo ofrece la proforma al pie" };
const DEL_TABLERO = { obra_rubro_id: 1270, descripcion: "Suministro de 1 tablero eléctrico industrial.", cantidad: 1, unidad: "Mes", presupuestado: 1008, real: 115.56, proveedor: "SOLEK C&P S.A.S", nota: "Se hace con la plata de un rubro ya contratado (rubro 3)" };
const guardada = (f, id, mas = {}) => ({ ...f, id, obra_id: 13, origen: "proforma", estado: "confirmado", confirmado_at: "2026-11-06T15:00:00Z", fecha: "2026-11-05", rubros: null, cotizado: null, nota: `${f.nota} · [dif:21]`, ...mas });

test("LO QUE PASÓ: las dos filas confirmadas del análisis 21 salen iguales, así que no se tocan", () => {
  const viejas = [guardada(DESCUENTO, 2943), guardada(DEL_TABLERO, 2944)];
  const r = conciliarEficiencias(viejas, [DESCUENTO, DEL_TABLERO]);
  assert.deepEqual(r.quedan.map(v => v.id), [2943, 2944]);
  assert.deepEqual(r.sobran, []);
  assert.deepEqual(r.nuevas, []);
  // Siguen confirmadas, con su fecha: son las mismas filas.
  assert.ok(r.quedan.every(v => v.estado === "confirmado" && v.confirmado_at && v.fecha === "2026-11-05"));
});

test("cambiar una decisión saca SU fila y deja las demás como están", () => {
  const viejas = [guardada(DESCUENTO, 2943), guardada(DEL_TABLERO, 2944)];
  // El tablero pasa a «ya estaba incluido»: deja de salir del rubro 3.
  const r = conciliarEficiencias(viejas, [DESCUENTO]);
  assert.deepEqual(r.quedan.map(v => v.id), [2943]);
  assert.deepEqual(r.sobran.map(v => v.id), [2944]);
  assert.deepEqual(r.nuevas, []);
  // Si la cuenta cambia —otro presupuestado, otro costo, otro rubro—, es otra fila: la vieja sale y entra la nueva.
  for (const otra of [{ ...DEL_TABLERO, presupuestado: 900 }, { ...DEL_TABLERO, real: 130 }, { ...DEL_TABLERO, obra_rubro_id: 1295 }, { ...DEL_TABLERO, descripcion: "Otro tablero" }]) {
    const c = conciliarEficiencias(viejas, [DESCUENTO, otra]);
    assert.deepEqual(c.sobran.map(v => v.id), [2944]);
    assert.deepEqual(c.nuevas, [otra]);
  }
});

test("el precio real corregido a mano no se pierde: se compara lo que decía la cotización", () => {
  // En Beneficios se anotó que el tablero costó $130; la cotización decía $115,56.
  const corregida = guardada(DEL_TABLERO, 2944, { real: 130, cotizado: 115.56 });
  const r = conciliarEficiencias([corregida], [DEL_TABLERO]);
  assert.deepEqual(r.quedan, [corregida]);
  assert.deepEqual(r.nuevas, []);
});

test("contra varios rubros es la misma fila solo si son los mismos rubros; y dos iguales no se comen una a la otra", () => {
  const delGrupo = { obra_rubro_id: 1295, rubros: [1295, 1301, 1302], descripcion: "Trabajos en drywall", presupuestado: SUMA, real: 4312 };
  const vieja = guardada(delGrupo, 3001, { rubros: [1295, 1301, 1302] });
  assert.deepEqual(conciliarEficiencias([vieja], [delGrupo]).quedan, [vieja]);
  const conUnoMenos = { ...delGrupo, rubros: [1295, 1301] };
  assert.deepEqual(conciliarEficiencias([vieja], [conUnoMenos]), { quedan: [], sobran: [vieja], nuevas: [conUnoMenos] });
  // Dos renglones idénticos del análisis y una sola fila guardada: una queda, la otra entra.
  const dos = conciliarEficiencias([guardada(DEL_TABLERO, 2944)], [DEL_TABLERO, { ...DEL_TABLERO }]);
  assert.equal(dos.quedan.length, 1);
  assert.equal(dos.nuevas.length, 1);
  assert.equal(dos.sobran.length, 0);
});

test("la sincronización ya no borra todo lo del análisis para escribirlo de nuevo", () => {
  const c = codigoDe("../src/modules/controlObra/beneficios.js");
  assert.match(c, /const \{ sobran, nuevas \} = conciliarEficiencias\(viejas \|\| \[\], filas\);/);
  assert.match(c, /\.delete\(\)\.in\("id", sobran\.map\(v => v\.id\)\);/);
  assert.doesNotMatch(c, /\.delete\(\)\.eq\("obra_id", obraId\)\.like\("nota", `%\$\{marca\}%`\);/);
  assert.match(c, /return guardarVarios\(nuevas\.map\(f => \(\{ \.\.\.f, obra_id: obraId, origen: "proforma", estado: "previsto",/);
});
