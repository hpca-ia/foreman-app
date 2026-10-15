// CÓMO CONTESTA NOVA UNA PROFORMA, Y POR QUÉ NO EN JSON.
//
// Pedirle JSON cuesta unos cuarenta tokens por renglón: las llaves, las
// comillas y el nombre de cada campo, repetidos doscientas veces. Escribir eso
// lleva más de un minuto, y la función se corta a los sesenta segundos. Lo que
// llega a la pantalla es un 504 — así que la proforma larga, que es justo la
// que nadie quiere copiar a mano, era la única que no se podía leer.
//
// En líneas son quince tokens. Y si igual se corta, lo que alcanzó a escribir
// sirve: un JSON cortado por la mitad no deja nada, porque no cierra y no se
// puede leer ni en parte. Doscientos renglones de doscientos cincuenta son
// doscientos renglones que nadie tiene que copiar a mano.

import { num } from "./leerPresupuesto.js";

export const FORMATO = `Contestá en LÍNEAS, sin JSON, sin markdown y sin ninguna
explicación. Una línea por cada renglón de la proforma, con los campos separados
por barras, exactamente así:

descripción | cantidad | unidad | monto | rubro_id

La primera línea es el proveedor:  PROVEEDOR | nombre del proveedor

Sin encabezados, sin totales, sin subtotales y sin líneas en blanco. La
descripción va corta y sin barras adentro.`;

/**
 * Las líneas que escribió NOVA, vueltas renglones.
 *
 * Tolerante a propósito: una línea que no se entiende se saltea y las demás
 * entran. Lo que no puede pasar es que un renglón raro al final tire abajo la
 * lectura entera de una proforma de doscientos.
 */
export function renglonesDeTexto(txt = "") {
  const items = [];
  let proveedor = "";
  for (const cruda of String(txt).split("\n")) {
    const linea = cruda.trim();
    if (!linea || !linea.includes("|")) continue;
    let campos = linea.replace(/^[-*\s]+/, "").split("|").map(s => s.trim());
    if (/^proveedor$/i.test(campos[0])) {
      proveedor = campos.slice(1).join(" ").trim();
      continue;
    }
    // Una descripción con una barra adentro parte la línea de más. Los cuatro
    // últimos campos son los números; todo lo de antes es la descripción.
    if (campos.length > 5) campos = [campos.slice(0, campos.length - 4).join(" "), ...campos.slice(-4)];
    if (campos.length === 4) campos = [...campos, ""]; // vino sin rubro
    if (campos.length !== 5) continue;                 // una línea cortada a la mitad
    const [descripcion, cantidad, unidad, monto, rubro] = campos;
    if (!descripcion) continue;
    if (/^descripci/i.test(descripcion)) continue;     // repitió el encabezado
    const id = String(rubro || "").trim();
    items.push({
      descripcion: descripcion.slice(0, 90),
      cantidad: num(cantidad),
      unidad: String(unidad || "").slice(0, 10),
      monto: Math.round(num(monto) * 100) / 100,
      rubro_id: /^\d+$/.test(id) ? Number(id) : null,
    });
  }
  return { proveedor, items };
}

/**
 * Lo que contestó, sea como sea que haya contestado.
 *
 * Si igual mandó JSON —pasa— se lee en JSON. Cambiar el formato de la respuesta
 * no puede dejar sin leer una proforma por una costumbre del modelo.
 */
export function interpretarRespuesta(txt = "") {
  const porLineas = renglonesDeTexto(txt);
  if (porLineas.items.length) return porLineas;
  const bloque = String(txt).replace(/```json|```/g, "").match(/\{[\s\S]*\}/)?.[0];
  if (!bloque) return porLineas;
  try {
    const p = JSON.parse(bloque);
    const items = (Array.isArray(p.items) ? p.items : [])
      .filter(x => x && (x.descripcion || num(x.monto)))
      .map(x => ({
        descripcion: String(x.descripcion || "").trim().slice(0, 90),
        cantidad: num(x.cantidad),
        unidad: String(x.unidad || "").slice(0, 10),
        monto: Math.round(num(x.monto) * 100) / 100,
        rubro_id: /^\d+$/.test(String(x.rubro_id ?? "").trim()) ? Number(x.rubro_id) : null,
      }));
    return { proveedor: String(p.proveedor || "").trim(), items };
  } catch {
    return porLineas;
  }
}

