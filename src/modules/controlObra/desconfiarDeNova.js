import { baseSinIva } from "./contratoDeLaObra.js";
// LO QUE NOVA NO PUEDE AFIRMAR, NO LO AFIRMA.
//
// Emparejar un renglón de una proforma con un rubro del contrato es la decisión
// de la que cuelga todo lo demás: la cantidad contratada, el precio contra el
// que se compara, el ahorro o el sobreprecio, y la decisión de si eso ya estaba
// incluido. Un emparejamiento equivocado no se ve: produce números con la misma
// cara que los buenos.
//
// Y pasó. Tres renglones de una proforma eléctrica quedaron pegados al mismo
// rubro "INSTALACIÓN DE ACOMETIDA PROVISIONAL" —un global de una unidad— con
// cantidades de 3, 29 y 49 "glb", y la pantalla concluyó que aprobarlas dejaba
// veintinueve mil dólares. Ninguno de esos renglones decía eso en el papel.
//
// SIN RUBRO ES UNA RESPUESTA; EL RUBRO EQUIVOCADO NO.
//
// Un renglón sin emparejar la aplicación ya sabe mostrarlo —"no hay rubro del
// contrato que lo cubra"— y al lado está el presupuesto para señalarle el suyo
// en dos clics. Eso es trabajo de un minuto. Un emparejamiento inventado cuesta
// una orden de cambio mal cobrada y la confianza en todo lo demás que dice la
// pantalla, que es lo caro.
//
// Entonces lo que no se puede sostener se devuelve sin rubro, y se dice cuántos
// y por qué.

const n = v => Number(v) || 0;

/** Para comparar textos sin que los acentos ni las mayúsculas decidan nada. */
const pelado = t => String(t || "").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * EL TEXTO IGUAL NO PRUEBA NADA, Y POR ESO ESTO YA NO DESCALIFICA A NADIE.
 *
 * Parecía una señal buenísima: si el renglón dice exactamente lo que dice el
 * rubro, es que NOVA copió la lista del presupuesto en vez de leer el papel.
 * Y marcó en rojo "Tablero Trifásico de 20 espacios -PRINCIPAL" contra el
 * rubro 91, que se llama igual, con la misma unidad, la misma cantidad y un
 * precio a quince dólares de distancia: el emparejamiento más correcto de toda
 * la proforma.
 *
 * Lo que pasa es que este presupuesto se armó con una cotización vieja de este
 * mismo proveedor, así que los textos SON los mismos. En una obra así, el texto
 * idéntico es la firma de un acierto y no de una copia.
 *
 * Y la copia que esto venía a cazar ya no puede ocurrir: desde que la
 * transcripción se hace sin ver la lista de rubros, no hay nada que copiar.
 * Lo que queda son las reglas que miran los NÚMEROS —la unidad, la cantidad—,
 * que hablan de si las dos cosas son la misma y no de cómo se escriben.
 *
 * Se deja la función porque sirve para explicar, pero no descalifica.
 *
 * Cuando el texto que vuelve es igual al del rubro con el que dice calzar, lo
 * que pasó es que NOVA copió la lista del presupuesto en vez de leer el papel.
 * El renglón de una proforma lo escribió el proveedor y casi nunca coincide
 * palabra por palabra con el del contrato.
 */
export const copiaDelRubro = (descripcion, rubro) => {
  const a = pelado(descripcion);
  const b = pelado(rubro?.descripcion);
  if (!a || !b) return false;
  if (a === b) return true;
  // CASI IGUAL TAMBIÉN ES COPIADO, pero casi igual de verdad: uno contiene al
  // otro entero y son prácticamente del mismo largo.
  //
  // La vara tiene que ser estricta. Un proveedor que cotiza bien describe el
  // mismo trabajo con casi las mismas palabras —"punto de iluminación con
  // tubería EMT"— y eso es un emparejamiento BUENO, el que más vale. Una regla
  // que mire parecidos sueltos tira justo los aciertos y deja al que lee
  // emparejando a mano lo que ya estaba bien.
  const largo = Math.max(a.length, b.length);
  return largo > 24 && (a.startsWith(b) || b.startsWith(a))
    && Math.min(a.length, b.length) / largo >= 0.9;
};

