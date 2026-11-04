import { num, numeroDeCelda } from "./celdas.js";

/**
 * LA ARITMÉTICA ELIGE QUÉ COLUMNA ES CUÁL.
 *
 * Los títulos de las columnas a veces mienten —"V. Unitario" encima de un
 * precio que en realidad trae el IVA adentro— y a veces no están: proformas
 * con el encabezado en una imagen, o con las letras separadas para que
 * ocupen la celda. Un modelo mira títulos; los números no se miran, se
 * comprueban. En un presupuesto y en una proforma, cantidad × precio = total
 * en casi todas las filas, y de todas las combinaciones de columnas una sola
 * cumple eso. Es la que vale.
 *
 * Vivía en el lector de presupuestos y el de proformas no la tenía: el mismo
 * papel, leído desde Diferencias, se quedaba con el primer título que
 * encontraba. Ahora es una sola para los dos. Los lectores nombran distinto
 * la columna del precio —`col_precio` el presupuesto, `col_unitario` la
 * proforma— y por eso se recibe el nombre.
 *
 * @param clavePrecio  "col_precio" o "col_unitario": cómo llama el lector a
 *                     esa columna en su mapa.
 * @param miles        convención de miles del documento, si se conoce.
 * @returns el mapa corregido, qué se cambió para poder decirlo en pantalla,
 *          y el IVA si estaba en una columna aparte.
 */
