// LO QUE UNA COMPUTADORA HACE MEJOR QUE UN MODELO, QUE LO HAGA LA COMPUTADORA.
//
// Emparejar cada renglón de una proforma con su rubro del contrato se le estaba
// pidiendo entero a NOVA: ciento setenta rubros, treinta renglones, y elegir de
// memoria. Ahí se equivoca, y el error no se ve —produce números con la misma
// cara que los buenos—.
//
// Pero una buena parte de ese trabajo no necesita criterio ninguno:
//
//   · EN ESTA OBRA EL PRESUPUESTO SE ARMÓ CON UNA COTIZACIÓN VIEJA DEL MISMO
//     PROVEEDOR, así que muchos renglones dicen EXACTAMENTE lo mismo que su
//     rubro. "Tablero Trifasico de 20 espacios -PRINCIPAL" contra "Tablero
//     Trifasico de 20 espacios -PRINCIPAL" no es una decisión: es una
//     comparación de dos textos, y comparar textos es lo que mejor hace una
//     computadora. Ese emparejamiento sale sin preguntarle a nadie y sale
//     siempre igual.
//
//   · LO QUE QUEDA NO SE PREGUNTA CONTRA CIENTO SETENTA RUBROS, sino contra los
//     cinco que podrían ser. Elegir entre cinco candidatos parecidos es un
//     problema mucho más chico que recordar una lista entera, y lo que no entra
//     en ninguno vuelve sin rubro, que es una respuesta.
//
// Queda para el modelo lo único que de verdad pide criterio: decidir si "punto
// para sensor de iluminación" es el mismo trabajo que "punto de iluminación con
// tubería EMT". Y hasta eso lo mira después una persona, renglón por renglón.

import { familiaDe } from "./desconfiarDeNova.js";

const pelado = t => String(t || "").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Las unidades no se contradicen: o son la misma familia, o alguna no se sabe. */
const unidadCompatible = (a, b) => {
  const fa = familiaDe(a);
  const fb = familiaDe(b);
  return !fa || !fb || fa === fb;
};

/**
 * EL EMPAREJAMIENTO QUE NO NECESITA QUE NADIE OPINE.
 *
 * Mismo texto y unidad que no se contradice. No hay margen de error porque no
 * hay nada que interpretar: dos cadenas iguales son dos cadenas iguales, hoy y
 * dentro de un año, con el mismo resultado.
 */
export function emparejarPorTexto(items = [], rubros = []) {
  const porTexto = new Map();
  for (const r of rubros) {
    const k = pelado(r.descripcion);
    if (!k) continue;
    // Un texto que se repite en dos rubros deja de servir para identificar: se
    // marca y no se usa, en vez de elegir el primero y acertar la mitad.
    porTexto.set(k, porTexto.has(k) ? null : r);
  }
  let ciertos = 0;
  const salida = items.map(it => {
    if (it.rubro_id) return it;
    const r = porTexto.get(pelado(it.descripcion));
    if (!r || !unidadCompatible(it.unidad, r.unidad)) return it;
    ciertos += 1;
    return { ...it, rubro_id: r.id, porTexto: true };
  });
  return { items: salida, ciertos };
}

/**
 * LOS POCOS RUBROS QUE PODRÍAN SER ESTE RENGLÓN.
 *
 * Se puntúa por palabras compartidas —las largas pesan, "de" y "con" no— y se
 * descartan los que miden otra cosa. Sirve para preguntarle al modelo entre
 * cinco en vez de entre ciento setenta: el problema se achica y con él la
 * cantidad de formas de equivocarse.
 */
export function candidatosPara(linea, rubros = [], cuantos = 5) {
  const palabras = pelado(linea?.descripcion).split(" ").filter(w => w.length >= 4);
  if (!palabras.length) return [];
  return rubros
    .filter(r => unidadCompatible(linea?.unidad, r.unidad))
    .map(r => {
      const texto = pelado(r.descripcion);
      const puntos = palabras.reduce((t, w) => t + (texto.includes(w) ? w.length : 0), 0);
      return { r, puntos };
    })
    .filter(x => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, cuantos)
    .map(x => x.r);
}

/**
 * El pedido para el modelo: cada renglón con los pocos rubros que podrían ser.
 *
 * Si un renglón no tiene candidatos, no se pregunta: ya se sabe que va sin
 * rubro, y preguntarlo es darle una oportunidad de inventar uno.
 */
export function pedidoDeEmparejamiento(items = [], rubros = [], cuantos = 5) {
  const lineas = [];
  const indices = [];
  items.forEach((it, i) => {
    if (it.rubro_id) return;
    const cands = candidatosPara(it, rubros, cuantos);
    if (!cands.length) return;
    indices.push(i);
    lineas.push(`${indices.length}. ${it.descripcion} (${it.cantidad || ""} ${it.unidad || ""})\n`
      + cands.map(r => `   ${r.id} = ${String(r.descripcion || "").slice(0, 90)} (${r.cantidad} ${r.unidad || ""})`).join("\n"));
  });
  return { texto: lineas.join("\n\n"), indices };
}
