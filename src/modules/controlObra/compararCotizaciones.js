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
      // MÁS BARATO Y ADEMÁS MENOS CANTIDAD: ese es el que engaña.
      //
      // Un unitario más bajo se lee como mejor oferta, y si encima cotiza
      // menos metros el renglón sale muy por debajo del otro. Pero los metros
      // que faltan hay que hacerlos igual: se compran después, a un precio que
      // ya no se negocia, o aparecen como adicional. Es la forma más común de
      // que una cotización barata termine cara, y no se ve mirando totales.
      engana: uA != null && uB != null && f.a && f.b
        ? (uA < uB && n(f.a.cantidad) < n(f.b.cantidad) ? "a"
          : uB < uA && n(f.b.cantidad) < n(f.a.cantidad) ? "b" : null)
        : null,
      solo: f.a && f.b ? null : (f.a ? "a" : "b"),
      parecido: f.parecido,
    };
  });

  const ganaA = filas.filter(f => f.difUnitario != null && f.difUnitario < 0);
  const ganaB = filas.filter(f => f.difUnitario != null && f.difUnitario > 0);
  const soloA = filas.filter(f => f.solo === "a");
  const soloB = filas.filter(f => f.solo === "b");

  // LOS TRES NÚMEROS QUE SE COMPARAN TIENEN QUE SER DEL MISMO ALCANCE.
  //
  // Comparar el total de un papel contra el del otro es comparar dos alcances
  // distintos: si uno cotiza 28 renglones y el otro 32, el de 28 va a salir más
  // barato siempre y eso no dice nada de sus precios. Peor todavía, "lo mejor
  // de cada uno" sumaba también lo que cotiza uno solo, así que daba MÁS que
  // cualquiera de los dos totales —$14.058 contra $3.875 y $11.856— y quedaba
  // como un número que no se entiende.
  //
  // Lo que se compara es LO QUE COTIZAN LOS DOS: ahí los precios son
  // comparables y la diferencia es de precio y no de alcance. Lo que cotiza uno
  // solo se cuenta aparte, que es como hay que mirarlo.
  const comunes = filas.filter(f => !f.solo);
  const comunA = c2(comunes.reduce((t, f) => t + n(f.montoA), 0));
  const comunB = c2(comunes.reduce((t, f) => t + n(f.montoB), 0));

  // Comprándole a cada uno lo que tiene más barato, sobre ese mismo alcance
  // común: es la vara contra la que se negocia —"el otro me lo deja en tanto"—
  // y por eso tiene que poder compararse con los otros dos.
  const loMejor = c2(comunes.reduce((t, f) => {
    if (f.unitarioA != null && f.unitarioB != null) {
      const cant = Math.min(n(f.cantidadA), n(f.cantidadB));
      return t + Math.min(f.unitarioA, f.unitarioB) * cant;
    }
    return t + Math.max(n(f.montoA), n(f.montoB));
  }, 0));

  const totalA = c2(itemsA.reduce((t, x) => t + n(x.monto), 0) - n(a.descuento));
  const totalB = c2(itemsB.reduce((t, x) => t + n(x.monto), 0) - n(b.descuento));

  return {
    filas: filas.sort((x, y) => Math.abs(n(y.aFavorDeB)) - Math.abs(n(x.aFavorDeB))),
    // Lo comparable: el mismo alcance en los dos.
    comunA, comunB, difComun: c2(comunA - comunB),
    // Los renglones donde uno es más barato porque además cotiza menos.
    cuantosEnganan: filas.filter(f => f.engana).length,
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
  const plata = v => `$${Math.abs(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const partes = [];

  // PRIMERO LO COMPARABLE: el mismo alcance en los dos. Empezar por los totales
  // es empezar por el número que miente cuando los alcances no coinciden.
  if (!c.emparejados) {
    partes.push("Estas dos cotizaciones no tienen ningún renglón en común: no hay nada que comparar");
  } else if (Math.abs(c.difComun) < 0.01) {
    partes.push(`En los ${c.emparejados} renglones que cotizan los dos, los precios son los mismos`);
  } else {
    const barato = c.difComun > 0 ? c.proveedorB : c.proveedorA;
    partes.push(`En los ${c.emparejados} renglones que cotizan los dos, ${barato} sale `
      + `${plata(c.difComun)} menos`);
  }

  // Y DESPUÉS EL ALCANCE, que es otra conversación: lo que uno cotiza y el otro
  // no va a aparecer igual en la obra, cotizado o no.
  const sueltos = [];
  if (c.soloB.length) sueltos.push(`${c.proveedorB} cotiza ${c.soloB.length} que ${c.proveedorA} no, por ${plata(c.montoSoloB)}`);
  if (c.soloA.length) sueltos.push(`${c.proveedorA} cotiza ${c.soloA.length} que ${c.proveedorB} no, por ${plata(c.montoSoloA)}`);
  if (sueltos.length) partes.push(sueltos.join(" y "));

  return `${partes.join(". ")}.`;
}
