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
export async function buscarDuplicados({ obraId, ruc, numeroFactura, razonSocial, monto, fecha, archivoHash, excluirId = null, excluirGastoId = null }) {
  if (!obraId) return { exactos: [], posibles: [] };

  const { data } = await supabase.from("obra_facturas")
    .select("id,fecha,ruc,numero_factura,razon_social,total,origen,planilla_id,subido_por_nombre,created_at,archivo_hash,caja_gasto_id")
    .eq("obra_id", obraId);

  // Al corregir algo que ya estaba, ese mismo documento no es su duplicado:
  // la factura que se edita, o la del gasto de caja chica que se corrige.
  const otras = (data || []).filter(f => f.id !== excluirId
    && (excluirGastoId == null || Number(f.caja_gasto_id) !== Number(excluirGastoId)));
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
