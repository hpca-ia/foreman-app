import { supabase } from "../../lib/supabase";
import { anotar, subirAdjunto, facturarCompra } from "./compras";
import { buscarDuplicados } from "../controlObra/duplicados";
import { numeroDeCompra } from "./devueltas.js";
import { TIPOS_PENDIENTE, queHacerConLaFactura, puedeResolver, loLeido, lineaAlDejar, lineaAlResolver } from "./pendientes.js";

// Los pendientes de una compra, contra la base: dejarlos, subir el papel que
// NOVA lee, y resolverlos. Las reglas están en pendientes.js.

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");
export const SIN_MIGRACION = "Falta correr la migración 200 (pendientes de compra) en Supabase.";

/** Los de una compra, abiertos y resueltos. Sin la 200, ninguno. */
export async function pendientesDe(solicitudId) {
  if (!solicitudId) return [];
  const { data, error } = await supabase.from("compras_pendientes")
    .select("*").eq("solicitud_id", solicitudId).order("created_at");
  return error ? [] : data || [];
}

/** Los abiertos de varias compras: { solicitud_id: [pendientes] }. */
export async function abiertosDe(ids) {
  const porCompra = {};
  const lista = [...new Set((ids || []).filter(Boolean))];
  for (let i = 0; i < lista.length; i += 200) {
    const { data, error } = await supabase.from("compras_pendientes")
      .select("id,solicitud_id,tipo,texto,para_id,para_nombre,created_at")
      .in("solicitud_id", lista.slice(i, i + 200)).is("resuelto_at", null);
    if (error) return porCompra;
    for (const p of data || []) (porCompra[p.solicitud_id] ||= []).push(p);
  }
  return porCompra;
}

/** Lo justo de las facturas del control para saber si les falta el papel. */
export async function papelesDelControl(facturaIds) {
  const porId = {};
  const lista = [...new Set((facturaIds || []).filter(Boolean))];
  for (let i = 0; i < lista.length; i += 200) {
    const { data } = await supabase.from("obra_facturas")
      .select("id,clase,numero_factura,archivo_url,total,origen")
      .in("id", lista.slice(i, i + 200));
    for (const f of data || []) porId[f.id] = f;
  }
  return porId;
}

export async function facturaDelControl(id) {
  if (!id) return null;
  const { data } = await supabase.from("obra_facturas")
    .select("id,obra_id,clase,numero_factura,ruc,razon_social,archivo_url,archivo_nombre,total,origen").eq("id", id).maybeSingle();
  return data || null;
}

/** Los residentes con acceso al proyecto (ficha → equipo). */
export async function residentesDe(leadId) {
  if (!leadId) return [];
  const { data: accesos } = await supabase.from("lead_accesos").select("usuario_id").eq("lead_id", leadId);
  const ids = (accesos || []).map(a => a.usuario_id).filter(Boolean);
  if (!ids.length) return [];
  const { data } = await supabase.from("usuarios").select("id,rol").in("id", ids);
  return (data || []).filter(u => u.rol === "residente").map(u => Number(u.id));
}

/**
 * Dejar un pendiente: queda en la compra, en su historial, como tarea de
 * quien lo resuelve, y por correo a los de la compra y a los residentes.
 */
export async function dejarPendiente(solicitud, { tipo, texto, para, quien }) {
  const limpio = String(texto || "").trim();
  if (!TIPOS_PENDIENTE[tipo]) return { error: "¿Qué falta: la factura, una devolución u otra cosa?" };
  if (!limpio) return { error: "Escribí qué falta." };
  if (!para?.id) return { error: "¿Quién lo resuelve?" };

  const fila = {
    solicitud_id: solicitud.id, tipo, texto: limpio,
    para_id: para.id, para_nombre: para.name || para.nombre || null,
    creado_por: quien?.id ?? null, creado_nombre: quien?.name || null,
  };
  const { data: p, error } = await supabase.from("compras_pendientes").insert(fila).select().single();
  if (error) return { error: falta(error) ? SIN_MIGRACION : error.message };

  // La tarea es el aviso: aparece en el tablero de esa persona y, al tocarla,
  // abre la compra.
  const tarea = {
    title: `${TIPOS_PENDIENTE[tipo].label} · ${numeroDeCompra(solicitud)} ${solicitud.descripcion || ""}`.trim(),
    lead_id: solicitud.lead_id, assignee_id: para.id,
    priority: "media", status: "en-progreso", type: "Compra", compra_id: solicitud.id,
    notes: limpio, created_by: quien?.id ?? null,
  };
  let { data: t } = await supabase.from("tasks").insert(tarea).select("id").single();
  if (!t) {
    const { compra_id, type, ...resto } = tarea;
    ({ data: t } = await supabase.from("tasks").insert({ ...resto, type: "Gestión" }).select("id").single());
  }
  if (t?.id) await supabase.from("compras_pendientes").update({ tarea_id: t.id }).eq("id", p.id);

  await anotar(solicitud.id, solicitud.estado, solicitud.estado, quien, lineaAlDejar(fila));

  // El correo no frena el pendiente: si falla, lo escrito ya está.
  fetch("/api/aviso?de=compra", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ solicitudId: solicitud.id, texto: limpio, autorId: quien?.id ?? null,
      pendiente: { tipo, paraId: para.id, paraNombre: fila.para_nombre } }),
  }).catch(() => {});

  return { pendiente: { ...p, tarea_id: t?.id ?? null } };
}

/**
 * El papel que resuelve el pendiente, ya leído por NOVA (`leido`).
 *
 * De factura: queda registrada en el control —se completa la que no tenía
 * papel ni número, o entra nueva— y el pendiente apunta a ella. De devolución
 * u otro: el papel queda en la compra y en el pendiente.
 *
 * @returns { pendiente, factura } o { error }
 */
