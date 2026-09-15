// Lectura de un presupuesto de obra desde las filas de un Excel.
//
// NOVA solo dice qué columna es cuál; el recorrido de filas es de este archivo,
// sin IA, para que los números no dependan de una transcripción. Está separado
// del componente para poder probarlo contra presupuestos reales.
//
// Lo que hay que distinguir en cada fila, y por qué cuesta:
//   · Rubro: tiene cantidad y precio. O es un global: tiene unidad y total.
//   · Título de capítulo: sin cantidad, sin precio y sin unidad. A veces trae su
//     subtotal al lado y a veces no; por eso el monto no sirve para reconocerlo.
//   · Subtotal de capítulo o general, total, IVA: se reconocen por el texto en
//     cualquier celda, porque muchas planillas lo escriben fuera de la columna
//     de descripción.
//   · Cargos (honorarios, administración, imprevistos): filas con monto después
//     del último rubro. Se leen aparte porque son parte del total del Excel pero
//     no tienen cantidad ni precio.
//   · Detalle sin monto (el despiece de ventanas V1, V2…): tiene unidad pero
//     ningún número. Como rubro sería un $0 que nunca avanza.

const texto = v => String(v ?? "").trim();
const esCodigo = s => /^\d+(\.\d+)*\.?$/.test(texto(s));
// "8", "8.", "8.00": código de capítulo. "8.01" es de rubro.
const esCodigoCapitulo = s => /^\d+(\.0+)?\.?$/.test(texto(s));
// Una unidad es corta: m², ml, u, glb, meses. Un texto largo en esa columna
// ("Honorarios de Construcción") no es una unidad.
const unidadValida = u => !!u && u.length <= 10;
// El número de capítulo de un código: "8.17" → "8".
const prefijo = c => (texto(c).match(/^(\d+)/) || [])[1] || null;

// Números que llegan como texto: "1.234,56" o "1,234.56". El último separador
// es el decimal. Las celdas numéricas de Excel pasan tal cual.
export function num(v) {
  if (typeof v === "number") return v;
  const limpio = texto(v).replace(/[^0-9,.-]/g, "");
  if (!limpio) return 0;
  const coma = limpio.lastIndexOf(","), punto = limpio.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    const dec = Math.max(coma, punto);
    return Number(limpio.slice(0, dec).replace(/[.,]/g, "") + "." + limpio.slice(dec + 1)) || 0;
  }
  if (coma >= 0) return Number(limpio.replace(",", ".")) || 0;
  return Number(limpio) || 0;
}

export const MAPA_PROMPT = `Estas son las primeras filas de un presupuesto de construcción en Excel.
Identifica la estructura. Devuelve SOLO JSON, sin markdown:
{"fila_encabezado":0,"col_item":null,"col_descripcion":0,"col_unidad":0,"col_cantidad":0,"col_precio":0,"col_total":0,"col_capitulo":null,"precios_incluyen_iva":null,"nombre":"","cliente":""}
Las columnas son índices desde 0 según el orden en que aparecen, contando las vacías.
"fila_encabezado": la fila con los títulos de columna.
"col_item": la columna con la numeración o código de cada rubro (1.1, 2.03, A-12). Null si no hay.
"col_total": el importe total de cada rubro, no el precio unitario.
"col_precio": el precio unitario. Si hay dos, uno sin IVA y otro con IVA, usa el sin IVA.
"col_capitulo": SOLO si hay una columna que repite el NOMBRE del capítulo en cada fila. Una
columna de numeración NO es de capítulo, esa es "col_item". Casi siempre es null, porque el
capítulo viene como una fila de título.
"precios_incluyen_iva": true o false solo si el archivo lo dice (por ejemplo "PU S/IVA" o
"con IVA"); si no, null.
Si una columna no existe, ponla en null.`;

