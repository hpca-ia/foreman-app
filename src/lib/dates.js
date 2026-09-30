/**
 * Leer una fecha de la base sin que se corra un día.
 *
 * Una fecha sola —"2026-09-30", que es como Postgres guarda un `date`— el
 * navegador la lee como medianoche en Londres, y en Quito eso es el 29 a las
 * 19:00. Así, una reunión del 30 aparecía el 29 en el calendario. Se arma al
 * mediodía local: a esa hora ninguna zona horaria del planeta la corre de día.
 *
 * Lo que ya trae hora —un timestamp— se lee tal cual, que ahí sí está dicho a
 * qué momento se refiere.
 */
export function aFecha(f) {
  if (!f) return null;
  const texto = String(f);
  const solo = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = solo ? new Date(`${texto}T12:00:00`) : new Date(texto);
  return isNaN(d) ? null : d;
}

/** La misma fecha como "2026-09-30", para usarla de clave sin ambigüedad. */
export function claveFecha(f) {
  const d = aFecha(f);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Cuántos días faltan para esa fecha. Sin fecha —o con una fecha rota— devuelve
// Infinity: no tiene día, así que no vence nunca. Antes devolvía el número de
// días desde 1970 y una gestión sin fecha aparecía "Vencida 20720d" y arriba de
// todo, que es peor que no mostrar nada.
export function daysUntil(d) {
  const hasta = aFecha(d);
  if (!hasta) return Infinity;
  // Los dos al mediodía: comparar mediodía contra medianoche hacía que el
  // resultado dependiera del huso horario y de un redondeo.
  hasta.setHours(12, 0, 0, 0);
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  return Math.round((hasta - hoy) / 86400000);
}

export function timeAgo(ts) {
  const m = Math.floor((new Date() - new Date(ts)) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function initials(name) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}
