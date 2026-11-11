import { supabase } from "./supabase";
import { loadFromStorage, saveToStorage } from "./storage";
import { initials } from "./dates";
import { USERS_DEFAULT } from "./seedData";

// La gente de la oficina, compartida entre todos los equipos.
//
// Antes cada navegador tenía su propia lista en localStorage, así que un
// usuario creado en la laptop no aparecía en el teléfono. Ahora la base es la
// fuente de verdad y el navegador solo guarda una copia para arrancar rápido.
//
// Acá también vivía una lista de proyectos «de Ajustes», distinta de la del
// pipeline. Se fue en la fase 6 de la reingeniería: los proyectos son los del
// pipeline, y quién entra a cada uno se decide en Ajustes → Proyectos.

const VIEJO_U = "foreman_users";
const CACHE_U = "foreman_cache_usuarios";
const SUBIDO = "foreman_equipo_subido";

export async function hashPin(id, pin) {
  const datos = new TextEncoder().encode(`foreman:${id}:${pin}`);
  const huella = await crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(huella)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export const deUsuario = r => ({
  id: r.id, name: r.nombre, role: r.rol, pin_hash: r.pin_hash, color: r.color,
  email: r.email, phone: r.telefono, avatar: initials(r.nombre),
});

/** Lo último que se vio, para no arrancar con la pantalla vacía. */
export function equipoEnCache() {
  return {
    usuarios: loadFromStorage(CACHE_U, null) || loadFromStorage(VIEJO_U, USERS_DEFAULT),
  };
}

async function leer() {
  const u = await supabase.from("usuarios").select("*").eq("activo", true).order("created_at");
  if (u.error) return null;
  return { usuarios: u.data || [] };
}

// La primera vez que un equipo abre esta versión, sube lo que tenía guardado.
// Solo agrega lo que la base no tiene: si un id ya existe, gana lo de la base,
// para que un teléfono con una lista vieja no pise cambios hechos en otro lado.
async function subirLoLocal(remoto) {
  if (loadFromStorage(SUBIDO, false)) return false;

  const locU = loadFromStorage(VIEJO_U, null);
  // Un equipo sin nada guardado solo siembra los valores de fábrica si la base
  // está vacía; si no, reintroduciría gente que alguien ya sacó.
  const usuarios = locU || (remoto.usuarios.length ? [] : USERS_DEFAULT);

  if (usuarios.length) {
    const filas = await Promise.all(usuarios.map(async u => ({
      id: u.id, nombre: u.name, rol: u.role || "residente", color: u.color || null,
      email: u.email || null, telefono: u.phone || null,
      pin_hash: u.pin ? await hashPin(u.id, u.pin) : null,
    })));
    const { error } = await supabase.from("usuarios").upsert(filas, { onConflict: "id", ignoreDuplicates: true });
    if (error) return false;
  }
  saveToStorage(SUBIDO, true);
  // Las listas viejas tenían los PIN en texto plano: una vez arriba, se borran.
  try { localStorage.removeItem(VIEJO_U); } catch {}
  return true;
}

/**
 * Devuelve { usuarios, remoto }. Si la migración todavía no se
 * corrió, `remoto` es false y se sigue con la lista del navegador, para que la
 * app no deje de funcionar mientras tanto.
 */
export async function cargarEquipo() {
  let datos = await leer();
  if (!datos) return { ...equipoEnCache(), remoto: false };

  if (await subirLoLocal(datos)) datos = (await leer()) || datos;

  const usuarios = datos.usuarios.map(deUsuario);
  saveToStorage(CACHE_U, usuarios);
  return { usuarios, remoto: true };
}

export async function guardarUsuario(u) {
  const fila = {
    id: u.id, nombre: u.name.trim(), rol: u.role, color: u.color || null,
    email: u.email || null, telefono: u.phone || null, activo: true,
    actualizado_at: new Date().toISOString(),
  };
  // Al editar, un PIN vacío significa "no lo cambies".
  if (u.pin) fila.pin_hash = await hashPin(u.id, u.pin);
  return supabase.from("usuarios").upsert(fila, { onConflict: "id" });
}

// No se borra de verdad: tiene tareas asignadas y un historial que debe seguir
// mostrando su nombre. Solo deja de poder entrar y de aparecer en las listas.
export function desactivarUsuario(id) {
  return supabase.from("usuarios").update({ activo: false }).eq("id", id);
}
