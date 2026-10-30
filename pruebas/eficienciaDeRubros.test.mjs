import test from "node:test";
import assert from "node:assert/strict";
import { eficienciaDeRubros, porQueNoSabe } from "../src/modules/controlObra/eficienciaDeRubros.js";

// Un rubro terminado que costó menos de lo presupuestado, uno que se pasó, uno
// a medio comprar y uno sin costo cargado: los cuatro casos que la obra tiene
// todos los días.
const rubros = [
  { id: 1, numero: "1.1", descripcion: "Mampostería", unidad: "m2", cantidad: 100, costo_unitario: 10, total_base: 1500, avance_pct: 100 },
  { id: 2, numero: "1.2", descripcion: "Pintura", unidad: "m2", cantidad: 50, costo_unitario: 8, total_base: 600, avance_pct: 100 },
  { id: 3, numero: "1.3", descripcion: "Cielo raso", unidad: "m2", cantidad: 80, costo_unitario: 20, total_base: 2400, avance_pct: 30 },
  { id: 4, numero: "1.4", descripcion: "Vinil", unidad: "u", cantidad: 10, total_base: 900, avance_pct: 100 },
];
const porRubro = {
  1: { acumulado: 850 },     // presupuestado 1.000 → ahorró 150, y está terminado
  2: { acumulado: 520 },     // presupuestado 400 → se pasó 120
  3: { acumulado: 400 },     // presupuestado 1.600 → parece a favor, pero va al 30%
  4: { acumulado: 700 },     // sin costo cargado: no se sabe
};

test("el ahorro del rubro terminado se cuenta; el del rubro a medio comprar no", () => {
  // Un rubro al 30% que gastó menos no ahorró nada todavía: lo que falta
  // comprar puede comérselo entero. Contarlo es lo que hace que una obra
  // parezca rentable hasta el último mes.
  const r = eficienciaDeRubros({ rubros, porRubro });
  assert.equal(r.ahorro, 150);
  assert.equal(r.cuantosAhorro, 1);
  assert.equal(r.enCurso, 1200);
  assert.equal(r.cuantosEnCurso, 1);
});

test("el sobreprecio ya pasó, así que cuenta aunque el rubro no esté cerrado", () => {
  const r = eficienciaDeRubros({ rubros, porRubro });
  assert.equal(r.sobreprecio, 120);
  assert.equal(r.neto, 30);
});

test("el rubro sin costo cargado no vale cero: vale no sé", () => {
  const r = eficienciaDeRubros({ rubros, porRubro });
  assert.equal(r.sinCosto, 1);
  assert.equal(r.sinCostoConGasto, 1);
  assert.equal(r.cuantos, 3);
  assert.equal(r.completo, false);
  assert.match(porQueNoSabe(r), /1 de los 4 rubros no tienen costo/);
});

test("sin ningún costo cargado lo dice en vez de contestar que no hay ahorros", () => {
  // "No hay eficiencias" y "no tengo con qué buscarlas" se ven igual en una
  // pantalla vacía, y son lo contrario.
  const r = eficienciaDeRubros({ rubros: rubros.map(({ costo_unitario, ...x }) => x), porRubro });
  assert.equal(r.cuantos, 0);
  assert.equal(r.sinCosto, 4);
  // Y lo que deja se sigue diciendo: lo que no se sabe es qué parte de eso se
  // ganó comprando mejor, no cuánto dejó. Los tres terminados, 650 + 80 + 200.
  assert.equal(r.aFavorHecho, 930);
  assert.match(porQueNoSabe(r), /se lee como el margen con el que se vendió/);
});

