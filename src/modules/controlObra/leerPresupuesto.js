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
//   · Salvo en un presupuesto a medio trabajar (conPendientes): ahí una fila
//     con descripción y unidad pero sin precio es un rubro que todavía espera
//     su cotización, y descartarlo sería perder justo lo que falta completar.

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
{"fila_encabezado":0,"col_item":null,"col_descripcion":0,"col_unidad":0,"col_cantidad":0,"col_precio":0,"col_total":0,"col_capitulo":null,"precios_incluyen_iva":null,"nombre":"","cliente":"","emisor":""}
"nombre": el proyecto u obra. "cliente": a quién va dirigido. "emisor": la empresa que hizo el
documento (quien cotiza). Si no aparecen, déjalos vacíos; no inventes.
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

/**
 * ¿De qué columna sale el total de cada fila?
 *
 * Muchos presupuestos traen el precio unitario sin IVA, el IVA aparte y el
 * precio con IVA, y el TOTAL de la fila se calcula con el precio CON IVA. Si
 * se toma el precio sin IVA, cantidad × precio no da el total en ninguna fila
 * y todo lo que se recalcule después queda mal. Acá se mira qué columna
 * reproduce el total y, si no es la elegida, se dice con cuánto de recargo.
 */
export function precioQueCuadra(filasTodas, m) {
  if (m.col_cantidad == null || m.col_total == null || m.col_precio == null) return null;
  const inicio = (m.fila_encabezado ?? 0) + 1;
  const filas = filasTodas.slice(inicio)
    .map(f => ({ cant: num(f[m.col_cantidad]), total: num(f[m.col_total]), celdas: f }))
    .filter(x => x.cant > 0 && x.total > 0);
  if (filas.length < 5) return null;

  const cuantasCalzan = col => filas.filter(x => {
    const p = num(x.celdas[col]);
    return p > 0 && Math.abs(x.cant * p - x.total) <= Math.max(0.02, x.total * 0.0005);
  }).length;

  const columnas = Math.max(...filas.map(x => x.celdas.length));
  let mejor = { col: m.col_precio, calzan: cuantasCalzan(m.col_precio) };
  for (let c = 0; c < columnas; c++) {
    if (c === m.col_cantidad || c === m.col_total) continue;
    const calzan = cuantasCalzan(c);
    if (calzan > mejor.calzan) mejor = { col: c, calzan };
  }
  if (mejor.col === m.col_precio || mejor.calzan < filas.length * 0.6) return null;

  // Cuánto más caro es ese precio que el elegido: si da 15 %, el total lleva IVA.
  const recargos = filas
    .map(x => (num(x.celdas[m.col_precio]) > 0 ? num(x.celdas[mejor.col]) / num(x.celdas[m.col_precio]) - 1 : null))
    .filter(v => v != null && v > 0.001 && v < 1)
    .sort((a, b) => a - b);
  const medio = recargos.length ? recargos[Math.floor(recargos.length / 2)] : null;
  return { columna: mejor.col, filas: mejor.calzan, de: filas.length, pct: medio == null ? null : Math.round(medio * 1000) / 10 };
}

