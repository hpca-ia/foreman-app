import { supabase } from "../../lib/supabase";
import { enlacesFirmados } from "../../lib/enlacesFirmados";
import { pedirANova, LECTURA, textoDeNova } from "../../lib/modelos";
import { comprimirImagen, noEntraElArchivo } from "../../lib/imagenes";
import { leerCotizacion } from "./leerProforma.js";
import { hojaComoTexto } from "./beneficios";
import { codigoDe } from "./nombreOrden";
import { planDeBeneficios } from "./cuentaOrdenCambio.js";

// La cotización con la que se armó cada orden de cambio, guardada con ella.
//
// Una orden de cambio se cobra con un precio y se ejecuta con un costo: el de
// la cotización del que va a hacer el trabajo. Si ese papel se pierde al
// cerrar la pantalla, al liquidar la obra nadie puede decir cuánto dejó cada
// orden. Acá vive el papel, lo que se leyó de él y el beneficio que deja.

const BUCKET = "task-files";
const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");
export const SIN_125 = "Falta correr la migración 125 en Supabase para guardar la cotización de la orden y su costo.";

/**
 * Leer la cotización con NOVA.
 *
 * Es el MISMO lector que compara proformas en Beneficios. Si fueran dos, el
 * mismo papel daría dos resultados según por dónde entre.
 */
