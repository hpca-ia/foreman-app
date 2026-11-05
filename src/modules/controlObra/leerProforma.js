import { emparejarPorTexto, emparejarPorParecido, pedidoDeEmparejamiento } from "./emparejarRubros.js";
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

import { num, numeroDeCelda } from "../lectura/celdas.js";
// La aritmética del papel —cantidad x unitario = total, suma = subtotal— es la
// misma para el presupuesto, la proforma y la cotización, y es la que decide
// si una lectura entra a FOREMAN. Vive en lectura/aritmetica.js.
import { cuadrar, revisarLectura } from "../lectura/aritmetica.js";
// Leer, comprobar, y si no cuadra volver a leer diciendo qué no cuadró.
import { leerHastaQueCuadre, VUELTAS } from "../lectura/insistir.js";
// La aritmética elige qué columna es cuál, y la evidencia del papel dice con
// qué convención de miles está escrito. Mismo motor que el presupuesto.
import { mapeoQueCuadra, milesDelDocumento, pieDeHoja } from "../lectura/columnas.js";
// Un formato que ya se leyó una vez se reconoce por su encabezado. Vive en el
// lector de presupuestos y es el mismo para una proforma: es una lista de
// columnas, no importa de qué papel.
import { buscarFormato } from "./leerPresupuesto.js";
export { cuadrar, revisarLectura };
// Las reglas para leer una celda son las mismas acá que en el presupuesto: es
// el mismo papel con otro encabezado. Se re-exporta porque la pantalla y las
// pruebas la piden desde este archivo.
export { numeroDeCelda };