export function interpretarPresupuesto(filasTodas, mapaNova, { conPendientes = false } = {}) {
  const m = sanearMapa(filasTodas, mapaNova);
  m.ivaEnFilas = precioQueCuadra(filasTodas, m);
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
  // ¿Los códigos dicen a qué capítulo pertenece cada rubro ("8.17" → capítulo
  // 8), o el presupuesto numera los rubros de corrido (1, 2, 3… hasta el
  // final)? Con numeración corrida el código no dice nada del capítulo, y
  // usarlo para adivinar hacía que un capítulo nuevo se leyera como subtítulo
  // del anterior: sus rubros se le colgaban al capítulo equivocado.
  const codigosDeRubros = filasTodas.slice(inicio).map(f => texto(val(f, m.col_item))).filter(esCodigo);
  const usarPrefijos = codigosDeRubros.length > 0 && codigosDeRubros.filter(c => c.includes(".")).length / codigosDeRubros.length > 0.5;
  const esSubtotal = r => /sub\s*-?\s*total/i.test(r.linea);
  // "TOTALES GENERALES" es tan total como "TOTAL": sin la S se colaba como
  // un cargo suelto de varios millones.
  const esTotal = r => !esSubtotal(r) && /\btotal(es)?\b/i.test(r.linea) && !r.unidad;
  const esIva = r => /\biva\b/i.test(r.linea) && !r.cant && !r.unidad;
  // Rubro sin precio todavía: descripción y unidad, sin total y sin cantidad × precio.
  const esPendiente = r => conPendientes && !!r.desc && !!r.unidad && !r.total && !(r.cant && r.precio) && !esSubtotal(r) && !esIva(r);
  const ultimoRubro = leidas.reduce((u, r, k) => (esRubro(r) || (r.unidad && r.total) || esPendiente(r) ? k : u), -1);

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

  const rubros = [], omitidas = [], cargos = [], capitulos = [], subtotalesDeBloque = [];
  let cap = null, subtotalExcel = null, totalExcel = null, ivaExcel = null, bloque = null;
  const abrir = (nombre, codigo, declarado, pref = null, fila = null) => {
    // Un título que no llegó a tener rubros propios ni subtotal y ya viene
    // otro título encima no es un capítulo: es un bloque —"CASA DE SEGURIDAD",
    // "AMPLIACIÓN CABALLERIZAS"— que adentro repite los capítulos del
    // presupuesto principal (otra ESTRUCTURA, otra ALBAÑILERÍA). Sin esto los
    // dos se sumaban como si fueran el mismo capítulo.
    if (cap && !cap.rubros && cap.declarado == null && capitulos[capitulos.length - 1] === cap) {
      capitulos.pop();
      // "A" o "B" son rótulos de columna de una planilla de control, no una
      // sub-obra: solo un nombre de verdad abre bloque.
      if (cap.nombreSolo.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "").length >= 4) bloque = cap.nombreSolo;
    }
    const nombreSolo = nombre;
    cap = { nombre: bloque ? `${bloque} · ${nombre}` : nombre, nombreSolo, bloque, codigo,
      declarado: declarado || null, prefijo: esCodigoCapitulo(codigo) ? prefijo(codigo) : pref, fila, rubros: 0, suma: 0 };
    capitulos.push(cap);
  };
  const rubro = (r, cantidad, precio, total, global = false, pendiente = false) => {
    if (cap && !cap.prefijo) cap.prefijo = prefijo(r.codigo);
    if (cap) { cap.rubros++; cap.suma += total || 0; }
    return rubros.push({
    capitulo: cap?.nombre || "SIN CAPÍTULO", codigo: r.codigo, descripcion: r.desc,
    unidad: r.unidad, cantidad, precio_unitario: precio, total, fila: r.fila, global,
    ...(pendiente ? { pendiente: true } : {}),
    });
  };

  leidas.forEach((r, k) => {
    if (!r.desc && !r.total) return;
    if (r.capCol && cap?.nombre !== r.capCol.toUpperCase()) abrir(r.capCol.toUpperCase(), "", null, null, r.fila);

    if (esRubro(r)) return rubro(r, r.cant, r.precio, m.col_total != null ? r.total : r.cant * r.precio);
    if (r.cant && r.precio && r.totalVacio) return omitidas.push({ descripcion: r.desc, codigo: r.codigo, fila: r.fila, motivo: "sin_total", cant: r.cant, precio: r.precio, unidad: r.unidad, capitulo: cap?.nombre || "SIN CAPÍTULO" });

    if (esSubtotal(r)) {
      if (k > ultimoRubro || /general/i.test(r.linea)) { if (r.total) subtotalExcel = r.total; }
      // El subtotal de un bloque entero cae en medio del presupuesto y no es
      // el del capítulo que se está leyendo: si no se parece a lo que ese
      // capítulo lleva sumado, es de otra cosa y tomarlo por suyo inventaba
      // descuadres de millones.
      else if (cap && cap.declarado == null && cap.rubros && Math.abs(r.total - cap.suma) <= Math.max(1, cap.suma * 0.25)) cap.declarado = r.total || null;
      else if (r.total) subtotalesDeBloque.push({ descripcion: r.desc || texto(r.linea).slice(0, 60), total: r.total, fila: r.fila });
      return;
    }
    // Un total con nombre cierra su bloque: lo que viene después ya no es de
    // la casa de seguridad ni de las caballerizas.
    if (esTotal(r)) { if (r.total) totalExcel = r.total; bloque = null; return; }
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
    // Entra en $0, con la cantidad si ya la tiene y el precio si ya lo tiene.
    if (esPendiente(r)) return rubro(r, r.cant || 0, r.precio || 0, 0, false, true);
    if (r.unidad) return omitidas.push({ descripcion: r.desc, codigo: r.codigo, fila: r.fila, motivo: "detalle" });
    if (m.col_capitulo == null && r.desc && r.desc.length <= 120) {
      if (esCodigoCapitulo(r.codigo)) return abrir(r.desc.toUpperCase(), r.codigo, r.total, null, r.fila);
      const p = siguientePrefijo(k);
      if (cap && (p === "mismo" || (usarPrefijos && cap.prefijo && p && p === cap.prefijo))) return;   // subtítulo o nota dentro del capítulo
      return abrir(r.desc.toUpperCase(), r.codigo, r.total, p, r.fila);
    }
    if (r.desc) omitidas.push({ descripcion: r.desc, codigo: r.codigo, fila: r.fila, motivo: "otra" });
  });

  // "IMPREVISTOS OBRA CIVIL $54.494" en medio del presupuesto: título con
  // monto propio y sin rubros debajo. No es un capítulo vacío, es una línea
  // de plata; dejarla fuera abría un hueco del tamaño de su monto.
  capitulos.filter(c => !c.rubros && c.declarado).forEach(c =>
    cargos.push({ descripcion: c.nombreSolo, total: c.declarado, fila: c.fila, deCapitulo: true }));

  const suma = a => a.reduce((s, x) => s + x.total, 0);
  const sumaRubros = suma(rubros), sumaCargos = suma(cargos);
  const porCap = {};
  rubros.forEach(x => { porCap[x.capitulo] = (porCap[x.capitulo] || 0) + x.total; });
  const conRubros = capitulos.filter(c => porCap[c.nombre] != null);
  const descuadres = conRubros
    .filter(c => c.declarado != null && Math.abs((porCap[c.nombre] || 0) - c.declarado) > 1)
    .map(c => ({ capitulo: c.nombre, excel: c.declarado, importado: porCap[c.nombre] || 0 }));

  const advertencias = revisar({ rubros, omitidas, cargos, capitulos: conRubros, subtotalExcel, totalExcel, ivaExcel, sumaRubros, sumaCargos, descuadres, ivaEnFilas: m.ivaEnFilas, usarPrefijos });

  return {
    mapa: m, rubros, omitidas, cargos, capitulos: conRubros, subtotalesDeBloque, ivaEnFilas: m.ivaEnFilas || null,
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

export function revisar({ rubros, omitidas, cargos, capitulos, subtotalExcel, totalExcel, ivaExcel, sumaRubros, sumaCargos, descuadres, ivaEnFilas , usarPrefijos }) {
  const adv = [];
  // "datos" lleva lo necesario para corregir, si quien importa no acepta el error.
  const add = (tipo, nivel, titulo, filas = [], datos = null) => adv.push({ tipo, nivel, titulo, filas, datos });
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
      c?.fila != null ? [{ fila: F(c.fila), texto: d.capitulo }] : [],
      { capitulo: d.capitulo, excel: d.excel, importado: d.importado });
  });

  const subExplicado = difSub != null && Math.abs(difSub) > 1 && descuadres.length && Math.abs(difSub - explicado) <= 1;
  if (difSub != null && Math.abs(difSub) > 1 && !subExplicado)
    add("suma_subtotal", "error", `Los rubros suman $${plata(sumaRubros)} y el SUBTOTAL del Excel dice $${plata(subtotalExcel)} (diferencia $${plata(difSub)}).`, [],
      { excel: subtotalExcel, importado: sumaRubros });
  const heredada = difSub != null ? difSub : explicado;
  const totExplicado = difTot != null && Math.abs(difTot) > 1 && Math.abs(difTot - heredada) <= 1 && Math.abs(heredada) > 1;
  if (difTot != null && Math.abs(difTot) > 1 && !totExplicado)
    add("suma_total", "error", `Rubros y cargos${ivaExcel ? " con IVA" : ""} suman $${plata(calculado)} y el TOTAL del Excel dice $${plata(totalExcel)} (diferencia $${plata(difTot)}).`, [],
      { excel: totalExcel, importado: calculado, ivaPct: ivaExcel ? (ivaExcel.pct || 15) : null });
  if (subExplicado || totExplicado) {
    const a = adv.find(x => x.tipo === "suma_capitulo");
    if (a) a.titulo += " Por esa misma diferencia tampoco cuadran el subtotal y el total del Excel.";
  }

  // Sumas por fila: cantidad × precio contra el total escrito.
  //
  // Cuando el Excel trae el precio sin IVA y el total con IVA, ninguna fila
  // "cuadra" y sale un error por cada una. No es un error del presupuesto: es
  // cómo está hecho. Se dice una vez, y claro.
  if (ivaEnFilas) add("total_con_iva", "aviso",
    `El TOTAL de cada fila incluye IVA${ivaEnFilas.pct ? ` del ${ivaEnFilas.pct} %` : ""}: sale de multiplicar la cantidad por el precio CON IVA (${ivaEnFilas.filas} de ${ivaEnFilas.de} filas). El precio unitario que se importa es el de sin IVA.`,
    [], ivaEnFilas);
  const malas = ivaEnFilas ? [] : rubros.filter(x => !x.global && x.cantidad && x.precio_unitario
    && Math.abs(x.total - x.cantidad * x.precio_unitario) > Math.max(0.02, Math.abs(x.total) * 0.0005));
  if (malas.length) add("suma_fila", "error",
    `${plural(malas.length, "fila", "filas")} donde cantidad × precio no da el total escrito. Se importa el total del Excel.`,
    malas.map(x => ({ fila: F(x.fila), texto: `${etiqueta(x)}: ${x.cantidad} × $${plata(x.precio_unitario)} = $${plata(x.cantidad * x.precio_unitario)}, el Excel dice $${plata(x.total)}` })),
    { filas: malas.map(x => x.fila), dif: malas.reduce((s, x) => s + x.cantidad * x.precio_unitario - x.total, 0) });

  // Cargos con porcentaje que no coincide
  cargos.forEach(c => {
    const pct = (String(c.descripcion).match(/(\d+(?:[.,]\d+)?)\s*%/) || [])[1];
    if (!pct) return;
    const base = subtotalExcel ?? sumaRubros;
    const esperado = base * Number(pct.replace(",", ".")) / 100;
    if (Math.abs(esperado - c.total) > 1) add("cargo_porcentaje", "aviso",
      `"${c.descripcion}" dice ${pct} %, pero el monto es $${plata(c.total)}; el ${pct} % del subtotal serían $${plata(esperado)}.`,
      [{ fila: F(c.fila), texto: c.descripcion }],
      { fila: c.fila, actual: c.total, esperado: Math.round(esperado * 100) / 100, pct });
  });

  // Filas que el propio Excel no suma
  const sinTotal = omitidas.filter(o => o.motivo === "sin_total");
  // Es un error y no un aviso: es plata que el Excel deja afuera sin decirlo.
  if (sinTotal.length) add("fila_sin_total", "error",
    `${plural(sinTotal.length, "fila tiene", "filas tienen")} cantidad y precio pero la celda de total vacía: el Excel no las suma.`,
    sinTotal.map(o => ({ fila: F(o.fila), texto: `${etiqueta(o)}: ${o.cant} × $${plata(o.precio)} = $${plata(o.cant * o.precio)}` })),
    { filas: sinTotal.map(o => o.fila), monto: sinTotal.reduce((s, o) => s + o.cant * o.precio, 0) });

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

  // Numeración de rubros. Con numeración corrida (1, 2, 3… para todo el
  // presupuesto) el código no tiene por qué coincidir con el capítulo.
  const fuera = !usarPrefijos ? [] : rubros.filter(x => {
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
    dups.flat().map(x => ({ fila: F(x.fila), texto: `${etiqueta(x)} — $${plata(x.total)}` })),
    { quitar: dups.flatMap(a => a.slice(1).map(x => x.fila)), monto: dups.reduce((s, a) => s + a.slice(1).reduce((t, x) => t + x.total, 0), 0) });

  const sinCap = rubros.filter(x => x.capitulo === "SIN CAPÍTULO");
  if (sinCap.length && capitulos.length) add("sin_capitulo", "aviso",
    `${plural(sinCap.length, "rubro quedó", "rubros quedaron")} antes del primer capítulo.`,
    sinCap.map(x => ({ fila: F(x.fila), texto: etiqueta(x) })));

  return adv.sort((a, b) => (a.nivel === "error" ? 0 : 1) - (b.nivel === "error" ? 0 : 1));
}

