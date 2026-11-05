// QUÉ CLASE DE CAMBIO ES CADA PARTIDA DE UNA ORDEN.
//
// Una orden de cambio decía dos cosas: ADICIONES y REDUCCIONES. Pero adentro de
// las adiciones viajan dos conversaciones distintas con el cliente, y mezcladas
// no se puede tener ninguna:
//
//   · TRABAJO NUEVO: no estaba cotizado. Es una especificación o un pedido
//     nuevo suyo, y lo que se discute es si lo pidió y cuánto vale.
//   · AUMENTO DE CANTIDAD: el rubro ya está en el contrato y su precio ya lo
//     firmó. Lo único que se discute es la medida.
//
// Y la tercera, que ya venía aparte: la REDUCCIÓN, un rubro del contrato con
// menos cantidad de la contratada.
//
// La clase la pone quien arma la orden —Diferencias la sabe de entrada, porque
// es justo lo que encontró— y queda guardada en la partida. Donde no está
// guardada se deduce de lo único seguro: una reducción es una reducción, y una
// adición que apunta a un rubro del contrato es más de ese rubro.

import { baseSinIva } from "./contratoDeLaObra.js";

export const CLASES = {
  nuevo: {
    titulo: "TRABAJOS NUEVOS",
    pista: "No estaban cotizados: especificación o pedido nuevo del cliente",
    corto: "Trabajo nuevo",
  },
  mas: {
    titulo: "AUMENTO DE CANTIDAD",
    pista: "Rubros del contrato con más cantidad de la contratada",
    corto: "Más cantidad",
  },
  menos: {
    titulo: "REDUCCIÓN DE CANTIDAD",
    pista: "Rubros del contrato con menos cantidad de la contratada",
    corto: "Menos cantidad",
  },
};

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;
const c4 = v => Math.round(n(v) * 10000) / 10000;
const apuntaAUnRubro = l => !!l?.obra_rubro_id || !!String(l?.rubro_codigo || "").trim();

/** nuevo | mas | menos. El signo manda: lo que resta nunca es trabajo nuevo. */
export function claseDePartida(l) {
  if (l?.tipo === "quita") return "menos";
  if (l?.clase === "nuevo" || l?.clase === "mas") return l.clase;
  return apuntaAUnRubro(l) ? "mas" : "nuevo";
}

/**
 * Lo que Diferencias encontró, dicho como clase de partida.
 *
 * Un precio más caro que se le cobra al cliente va con lo nuevo: la cantidad
 * es la misma, así que lo que cambió es lo que se pidió —otra especificación—,
 * y eso es lo que el cliente tiene que reconocer.
 */
export function claseDelHallazgo(hallazgo) {
  if (hallazgo === "mas_cantidad") return "mas";
  if (hallazgo === "menos_cantidad") return "menos";
  return "nuevo";
}

/**
 * Las adiciones de una orden, partidas por clase y con su subtotal.
 *
 * `separar` dice si hay algo que distinguir: alguna partida con su clase
 * guardada, o alguna que apunta a un rubro del contrato. Una orden vieja
 * escrita a mano, sin nada de eso, sale como salía —"ADICIONES" y nada más—:
 * rotularla ahora como trabajo nuevo sería afirmar en un papel firmado algo
 * que nadie dijo.
 */
export function adicionesPorClase(lineas = []) {
  const suyas = lineas.filter(l => l?.tipo !== "quita");
  const subtotal = ls => c2(ls.reduce((t, l) => t + n(l.cantidad) * n(l.precio_unitario), 0));
  const separar = suyas.some(l => l?.clase === "nuevo" || l?.clase === "mas" || apuntaAUnRubro(l));
  if (!separar) {
    return { separar: false, bloques: suyas.length ? [{ clase: null, lineas: suyas, subtotal: subtotal(suyas) }] : [] };
  }
  const bloques = ["nuevo", "mas"].map(clase => {
    const ls = suyas.filter(l => claseDePartida(l) === clase);
    return { clase, ...CLASES[clase], lineas: ls, subtotal: subtotal(ls) };
  }).filter(b => b.lineas.length);
  return { separar: true, bloques };
}

/**
 * El rubro del contrato al que apunta una partida, si apunta a alguno.
 *
 * Por su id cuando lo tiene; si no, por el número que quedó escrito al tomar
 * el precio del presupuesto. Los rubros que entraron por una orden de cambio no
 * cuentan: lo contratado es el contrato.
 */
