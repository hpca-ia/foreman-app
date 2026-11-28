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
  recibo:        { label: "Recibo",         pista: "Un respaldo simple: honorarios, un servicio suelto, una compra sin factura. Es gasto y se cuenta lo que trae" },
  // UN PASAJE ES UN GASTO DE LA OBRA como cualquier otro, y trae sus propios
  // renglones: la tarifa, las tasas, el impuesto. Cargado como "factura" se
  // pierde que fue un viaje, y cargado como "otro" no se sabe qué fue.
  pasaje:        { label: "Pasaje aéreo",   pista: "Boleto de avión: tarifa, tasas e impuestos. Cuenta como gasto de logística" },
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

// LO QUE SE PUEDE CARGAR DESDE CAJA CHICA. Una caja chica paga en el momento:
// no hay proforma que esperar ni anticipo que liquidar.
export const CLASES_CAJA = ["factura", "nota_venta", "recibo", "pasaje", "nota_credito"];

/** La clase del documento a partir del tipo de un gasto de caja chica. */
export const claseDeGasto = tipo => (CLASES_CAJA.includes(tipo) ? tipo : "recibo");

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

// EL COMPROBANTE DEL PAGO (migración 203). Hernán, 28/11/2026: el pago
// guardaba fecha, forma y referencia, pero no el papel; «sí, agrega subir».
export const SIN_MIGRACION_203 = "Falta correr la migración 203 en Supabase para guardar el comprobante del pago.";

/** Sube el comprobante al depósito, en la carpeta de la obra. */
async function subirComprobante(obraId, archivo) {
  const limpio = String(archivo.name || "comprobante").replace(/[^\w.-]/g, "_").slice(-60);
  const ruta = `obra-${obraId}/pago-${Date.now()}-${limpio}`;
  const { error } = await supabase.storage.from("task-files").upload(ruta, archivo, { upsert: false });
  if (error) return { error: "No se pudo subir el comprobante: " + error.message };
  return { ruta, nombre: archivo.name || "comprobante" };
}

/**
 * Ponerle el comprobante a un pago que ya está registrado, o cambiárselo.
 * El archivo anterior, si había, se quita del depósito.
 */
export async function ponerComprobante(pago, archivo) {
  if (!archivo) return { error: "Elegí el archivo del comprobante." };
  const subido = await subirComprobante(pago.obra_id, archivo);
  if (subido.error) return subido;
  const { error } = await supabase.from("obra_pagos")
    .update({ archivo_url: subido.ruta, archivo_nombre: subido.nombre }).eq("id", pago.id);
  if (error) {
    await supabase.storage.from("task-files").remove([subido.ruta]);
    return { error: falta(error) ? SIN_MIGRACION_203 : error.message };
  }
  if (pago.archivo_url && pago.archivo_url !== subido.ruta) await supabase.storage.from("task-files").remove([pago.archivo_url]);
  return { ok: true, archivo_url: subido.ruta, archivo_nombre: subido.nombre };
}

/**
 * @param datos.archivo  el comprobante (opcional): la transferencia, la foto
 *   del cheque. Si no se puede guardar, el pago se registra igual y se avisa
 *   en `aviso`: perder el pago por culpa del papel sería peor.
 */
export async function registrarPago(factura, datos, quien) {
  const monto = Number(datos.monto);
  if (!(monto > 0)) return { error: "Escribí cuánto se pagó." };

  let comprobante = null, aviso = "";
  if (datos.archivo) {
    const subido = await subirComprobante(factura.obra_id, datos.archivo);
    if (subido.error) aviso = subido.error; else comprobante = subido;
  }
  const conPapel = comprobante ? { archivo_url: comprobante.ruta, archivo_nombre: comprobante.nombre } : {};
  const fila = {
    factura_id: factura.id, obra_id: factura.obra_id,
    fecha: datos.fecha || new Date().toISOString().split("T")[0],
    monto, forma: datos.forma || null, referencia: datos.referencia?.trim() || null,
    nota: datos.nota?.trim() || null,
    // CON QUÉ VALE SE PAGÓ. Un pago con nota de crédito no salió del banco:
    // salió del crédito que teníamos a favor, y ese crédito deja de estar
    // disponible por ese monto. Sin esto había que marcar el vale usado a mano
    // en otra pantalla, y nadie podía saber en qué factura se fue.
    ...(datos.nota_credito_id ? { nota_credito_id: Number(datos.nota_credito_id) } : {}),
    registrado_por: quien?.id ?? null, registrado_nombre: quien?.name || null,
  };
  let { data, error } = await supabase.from("obra_pagos").insert({ ...fila, ...conPapel }).select().single();
  // Sin la 203 el pago entra sin su papel, y se dice.
  if (error && comprobante && falta(error)) {
    await supabase.storage.from("task-files").remove([comprobante.ruta]);
    aviso = SIN_MIGRACION_203;
    ({ data, error } = await supabase.from("obra_pagos").insert(fila).select().single());
  }
  if (error) {
    if (comprobante) await supabase.storage.from("task-files").remove([comprobante.ruta]);
    return { error: falta(error) ? "Falta correr la migración 060." : error.message };
  }
  return aviso ? { pago: data, aviso: `El pago se guardó, pero sin el comprobante. ${aviso}` } : { pago: data };
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
  cuentasPorProveedor, totalesPorPagar, usadoPorNota, creditoDisponible, valesDisponibles,
} from "./cuentasProveedor.js";
