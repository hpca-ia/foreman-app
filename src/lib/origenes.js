import { supabase } from "./supabase";
import { traza, puertaDe } from "./trazabilidad";

// DE DÓNDE VIENE Y A DÓNDE FUE CADA PAPEL (migración 202): lo que se le
// pregunta a la base para armar la traza. Los enlaces existen desde siempre
// —la factura sabe su gasto de caja, la orden de compra sabe su factura—; lo
// que faltaba era traerlos juntos y mostrarlos.
//
// Sin la 202 todo esto sigue andando: la traza sale sin TR, con la orden, la
// caja y la planilla, que no dependen de ella.

const TANDA = 150;
const unicos = xs => [...new Set((xs || []).filter(Boolean).map(Number))];

async function deATandas(tabla, columnas, campo, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += TANDA) {
    const { data, error } = await supabase.from(tabla).select(columnas).in(campo, ids.slice(i, i + TANDA));
    // Con una tanda que falla, lo leído no alcanza para afirmar que algo falta.
    if (error) { out.fallo = true; return out; }
    out.push(...(data || []));
  }
  return out;
}

/** Las TR que resultaron ser otra: { la que salió: la que quedó }. */
export async function trUnidas() {
  const { data, error } = await supabase.from("foreman_tr_unidas").select("de,a");
  if (error) return {};
  const m = {};
  (data || []).forEach(u => { m[u.de] = u.a; });
  return m;
}

/**
 * Las facturas del control de una obra, cada una con su `_traza`.
 *
 * @param facturas   filas de obra_facturas
 * @param obra       { lead_id }
 * @param planillas  las de la obra
 * @param leadPorObra  { obraId: leadId }, cuando las facturas son de varias obras
 */
export async function conTraza(facturas = [], obra = null, planillas = [], leadPorObra = null) {
  if (!facturas.length) return facturas;
  const gastoIds = unicos(facturas.map(f => f.caja_gasto_id));
  const [compras, gastos] = await Promise.all([
    deATandas("compras_solicitudes", "id,factura_id", "factura_id", unicos(facturas.map(f => f.id))),
    deATandas("cajas_gastos", "id,caja_id", "id", gastoIds),
  ]);
  const cajas = await deATandas("cajas_chicas", "id,responsable_nombre", "id", unicos(gastos.map(g => g.caja_id)));
  const cajaDe = {}; cajas.forEach(c => { cajaDe[c.id] = c; });
  const cajaDelGasto = {}; gastos.forEach(g => { cajaDelGasto[g.id] = cajaDe[g.caja_id] || null; });
  const odcDe = {}; compras.forEach(s => { (odcDe[s.factura_id] = odcDe[s.factura_id] || []).push(s.id); });
  const plDe = {}; (planillas || []).forEach(p => { plDe[p.id] = p; });
  return facturas.map(f => {
    const c = f.caja_gasto_id ? cajaDelGasto[f.caja_gasto_id] : null;
    const caja = c ? { id: c.id, nombre: c.responsable_nombre } : null;
    const odc = odcDe[f.id] || [];
    return { ...f, _traza: traza({
      tr: f.tr, leadId: leadPorObra ? leadPorObra[f.obra_id] : obra?.lead_id, odc, caja,
      planilla: f.planilla_id ? plDe[f.planilla_id] : null,
      puerta: puertaDe(f, { odc, caja }),
    }) };
  });
}

/**
 * La traza de los gastos de caja chica: { gastoId: traza }.
 *
 * @param gastos  filas de cajas_gastos (con caja_id, tr, obra_factura_id)
 * @param cajas   las cajas chicas: { id, responsable_nombre, lead_id }
 */
export async function trazasDeGastos(gastos = [], cajas = []) {
  const cajaDe = {}; (cajas || []).forEach(c => { cajaDe[c.id] = c; });
  const facturaIds = unicos(gastos.map(g => g.obra_factura_id));
  const [facturas, compras] = await Promise.all([
    deATandas("obra_facturas", "id,planilla_id", "id", facturaIds),
    deATandas("compras_solicitudes", "id,factura_id", "factura_id", facturaIds),
  ]);
  const planillas = await deATandas("planillas", "id,numero,nombre,estado", "id", unicos(facturas.map(f => f.planilla_id)));
  const plDe = {}; planillas.forEach(p => { plDe[p.id] = p; });
  const plDeFactura = {}; facturas.forEach(f => { plDeFactura[f.id] = f.planilla_id ? plDe[f.planilla_id] : null; });
  const odcDe = {}; compras.forEach(s => { (odcDe[s.factura_id] = odcDe[s.factura_id] || []).push(s.id); });
  const out = {};
  gastos.forEach(g => {
    const c = cajaDe[g.caja_id];
    const odc = g.obra_factura_id ? odcDe[g.obra_factura_id] || [] : [];
    out[g.id] = traza({
      tr: g.tr, leadId: c?.lead_id, odc,
      caja: c ? { id: c.id, nombre: c.responsable_nombre } : { id: g.caja_id },
      planilla: g.obra_factura_id ? plDeFactura[g.obra_factura_id] : null,
      puerta: odc.length ? "odc" : "cc",
    });
  });
  return out;
}

