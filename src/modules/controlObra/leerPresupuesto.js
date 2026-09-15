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
  const abrir = (nombre, codigo, declarado, pref = null, fila = null) => {
    cap = { nombre, codigo, declarado: declarado || null, prefijo: esCodigoCapitulo(codigo) ? prefijo(codigo) : pref, fila };
    capitulos.push(cap);
  };
  const rubro = (r, cantidad, precio, total, global = false) => {
    if (cap && !cap.prefijo) cap.prefijo = prefijo(r.codigo);
    return rubros.push({
    capitulo: cap?.nombre || "SIN CAPÍTULO", codigo: r.codigo, descripcion: r.desc,
    unidad: r.unidad, cantidad, precio_unitario: precio, total, fila: r.fila, global,
    });
  };

  leidas.forEach((r, k) => {
    if (!r.desc && !r.total) return;
    if (r.capCol && cap?.nombre !== r.capCol.toUpperCase()) abrir(r.capCol.toUpperCase(), "", null, null, r.fila);

    if (esRubro(r)) return rubro(r, r.cant, r.precio, m.col_total != null ? r.total : r.cant * r.precio);
    if (r.cant && r.precio && r.totalVacio) return omitidas.push({ descripcion: r.desc, codigo: r.codigo, fila: r.fila, motivo: "sin_total", cant: r.cant, precio: r.precio });

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
      return rubro(r, cantidad, r.precio || r.total / cantidad, r.total, true);
    }
    if (r.unidad) return omitidas.push({ descripcion: r.desc, codigo: r.codigo, fila: r.fila, motivo: "detalle" });
    if (m.col_capitulo == null && r.desc && r.desc.length <= 120) {
      if (esCodigoCapitulo(r.codigo)) return abrir(r.desc.toUpperCase(), r.codigo, r.total, null, r.fila);
      const p = siguientePrefijo(k);
      if (cap && (p === "mismo" || (cap.prefijo && p && p === cap.prefijo))) return;   // subtítulo o nota dentro del capítulo
      return abrir(r.desc.toUpperCase(), r.codigo, r.total, p, r.fila);
    }
    if (r.desc) omitidas.push({ descripcion: r.desc, codigo: r.codigo, fila: r.fila, motivo: "otra" });
  });

  const suma = a => a.reduce((s, x) => s + x.total, 0);
  const sumaRubros = suma(rubros), sumaCargos = suma(cargos);
  const porCap = {};
  rubros.forEach(x => { porCap[x.capitulo] = (porCap[x.capitulo] || 0) + x.total; });
  const conRubros = capitulos.filter(c => porCap[c.nombre] != null);
  const descuadres = conRubros
    .filter(c => c.declarado != null && Math.abs((porCap[c.nombre] || 0) - c.declarado) > 1)
    .map(c => ({ capitulo: c.nombre, excel: c.declarado, importado: porCap[c.nombre] || 0 }));

  const advertencias = revisar({ rubros, omitidas, cargos, capitulos: conRubros, subtotalExcel, totalExcel, ivaExcel, sumaRubros, sumaCargos, descuadres });

  return {
    mapa: m, rubros, omitidas, cargos, capitulos: conRubros,
    subtotalExcel, totalExcel, ivaExcel, sumaRubros, sumaCargos, descuadres, advertencias,
    preciosIncluyenIva: typeof mapaNova.precios_incluyen_iva === "boolean" ? mapaNova.precios_incluyen_iva : null,
  };
}

// ── Revisión del presupuesto ─────────────────────────────────────────────
// El presupuesto se importa tal cual dice el Excel. Esto no corrige nada:
// señala lo que el Excel trae mal —sumas que no dan, numeración que no
// corresponde, filas que el propio Excel no suma— con su número de fila, para
// que quien importa lo vea y decida. Son reglas y no IA a propósito: una suma
// está bien o está mal, no se interpreta.