export async function leerConNova(original, rubros = [], onPaso) {
  let file = original;
  if (/^image\//.test(file.type || "")) file = await comprimirImagen(file);
  const pesa = noEntraElArchivo(
    /\.(xlsx|xlsm|xls)$/i.test(file.name || "") ? null : "x".repeat(Math.round(file.size * 1.37)), file);
  if (pesa) throw new Error(pesa);

  const lista = (rubros || []).filter(r => !r.oculto && !r.anulado_por_oc).slice(0, 220)
    .map(r => `${r.id}:${String(r.descripcion || "").slice(0, 60)}`).join(" | ");

  const leida = await leerCotizacion(file, {
    lista, modelo: LECTURA, hojaComoTexto, onPaso,
    pedir: async cuerpo => {
      const { res, data } = await pedirANova(cuerpo);
      if (!res.ok || data?.error) {
        throw new Error(data?.error?.message || data?.error
          || (res.status === 504 ? "NOVA se demoró más de un minuto leyendo y el servidor la cortó. Probá con menos hojas."
            : `El servidor se cortó leyendo el archivo (${res.status}).`));
      }
      return { texto: textoDeNova(data) || "", cortado: data?.stop_reason === "max_tokens" };
    },
  });
  // Se guarda el archivo que se leyó: si era una foto, la comprimida, que es
  // la que entra en el depósito sin pasarse de tamaño y se ve igual.
  return { ...leida, archivo: file };
}

/** Lo que se guarda de lo leído: lo justo para mirarlo sin volver a leerlo. */
const renglones = (items = []) => items.map(x => ({
  descripcion: x.descripcion, cantidad: Number(x.cantidad) || 0,
  unidad: x.unidad || "", monto: Number(x.monto) || 0,
}));

/**
 * Guardar la cotización con su orden: el archivo y lo que se leyó.
 *
 * El archivo tal como llegó, no una interpretación: lo que se discute con el
 * proveedor es su papel, no nuestra lectura de su papel.
 */
export async function guardarCotizacion(ordenId, archivo, { proveedor, items = [], iva = 0 }, quien) {
  let ruta = null, nombre = null;
  if (archivo) {
    const limpio = String(archivo.name || "cotizacion").replace(/[^\w.-]+/g, "_").slice(-60);
    ruta = `orden-${ordenId}/cotizaciones/${Date.now()}-${limpio}`;
    const { error } = await supabase.storage.from(BUCKET).upload(ruta, archivo, { upsert: false });
    if (error) return { error: `No se pudo subir el archivo de la cotización: ${error.message}` };
    nombre = archivo.name || limpio;
  }
  const lista = renglones(items);
  const { data, error } = await supabase.from("orden_cambio_cotizaciones").insert({
    orden_id: ordenId, archivo_path: ruta, archivo_nombre: nombre,
    proveedor: String(proveedor || "").trim() || null,
    total: Math.round(lista.reduce((t, x) => t + x.monto, 0) * 100) / 100,
    // Lo que de eso es impuesto. El total se guarda como lo paga el cliente;
    // la orden de cambio le saca el IVA para su costo, porque cobra sin IVA.
    iva: Number(iva) || 0,
    items: lista,
    creado_por: quien?.id ?? null, creado_nombre: quien?.name || null,
  }).select().single();
  if (error) {
    // Sin la tabla, el archivo subido quedaría suelto en el depósito.
    if (ruta) await supabase.storage.from(BUCKET).remove([ruta]);
    return { error: falta(error) ? SIN_125 : error.message };
  }
  return { cotizacion: data };
}

/** Las cotizaciones de varias órdenes, por orden. */
export async function cotizacionesDe(ordenIds = []) {
  if (!ordenIds.length) return { porOrden: {} };
  const { data, error } = await supabase.from("orden_cambio_cotizaciones")
    .select("*").in("orden_id", ordenIds).order("created_at");
  if (error) return { porOrden: {}, error: falta(error) ? SIN_125 : error.message };
  const porOrden = {};
  for (const c of data || []) (porOrden[c.orden_id] = porOrden[c.orden_id] || []).push(c);
  return { porOrden };
}

/**
 * Corregir el IVA de una cotización ya cargada.
 *
 * NOVA lo lee del papel, pero una proforma puede no decirlo, o decirlo de una
 * manera que no se entiende. Y de ese porcentaje depende el margen entero de la
 * orden: con el 15% puesto o sin poner, la misma cotización da dos márgenes que
 * se llevan quince puntos.
 */
export async function guardarIva(id, pct) {
  const n = Number(String(pct).replace(",", ".")) || 0;
  if (n < 0 || n > 30) return "El IVA se escribe como porcentaje: 15, o 0 si la proforma no tiene.";
  const { error } = await supabase.from("orden_cambio_cotizaciones").update({ iva: n }).eq("id", id);
  return error ? (falta(error) ? "Falta correr la migración 134 para guardar el IVA de la proforma." : error.message) : null;
}

/**
 * VOLVER A LEER UNA PROFORMA QUE YA ESTÁ GUARDADA.
 *
 * Las proformas que se leyeron antes de la 139 vinieron con el IVA adentro,
 * porque así lo pedía el lector. Arreglar eso pidiéndole a alguien que escriba
 * "15" es hacerle adivinar un dato que está impreso en el papel —y que además
 * no siempre es 15: en Ecuador era 12 hasta hace poco y hay proformas exentas—.
 *
 * El archivo está guardado. Lo honesto es volver a leerlo con el lector de
 * ahora y que el costo salga del papel, no de un porcentaje supuesto.
 */
export async function releerCotizacion(c, rubros = [], onPaso) {
  if (!c?.archivo_path) return { error: "Esta cotización no tiene el archivo guardado: no hay qué volver a leer." };
  const { data, error } = await supabase.storage.from(BUCKET).download(c.archivo_path);
  if (error) return { error: `No se pudo bajar la proforma: ${error.message}` };
  const file = new File([data], c.archivo_nombre || "cotizacion.pdf", { type: data.type || "application/pdf" });

  const leida = await leerConNova(file, rubros, onPaso);
  if (!leida.items?.length) return { error: "NOVA no encontró renglones al volver a leerla." };

  const lista = renglones(leida.items);
  const { data: fila, error: e2 } = await supabase.from("orden_cambio_cotizaciones").update({
    items: lista,
    total: Math.round(lista.reduce((t, x) => t + x.monto, 0) * 100) / 100,
    iva: Number(leida.iva) || 0,
    // Ya viene sin IVA: no hay nada que descontar después.
    neta: true,
    ...(leida.proveedor && !c.proveedor ? { proveedor: leida.proveedor } : {}),
  }).eq("id", c.id).select().single();
  if (e2) return { error: falta(e2) ? "Falta correr la migración 139." : e2.message };
  return { cotizacion: fila, cortado: leida.cortado, cuadre: leida.cuadre };
}

export async function guardarProveedor(id, proveedor) {
  const { error } = await supabase.from("orden_cambio_cotizaciones")
    .update({ proveedor: String(proveedor || "").trim() || null }).eq("id", id);
  return error ? error.message : null;
}

/** Quitarla: el archivo también, que es de una cotización que ya no está. */
export async function borrarCotizacion(c) {
  if (c.archivo_path) await supabase.storage.from(BUCKET).remove([c.archivo_path]);
  const { error } = await supabase.from("orden_cambio_cotizaciones").delete().eq("id", c.id);
  return error ? error.message : null;
}

/**
 * Los enlaces para abrir las cotizaciones, firmados de antemano.
 *
 * De antemano y no al hacer clic, por lo mismo que las proformas de
 * Beneficios: una ventana que se abre después de esperar al servidor ya no
 * cuenta como abierta por una persona, y Safari la bloquea sin decir nada.
 */
export async function enlacesDeCotizaciones(cotizaciones = []) {
  const conPapel = cotizaciones.filter(c => c?.archivo_path).map(c => ({ id: c.id, storage_path: c.archivo_path }));
  if (!conPapel.length) return {};
  return enlacesFirmados(conPapel, BUCKET);
}

/**
 * Que los beneficios de la obra digan lo que dicen sus órdenes de cambio.
 *
 * Se recalcula al abrir las órdenes o los beneficios, y no solo al aprobar
 * desde acá: una orden también se aprueba sola cuando firman todos desde el
 * portal, y ahí no pasa por este código. Si el beneficio se creara solo al
 * aprobar desde la oficina, las órdenes aprobadas por el cliente —que son la
 * mayoría— no aparecerían nunca en los números de la obra.
 *
 * Solo toca lo previsto: lo confirmado es una compra que ya pasó.
 */
export async function sincronizarBeneficios(obraId) {
  const { data: ordenes, error: e1 } = await supabase.from("ordenes_cambio").select("*").eq("obra_id", obraId);
  if (e1) return { error: falta(e1) ? null : e1.message };
  const ids = (ordenes || []).map(o => o.id);

  const [ls, cs, rs, bs, gs] = await Promise.all([
    ids.length ? supabase.from("orden_cambio_lineas").select("*").in("orden_id", ids) : { data: [] },
    cotizacionesDe(ids),
    supabase.from("obra_rubros").select("id,descripcion,orden_cambio_id").eq("obra_id", obraId).not("orden_cambio_id", "is", null),
    supabase.from("obra_beneficios").select("*").eq("obra_id", obraId).not("orden_cambio_id", "is", null),
    gastosDe(ids),
  ]);
  if (cs.error) return { error: cs.error };
  if (bs.error) return { error: falta(bs.error) ? SIN_125 : bs.error.message };
  if (ls.error) return { error: falta(ls.error) ? SIN_125 : ls.error.message };

  const lineasPorOrden = {};
  for (const l of ls.data || []) (lineasPorOrden[l.orden_id] = lineasPorOrden[l.orden_id] || []).push(l);

  const plan = planDeBeneficios({
    obraId, ordenes: ordenes || [], lineasPorOrden, rubros: rs.data || [],
    cotizaciones: cs.porOrden, gastosPorOrden: gs.porOrden, existentes: bs.data || [], codigoDe,
  });

  if (plan.borrar.length) {
    const { error } = await supabase.from("obra_beneficios").delete().in("id", plan.borrar);
    if (error) return { error: error.message };
  }
  for (const { id, campos } of plan.actualizar) {
    const { error } = await supabase.from("obra_beneficios").update(campos).eq("id", id);
    if (error) return { error: error.message };
  }
  if (plan.insertar.length) {
    const { error } = await supabase.from("obra_beneficios").insert(plan.insertar);
    if (error) return { error: falta(error) ? SIN_125 : error.message };
  }
  return { cambios: plan.borrar.length + plan.actualizar.length + plan.insertar.length };
}

// ── LOS GASTOS DE UNA ORDEN ─────────────────────────────────────────────────
//
// Lo que cuesta la orden y no es el costo de una partida: el flete, la mano de
// obra propia, el andamio, la segunda proforma. Sin esto, esa plata no tenía
// dónde ir y el margen de la pantalla era más alto que el de verdad — y con
// ese número se pone el precio de la próxima orden.

export const SIN_135 = "Falta correr la migración 135 para cargarle gastos a una orden de cambio.";

/** Los gastos de varias órdenes, por orden. */
export async function gastosDe(ordenIds = []) {
  if (!ordenIds.length) return { porOrden: {} };
  const { data, error } = await supabase.from("orden_cambio_gastos")
    .select("*").in("orden_id", ordenIds).order("created_at");
  if (error) return { porOrden: {}, error: falta(error) ? SIN_135 : error.message };
  const porOrden = {};
  for (const g of data || []) (porOrden[g.orden_id] = porOrden[g.orden_id] || []).push(g);
  return { porOrden };
}

export async function guardarGasto(ordenId, gasto, quien) {
  const { id, ...campos } = gasto;
  const q = id
    ? supabase.from("orden_cambio_gastos").update(campos).eq("id", id)
    : supabase.from("orden_cambio_gastos").insert({
      ...campos, orden_id: ordenId,
      creado_por: quien?.id ?? null, creado_nombre: quien?.name || null,
    });
  const { data, error } = await q.select().single();
  if (error) return { error: falta(error) ? SIN_135 : error.message };
  return { gasto: data };
}

export async function borrarGasto(id) {
  const { error } = await supabase.from("orden_cambio_gastos").delete().eq("id", id);
  return error ? error.message : null;
}