test("la cantidad vigente manda: el rubro tachado por una orden de cambio no cuenta", () => {
  // Cuando una orden regulariza una cantidad, el rubro viejo queda tachado y el
  // nuevo trae la cantidad buena. Entonces esto se acomoda con aprobar la orden,
  // sin rehacer ningún análisis.
  const conOrden = [
    { ...rubros[0], anulado_por_oc: true },
    { id: 9, numero: "1.1b", descripcion: "Mampostería (OC-01)", cantidad: 120, costo_unitario: 10, total_base: 1800, avance_pct: 100 },
  ];
  const r = eficienciaDeRubros({ rubros: conOrden, porRubro: { 1: { acumulado: 850 }, 9: { acumulado: 1100 } } });
  assert.equal(r.cuantos, 1);
  assert.equal(r.filas[0].presupuestado, 1200);
  assert.equal(r.ahorro, 100);
});

test("un rubro con costo y sin un peso gastado no es ni ahorro ni sobreprecio", () => {
  const r = eficienciaDeRubros({ rubros: [rubros[0]], porRubro: {} });
  assert.equal(r.filas[0].estado, "sin_empezar");
  assert.equal(r.ahorro, 0);
  assert.equal(r.neto, 0);
});

test("el margen vendido va aparte: se decidio al firmar, no lo gano la obra", () => {
  // Sumarlo con la eficiencia deja a una obra que compra mal pareciendo sana
  // porque vendio bien. Va como vara, no como beneficio.
  const r = eficienciaDeRubros({ rubros, porRubro });
  assert.equal(r.vendido, 4500);          // 1.500 + 600 + 2.400, sin el que no tiene costo
  assert.equal(r.costoVendido, 3000);     // 1.000 + 400 + 1.600
  assert.equal(r.margenVendido, 1500);
  // Y no se mezcla con lo que la obra ahorro.
  assert.equal(r.neto, 30);
});

test("el rubro sin costo tambien deja plata, y se cuenta", () => {
  // Que no se sepa lo que iba a costar no borra lo que dejo: se vendio en 900,
  // se gasto 700, y esos 200 son del proyecto. Dejarlo afuera era dejar casi
  // toda la obra afuera y mostrar vacio un panel de una obra que daba plata.
  const r = eficienciaDeRubros({ rubros, porRubro });
  const vinil = r.filas.find(f => f.descripcion === "Vinil");
  assert.equal(vinil.aFavor, 200);
  assert.equal(vinil.presupuestado, null);
  assert.equal(vinil.sinCosto, true);
  // Y no se cuela en la eficiencia, que es contra el costo.
  assert.equal(r.cuantosAhorro, 1);
  assert.equal(r.ahorro, 150);
});

test("lo que deja la obra: terminado aparte de lo que todavia puede gastar mas", () => {
  const r = eficienciaDeRubros({ rubros, porRubro });
  // Terminados: mamposteria 1.500-850 = 650, vinil 900-700 = 200.
  assert.equal(r.aFavorHecho, 850);
  // Pintura se paso: 600-520 = 80 a favor... no, deja 80, pero su costo se
  // paso, asi que es sobreprecio y su plata va aparte.
  assert.equal(r.enContra, 80);
  // Cielo raso al 30%: 2.400-400, todavia puede gastar mas.
  assert.equal(r.aFavorEnCurso, 2000);
});

test("el costo se lleva a la base del gasto: la factura trae el IVA adentro", () => {
  // Lo asignado a un rubro sale de las facturas y lleva IVA; el costo del
  // presupuesto esta sin IVA. Restarlos de frente inventa un sobreprecio del
  // 15% en un rubro que se compro exactamente a lo presupuestado.
  const r = eficienciaDeRubros({
    rubros: [{ id: 7, descripcion: "Luminarias", cantidad: 10, costo_unitario: 100,
      iva_pct: 15, total_base: 1495, avance_pct: 100 }],
    porRubro: { 7: { acumulado: 1150 } },
  });
  assert.equal(r.filas[0].presupuestado, 1150);
  assert.equal(r.filas[0].dif, 0);
  assert.equal(r.sobreprecio, 0);
  // Y lo que deja sigue siendo el IVA que se le cobra al cliente de mas, que
  // no es nuestro: por eso la eficiencia se mide contra el costo y no contra
  // lo que deja.
  assert.equal(r.ahorro, 0);
});
