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
export const FORMATO = "cantidad | unidad | descripción | precio unitario | IVA %";

export const PROMPT_ITEMS = [
  "Sos un asistente que lee facturas de compra de Ecuador para una constructora.",
  "Devolvé UNA LÍNEA POR ÍTEM del detalle de la factura, con este formato exacto:",
  FORMATO,
  "Sin encabezados, sin markdown, sin numerar, sin texto antes ni después.",
  "La descripción va tal como está impresa, sin abreviar y sin traducir.",
  "La cantidad y el precio van con punto decimal y sin símbolo de moneda.",
  "Si la unidad no está impresa, poné u.",
  "NO incluyas subtotales, descuentos, IVA ni el total: solo lo que se compró.",
  "El precio unitario va SIN IVA, como está impreso en el detalle.",
  "IVA % es la tarifa de ESE renglón: 0, 5 o 15. Las facturas la marcan junto al ítem",
  "o separan los subtotales por tarifa. Si no se puede saber, dejalo vacío: vacío es mejor que adivinar.",
  "Si la factura no se puede leer, devolvé exactamente: ILEGIBLE",
].join("\n");

/**
 * Un número como viene en la respuesta.
 *
 * EL PUNTO SOLO ES DECIMAL. Las facturas de Ecuador traen cantidades y precios
 * con tres y cuatro decimales —16.062 galones de diésel a 2.7070— y leer
 * "16.062" como dieciséis mil es lo que convirtió cincuenta dólares de diésel
 * en cuarenta y tres mil. A NOVA se le pide punto decimal; el punto se toma
 * como miles solo si hay más de uno (1.234.567) o si después viene una coma
 * (1.234,56).
 */