// ── Aceptar o no aceptar lo que marcó la revisión ────────────────────────
// Aceptar: el presupuesto queda como dice el Excel. No aceptar: se corrige,
// cuando hay forma de hacerlo sin inventar; si no la hay (una numeración mal
// puesta), queda anotado como error del Excel para pedir que lo corrijan.
//
// Una suma mal hecha no se arregla tocando rubros, porque no se sabe qué fila
// dejó afuera la fórmula. Si se acepta la cifra del Excel —porque es la que el
// cliente aprobó— se agrega una línea de ajuste por la diferencia.

export const CAP_AJUSTES = "AJUSTES AL EXCEL";
const r2 = v => Math.round(v * 100) / 100;

/** Qué pasa con cada opción, para mostrarlo antes de decidir. */
export function efectos(a) {
  const d = a.datos || {};
  const signo = v => `${v < 0 ? "−" : "+"}$${plata(Math.abs(v))}`;
  switch (a.tipo) {
    case "suma_capitulo":
      return { corrige: true,
        aceptar: `Vale el subtotal del Excel: se agrega un ajuste de ${signo(d.excel - d.importado)} en el capítulo.`,
        noAceptar: `Vale la suma real de los rubros, $${plata(d.importado)}.` };
    case "suma_subtotal":
      return { corrige: true,
        aceptar: `Vale el subtotal del Excel: se agrega un ajuste de ${signo(d.excel - d.importado)}.`,
        noAceptar: `Vale la suma real de los rubros, $${plata(d.importado)}.` };
    case "suma_total":
      return { corrige: true,
        aceptar: `Vale el total del Excel: se agrega un ajuste por la diferencia.`,
        noAceptar: `Vale la suma real, $${plata(d.importado)}.` };
    case "suma_fila":
      return { corrige: true,
        aceptar: "Se importa el total escrito en el Excel.",
        noAceptar: `Se corrige a cantidad × precio (${signo(d.dif)}).` };
    case "fila_sin_total":
      return { corrige: true,
        aceptar: "No se importan, igual que en el Excel.",
        noAceptar: `Se agregan con cantidad × precio (+$${plata(d.monto)}).` };
    case "duplicado":
      return { corrige: true,
        aceptar: "Se dejan todos, están a propósito.",
        noAceptar: `Se quita la repetición (−$${plata(d.monto)}).` };
    case "cargo_porcentaje":
      return { corrige: true,
        aceptar: `Se deja el monto del Excel, $${plata(d.actual)}.`,
        noAceptar: `Se corrige al ${d.pct} %, $${plata(d.esperado)}.` };
    default:
      return { corrige: false,
        aceptar: "Está bien así.",
        noAceptar: "Queda anotado como error del Excel, para pedir que lo corrijan. No cambia montos." };
  }
}

