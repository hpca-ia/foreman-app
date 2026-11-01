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
descripción va corta y sin barras adentro.

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
        descripcion: String(x.descripcion || "").trim().slice(0, 90),
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
 * ¿LO QUE SE LEYÓ DA LO QUE DICE EL PAPEL?
 *
 * La única manera de saber si NOVA leyó bien sin volver a sumar la proforma a
 * mano. La suma de los renglones tiene que dar el SUBTOTAL —no el total, que
 * lleva el IVA—. Si no da, algo se leyó mal: un renglón de más, uno que quedó
 * afuera, o un monto con el impuesto adentro. Y eso hay que decirlo antes de
 * que el número se convierta en un margen.
 *
 * Se tolera un centavo por renglón: los redondeos del proveedor son suyos.
 *
 * @returns null si el papel no trae totales; si no, { cuadra, suma, subtotal,
 *   diferencia, parece }
 */
export function cuadrar(items = [], totales = null, descuento = 0) {
  if (!totales || totales.subtotal == null) return null;
  // Los renglones vienen a precio de lista y el subtotal del papel ya trae el
  // descuento restado: sin contarlo, toda proforma con descuento se denunciaba
  // como mal leída.
  const suma = Math.round((items.reduce((t, x) => t + (Number(x.monto) || 0), 0)
    - (Number(descuento) || 0)) * 100) / 100;
  const subtotal = Math.round((Number(totales.subtotal) || 0) * 100) / 100;
  const diferencia = Math.round((suma - subtotal) * 100) / 100;
  const tolerancia = Math.max(0.05, items.length * 0.01);
  const cuadra = Math.abs(diferencia) <= tolerancia;
  // Si lo leído da justo el TOTAL en vez del subtotal, lo que pasó se sabe: se
  // leyeron los montos con el IVA adentro.
  const total = totales.total == null ? null : Math.round(Number(totales.total) * 100) / 100;
  const parece = cuadra ? null
    : total != null && Math.abs(suma - total) <= tolerancia
      ? "los renglones se leyeron CON el IVA adentro: dan el total del papel y no el subtotal"
      : diferencia > 0 ? "se leyó de más: puede haber entrado un subtotal o un renglón repetido"
        : "quedó algo afuera: puede ser una hoja que no se leyó o un renglón sin precio";
  return { cuadra, suma, subtotal, total, diferencia, parece };
}

/**
 * Un archivo de cotización —PDF, foto o Excel— leído a renglones.
 *
 * @param pedir  función que habla con NOVA: (cuerpo) => { texto, cortado }
 * @returns { proveedor, items, cortado }
 */
export async function leerCotizacion(file, { pedir, lista = "", modelo, onPaso, hojaComoTexto } = {}) {
  const esHoja = /\.(xlsx|xlsm|xls)$/i.test(file?.name || "");
  const esPdf = file?.type === "application/pdf";
  const sistema = sistemaDeCotizacion();

  const b64 = esHoja ? null : await new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(",")[1]);
    fr.readAsDataURL(file);
  });

  const texto = esHoja && hojaComoTexto ? await hojaComoTexto(file) : null;
  const bloques = esHoja ? partirHoja(texto, 60) : [null];
  const items = [];
  let proveedor = "", cortado = false, iva = 0, totales = null, descuento = 0;

  for (let i = 0; i < bloques.length; i++) {
    onPaso?.(bloques.length > 1 ? `parte ${i + 1} de ${bloques.length}` : "");
    const { texto: salida, cortado: seCorto } = await pedir({
      model: modelo, max_tokens: 3000, system: sistema,
      messages: [{
        role: "user",
        content: esHoja
          ? [{ type: "text", text: `Esta es una planilla de Excel volcada tal cual, una fila por renglón y las celdas separadas por |. Encontrá la columna de descripción, la de cantidad, la de unidad y la del total de cada renglón. Ignorá encabezados, subtotales y totales generales.\n\n${bloques[i]}\n\nExtrae los renglones.` }]
          : [
            esPdf
              ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
              : { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } },
            { type: "text", text: "Extrae los renglones de esta proforma." },
          ],
      }],
    });
    const leido = interpretarRespuesta(salida);
    // Si se quedó sin espacio, la última línea quedó a medio escribir: un monto
    // cortado —"48" de "48,90"— entra como un renglón que parece bueno.
    if (seCorto) { leido.items.pop(); cortado = true; }
    if (leido.proveedor && !proveedor) proveedor = leido.proveedor;
    if (leido.iva && !iva) iva = leido.iva;
    if (leido.totales && !totales) totales = leido.totales;
    if (leido.descuento && !descuento) descuento = leido.descuento;
    items.push(...leido.items);
  }
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
  if (lista && items.length) {
    onPaso?.("emparejando con el presupuesto");
    const numerados = items.map((x, i) => `${i + 1}. ${x.descripcion} (${x.cantidad || ""} ${x.unidad || ""})`).join("\n");
    try {
      const { texto } = await pedir({
        model: modelo, max_tokens: 1500,
        system: `${PROMPT_RUBROS}\n\nRubros de la obra: ${lista}`,
        messages: [{ role: "user", content: [{ type: "text", text: numerados }] }],
      });
      const mapa = asignacionDeTexto(texto);
      items.forEach((x, i) => { x.rubro_id = mapa.get(i + 1) ?? null; });
    } catch {
      // Sin emparejar también sirve: los renglones quedan para asignarlos a
      // mano, que es mejor que no poder leer la proforma.
    }
  }

  return { proveedor, items, cortado, iva, totales, descuento,
    cuadre: cuadrar(items, totales, descuento) };
}