export const FORMATO = `Contestá en LÍNEAS, sin JSON, sin markdown y sin ninguna
explicación. Una línea por cada renglón de la proforma, con los campos separados
por barras, exactamente así:

ítem | descripción | cantidad | unidad | precio unitario | monto | rubro_id

"ítem" es el número de ítem impreso en el papel, tal cual. Si el papel no numera
sus renglones, poné un guion. Sirve para saber cuáles faltan y para seguir donde
se cortó una respuesta larga.

LOS RENGLONES CON CANTIDAD 0 Y SIN MONTO NO SE TRANSCRIBEN: figuran en el papel
pero no se están cotizando.

La primera línea es el proveedor:  PROVEEDOR | nombre del proveedor

Sin encabezados, sin totales, sin subtotales y sin líneas en blanco. La
descripción va COMPLETA, con todas sus palabras, sin barras adentro: es con el
texto entero que se decide si un renglón es el mismo trabajo que un rubro, y
"Punto para Sensor de iluminación…" cortado antes de llegar al final se
confunde con "Punto de iluminación…".

EL PRECIO UNITARIO ES EL QUE DICE EL PAPEL, sin calcularlo. Si el renglón no lo
trae, poné un guion: no lo deduzcas dividiendo. Sirve para comprobar la lectura
—cantidad por unitario tiene que dar el monto— y un unitario inventado tapa
justo el error que esa cuenta encuentra.

LA DESCRIPCIÓN SE COPIA DEL PAPEL, PALABRA POR PALABRA. Es lo que escribió el
proveedor. Nunca uses el texto de la lista de rubros del presupuesto para
describir un renglón: si lo hacés, el que lee cree que el proveedor cotizó algo
que no cotizó.

EL rubro_id SE PONE SOLO CUANDO ES EL MISMO TRABAJO, y vacío en cualquier otro
caso. Vacío es una respuesta correcta y frecuente: la aplicación muestra esos
renglones aparte y una persona les asigna el rubro en dos clics, con el
presupuesto al lado. Un rubro equivocado, en cambio, no se ve —produce números
con la misma cara que los buenos— y termina en una orden de cambio mal cobrada.
Ante la duda, vacío.`;

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
  // CUÁNTO DE ESOS MONTOS ES IVA.
  //
  // Los montos vienen con el IVA adentro, que es lo que hace falta para
  // comparar proformas en Beneficios: ahí se decide a quién comprarle, y lo que
  // se paga es con IVA. Pero una orden de cambio se cobra SIN IVA, y medir un
  // precio sin IVA contra un costo con IVA es comparar dos cosas distintas: en
  // la OC-01 de Plaza Lagos eso se comía 15 puntos del margen —$336,89 contra
  // los $518,16 que de verdad deja—. Por eso el porcentaje se pregunta y viaja:
  // cada lado lo saca o lo deja según lo que esté midiendo.
  let iva = 0;
  let totales = null;
  // Lo que el papel descuenta al pie, como número positivo.
  let descuento = 0;
  for (const cruda of String(txt).split("\n")) {
    const linea = cruda.trim();
    if (!linea || !linea.includes("|")) continue;
    let campos = linea.replace(/^[-*\s]+/, "").split("|").map(s => s.trim());
    if (/^proveedor$/i.test(campos[0])) {
      proveedor = campos.slice(1).join(" ").trim();
      continue;
    }
    if (/^iva$/i.test(campos[0])) {
      const p = num(campos[1]);
      // Un IVA de 115 es el modelo contestando el total y no el porcentaje.
      if (p >= 0 && p <= 30) iva = p;
      continue;
    }
    // LOS TRES NÚMEROS DEL PIE, PARA COMPROBAR LA LECTURA.
    //
    // Es la única manera de saber si NOVA leyó bien sin volver a sumar la
    // proforma a mano. Si los renglones no dan el subtotal del papel, algo se
    // leyó mal —un renglón de más, uno de menos, un monto con el IVA adentro—
    // y eso hay que decirlo antes de que el número viaje a un margen.
    // EL DESCUENTO DEL PIE, QUE ES PLATA NUESTRA.
    //
    // Un "descuento especial" abajo de los renglones es lo que de verdad se va
    // a pagar de menos, y hasta ahora se descartaba junto con los subtotales:
    // la línea empieza con "descuento" y el filtro de totales la sacaba. Se
    // perdía el descuento entero y, encima, la comprobación del pie salía mal
    // —"se leyó de más"— porque los renglones sumaban el precio de lista y el
    // subtotal del papel ya venía descontado.
    if (/^descuento$/i.test(campos[0])) {
      const d = num(campos[1]);
      if (d) descuento = Math.abs(Math.round(d * 100) / 100);
      continue;
    }
    if (/^totales$/i.test(campos[0])) {
      const [, sub, i2, tot] = campos;
      totales = {
        subtotal: /^[-–—]?$/.test(String(sub || "").trim()) ? null : num(sub),
        iva: /^[-–—]?$/.test(String(i2 || "").trim()) ? null : num(i2),
        total: /^[-–—]?$/.test(String(tot || "").trim()) ? null : num(tot),
      };
      continue;
    }
    // Una descripción con una barra adentro parte la línea de más. Los últimos
    // campos son los números; todo lo de antes es la descripción.
    //
    // Y la línea puede venir con unitario o sin él: el formato lo pide, pero un
    // renglón viejo o una respuesta corta traen cinco campos y se leen igual.
    // Negarse a leer una proforma por una columna de más es tirar la lectura
    // entera por un dato que se puede deducir dividiendo.
    // CUÁL DE LAS DOS FORMAS ES, LO DICEN LOS NÚMEROS.
    //
    // Seis campos pueden ser un renglón con unitario —descripción, cantidad,
    // unidad, unitario, monto, rubro— o una descripción que lleva una barra
    // adentro: "Tubo PVC 110mm | desagüe | 12 | u | 48,00 | 7". Se mira el que
    // tendría que ser la cantidad: si no es un número, la barra estaba en el
    // texto y los campos son cinco.
    const esNumero = t => /^[\s$]*-?[\d.,]+\s*$/.test(String(t || ""));
    // EL NÚMERO DE ÍTEM, SI VINO. Es un entero corto o un guion delante de la
    // descripción; una descripción nunca es eso, y si el segundo campo es un
    // número entonces el primero era la descripción de un renglón viejo.
    let item = null;
    // Vacío también: el guion del ítem se va con las viñetas que se limpian al
    // principio de la línea, y deja el primer campo en blanco.
    if (campos.length >= 6 && /^(\d{1,4}|[-–—]?)$/.test(campos[0]) && !esNumero(campos[1])) {
      item = /^\d+$/.test(campos[0]) ? Number(campos[0]) : null;
      campos = campos.slice(1);
    }
    const conUnitario = campos.length >= 6
      && esNumero(campos[campos.length - 5]) && esNumero(campos[campos.length - 3]);
    const cuantos = conUnitario ? 5 : 4;
    if (campos.length > cuantos + 1) {
      campos = [campos.slice(0, campos.length - cuantos).join(" "), ...campos.slice(-cuantos)];
    }
    if (campos.length === cuantos) campos = [...campos, ""]; // vino sin rubro
    if (campos.length !== cuantos + 1) continue;       // una línea cortada a la mitad
    const [descripcion, cantidad, unidad, ...resto] = campos;
    const [unitario, monto, rubro] = conUnitario ? resto : [null, ...resto];
    if (!descripcion) continue;
    if (/^descripci/i.test(descripcion)) continue;     // repitió el encabezado
    const id = String(rubro || "").trim();
    items.push({
      ...(item != null ? { item } : {}),
      descripcion,
      cantidad: num(cantidad),
      unidad: String(unidad || "").slice(0, 10),
      // El unitario del papel, tal cual: sirve para comprobar la lectura, y
      // deducirlo dividiendo taparía justo el error que esa cuenta encuentra.
      unitario: unitario == null || /^[-–—\s]*$/.test(String(unitario)) ? null : num(unitario),
      monto: Math.round(num(monto) * 100) / 100,
      rubro_id: /^\d+$/.test(id) ? Number(id) : null,
    });
  }
  return { proveedor, items, iva, totales, descuento };
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
        descripcion: String(x.descripcion || "").trim(),
        cantidad: num(x.cantidad),
        unidad: String(x.unidad || "").slice(0, 10),
        monto: Math.round(num(x.monto) * 100) / 100,
        rubro_id: /^\d+$/.test(String(x.rubro_id ?? "").trim()) ? Number(x.rubro_id) : null,
      }));
    const pct = num(p.iva);
    return {
      proveedor: String(p.proveedor || "").trim(), items,
      iva: pct >= 0 && pct <= 30 ? pct : 0,
      totales: p.subtotal != null || p.total != null
        ? { subtotal: p.subtotal == null ? null : num(p.subtotal), iva: p.iva_monto == null ? null : num(p.iva_monto), total: p.total == null ? null : num(p.total) }
        : null,
    };
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

