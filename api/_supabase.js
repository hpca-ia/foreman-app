// Acceso a Supabase desde el servidor (Vercel). Los archivos de /api que
// empiezan con "_" no son rutas: esto solo lo usan las otras funciones.
//
// La llave secreta vive en las variables de entorno de Vercel, nunca en la app
// ni en el repositorio: con ella se salta cualquier regla de la base.

export const SUPABASE_URL = "https://qxoincfvscvbqvoxamdi.supabase.co";
const secreta = () => process.env.SUPABASE_SECRET_KEY || "";

export const configurado = () => !!secreta();

function cabeceras(extra = {}) {
  const k = secreta();
  // Las llaves nuevas (sb_secret_…) van solo como apikey; la service_role
  // vieja es un JWT y va también como Bearer.
  return { apikey: k, ...(k.startsWith("eyJ") ? { Authorization: `Bearer ${k}` } : {}), "Content-Type": "application/json", ...extra };
}

export const rest = (ruta, op = {}) => fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, { ...op, headers: cabeceras(op.headers) });
export const auth = (ruta, op = {}) => fetch(`${SUPABASE_URL}/auth/v1/${ruta}`, { ...op, headers: cabeceras(op.headers) });

/** El usuario de Supabase Auth dueño del token que manda la app, o null. */
export async function usuarioDeToken(req) {
  const token = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !configurado()) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: secreta(), Authorization: `Bearer ${token}` } });
  return r.ok ? r.json() : null;
}

/**
 * ¿La llamada viene de alguien que entró a FOREMAN? Mientras la llave no esté
 * configurada se deja pasar, para que la app no se caiga durante el cambio.
 */
export async function sesionValida(req) {
  if (!configurado()) return true;
  return !!(await usuarioDeToken(req));
}