/**
 * Aplica las decisiones ({ índice de advertencia: "aceptar" | "corregir" }) a
 * lo leído. Primero las correcciones de filas, después los ajustes de sumas,
 * que se calculan contra lo ya corregido para no contar dos veces la misma
 * diferencia.
 */
export function aplicarDecisiones({ rubros, cargos, omitidas, advertencias = [] }, decisiones = {}) {
  let rs = rubros.map(r => ({ ...r }));
  let cs = cargos.map(c => ({ ...c }));
  const decide = (tipo, valor) => advertencias.map((a, i) => [a, i]).filter(([a, i]) => a.tipo === tipo && decisiones[i] === valor).map(([a]) => a);
  const suma = a => a.reduce((s, x) => s + x.total, 0);

  decide("suma_fila", "corregir").forEach(a => {
    const filas = new Set(a.datos?.filas || []);
    rs = rs.map(r => filas.has(r.fila) ? { ...r, total: r2(r.cantidad * r.precio_unitario), origen: "corregido" } : r);
  });
  decide("fila_sin_total", "corregir").forEach(a => {
    const filas = new Set(a.datos?.filas || []);
    omitidas.filter(o => o.motivo === "sin_total" && filas.has(o.fila)).forEach(o => rs.push({
      capitulo: o.capitulo || "SIN CAPÍTULO", codigo: o.codigo, descripcion: o.descripcion, unidad: o.unidad || "",
      cantidad: o.cant, precio_unitario: o.precio, total: r2(o.cant * o.precio), fila: o.fila, global: false, origen: "agregado",
    }));
  });
  decide("duplicado", "corregir").forEach(a => {
    const quitar = new Set(a.datos?.quitar || []);
    rs = rs.filter(r => !quitar.has(r.fila));
  });
  decide("cargo_porcentaje", "corregir").forEach(a => {
    cs = cs.map(c => c.fila === a.datos?.fila ? { ...c, total: a.datos.esperado, origen: "corregido" } : c);
  });
  rs.sort((x, y) => x.fila - y.fila);

  const ajuste = (capitulo, monto, fila, descripcion) => {
    if (Math.abs(monto) < 0.005) return;
    rs.push({ capitulo, codigo: "", descripcion, unidad: "glb", cantidad: 1, precio_unitario: r2(monto), total: r2(monto), fila, global: true, origen: "ajuste" });
  };
  decide("suma_capitulo", "aceptar").forEach(a => {
    const delCap = rs.filter(r => r.capitulo === a.datos.capitulo);
    const ultima = delCap.length ? Math.max(...delCap.map(r => r.fila)) : 0;
    const i = rs.findIndex(r => r.fila === ultima && r.capitulo === a.datos.capitulo);
    const antes = rs.length;
    ajuste(a.datos.capitulo, a.datos.excel - suma(delCap), ultima + 0.5, "AJUSTE PARA CUADRAR CON EL SUBTOTAL DEL EXCEL");
    // Queda al final de su capítulo, no al final del presupuesto.
    if (rs.length > antes && i >= 0) rs.splice(i + 1, 0, rs.pop());
  });
  decide("suma_subtotal", "aceptar").forEach(a => {
    ajuste(CAP_AJUSTES, a.datos.excel - suma(rs), 1e9, "AJUSTE PARA CUADRAR CON EL SUBTOTAL GENERAL DEL EXCEL");
  });
  decide("suma_total", "aceptar").forEach(a => {
    // El total del Excel ya trae su IVA; el ajuste va sin IVA, como los rubros.
    const dif = a.datos.excel - (a.datos.importado - suma(rubros) - suma(cargos) + suma(rs) + suma(cs));
    ajuste(CAP_AJUSTES, a.datos.ivaPct ? dif / (1 + a.datos.ivaPct / 100) : dif, 1e9 + 1, "AJUSTE PARA CUADRAR CON EL TOTAL DEL EXCEL");
  });

  return { rubros: rs, cargos: cs };
}

