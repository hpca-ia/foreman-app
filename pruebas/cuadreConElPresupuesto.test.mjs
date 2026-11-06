import { test } from "node:test";
import assert from "node:assert/strict";
import { cuadreConElPresupuesto, comoSeDice, esDelPresupuesto }
  from "../src/modules/controlObra/cuadreConElPresupuesto.js";

// ── EL CONTROL TIENE QUE DECIR LO MISMO QUE EL PRESUPUESTO ─────────────────
//
// Diners Aéreo: presupuesto $189.340,00, control $191.921,91. El rubro de
// honorarios del contrato tenía el IVA dos veces y nada lo decía. Es plata, y
// la línea base contra la que se mide todo: no puede depender de que alguien
// la sume a mano.

const IVA = 15;
const conIva = v => Math.round(v * (1 + IVA / 100) * 100) / 100;
const item = (id, total, descripcion = `Renglón ${id}`, capitulo = "OBRA CIVIL") => ({ id, total, descripcion, capitulo });
const rubro = (id, it, extra = {}) => ({
  id, numero: id, descripcion: it.descripcion, capitulo: it.capitulo, cantidad: 1, precio_unitario: it.total,
  iva_pct: IVA, total_base: conIva(it.total), origen: "base", presupuesto_item_id: it.id, ...extra,
});

// El caso real, con los números reales: 149.675,89 de obra y su 10 %.
const items = [item(1, 100000), item(2, 49675.89), item(3, 14967.59, "Honorarios de administración (10 %)", "HONORARIOS")];
const presupuesto = { subtotal: 164643.48, iva_pct: IVA, total: 189340.00, honorarios_monto: 0 };
// 115.000,00 + 57.127,27 + 17.212,73 = 189.340,00
const bien = [rubro(11, items[0]), rubro(12, items[1]), rubro(13, items[2], { numero: 9191 })];

test("cuando el control es la copia del presupuesto, cuadra y no dice nada", () => {
  const c = cuadreConElPresupuesto({ rubros: bien, presupuesto, items });
  assert.equal(c.hay, true);
  assert.equal(c.cuadra, true);
  assert.equal(c.papel, 189340);
  assert.equal(c.control, 189340);
  assert.equal(c.diferencia, 0);
  assert.deepEqual(c.distintos, []);
  assert.equal(comoSeDice(c), null);
});

test("el IVA dos veces en el rubro de honorarios: lo encuentra, lo nombra y dice cuánto", () => {
  // Lo que pasó: 17.212,73 ya tenía el IVA y se le sumó otro 15 %.
  const mal = bien.map(r => (r.id === 13 ? { ...r, precio_unitario: 17212.7285, total_base: 19794.64 } : r));
  const c = cuadreConElPresupuesto({ rubros: mal, presupuesto, items });
  assert.equal(c.cuadra, false);
  assert.equal(c.papel, 189340);
  assert.equal(c.control, 191921.91);
  assert.equal(c.diferencia, 2581.91);
  assert.equal(c.distintos.length, 1);
  assert.deepEqual(
    { id: c.distintos[0].id, tiene: c.distintos[0].tiene, esperado: c.distintos[0].esperado, diferencia: c.distintos[0].diferencia },
    { id: 13, tiene: 19794.64, esperado: 17212.73, diferencia: 2581.91 });
  // El rubro nombrado explica la diferencia entera: no hay que buscar más.
  assert.equal(c.explicado, c.diferencia);
  const d = comoSeDice(c);
  assert.match(d.titulo, /\$189\.340,00/);
  assert.match(d.titulo, /\$191\.921,91/);
  assert.match(d.titulo, /\$2\.581,91 de más/);
  assert.match(d.lineas[0], /Honorarios de administración/);
  assert.match(d.lineas[0], /\$19\.794,64/);
  assert.match(d.lineas[0], /\$17\.212,73/);
});

test("un rubro cargado sin IVA deja el control corto, y también se dice", () => {
  const mal = bien.map(r => (r.id === 13 ? { ...r, total_base: 14967.59 } : r));
  const c = cuadreConElPresupuesto({ rubros: mal, presupuesto, items });
  assert.equal(c.cuadra, false);
  assert.equal(c.diferencia, -2245.14);
  assert.match(comoSeDice(c).titulo, /de menos en el control/);
});

test("los centavos que se reparten al activar no son un error del rubro", () => {
  // 164 redondeos no dan el redondeo de la suma: al activar, lo que sobra va
  // al rubro más grande. Ese rubro se separa tres centavos de su renglón.
  const its = [item(1, 17875), item(2, 207.9), item(3, 207.9)];
  const p = { subtotal: 18290.8, iva_pct: IVA, total: 21034.42 };
  const rs = [rubro(1, its[0], { total_base: 20556.28 }), rubro(2, its[1], { total_base: 239.07 }), rubro(3, its[2], { total_base: 239.07 })];
  const c = cuadreConElPresupuesto({ rubros: rs, presupuesto: p, items: its });
  assert.equal(c.control, 21034.42);
  assert.equal(c.cuadra, true);
  assert.deepEqual(c.distintos, []);
});

