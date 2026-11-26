import { supabase } from "../../lib/supabase";
import { pedidoDelPresupuesto } from "./presupuestoParaElCliente.js";

// LO QUE SE LE COMPARTIÓ AL CLIENTE DE UN PRESUPUESTO (migración 196).
//
// Cada vez que se comparte se guarda la foto —lo que el cliente ve— y entra
// un pedido al registro de aprobaciones del proyecto (migración 187). La foto
// se arma en presupuestoParaElCliente.js; acá solo se guarda y se lee.

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");
export const SIN_196 = "Para compartir el presupuesto con el cliente falta correr la migración 196 en Supabase.";

/** Lo compartido de un presupuesto, lo último primero, cada uno con su pedido del registro. */
export async function compartidosDe(presupuestoId) {
  if (!presupuestoId) return { compartidos: [] };
  const { data, error } = await supabase.from("presupuesto_compartidos").select("*")
    .eq("presupuesto_id", presupuestoId).order("created_at", { ascending: false }).order("id", { ascending: false });
  if (error) return { compartidos: [], sinTabla: falta(error), error: falta(error) ? SIN_196 : error.message };
  const ids = (data || []).map(c => c.id);
  let pedidos = [];
  if (ids.length) {
    const r = await supabase.from("aprobaciones_cliente")
      .select("id,presupuesto_compartido_id,pedida_at,respuesta,respuesta_at,respuesta_nota,retirada_at,avisos").in("presupuesto_compartido_id", ids);
    pedidos = r.data || [];
  }
  return { compartidos: (data || []).map(c => ({ ...c, pedido: pedidos.find(p => p.presupuesto_compartido_id === c.id) || null })) };
}

/** Lo que estaba compartido deja de valer: el cliente ve una sola foto de cada presupuesto. */
async function retirar(presupuestoId, quien, cuando) {
  const { data: abiertos, error } = await supabase.from("presupuesto_compartidos").select("id")
    .eq("presupuesto_id", presupuestoId).is("retirado_at", null);
  if (error) return falta(error) ? SIN_196 : error.message;
  const ids = (abiertos || []).map(c => c.id);
  if (!ids.length) return null;
  const { error: e1 } = await supabase.from("presupuesto_compartidos")
    .update({ retirado_at: cuando, retirado_nombre: quien?.name || null }).in("id", ids);
  if (e1) return e1.message;
  // El pedido que seguía esperando se retira. El que ya contestó queda como está: es lo que aprobó.
  await supabase.from("aprobaciones_cliente").update({ retirada_at: cuando, retirada_nombre: quien?.name || null })
    .in("presupuesto_compartido_id", ids).is("respuesta", null).is("retirada_at", null);
  return null;
}

const anotar = (leadId, detalle, quien) => supabase.from("lead_movimientos")
  .insert({ lead_id: leadId, tipo: "nota", automatico: true, detalle, autor_id: quien?.id ?? null, autor_nombre: quien?.name ?? null });

/**
 * COMPARTIR: se guarda la foto y se le pide al cliente que la apruebe.
 * @returns { compartido } —con su `pedido`— o { error }
 */
export async function compartirConElCliente({ presupuesto, foto, quien = null }) {
  if (!presupuesto?.id || !presupuesto.lead_id) return { error: "Este presupuesto no está en ningún proyecto: asignale uno para poder compartirlo." };
  const cuando = new Date();
  const err = await retirar(presupuesto.id, quien, cuando.toISOString());
  if (err) return { error: err };
  const { data: compartido, error } = await supabase.from("presupuesto_compartidos").insert({
    presupuesto_id: presupuesto.id, presupuesto_nombre: presupuesto.nombre || null, lead_id: presupuesto.lead_id,
    modo: foto.modo, con_comparativa: !!foto.conComparativa, foto, total: foto.totales?.total ?? null,
    compartido_por: quien?.id ?? null, compartido_nombre: quien?.name || null,
  }).select().single();
  if (error) return { error: falta(error) ? SIN_196 : error.message };
  const { data: pedido, error: e2 } = await supabase.from("aprobaciones_cliente")
    .insert(pedidoDelPresupuesto({ foto, leadId: presupuesto.lead_id, compartidoId: compartido.id, quien, cuando })).select().single();
  if (e2) {
    // Sin su pedido en el registro el cliente no tendría cómo contestar: no queda compartido a medias.
    await supabase.from("presupuesto_compartidos").delete().eq("id", compartido.id);
    return { error: falta(e2) ? SIN_196 : e2.message };
  }
  await anotar(presupuesto.lead_id,
    `Le compartió al cliente el presupuesto "${presupuesto.nombre || ""}"${foto.conComparativa ? " con la comparativa de cotizaciones" : ""}, ${foto.modo === "utilidad" ? "con utilidad" : "a costo"}, y le pidió que lo apruebe`, quien);
  return { compartido: { ...compartido, pedido } };
}

/** Dejar de compartir: el cliente ya no lo ve. Lo que haya aprobado antes sigue en el registro. */
export async function dejarDeCompartir({ presupuesto, quien = null }) {
  const err = await retirar(presupuesto.id, quien, new Date().toISOString());
  if (err) return err;
  if (presupuesto.lead_id) await anotar(presupuesto.lead_id, `Dejó de compartirle al cliente el presupuesto "${presupuesto.nombre || ""}"`, quien);
  return null;
}

/**
 * Avisarle al cliente por correo que tiene el presupuesto para revisar y aprobar.
 * @returns { ok, enviadoA } o { error }
 */
export async function avisarDelPresupuesto({ leadId, pedidoId, correos = [], mensaje = "", quien = null }) {
  try {
    const r = await fetch("/api/aviso?de=presupuesto", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, pedidoId, correos, mensaje, quien: quien ? { id: quien.id, name: quien.name, email: quien.email || null } : null }),
    });
    const d = await r.json();
    return d.ok ? { ok: true, enviadoA: d.enviadoA || [] } : { error: d.error || "No se pudo avisar." };
  } catch (e) {
    return { error: "No se pudo avisar: " + e.message };
  }
}
