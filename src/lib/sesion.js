import { supabase } from "./supabase";

// La sesión con la que la base y las funciones del servidor reconocen a quien
// entró. Sin ella, cuando la base esté cerrada, no responde nada.

/** { configurado, usuarios } — si el ingreso por servidor está activo. */
export async function estadoLogin() {
  try {
    const r = await fetch("/api/login");
    if (!r.ok) return { configurado: false };
    return await r.json();
  } catch {
    // En desarrollo local /api no existe y responde la página: se entra como antes.
    return { configurado: false };
  }
}

/** { usuario } si entró; { error, status } si no. */
export async function entrar(usuarioId, pin) {
  let r, datos = {};
  try {
    r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuarioId, pin }) });
    datos = await r.json().catch(() => ({}));
  } catch (e) {
    return { error: "Sin conexión: " + e.message, status: 0 };
  }
  if (!r.ok || !datos.session) return { error: datos.error || "No se pudo entrar", status: r.status };
  const { error } = await supabase.auth.setSession({ access_token: datos.session.access_token, refresh_token: datos.session.refresh_token });
  if (error) return { error: "No se pudo guardar la sesión: " + error.message, status: 500 };
  return { usuario: datos.usuario };
}

export async function salir() {
  try { await supabase.auth.signOut(); } catch {}
}

export async function haySesion() {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

// Todas las llamadas a /api/ (NOVA, correo) llevan la sesión. Se hace acá una
// vez en lugar de tocar cada fetch repartido por la app.
export function instalarSesionEnApi() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.startsWith("/api/") && !url.startsWith("/api/login")) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        const headers = new Headers(init.headers || (typeof input === "string" ? undefined : input.headers));
        if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
        init = { ...init, headers };
      }
    }
    return original(input, init);
  };
}
