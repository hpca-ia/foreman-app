import { supabase } from "./supabase";
import { loadFromStorage, saveToStorage } from "./storage";
import { initials } from "./dates";
import { USERS_DEFAULT, PROJECTS_DEFAULT } from "./seedData";

// Usuarios y proyectos compartidos entre todos los equipos.
//
// Antes cada navegador tenía su propia lista en localStorage, así que un
// proyecto creado en la laptop no aparecía en el teléfono. Ahora la base es la
// fuente de verdad y el navegador solo guarda una copia para arrancar rápido.

const VIEJO_U = "foreman_users";
const VIEJO_P = "foreman_projects";
const CACHE_U = "foreman_cache_usuarios";
const CACHE_P = "foreman_cache_proyectos";
const SUBIDO = "foreman_equipo_subido";

export const TIPOS_PROYECTO = [
  { id: "obra", label: "Obra" },
  { id: "administracion", label: "Administración" },
  { id: "gerencia", label: "Gerencia" },
  { id: "mensajeria", label: "Mensajería" },
  { id: "otro", label: "Otro" },
];

export async function hashPin(id, pin) {
  const datos = new TextEncoder().encode(`foreman:${id}:${pin}`);
  const huella = await crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(huella)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const deUsuario = r => ({
  id: r.id, name: r.nombre, role: r.rol, pin_hash: r.pin_hash, color: r.color,
  email: r.email, phone: r.telefono, avatar: initials(r.nombre),
});

const deProyecto = (r, miembros) => ({
  id: r.id, name: r.nombre, color: r.color, tipo: r.tipo || "otro", obra_id: r.obra_id,
  miembros: miembros.filter(m => m.proyecto_id === r.id).map(m => m.usuario_id),
});

/** Lo último que se vio, para no arrancar con la pantalla vacía. */
export function equipoEnCache() {
  return {
    usuarios: loadFromStorage(CACHE_U, null) || loadFromStorage(VIEJO_U, USERS_DEFAULT),
    proyectos: loadFromStorage(CACHE_P, null) || loadFromStorage(VIEJO_P, PROJECTS_DEFAULT),
  };
}

async function leer() {
  const [u, p, m] = await Promise.all([
    supabase.from("usuarios").select("*").eq("activo", true).order("created_at"),
    supabase.from("proyectos").select("*").eq("activo", true).order("created_at"),
    supabase.from("proyecto_miembros").select("*"),
  ]);
  if (u.error || p.error || m.error) return null;
  return { usuarios: u.data || [], proyectos: p.data || [], miembros: m.data || [] };
}

// La primera vez que un equipo abre esta versión, sube lo que tenía guardado.
// Solo agrega lo que la base no tiene: si un id ya existe, gana lo de la base,
// para que un teléfono con una lista vieja no pise cambios hechos en otro lado.
async function subirLoLocal(remoto) {
  if (loadFromStorage(SUBIDO, false)) return false;

  const locU = loadFromStorage(VIEJO_U, null);
  const locP = loadFromStorage(VIEJO_P, null);
  // Un equipo sin nada guardado solo siembra los valores de fábrica si la base
  // está vacía; si no, reintroduciría proyectos que alguien ya sacó.
  const usuarios = locU || (remoto.usuarios.length ? [] : USERS_DEFAULT);
  const proyectos = locP || (remoto.proyectos.length ? [] : PROJECTS_DEFAULT);

  if (usuarios.length) {
    const filas = await Promise.all(usuarios.map(async u => ({
      id: u.id, nombre: u.name, rol: u.role || "residente", color: u.color || null,
      email: u.email || null, telefono: u.phone || null,
      pin_hash: u.pin ? await hashPin(u.id, u.pin) : null,
    })));
    const { error } = await supabase.from("usuarios").upsert(filas, { onConflict: "id", ignoreDuplicates: true });
    if (error) return false;
  }
  if (proyectos.length) {
    const { error } = await supabase.from("proyectos").upsert(
      proyectos.map(p => ({ id: p.id, nombre: p.name, color: p.color || null, tipo: "otro" })),
      { onConflict: "id", ignoreDuplicates: true }
    );
    if (error) return false;
  }

  saveToStorage(SUBIDO, true);
  // Las listas viejas tenían los PIN en texto plano: una vez arriba, se borran.
  try { localStorage.removeItem(VIEJO_U); localStorage.removeItem(VIEJO_P); } catch {}
  return true;
}

/**
 * Devuelve { usuarios, proyectos, remoto }. Si la migración todavía no se
 * corrió, `remoto` es false y se sigue con la lista del navegador, para que la
 * app no deje de funcionar mientras tanto.
 */
export async function cargarEquipo() {
  let datos = await leer();
  if (!datos) return { ...equipoEnCache(), remoto: false };

  if (await subirLoLocal(datos)) datos = (await leer()) || datos;

  const usuarios = datos.usuarios.map(deUsuario);
  const proyectos = datos.proyectos.map(r => deProyecto(r, datos.miembros));
  saveToStorage(CACHE_U, usuarios);
  saveToStorage(CACHE_P, proyectos);
  return { usuarios, proyectos, remoto: true };
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

export async function guardarProyecto(p, creadoPor) {
  const { error } = await supabase.from("proyectos").upsert({
    id: p.id, nombre: p.name.trim(), color: p.color || null, tipo: p.tipo || "otro",
    obra_id: p.obra_id || null, activo: true, created_by: creadoPor ?? null,
  }, { onConflict: "id" });
  if (error) return { error };
  await supabase.from("proyecto_miembros").delete().eq("proyecto_id", p.id);
  const miembros = [...new Set(p.miembros || [])];
  if (miembros.length) {
    const r = await supabase.from("proyecto_miembros").insert(miembros.map(usuario_id => ({ proyecto_id: p.id, usuario_id })));
    if (r.error) return { error: r.error };
  }
  return { error: null };
}

export function desactivarProyecto(id) {
  return supabase.from("proyectos").update({ activo: false }).eq("id", id);
}