export const numero = t => {
  let s = String(t || "").replace(/[^\d.,-]/g, "");
  const punto = s.lastIndexOf("."), coma = s.lastIndexOf(",");
  if (punto >= 0 && coma >= 0) {
    const [miles, dec] = punto > coma ? [",", "."] : [".", ","];
    s = s.split(miles).join("").replace(dec, ".");
  } else if (coma >= 0) {
    s = (s.match(/,/g).length > 1) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

/** 0, 5 o 15. Cualquier otra cosa es que no se sabe. */
export const tasaDe = t => {
  if (t == null || String(t).trim() === "") return null;
  const v = numero(t);
  return [0, 5, 15].includes(v) ? v : null;
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
      iva_tasa: tasaDe(p[4]),
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

/**
 * Los renglones que ya leyó la pantalla de la factura, en el formato de acá.
 *
 * Al cargar una factura NOVA ya saca los renglones para repartirla entre
 * rubros: vienen con `monto` (lo que suma el renglón) y no con precio
 * unitario. Volver a mandarle el PDF solo para pedir otro formato sería pagar
 * dos veces por la misma lectura.
 */
export function desdeLecturaDeFactura(items = []) {
  return items
    .map(x => ({
      cantidad: Number(x.cantidad) || 0,
      unidad: String(x.unidad || "u").trim().toLowerCase().slice(0, 12) || "u",
      descripcion: String(x.descripcion || "").trim(),
      total: r2(Number(x.monto ?? x.total) || 0),
      iva_tasa: tasaDe(x.iva),
    }))
    .filter(x => x.descripcion && (x.cantidad || x.total))
    .map(x => ({ ...x, precio_unitario: x.cantidad ? Math.round((x.total / x.cantidad) * 10000) / 10000 : null }));
}

/**
 * Las filas que se guardan, con el signo de la factura.
 *
 * Una nota de crédito que devuelve dos cascos tiene que RESTAR dos cascos. La
 * factura ya está guardada en negativo, así que el signo sale de su total y no
 * de lo que diga el papel, que siempre imprime positivo.
 */
export function filasDeRenglones(factura, items = []) {
  const signo = (Number(factura?.total) || 0) < 0 ? -1 : 1;
  return items
    .filter(i => String(i.descripcion || "").trim())
    .map((i, k) => ({
      factura_id: factura.id,
      obra_id: factura.obra_id,
      orden: k,
      cantidad: signo * Math.abs(Number(i.cantidad) || 0),
      unidad: i.unidad || "u",
      descripcion: String(i.descripcion).trim().slice(0, 200),
      precio_unitario: i.precio_unitario == null ? null : Math.abs(Number(i.precio_unitario) || 0),
      total: r2(signo * Math.abs(Number(i.total) || 0)),
      iva_tasa: i.iva_tasa ?? null,
      clave: claveDe(i.descripcion),
      familia: familiaDe(i.descripcion),
    }));
}

/**
 * Las facturas que faltan leer.
 *
 * Fuera las que no tienen papel (no hay nada que leer), las ya leídas, las que
 * NOVA no pudo leer (reintentarlas solas es pagar cada vez por la misma
 * respuesta) y los ANTICIPOS: un anticipo es plata adelantada, no una compra.
 * Lo que se compró viene en la factura que lo liquida, y contar los dos
 * duplicaría los cascos.
 */
export function facturasPorLeer(facturas = []) {
  return facturas.filter(f => f.archivo_url && !f.renglones_estado && f.clase !== "anticipo");
}

/**
 * ¿Los renglones pueden ser de esta factura?
 *
 * Los renglones van sin IVA y sin descuentos, así que pueden sumar algo menos
 * o algo más que el total. Lo que no pueden es sumar el doble: eso es una
 * lectura equivocada, y un renglón de cuarenta mil dólares en una factura de
 * cincuenta arruina la suma de toda la obra. Esas no entran a la cuenta.
 */
export function cuadraConLaFactura(factura, items = []) {
  const total = Math.abs(Number(factura?.total) || 0);
  if (!total) return true;
  const suma = items.reduce((t, i) => t + Math.abs(Number(i.total) || 0), 0);
  return suma <= total * 1.5 + 1;
}

// LA DOTACIÓN: lo que se le da a cada persona y no se gasta en una semana.
//
// Un casco por persona, un chaleco, un par de botas. Guantes y mascarillas no
// están: se gastan, y diez trabajadores usan cien pares de guantes sin que
// nadie se lleve nada. Compararlos contra la gente daría una alerta cada
// semana, y a la tercera nadie la lee.
//
// Las claves son la familia como la arma familiaDe: minúscula, sin tilde.
export const DOTACION = {
  casco:   { nombre: "Cascos",   porPersona: 1 },
  chaleco: { nombre: "Chalecos", porPersona: 1 },
  botas:   { nombre: "Botas",    porPersona: 1 },
  bota:    { nombre: "Botas",    porPersona: 1 },
  arnes:   { nombre: "Arneses",  porPersona: 1 },
  overol:  { nombre: "Overoles", porPersona: 2 },
  gafas:   { nombre: "Gafas",    porPersona: 2 },
  lentes:  { nombre: "Gafas",    porPersona: 2 },
};

/**
 * La dotación comprada contra la gente que pasó por la obra.
 *
 * Se cuenta a TODOS los que pasaron, no solo a los de hoy: el que se fue en
 * marzo se llevó su casco, y comparar contra los ocho que quedan haría parecer
 * de más algo que se entregó bien.
 *
 * `de_mas` es lo que pasa de una por persona. No es un robo: puede ser
 * reposición o gente de un subcontratista que no está en la nómina. Es la
 * pregunta que hay que hacer, no la respuesta.
 */
export function dotacionContraPersonal(grupos = [], personas = 0) {
  const porNombre = new Map();
  for (const g of grupos) {
    const regla = DOTACION[g.familia];
    if (!regla) continue;
    const ya = porNombre.get(regla.nombre) || { nombre: regla.nombre, porPersona: regla.porPersona, cantidad: 0, total: 0, familias: [] };
    ya.cantidad += g.cantidad;
    ya.total += g.total;
    ya.familias.push(g.familia);
    porNombre.set(regla.nombre, ya);
  }
  return [...porNombre.values()].map(x => {
    const esperado = personas * x.porPersona;
    const cantidad = r2(x.cantidad);
    return {
      ...x, cantidad, total: r2(x.total), esperado,
      de_mas: personas ? Math.max(0, r2(cantidad - esperado)) : null,
    };
  }).sort((a, b) => (b.de_mas || 0) - (a.de_mas || 0) || b.cantidad - a.cantidad);
}

/**
 * Qué le pasa a esta factura con la bodega.
 *
 *   sin_papel  · no tiene archivo: no hay nada que leer
 *   ilegible   · NOVA no pudo sacar renglones
 *   no_cuadra  · se leyó, pero los renglones no dan su total
 *   por_leer   · tiene papel y todavía no se leyó
 *   leida      · está en la cuenta
 *   null       · no le corresponde (un anticipo no es una compra)
 */
export function estadoBodega(f) {
  if (!f || f.clase === "anticipo") return null;
  if (!f.archivo_url) return "sin_papel";
  if (f.renglones_estado === "ilegible") return "ilegible";
  if (f.renglones_estado === "no_cuadra") return "no_cuadra";
  if (f.renglones_estado === "leida") return "leida";
  return "por_leer";
}

/** Las que la bodega no pudo contar, con lo que hay que hacer en cada caso. */
export const PROBLEMAS_BODEGA = {
  sin_papel: { corto: "SIN ARCHIVO", titulo: "Sin archivo",
    hacer: "No tiene la foto ni el PDF: no se sabe qué se compró. Abrila y subí el papel." },
  ilegible: { corto: "NO SE LEYÓ", titulo: "No se pudieron leer",
    hacer: "NOVA no pudo sacar los renglones: un recibo a mano o una foto borrosa. Subí una foto mejor o volvé a intentar." },
  no_cuadra: { corto: "NO CUADRA", titulo: "No cuadran con su total",
    hacer: "Los renglones leídos no dan el total de la factura, así que quedaron fuera de la suma. Volvé a leerla o revisá el papel." },
};

/** La tarifa de la factura si tiene una sola; null si mezcla o no se sabe. */
export function tasaUnicaDe(f) {
  const con = [[0, f?.subtotal_0], [5, f?.subtotal_5], [15, f?.subtotal_15]]
    .filter(([, v]) => Math.abs(Number(v) || 0) > 0.009);
  return con.length === 1 ? con[0][0] : null;
}

/**
 * Los renglones con IVA, que es como los cuenta el control y lo que salió de
 * la caja.
 *
 * Cada renglón lleva SU tarifa: la que leyó NOVA, o la de la factura si tiene
 * una sola. Una factura que mezcla 15% y 0% no puede repartir el IVA en
 * proporción: le cargaría impuesto a lo que no lo pagó.
 *
 * Después se ajusta para que los renglones de cada factura sumen su total.
 * Eso absorbe los descuentos (NOVA no los pone como renglón), los redondeos y
 * la caja chica, que carga todo el monto como base 15%. El ajuste se aplica
 * solo si es chico: si la lectura se quedó corta —le faltan renglones— estirar
 * los que hay inflaría cada uno, y es mejor que la suma quede corta y se vea.
 *
 * `base` queda con el valor sin IVA.
 */
export function conIva(renglones = [], facturas = []) {
  const porId = new Map(facturas.map(f => [String(f.id), f]));
  const grupos = new Map();
  renglones.forEach(r => {
    const k = String(r.factura_id);
    (grupos.get(k) || grupos.set(k, []).get(k)).push(r);
  });
  const salida = [];
  for (const [id, rs] of grupos) {
    const f = porId.get(id);
    const unica = tasaUnicaDe(f);
    const brutos = rs.map(r => {
      const base = Number(r.total) || 0;
      const tasa = r.iva_tasa != null ? Number(r.iva_tasa) : unica;
      return tasa == null ? base : base * (1 + tasa / 100);
    });
    const suma = brutos.reduce((t, v) => t + v, 0);
    const totalF = Number(f?.total) || 0;
    const ajuste = suma && totalF ? totalF / suma : 1;
    const k = ajuste >= 0.8 && ajuste <= 1.25 ? ajuste : 1;
    rs.forEach((r, i) => salida.push({ ...r, base: Number(r.total) || 0, total: r2(brutos[i] * k) }));
  }
  return salida;
}
