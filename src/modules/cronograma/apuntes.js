// Los apuntes de NOVA, dichos en palabras para la consulta.
//
// Está aparte de `memoriaNova` —que es el que habla con la base— por una
// razón: ACÁ ES DONDE SE ROMPIÓ. Un apunte guardado bien y dictado mal no
// sirve para nada, y era imposible darse cuenta sin leer la consulta armada.
// Separado y sin base de datos se puede probar, y hay pruebas.

/** Las palabras que hacen reconocible a un rubro, sin las de relleno. */
const RELLENO = new Set([
  "de", "del", "la", "el", "los", "las", "y", "en", "con", "para", "por", "a",
  "provision", "provisión", "instalacion", "instalación", "suministro", "incluye",
  "colocacion", "colocación", "montaje", "mano", "obra", "material", "equipo",
]);

export function patronDe(descripcion) {
  return String(descripcion || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(p => p.length > 3 && !RELLENO.has(p))
    .slice(0, 4)
    .join(" ");
}

const miles = v => Math.round(v).toLocaleString("es-EC");

/** Un apunte de cronograma dicho en una línea: el rendimiento, que es lo que viaja. */
function duracionEnPalabras(m) {
  const r = m.rendimiento;
  const veces = m.veces > 1 ? ` [corregido ${m.veces} veces]` : "";
  if (r?.rinde) {
    return `· "${m.patron}" → ${r.rinde} ${r.unidad} por día`
      + ` (en esa obra: ${miles(r.cantidad)} ${r.unidad} en ${r.dias} días hábiles)${veces}`;
  }
  // Sin cantidades solo quedan los días, y hay que decir que son de OTRA obra:
  // es un número para mirar de reojo, no para copiar.
  const dias = r?.dias || m.anticipacion;
  if (!dias) return "";
  return `· "${m.patron}" → ${dias} días hábiles en una obra anterior`
    + ` (sin cantidades: no se sabe de qué tamaño era)${veces}`;
}

/** Un apunte de valorado: la forma del pago, que es lo que no cambia de obra en obra. */
function pagoEnPalabras(m) {
  const forma = Array.isArray(m.pagos) && m.pagos.length
    ? m.pagos.map(p => `${p.pct}%`).join(" / ")
    : "";
  const cuando = m.anticipacion
    ? `, el primer pago ${m.anticipacion} ${m.anticipacion === 1 ? "mes" : "meses"} antes de instalar`
    : "";
  return `· "${m.patron}" → ${m.perfil || "especial"}${forma ? `, ${forma}` : ""}${cuando}`
    + (m.nota ? ` (${m.nota})` : "")
    + (m.veces > 1 ? ` [confirmado ${m.veces} veces]` : "");
}

/**
 * La memoria dicha para la consulta.
 *
 * Va en el sistema, antes de los rubros, porque es contexto y no una pregunta.
 * Se dice que son decisiones de ESTA oficina y no reglas generales: NOVA tiene
 * que poder apartarse si el rubro claramente no es el mismo caso, y para eso
 * necesita saber de dónde viene el apunte.
 *
 * CADA TEMA SE DICE DISTINTO, y acá estaba el agujero. Los apuntes de
 * cronograma guardan un rendimiento —18 m2 por día— y se estaban dictando con
 * el molde del valorado, que habla de porcentajes y de anticipos. Donde dice
 * "35 días hábiles" salía escrito "el primer pago 35 meses antes de instalar".
 * NOVA recibía como dato la única cosa que no era: una forma de pago inventada
 * a partir de una duración. Lo bueno —el rendimiento— quedaba escondido en un
 * paréntesis, al lado de una frase que lo contradecía.
 */
export function memoriaEnPalabras(memoria = [], tema = "valorado") {
  if (!memoria.length) return "";
  const esCrono = tema === "cronograma";
  const lineas = memoria.slice(0, 25)
    .map(m => (esCrono ? duracionEnPalabras(m) : pagoEnPalabras(m)))
    .filter(Boolean);
  if (!lineas.length) return "";

  if (esCrono) {
    return `
RENDIMIENTOS DE ESTA OFICINA, medidos en obras que ya se hicieron. Salen de
duraciones que alguien corrigió a mano después de ver la obra andando, así que
valen MÁS que cualquier rendimiento de tabla:
${lineas.join("\n")}

Cuando una agrupación se parezca a una de estas, la duración sale de dividir SU
cantidad para ESE rendimiento, y lo escribís así en "porque": "450 m2 ÷ 18
m2/día de la oficina = 25 días". Solo apartate si es claramente otro caso
—otro sistema, otra altura, otra ciudad— y entonces decí por qué en "porque".
`;
  }
  return `
LO QUE ESTA OFICINA YA DECIDIÓ EN OBRAS ANTERIORES. Son correcciones hechas a mano
sobre propuestas tuyas, así que valen más que tu criterio general. Seguilas salvo
que este rubro sea claramente otro caso, y si te apartás decilo en "porque":
${lineas.join("\n")}
`;
}

/** Lo que la oficina ya demostró sobre un nombre, para marcarlo en la pantalla. */
export function apunteDe(memoria = [], nombre) {
  const p = patronDe(nombre);
  if (!p) return null;
  return (memoria || []).find(m => m.patron === p) || null;
}

/** El apunte dicho para una persona: lo que se lee al pasar el mouse. */
export function apunteEnUnaLinea(m) {
  if (!m) return "";
  const r = m.rendimiento;
  const veces = m.veces > 1 ? `, corregido ${m.veces} veces` : "";
  if (r?.rinde) return `La oficina ya midió esto: ${r.rinde} ${r.unidad} por día${veces}.`;
  const dias = r?.dias || m.anticipacion;
  return dias ? `En una obra anterior llevó ${dias} días hábiles${veces}.` : "";
}
