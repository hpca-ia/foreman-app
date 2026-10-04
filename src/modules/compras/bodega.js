import { supabase } from "../../lib/supabase";

// Lo que de verdad llegó a la obra.
//
// Entre "se compró" y "se recibió" hay un hueco por donde se pierde material:
// se piden 200 sacos, llegan 180, nadie cuenta, la factura dice 200 y se pagan
// 200. El ingreso a bodega es el único momento en que alguien tiene el
// material delante y puede decir cuánto llegó.
//
// Por eso se guarda la cantidad ESPERADA y la RECIBIDA, no un visto bueno. Un
// "sí, llegó" no sirve de nada tres semanas después, que es cuando el
// proveedor reclama o cuando falta material y nadie sabe si llegó alguna vez.
//
// Los SERVICIOS no se bodegan. Pintar una fachada o alquilar una grúa no entra
// a ninguna bodega, y pedirle a alguien que "reciba" eso es enseñarle a
// apretar un botón sin mirar, que es exactamente lo que vuelve inútil un
// control. El pedido dice de qué clase es y el servicio salta este paso.

export const CLASES_PEDIDO = [
  { id: "material", label: "Material", nota: "Entra a bodega y se cuenta contra el papel" },
  { id: "servicio", label: "Servicio", nota: "No se bodega: se recibe y listo" },
];

const n = v => Number(v) || 0;
const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

export const vaABodega = solicitud => (solicitud?.clase || "material") === "material";

/** @returns { ingresos, items, sinTablas } */
export async function ingresosDe(solicitudId) {
  const { data, error } = await supabase.from("bodega_ingresos")
    .select("*").eq("solicitud_id", solicitudId).order("fecha");
  if (error) return { ingresos: [], items: {}, sinTablas: falta(error) };
  const ingresos = data || [];
  if (!ingresos.length) return { ingresos, items: {}, sinTablas: false };
  const { data: filas } = await supabase.from("bodega_items")
    .select("*").in("ingreso_id", ingresos.map(i => i.id)).order("id");
  const items = {};
  (filas || []).forEach(f => { (items[f.ingreso_id] = items[f.ingreso_id] || []).push(f); });
  return { ingresos, items, sinTablas: false };
}

/**
 * Registrar lo que llegó.
 *
 * Se guarda aunque falte material: un ingreso parcial es la verdad de ese día
 * y esconderlo hasta que llegue todo es perder la fecha en que llegó lo
 * primero. `completo` lo dice quien recibe, mirando, no el sistema sumando.
 */
export async function registrarIngreso({ solicitud, cabecera, items = [], quien }) {
  const fila = {
    solicitud_id: solicitud.id,
    obra_id: solicitud.obra_id || cabecera.obra_id || null,
    lead_id: solicitud.lead_id || null,
    fecha: cabecera.fecha || new Date().toISOString().slice(0, 10),
    documento: cabecera.documento?.trim() || null,
    proforma_id: solicitud.proforma_id || null,
    completo: !!cabecera.completo,
    nota: cabecera.nota?.trim() || null,
    recibido_por: quien?.id ?? null,
    recibido_nombre: quien?.name || null,
  };
  const { data, error } = await supabase.from("bodega_ingresos").insert(fila).select().single();
  if (error) return { error: falta(error) ? "Falta correr la migración 068." : error.message };

  const limpios = items
    .filter(i => i.descripcion?.trim())
    .map(i => ({
      ingreso_id: data.id,
      descripcion: i.descripcion.trim(),
      unidad: i.unidad?.trim() || null,
      cantidad_esperada: i.cantidad_esperada === "" || i.cantidad_esperada == null ? null : n(i.cantidad_esperada),
      cantidad_recibida: n(i.cantidad_recibida),
      precio_unitario: i.precio_unitario ? n(i.precio_unitario) : null,
      obra_rubro_id: i.obra_rubro_id ? Number(i.obra_rubro_id) : null,
      nota: i.nota?.trim() || null,
    }));
  if (limpios.length) {
    const { error: e2 } = await supabase.from("bodega_items").insert(limpios);
    if (e2) return { ingreso: data, error: "El ingreso se guardó pero fallaron los ítems: " + e2.message };
  }

  // La fecha de bodega vive en la solicitud: es lo que lee la línea de pasos.
  await supabase.from("compras_solicitudes").update({
    bodega_at: new Date().toISOString(),
    bodega_por: quien?.id ?? null,
    bodega_nombre: quien?.name || null,
  }).eq("id", solicitud.id);

  return { ingreso: data };
}

export async function borrarIngreso(id) {
  const { error } = await supabase.from("bodega_ingresos").delete().eq("id", id);
  return error ? error.message : null;
}

/**
 * ¿Coincide con el papel?
 *
 * Tres respuestas y ninguna es "sí o no": llegó todo, llegó de menos, o llegó
 * de más. La tercera pasa y hay que verla —se factura lo que llegó, no lo que
 * se pidió—, y un control que solo avisa cuando falta deja pasar la mitad de
 * los errores.
 */
export function cuadre(items = []) {
  const lineas = items.map(i => {
    const esperada = i.cantidad_esperada == null ? null : n(i.cantidad_esperada);
    const recibida = n(i.cantidad_recibida);
    const dif = esperada == null ? 0 : recibida - esperada;
    return { ...i, esperada, recibida, dif };
  });
  const faltan = lineas.filter(l => l.dif < 0);
  const sobran = lineas.filter(l => l.dif > 0);
  const valor = lineas.reduce((t, l) => t + n(l.precio_unitario) * l.recibida, 0);
  return { lineas, faltan, sobran, cuadra: !faltan.length && !sobran.length, valor };
}