// NOVA a veces toma la columna de códigos por la de capítulo, y entonces cada
// rubro termina siendo su propio capítulo. Si la columna "de capítulo" tiene
// códigos, o un valor distinto casi en cada fila, no es de capítulo.
export function sanearMapa(filas, mapa) {
  const m = { ...mapa };
  if (m.col_capitulo == null) return m;
  const desde = (m.fila_encabezado ?? 0) + 1;
  const vals = filas.slice(desde, desde + 120).map(f => texto(f[m.col_capitulo])).filter(Boolean);
  const pareceCodigos = vals.length && vals.filter(esCodigo).length / vals.length > 0.5;
  const unoPorFila = vals.length > 5 && new Set(vals).size / vals.length > 0.6;
  if (m.col_capitulo === m.col_item || pareceCodigos || unoPorFila) {
    if (m.col_item == null) m.col_item = m.col_capitulo;
    m.col_capitulo = null;
  }
  return m;
}

export function interpretarPresupuesto(filasTodas, mapaNova) {
  const m = sanearMapa(filasTodas, mapaNova);
  const val = (f, c) => (c == null ? "" : f[c]);
  const inicio = (m.fila_encabezado ?? 0) + 1;

  const leidas = filasTodas.slice(inicio).map((f, k) => {
    let desc = texto(val(f, m.col_descripcion));
    // Muchas planillas escriben "SUBTOTAL" u "Honorarios" fuera de la columna
    // de descripción: se toma el primer texto de la fila.
    if (!desc) desc = f.map(texto).find(t => t && isNaN(Number(t)) && !esCodigo(t)) || "";
    return {
      fila: inicio + k, desc,
      codigo: texto(val(f, m.col_item)),
      unidad: unidadValida(texto(val(f, m.col_unidad))) ? texto(val(f, m.col_unidad)) : "",
      // Distingue "total en 0" de "celda de total vacía": una fila con cantidad
      // y precio pero sin total es una línea que el propio Excel no suma.
      totalVacio: m.col_total != null && texto(val(f, m.col_total)) === "",
      cant: num(val(f, m.col_cantidad)),
      precio: num(val(f, m.col_precio)),
      total: num(val(f, m.col_total)),
      capCol: m.col_capitulo != null ? texto(val(f, m.col_capitulo)) : "",
      linea: f.map(texto).filter(Boolean).join(" "),
    };
  });

  const esRubro = r => r.cant && r.precio && !r.totalVacio;
  const esSubtotal = r => /sub\s*-?\s*total/i.test(r.linea);
  const esTotal = r => !esSubtotal(r) && /\btotal\b/i.test(r.linea) && !r.unidad;
  const esIva = r => /\biva\b/i.test(r.linea) && !r.cant && !r.unidad;
  const ultimoRubro = leidas.reduce((u, r, k) => (esRubro(r) || (r.unidad && r.total) ? k : u), -1);

  // ¿Un título sin código entero es un capítulo nuevo o un subtítulo? No se
  // puede confiar en su numeración: hay Excel que titulan "11.10 INSTALACIONES
  // HIDRAULICAS" o no numeran el capítulo. Lo que sí es confiable es el código
  // del primer rubro que viene debajo: si sigue en el mismo número de capítulo
  // ("LAMPARAS" → 8.17, dentro del 8), es un subtítulo; si cambia, o no hay
  // forma de saberlo, es un capítulo nuevo.
  const siguientePrefijo = k => {
    for (let j = k + 1; j < leidas.length; j++) {
      const x = leidas[j];
      if ((x.cant && x.precio && !x.totalVacio) || (x.unidad && x.total)) return prefijo(x.codigo);
      // Si llega el subtotal antes que cualquier rubro, el título no tenía rubros
      // propios: es un subtítulo del capítulo que ese subtotal cierra.
      if (esSubtotal(x)) return "mismo";
      if (esCodigoCapitulo(x.codigo) && x.desc && !x.cant && !x.precio && !x.unidad) return null;
    }
    return null;
  };

  const rubros = [], omitidas = [], cargos = [], capitulos = [];
  let cap = null, subtotalExcel = null, totalExcel = null, ivaExcel = null;
  const abrir = (nombre, codigo, declarado, pref = null) => {
    cap = { nombre, codigo, declarado: declarado || null, prefijo: esCodigoCapitulo(codigo) ? prefijo(codigo) : pref };
    capitulos.push(cap);
  };
  const rubro = (r, cantidad, precio, total) => {
    if (cap && !cap.prefijo) cap.prefijo = prefijo(r.codigo);
    return rubros.push({
    capitulo: cap?.nombre || "SIN CAPÍTULO", codigo: r.codigo, descripcion: r.desc,
    unidad: r.unidad, cantidad, precio_unitario: precio, total, fila: r.fila,
    });
  };

  leidas.forEach((r, k) => {
    if (!r.desc && !r.total) return;
    if (r.capCol && cap?.nombre !== r.capCol.toUpperCase()) abrir(r.capCol.toUpperCase(), "", null);

    if (esRubro(r)) return rubro(r, r.cant, r.precio, m.col_total != null ? r.total : r.cant * r.precio);
    if (r.cant && r.precio && r.totalVacio) return omitidas.push(r.desc);

    if (esSubtotal(r)) {
      if (k > ultimoRubro || /general/i.test(r.linea)) { if (r.total) subtotalExcel = r.total; }
      else if (cap && cap.declarado == null) cap.declarado = r.total || null;
      return;
    }
    if (esTotal(r)) { if (r.total) totalExcel = r.total; return; }
    if (esIva(r)) {
      if (r.total) {
        const pct = (r.linea.match(/(\d+(?:[.,]\d+)?)\s*%/) || [])[1];
        ivaExcel = { total: r.total, pct: pct ? num(pct) : null };
      }
      return;
    }
    if (k > ultimoRubro) { if (r.total) cargos.push({ descripcion: r.desc, total: r.total, fila: r.fila }); return; }

    // Un global sin desglose: tiene unidad y total pero le falta cantidad o precio.
    if (r.unidad && r.total) {
      const cantidad = r.cant || 1;
      return rubro(r, cantidad, r.precio || r.total / cantidad, r.total);
    }
    if (r.unidad) return omitidas.push(r.desc);
    if (m.col_capitulo == null && r.desc && r.desc.length <= 120) {
      if (esCodigoCapitulo(r.codigo)) return abrir(r.desc.toUpperCase(), r.codigo, r.total);
      const p = siguientePrefijo(k);
      if (cap && (p === "mismo" || (cap.prefijo && p && p === cap.prefijo))) return;   // subtítulo o nota dentro del capítulo
      return abrir(r.desc.toUpperCase(), r.codigo, r.total, p);
    }
    if (r.desc) omitidas.push(r.desc);
  });

  const suma = a => a.reduce((s, x) => s + x.total, 0);
  const sumaRubros = suma(rubros), sumaCargos = suma(cargos);
  const porCap = {};
  rubros.forEach(x => { porCap[x.capitulo] = (porCap[x.capitulo] || 0) + x.total; });
  const conRubros = capitulos.filter(c => porCap[c.nombre] != null);
  const descuadres = conRubros
    .filter(c => c.declarado != null && Math.abs((porCap[c.nombre] || 0) - c.declarado) > 1)
    .map(c => ({ capitulo: c.nombre, excel: c.declarado, importado: porCap[c.nombre] || 0 }));

  return {
    mapa: m, rubros, omitidas, cargos, capitulos: capitulos.filter(c => porCap[c.nombre] != null),
    subtotalExcel, totalExcel, ivaExcel, sumaRubros, sumaCargos, descuadres,
    preciosIncluyenIva: typeof mapaNova.precios_incluyen_iva === "boolean" ? mapaNova.precios_incluyen_iva : null,
  };
}
