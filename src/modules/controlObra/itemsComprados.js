// Qué se compró en la obra, sumado.
//
// Las facturas dicen cuánto se gastó; casi nunca dicen QUÉ se compró. La
// pregunta que aparece a mitad de obra —"¿cuántos cascos llevamos?", "¿otra
// vez cuerda?"— no se contesta mirando totales: hay que abrir sesenta PDFs y
// sumar a mano, así que no se contesta nunca. Y es la pregunta que destapa lo
// que se compró dos veces, lo que se está yendo de las manos y lo que
// desapareció de la obra.
//
// NOVA lee cada factura UNA vez y sus renglones quedan guardados. Acá está
// solo la cuenta: el formato que se le pide, cómo se lee lo que contesta y
// cómo se agrupan los renglones de treinta facturas en una lista que se lee de
// un vistazo.

/** Una línea por ítem. Pedirle JSON se cae con facturas largas: un corchete
 *  que falta tira toda la factura, y además es el triple de tokens. */
export const FORMATO = "cantidad | unidad | descripción | precio unitario";

export const PROMPT_ITEMS = [
  "Sos un asistente que lee facturas de compra de Ecuador para una constructora.",
  "Devolvé UNA LÍNEA POR ÍTEM del detalle de la factura, con este formato exacto:",
  FORMATO,
  "Sin encabezados, sin markdown, sin numerar, sin texto antes ni después.",
  "La descripción va tal como está impresa, sin abreviar y sin traducir.",
  "La cantidad y el precio van con punto decimal y sin símbolo de moneda.",
  "Si la unidad no está impresa, poné u.",
  "NO incluyas subtotales, descuentos, IVA ni el total: solo lo que se compró.",
  "Si la factura no se puede leer, devolvé exactamente: ILEGIBLE",
].join("\n");

const numero = t => {
  const limpio = String(t || "").replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Lo que contestó NOVA, a renglones.
 *
 * Se descartan las líneas que no tienen descripción o que no tienen ni
 * cantidad ni precio: una línea vacía inventa un ítem que nadie compró, y un
 * ítem inventado es peor que uno faltante —se discute con el proveedor por
 * algo que no pasó—.
 */
export function interpretarItems(texto) {
  if (!texto || /^\s*ILEGIBLE\s*$/i.test(texto)) return [];
  return String(texto).split("\n")
    .map(l => l.trim())
    .filter(l => l && l.includes("|"))
    .map(l => l.split("|").map(x => x.trim()))
    .filter(p => p.length >= 3)
    .map(p => ({
      cantidad: numero(p[0]),
      unidad: (p[1] || "u").toLowerCase().slice(0, 12),
      descripcion: p[2],
      precio_unitario: numero(p[3]),
    }))
    .filter(x => x.descripcion && (x.cantidad || x.precio_unitario))
    .map(x => ({ ...x, total: Math.round(x.cantidad * x.precio_unitario * 100) / 100 }));
}

const SIN_ACENTO = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
// Palabras que no distinguen un ítem de otro. "Casco tipo I" y "casco I" son
// el mismo casco, y si no se sacan quedan en dos renglones de uno.
const RELLENO = new Set(["de", "del", "la", "el", "los", "las", "para", "con", "sin", "por",
  "tipo", "marca", "color", "un", "una", "y", "o", "en", "a", "x", "mm", "cm", "ml", "unidad", "unidades"]);

/** Las palabras que de verdad nombran al ítem, en orden alfabético. */
export function palabrasDe(descripcion) {
  return SIN_ACENTO(String(descripcion || "").toLowerCase())
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(p => p && p.length > 1 && !RELLENO.has(p) && !/^\d+$/.test(p));
}

/**
 * La clave con la que dos renglones son el mismo ítem.
 *
 * Ordenada alfabéticamente, porque el mismo casco entra como "CASCO BLANCO" en
 * una factura y "BLANCO CASCO" —o con la marca adelante— en la siguiente, y
 * contarlos por separado es exactamente el error que esta pantalla viene a
 * evitar.
 */
export function claveDe(descripcion) {
  return [...palabrasDe(descripcion)].sort().join(" ");
}

/**
 * La familia: la primera palabra con peso del nombre.
 *
 * Un casco blanco y un casco amarillo son dos ítems distintos —y hay que poder
 * verlos distintos— pero la pregunta que uno se hace es cuántos CASCOS se
 * compraron. Se agrupa por familia y adentro quedan las variantes.
 */
export function familiaDe(descripcion) {
  const p = palabrasDe(descripcion);
  return p.find(x => x.length >= 4) || p[0] || "";
}

const r2 = v => Math.round(v * 100) / 100;

/**
 * Los renglones de todas las facturas, sumados por familia y por ítem.
 *
 * LAS UNIDADES NO SE MEZCLAN. Sumar 3 cajas y 40 unidades da 43 de nada, y un
 * número que no significa nada en una pantalla que se mira para decidir una
 * compra es peor que no tenerlo. Si vienen mezcladas se dice, y se suma lo que
 * sí se puede sumar: la plata.
 */
export function agrupar(items = []) {
  const porItem = new Map();
  for (const it of items) {
    const clave = claveDe(it.descripcion);
    if (!clave) continue;
    const ya = porItem.get(clave) || {
      clave, familia: familiaDe(it.descripcion), descripcion: it.descripcion,
      cantidad: 0, unidades: new Set(), total: 0, veces: 0, facturas: new Set(),
    };
    ya.cantidad += Number(it.cantidad) || 0;
    ya.total += Number(it.total) || 0;
    ya.unidades.add(it.unidad || "u");
    ya.veces += 1;
    if (it.factura_id != null) ya.facturas.add(String(it.factura_id));
    porItem.set(clave, ya);
  }

  const cerrar = x => ({
    clave: x.clave, familia: x.familia, descripcion: x.descripcion,
    cantidad: r2(x.cantidad), total: r2(x.total), veces: x.veces,
    facturas: x.facturas.size,
    unidad: x.unidades.size === 1 ? [...x.unidades][0] : "varias",
  });

  const porFamilia = new Map();
  for (const x of porItem.values()) {
    const fam = porFamilia.get(x.familia) || { familia: x.familia, variantes: [], unidades: new Set() };
    fam.variantes.push(cerrar(x));
    x.unidades.forEach(u => fam.unidades.add(u));
    porFamilia.set(x.familia, fam);
  }

  return [...porFamilia.values()].map(f => ({
    familia: f.familia,
    unidad: f.unidades.size === 1 ? [...f.unidades][0] : "varias",
    cantidad: r2(f.variantes.reduce((t, v) => t + v.cantidad, 0)),
    total: r2(f.variantes.reduce((t, v) => t + v.total, 0)),
    veces: f.variantes.reduce((t, v) => t + v.veces, 0),
    facturas: f.variantes.reduce((t, v) => t + v.facturas, 0),
    variantes: f.variantes.sort((a, b) => b.total - a.total),
  })).sort((a, b) => b.total - a.total);
}
