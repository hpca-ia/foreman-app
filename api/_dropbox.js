// Dejar un archivo en Dropbox.
//
// Es la única parte del respaldo que sabe de Dropbox: si mañana se cambia a
// Google Drive, se reemplaza este archivo y nada más.
//
// Dropbox no da una llave eterna: da un permiso largo (refresh token) con el
// que se pide un permiso corto cada vez. Los tres datos viven en las
// variables de entorno de Vercel, nunca en el repositorio:
//   DROPBOX_APP_KEY · DROPBOX_APP_SECRET · DROPBOX_REFRESH_TOKEN

const API = "https://api.dropboxapi.com/2";
const CONTENIDO = "https://content.dropboxapi.com/2";

export const configuradoDropbox = () =>
  !!(process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET && process.env.DROPBOX_REFRESH_TOKEN);

let cache = { token: "", vence: 0 };

async function token() {
  if (cache.token && Date.now() < cache.vence) return cache.token;
  const basica = Buffer.from(`${process.env.DROPBOX_APP_KEY}:${process.env.DROPBOX_APP_SECRET}`).toString("base64");
  const r = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basica}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: process.env.DROPBOX_REFRESH_TOKEN }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(`Dropbox no dio permiso: ${d.error_description || d.error || r.status}`);
  cache = { token: d.access_token, vence: Date.now() + (d.expires_in || 14400) * 1000 - 60000 };
  return cache.token;
}

/** Sube un archivo, pisando el que hubiera con ese nombre. */
export async function subir(ruta, contenido) {
  const r = await fetch(`${CONTENIDO}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({ path: ruta, mode: "overwrite", autorename: false, mute: true }),
    },
    body: contenido,
  });
  if (!r.ok) throw new Error(`Dropbox rechazó ${ruta}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

/** Lo que ya está guardado en una carpeta: para no volver a subir lo mismo. */
export async function listar(carpeta) {
  const t = await token();
  const rutas = new Map();
  let r = await fetch(`${API}/files/list_folder`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path: carpeta, recursive: true, limit: 2000 }),
  });
  // Carpeta que todavía no existe: no hay nada guardado.
  if (r.status === 409) return rutas;
  if (!r.ok) throw new Error(`Dropbox no pudo listar ${carpeta}: ${(await r.text()).slice(0, 160)}`);
  let d = await r.json();
  for (;;) {
    d.entries.filter(e => e[".tag"] === "file").forEach(e => rutas.set(e.path_lower, e.size));
    if (!d.has_more) return rutas;
    r = await fetch(`${API}/files/list_folder/continue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cursor: d.cursor }),
    });
    if (!r.ok) return rutas;
    d = await r.json();
  }
}

export async function borrar(ruta) {
  const r = await fetch(`${API}/files/delete_v2`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path: ruta }),
  });
  return r.ok;
}