export function mapeoQueCuadra(filasTodas, m, { clavePrecio = "col_precio", miles = null } = {}) {
  const desde = (m.fila_encabezado ?? 0) + 1;
  const filas = filasTodas.slice(desde, desde + 400).filter(f => Array.isArray(f) && f.length);
  const columnas = Math.max(0, ...filas.map(f => f.length));
  if (columnas < 3) return { mapa: m, cambios: [] };

  const celda = v => numeroDeCelda(v, miles);
  // Cuántas filas cumplen cantidad × precio = total con esta combinación.
  const calzan = (cc, cp, ct) => filas.filter(f => {
    const cant = celda(f[cc]), precio = celda(f[cp]), total = celda(f[ct]);
    if (!(cant > 0 && precio > 0 && total > 0)) return false;
    return Math.abs(cant * precio - total) <= Math.max(0.02, total * 0.005);
  }).length;
  // Con cuántas filas se puede medir: sin eso, "0 de 0" parecería un fracaso.
  const conNumeros = (cc, cp, ct) => filas.filter(f =>
    num(f[cc], miles) > 0 && num(f[cp], miles) > 0 && num(f[ct], miles) > 0).length;

  const actual = m.col_cantidad != null && m[clavePrecio] != null && m.col_total != null
    ? { cc: m.col_cantidad, cp: m[clavePrecio], ct: m.col_total }
    : null;
  const base = actual ? calzan(actual.cc, actual.cp, actual.ct) : 0;
  const posibles = actual ? conNumeros(actual.cc, actual.cp, actual.ct) : 0;

  // Si ya cuadra en la mayoría, no se toca nada: el mapa está bien.
  if (posibles >= 5 && base >= posibles * 0.8) return { mapa: m, cambios: [], cuadran: base, de: posibles };

  // SIN PRECIO EN EL ENCABEZADO, LA ARITMÉTICA LO ENCUENTRA. Una proforma que
  // nombra cantidad y total pero no el unitario —o lo nombra de una forma que
  // no se reconoce— tiene igual una columna que multiplicada por la cantidad
  // da el total. Se busca solo esa: la cantidad y el total ya se saben.
  if (!actual && m.col_cantidad != null && m.col_total != null) {
    let mejor = null;
    for (let cp = 0; cp < columnas; cp++) {
      if (cp === m.col_cantidad || cp === m.col_total) continue;
      const de = conNumeros(m.col_cantidad, cp, m.col_total);
      if (de < 3) continue;
      const n = calzan(m.col_cantidad, cp, m.col_total);
      if (n < de * 0.8) continue;
      if (!mejor || n > mejor.calzan) mejor = { cp, calzan: n, de };
    }
    if (!mejor) return { mapa: m, cambios: [] };
    return {
      mapa: { ...m, [clavePrecio]: mejor.cp },
      cambios: [`precio unitario: no estaba en el encabezado, es la columna ${letra(mejor.cp)} (cantidad × esa columna da el total en ${mejor.calzan} de ${mejor.de} renglones)`],
      cuadran: mejor.calzan, de: mejor.de,
    };
  }
  if (!actual) return { mapa: m, cambios: [] };

  let mejor = { ...actual, calzan: base, de: posibles };
  for (let cc = 0; cc < columnas; cc++) {
    for (let cp = 0; cp < columnas; cp++) {
      if (cp === cc) continue;
      for (let ct = 0; ct < columnas; ct++) {
        if (ct === cc || ct === cp) continue;
        const de = conNumeros(cc, cp, ct);
        if (de < 5) continue;
        const n = calzan(cc, cp, ct);
        if (n < de * 0.8) continue;
        if (n > mejor.calzan) mejor = { cc, cp, ct, calzan: n, de };
      }
    }
  }
  if (mejor.cc === actual.cc && mejor.cp === actual.cp && mejor.ct === actual.ct) {
    return { mapa: m, cambios: [] };
  }

  // ── EL IVA EN COLUMNA APARTE ─────────────────────────────────────────────
  //
  // Muchísimas planillas traen P.UNITARIO, IVA 15 % y P.UNITARIO CON IVA, y
  // el total es cantidad × el precio CON IVA. Visto desde acá, el precio que
  // "cuadra" es el de la columna con IVA. Si lo único que cambia es la columna
  // del precio y la nueva es un porcentaje parejo por encima de la vieja, eso
  // no es una columna equivocada: es el IVA. Se queda el precio sin IVA y se
  // anota la tasa. Los honorarios se calculan sobre el costo directo, y si el
  // costo directo trae el impuesto adentro, el honorario se cobra sobre el IVA.
  if (mejor.cc === actual.cc && mejor.ct === actual.ct && mejor.cp !== actual.cp) {
    const razones = filas
      .map(f => ({ viejo: num(f[actual.cp], miles), nuevo: num(f[mejor.cp], miles) }))
      .filter(x => x.viejo > 0 && x.nuevo > 0)
      .map(x => x.nuevo / x.viejo - 1)
      .sort((a2, b2) => a2 - b2);
    const medio = razones.length >= 5 ? razones[Math.floor(razones.length / 2)] : null;
    const pareja = medio != null
      && razones.filter(v => Math.abs(v - medio) <= 0.004).length >= razones.length * 0.8;
    if (pareja && medio >= 0.05 && medio <= 0.25) {
      return {
        mapa: { ...m, col_cantidad: mejor.cc, [clavePrecio]: actual.cp, col_total: mejor.ct },
        cambios: [],
        iva: { pct: Math.round(medio * 1000) / 10, columnaConIva: mejor.cp, columnaSinIva: actual.cp },
        cuadran: mejor.calzan, de: mejor.de,
      };
    }
  }

  const cambios = [];
  const nombre = { cc: "cantidad", cp: "precio unitario", ct: "total" };
  ["cc", "cp", "ct"].forEach(k => {
    if (mejor[k] !== actual[k]) cambios.push(`${nombre[k]}: columna ${letra(actual[k])} → ${letra(mejor[k])}`);
  });
  return {
    mapa: { ...m, col_cantidad: mejor.cc, [clavePrecio]: mejor.cp, col_total: mejor.ct },
    cambios,
    cuadran: mejor.calzan, de: mejor.de,
  };
}

const letra = i => String.fromCharCode(65 + (i % 26));

/**
 * CON QUÉ CONVENCIÓN DE MILES ESTÁ ESCRITO ESTE DOCUMENTO.
 *
 * La multiplicación NO lo decide, y vale la pena decir por qué: si todo el
 * dinero del papel se lee mil veces más grande, cantidad × unitario = total
 * sigue cerrando igual —la cantidad no cambia, el precio y el total se
 * multiplican por lo mismo—. "$ 1.200 × 10 = $ 12.000" cuadra como mil
 * doscientos y cuadra como un dólar veinte. Probar las dos y quedarse con la
 * que cuadra era elegir al azar.
 *
 * Lo que sí decide es la EVIDENCIA: en casi todo papel hay celdas donde el
 * separador no es ambiguo, y una sola alcanza.
 *
 *   · "1.234,56"  los dos separadores: el último es el decimal, el otro
 *                 agrupa miles.
 *   · "1.234.567" el mismo dos veces: agrupa miles.
 *   · "2.5" / "12,50"  uno solo con uno o dos dígitos detrás: es el decimal,
 *                 así que el OTRO agrupa miles.
 *   · "1.200"     uno solo con tres dígitos: no dice nada. Se salta.
 *
 * Se cuentan los votos de todas las celdas y gana la mayoría. Sin evidencia se
 * devuelve null y se lee como siempre: no se afirma lo que el papel no dijo.
 */
