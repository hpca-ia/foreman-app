/**
 * CÓMO SE LEE UNA CELDA. UNA SOLA VEZ, PARA TODOS LOS LECTORES.
 *
 * Un presupuesto, una proforma y una cotización son el mismo papel con otro
 * encabezado: una lista de renglones con cantidad, precio unitario y total.
 * Leerlos con reglas distintas no da dos criterios, da dos resultados para el
 * mismo documento —y el que decide cuál se usa es el módulo por el que entró
 * el archivo, que es lo último que debería decidirlo.
 *
 * Pasó de verdad: había dos copias de `numeroDeCelda`, y puestas a leer las
 * mismas celdas no coincidían. "3 U" daba 3 en el lector de presupuestos y 0
 * en el de proformas; y 0 en la columna del total hace que el renglón se
 * descarte entero, que es el "se come renglones" que se venía reportando.
 */

const texto = v => String(v ?? "").trim();

/**
 * Un número que llega como texto. "1.234,56" o "1,234.56": el último
 * separador es el decimal. Las celdas numéricas de Excel pasan tal cual.
 */
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

/**
 * UNA CELDA QUE EMPIEZA CON LETRAS NO ES UN NÚMERO; UNA QUE EMPIEZA CON
 * NÚMERO VALE POR SU PRIMER NÚMERO.
 *
 * Las dos cosas que hay que distinguir vienen del mismo papel:
 *
 *   · Al pie se escribe el importe en letras —"SON: CATORCE MIL NOVECIENTOS
 *     VEINTE Y SIETE DÓLARES CON 50/100"— y limpiar todo lo que no sea dígito
 *     saca de ahí un 50100. En una proforma esa fila entró como un renglón de
 *     $50.100 y la comparación pasó a decir cien mil dólares que no existen en
 *     ningún papel. En un presupuesto de ciento setenta rubros entraría igual y
 *     no lo ve nadie: desde el contrato se propaga al control y a los
 *     beneficios.
 *
 *   · Y la unidad viaja pegada a la cantidad: "80 m2", "0.5 GLB", "3 MESES".
 *     Limpiar los no-dígitos convierte "80 m2" en 802 —el 2 del metro cuadrado
 *     se pega al 80— y el rubro entra con ochocientas dos unidades. Es un error
 *     silencioso: el total del papel sigue cuadrando porque la cantidad no se
 *     usa para sumarlo, y la cantidad mal leída recién se nota en la obra.
 *
 * Descartar la celda que trae tres letras seguidas resuelve la primera y rompe
 * la segunda: de 2.116 rubros cargados, 256 tienen la unidad en tres letras o
 * más —GLB, MES, MESES, PTO, GBL, SEMANA, VIAJE, JGO, DIA— y a todos esos les
 * leería cantidad 0. Lo que separa un caso del otro es por dónde EMPIEZA la
 * celda: el importe en letras empieza con letras, la cantidad con su número.
 */
export function numeroDeCelda(v) {
  if (typeof v === "number") return v;
  // La moneda no descalifica: "$ 1.200" y "USD 340" son importes, no texto.
  const t = String(v ?? "")
    .replace(/\b(usd|us\$|dólares|dolares|dls)\b/gi, "")
    .replace(/\$/g, "")
    .trim();
  const m = /^-?\d[\d.,]*/.exec(t);
  return m ? num(m[0]) : 0;
}