/**
 * LAS COLUMNAS DE UNA PLANILLA SE ENCUENTRAN SIN PREGUNTARLE A NADIE.
 *
 * Un Excel es una tabla: tiene una fila de encabezados que dice DESCRIPCIÓN,
 * CANTIDAD, UNIDAD, TOTAL. Buscarla es mirar texto, y eso lo hace una
 * computadora sin equivocarse nunca y sin saltearse filas.
 *
 * Pedírselo a un modelo costaba caro: la proforma de octubre tiene 42 renglones
 * con monto y devolvió 28. No fallaron los emparejamientos ni la comparación
 * —los catorce que faltaban nunca entraron—, y lo peor es que no se notaba: la
 * pantalla mostraba "esto lo cotiza uno solo" sobre renglones que estaban en
 * los dos papeles.
 *
 * Si los encabezados no se reconocen, se le pregunta al modelo como antes.
 */
export function columnasDeHoja(filas = []) {
  const pelado = t => String(t || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  // SIN LOS ESPACIOS. Las proformas escriben los encabezados separando las
  // letras —"D E S C R I P C I Ó N"— para que ocupen la celda, y así escrito no
  // se parece a nada. Juntando las letras es la misma palabra, que es lo que
  // cualquiera ve al mirarlo.
  const busca = (f, ...claves) => f.findIndex(c => {
    const t = pelado(c).replace(/ /g, "");
    return t && claves.some(k => t === k || t.includes(k));
  });
  for (let i = 0; i < Math.min(filas.length, 40); i++) {
    const f = (filas[i] || []).map(c => pelado(c));
    const cD = busca(f, "descripcion", "detalle", "rubro", "concepto");
    const cT = busca(f, "total", "valor total", "subtotal", "importe");
    if (cD < 0 || cT < 0) continue;
    const cC = busca(f, "cantidad", "cant");
    const cU = busca(f, "unidad", "unid", "u/m", "um");
    // EL PRECIO UNITARIO, cuando el papel lo trae. No hace falta para leer
    // —el unitario se deduce dividiendo— pero sirve para comprobar: si
    // cantidad por unitario no da el total, ese renglón se leyó mal.
    const cP = busca(f, "preciounitario", "punitario", "punit", "preciou", "vunitario", "unitario");
    return { fila_encabezado: i, col_descripcion: cD, col_cantidad: cC < 0 ? null : cC,
      col_unidad: cU < 0 ? null : cU, col_total: cT, col_unitario: cP < 0 || cP === cT ? null : cP };
  }
  return null;
}

export function renglonesDeHoja(filas = [], mapa = {}, { miles = null } = {}) {
  const cD = mapa.col_descripcion, cC = mapa.col_cantidad, cU = mapa.col_unidad, cT = mapa.col_total;
  const cP = mapa.col_unitario;
  if (cD == null || cT == null) return [];
  const desde = Number(mapa.fila_encabezado ?? 0) + 1;
  const items = [];
  for (let i = desde; i < filas.length; i++) {
    const f = filas[i] || [];
    const descripcion = String(f[cD] ?? "").trim();
    const monto = Math.round(numeroDeCelda(f[cT], miles) * 100) / 100;
    // Sin descripción o sin monto es una fila vacía, un título de capítulo o
    // una línea de separación. No es un renglón que se compre.
    if (!descripcion || !monto) continue;
    // Un subtotal tiene monto y parece un renglón. Sumarlo contaría la
    // proforma dos veces, y el beneficio saldría del doble de lo que es.
    if (TOTALES.test(descripcion)) continue;
    items.push({
      descripcion,
      cantidad: numeroDeCelda(cC == null ? 0 : f[cC], miles),
      unidad: String(cU == null ? "" : (f[cU] ?? "")).trim().slice(0, 10),
      monto,
      // El unitario del papel, para comprobar la multiplicación.
      unitario: cP == null ? null : (numeroDeCelda(f[cP], miles) || null),
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
/**
 * EL PIE DEL PAPEL, PREGUNTADO SOLO.
 *
 * Transcribir treinta y cuatro renglones y además acordarse de devolver cuatro
 * números del pie es una pregunta de más dentro de una tarea larga, y es la que
 * se cae: en una proforma devolvió el descuento y en la siguiente, el mismo
 * papel, no devolvió ni el descuento ni los totales. Sin el subtotal tampoco se
 * puede deducir el descuento por resta, así que se perdía dos veces.
 *
 * Es la misma lección que el emparejamiento: una pregunta por pedido. Esta
 * cuesta cuatro números de respuesta y recupera plata que estaba ofrecida por
 * escrito.
 */
export const PROMPT_PIE = `Mirá SOLO el pie de esta proforma, abajo de los renglones.

Contestá exactamente estas cinco líneas, sin explicar nada:

FECHA | la fecha de la proforma, como AAAA-MM-DD
SUBTOTAL | monto
DESCUENTO | monto
IVA | monto
TOTAL | monto

La FECHA es la del documento —la que figura arriba o al pie, junto al número de
proforma—, no la de hoy. Sirve para distinguir dos cotizaciones del mismo
proveedor: sin ella, la de enero y la de marzo se llaman igual.

Los montos van TAL COMO ESTÁN ESCRITOS en el papel, sin calcularlos y sin
corregirlos. Si alguno no aparece, poné un guion.

El DESCUENTO es cualquier rebaja que el papel reste abajo de los renglones:
"descuento especial", "descuento comercial", "dto. por volumen". Va como número
POSITIVO. Si no hay, guion.`;

/** Las cuatro líneas del pie, leídas. */
export function pieDeTexto(txt = "") {
  const val = t => (/^[-–—\s]*$/.test(String(t || "")) ? null : num(t));
  const pie = {};
  for (const linea of String(txt).split("\n")) {
    const [que, monto] = linea.split("|").map(x => String(x || "").trim());
    if (/^fecha$/i.test(que)) {
      const f = /\d{4}-\d{2}-\d{2}/.exec(String(monto || ""));
      if (f) pie.fecha = f[0];
    } else if (/^subtotal$/i.test(que)) pie.subtotal = val(monto);
    else if (/^descuento$/i.test(que)) pie.descuento = val(monto);
    else if (/^iva$/i.test(que)) pie.iva = val(monto);
    else if (/^total$/i.test(que)) pie.total = val(monto);
  }
  return pie;
}

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

// ── SEGUIR DONDE SE CORTÓ, HASTA EL FINAL DEL PAPEL ───────────────────────
//
// El modelo tiene un techo de escritura por llamada, y la función un minuto
// de tiempo: una proforma de 69 ítems con la descripción entera no entra en
// una sola respuesta. Se cortaba en el ítem 31, se tiraba la línea a medio
// escribir y se seguía como si el papel terminara ahí: $12.014 leídos de
// $18.298. El aviso estaba, pero una lectura a la que le falta la mitad no se
// arregla con un aviso.
//
// Cuando la respuesta se corta, se pide la continuación: "el último renglón
// fue este, seguí desde el siguiente". Cada parte entra en su techo y en su
// minuto, y el papel se lee hasta el final, tenga treinta renglones o
// trescientos. Lo repetido en el empalme se descarta por número de ítem, o
// por texto y monto si el papel no numera.

const mismoRenglon = (a, b) => (a.item != null && b.item != null
  ? Number(a.item) === Number(b.item)
  : String(a.descripcion || "").trim().toLowerCase() === String(b.descripcion || "").trim().toLowerCase()
    && Math.abs((Number(a.monto) || 0) - (Number(b.monto) || 0)) < 0.005
    && (Number(a.cantidad) || 0) === (Number(b.cantidad) || 0));

/** Lo que se le dice al modelo para que siga, con el último renglón entero a la vista. */
export function continuacion(items = []) {
  const u = items[items.length - 1];
  if (!u) return null;
  return `Ya transcribiste ${items.length} renglones de este documento. El último fue`
    + `${u.item != null ? ` el ítem ${u.item}:` : ":"} «${u.descripcion}» por ${u.monto}. `
    + "Seguí desde el renglón SIGUIENTE a ese, sin repetir ninguno de los anteriores, hasta el final "
    + "del documento, incluidas las páginas que siguen. El mismo formato, sin encabezados.";
}

/**
 * @param pedir       (cuerpo) => { texto, cortado }
 * @param cuerpoPara  (sigue) => cuerpo. `sigue` es null en la primera parte y
 *                    el texto de continuación en las que vienen después.
 * @returns { items, proveedor, iva, totales, descuento, cortado, partes }.
 *          `cortado` queda en true solo si ni con todas las partes se llegó
 *          al final.
 */
export async function leerSinCortes({ pedir, cuerpoPara, onPaso, partes = 8 }) {
  const junto = { items: [], proveedor: "", iva: 0, totales: null, descuento: 0 };
  let cortado = false, sigue = null, hechas = 0;
  for (let parte = 1; parte <= partes; parte++) {
    if (parte > 1) onPaso?.(`el papel sigue · leyendo desde el renglón ${junto.items.length + 1}`);
    const { texto, cortado: seCorto } = await pedir(cuerpoPara(sigue));
    hechas = parte;
    const leido = interpretarRespuesta(texto);
    // La última línea de una respuesta cortada quedó a medio escribir: un
    // monto cortado —"48" de "48,90"— entra como un renglón que parece bueno.
    if (seCorto) leido.items.pop();
    const nuevos = leido.items.filter(x => !junto.items.some(y => mismoRenglon(x, y)));
    junto.items.push(...nuevos);
    if (leido.proveedor && !junto.proveedor) junto.proveedor = leido.proveedor;
    if (leido.iva && !junto.iva) junto.iva = leido.iva;
    if (leido.totales && !junto.totales) junto.totales = leido.totales;
    if (leido.descuento && !junto.descuento) junto.descuento = leido.descuento;
    cortado = !!seCorto;
    // Terminó, o se cortó sin avanzar: seguir pidiendo no agrega nada.
    if (!seCorto || !nuevos.length) break;
    sigue = continuacion(junto.items);
  }
  return { ...junto, cortado, partes: hechas };
}

// ── LEER UNA COTIZACIÓN, DE DONDE VENGA ───────────────────────────────────
//
// La misma lectura sirve en dos lados: comparar una proforma contra el
// presupuesto (Beneficios) y llenar las líneas de una orden de cambio. Es el
// mismo papel —lo que un proveedor cotiza— y tiene que leerse igual en los
// dos, o el mismo archivo daría dos resultados distintos según por dónde entre.

/**
 * LEER NO ES EMPAREJAR, Y POR ESO SE PREGUNTAN APARTE.
 *
 * Antes la lista de rubros del presupuesto viajaba en el mismo pedido que la
 * transcripción, y pasó lo que tenía que pasar: NOVA devolvió como "renglones
 * de la proforma" los textos de los rubros del contrato, palabra por palabra,
 * con cantidades inventadas. Nadie lo notaba hasta que la pantalla decía que
 * aprobar un renglón dejaba veintinueve mil dólares.
 *
 * Teniendo las dos cosas a la vista, cualquiera mezcla: la lista es lo que está
 * escrito más cerca y copiar es más fácil que leer un PDF torcido.
 *
 * Entonces la lectura se hace a ciegas —el papel y nada más— y el
 * emparejamiento se pregunta después, sobre lo que ya se transcribió. Lo que no
 * se vio no se puede copiar, y eso no depende de que la instrucción se respete.
 */
export function sistemaDeCotizacion() {
  return `Eres NOVA. Lees proformas de proveedores de construcción en Ecuador.
Transcribís lo que dice el papel. No comparás con nada ni completás nada.

${FORMATO}

"monto" es lo que suma ESE renglón SIN IVA: su subtotal, antes de impuestos.

EL IVA NO VA. Ni en los rubros del presupuesto, ni en las órdenes de cambio, ni
en los costos: el IVA no es del proveedor ni nuestro, es del fisco, y en esta
obra se liquida al final, aparte de todo. Un monto con IVA adentro mezclado
entre los otros no es un error de redondeo: mueve el margen quince puntos.

Casi todas las proformas lo dicen con todas las letras, al pie: SUBTOTAL, IVA
15%, TOTAL. El número que vale es el del SUBTOTAL. Si los renglones están
escritos con el IVA adentro y abajo figura el subtotal, devolvé los montos que
suman el subtotal, no el total a pagar.

Después de la línea del proveedor van dos líneas más:

  IVA | porcentaje
  TOTALES | subtotal | iva | total
  DESCUENTO | monto

EL DESCUENTO ESPECIAL VA, y es de las cosas más importantes del papel. Muchas
proformas suman los renglones y después restan abajo un "descuento especial",
un "descuento comercial" o un "dto. por volumen". Esa plata es nuestra: es lo
que de verdad se va a pagar de menos. Si el papel lo trae, devolvelo como un
número POSITIVO en esa línea, y dejá los renglones con sus precios de lista, sin
descontarlo adentro de cada uno. Si no hay descuento, no pongas la línea.

El porcentaje es el que dice el papel —15, 12, o 0 si no tiene IVA—. En TOTALES
van los tres números TAL COMO ESTÁN ESCRITOS al pie de la proforma, sin
calcularlos y sin corregirlos; si alguno no aparece, poné un guion. Sirven para
comprobar que se leyó bien: la suma de los renglones tiene que dar el subtotal.

El campo "rubro_id" va siempre con un guion: emparejar no es parte de esta
lectura. Acá solo se transcribe el papel.`;
}

/**
 * Un archivo de cotización —PDF, foto o Excel— leído a renglones.
 *
 * @param pedir  función que habla con NOVA: (cuerpo) => { texto, cortado }
 * @returns { proveedor, items, cortado }
 */
export async function leerCotizacion(file, { pedir, lista = "", rubros = [], modelo, onPaso, hojaComoTexto, vueltas = VUELTAS, formatos = [] } = {}) {
  const esHoja = /\.(xlsx|xlsm|xls)$/i.test(file?.name || "");
  const esPdf = file?.type === "application/pdf";
  const sistema = sistemaDeCotizacion();

  const b64 = esHoja ? null : await new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(",")[1]);
    fr.readAsDataURL(file);
  });

  const texto = esHoja && hojaComoTexto ? await hojaComoTexto(file) : null;
  const filas = texto ? texto.split("\n").map(l => l.split("|").map(c => c.trim())) : [];

  // UNA LECTURA DEL PAPEL: los renglones y el pie. El lazo de abajo la vuelve
  // a llamar, con el reclamo en la mano, si la aritmética no cierra.
  //
  // `reclamar` llega null en la primera vuelta. En las siguientes trae lo que
  // no cuadró, dicho con los números: cuánto suma lo leído, cuánto dice el
  // papel, y qué renglón no multiplica. La planilla de Excel se lee sola solo
  // en la primera: leerla de nuevo daría exactamente lo mismo, así que si esa
  // lectura no cerró, las vueltas que siguen son del modelo.
  async function unaLectura(reclamar) {
    const items = [];
    let proveedor = "", cortado = false, iva = 0, totales = null, descuento = 0, fecha = null;
    // Cómo se leyó la planilla, si lo fue: el mapa, la convención, qué se
    // corrigió. Es lo que se recuerda si la lectura cierra.
    let hoja = null;

    // UNA PLANILLA SE LEE SOLA, SIN MODELO.
    //
    // Es una tabla: encontrar la fila de encabezados y leer las de abajo es
    // mirar texto. La proforma de octubre tiene 42 renglones con monto y el
    // modelo devolvió 28 —se salteó catorce, entre ellos uno de $2.149— y eso no
    // se notaba: la comparación mostraba "esto lo cotiza uno solo" sobre
    // renglones que estaban en los dos papeles.
    //
    // Si no se reconocen los encabezados se sigue preguntando, que es mejor que
    // no leer nada.
    if (esHoja && filas.length && !reclamar) {
      // PRIMERO LO QUE YA SE SABE. Un proveedor que manda siempre la misma
      // planilla se reconoce por el encabezado, y sus columnas no se vuelven a
      // adivinar. El formato guarda `col_precio`, que acá se llama
      // `col_unitario`: es la misma columna con otro nombre.
      const recordado = buscarFormato(filas, formatos);
      let mapa = recordado
        ? { ...recordado.mapa, col_unitario: recordado.mapa.col_precio ?? null }
        : columnasDeHoja(filas);
      if (mapa) {
        // CON QUÉ CONVENCIÓN DE MILES ESTÁ ESCRITA, y después LA ARITMÉTICA
        // CORRIGE EL MAPA: un título que miente, o un unitario que el
        // encabezado no nombró, se resuelven porque cantidad × precio = total
        // en una sola combinación de columnas.
        const miles = milesDelDocumento(filas);
        const ajuste = mapeoQueCuadra(filas, mapa, { clavePrecio: "col_unitario", miles });
        mapa = ajuste.mapa;
        const solas = renglonesDeHoja(filas, mapa, { miles });
        if (solas.length) {
          items.push(...solas);
          // EL PIE ESTÁ EN LA MISMA HOJA. Sin él la aritmética no tiene contra
          // qué comprobar, y una planilla leída sin comprobar no es mejor que
          // una leída por el modelo: es la misma incertidumbre sin el aviso.
          const pie = pieDeHoja(filas, mapa, { miles });
          if (pie.subtotal != null) totales = { subtotal: pie.subtotal, iva: pie.iva, total: pie.total };
          if (pie.descuento) descuento = pie.descuento;
          hoja = { filas, mapa, miles, cambios: ajuste.cambios || [], iva: ajuste.iva || null,
            recordado: recordado ? { veces: recordado.formato?.veces || 1 } : null };
          onPaso?.(`${solas.length} renglones leídos de la planilla`
            + (recordado ? " · formato ya conocido" : "")
            + (ajuste.cambios?.length ? " · columnas corregidas por la aritmética" : ""));
        }
      }
    }

    const bloques = esHoja ? (items.length ? [] : partirHoja(texto, 60)) : [null];

    for (let i = 0; i < bloques.length; i++) {
      onPaso?.(bloques.length > 1 ? `parte ${i + 1} de ${bloques.length}` : "");
      // SI EL PAPEL ES LARGO, SE SIGUE DONDE SE CORTÓ: cada parte entra en su
      // techo de escritura y en su minuto, y se lee hasta el final.
      const cola = reclamar ? `\n\n${reclamar}` : "";
      const leido = await leerSinCortes({
        pedir, onPaso,
        cuerpoPara: sigue => ({
          model: modelo, max_tokens: 3000, system: sistema,
          messages: [{
            role: "user",
            content: esHoja
              ? [{ type: "text", text: `Esta es una planilla de Excel volcada tal cual, una fila por renglón y las celdas separadas por |. Encontrá la columna de descripción, la de cantidad, la de unidad y la del total de cada renglón. Ignorá encabezados, subtotales y totales generales.\n\n${bloques[i]}\n\nExtrae los renglones.${sigue ? `\n\n${sigue}` : ""}${cola}` }]
              : [
                esPdf
                  ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
                  : { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } },
                { type: "text", text: `Extrae los renglones de esta proforma.${sigue ? `\n\n${sigue}` : ""}${cola}` },
              ],
          }],
        }),
      });
      if (leido.cortado) cortado = true;
      if (leido.proveedor && !proveedor) proveedor = leido.proveedor;
      if (leido.iva && !iva) iva = leido.iva;
      if (leido.totales && !totales) totales = leido.totales;
      if (leido.descuento && !descuento) descuento = leido.descuento;
      items.push(...leido.items);
    }
    // El proveedor de una planilla leída sola: la primera línea que lo nombre.
    if (esHoja && !proveedor && items.length) {
      for (const l of filas.slice(0, 20)) {
        const m = /(?:contratista|proveedor|empresa|raz[oó]n social)\s*[:|]\s*(.+)/i.exec(l.join(" "));
        if (m) { proveedor = m[1].split("|")[0].trim().slice(0, 60); break; }
      }
    }

    // EL PIE, PREGUNTADO APARTE. Ver arriba: dentro de la transcripción es la
    // pregunta que se cae, y sin el subtotal tampoco se puede deducir el
    // descuento por resta.
    if (!esHoja && (!totales?.subtotal || !descuento)) {
      try {
        onPaso?.("leyendo el pie del papel");
        const { texto } = await pedir({
          model: modelo, max_tokens: 200, system: PROMPT_PIE,
          messages: [{ role: "user", content: [
            esPdf
              ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
              : { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } },
            { type: "text", text: "El pie de esta proforma." },
          ] }],
        });
        const pie = pieDeTexto(texto);
        if (pie.fecha) fecha = pie.fecha;
        if (pie.descuento && !descuento) descuento = Math.abs(pie.descuento);
        if (pie.subtotal != null && !totales?.subtotal) {
          totales = { ...(totales || {}), subtotal: pie.subtotal, iva: pie.iva ?? null, total: pie.total ?? null };
        }
      } catch {
        // Sin el pie se sigue: lo que no se puede es inventarlo.
      }
    }

    // EL DESCUENTO TAMBIÉN SE DEDUCE DE LA ARITMÉTICA, no solo de que NOVA lo
    // diga. En una proforma lo dijo y en la siguiente, el mismo papel, no: los
    // renglones sumaban mil dólares más que el subtotal del pie y eso se
    // denunciaba como "se leyó de más", cuando lo que pasa es exactamente lo que
    // dice el papel —hay un descuento abajo—.
    //
    // Si los renglones suman MÁS que el subtotal, esa diferencia es el descuento.
    // Es la lectura honesta de un papel cuyo pie vale menos que sus renglones, y
    // además convierte una alarma en un dato: antes había que creerle al modelo,
    // ahora se comprueba con una resta.
    if (!descuento && totales?.subtotal != null) {
      const suma = items.reduce((t, x) => t + (Number(x.monto) || 0), 0);
      const sobra = Math.round((suma - Number(totales.subtotal)) * 100) / 100;
      if (sobra > Math.max(0.05, items.length * 0.01)) descuento = sobra;
    }

    // LO QUE FIGURA EN CERO NO SE ESTÁ COTIZANDO, y no entra a comparar: un
    // renglón sin cantidad contra un rubro con sesenta se leería como sesenta
    // de menos.
    const cotizados = items.filter(x => (Number(x.cantidad) || 0) !== 0 || (Number(x.monto) || 0) !== 0);
    return { items: cotizados, proveedor, cortado, iva, totales, descuento, fecha, hoja };
  }

  const leido = await leerHastaQueCuadre({ leer: unaLectura, vueltas, onPaso });
  const { items, proveedor, cortado, iva, totales, descuento, fecha, hoja = null } = leido;

  // EL DESCUENTO VIAJA ENTERO Y APARTE, no repartido entre los renglones.
  //
  // Repartirlo deja cada renglón diciendo un precio que no figura en ningún
  // papel, y el descuento —que es lo que hay que ACORDARSE DE PEDIR cuando
  // llegue la factura— desaparece disuelto en cincuenta centavos por acá y
  // treinta por allá. Es un trato con el proveedor, y los tratos se miran
  // enteros: va a Beneficios como lo que es, una rebaja ofrecida sobre el
  // total, con su monto a la vista.
  // ── Y RECIÉN AHORA, EL EMPAREJAMIENTO ────────────────────────────────────
  //
  // En un pedido aparte, con los renglones ya transcriptos y numerados. NOVA ve
  // la lista de rubros por primera vez cuando ya no tiene el papel adelante,
  // así que no hay nada que copiar: lo único que puede hacer con la lista es
  // elegir un número o poner un guion.
  //
  // Cuesta un pedido más y son cinco tokens de respuesta por renglón. La otra
  // forma salía gratis y escribía los textos del presupuesto adentro de la
  // proforma del proveedor.
  // PRIMERO LO QUE NO NECESITA QUE NADIE OPINE: el mismo texto y una unidad que
  // no se contradice. Dos cadenas iguales son dos cadenas iguales, siempre, y
  // en esta obra —cuyo presupuesto se armó con una cotización vieja del mismo
  // proveedor— eso cubre buena parte de la proforma.
  let ciertos = 0;
  if (rubros.length && items.length) {
    const porTexto = emparejarPorTexto(items, rubros);
    porTexto.items.forEach((x, i) => { items[i] = x; });
    // Y el mismo trabajo dicho con una palabra más, que es la mayoría: el
    // proveedor agrega "EMT 1/2" donde el presupuesto corta. Por una cola de
    // tres palabras quedaban sin emparejar renglones de tres mil dólares.
    const porParecido = emparejarPorParecido(items, rubros);
    porParecido.items.forEach((x, i) => { items[i] = x; });
    ciertos = porTexto.ciertos + porParecido.ciertos;
  }

  // Y LO QUE QUEDA SE PREGUNTA CONTRA CINCO CANDIDATOS, no contra la lista
  // entera: elegir entre cinco parecidos es un problema mucho más chico que
  // recordar ciento setenta rubros, y el que no tiene ningún candidato no se
  // pregunta —preguntarlo sería darle la oportunidad de inventar uno—.
  if (rubros.length && items.length) {
    const pedido = pedidoDeEmparejamiento(items, rubros);
    if (pedido.indices.length) {
      onPaso?.("emparejando con el presupuesto");
      try {
        const { texto } = await pedir({
          model: modelo, max_tokens: 1500, system: PROMPT_RUBROS,
          messages: [{ role: "user", content: [{ type: "text", text: pedido.texto }] }],
        });
        const mapa = asignacionDeTexto(texto);
        const validos = new Set(rubros.map(r => Number(r.id)));
        pedido.indices.forEach((indice, k) => {
          const id = mapa.get(k + 1);
          // Un id que no está en la lista es una invención: se descarta.
          items[indice].rubro_id = id && validos.has(Number(id)) ? Number(id) : null;
        });
      } catch {
        // Sin emparejar también sirve: los renglones quedan para asignarlos a
        // mano, que es mejor que no poder leer la proforma.
      }
    }
  }

  // LA ARITMÉTICA DEL PAPEL, SIEMPRE Y PARA TODOS LOS FORMATOS. Venga como
  // venga la proforma, los cuatro datos de cada renglón se comprueban solos.
  // La revisión es la que ya hizo el lazo sobre esta misma lectura: la que
  // decidió que esta era la mejor de las vueltas. Volver a calcularla daría lo
  // mismo, y así queda claro que es UNA sola comprobación, no dos criterios.
  const { revision, quedo, cerro, vuelta, vueltas: topeDeVueltas, historia } = leido;

  return { proveedor, items, cortado, iva, totales, descuento, fecha, revision, hoja,
    // Cómo quedó la lectura y cuánto costó llegar: `cerro` dice si pasó la
    // comprobación contra el pie del papel, `vuelta` en cuál de las vueltas, e
    // `historia` qué se le reclamó en cada una. Si `cerro` es false la lectura
    // no se guarda sola: va a la pantalla con la diferencia a la vista.
    quedo, cerro, vuelta, vueltas: topeDeVueltas, historia,
    // Cuántos salieron de comparar textos —esos no pueden estar mal— y cuántos
    // los eligió el modelo, que son los que hay que mirar.
    ciertos, propuestos: items.filter(x => x.rubro_id && !x.porTexto).length,
    cuadre: cuadrar(items, totales, descuento) };
}




