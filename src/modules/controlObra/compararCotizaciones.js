// DOS COTIZACIONES, UNA AL LADO DE LA OTRA.
//
// Antes de contratar hay que elegir, y elegir por el total es casi siempre
// elegir mal: el que da el número más bajo suele ser el que dejó tres renglones
// afuera. Lo que decide una contratación es renglón por renglón —quién es más
// barato en qué, qué incluye uno que el otro no, y cuánto de la diferencia es
// alcance y cuánto es precio.
//
// Esa comparación se hace hoy en un Excel, a mano, cruzando descripciones que
// nunca se escriben igual. Es media jornada y se hace mal: se comparan los
// totales, se firma el más barato, y los tres renglones que faltaban aparecen
// en obra como adicionales.
//
// Y SIRVE TAMBIÉN PARA UN MISMO PROVEEDOR. La proforma de enero contra la de
// marzo del mismo papel dice qué subió y cuánto, que es con lo que se discute
// un reajuste.
//
// Lo que no hace esto es elegir: dice en qué se diferencian. Elegir mira cosas
// que no están en el papel —quién cumple, quién tiene el material, quién
// factura— y eso lo sabe el que contrata.

import { familiaDe } from "./desconfiarDeNova.js";

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

const pelado = t => String(t || "").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const unidadCompatible = (a, b) => {
  const fa = familiaDe(a);
  const fb = familiaDe(b);
  return !fa || !fb || fa === fb;
};

/** Cuánto se parecen dos renglones, de 0 a 1. */
function parecido(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // LOS ESPACIOS NO DICEN NADA EN UN CÓDIGO. "Breaker 1P-16A" y "Breaker 1P-16
  // A" son el mismo breaker, y la comparación por palabras no los junta porque
  // de las dos solo "breaker" tiene largo suficiente para contar. Sin los
  // espacios son idénticos, que es lo que cualquiera ve al leerlos.
  if (a.replace(/ /g, "") === b.replace(/ /g, "")) return 1;
  if (a.startsWith(b) || b.startsWith(a)) return 0.95;
  const largas = t => new Set(t.split(" ").filter(w => w.length >= 5));
  const A = largas(a);
  const B = largas(b);
  const chico = A.size <= B.size ? A : B;
  const otro = A === chico ? B : A;
  if (chico.size < 2) return 0;
  let juntas = 0;
  for (const w of chico) if (otro.has(w)) juntas += 1;
  return juntas / chico.size;
}

/**
 * Cruza los renglones de las dos cotizaciones.
 *
 * Cada renglón de A busca su par en B, y el que no lo encuentra queda como
 * "solo en A" —que es la información más valiosa de toda la comparación: es lo
 * que el otro no está cotizando y va a aparecer después como adicional—.
 *
 * @param a, b  { proveedor, items: [{descripcion, cantidad, unidad, monto}] }
 * @param piso  cuánto tienen que parecerse dos renglones para ser el mismo
 */
