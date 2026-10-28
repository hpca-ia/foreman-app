import { supabase } from "../../lib/supabase";
import { subirArchivo } from "../../lib/archivos";
import { registrarPago } from "../controlObra/pagos";
import {
  lineasParaGuardar, seSolapan, estadoDelRol, agruparPagos, gastoDelPago, periodoTexto,
} from "./rolPagado";

// Los roles guardados: cerrarlos, reabrirlos y pagarlos.

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");
const sinMigracion = e => (falta(e) ? "Falta correr la migración 131." : e?.message || "error desconocido");

/** Los roles de la obra, del más nuevo al más viejo, con sus líneas. */
export async function rolesDeLaObra(leadId) {
  const { data: roles, error } = await supabase.from("obra_roles")
    .select("*").eq("lead_id", leadId).order("desde", { ascending: false });
  if (error) return { roles: [], error: sinMigracion(error) };
  if (!roles?.length) return { roles: [] };
  const { data: lineas, error: e2 } = await supabase.from("obra_rol_lineas")
    .select("*").in("rol_id", roles.map(r => r.id)).order("nombre");
  if (e2) return { roles: [], error: sinMigracion(e2) };
  return { roles: roles.map(r => ({ ...r, lineas: (lineas || []).filter(l => l.rol_id === r.id) })) };
}

/**
 * Cierra el rol del período: lo guarda con sus números congelados.
 * No deja cerrar dos roles que se pisen: el mismo día se pagaría dos veces.
 */
export async function cerrarRol({ lead, periodo, nomina, parametros, roles = [], quien }) {
  if (!periodo?.desde || !periodo?.hasta) return { error: "Elegí las dos fechas del período." };
  if (!nomina?.lineas?.length) return { error: "No hay nadie en el rol." };
  const pisa = roles.find(r => seSolapan(r, periodo));
  if (pisa) return { error: `Ese período se pisa con el rol ${periodoTexto(pisa)}, que ya está cerrado.` };

  const { data: rol, error } = await supabase.from("obra_roles").insert({
    lead_id: lead.id, obra_id: lead.obra_id || null,
    desde: periodo.desde, hasta: periodo.hasta,
    numero: roles.length + 1,
    estado: "cerrado", parametros,
    total: nomina.total, a_pagar: nomina.aPagar,
    cerrado_por: quien?.id ?? null, cerrado_nombre: quien?.name || null,
  }).select().single();
  if (error || !rol) return { error: "No se pudo cerrar el rol: " + sinMigracion(error) };

  const { error: e2 } = await supabase.from("obra_rol_lineas").insert(lineasParaGuardar(nomina, rol.id));
  if (e2) {
    // Un rol sin líneas no sirve y taparía el período: se deshace.
    await supabase.from("obra_roles").delete().eq("id", rol.id);
    return { error: "No se pudo guardar el detalle del rol: " + sinMigracion(e2) };
  }
  return { rol };
}

/** Reabrir es borrar el cierre. Solo si nadie cobró todavía. */
export async function reabrirRol(rol) {
  if ((rol.lineas || []).some(l => l.pagado_at)) {
    return { error: "Ya hay pagos registrados en este rol: no se puede reabrir." };
  }
  const { error } = await supabase.from("obra_roles").delete().eq("id", rol.id);
  return error ? { error: error.message } : {};
}

/**
 * Paga a una o varias personas del rol y deja el gasto en el control de obra.
 *
 * @param soporte  "rol" (un gasto por persona) | "factura" (un gasto para todas)
 * @param factura  { numero, ruc, razon_social } si soporte es factura
 * @param pago     { fecha, forma, referencia }
 * @param archivo  el rol firmado escaneado o la factura (opcional)
 */
export async function pagarLineas({ rol, lineas, soporte, factura = {}, pago, archivo, lead, quien }) {
  const obraId = lead?.obra_id;
  if (!obraId) return { error: "Este proyecto no tiene control de obra activado: el gasto no tendría adónde ir." };
  if (soporte === "factura" && !(factura.numero || "").trim()) return { error: "Falta el número de la factura." };
  const grupos = agruparPagos(lineas, soporte);
  if (!grupos.length) return { error: "No hay nadie con algo por cobrar en lo elegido." };

  const { data: planilla } = await supabase.from("planillas")
    .select("id").eq("obra_id", obraId).eq("estado", "abierta")
    .order("numero", { ascending: false }).limit(1).maybeSingle();

  let archivo_url = null, archivo_nombre = null;
  if (archivo) {
    const safe = archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { ruta, error } = await subirArchivo(`obra-${obraId}/rol-${rol.id}-${Date.now()}-${safe}`, archivo);
    if (error) return { error: "No se pudo subir el archivo: " + error.message };
    archivo_url = ruta; archivo_nombre = archivo.name;
  }

  const errores = [];
  for (const grupo of grupos) {
    const fila = {
      ...gastoDelPago({ lineas: grupo, soporte, factura, fecha: pago.fecha, rol, obraId, planillaId: planilla?.id || null, quien }),
      archivo_url, archivo_nombre,
    };
    const { data: gasto, error: e1 } = await supabase.from("obra_facturas").insert(fila).select().single();
    if (e1 || !gasto) { errores.push(`${grupo.map(l => l.nombre).join(", ")}: ${e1?.message || "sin respuesta"}`); continue; }

    const r = await registrarPago(gasto, { monto: gasto.total, fecha: pago.fecha, forma: pago.forma, referencia: pago.referencia });
    if (r.error) {
      // Un gasto sin su pago quedaría como deuda en Proveedores: se deshace.
      await supabase.from("obra_facturas").delete().eq("id", gasto.id);
      errores.push(`${grupo.map(l => l.nombre).join(", ")}: ${r.error}`);
      continue;
    }

    const { error: e3 } = await supabase.from("obra_rol_lineas").update({
      pagado_at: new Date().toISOString(), pago_fecha: pago.fecha,
      pago_forma: pago.forma || null, pago_referencia: pago.referencia?.trim() || null,
      soporte, obra_factura_id: gasto.id,
      pagado_por: quien?.id ?? null, pagado_nombre: quien?.name || null,
    }).in("id", grupo.map(l => l.id));
    if (e3) errores.push(`El gasto entró al control pero el rol no quedó marcado: ${sinMigracion(e3)}`);
  }

  // El estado del rol se recalcula con lo que dice la base, no con lo que
  // esta pantalla cree que pasó.
  const { data: todas } = await supabase.from("obra_rol_lineas").select("*").eq("rol_id", rol.id);
  const estado = estadoDelRol(todas || []);
  await supabase.from("obra_roles").update({
    estado, pagado_at: estado === "pagado" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", rol.id);

  return errores.length ? { error: errores.join(" · ") } : {};
}