export function milesDelDocumento(filas = []) {
  const votos = { ".": 0, ",": 0 };
  for (const f of filas) {
    for (const celda of (Array.isArray(f) ? f : [])) {
      if (typeof celda === "number") continue;
      const t = String(celda ?? "").replace(/\b(usd|us\$|dólares|dolares|dls)\b/gi, "").replace(/\$/g, "").trim();
      const m = /^-?\d[\d.,]*$/.exec(t);
      if (!m) continue;
      const n = m[0];
      const puntos = (n.match(/\./g) || []).length, comas = (n.match(/,/g) || []).length;
      if (puntos && comas) { votos[n.lastIndexOf(".") > n.lastIndexOf(",") ? "," : "."]++; continue; }
      if (puntos > 1) { votos["."]++; continue; }
      if (comas > 1) { votos[","]++; continue; }
      const sep = puntos ? "." : comas ? "," : null;
      if (!sep) continue;
      const despues = n.split(sep)[1] || "";
      if (despues.length === 3) continue;            // ambigua: no vota
      votos[sep === "." ? "," : "."]++;              // sep es decimal → el otro agrupa
    }
  }
  if (votos["."] === votos[","]) return null;
  return votos["."] > votos[","] ? "." : ",";
}

/**
 * EL PIE DE LA PLANILLA: subtotal, descuento, IVA y total, tal como están.
 *
 * Una planilla de Excel se leía sola —sus renglones— pero su pie no, y sin el
 * subtotal la aritmética no tiene contra qué comprobar la lectura: todo Excel
 * quedaba "sin comprobar", que es lo mismo que no haberlo comprobado. El pie
 * está en la misma hoja, en las filas que dicen SUBTOTAL, DESCUENTO, IVA o
 * TOTAL; se toma la cifra de la columna del total, o la última cifra de la
 * fila si esa columna está vacía.
 *
 * Nada se calcula. Si el papel trae total e IVA pero no subtotal, el subtotal
 * se deduce por resta —es la única deducción, y se marca—; si no trae ni eso,
 * queda null y la lectura se dice sin comprobar, que es la verdad.
 */
export function pieDeHoja(filas = [], mapa = {}, { miles = null } = {}) {
  const desde = Number(mapa.fila_encabezado ?? 0) + 1;
  const cT = mapa.col_total;
  const pie = { subtotal: null, descuento: null, iva: null, total: null, deducido: null };
  const cifraDe = f => {
    const enTotal = cT == null ? 0 : numeroDeCelda(f[cT], miles);
    if (enTotal) return Math.abs(enTotal);
    for (let i = f.length - 1; i >= 0; i--) { const v = numeroDeCelda(f[i], miles); if (v) return Math.abs(v); }
    return 0;
  };
  for (let i = desde; i < filas.length; i++) {
    const f = filas[i] || [];
    const texto = f.map(c => String(c ?? "")).join(" ").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const v = cifraDe(f);
    if (!v) continue;
    if (/\bsub\s*total\b|\bsuma\b/.test(texto)) { if (pie.subtotal == null) pie.subtotal = v; continue; }
    if (/\bdescuento\b|\bdcto\b|\bdesc\.?\b/.test(texto)) { if (pie.descuento == null) pie.descuento = v; continue; }
    if (/\biva\b|\bimpuesto\b/.test(texto)) { if (pie.iva == null) pie.iva = v; continue; }
    if (/\btotal\b/.test(texto)) { pie.total = v; continue; }   // el último TOTAL es el que manda
  }
  if (pie.subtotal == null && pie.total != null && pie.iva != null) {
    pie.subtotal = Math.round((pie.total - pie.iva + (pie.descuento || 0)) * 100) / 100;
    pie.deducido = "subtotal = total − IVA";
  }
  return pie;
}
