import { supabase } from "../../lib/supabase";
import { resumenDeObras, COLUMNAS_DE_RUBRO } from "../controlObra/resumenDeObras.js";
import { ABIERTAS } from "../compras/compras";
import { fichaDelProyecto, ordenarEnMarcha } from "./enMarcha.js";
import { hoyISO } from "./pipeline.js";

// Lo que hay que traer para armar las fichas de los proyectos aprobados.
//
// Una consulta por tabla para TODOS los proyectos, no una ronda por cada uno:
// con diez obras serían cien idas a la base para pintar una lista.
//
// Lo que se decide con eso no está acá: está en enMarcha.js y en
// resumenDeObras.js, que no tocan la base y por eso se pueden probar.

const filas = async consulta => { const { data, error } = await consulta; return error ? [] : data || []; };
const de = (lista, campo, id) => lista.filter(x => String(x[campo]) === String(id));

/**
 * @param leads      los proyectos aprobados a los que llega esta persona
 * @param conMontos  si quien mira ve plata: sin eso, la de la obra ni se trae
 * @returns [{ lead, obra, ficha }] con lo que más pide atención primero
 */
export async function cargarEnMarcha(leads = [], { conMontos = false } = {}) {
  if (!leads.length) return [];
  const leadIds = leads.map(l => l.id);
  const obraIds = leads.map(l => l.obra_id).filter(Boolean);
  const conObras = obraIds.length > 0;

  const [obras, planillas, ordenes, comprasPorLead, comprasPorObra, tareas, libro] = await Promise.all([
    conObras ? filas(supabase.from("obras").select("id,nombre,lead_id").in("id", obraIds)) : [],
    conObras ? filas(supabase.from("planillas").select("id,obra_id,numero,nombre,estado,fecha_cierre").in("obra_id", obraIds).order("numero")) : [],
    conObras ? filas(supabase.from("ordenes_cambio")
      .select("id,obra_id,estado,anulada,reemplazada_at,enviada_at,fecha,fecha_limite_aprobacion").in("obra_id", obraIds).eq("estado", "enviada")) : [],
    // Una compra se pide contra el proyecto y el `obra_id` recién se escribe al
    // facturarla: se buscan por los dos lados y se cuentan una vez.
    filas(supabase.from("compras_solicitudes").select("id,lead_id,obra_id,estado").in("lead_id", leadIds).in("estado", ABIERTAS)),
    conObras ? filas(supabase.from("compras_solicitudes").select("id,lead_id,obra_id,estado").in("obra_id", obraIds).in("estado", ABIERTAS)) : [],
    filas(supabase.from("tasks").select("id,lead_id,title,due_date,status,type,compra_id").in("lead_id", leadIds).neq("status", "listo")),
    filas(supabase.from("libro_obra_dias").select("lead_id,fecha").in("lead_id", leadIds)),
  ]);

  const aprobaciones = ordenes.length
    ? await filas(supabase.from("orden_cambio_aprobaciones").select("orden_id,envio_at,aprobado_at,observacion").in("orden_id", ordenes.map(o => o.id)))
    : [];

  // La plata, con la misma cuenta que la lista de Control de Obra.
  let resumen = {};
  if (conMontos && conObras) {
    const [rubros, facturas] = await Promise.all([
      filas(supabase.from("obra_rubros").select(COLUMNAS_DE_RUBRO).in("obra_id", obraIds)),
      filas(supabase.from("obra_facturas").select("id,obra_id,total").in("obra_id", obraIds)),
    ]);
    const asignaciones = facturas.length
      ? await filas(supabase.from("obra_asignaciones").select("factura_id,monto").in("factura_id", facturas.map(f => f.id)))
      : [];
    resumen = resumenDeObras(obras, rubros, facturas, asignaciones);
  }

  const hoy = hoyISO();
  return ordenarEnMarcha(leads.map(lead => {
    const obra = obras.find(o => String(o.id) === String(lead.obra_id)) || null;
    const suyas = new Map();
    [...de(comprasPorLead, "lead_id", lead.id), ...(obra ? de(comprasPorObra, "obra_id", obra.id) : [])].forEach(c => suyas.set(c.id, c));
    const dias = de(libro, "lead_id", lead.id).map(d => String(d.fecha).slice(0, 10)).sort();
    return {
      lead, obra,
      ficha: fichaDelProyecto({
        obra, resumen: obra ? resumen[obra.id] || null : null,
        planillas: obra ? de(planillas, "obra_id", obra.id) : [],
        ordenes: obra ? de(ordenes, "obra_id", obra.id) : [],
        aprobaciones,
        compras: [...suyas.values()],
        tareas: de(tareas, "lead_id", lead.id),
        libro: dias.length ? { dias: dias.length, ultima: dias[dias.length - 1] } : null,
        hoy,
      }),
    };
  }));
}