test("lo que metieron las órdenes y lo agregado en el control no es el presupuesto", () => {
  assert.equal(esDelPresupuesto({ origen: "base" }), true);
  assert.equal(esDelPresupuesto({}), true);
  assert.equal(esDelPresupuesto({ origen: "orden_cambio" }), false);
  assert.equal(esDelPresupuesto({ origen: "control" }), false);
  const mas = [...bien,
    { id: 90, descripcion: "Picado · OC-01", total_base: 5000, iva_pct: IVA, origen: "orden_cambio", orden_cambio_id: 1 },
    { id: 91, descripcion: "Algo del control", total_base: 300, iva_pct: 0, origen: "control" }];
  const c = cuadreConElPresupuesto({ rubros: mas, presupuesto, items });
  assert.equal(c.control, 189340);
  assert.equal(c.cuadra, true);
});

test("un rubro oculto sigue siendo del contrato: esconderlo no lo saca del papel", () => {
  const ocultos = bien.map(r => (r.id === 12 ? { ...r, oculto: true } : r));
  assert.equal(cuadreConElPresupuesto({ rubros: ocultos, presupuesto, items }).cuadra, true);
});

test("un renglón del presupuesto que nunca bajó al control se nombra", () => {
  const its = [...items, item(4, 1000, "Mampara nueva", "CARPINTERÍA")];
  const p = { subtotal: 165643.48, iva_pct: IVA, total: 190490.00 };
  const c = cuadreConElPresupuesto({ rubros: bien, presupuesto: p, items: its });
  assert.equal(c.cuadra, false);
  assert.equal(c.diferencia, -1150);
  assert.deepEqual(c.sinRubro.map(x => x.descripcion), ["Mampara nueva"]);
  assert.match(comoSeDice(c).lineas.join(" "), /Mampara nueva \(CARPINTERÍA\).*no bajó al control/);
});

test("los honorarios que quedaron al pie del presupuesto no bajan solos, y lo dice", () => {
  // El caso de antes de la 143: el contrato entró por 172.127,27 y el
  // presupuesto, con su 10 % al pie, eran 189.340,00.
  const sinHonorarios = bien.slice(0, 2);
  const p = { subtotal: 149675.89, iva_pct: IVA, total: 189340.00, honorarios_monto: 14967.59 };
  const c = cuadreConElPresupuesto({ rubros: sinHonorarios, presupuesto: p, items: items.slice(0, 2) });
  assert.equal(c.cuadra, false);
  assert.equal(c.diferencia, -17212.73);
  assert.match(comoSeDice(c).lineas.join(" "), /honorarios al pie/);
});

test("un presupuesto que ya traía el IVA en sus precios se compara contra lo que suman sus renglones", () => {
  const its = [item(1, 1150), item(2, 575)];
  const p = { subtotal: 1725, iva_pct: IVA, total: 1983.75 };
  const rs = its.map((it, i) => rubro(i + 1, it, { iva_pct: 0, total_base: it.total }));
  const c = cuadreConElPresupuesto({ rubros: rs, presupuesto: p, items: its });
  assert.equal(c.papel, 1725);
  assert.equal(c.cuadra, true);
});

test("una obra importada suelta, sin renglones de origen, igual compara el total", () => {
  const sueltos = bien.map(({ presupuesto_item_id, ...r }) => r);
  const c = cuadreConElPresupuesto({ rubros: sueltos, presupuesto, items: [] });
  assert.equal(c.cuadra, true);
  assert.deepEqual(c.sinRubro, []);
  const mal = sueltos.map(r => (r.id === 13 ? { ...r, total_base: 19794.64 } : r));
  const c2 = cuadreConElPresupuesto({ rubros: mal, presupuesto, items: [] });
  assert.equal(c2.cuadra, false);
  assert.equal(c2.diferencia, 2581.91);
  // No puede nombrar al rubro, y lo dice en vez de callarse.
  assert.match(comoSeDice(c2).lineas[0], /Ningún rubro se separa de su renglón/);
});

test("sin presupuesto o sin rubros no hay contra qué comparar, y no inventa un error", () => {
  assert.equal(cuadreConElPresupuesto({ rubros: bien, presupuesto: null }).hay, false);
  assert.equal(cuadreConElPresupuesto({ rubros: [], presupuesto }).cuadra, true);
  assert.equal(comoSeDice(cuadreConElPresupuesto({})), null);
});
