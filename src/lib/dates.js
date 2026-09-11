export function daysUntil(d) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(d) - t) / 86400000);
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
