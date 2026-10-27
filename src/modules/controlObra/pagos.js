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
  // UN ANTICIPO NO ES OBRA HECHA. Sale plata para que el proveedor arranque
  // una fabricación o una importación, y el material todavía no llegó. Cuenta
  // en la caja —salió— y no cuenta como invertido: se liquida cuando llega lo
  // que se anticipó, y ahí vale la factura.
  anticipo:      { label: "Anticipo a proveedor", pista: "Plata adelantada por algo que todavía no llegó: no cuenta como obra hecha hasta que se liquide" },
  // UNA NOTA DE CRÉDITO ES PLATA QUE VUELVE.
  //
  // Se devolvió material, el proveedor cobró de más, llegó algo roto. El
  // documento que emite no es un gasto: es un vale que descuenta de lo que se
  // le debe o se vuelve a gastar con él. Hasta ahora había que cargarlo como
  // "otro" con el monto en negativo —alguien ya lo hizo, por −99,97— y eso
  // funciona de casualidad: nadie sabe que hay que poner el menos, y el que lo
  // olvida suma un gasto donde tenía que restar.
  nota_credito:  { label: "Nota de crédito (devolución)", pista: "Plata que vuelve: se devolvió material o se cobró de más. Entra en negativo y baja lo gastado" },
};

// CON QUÉ SE PAGÓ. "nota de crédito" es una forma de pago como cualquier
// otra: la factura se saldó con un vale que ya teníamos, no salió plata del
// banco. Sin esta opción había que anotarlo en la referencia, a mano, y el
// vale quedaba usado en un lado y disponible en el otro.
export const FORMAS_PAGO = ["transferencia", "cheque", "efectivo", "nota de crédito", "otro"];

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

// La aritmética de las cuentas vive en su propio archivo, sin base de datos,
// para poder probarla. Se re-exporta desde acá para no mover las pantallas.
export {
  esNotaDeCredito, pagadoPorFactura, estadoDe, ETIQUETA_PAGO,
  cuentasPorProveedor, totalesPorPagar,
} from "./cuentasProveedor.js";
