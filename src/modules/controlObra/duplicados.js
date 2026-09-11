// Detección de facturas duplicadas.
//
// La misma factura puede intentar entrar dos veces: por planilla y por caja
// chica. Eso es un error grave o un doble cobro, así que la detección es
// DETERMINÍSTICA — no depende del criterio de NOVA. NOVA solo extrae los
// datos; comparar es trabajo del sistema.
//
//   exacto   → mismo RUC + mismo N° de factura, o el mismo archivo
//   posible  → mismo proveedor + mismo monto + fechas cercanas
//
// El caso "posible" existe porque a veces no se captura el N° de factura.

import { supabase } from "../../lib/supabase";

const DIAS_CERCANOS = 5;
const norm = s => (s || "").toString().trim().toUpperCase().replace(/[\s.-]/g, "");
const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);

/** Huella del archivo: detecta el mismo documento aunque le cambien el nombre. */
export async function hashArchivo(file) {
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/**
 * Busca duplicados de una factura dentro de la misma obra.
 * @returns {{exactos: Array, posibles: Array}}
 */
export async function buscarDuplicados({ obraId, ruc, numeroFactura, razonSocial, monto, fecha, archivoHash, excluirId = null }) {
  if (!obraId) return { exactos: [], posibles: [] };

  const { data } = await supabase.from("obra_facturas")
    .select("id,fecha,ruc,numero_factura,razon_social,total,origen,planilla_id,subido_por_nombre,created_at,archivo_hash")
    .eq("obra_id", obraId);

  const otras = (data || []).filter(f => f.id !== excluirId);
  const exactos = [], posibles = [];

  for (const f of otras) {
    const mismaIdentidad = numeroFactura && ruc &&
      norm(f.numero_factura) === norm(numeroFactura) && norm(f.ruc) === norm(ruc);
    const mismoArchivo = archivoHash && f.archivo_hash && f.archivo_hash === archivoHash;

    if (mismaIdentidad || mismoArchivo) {
      exactos.push({ ...f, motivo: mismaIdentidad ? "identidad" : "archivo" });
      continue;
    }

    // Sin N° de factura no hay certeza: se marca como sospecha
    const mismoProveedor = razonSocial && f.razon_social && norm(f.razon_social) === norm(razonSocial);
    const mismoMonto = monto && Math.abs(Number(f.total) - Number(monto)) < 0.01;
    const fechaCerca = fecha && f.fecha && dias(f.fecha, fecha) <= DIAS_CERCANOS;
    if (mismoProveedor && mismoMonto && fechaCerca) posibles.push({ ...f, motivo: "proveedor-monto-fecha" });
  }

  return { exactos, posibles };
}

/** Escanea toda una obra y agrupa las facturas duplicadas entre sí. */
export async function auditarObra(obraId) {
  const { data } = await supabase.from("obra_facturas")
    .select("id,fecha,ruc,numero_factura,razon_social,total,origen,planilla_id,subido_por_nombre,created_at,archivo_hash,duplicado_de,duplicado_justificacion")
    .eq("obra_id", obraId).order("created_at");

  const facturas = data || [];
  const grupos = new Map();

  for (const f of facturas) {
    let clave = null, tipo = null;
    if (f.numero_factura && f.ruc) { clave = "id:" + norm(f.ruc) + "|" + norm(f.numero_factura); tipo = "exacto"; }
    else if (f.archivo_hash) { clave = "file:" + f.archivo_hash; tipo = "exacto"; }
    else if (f.razon_social && f.total) { clave = "aprox:" + norm(f.razon_social) + "|" + Number(f.total).toFixed(2); tipo = "posible"; }
    if (!clave) continue;
    if (!grupos.has(clave)) grupos.set(clave, { clave, tipo, facturas: [] });
    grupos.get(clave).facturas.push(f);
  }

  // Los "posibles" solo cuentan si además las fechas están cerca
  return [...grupos.values()]
    .filter(g => g.facturas.length > 1)
    .filter(g => g.tipo === "exacto" || g.facturas.every((f, _, arr) => dias(f.fecha, arr[0].fecha) <= DIAS_CERCANOS))
    .map(g => ({ ...g, total: g.facturas.reduce((s, f) => s + Number(f.total || 0), 0), justificado: g.facturas.some(f => f.duplicado_de) }))
    .sort((a, b) => (a.tipo === b.tipo ? b.total - a.total : a.tipo === "exacto" ? -1 : 1));
}