const plata = v => (Math.round(v * 100) / 100).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moda = a => {
  const c = {};
  a.forEach(x => { c[x] = (c[x] || 0) + 1; });
  return Object.entries(c).sort((x, y) => y[1] - x[1])[0]?.[0] || null;
};
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export function revisar({ rubros, omitidas, cargos, capitulos, subtotalExcel, totalExcel, ivaExcel, sumaRubros, sumaCargos, descuadres }) {
  const adv = [];
  const add = (tipo, nivel, titulo, filas = []) => adv.push({ tipo, nivel, titulo, filas });
  const F = f => f + 1;   // Excel numera las filas desde 1
  const etiqueta = x => `${x.codigo ? x.codigo + " " : ""}${String(x.descripcion).slice(0, 55)}`;

  // Diferencias generales. Se calculan antes y se informan después de los
  // capítulos: si ya las explica un capítulo que no cuadra, no se repiten, que
  // sería el mismo error contado tres veces.
  const explicado = descuadres.reduce((t, d) => t + (d.importado - d.excel), 0);
  const difSub = subtotalExcel != null ? sumaRubros - subtotalExcel : null;
  const calculado = sumaRubros + sumaCargos + (ivaExcel?.total || 0);
  const difTot = totalExcel != null ? calculado - totalExcel : null;

  // Sumas por capítulo
  descuadres.forEach(d => {
    const c = capitulos.find(x => x.nombre === d.capitulo);
    add("suma_capitulo", "error",
      `El subtotal del capítulo "${d.capitulo}" dice $${plata(d.excel)}, pero sus rubros suman $${plata(d.importado)} (diferencia $${plata(d.importado - d.excel)}). Suele ser una fórmula que no incluye todas las filas.`,
      c?.fila != null ? [{ fila: F(c.fila), texto: d.capitulo }] : []);
  });

  const subExplicado = difSub != null && Math.abs(difSub) > 1 && descuadres.length && Math.abs(difSub - explicado) <= 1;
  if (difSub != null && Math.abs(difSub) > 1 && !subExplicado)
    add("suma_subtotal", "error", `Los rubros suman $${plata(sumaRubros)} y el SUBTOTAL del Excel dice $${plata(subtotalExcel)} (diferencia $${plata(difSub)}).`);
  const heredada = difSub != null ? difSub : explicado;
  const totExplicado = difTot != null && Math.abs(difTot) > 1 && Math.abs(difTot - heredada) <= 1 && Math.abs(heredada) > 1;
  if (difTot != null && Math.abs(difTot) > 1 && !totExplicado)
    add("suma_total", "error", `Rubros y cargos${ivaExcel ? " con IVA" : ""} suman $${plata(calculado)} y el TOTAL del Excel dice $${plata(totalExcel)} (diferencia $${plata(difTot)}).`);
  if (subExplicado || totExplicado) {
    const a = adv.find(x => x.tipo === "suma_capitulo");
    if (a) a.titulo += " Por esa misma diferencia tampoco cuadran el subtotal y el total del Excel.";
  }

  // Sumas por fila: cantidad × precio contra el total escrito
  const malas = rubros.filter(x => !x.global && x.cantidad && x.precio_unitario
    && Math.abs(x.total - x.cantidad * x.precio_unitario) > Math.max(0.02, Math.abs(x.total) * 0.0005));
  if (malas.length) add("suma_fila", "error",
    `${plural(malas.length, "fila", "filas")} donde cantidad × precio no da el total escrito. Se importa el total del Excel.`,
    malas.map(x => ({ fila: F(x.fila), texto: `${etiqueta(x)}: ${x.cantidad} × $${plata(x.precio_unitario)} = $${plata(x.cantidad * x.precio_unitario)}, el Excel dice $${plata(x.total)}` })));

  // Cargos con porcentaje que no coincide
  cargos.forEach(c => {
    const pct = (String(c.descripcion).match(/(\d+(?:[.,]\d+)?)\s*%/) || [])[1];
    if (!pct) return;
    const base = subtotalExcel ?? sumaRubros;
    const esperado = base * Number(pct.replace(",", ".")) / 100;
    if (Math.abs(esperado - c.total) > 1) add("cargo_porcentaje", "aviso",
      `"${c.descripcion}" dice ${pct} %, pero el monto es $${plata(c.total)}; el ${pct} % del subtotal serían $${plata(esperado)}.`,
      [{ fila: F(c.fila), texto: c.descripcion }]);
  });

  // Filas que el propio Excel no suma
  const sinTotal = omitidas.filter(o => o.motivo === "sin_total");
  if (sinTotal.length) add("fila_sin_total", "aviso",
    `${plural(sinTotal.length, "fila tiene", "filas tienen")} cantidad y precio pero la celda de total vacía: el Excel no las suma, así que no se importan.`,
    sinTotal.map(o => ({ fila: F(o.fila), texto: `${etiqueta(o)}: ${o.cant} × $${plata(o.precio)} = $${plata(o.cant * o.precio)}` })));

  // Numeración de capítulos
  const prefDe = {};
  capitulos.forEach(c => { prefDe[c.nombre] = moda(rubros.filter(x => x.capitulo === c.nombre).map(x => prefijo(x.codigo)).filter(Boolean)); });
  const numerados = capitulos.filter(c => esCodigo(c.codigo)).length;
  capitulos.forEach(c => {
    const pr = prefDe[c.nombre];
    const donde = c.fila != null ? [{ fila: F(c.fila), texto: c.nombre }] : [];
    if (esCodigo(c.codigo) && !esCodigoCapitulo(c.codigo))
      add("capitulo_numeracion", "aviso", `El capítulo "${c.nombre}" está numerado "${c.codigo}", que es un código de rubro${pr ? `; sus rubros son ${pr}.x` : ""}.`, donde);
    else if (esCodigoCapitulo(c.codigo) && pr && prefijo(c.codigo) !== pr)
      add("capitulo_numeracion", "aviso", `El capítulo "${c.nombre}" es el ${prefijo(c.codigo)}, pero sus rubros están numerados ${pr}.x.`, donde);
    else if (!esCodigo(c.codigo) && numerados >= capitulos.length / 2 && capitulos.length > 1)
      add("capitulo_numeracion", "aviso", `El capítulo "${c.nombre}" no tiene número${pr ? `; sus rubros son ${pr}.x` : ""}.`, donde);
  });

  // Numeración de rubros
  const fuera = rubros.filter(x => {
    const c = capitulos.find(k => k.nombre === x.capitulo);
    const pc = c && (esCodigoCapitulo(c.codigo) ? prefijo(c.codigo) : prefDe[c.nombre]);
    return pc && prefijo(x.codigo) && prefijo(x.codigo) !== pc;
  });
  if (fuera.length) add("rubro_codigo_fuera", "aviso",
    `${plural(fuera.length, "rubro tiene", "rubros tienen")} un código que no corresponde a su capítulo.`,
    fuera.map(x => ({ fila: F(x.fila), texto: `${etiqueta(x)} — está en "${x.capitulo}"` })));

  const porCodigo = {};
  rubros.forEach(x => { if (esCodigo(x.codigo)) (porCodigo[x.codigo] = porCodigo[x.codigo] || []).push(x); });
  const repetidos = Object.values(porCodigo).filter(a => a.length > 1);
  if (repetidos.length) add("codigo_repetido", "aviso",
    `${plural(repetidos.length, "código aparece", "códigos aparecen")} en más de un rubro.`,
    repetidos.flat().map(x => ({ fila: F(x.fila), texto: etiqueta(x) })));

  const sinCodigo = rubros.filter(x => !esCodigo(x.codigo));
  if (sinCodigo.length && sinCodigo.length <= rubros.length * 0.3) add("rubro_sin_codigo", "aviso",
    `${plural(sinCodigo.length, "rubro no tiene", "rubros no tienen")} código, cuando el resto sí.`,
    sinCodigo.map(x => ({ fila: F(x.fila), texto: `${String(x.descripcion).slice(0, 55)} — en "${x.capitulo}"` })));

  // Posibles duplicados
  const grupos = {};
  rubros.forEach(x => {
    const k = `${String(x.descripcion).toLowerCase().replace(/\s+/g, " ")}|${x.cantidad}|${x.precio_unitario}`;
    (grupos[k] = grupos[k] || []).push(x);
  });
  const dups = Object.values(grupos).filter(a => a.length > 1);
  if (dups.length) add("duplicado", "aviso",
    `${plural(dups.length, "rubro aparece", "rubros aparecen")} dos o más veces con la misma descripción, cantidad y precio. Puede ser a propósito; revísalo.`,
    dups.flat().map(x => ({ fila: F(x.fila), texto: `${etiqueta(x)} — $${plata(x.total)}` })));

  const sinCap = rubros.filter(x => x.capitulo === "SIN CAPÍTULO");
  if (sinCap.length && capitulos.length) add("sin_capitulo", "aviso",
    `${plural(sinCap.length, "rubro quedó", "rubros quedaron")} antes del primer capítulo.`,
    sinCap.map(x => ({ fila: F(x.fila), texto: etiqueta(x) })));

  return adv.sort((a, b) => (a.nivel === "error" ? 0 : 1) - (b.nivel === "error" ? 0 : 1));
}
