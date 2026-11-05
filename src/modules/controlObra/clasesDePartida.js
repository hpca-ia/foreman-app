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
