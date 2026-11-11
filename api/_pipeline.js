// Lo que hace falta saber de un proyecto para contarlo: en qué etapa está, qué
// sigue, con qué fechas y quién responde. Lo usan el informe que
// se manda a mano y el resumen diario.

import { rest } from "./_supabase.js";
import { LECTURA } from "./_modelos.js";

// El texto de una respuesta de NOVA. No es content[0]: un modelo con
// razonamiento extendido devuelve primero un bloque "thinking" y leer el
// primero da undefined, con la respuesta buena ahí al lado.
const textoDeNova = d => (Array.isArray(d?.content)
  ? d.content.filter(b => b?.type === "text").map(b => b.text).join("") || d.content[0]?.text || ""
  : "");

export const hoy = () => new Date().toISOString().split("T")[0];
export const enDias = n => new Date(Date.now() + n * 86400000).toISOString().split("T")[0];

export async function json(r) {
  try {
    const d = await r.json();
    if (Array.isArray(d)) return d;
    // Un error de PostgREST viene como objeto ({ message, code }). Envolverlo
    // en una lista lo convertía en una fila fantasma: así salió un resumen con
    // "SIN RESPONSABLE · 1" y una tarea sin título, que era el error disfrazado.
    if (d && (d.message || d.code || d.error)) return [];
    return d ? [d] : [];
  } catch { return []; }
}

/**
 * Trae una tabla probando columnas de menos si alguna no existe.
 *
 * La base se migra a mano, así que una columna puede no estar todavía. Antes
 * eso hacía fallar la consulta entera y el correo salía vacío sin decir por
 * qué; ahora se cae al juego de columnas que sí existe y el trabajo sigue.
 */
export async function traer(tabla, intentos) {
  for (const columnas of intentos) {
    const r = await rest(`${tabla}?select=${columnas}`);
    if (r.ok) return { filas: await json(r), columnas };
    // 400: alguna columna no existe. Cualquier otro error no se arregla
    // pidiendo menos, así que no se insiste.
    if (r.status !== 400) break;
  }
  return { filas: [], columnas: null };
}

/**
 * Lo que hay que saber de un proyecto para contarlo.
 *
 * La etapa es UNA y la dice el lead (`leads.etapa`): no hay etapas por proyecto
 * con su estado. Lo que sigue son sus tareas abiertas —las mismas de Tareas—,
 * sin las compras, que tienen su módulo.
 */
export async function datosDelProyecto(leadId) {
  const [lead] = await json(await rest(`leads?id=eq.${leadId}&select=*`));
  if (!lead) return null;
  const [catalogo, tareas, invitados, accesos, movs, usuarios] = await Promise.all([
    json(await rest(`pipeline_etapas?select=id,nombre,orden&order=orden`)),
    json(await rest(`tasks?lead_id=eq.${leadId}&select=id,title,due_date,status,assignee_id,type,compra_id&order=due_date.asc.nullslast`)),
    json(await rest(`pipeline_invitados?lead_id=eq.${leadId}&select=*`)),
    json(await rest(`lead_accesos?lead_id=eq.${leadId}&select=usuario_id`)),
    json(await rest(`lead_movimientos?lead_id=eq.${leadId}&select=detalle,created_at,autor_nombre&order=created_at.desc&limit=12`)),
    json(await rest(`usuarios?select=id,nombre,email,rol,activo`)),
  ]);
  const nombreEtapa = id => catalogo.find(c => c.id === id)?.nombre || null;
  const pasos = tareas.filter(t => !t.compra_id && t.type !== "Compra");
  return {
    lead, catalogo, pasos, invitados, accesos, movs, usuarios, nombreEtapa,
    // Un aprobado ya no está en ninguna etapa del pipeline: está aprobado.
    etapa: lead.resultado === "ganado" ? "Aprobado" : lead.resultado === "perdido" ? "Perdido" : nombreEtapa(lead.etapa) || "Sin etapa",
    responsable: usuarios.find(u => u.id === lead.responsable_id) || null,
    pendientes: pasos.filter(p => p.status !== "listo"),
    hechas: pasos.filter(p => p.status === "listo"),
    // Si la pelota está del lado del cliente, se dice: es la mitad de «en qué va».
    espera: lead.espera_desde && !lead.resultado
      ? { desde: String(lead.espera_desde).slice(0, 10), que: lead.espera_que || null } : null,
  };
}

