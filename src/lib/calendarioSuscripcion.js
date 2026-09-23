import { supabase } from "./supabase";

// El enlace con el que cada quien ve sus tareas de FOREMAN en el calendario
// que ya usa: Google, el del iPhone, Outlook.
//
// La llave va en la dirección y es larga al azar, porque un calendario
// suscrito no puede iniciar sesión. Quien la tenga ve ese calendario: es como
// una invitación, y por eso se puede cambiar cuando haga falta.

const nuevaLlave = () => {
  const b = new Uint8Array(24);
  (window.crypto || window.msCrypto).getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, "0")).join("");
};

const direccion = llave => `${window.location.origin}/api/calendario?k=${llave}`;

/** @returns { url } · { error } · { faltaMigracion: true } */
export async function enlaceCalendario(usuarioId, { renovar = false } = {}) {
  const { data, error } = await supabase.from("usuarios").select("calendario_token").eq("id", usuarioId).single();
  if (error) {
    return /column|schema cache|does not exist/i.test(error.message) ? { faltaMigracion: true } : { error: error.message };
  }
  if (data?.calendario_token && !renovar) return { url: direccion(data.calendario_token) };

  const llave = nuevaLlave();
  const { error: e2 } = await supabase.from("usuarios").update({ calendario_token: llave }).eq("id", usuarioId);
  if (e2) return { error: e2.message };
  return { url: direccion(llave), nuevo: true };
}
