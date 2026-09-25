// Cuántos días faltan para esa fecha. Sin fecha —o con una fecha rota— devuelve
// Infinity: no tiene día, así que no vence nunca. Antes devolvía el número de
// días desde 1970 y una gestión sin fecha aparecía "Vencida 20720d" y arriba de
// todo, que es peor que no mostrar nada.
export function daysUntil(d) {
  if (!d) return Infinity;
  const hasta = new Date(d);
  if (isNaN(hasta)) return Infinity;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.ceil((hasta - t) / 86400000);
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