/** A quién le llega: a quien lleva el proyecto, a su equipo, o a todos. */
export function destinatarios(d, a) {
  if (Array.isArray(a)) return a.filter(x => /@/.test(x));
  const conAcceso = new Set([d.lead.created_by, ...d.accesos.map(x => x.usuario_id)]);
  const equipo = d.usuarios.filter(u => conAcceso.has(u.id) && u.email && u.activo !== false).map(u => u.email);
  if (a === "equipo") return equipo;
  if (a === "todos") return [...equipo, ...d.invitados.map(i => i.email).filter(Boolean)];
  // «responsable»: quien lleva el proyecto. Si no tiene correo, el primero del equipo.
  return d.responsable?.email && d.responsable.activo !== false ? [d.responsable.email] : equipo.slice(0, 1);
}

/** El resumen en texto plano, por si NOVA no contesta: nunca se queda sin informe. */
export function resumenPlano(d) {
  const lineas = [];
  lineas.push(`Etapa: ${d.etapa}.`);
  if (d.espera) lineas.push(`Esperando respuesta del cliente desde el ${d.espera.desde}${d.espera.que ? `: ${d.espera.que}` : ""}.`);
  if (d.hechas.length) lineas.push(`Hecho hasta ahora: ${d.hechas.length} ${d.hechas.length === 1 ? "tarea" : "tareas"}.`);
  const pasos = d.pendientes.slice(0, 6);
  if (pasos.length) lineas.push("Lo que sigue:");
  pasos.forEach(p => lineas.push(`- ${p.title}${p.due_date ? ` · ${p.due_date}` : " · sin fecha"}`));
  if (!pasos.length && !d.espera) lineas.push("No tiene próximo paso anotado.");
  return lineas.join("\n");
}

/**
 * NOVA arma el informe: qué se avanzó, qué sigue y con qué fechas. Si falla,
 * se manda el resumen plano: un informe que no sale no sirve de nada.
 */
export async function informeDeNova(d, { motivo, paraCliente }) {
  if (!process.env.ANTHROPIC_API_KEY) return resumenPlano(d);
  const contexto = {
    proyecto: d.lead.nombre,
    cliente: d.lead.contacto || null,
    etapa_actual: d.etapa,
    responsable: d.responsable?.nombre || d.lead.responsable_nombre || null,
    esperando_al_cliente: d.espera,
    pasos_pendientes: d.pendientes.map(p => ({ paso: p.title, para: p.due_date })),
    pasos_hechos: d.hechas.slice(-8).map(p => ({ paso: p.title, cuando: p.due_date })),
    ultimos_movimientos: d.movs.slice(0, 8).map(m => ({ que: m.detalle, cuando: (m.created_at || "").slice(0, 10) })),
  };
  const sistema = `Escribes informes de avance de proyectos de arquitectura y construcción en Ecuador.
Hoy es ${hoy()}. Escribe en español claro y directo, sin jerga ni saludos largos.
${paraCliente ? "El informe va a un cliente o proveedor externo: no menciones montos, ni notas internas, ni nombres del equipo que no le consten." : "El informe va a alguien del equipo."}
Estructura: un párrafo con lo avanzado, luego una lista con lo que sigue y su fecha, y cierra con lo que hace falta de la otra parte, si aplica.
Máximo 180 palabras. No inventes nada que no esté en los datos; si algo no está, no lo menciones.`;
  const cuerpo = `Motivo del informe: ${motivo || "actualización"}.\n\nDatos:\n${JSON.stringify(contexto, null, 1)}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: LECTURA, max_tokens: 700, system: sistema, messages: [{ role: "user", content: cuerpo }] }),
    });
    const datos = await r.json();
    const texto = textoDeNova(datos)?.trim();
    return texto || resumenPlano(d);
  } catch {
    return resumenPlano(d);
  }
}
