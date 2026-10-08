import { supabase } from "../../lib/supabase";

// Cuánto se pagó y cuánto falta, por documento y por proveedor.
//
// Gastado y pagado no son lo mismo, y confundirlos es de donde salen los
// sustos de caja: una factura de 12.000 con un anticipo del 40% ya golpeó el
// rubro entero —el gasto está hecho— y sin embargo quedan 7.200 por salir.
// Control de Obra contesta lo primero; esto contesta lo segundo.
//
// El saldo nunca se guarda: sale de restar los pagos al total. Un saldo
// guardado se desincroniza el día que alguien corrige un pago, y ahí hay dos
// verdades y ninguna sirve.

/**
 * Con qué papel llega un gasto.
 *
 * No todo lo que se compra en una obra viene con factura, y fingir que sí es
 * lo que hace que la mitad de los gastos chicos no se registren: el ferretero
 * del barrio da NOTA DE VENTA, el maestro que presta un servicio da RECIBO, y
 * esa plata se gastó igual. Si la app solo acepta "factura" o "proforma", lo
 * que entra se llama factura aunque no lo sea —y en el SRI eso es otra cosa.
 *
 * Los cuatro valen para el control de obra. La diferencia que importa para la
 * contabilidad es si da crédito tributario, y por eso se dice en la pista.
 */
export const CLASES_DOC = {
  factura:       { label: "Factura",        pista: "El documento definitivo, con crédito tributario" },
  nota_venta:    { label: "Nota de venta",  pista: "Régimen simplificado: es gasto válido y NO da crédito tributario" },
  recibo:        { label: "Recibo",         pista: "Un respaldo simple: honorarios, un servicio suelto" },
  proforma:      { label: "Proforma",       pista: "Todavía hay que pedir el documento definitivo" },
};

export const FORMAS_PAGO = ["transferencia", "cheque", "efectivo", "otro"];

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");
const n = v => Number(v) || 0;

export async function pagosDeObra(obraId) {
  const { data, error } = await supabase.from("obra_pagos")
    .select("*").eq("obra_id", obraId).order("fecha", { ascending: false });
  if (error) return { pagos: [], sinTablas: falta(error) };
  return { pagos: data || [], sinTablas: false };
}

export async function registrarPago(factura, datos, quien) {
  const monto = Number(datos.monto);
  if (!(monto > 0)) return { error: "Escribí cuánto se pagó." };

  const { data, error } = await supabase.from("obra_pagos").insert({
    factura_id: factura.id, obra_id: factura.obra_id,
    fecha: datos.fecha || new Date().toISOString().split("T")[0],
    monto, forma: datos.forma || null, referencia: datos.referencia?.trim() || null,
    nota: datos.nota?.trim() || null,
    registrado_por: quien?.id ?? null, registrado_nombre: quien?.name || null,
  }).select().single();
  if (error) return { error: falta(error) ? "Falta correr la migración 060." : error.message };
  return { pago: data };
}

export async function borrarPago(id) {
  const { error } = await supabase.from("obra_pagos").delete().eq("id", id);
  return error ? error.message : null;
}

/** Cambiar qué es un documento, o enlazar la proforma con su factura. */
export async function guardarDocumento(facturaId, campos) {
  const { error } = await supabase.from("obra_facturas").update(campos).eq("id", facturaId);
  return error ? (falta(error) ? "Falta correr la migración 060." : error.message) : null;
}

/** Lo pagado de cada documento, por su id. */
export function pagadoPorFactura(pagos = []) {
  const mapa = {};
  pagos.forEach(p => { mapa[p.factura_id] = (mapa[p.factura_id] || 0) + n(p.monto); });
  return mapa;
}

/** Un documento con su plata al día: total, pagado, saldo y en qué anda. */
export function estadoDe(factura, pagado = 0) {
  const total = n(factura.total);
  const saldo = Math.round((total - pagado) * 100) / 100;
  return {
    total, pagado, saldo,
    // Medio centavo de tolerancia: los redondeos de IVA no pueden dejar una
    // factura "casi pagada" para siempre.
    estado: pagado <= 0.005 ? "sin_pagar" : saldo <= 0.005 ? "pagado" : "parcial",
    pct: total > 0 ? pagado / total : 0,
  };
}

export const ETIQUETA_PAGO = {
  sin_pagar: { label: "Sin pagar", color: "danger" },
  parcial:   { label: "Pago parcial", color: "warning" },
  pagado:    { label: "Pagado", color: "success" },
};

/**
 * La cuenta de cada proveedor: cuánto se le documentó, cuánto se le pagó y
 * cuánto le debemos.
 *
 * Se agrupa por RUC cuando lo hay, y por razón social cuando no: el RUC es lo
 * único que de verdad identifica a un proveedor —"FERRETERÍA EL SOL" y
 * "Ferreteria El Sol S.A." son el mismo— pero no todas las facturas viejas lo
 * tienen cargado.
 *
 * Las proformas se cuentan aparte de las facturas: una proforma no es una
 * deuda exigible, es plata comprometida que además hay que hacer facturar.
 */
export function cuentasPorProveedor(facturas = [], pagos = []) {
  const pagado = pagadoPorFactura(pagos);
  const cuentas = new Map();

  facturas.forEach(f => {
    const clave = (f.ruc || "").trim() || (f.razon_social || "").trim().toUpperCase() || "SIN PROVEEDOR";
    if (!cuentas.has(clave)) {
      cuentas.set(clave, {
        clave, ruc: f.ruc || "", nombre: f.razon_social || "Sin proveedor",
        facturado: 0, pagado: 0, saldo: 0, proformas: 0, porFacturar: 0,
        documentos: [],
      });
    }
    const c = cuentas.get(clave);
    if (f.razon_social && !c.nombre) c.nombre = f.razon_social;
    const e = estadoDe(f, pagado[f.id] || 0);

    if (f.clase === "proforma") {
      // Una proforma ya facturada dejó de serlo: su plata la cuenta la factura.
      if (!f.facturada_con_id) { c.proformas += e.total; c.porFacturar += 1; }
    } else {
      c.facturado += e.total;
      c.pagado += e.pagado;
      c.saldo += e.saldo;
    }
    c.documentos.push({ ...f, ...e });
  });

  return [...cuentas.values()]
    .map(c => ({ ...c, documentos: c.documentos.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))) }))
    // Primero a quien más se le debe: es la lista con la que se arma el pago
    // de la semana.
    .sort((a, b) => b.saldo - a.saldo || a.nombre.localeCompare(b.nombre));
}

/** Los totales de la obra, para el encabezado. */
export function totalesPorPagar(cuentas = []) {
  return cuentas.reduce((t, c) => ({
    facturado: t.facturado + c.facturado,
    pagado: t.pagado + c.pagado,
    saldo: t.saldo + c.saldo,
    proformas: t.proformas + c.proformas,
    porFacturar: t.porFacturar + c.porFacturar,
  }), { facturado: 0, pagado: 0, saldo: 0, proformas: 0, porFacturar: 0 });
}
