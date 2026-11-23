// Diferencias: un renglón del papel contra varios rubros. Hernán, 18/11/2026:
// «Lo mismo sucede en el módulo diferencias, solo me permite escoger uno y a
// veces la compra de material afecta a más de un rubro». En el cuadro de
// opciones definió cómo se compara: «total contra la suma» —el monto del
// renglón contra la suma de esos rubros—, como diferencia de precio, a favor o
// en contra, sin comparar cantidad.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compararContraPresupuesto } from "../src/modules/controlObra/compararProforma.js";
import { loQueNoEstaPresupuestado, partidasParaOrden, agruparPorRubro } from "../src/modules/controlObra/extraParaCobrar.js";
import { eficienciaContraVarios } from "../src/modules/controlObra/cuentaBeneficios.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

// Los tres rubros de gypsum del Aeropuerto, con el IVA adentro como están en el control.
const TUMBADO = { id: 1295, numero: 28, descripcion: "TUMBADO GYPSUM PLANO REGULAR", unidad: "m2", cantidad: 125.3, total_base: 3229.17, iva_pct: 15, costo_unitario: null };
const PARED_1 = { id: 1301, numero: 34, descripcion: "PARED UNA CARA DE GYPSUM NORMAL", unidad: "m2", cantidad: 63.82, total_base: 1551.53, iva_pct: 15, costo_unitario: null };
const PARED_2 = { id: 1302, numero: 35, descripcion: "PARED DOBLE CARA DE GYPSUM NORMAL 10CM", unidad: "m2", cantidad: 15, total_base: 647.57, iva_pct: 15, costo_unitario: null };
const RUBROS = [TUMBADO, PARED_1, PARED_2];
const sinIva = r => Math.round((r.total_base / 1.15) * 100) / 100;
const SUMA = Math.round((sinIva(TUMBADO) + sinIva(PARED_1) + sinIva(PARED_2)) * 100) / 100;
// El drywall, cotizado en un solo renglón por todo.
const DRYWALL = (monto, rubros = [1295, 1301, 1302]) => ({ descripcion: "Trabajos en drywall: tumbado y paredes", cantidad: 239, unidad: "m2", monto, rubro_id: rubros[0], rubros });
const hallar = items => loQueNoEstaPresupuestado(compararContraPresupuesto(items, RUBROS));

test("LO QUE DEFINIÓ: sale UNA diferencia de precio para el grupo, y ninguna de cantidad", () => {
  const h = hallar([DRYWALL(4312)]);
  assert.equal(h.todo.length, 1);
  assert.equal(h.demas.length, 0);
  assert.equal(h.menos.length, 0);
  assert.equal(h.nuevos.length, 0);
  const d = h.bajaron[0];
  assert.equal(d.hallazgo, "bajo_precio");
  assert.equal(d.varios, true);
  assert.deepEqual(d.rubros, [1295, 1301, 1302]);
  assert.equal(d.rubro_id, 1295);
  assert.equal(d.rubro_codigo, "28+34+35");
  // Lo que queda a favor: lo que suman menos lo que cotiza el papel.
  assert.equal(d.costo, Math.round((SUMA - 4312) * 100) / 100);
  assert.equal(h.eficiencia, d.costo);
  assert.equal(d.cantidad, 1);
  assert.equal(d.unidad, "glb");
  assert.equal(d.montoPapel, 4312);
  assert.equal(d.textoPapel, "Trabajos en drywall: tumbado y paredes");
  assert.match(d.descripcion, /^28 TUMBADO GYPSUM PLANO REGULAR \+ 34 PARED UNA CARA DE GYPSUM NORMAL \+ 35 PARED DOBLE CARA DE GYPSUM NORMAL 10CM — cuesta menos que lo que suman$/);
  assert.match(d.por, /^va contra 3 rubros que el cliente vio en \$\d+(\.\d+)? entre todos, sin IVA, y el papel lo cotiza en \$4312 · se compara el total contra la suma, no la cantidad$/);
  // Atado al tumbado solo —lo único que se podía— daba 113,7 m² «de más» para cobrarle al cliente.
  const solo = hallar([{ ...DRYWALL(4312), rubros: null }]);
  assert.equal(solo.demas.length, 1);
  assert.equal(solo.demas[0].hallazgo, "mas_cantidad");
  assert.equal(solo.demas[0].cantidad, 113.7);
});

test("si cuesta más que lo que suman, es una diferencia en contra; si cuesta lo mismo, ninguna", () => {
  const caro = hallar([DRYWALL(6000)]);
  assert.equal(caro.subieron.length, 1);
  assert.equal(caro.subieron[0].hallazgo, "subio_precio");
  assert.equal(caro.subieron[0].costo, Math.round((6000 - SUMA) * 100) / 100);
  assert.equal(caro.sobreprecio, caro.subieron[0].costo);
  assert.equal(hallar([DRYWALL(SUMA)]).todo.length, 0);
  // Va a la orden de cambio como un aumento, con el nombre de todos sus rubros; lo que bajó, no va.
  const partidas = partidasParaOrden(caro, 20);
  assert.equal(partidas.length, 1);
  assert.equal(partidas[0].tipo, "aumenta");
  assert.equal(partidas[0].rubro_codigo, "28+34+35");
  assert.equal(partidasParaOrden(hallar([DRYWALL(4312)]), 20).length, 0);
});