/**
 * UN GLOBAL NO VIENE DE A VEINTINUEVE.
 *
 * Un rubro cotizado como global —"glb", una unidad— es un trabajo entero: el
 * tablero, la acometida. Que un renglón traiga cuarenta y nueve de eso no es
 * una cantidad de más, es que calzó con el rubro que no era.
 */
export const globalMultiplicado = (linea, rubro) => {
  const u = pelado(rubro?.unidad);
  const esGlobal = u === "glb" || u === "global" || u === "gbl";
  if (!esGlobal || n(rubro?.cantidad) > 1) return false;
  return n(linea?.cantidad) > 1;
};

/**
 * Los emparejamientos que no se sostienen, devueltos sin rubro.
 *
 * @param items   lo que leyó NOVA, con su rubro_id
 * @param rubros  los del contrato
 * @returns { items, sospechosos, porQue }
 */
export function limpiarEmparejamientos(items = [], rubros = []) {
  const porId = new Map((rubros || []).map(r => [Number(r.id), r]));

  // VARIOS RENGLONES CONTRA EL MISMO RUBRO, TODOS IGUALES: es la firma de una
  // lista copiada, no de una proforma que detalla un trabajo en partes.
  const cuantosPorRubro = new Map();
  for (const it of items) {
    const id = Number(it.rubro_id);
    if (id) cuantosPorRubro.set(id, (cuantosPorRubro.get(id) || 0) + 1);
  }

  const motivos = [];
  const limpios = items.map(it => {
    const rubro = porId.get(Number(it.rubro_id));
    if (!rubro) return it;
    let porQue = null;
    if (unidadesDistintas(it, rubro)) {
      porQue = `el papel lo cobra por ${it.unidad} y el rubro está contratado por ${rubro.unidad}`;
    } else if (globalMultiplicado(it, rubro)) porQue = "el rubro es un global de una unidad y el renglón trae varias";
    else if ((cuantosPorRubro.get(Number(it.rubro_id)) || 0) >= 3 && globalMultiplicado(it, rubro)) {
      porQue = "tres renglones distintos contra el mismo rubro global";
    }
    if (!porQue) return it;
    motivos.push({ descripcion: it.descripcion, rubro: rubro.descripcion, porQue });
    return { ...it, rubro_id: null, dudoso: porQue };
  });

  return {
    items: limpios,
    sospechosos: motivos.length,
    motivos,
    porQue: motivos.length
      ? `${motivos.length} ${motivos.length === 1 ? "renglón quedó" : "renglones quedaron"} sin rubro porque el `
        + "emparejamiento no se sostenía: es preferible señalarlo a mano que comparar contra el rubro equivocado."
      : null,
  };
}

// LA UNIDAD ES LA PRUEBA MÁS BARATA DE TODAS.
//
// Un renglón que se cobra POR MES no es el mismo trabajo que un rubro que se
// contrató como global, y uno medido en metros lineales no es uno que se cuenta
// por unidad. La descripción puede parecerse —"tablero eléctrico" aparece en
// los dos— pero la unidad no se parece: dice qué se está comprando.
//
// Es lo que pasó con el alquiler mensual del tablero de obra: $115,56 POR MES
// calzó con "INSTALACIÓN DE ACOMETIDA PROVISIONAL, TABLERO Y LUMINARIAS", un
// global de $1.159,20, y la pantalla dedujo que el proveedor había bajado el
// precio mil dólares.
const FAMILIA = [
  ["u", ["u", "un", "und", "unid", "unidad", "unidades", "pza", "pieza", "c u", "cu"]],
  ["glb", ["glb", "gbl", "global", "gl", "lote", "suma global"]],
  ["m", ["m", "ml", "metro", "metros", "m lineal", "mtl"]],
  ["m2", ["m2", "m²", "mt2", "metro2"]],
  ["m3", ["m3", "m³", "mt3"]],
  ["kg", ["kg", "kilo", "kilos", "kgs"]],
  ["tiempo", ["mes", "meses", "dia", "dias", "semana", "semanas", "hora", "horas", "jornal", "jornales"]],
  ["pto", ["pto", "ptos", "punto", "puntos"]],
];