export async function registrarPapel(solicitud, p, { archivo, leido }, quien) {
  if (!archivo) return { error: "Elegí el papel." };
  if (!leido || leido.error) return { error: `NOVA no pudo leerlo${leido?.error ? `: ${leido.error}` : ""}.` };

  // Lo que va a pasar con la factura se decide ANTES de subir nada.
  let factura = null, decision = null;
  if (p.tipo === "factura") {
    factura = await facturaDelControl(solicitud.factura_id);
    decision = queHacerConLaFactura(leido, factura);
    if (decision.error) return { error: decision.error };
    if (decision.accion === "completar" && leido.numero && leido.ruc) {
      const ya = await buscarDuplicados({ obraId: factura.obra_id, ruc: leido.ruc, numeroFactura: leido.numero, excluirId: factura.id });
      const d = ya.exactos[0];
      if (d) return { error: `Esa factura ya está en el control: ${d.razon_social || "ese proveedor"} #${d.numero_factura}, por $${Number(d.total).toFixed(2)}. Enganchala desde Alertas en el control.` };
    }
  }

  const sub = await subirAdjunto(solicitud, archivo, {
    tipo: "respaldo", quien,
    proveedor: leido.proveedor || null, monto: leido.monto || null,
    nota: `${p.tipo === "devolucion" ? "Devolución" : p.tipo === "factura" ? "Factura" : "Pendiente"} · ${leido.detalle || archivo.name}`,
  });
  if (sub.error) return { error: `No se pudo subir el papel: ${sub.error}` };
  const ruta = sub.adjunto?.storage_path;

  if (decision?.accion === "completar") {
    const clase = ["factura", "nota_venta", "recibo"].includes(leido.clase) ? leido.clase : "factura";
    const { error } = await supabase.from("obra_facturas").update({
      archivo_url: ruta, archivo_nombre: archivo.name,
      numero_factura: leido.numero?.trim() || factura.numero_factura || null,
      ruc: leido.ruc?.trim() || factura.ruc || null,
      razon_social: leido.proveedor?.trim() || factura.razon_social || null,
      ...(leido.fecha ? { fecha: leido.fecha } : {}),
      clase, tipo_documento: clase.toUpperCase(), origen: "nova",
    }).eq("id", factura.id);
    if (error) return { error: `El papel quedó en la compra, pero la factura del control no se completó: ${error.message}` };
    await anotar(solicitud.id, solicitud.estado, solicitud.estado, quien,
      `Factura${leido.numero ? ` ${leido.numero}` : ""} leída por NOVA: se le puso el papel a la que estaba en el control por $${Number(factura.total).toFixed(2)}`);
  } else if (decision?.accion === "nueva") {
    const r = await facturarCompra(solicitud, {
      clase: leido.clase, proveedor: leido.proveedor || solicitud.proveedor || "", ruc: leido.ruc, numero: leido.numero,
      fecha: leido.fecha, total: leido.monto, archivo_url: ruta, archivo_nombre: archivo.name, origen: "nova",
    }, quien);
    if (r.error) return { error: `El papel quedó en la compra, pero la factura no entró al control: ${r.error}` };
    factura = r.factura;
  } else {
    await anotar(solicitud.id, solicitud.estado, solicitud.estado, quien,
      `Papel leído por NOVA para el pendiente: ${[leido.proveedor, leido.numero, leido.monto != null && `$${Number(leido.monto).toFixed(2)}`].filter(Boolean).join(" · ")}`);
  }

  const cambios = {
    doc_path: ruta, doc_nombre: archivo.name, doc_leido: loLeido(leido), doc_leido_at: new Date().toISOString(),
    ...(p.tipo === "factura" && factura?.id ? { factura_id: factura.id } : {}),
  };
  const { data, error } = await supabase.from("compras_pendientes").update(cambios).eq("id", p.id).select().single();
  if (error) return { error: falta(error) ? SIN_MIGRACION : error.message };
  return { pendiente: data, factura: factura ? await facturaDelControl(factura.id) : null };
}

/** Darlo por resuelto. La base no deja si falta el papel leído (migración 200). */
export async function resolverPendiente(solicitud, p, { nota, quien, factura = null }) {
  const puede = puedeResolver(p, factura);
  if (!puede.ok) return { error: puede.porque };
  if (p.tipo === "otro" && !String(nota || "").trim()) return { error: "Escribí cómo se resolvió." };
  // Leída por NOVA en el control: el pendiente queda apuntando a ese papel.
  const delControl = puede.desdeElControl ? {
    doc_path: factura.archivo_url, doc_nombre: factura.archivo_nombre || null, doc_leido_at: new Date().toISOString(),
    doc_leido: { proveedor: factura.razon_social || null, numero: factura.numero_factura, monto: Number(factura.total) || null, desde: "control" },
    factura_id: factura.id,
  } : {};
  const { data, error } = await supabase.from("compras_pendientes").update({
    ...delControl,
    resuelto_at: new Date().toISOString(), resuelto_por: quien?.id ?? null, resuelto_nombre: quien?.name || null,
    resuelto_nota: String(nota || "").trim() || null,
  }).eq("id", p.id).select().single();
  if (error) return { error: error.message };
  if (p.tarea_id) await supabase.from("tasks").update({ status: "listo" }).eq("id", p.tarea_id);
  await anotar(solicitud.id, solicitud.estado, solicitud.estado, quien, lineaAlResolver(p, nota));
  return { pendiente: data };
}