export function rubroDeLaPartida(l, rubros = []) {
  const delContrato = rubros.filter(r => r?.origen !== "orden_cambio");
  if (l?.obra_rubro_id) {
    const r = delContrato.find(x => Number(x.id) === Number(l.obra_rubro_id));
    if (r) return r;
  }
  const codigo = String(l?.rubro_codigo || "").trim();
  if (!codigo) return null;
  return delContrato.find(x => String(x.numero ?? x.codigo ?? "").trim() === codigo) || null;
}

// ── EL PRECIO PACTADO NO SE MUEVE ──────────────────────────────────────────
//
// Una orden de cambio le pone precio a lo que no lo tenía. Lo que ya estaba en
// el contrato —más metros del mismo piso, o menos— va al precio que el cliente
// firmó: subirlo en una orden es cambiarle el contrato por la puerta de atrás,
// y bajarlo es regalar margen sin que nadie lo haya decidido.
//
// Y hay una manera muy fácil de subirlo sin querer: el rubro del control lleva
// el IVA ADENTRO de su total. Dividiendo ese total por la cantidad sale el
// precio con IVA, y la orden —que se cotiza sin IVA y lo suma al pie— termina
// cobrando el impuesto dos veces: un 15% por encima de lo pactado en cada
// partida. Así nació la OC-04 de Diners Aeropuerto.

/**
 * El precio unitario que el cliente firmó para ese rubro, sin IVA.
 *
 * El escrito en el contrato cuando es ese mismo número; si no —los rubros que
 * entraron por una orden lo guardan con el IVA adentro— el que sale de su
 * total sin IVA.
 */
export function precioDelContrato(rubro) {
  const cant = n(rubro?.cantidad);
  if (!cant) return null;
  const calculado = baseSinIva(rubro) / cant;
  if (!(calculado > 0)) return null;
  const escrito = n(rubro.precio_unitario);
  return escrito > 0 && Math.abs(escrito - calculado) <= Math.max(0.01, calculado * 0.005)
    ? escrito : c4(calculado);
}

/**
 * Esta partida contra el precio pactado de su rubro.
 *
 * Solo opina de las partidas que son más o menos cantidad de un rubro del
 * contrato: lo nuevo no tiene precio pactado, y por eso se le pone uno.
 *
 * @returns { pactado, diferencia, pct, fuera } o null si no hay precio pactado
 */
export function contraLoPactado(l, rubros = []) {
  if (claseDePartida(l) === "nuevo") return null;
  const rubro = rubroDeLaPartida(l, rubros);
  const pactado = rubro ? precioDelContrato(rubro) : null;
  if (pactado == null) return null;
  const diferencia = c4(n(l.precio_unitario) - pactado);
  return {
    pactado, diferencia,
    pct: Math.round((diferencia / pactado) * 1000) / 10,
    fuera: Math.abs(diferencia) > Math.max(0.01, pactado * 0.002),
  };
}

/** Las partidas de la orden que no están al precio pactado, con cuál debería ser. */
export function fueraDeLoPactado(lineas = [], rubros = []) {
  return lineas.map(l => ({ linea: l, ...(contraLoPactado(l, rubros) || {}) })).filter(x => x.fuera);
}

/**
 * Cuánto se le sube al costo, en porcentaje: lo que se pregunta al mirar una
 * partida. Null si no hay costo contra el cual medirlo.
 */
export function porcentajeSobreCosto(l) {
  const costo = n(l?.costo_unitario);
  if (!(costo > 0) || l?.tipo === "quita") return null;
  return Math.round((n(l.precio_unitario) / costo - 1) * 1000) / 10;
}

/**
 * El precio que sale de subirle un porcentaje al costo, al centavo.
 *
 * Al centavo y no más fino: el documento muestra el unitario con dos
 * decimales, y cantidad por unitario tiene que dar el total que el cliente ve.
 * Por eso en una partida de poco precio el porcentaje que queda puede no ser
 * exactamente el que se escribió: $1,71 más 20% son $2,05, que es 19,9%.
 */
export function precioConPorcentaje(costo, pct) {
  return c2(n(costo) * (1 + n(pct) / 100));
}

/**
 * Cuánto había contratado, para leer el cambio de cantidad sin ir al contrato.
 *
 * Solo lo contratado. No dice en cuánto queda: otra orden pudo haber movido el
 * mismo rubro antes, y una suma hecha acá con una sola de las dos diría un
 * número que no es.
 */
export function contratadoDe(l, rubros = [], fmt = v => String(c2(v))) {
  const clase = claseDePartida(l);
  if (clase === "nuevo") return "";
  const r = rubroDeLaPartida(l, rubros);
  if (!r || !n(r.cantidad)) return "";
  return `En el contrato: ${fmt(r.cantidad)} ${r.unidad || ""}`.trim();
}