export function compararCotizaciones(a = {}, b = {}, piso = 0.7) {
  const itemsA = a.items || [];
  const itemsB = b.items || [];
  const usados = new Set();

  const pares = itemsA.map(x => {
    const texto = pelado(x.descripcion);
    let mejor = null;
    let mejorP = 0;
    itemsB.forEach((y, j) => {
      if (usados.has(j)) return;
      if (!unidadCompatible(x.unidad, y.unidad)) return;
      const p = parecido(texto, pelado(y.descripcion));
      if (p > mejorP) { mejorP = p; mejor = { y, j }; }
    });
    if (!mejor || mejorP < piso) return { a: x, b: null, parecido: 0 };
    usados.add(mejor.j);
    return { a: x, b: mejor.y, parecido: Math.round(mejorP * 100) / 100 };
  });

  const soloEnB = itemsB.filter((_, j) => !usados.has(j)).map(y => ({ a: null, b: y, parecido: 0 }));
  const todos = [...pares, ...soloEnB];

  // UNITARIO CONTRA UNITARIO, no total contra total: si uno cotiza 100 metros y
  // el otro 120, los totales no se pueden comparar y el barato parece caro.
  const filas = todos.map(f => {
    const uA = f.a && n(f.a.cantidad) ? c2(n(f.a.monto) / n(f.a.cantidad)) : null;
    const uB = f.b && n(f.b.cantidad) ? c2(n(f.b.monto) / n(f.b.cantidad)) : null;
    const difUnitario = uA != null && uB != null ? c2(uA - uB) : null;
    // La diferencia en plata se mide sobre la cantidad que los dos cotizan:
    // es lo único comparable cuando las cantidades no coinciden.
    const comun = f.a && f.b ? Math.min(n(f.a.cantidad), n(f.b.cantidad)) : null;
    return {
      descripcion: (f.a || f.b).descripcion,
      unidad: (f.a || f.b).unidad || "",
      cantidadA: f.a ? n(f.a.cantidad) : null,
      cantidadB: f.b ? n(f.b.cantidad) : null,
      montoA: f.a ? c2(f.a.monto) : null,
      montoB: f.b ? c2(f.b.monto) : null,
      unitarioA: uA, unitarioB: uB,
      difUnitario,
      // Positivo: B es más barato en este renglón.
      aFavorDeB: difUnitario != null && comun ? c2(difUnitario * comun) : null,
      distintaCantidad: f.a && f.b && n(f.a.cantidad) !== n(f.b.cantidad),
      solo: f.a && f.b ? null : (f.a ? "a" : "b"),
      parecido: f.parecido,
    };
  });

  const ganaA = filas.filter(f => f.difUnitario != null && f.difUnitario < 0);
  const ganaB = filas.filter(f => f.difUnitario != null && f.difUnitario > 0);
  const soloA = filas.filter(f => f.solo === "a");
  const soloB = filas.filter(f => f.solo === "b");

  // LO MEJOR DE CADA UNO: cuánto sale si se le compra a cada uno lo que tiene
  // más barato. Rara vez se puede contratar así —hay un costo en partir un
  // trabajo entre dos— pero es la vara contra la que se negocia: "el otro me
  // lo deja en tanto" es una frase que vale plata y necesita el número.
  const loMejor = c2(filas.reduce((t, f) => {
    if (f.unitarioA != null && f.unitarioB != null) {
      const cant = Math.max(n(f.cantidadA), n(f.cantidadB));
      return t + Math.min(f.unitarioA, f.unitarioB) * cant;
    }
    return t + n(f.montoA) + n(f.montoB);
  }, 0));

  const totalA = c2(itemsA.reduce((t, x) => t + n(x.monto), 0) - n(a.descuento));
  const totalB = c2(itemsB.reduce((t, x) => t + n(x.monto), 0) - n(b.descuento));

  return {
    filas: filas.sort((x, y) => Math.abs(n(y.aFavorDeB)) - Math.abs(n(x.aFavorDeB))),
    proveedorA: a.proveedor || "A", proveedorB: b.proveedor || "B",
    totalA, totalB,
    descuentoA: c2(a.descuento), descuentoB: c2(b.descuento),
    // El total no decide: uno puede ser más barato por no cotizar tres cosas.
    diferencia: c2(totalA - totalB),
    cuantosGanaA: ganaA.length, cuantosGanaB: ganaB.length,
    soloA, soloB,
    montoSoloA: c2(soloA.reduce((t, f) => t + n(f.montoA), 0)),
    montoSoloB: c2(soloB.reduce((t, f) => t + n(f.montoB), 0)),
    loMejor,
    emparejados: filas.filter(f => !f.solo).length,
  };
}

/** El titular honesto de la comparación. */
export function comoSeDice(c) {
  if (!c) return null;
  const barato = c.diferencia > 0 ? c.proveedorB : c.proveedorA;
  const cuanto = Math.abs(c.diferencia);
  const partes = [`${barato} es $${cuanto.toFixed(2)} más barato en total`];
  // Y LO QUE EL TOTAL NO DICE: el más barato puede serlo por no cotizar algo.
  if (c.soloA.length || c.soloB.length) {
    const falta = c.diferencia > 0 ? c.soloA : c.soloB;
    const quien = c.diferencia > 0 ? c.proveedorB : c.proveedorA;
    if (falta.length) {
      const monto = c.diferencia > 0 ? c.montoSoloA : c.montoSoloB;
      partes.push(`pero ${quien} no cotiza ${falta.length} ${falta.length === 1 ? "renglón" : "renglones"} `
        + `que el otro sí, por $${monto.toFixed(2)}`);
    }
  }
  return partes.join(", ");
}
