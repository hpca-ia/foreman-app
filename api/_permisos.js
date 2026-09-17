// Lo que cada rol puede hacer, del lado del servidor.
//
// NOVA por WhatsApp no pasa por la pantalla de FOREMAN: nadie le escondió un
// botón. Si un residente le pregunta cuánto lleva gastada una obra, la única
// barrera es esta. Por eso el permiso se comprueba acá, en el servidor, y no
// se le cree al modelo lo que decida.
//
// El catálogo completo y los valores de fábrica viven en src/lib/permisos.js
// —lo que el Director ve como interruptores en Ajustes—. Acá están solo los
// permisos que usan las herramientas de WhatsApp, con los mismos valores.

import { rest } from "./_supabase.js";

const DE_FABRICA = {
  assistant:     { "tareas.todas": true,  "tareas.asignar": true,  "montos.ver": true,  "controlObra.ver": true,  "leads.ver": false },
  gerente:       { "tareas.todas": false, "tareas.asignar": true,  "montos.ver": true,  "controlObra.ver": true,  "leads.ver": false },
  arquitecto:    { "tareas.todas": false, "tareas.asignar": true,  "montos.ver": true,  "controlObra.ver": true,  "leads.ver": false },
  arquitecto_jr: { "tareas.todas": false, "tareas.asignar": false, "montos.ver": false, "controlObra.ver": true,  "leads.ver": false },
  residente:     { "tareas.todas": false, "tareas.asignar": false, "montos.ver": false, "controlObra.ver": false, "leads.ver": false },
};

/**
 * `puede("montos.ver")` para esta persona. El Director siempre puede: si sus
 * permisos fueran editables, un error de edición lo dejaría fuera de su propia
 * app.
 */
export async function permisosDe(usuario) {
  if (usuario?.rol === "owner") return () => true;
  const base = { ...(DE_FABRICA[usuario?.rol] || DE_FABRICA.residente) };
  try {
    const r = await rest(`permisos_rol?rol=eq.${encodeURIComponent(usuario?.rol || "")}&select=permiso,activo`);
    const guardados = await r.json();
    (Array.isArray(guardados) ? guardados : []).forEach(({ permiso, activo }) => { base[permiso] = !!activo; });
  } catch {}
  return permiso => !!base[permiso];
}
