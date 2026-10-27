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
 * ¿EL TOTAL DE CADA FILA TRAE EL IVA ADENTRO, sin que haya columna de IVA?
 *
 * Hay planillas con el precio unitario sin IVA y un total que es cantidad ×
 * precio × 1,15: el IVA está metido en el total y no aparece en ninguna otra
 * columna. Ningún precio "cuadra", así que no se detectaba, y el presupuesto
 * entraba con el precio sin IVA y el total con IVA —y al sumarle el IVA al
 * final, lo cobraba dos veces—.
 *
 * Es IVA si en casi todas las filas el total es cantidad × precio más un
 * recargo PAREJO de entre 5 % y 25 %. Una diferencia que cambia de fila en
 * fila no es un impuesto: es otra cosa, y no se toca.
 *
 * @param filas [{ cantidad, precio, total }]
 * @returns la tasa (15, 12…) o null
 */
export function ivaMetidoEnTotales(filas = []) {
  const razones = filas
    .map(f => ({ c: num(f.cantidad), p: num(f.precio), t: num(f.total) }))
    .filter(x => x.c > 0 && x.p > 0 && x.t > 0)
    .map(x => x.t / (x.c * x.p) - 1)
    .sort((a, b) => a - b);
  if (razones.length < 5) return null;
  const medio = razones[Math.floor(razones.length / 2)];
  const pareja = razones.filter(v => Math.abs(v - medio) <= 0.004).length >= razones.length * 0.8;
  if (!pareja || medio < 0.05 || medio > 0.25) return null;
  return Math.round(medio * 1000) / 10;
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

/**
 * Comprobar el mapa contra los números, y corregirlo si no cuadra.
 *
 * NOVA acierta casi siempre, pero "casi" en un presupuesto de 170 rubros son
 * treinta filas mal leídas que alguien tiene que encontrar a mano. Y el modelo
 * no puede garantizar nada: mira títulos de columna, que a veces mienten
 * —"V. Unitario" en una columna que en realidad trae el precio con IVA—.
 *
 * Los números sí se pueden comprobar: en un presupuesto, cantidad × precio =
 * total en casi todas las filas. Si el mapa que vino no cumple eso, se prueban
 * las combinaciones de columnas numéricas y se elige la que SÍ lo cumple. Es
 * aritmética, no opinión: o reproduce los totales del Excel o no.
 *
 * @returns el mapa corregido, y qué se cambió para poder decirlo en pantalla.
 */
export function mapaQueCuadra(filasTodas, m) {
  const desde = (m.fila_encabezado ?? 0) + 1;
  const filas = filasTodas.slice(desde, desde + 400).filter(f => Array.isArray(f) && f.length);
  const columnas = Math.max(0, ...filas.map(f => f.length));
  if (columnas < 3) return { mapa: m, cambios: [] };

  // Cuántas filas cumplen cantidad × precio = total con esta combinación.
  const calzan = (cc, cp, ct) => filas.filter(f => {
    const cant = num(f[cc]), precio = num(f[cp]), total = num(f[ct]);
    if (!(cant > 0 && precio > 0 && total > 0)) return false;
    return Math.abs(cant * precio - total) <= Math.max(0.02, total * 0.005);
  }).length;

  // Con cuántas filas se puede medir: sin eso, "0 de 0" parecería un fracaso.
  const conNumeros = (cc, cp, ct) => filas.filter(f =>
    num(f[cc]) > 0 && num(f[cp]) > 0 && num(f[ct]) > 0).length;

  const actual = m.col_cantidad != null && m.col_precio != null && m.col_total != null
    ? { cc: m.col_cantidad, cp: m.col_precio, ct: m.col_total }
    : null;
  const base = actual ? calzan(actual.cc, actual.cp, actual.ct) : 0;
  const posibles = actual ? conNumeros(actual.cc, actual.cp, actual.ct) : 0;

  // Si ya cuadra en la mayoría, no se toca nada: el mapa está bien.
  if (posibles >= 5 && base >= posibles * 0.8) return { mapa: m, cambios: [] };

  let mejor = actual ? { ...actual, calzan: base, de: posibles } : null;
  for (let cc = 0; cc < columnas; cc++) {
    for (let cp = 0; cp < columnas; cp++) {
      if (cp === cc) continue;
      for (let ct = 0; ct < columnas; ct++) {
        if (ct === cc || ct === cp) continue;
        const de = conNumeros(cc, cp, ct);
        if (de < 5) continue;
        const n = calzan(cc, cp, ct);
        if (n < de * 0.8) continue;
        if (!mejor || n > mejor.calzan) mejor = { cc, cp, ct, calzan: n, de };
      }
    }
  }
  if (!mejor || !actual || (mejor.cc === actual.cc && mejor.cp === actual.cp && mejor.ct === actual.ct)) {
    return { mapa: m, cambios: [] };
  }

  // ── EL IVA EN COLUMNA APARTE ─────────────────────────────────────────────
  //
  // Muchísimas planillas traen P.UNITARIO, IVA 15 % y P.UNITARIO CON IVA, y
  // el total es cantidad × el precio CON IVA. Visto desde acá, el precio que
  // "cuadra" es el de la columna con IVA, y hasta ahora se cambiaba a esa y
  // listo: el presupuesto entraba con precios unitarios inflados un 15 %.
  //
  // Eso no es un detalle de presentación. Los honorarios y los indirectos se
  // calculan como un porcentaje del costo directo, y si el costo directo trae
  // el impuesto adentro, el honorario se está cobrando sobre el IVA. En una
  // obra de ocho millones son cien mil dólares que no son de nadie.
  //
  // Si lo único que cambia es la columna del precio y la nueva es un
  // porcentaje parejo por encima de la vieja, eso no es una columna
  // equivocada: es el IVA. Se queda el precio sin IVA y se anota la tasa.
  if (mejor.cc === actual.cc && mejor.ct === actual.ct && mejor.cp !== actual.cp) {
    const razones = filas
      .map(f => ({ viejo: num(f[actual.cp]), nuevo: num(f[mejor.cp]) }))
      .filter(x => x.viejo > 0 && x.nuevo > 0)
      .map(x => x.nuevo / x.viejo - 1)
      .sort((a2, b2) => a2 - b2);
    const medio = razones.length >= 5 ? razones[Math.floor(razones.length / 2)] : null;
    // Una tasa de impuesto, no cualquier diferencia: entre 5 % y 25 %, y
    // pareja —si cada fila tiene otro recargo, son dos columnas distintas y
    // no un impuesto—.
    const pareja = medio != null
      && razones.filter(v => Math.abs(v - medio) <= 0.004).length >= razones.length * 0.8;
    if (pareja && medio >= 0.05 && medio <= 0.25) {
      return {
        mapa: { ...m, col_cantidad: mejor.cc, col_precio: actual.cp, col_total: mejor.ct },
        cambios: [],
        iva: { pct: Math.round(medio * 1000) / 10, columnaConIva: mejor.cp, columnaSinIva: actual.cp },
        cuadran: mejor.calzan, de: mejor.de,
      };
    }
  }

  const cambios = [];
  const nombre = { cc: "cantidad", cp: "precio unitario", ct: "total" };
  const letra = i => String.fromCharCode(65 + (i % 26));
  ["cc", "cp", "ct"].forEach(k => {
    if (mejor[k] !== actual[k]) cambios.push(`${nombre[k]}: columna ${letra(actual[k])} → ${letra(mejor[k])}`);
  });
  return {
    mapa: { ...m, col_cantidad: mejor.cc, col_precio: mejor.cp, col_total: mejor.ct },
    cambios,
    cuadran: mejor.calzan, de: mejor.de,
  };
}

export function interpretarPresupuesto(filasTodas, mapaNova, { conPendientes = false, respetarMapa = false, bloque: bloqueInicial = null, ivaForzado = null } = {}) {
  // `respetarMapa` salta el saneo automático: lo usa quien corrige la lectura
  // a mano desde la pantalla. El saneo existe para cuando NOVA se equivoca,
  // pero si la persona está mirando su propio Excel y dice de qué columna sale
  // el capítulo, ella sabe más que la heurística.
  const saneado = respetarMapa ? { ...mapaNova } : sanearMapa(filasTodas, mapaNova);
  // Antes de leer nada: que el mapa reproduzca los totales del propio Excel.
  // Si no, se corrige solo. Es lo único que convierte "el modelo casi siempre
  // acierta" en algo que se puede afirmar de esta importación en particular.
  const revisado = mapaQueCuadra(filasTodas, saneado);
  const m = revisado.mapa;
  m.corregido = revisado.cambios?.length ? revisado : null;
  // El IVA que viene en su propia columna: el precio unitario queda limpio y
  // la tasa se guarda con cada rubro, para que los honorarios y los
  // indirectos se calculen sobre el costo directo y no sobre el impuesto.
  // Y si no hay columna con IVA pero el total lo trae metido (cantidad ×
  // precio × 1,15 en cada fila), es lo mismo: la tasa se reconoce igual.
  const ivaMetido = revisado.iva ? null : (() => {
    if (m.col_cantidad == null || m.col_precio == null || m.col_total == null) return null;
    const desde = (m.fila_encabezado ?? 0) + 1;
    return ivaMetidoEnTotales(filasTodas.slice(desde).map(f => ({ cantidad: f[m.col_cantidad], precio: f[m.col_precio], total: f[m.col_total] })));
  })();
  m.ivaEnFilas = revisado.iva || (ivaMetido != null ? { pct: ivaMetido, enElTotal: true } : precioQueCuadra(filasTodas, m));
  // `ivaForzado`: la tasa que reconocieron las otras hojas del mismo libro, para
  // una hoja con muy pocas filas como para reconocerla sola.
  const ivaDeFila = revisado.iva ? revisado.iva.pct : (ivaMetido ?? ivaForzado);
  const val = (f, c) => (c == null ? "" : f[c]);
  const inicio = (m.fila_encabezado ?? 0) + 1;

  /**
   * Hay planillas que REPITEN LA FILA DE ENCABEZADOS en cada capítulo, y
   * escriben el nombre del capítulo en la misma fila:
   *
   *   PW | 1 | Trabajos preliminares | Unidad | Cantidad | V. Unitario | ...
   *      | 1.01 | Replanteo general    | m²     | 848.21   | 0.70        | ...
   *
   * Sin reconocerlas, esa fila trae la palabra "Unidad" en la columna de
   * unidad, se toma por una línea de detalle y se descarta —y con ella el
   * capítulo—. Un presupuesto de 170 rubros salía entero SIN CAPÍTULO.
   *
   * Se reconoce comparando la fila contra el encabezado de verdad: si repite
   * al menos dos de sus títulos en la misma posición, es un encabezado
   * repetido y lo único que aporta es el nombre del capítulo.
   */
  const encabezado = filasTodas[m.fila_encabezado ?? 0] || [];
  const columnasClave = [m.col_unidad, m.col_cantidad, m.col_precio, m.col_total].filter(c => c != null);
  const tituloEncabezado = c => normal(val(encabezado, c));
  const esEncabezadoRepetido = f =>
    columnasClave.length >= 2 &&
    columnasClave.filter(c => {
      const t = tituloEncabezado(c);
      return t && normal(val(f, c)) === t;
    }).length >= 2;

  const leidas = filasTodas.slice(inicio).map((f, k) => {
    let desc = texto(val(f, m.col_descripcion));
    // DE DÓNDE SALIÓ LA DESCRIPCIÓN, QUE NO ES UN DETALLE.
    //
    // Muchas planillas escriben "SUBTOTAL" u "Honorarios" fuera de la columna
    // de descripción, así que si esa celda está vacía se toma el primer texto
    // de la fila. Eso sirve para reconocer un subtotal y NO sirve para armar
    // un rubro: un rubro de verdad tiene su descripción en la columna de las
    // descripciones. Cuando sale de otro lado, la fila es otra cosa —un
    // subtotal, un cargo, el cuadro de áreas del pie— y tratarla como rubro es
    // lo que metía el total del presupuesto adentro del presupuesto.
    const descPropia = !!desc;
    if (!desc) desc = f.map(texto).find(t => t && isNaN(Number(t)) && !esCodigo(t)) || "";
    return {
      fila: inicio + k, desc, descPropia,
      codigo: texto(val(f, m.col_item)),
      unidad: unidadValida(texto(val(f, m.col_unidad))) ? texto(val(f, m.col_unidad)) : "",
      // Distingue "total en 0" de "celda de total vacía": una fila con cantidad
      // y precio pero sin total es una línea que el propio Excel no suma.
      totalVacio: m.col_total != null && texto(val(f, m.col_total)) === "",
      cant: num(val(f, m.col_cantidad)),
      precio: num(val(f, m.col_precio)),
      total: num(val(f, m.col_total)),
      capCol: m.col_capitulo != null ? texto(val(f, m.col_capitulo)) : "",
      repiteEncabezado: esEncabezadoRepetido(f),
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
  // `bloqueInicial` es el nombre de la hoja cuando el presupuesto viene
  // repartido en varias: "CASA PRINCIPAL · OBRAS PRELIMINARES". Sin eso, las
  // tres hojas tienen un capítulo llamado OBRAS PRELIMINARES y se fundirían en
  // uno solo, que después nadie puede controlar por separado.
  let cap = null, subtotalExcel = null, totalExcel = null, ivaExcel = null, bloque = bloqueInicial;
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
  const rubro = (r, cantidad, precio, total, global = false, pendiente = false, noMultiplica = null) => {
    if (cap && !cap.prefijo) cap.prefijo = prefijo(r.codigo);
    if (cap) { cap.rubros++; cap.suma += total || 0; }
    return rubros.push({
    capitulo: cap?.nombre || "SIN CAPÍTULO", codigo: r.codigo, descripcion: r.desc,
    unidad: r.unidad, cantidad, precio_unitario: precio, total, fila: r.fila, global,
    // La tasa que trae ESA fila en su columna de IVA. Con el precio sin IVA y
    // la tasa al lado, el total con IVA se puede reconstruir y la base para
    // honorarios también.
    ...(ivaDeFila != null ? { iva_pct: ivaDeFila } : {}),
    // CORREGIR NO ES CALLAR. El precio se deduce del total para que la fila
    // multiplique, pero lo que venía escrito queda anotado: es un dato que el
    // Excel trae mal y el que lo hizo tiene que saberlo.
    ...(noMultiplica ? { noMultiplica } : {}),
    ...(pendiente ? { pendiente: true } : {}),
    });
  };

  // En esas planillas, el PRIMER capítulo va escrito en la propia fila de
  // encabezados —"PW | 1 | Trabajos preliminares | Unidad | Cantidad | …"— y la
  // lectura arranca en la fila siguiente, así que se perdía entero: sus rubros
  // salían sin capítulo mientras los otros dieciocho sí lo tenían.
  //
  // Si esa celda dice "Descripción" o "Rubro" es un título de columna y no hay
  // capítulo que abrir; si dice cualquier otra cosa, es el primer capítulo.
  if (m.col_descripcion != null) {
    const primero = texto(val(encabezado, m.col_descripcion));
    if (primero && !GENERICO_DESC.test(primero)) {
      abrir(primero.toUpperCase(), texto(val(encabezado, m.col_item)), null, null, m.fila_encabezado ?? 0);
    }
  }

  leidas.forEach((r, k) => {
    if (!r.desc && !r.total) return;
    // Una fila que repite los encabezados no es un rubro ni un detalle: es el
    // título del capítulo que empieza ahí.
    if (r.repiteEncabezado) {
      if (r.desc && !GENERICO_DESC.test(r.desc)) abrir(r.desc.toUpperCase(), r.codigo, null, null, r.fila);
      return;
    }
    if (r.capCol && cap?.nombre !== r.capCol.toUpperCase()) abrir(r.capCol.toUpperCase(), "", null, null, r.fila);

    if (esRubro(r)) {
      const total = m.col_total != null ? r.total : r.cant * r.precio;
      // UN PRESUPUESTO SE CALCULA, NO SE COPIA.
      //
      // El total de un rubro es cantidad × precio. Se copiaba el total escrito
      // en el Excel y, si no multiplicaba, se inventaba un precio para que
      // diera: un total con IVA metido entraba con IVA, y un error de fórmula
      // del Excel entraba como si fuera el precio. Ahora manda la cuenta; el
      // total del Excel queda guardado para comparar, y si no coincide es un
      // error que se decide fila por fila (vale la cuenta, vale el Excel, o se
      // escribe el precio correcto).
      //
      // Sin precio pero con total —un global— no hay nada que multiplicar: el
      // precio sale del total, como siempre.
      const factor = 1 + (ivaDeFila || 0) / 100;
      const esperado = r.cant * r.precio * factor;
      const multiplica = Math.abs(esperado - total) <= Math.max(0.02, Math.abs(total) * 0.005);
      if (multiplica) return rubro(r, r.cant, r.precio, total);
      const calculado = Math.round(esperado * 100) / 100;
      if (r.precio > 0 && r.cant > 0) {
        return rubro(r, r.cant, r.precio, calculado, false, false,
          { precio: r.precio, daba: calculado, excel: total });
      }
      const precio = Math.round((total / factor / (r.cant || 1)) * 10000) / 10000;
      return rubro(r, r.cant, precio, total, false, false, { precio: r.precio, daba: calculado, excel: total });
    }
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
    if (esTotal(r)) { if (r.total) totalExcel = r.total; bloque = bloqueInicial; return; }
    if (esIva(r)) {
      if (r.total) {
        const pct = (r.linea.match(/(\d+(?:[.,]\d+)?)\s*%/) || [])[1];
        ivaExcel = { total: r.total, pct: pct ? num(pct) : null };
      }
      return;
    }
    // Después del último rubro, lo que tiene total es un cargo: honorarios,
    // imprevistos, utilidad. PERO el cuadro de áreas del pie también cae acá
    // —"VIAS VEHICULARES | 1.354,34 | SERVICIOS | 358.823,78"— y entraba como
    // un cargo de trescientos mil que nadie pidió. Un cargo no tiene cantidad:
    // es un monto. Si tiene cantidad y la descripción no salió de su columna,
    // es el cuadro de áreas y no es plata de esta obra.
    if (k > ultimoRubro) {
      if (r.total && (r.descPropia || !r.cant)) cargos.push({ descripcion: r.desc, total: r.total, fila: r.fila });
      // Una fila medida —con unidad y cantidad— que no tiene plata no es un
      // cargo ni es nada: se estaba cayendo en silencio. Es justo la que hay
      // que avisar, porque es trabajo que alguien va a hacer sin presupuesto.
      else if (!r.total && r.unidad && r.cant) {
        omitidas.push({ descripcion: r.desc, codigo: r.codigo, fila: r.fila, motivo: "detalle",
          unidad: r.unidad, cant: r.cant, precio: r.precio, capitulo: cap?.nombre || "SIN CAPÍTULO" });
      }
      return;
    }

    // Un global sin desglose: tiene unidad y total pero le falta cantidad o precio.
    //
    // Con la descripción en su columna. Al pie de muchas planillas hay un
    // cuadro de áreas —"AREA VERDE | 6.499,45 | ... | 7.209.185"— cuyas celdas
    // caen justo en las columnas de unidad, cantidad y total, y sin esto
    // entraba como tres rubros que sumaban el presupuesto entero otra vez:
    // ocho millones de los que nadie podía decir de dónde salían.
    if (r.unidad && r.total && r.descPropia) {
      const cantidad = r.cant || 1;
      // Un global sin precio saca el suyo del total, y ese total trae IVA: hay
      // que quitárselo, o este renglón entra con el precio inflado mientras
      // los demás entran limpios.
      const delTotal = (r.total / cantidad) / (1 + (ivaDeFila || 0) / 100);
      return rubro(r, cantidad, r.precio || Math.round(delTotal * 10000) / 10000, r.total, true);
    }
    // Entra en $0, con la cantidad si ya la tiene y el precio si ya lo tiene.
    if (esPendiente(r)) return rubro(r, r.cant || 0, r.precio || 0, 0, false, true);
    if (r.unidad) return omitidas.push({ descripcion: r.desc, codigo: r.codigo, fila: r.fila, motivo: "detalle",
      unidad: r.unidad, cant: r.cant, precio: r.precio, capitulo: cap?.nombre || "SIN CAPÍTULO" });
    // UN CAPÍTULO SE LLAMA DESDE LA COLUMNA DE LAS DESCRIPCIONES.
    //
    // El cuadro de áreas del pie —"AREA VERDE", "CAMINERIAS", "VIAS
    // VEHICULARES", cada uno con el total de una hoja al lado— abría tres
    // capítulos con total declarado y sin rubros, y un capítulo así se cuenta
    // como un cargo. Resultado: trescientos mil dólares de "VIAS VEHICULARES"
    // sumados al presupuesto, que en realidad eran el total de otra hoja.
    if (m.col_capitulo == null && r.descPropia && r.desc && r.desc.length <= 120) {
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
  // CONTRA EL EXCEL, CON LO QUE EL EXCEL ESCRIBIÓ. Los rubros ahora valen la
  // cuenta, pero los subtotales del Excel suman sus propios totales de fila:
  // compararlos contra las cuentas contaría dos veces cada fila mal sumada —
  // como error de fila y como error de capítulo—. Lo de cada fila se decide en
  // su propio error; acá solo se busca lo que es del subtotal.
  const sumaRubrosExcel = rubros.reduce((t, x) => t + (x.noMultiplica?.excel ?? x.total ?? 0), 0);
  const porCap = {};
  rubros.forEach(x => { porCap[x.capitulo] = (porCap[x.capitulo] || 0) + (x.noMultiplica?.excel ?? x.total); });
  const conRubros = capitulos.filter(c => porCap[c.nombre] != null);
  const descuadres = conRubros
    .filter(c => c.declarado != null && Math.abs((porCap[c.nombre] || 0) - c.declarado) > 1)
    .map(c => ({ capitulo: c.nombre, excel: c.declarado, importado: porCap[c.nombre] || 0 }));

  const advertencias = revisar({ rubros, omitidas, cargos, capitulos: conRubros, subtotalExcel, totalExcel, ivaExcel, sumaRubros: sumaRubrosExcel, sumaCargos, descuadres, ivaEnFilas: m.ivaEnFilas, usarPrefijos });

  // LA BASE SIN IVA, dicha una vez y bien. Es sobre esto que se calculan los
  // honorarios y los costos indirectos; el total con IVA es otra cosa.
  // Del total, no de cantidad × precio: hay rubros globales cuyo precio se
  // dedujo, y el total es el número que de verdad está escrito en el Excel.
  const baseSinIva = ivaDeFila == null ? null
    : Math.round(rubros.reduce((t, x) => t + (Number(x.total) || 0) / (1 + ivaDeFila / 100), 0) * 100) / 100;

  return {
    mapa: m, rubros, omitidas, cargos, capitulos: conRubros, subtotalesDeBloque, ivaEnFilas: m.ivaEnFilas || null,
    ivaPorFila: ivaDeFila, baseSinIva,
    subtotalExcel, totalExcel, ivaExcel, sumaRubros, sumaCargos, descuadres, advertencias,
    corregido: m.corregido || null,
    preciosIncluyenIva: typeof mapaNova.precios_incluyen_iva === "boolean" ? mapaNova.precios_incluyen_iva : null,
  };
}

/**
 * UN PRESUPUESTO REPARTIDO EN VARIAS HOJAS SE LEE HOJA POR HOJA.
 *
 * Pegarlas una debajo de otra y leerlas de corrido parecía lo simple y no lo
 * es: cada hoja trae su propio total al pie —y el lector se queda con el
 * último—, su propia fila de encabezados en el medio, y capítulos que se
 * llaman igual en las tres. "OBRAS PRELIMINARES" aparece en la casa, en el
 * wellness y en servicios, y fundidas en una sola son un capítulo que ya no
 * se puede controlar por separado.
 *
 * Leída hoja por hoja, cada una cuadra contra SU total —que es la única
 * comprobación que vale— y el nombre de la hoja queda como bloque de sus
 * capítulos.
 */
export function interpretarVariasHojas(hojas = [], opciones = {}) {
  const leer = (h, extra = {}) => interpretarPresupuesto(h.filas, h.mapa, { ...opciones, bloque: hojas.length > 1 ? h.nombre : null, ...extra });
  let leidas = hojas.map(h => ({ nombre: h.nombre, r: leer(h) }));

  // Una hoja con pocas filas no alcanza para reconocer la tasa sola, y sus
  // precios quedaban "corregidos" con el IVA adentro. Si las otras hojas la
  // reconocen y en ésta cada fila que no multiplicaba da justo con esa tasa,
  // se vuelve a leer con ella.
  const tasaDeOtras = [...new Set(leidas.map(({ r }) => r.ivaPorFila).filter(t => t != null))];
  if (tasaDeOtras.length === 1) {
    const f = 1 + tasaDeOtras[0] / 100;
    leidas = leidas.map((l, k) => {
      if (l.r.ivaPorFila != null) return l;
      const corregidas = l.r.rubros.filter(x => x.noMultiplica);
      const conLaTasa = corregidas.filter(x => {
        const esperado = (Number(x.cantidad) || 0) * (Number(x.noMultiplica.precio) || 0) * f;
        const delExcel = Number(x.noMultiplica.excel ?? x.total) || 0;
        return esperado > 0 && Math.abs(esperado - delExcel) <= Math.max(0.02, Math.abs(delExcel) * 0.005);
      });
      return corregidas.length && conLaTasa.length === corregidas.length
        ? { ...l, r: leer(hojas[k], { ivaForzado: tasaDeOtras[0] }) } : l;
    });
  }

  const sumar = (xs, campo) => xs.reduce((t, x) => t + (Number(x[campo]) || 0), 0);
  const unir = campo => leidas.flatMap(({ nombre, r }) =>
    (r[campo] || []).map(x => (hojas.length > 1 ? { ...x, hoja: nombre } : x)));

  const rubros = unir("rubros");
  const cargos = unir("cargos");
  // Cada hoja aporta SU total declarado. Quedarse con el de la última es lo
  // que hacía que un presupuesto de ocho millones se comparara contra los
  // trescientos mil de la última hoja.
  const totales = leidas.map(({ r }) => Number(r.totalExcel) || 0);
  const hayTotales = totales.some(t => t > 0);

  // EL IVA DE CADA FILA, DE TODAS LAS HOJAS. Se tomaba el de la primera: si
  // esa hoja no lo reconocía —pocas filas, una portada—, el presupuesto entero
  // entraba como si no hubiera IVA en las filas, con los totales con IVA, y
  // después se le sumaba otra vez. Vale la tasa que reconozcan las hojas si
  // no se contradicen; si ninguna la reconoce, se mira todo junto.
  const tasas = [...new Set(leidas.map(({ r }) => r.ivaPorFila).filter(t => t != null))];
  const ivaPorFila = tasas.length === 1 ? tasas[0]
    : tasas.length === 0 ? ivaMetidoEnTotales(rubros.map(x => ({ cantidad: x.cantidad, precio: x.precio_unitario, total: x.total })))
    : null;
  const baseSinIva = ivaPorFila == null ? null
    : Math.round(rubros.reduce((t, x) => t + (Number(x.total) || 0) / (1 + ivaPorFila / 100), 0) * 100) / 100;

  return {
    ...leidas[0]?.r,
    ivaPorFila, baseSinIva,
    rubros, cargos,
    omitidas: unir("omitidas"),
    capitulos: [...new Set(rubros.map(x => x.capitulo))],
    advertencias: leidas.flatMap(({ nombre, r }) => (r.advertencias || [])
      .map(a => (hojas.length > 1 ? { ...a, hoja: nombre } : a))),
    descuadres: leidas.flatMap(({ nombre, r }) => (r.descuadres || [])
      .map(d => (hojas.length > 1 ? { ...d, hoja: nombre } : d))),
    subtotalExcel: null,
    totalExcel: hayTotales ? Math.round(totales.reduce((t, x) => t + x, 0) * 100) / 100 : null,
    sumaRubros: Math.round(sumar(rubros, "total") * 100) / 100,
    sumaCargos: Math.round(sumar(cargos, "total") * 100) / 100,
    hojas: leidas.map(({ nombre, r }) => ({
      nombre,
      rubros: r.rubros.length,
      total: Math.round((sumar(r.rubros, "total") + sumar(r.cargos, "total")) * 100) / 100,
      declarado: Number(r.totalExcel) || null,
    })),
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
  // EL SUBTOTAL DEL EXCEL PUEDE INCLUIR LOS CARGOS.
  //
  // Muchas planillas ponen los imprevistos o los honorarios ANTES de la línea
  // de SUBTOTAL, así que ese número es rubros + cargos. Comparándolo contra los
  // rubros solos salta un error de miles de dólares que no existe — y un error
  // que no existe es peor que ninguno: enseña a saltearse los errores.
  const conCargos = difSub != null && Math.abs(sumaRubros + sumaCargos - subtotalExcel) <= 1;
  if (difSub != null && Math.abs(difSub) > 1 && !subExplicado && !conCargos)
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
    `El TOTAL de cada fila incluye IVA${ivaEnFilas.pct ? ` del ${ivaEnFilas.pct} %` : ""}: sale de multiplicar la cantidad por el precio CON IVA`
    + `${ivaEnFilas.filas ? ` (${ivaEnFilas.filas} de ${ivaEnFilas.de} filas)` : ""}.`
    + " El precio unitario que se importa es el de sin IVA, y los honorarios e indirectos se calculan sobre esa base.",
    [], ivaEnFilas);
  // LAS FILAS QUE NO MULTIPLICAN.
  //
  // Esta regla estuvo muda y fue culpa mía, dos veces. Primero porque con el
  // IVA en filas se saltaba entera —cantidad × precio nunca da el total cuando
  // el total lleva impuesto—; ahora la tasa se conoce y la cuenta se puede
  // hacer bien. Y después porque al deducir el precio del total para que la
  // fila multiplicara, ya no quedaba ninguna fila que denunciar: se corregía
  // en silencio lo que había que avisar.
  //
  // Se corrige para poder trabajar Y se avisa, con el precio que venía escrito.
  const malas = rubros.filter(x => x.noMultiplica);
  if (malas.length) add("suma_fila", "error",
    `${plural(malas.length, "fila", "filas")} donde cantidad × precio no da el total escrito en el Excel. Decidí en cada una: vale la cuenta, vale el Excel, o escribís el precio correcto.`,
    malas.map(x => {
      const delExcel = x.noMultiplica.excel ?? x.total;
      return {
        fila: F(x.fila), id: x.fila, cantidad: x.cantidad, precio: x.noMultiplica.precio,
        calculado: x.noMultiplica.daba, excel: delExcel, ivaPct: x.iva_pct ?? null,
        texto: `${etiqueta(x)}: ${x.cantidad} × $${plata(x.noMultiplica.precio)} = $${plata(x.noMultiplica.daba)}, el Excel dice $${plata(delExcel)}`,
      };
    }),
    { filas: malas.map(x => x.fila), dif: malas.reduce((s, x) => s + (x.noMultiplica.excel ?? x.total) - x.noMultiplica.daba, 0) });

  // RUBROS EN CERO.
  //
  // Una fila con su descripción y su unidad pero sin plata es trabajo que
  // alguien va a hacer y que el presupuesto no cuenta. No cambia el total
  // —cero no suma— y por eso ninguna comprobación de sumas lo encuentra: hay
  // que ir a buscarlo a propósito. Después llega la factura y no hay rubro
  // contra qué cargarla.
  // Las que tienen unidad Y cantidad pero no plata: están cuantificadas, o
  // sea que alguien las midió y nadie les puso precio. Una sub-línea sin
  // cantidad es un detalle del rubro de arriba y no se cuenta acá.
  const enCero = [
    ...rubros.filter(x => !x.pendiente && !Number(x.total)),
    ...omitidas.filter(o => o.motivo === "detalle" && Number(o.cant) > 0 && !Number(o.precio)),
  ];
  if (enCero.length) add("rubro_en_cero", "aviso",
    `${plural(enCero.length, "rubro entra", "rubros entran")} en $0: tienen descripción pero la planilla no les pone precio.`,
    enCero.slice(0, 60).map(x => ({ fila: F(x.fila), texto: `${etiqueta(x)}${x.unidad ? ` (${x.unidad})` : ""}${x.cantidad ? ` · cantidad ${x.cantidad}` : " · sin cantidad"}` })),
    { filas: enCero.map(x => x.fila) });

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
      // Se decide fila por fila; esto es lo que hacen los botones de "todos".
      return { corrige: true, porFila: true,
        aceptar: "En cada fila vale el total escrito en el Excel.",
        noAceptar: `En cada fila vale cantidad × precio (${signo(-(d.dif || 0))} contra el Excel).` };
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

// LAS DIFERENCIAS DE FILA SE DECIDEN DE A UNA.
//
// Para un error de "suma_fila" la decisión no es una palabra: es qué vale en
// cada fila. { porFila: { [fila]: "calcular" | "excel" | { mano: precio } } }.
// "aceptar" y "corregir" a secas —los botones de "todos", y las decisiones
// guardadas antes— valen para todas sus filas: aceptar es quedarse con el
// Excel, corregir es la cuenta.
export function decisionDeFila(decision, fila) {
  if (decision && typeof decision === "object") return decision.porFila?.[fila] ?? null;
  if (decision === "aceptar") return "excel";
  if (decision === "corregir") return "calcular";
  return null;
}

/** ¿Está decidida esta advertencia? Las de fila, cuando lo están todas sus filas. */
export function estaDecidida(a, decision) {
  if (!decision) return false;
  if (a?.tipo !== "suma_fila" || typeof decision !== "object") return true;
  return (a.datos?.filas || []).every(f => decisionDeFila(decision, f) != null);
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
  // Lo que el Excel escribió en cada fila: los ajustes de subtotal cubren solo
  // la diferencia del subtotal, no la de las filas, que se decide aparte.
  const sumaExcel = a => a.reduce((s, x) => s + (x.noMultiplica?.excel ?? x.total), 0);

  // Cada fila con su decisión. "calcular" es como ya viene leída (cantidad ×
  // precio); "excel" toma el total escrito y saca el precio de él; "mano" es
  // el precio que escribió quien importa.
  advertencias.forEach((a, i) => {
    if (a.tipo !== "suma_fila") return;
    const filas = new Set(a.datos?.filas || []);
    rs = rs.map(r => {
      if (!filas.has(r.fila) || !r.noMultiplica) return r;
      const op = decisionDeFila(decisiones[i], r.fila);
      const f = 1 + (Number(r.iva_pct) || 0) / 100;
      const cant = Number(r.cantidad) || 0;
      if (op === "excel") {
        const t = Number(r.noMultiplica.excel ?? r.total) || 0;
        return { ...r, total: t, precio_unitario: Math.round((t / f / (cant || 1)) * 10000) / 10000 };
      }
      if (op && typeof op === "object" && op.mano != null) {
        const p = Number(op.mano) || 0;
        return { ...r, precio_unitario: p, total: r2(cant * p * f), origen: "corregido" };
      }
      if (op === "calcular") {
        const p = Number(r.noMultiplica.precio) || 0;
        return { ...r, precio_unitario: p, total: r2(cant * p * f) };
      }
      return r;
    });
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
    ajuste(a.datos.capitulo, a.datos.excel - sumaExcel(delCap), ultima + 0.5, "AJUSTE PARA CUADRAR CON EL SUBTOTAL DEL EXCEL");
    // Queda al final de su capítulo, no al final del presupuesto.
    if (rs.length > antes && i >= 0) rs.splice(i + 1, 0, rs.pop());
  });
  decide("suma_subtotal", "aceptar").forEach(a => {
    ajuste(CAP_AJUSTES, a.datos.excel - sumaExcel(rs), 1e9, "AJUSTE PARA CUADRAR CON EL SUBTOTAL GENERAL DEL EXCEL");
  });
  decide("suma_total", "aceptar").forEach(a => {
    // El total del Excel ya trae su IVA; el ajuste va sin IVA, como los rubros.
    const dif = a.datos.excel - (a.datos.importado - sumaExcel(rubros) - suma(cargos) + sumaExcel(rs) + suma(cs));
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

// Los títulos que significan "acá va la descripción", no un capítulo.
const GENERICO_DESC = /^(descripci[oó]n|rubro|detalle|concepto|item|[ií]tem|actividad|partida|denominaci[oó]n)$/i;

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
