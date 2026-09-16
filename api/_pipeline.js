// Lo que hace falta saber de un proyecto del pipeline para contarlo: en qué
// etapa va, qué sigue, con qué fechas y quién responde. Lo usan el informe que
// se manda a mano y el resumen diario.

import { rest } from "./_supabase.js";

export const hoy = () => new Date().toISOString().split("T")[0];
export const enDias = n => new Date(Date.now() + n * 86400000).toISOString().split("T")[0];

export async function json(r) {
  try { const d = await r.json(); return Array.isArray(d) ? d : d ? [d] : []; } catch { return []; }
}

export async function datosDelProyecto(leadId) {
  const [lead] = await json(await rest(`leads?id=eq.${leadId}&select=*`));
  if (!lead) return null;
  const [etapas, catalogo, pasos, invitados, accesos, movs, usuarios] = await Promise.all([
    json(await rest(`lead_etapas?lead_id=eq.${leadId}&select=*&order=orden`)),
    json(await rest(`pipeline_etapas?select=id,nombre,orden&order=orden`)),
    json(await rest(`tasks?lead_id=eq.${leadId}&select=id,title,due_date,status,assignee_id&order=ruta_orden`)),
    json(await rest(`pipeline_invitados?lead_id=eq.${leadId}&select=*`)),
    json(await rest(`lead_accesos?lead_id=eq.${leadId}&select=usuario_id`)),
    json(await rest(`lead_movimientos?lead_id=eq.${leadId}&select=detalle,created_at,autor_nombre&order=created_at.desc&limit=12`)),
    json(await rest(`usuarios?select=id,nombre,email,rol,activo`)),
  ]);
  const nombreEtapa = id => catalogo.find(c => c.id === id)?.nombre || id;
  const actual = etapas.find(e => e.estado === "en_curso") || null;
  return {
    lead, etapas, catalogo, pasos, invitados, accesos, movs, usuarios, nombreEtapa, actual,
    hechas: etapas.filter(e => e.estado === "hecha").length,
    pendientes: pasos.filter(p => p.status === "pendiente"),
  };
}

/** A quién le llega: el responsable de la etapa, el equipo del proyecto, o todos. */
export function destinatarios(d, a) {
  if (Array.isArray(a)) return a.filter(x => /@/.test(x));
  const conAcceso = new Set([d.lead.created_by, ...d.accesos.map(x => x.usuario_id)]);
  const equipo = d.usuarios.filter(u => conAcceso.has(u.id) && u.email && u.activo !== false).map(u => u.email);
  if (a === "equipo") return equipo;
  if (a === "todos") return [...equipo, ...d.invitados.map(i => i.email).filter(Boolean)];
  // responsable de la etapa en curso: puede ser del equipo o de fuera
  if (!d.actual) return equipo.slice(0, 1);
  if (d.actual.invitado_id) {
    const inv = d.invitados.find(i => i.id === d.actual.invitado_id);
    return [inv?.email].filter(Boolean);
  }
  const u = d.usuarios.find(x => x.id === d.actual.responsable_id);
  return [u?.email].filter(Boolean);
}

/** El resumen en texto plano, por si NOVA no contesta: nunca se queda sin informe. */
export function resumenPlano(d) {
  const lineas = [];
  lineas.push(`Etapa actual: ${d.actual ? d.nombreEtapa(d.actual.etapa_id) : "sin etapa en curso"}${d.actual?.fecha_objetivo ? ` (para el ${d.actual.fecha_objetivo})` : ""}.`);
  lineas.push(`Avance: ${d.hechas} de ${d.etapas.length} etapas.`);
  const siguen = d.etapas.filter(e => e.estado === "pendiente").slice(0, 4);
  if (siguen.length) lineas.push("Lo que viene:");
  siguen.forEach(e => lineas.push(`- ${d.nombreEtapa(e.etapa_id)}${e.fecha_objetivo ? ` · ${e.fecha_objetivo}` : ""}${e.responsable_nombre ? ` · ${e.responsable_nombre}` : ""}`));
  const pasos = d.pendientes.slice(0, 5);
  if (pasos.length) lineas.push("Próximos pasos:");
  pasos.forEach(p => lineas.push(`- ${p.title}${p.due_date ? ` · ${p.due_date}` : ""}`));
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
    etapa_actual: d.actual ? d.nombreEtapa(d.actual.etapa_id) : null,
    fecha_objetivo: d.actual?.fecha_objetivo || null,
    responsable: d.actual?.responsable_nombre || null,
    etapas: d.etapas.map(e => ({ etapa: d.nombreEtapa(e.etapa_id), estado: e.estado, para: e.fecha_objetivo, responsable: e.responsable_nombre })),
    pasos_pendientes: d.pendientes.map(p => ({ paso: p.title, para: p.due_date })),
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
      body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 700, system: sistema, messages: [{ role: "user", content: cuerpo }] }),
    });
    const datos = await r.json();
    const texto = datos.content?.[0]?.text?.trim();
    return texto || resumenPlano(d);
  } catch {
    return resumenPlano(d);
  }
}