/**
 * Una planilla larga se lee por partes.
 *
 * Doscientos cincuenta renglones no entran en una sola respuesta por más corto
 * que sea el formato: el modelo tiene un techo de escritura y la función tiene
 * uno de tiempo. De a sesenta filas, cada viaje termina en veinte segundos y la
 * planilla entra completa.
 *
 * Las primeras filas van en todos los bloques: ahí están los títulos de las
 * columnas, y sin ellos el segundo bloque es una tabla de números sueltos.
 */
export function partirHoja(texto = "", filas = 60) {
  const lineas = String(texto).split("\n").filter(l => l.trim());
  if (!lineas.length) return [];
  if (lineas.length <= filas) return [lineas.join("\n")];
  const cabeza = lineas.slice(0, 3);
  const bloques = [];
  for (let i = 0; i < lineas.length; i += filas) {
    const trozo = lineas.slice(i, i + filas);
    bloques.push(i === 0 ? trozo.join("\n") : [...cabeza, ...trozo].join("\n"));
  }
  return bloques;
}

// UNA PLANILLA NO SE TRANSCRIBE: SE LEE.
//
// Es lo que hace el importador de presupuestos desde siempre, y por eso nunca
// se corta. A NOVA no se le pide que copie trescientas filas —eso es escribir,
// y escribir es lo que tarda— sino que diga cuál columna es la descripción,
// cuál la cantidad y cuál el total. Eso son cuatro números. Las trescientas
// filas las lee el código, que no se cansa, no se queda sin espacio y no se
// equivoca al copiar un monto.
//
// Para una proforma vale igual: las columnas las reconoce NOVA una vez, los
// renglones salen de la planilla tal como están.

const TOTALES = /^\s*(sub\s*-?\s*total|total|son[:\s]|iva\b|i\.v\.a|descuento|anticipo|forma de pago|observaciones|nota)/i;

export function renglonesDeHoja(filas = [], mapa = {}) {
  const cD = mapa.col_descripcion, cC = mapa.col_cantidad, cU = mapa.col_unidad, cT = mapa.col_total;
  if (cD == null || cT == null) return [];
  const desde = Number(mapa.fila_encabezado ?? 0) + 1;
  const items = [];
  for (let i = desde; i < filas.length; i++) {
    const f = filas[i] || [];
    const descripcion = String(f[cD] ?? "").trim();
    const monto = Math.round(num(f[cT]) * 100) / 100;
    // Sin descripción o sin monto es una fila vacía, un título de capítulo o
    // una línea de separación. No es un renglón que se compre.
    if (!descripcion || !monto) continue;
    // Un subtotal tiene monto y parece un renglón. Sumarlo contaría la
    // proforma dos veces, y el beneficio saldría del doble de lo que es.
    if (TOTALES.test(descripcion)) continue;
    items.push({
      descripcion: descripcion.slice(0, 90),
      cantidad: num(cC == null ? 0 : f[cC]),
      unidad: String(cU == null ? "" : (f[cU] ?? "")).trim().slice(0, 10),
      monto,
      rubro_id: null,
    });
  }
  return items;
}

/**
 * A qué rubro va cada renglón, que es lo único que la planilla no dice.
 *
 * Se pregunta aparte y en corto —"3:44", cinco tokens— en vez de hacerle
 * reescribir la proforma entera para agregarle una columna.
 */
export const PROMPT_RUBROS = `Para cada renglón numerado, decí a qué rubro del presupuesto corresponde.

Contestá una línea por renglón, sin JSON y sin explicaciones:

número:rubro_id

Si no estás seguro, poné un guion: número:-
El guion es una respuesta válida y es mejor que adivinar: acá se mide si se
compró mejor o peor que lo presupuestado, y un renglón comparado contra el rubro
equivocado inventa un ahorro o un sobreprecio que no existe.`;

export function asignacionDeTexto(txt = "") {
  const mapa = new Map();
  for (const linea of String(txt).split("\n")) {
    const m = linea.trim().match(/^(\d+)\s*[:=]\s*(\d+|-)/);
    if (!m) continue;
    if (m[2] !== "-") mapa.set(Number(m[1]), Number(m[2]));
  }
  return mapa;
}