test("con costo cargado en todos, se mide contra lo que costaban; con uno que no lo tiene, contra el precio", () => {
  const conCosto = RUBROS.map(r => ({ ...r, costo_unitario: 10 }));
  const costaban = Math.round((125.3 + 63.82 + 15) * 10 * 100) / 100;
  const d = loQueNoEstaPresupuestado(compararContraPresupuesto([DRYWALL(2500)], conCosto)).subieron[0];
  assert.equal(d.contraPrecio, false);
  assert.equal(d.costo, Math.round((2500 - costaban) * 100) / 100);
  assert.match(d.por, /^va contra 3 rubros que costaban \$/);
  // Uno sin costo: no se suman los que hay contra el total del papel.
  const mixto = [conCosto[0], conCosto[1], PARED_2];
  const m = loQueNoEstaPresupuestado(compararContraPresupuesto([DRYWALL(4312)], mixto)).bajaron[0];
  assert.equal(m.contraPrecio, true);
  assert.equal(m.costo, Math.round((SUMA - 4312) * 100) / 100);
});

test("el renglón contra varios no se junta con otro que apunta al mismo primer rubro", () => {
  // El drywall contra los tres, y otro renglón que es solo del tumbado.
  const items = [DRYWALL(4312), { descripcion: "Tumbado adicional sala", cantidad: 125.3, unidad: "m2", monto: 2700, rubro_id: 1295 }];
  const lineas = compararContraPresupuesto(items, RUBROS).lineas;
  const agrupadas = agruparPorRubro(lineas);
  assert.equal(agrupadas.length, 2);
  assert.equal(agrupadas.filter(l => l.juntos).length, 0);
  const h = loQueNoEstaPresupuestado({ lineas });
  // Cada uno con su diferencia: la del grupo, y la de precio del tumbado solo.
  assert.equal(h.otroPrecio.length, 2);
  assert.equal(h.otroPrecio.filter(x => x.varios).length, 1);
});

test("lo que queda a favor llega a Beneficios como un solo beneficio, con todos sus rubros", () => {
  const linea = { obra_rubro_id: 1295, rubros: [1295, 1301, 1302], descripcion: "…cuesta menos que lo que suman", texto_papel: "Trabajos en drywall: tumbado y paredes", monto: 407.36, monto_papel: 4312 };
  const b = eficienciaContraVarios(linea, RUBROS, { proveedor: "Kevin Ormaza", titulo: "drywall.pdf" });
  assert.deepEqual(b, {
    obra_rubro_id: 1295, rubros: [1295, 1301, 1302], descripcion: "Trabajos en drywall: tumbado y paredes",
    cantidad: null, unidad: null, presupuestado: SUMA, real: 4312, proveedor: "Kevin Ormaza",
    nota: "Contra la suma de 3 rubros (28, 34, 35) · drywall.pdf",
  });
  // Una línea de un solo rubro, o sin lo que cotiza el papel, no es de acá.
  assert.equal(eficienciaContraVarios({ obra_rubro_id: 1295, monto_papel: 100 }, RUBROS), null);
  assert.equal(eficienciaContraVarios({ obra_rubro_id: 1295, rubros: [1295, 1301] }, RUBROS), null);
  const panel = codigoDe("../src/modules/controlObra/PanelDiferencias.jsx");
  assert.match(panel, /if \(rubrosDe\(x\)\.length > 1\) \{\s+const v = eficienciaContraVarios\(x, vivos, an\);\s+return v && v\.presupuestado - v\.real > 0\.005 \? v : null;/);
  // Y no le carga su costo a ninguno de los rubros: el papel cotiza el grupo.
  assert.match(panel, /if \(rubrosDe\(l\)\.length > 1\) return false;/);
});

test("la pantalla: se le suman rubros al renglón, se guardan con la diferencia, y señalarle uno la deja contra ese solo", () => {
  const panel = codigoDe("../src/modules/controlObra/PanelDiferencias.jsx");
  // «+ sumar otro rubro» agrega; «otro rubro» lo cambia por ese solo; «quitar» los saca todos.
  assert.match(panel, /\? \{ \.\.\.paraGuardar\(\[\.\.\.rubrosDe\(suyo\), rb\.id\], "rubro_id"\), visto: true \}\s+: \{ rubro_id: rb\.id, rubros: null, visto: true \}\);/);
  assert.match(panel, /cambiar\(i, \{ rubro_id: null, rubros: null, visto: false \}\)/);
  // Contra varios no se duda de la unidad ni del precio de un rubro.
  assert.match(panel, /const raro = r && !sonVarios && \(unidadesDistintas\(x, r\)/);
  // La diferencia se guarda con sus rubros.
  assert.match(panel, /obra_rubro_id: x\.rubro_id \|\| null, rubros: x\.rubros \|\| null, hallazgo: x\.hallazgo,/);
  // Y si no se pudo comparar o guardar, ahora se dice en esa pantalla.
  assert.match(panel, /className="no-se-pudo-comparar" role="alert"/);
  const guardar = codigoDe("../src/modules/controlObra/analisisDeDiferencias.js");
  assert.match(guardar, /\.\.\.\(Array\.isArray\(l\.rubros\) && l\.rubros\.length > 1 \? \{ rubros: l\.rubros \} : \{\}\),/);
  // Sin la 190 no queda un análisis sin sus diferencias.
  assert.match(guardar, /await supabase\.from\("obra_analisis"\)\.delete\(\)\.eq\("id", data\.id\);\s+if \(ruta\) await supabase\.storage\.from\(BUCKET\)\.remove\(\[ruta\]\);\s+return \{ error: "Para guardar una diferencia contra varios rubros falta correr la migración 190 en Supabase\." \};/);
  assert.match(guardar, /update\(\{ \.\.\.campos, rubros: null \}\)\.eq\("id", lineaId\)/);
});
