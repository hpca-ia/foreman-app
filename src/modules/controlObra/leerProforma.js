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