/** La familia de una unidad, o null si no se reconoce (y entonces no opina). */
export function familiaDe(unidad) {
  const u = pelado(unidad);
  if (!u) return null;
  const f = FAMILIA.find(([, vs]) => vs.includes(u));
  return f ? f[0] : null;
}

/**
 * ¿Están midiendo cosas distintas?
 *
 * Solo opina cuando reconoce las dos unidades: una unidad rara —"jgo", "rollo"—
 * no es motivo para tirar un emparejamiento que puede estar bien.
 */
export const unidadesDistintas = (linea, rubro) => {
  const a = familiaDe(linea?.unidad);
  const b = familiaDe(rubro?.unidad);
  return !!a && !!b && a !== b;
};

/**
 * EL PRECIO ES LA PRUEBA QUE EL TEXTO NO DA. "Pieza tomacorriente doble caja
 * de PISO" y "Pieza tomacorriente doble" comparten todas las palabras que
 * cuentan; a $45 contra $8,91 no son la misma pieza. Se compara el unitario
 * del papel con el del rubro sin IVA, y si uno es más del doble del otro el
 * emparejamiento se marca para mirarlo. No opina cuando falta un número.
 *
 * @param linea  { cantidad, monto } del papel (sin IVA)
 */
export function precioNoSeParece(linea, rubro, tolerancia = 2) {
  const cant = n(linea?.cantidad), monto = n(linea?.monto), cantRubro = n(rubro?.cantidad);
  if (!cant || !monto || !cantRubro) return null;
  const puPapel = monto / cant;
  const puRubro = baseSinIva(rubro) / cantRubro;
  if (!(puPapel > 0) || !(puRubro > 0)) return null;
  const razon = puPapel / puRubro;
  if (razon <= tolerancia && razon >= 1 / tolerancia) return null;
  const c2 = v => Math.round(v * 100) / 100;
  return `El papel lo cotiza a $${c2(puPapel)} y el rubro vale $${c2(puRubro)} sin IVA: `
    + (razon > 1 ? `${c2(razon)} veces más` : `${c2(1 / razon)} veces menos`) + ". Casi seguro no es el mismo trabajo.";
}

/**
 * OTRO RENGLÓN APUNTA AL MISMO RUBRO. O es el mismo trabajo partido en dos, o
 * uno de los dos está mal emparejado; lo que no puede ser es comparar cada
 * uno contra el rubro entero: 111 y 3 contra 65 daban "46 de más" y "62 de
 * menos" sobre los mismos puntos de luz.
 */
export function mismoRubroQueOtro(linea, lineas = []) {
  const id = linea?.obra_rubro_id ?? linea?.rubro_id;
  if (!id) return null;
  const otros = (lineas || []).filter(l => l && l !== linea && String(l.obra_rubro_id ?? l.rubro_id ?? "") === String(id));
  if (!otros.length) return null;
  const dice = otros.map(o => `«${String(o.texto_papel || o.descripcion || "").slice(0, 40)}»`).join(", ");
  return `${otros.length === 1 ? "Otro renglón también apunta" : `Otros ${otros.length} renglones también apuntan`} a este rubro: ${dice}. `
    + "O es el mismo trabajo partido en dos, o uno está mal emparejado: no se compara cada uno contra el rubro entero.";
}
