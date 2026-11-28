import { supabase } from "./supabase";
import { enlacesArchivos } from "./archivos";
import { construirPDF } from "./exportar";
import { mostrarPdf } from "./abrirPdf";
import { armarExpediente } from "./armarExpediente";

// EL EXPEDIENTE DE UNA TR, EN PDF (Hernán, 28/11/2026): la historia completa de
// un gasto —la orden de compra y quién la aprobó, la factura, los pagos, la
// caja chica, los anexos— y detrás, los papeles.
//
// Acá se junta lo que hay en la base y se manda a dibujar; qué dice el
// documento se decide en `armarExpediente.js`, que no consulta nada.

const unicos = xs => [...new Set((xs || []).filter(Boolean).map(Number))];
const traer = async q => { const { data, error } = await q; return error ? [] : data || []; };
const deEstos = (tabla, columnas, campo, ids) => (ids.length ? traer(supabase.from(tabla).select(columnas).in(campo, ids)) : Promise.resolve([]));

/** Todo lo que FOREMAN sabe de una transacción. */
export async function historiaDeTR(tr) {
  const numero = Number(tr);
  if (!(numero > 0)) return { tr: null, ordenes: [], facturas: [], gastos: [] };
  const [ordenes, facturas, gastos] = await Promise.all([
    traer(supabase.from("compras_solicitudes").select("*").eq("tr", numero).order("id")),
    traer(supabase.from("obra_facturas").select("*").eq("tr", numero).order("id")),
    traer(supabase.from("cajas_gastos").select("*").eq("tr", numero).order("id")),
  ]);
  const idsOrden = unicos(ordenes.map(o => o.id));
  const idsFactura = unicos(facturas.map(f => f.id));
  const idsGasto = unicos(gastos.map(g => g.id));
  const idsObra = unicos(facturas.map(f => f.obra_id));

  const condAnexos = [
    idsGasto.length ? `caja_gasto_id.in.(${idsGasto.join(",")})` : "",
    idsFactura.length ? `obra_factura_id.in.(${idsFactura.join(",")})` : "",
    idsOrden.length ? `solicitud_id.in.(${idsOrden.join(",")})` : "",
  ].filter(Boolean);

  const [historial, adjuntos, pendientes, asignaciones, pagos, planillas, obras, cajas, cierres, anexos] = await Promise.all([
    idsOrden.length ? traer(supabase.from("compras_historial").select("*").in("solicitud_id", idsOrden).order("created_at")) : [],
    idsOrden.length ? traer(supabase.from("compras_adjuntos").select("*").in("solicitud_id", idsOrden).order("created_at")) : [],
    idsOrden.length ? traer(supabase.from("compras_pendientes").select("*").in("solicitud_id", idsOrden).order("created_at")) : [],
    deEstos("obra_asignaciones", "*", "factura_id", idsFactura),
    idsFactura.length ? traer(supabase.from("obra_pagos").select("*").in("factura_id", idsFactura).order("fecha")) : [],
    deEstos("planillas", "id,numero,nombre,estado", "id", unicos(facturas.map(f => f.planilla_id))),
    deEstos("obras", "id,lead_id,nombre", "id", idsObra),
    deEstos("cajas_chicas", "id,responsable_nombre,lead_id,proyecto_nombre", "id", unicos(gastos.map(g => g.caja_id))),
    deEstos("cajas_cierres", "id,numero,created_at,cerrado_nombre", "id", unicos(gastos.map(g => g.cierre_id))),
    condAnexos.length ? traer(supabase.from("anexos_de_gasto").select("*").or(condAnexos.join(",")).order("created_at")) : [],
  ]);
  const [rubros, actividades] = await Promise.all([
    deEstos("obra_rubros", "id,numero,descripcion", "id", unicos(asignaciones.map(a => a.obra_rubro_id))),
    deEstos("obra_actividades", "id,nombre", "id", unicos(asignaciones.map(a => a.obra_actividad_id))),
  ]);

  // El proyecto: el de la obra de la factura, el de la orden o el de la caja.
  const leadId = obras[0]?.lead_id ?? ordenes[0]?.lead_id ?? cajas[0]?.lead_id ?? null;
  let proyecto = null;
  if (leadId) {
    const [lead] = await traer(supabase.from("leads").select("id,nombre").eq("id", leadId));
    proyecto = { id: leadId, nombre: lead?.nombre || obras[0]?.nombre || cajas[0]?.proyecto_nombre || "" };
  }
  return { tr: numero, proyecto, ordenes, historial, adjuntos, pendientes, facturas, asignaciones, rubros, actividades,
    pagos, planillas, obras, gastos, cajas, cierres, anexos };
}

/**
 * Arma el expediente de una TR y lo muestra.
 *
 * @returns { error } o { ok, papeles, sinPapel } — `sinPapel` son los archivos
 *   que figuran en la historia y no se pudieron traer del depósito.
 */
export async function abrirExpediente(tr, { onProgreso } = {}) {
  onProgreso?.("Juntando la historia…");
  const historia = await historiaDeTR(tr);
  const e = armarExpediente(historia);
  if (e.vacio) return { error: `No encontré ningún papel de la TR${tr}.` };

  onProgreso?.(e.papeles.length ? `Trayendo ${e.papeles.length} ${e.papeles.length === 1 ? "papel" : "papeles"}…` : "Armando el PDF…");
  const urls = await enlacesArchivos(e.papeles.map(p => p.ruta));
  const adjuntos = e.papeles.map((p, i) => ({ titulo: p.titulo, url: urls[i] })).filter(a => a.url);
  const doc = await construirPDF({
    titulo: e.titulo, subtitulo: e.subtitulo, resumen: e.resumen, bloques: e.bloques,
    adjuntos, indiceAdjuntos: adjuntos.length > 1, pie: e.pie,
    onProgreso: (i, cuantos) => onProgreso?.(`Papel ${i} de ${cuantos}…`),
  });
  mostrarPdf(doc, `${e.nombreArchivo}.pdf`);
  return { ok: true, papeles: adjuntos.length, sinPapel: e.papeles.length - adjuntos.length };
}