/**
 * La traza de las órdenes de compra: { solicitudId: traza }. La planilla y la
 * caja salen de su factura del control, si ya la tiene.
 */
export async function trazasDeCompras(solicitudes = []) {
  const facturaIds = unicos(solicitudes.map(s => s.factura_id));
  const facturas = await deATandas("obra_facturas", "id,planilla_id,caja_gasto_id", "id", facturaIds);
  const [planillas, gastos] = await Promise.all([
    deATandas("planillas", "id,numero,nombre,estado", "id", unicos(facturas.map(f => f.planilla_id))),
    deATandas("cajas_gastos", "id,caja_id", "id", unicos(facturas.map(f => f.caja_gasto_id))),
  ]);
  const cajas = await deATandas("cajas_chicas", "id,responsable_nombre", "id", unicos(gastos.map(g => g.caja_id)));
  const plDe = {}; planillas.forEach(p => { plDe[p.id] = p; });
  const cajaDe = {}; cajas.forEach(c => { cajaDe[c.id] = c; });
  const cajaDelGasto = {}; gastos.forEach(g => { cajaDelGasto[g.id] = cajaDe[g.caja_id] || null; });
  const fDe = {}; facturas.forEach(f => { fDe[f.id] = f; });
  const out = {};
  solicitudes.forEach(s => {
    const f = s.factura_id ? fDe[s.factura_id] : null;
    const c = f?.caja_gasto_id ? cajaDelGasto[f.caja_gasto_id] : null;
    out[s.id] = {
      ...traza({
        tr: s.tr, leadId: s.lead_id, odc: [s.id],
        caja: c ? { id: c.id, nombre: c.responsable_nombre } : null,
        planilla: f?.planilla_id ? plDe[f.planilla_id] : null,
        puerta: "odc",
      }),
      // La orden dice que tiene factura y en el control ya no está.
      facturaPerdida: !facturas.fallo && !!s.factura_id && !f,
    };
  });
  return out;
}

/**
 * Lo mismo para unas pocas facturas sueltas de una obra, cuando la pantalla no
 * tiene a mano ni la obra ni sus planillas ni la TR (el aviso de repetida).
 */
export async function conTrazaDeLaObra(facturas = [], obraId = null) {
  if (!facturas.length || !obraId) return facturas;
  const [{ data: obra }, { data: planillas }, conTr] = await Promise.all([
    supabase.from("obras").select("id,lead_id").eq("id", obraId).maybeSingle(),
    supabase.from("planillas").select("id,numero,nombre,estado").eq("obra_id", obraId),
    // Aparte y tolerante: sin la 202 la columna no existe y esto vuelve vacío.
    deATandas("obra_facturas", "id,tr", "id", unicos(facturas.map(f => f.id))),
  ]);
  const trDe = {}; conTr.forEach(f => { trDe[f.id] = f.tr; });
  return conTraza(facturas.map(f => ({ ...f, tr: f.tr ?? trDe[f.id] ?? null })), obra, planillas || []);
}

/**
 * La traza de unas facturas del control de las que solo se sabe el id (el pago
 * de un rol, un correo): { facturaId: traza }.
 */
export async function trazasPorFactura(facturaIds = []) {
  const ids = unicos(facturaIds);
  if (!ids.length) return {};
  const [fs, conTr] = await Promise.all([
    deATandas("obra_facturas", "id,obra_id,planilla_id,origen,caja_gasto_id", "id", ids),
    deATandas("obra_facturas", "id,tr", "id", ids),
  ]);
  const [obras, planillas] = await Promise.all([
    deATandas("obras", "id,lead_id", "id", unicos(fs.map(f => f.obra_id))),
    deATandas("planillas", "id,numero,nombre,estado", "id", unicos(fs.map(f => f.planilla_id))),
  ]);
  const trDe = {}; conTr.forEach(f => { trDe[f.id] = f.tr; });
  const leadPorObra = {}; obras.forEach(o => { leadPorObra[o.id] = o.lead_id; });
  const con = await conTraza(fs.map(f => ({ ...f, tr: trDe[f.id] ?? null })), null, planillas, leadPorObra);
  const out = {};
  con.forEach(f => { out[f.id] = f._traza; });
  return out;
}