// ── Formatos recordados ──────────────────────────────────────────────────
// La "firma" de un Excel son sus títulos de columna con la posición de cada
// uno. Dos presupuestos con la misma firma se arman igual, así que el mapa
// que sirvió para uno sirve para el otro. Se normalizan tildes, mayúsculas y
// signos para que "P.UNITARIO" y "P. Unitario" cuenten como lo mismo.

const normal = v => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const CAMPOS_MAPA = ["col_item", "col_descripcion", "col_unidad", "col_cantidad", "col_precio", "col_total", "col_capitulo"];

export function firmaEncabezado(fila = []) {
  const partes = fila.map((c, i) => [i, normal(c)]).filter(([, t]) => t && isNaN(Number(t)));
  // Con menos de tres títulos la firma es tan genérica que confundiría formatos.
  return partes.length >= 3 ? partes.map(([i, t]) => `${i}:${t}`).join("|") : null;
}

export function soloColumnas(mapa) {
  const o = {};
  CAMPOS_MAPA.forEach(k => { o[k] = mapa?.[k] ?? null; });
  return o;
}

/** Busca, en las primeras filas, un encabezado cuya firma ya esté guardada. */
export function buscarFormato(filas, formatos = []) {
  const porFirma = new Map(formatos.map(f => [f.firma, f]));
  for (let i = 0; i < Math.min(filas.length, 40); i++) {
    const firma = firmaEncabezado(filas[i]);
    const f = firma && porFirma.get(firma);
    if (f) return { formato: f, mapa: { ...soloColumnas(f.mapa), fila_encabezado: i } };
  }
  return null;
}
