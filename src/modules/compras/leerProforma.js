import { buscarOCrear } from "../../lib/proveedores";
import { LECTURA, textoDeNova } from "../../lib/modelos";

// NOVA lee la proforma que acaban de subir.
//
// La misma idea que con las facturas de Control de Obra, en el momento en que
// más sirve: el residente saca la foto de la cotización en la obra y el
// proveedor, el RUC y el monto se llenan solos. Escribirlos a mano desde el
// teléfono es de donde salen "Ferretería Kiwy", "kiwy" y "FERRETERIA KYWI"
// como tres proveedores distintos — NOVA lee el membrete, que es uno solo.
//
// Devuelve lo que entendió; no guarda nada. Quien subió el papel lo revisa
// antes, porque una cotización mal leída se vuelve una compra mal aprobada.

export async function leerProforma(archivo) {
  const b64 = await new Promise(res => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.readAsDataURL(archivo);
  });
  const esPdf = archivo.type === "application/pdf";

  const res = await fetch("/api/nova", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LECTURA, max_tokens: 700,
      system: `Eres NOVA. Lees proformas y cotizaciones de proveedores de construcción en Ecuador y devuelves SOLO JSON, sin markdown:
{"proveedor":"","ruc":"","monto":0,"validez":"","detalle":""}
"proveedor" es la razón social o el nombre comercial de QUIEN COTIZA, nunca el cliente.
Escríbelo tal como aparece en el membrete, completo, sin abreviar ni agregar nada.
"monto" es el TOTAL a pagar con IVA incluido. Si solo hay subtotal, suma el IVA.
"validez" es hasta cuándo vale el precio, en YYYY-MM-DD, o "" si no lo dice.
"detalle" es en una línea qué se está cotizando.`,
      messages: [{
        role: "user",
        content: [
          esPdf
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
            : { type: "image", source: { type: "base64", media_type: archivo.type || "image/jpeg", data: b64 } },
          { type: "text", text: "Extrae los datos de esta proforma. Solo JSON." },
        ],
      }],
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) return { error: data.error?.message || "NOVA no pudo leerla." };
  try {
    const txt = (textoDeNova(data) || "{}").replace(/```json|```/g, "").trim();
    const p = JSON.parse(txt);
    return {
      proveedor: (p.proveedor || "").trim(),
      ruc: (p.ruc || "").trim(),
      monto: Number(p.monto) || null,
      validez: p.validez || null,
      detalle: (p.detalle || "").trim(),
    };
  } catch {
    return { error: "NOVA devolvió algo que no se entiende. Cargalo a mano." };
  }
}

/**
 * Lo que leyó NOVA pasa por la lista de proveedores antes de guardarse.
 *
 * Si ese RUC ya está, se usa el nombre con el que está guardado y no el del
 * membrete de hoy: así una misma empresa no entra dos veces porque en una
 * factura dice "CIA. LTDA." y en otra "Cía Ltda". El RUC decide, que es lo
 * único que no cambia.
 */
export async function proveedorCanonico({ proveedor, ruc }) {
  if (!proveedor) return { proveedor, ruc };
  const fila = await buscarOCrear({ nombre: proveedor, ruc });
  return { proveedor: fila?.nombre || proveedor, ruc: fila?.ruc || ruc };
}

/**
 * Leer el documento con el que se concreta la compra: factura, nota de venta o
 * recibo.
 *
 * Hermano de `leerProforma`, y hacía falta. Hasta acá NOVA leía el papel UNA
 * sola vez en toda la vida de una compra —la cotización, para aprobarla— y
 * después, cuando llega el documento de verdad, alguien tecleaba a mano el
 * proveedor, el RUC, el número y el total. Justo los datos que más cuesta
 * tipear y donde más caro sale equivocarse: un número de factura mal copiado
 * es una factura que después nadie encuentra, y un RUC mal puesto es un gasto
 * que no cuadra con la contabilidad.
 *
 * Pide además NÚMERO y FECHA, que la proforma no necesita y el documento
 * definitivo sí. Y la CLASE, porque en obra llegan los cuatro y quien carga no
 * tiene por qué saber distinguir una nota de venta de una factura: el papel lo
 * dice y NOVA lo lee.
 */
export async function leerDocumentoDeCompra(archivo) {
  const b64 = await new Promise(res => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.readAsDataURL(archivo);
  });
  const esPdf = archivo.type === "application/pdf";

  const res = await fetch("/api/nova", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LECTURA, max_tokens: 900,
      system: `Eres NOVA. Lees documentos de compra de proveedores de construcción en Ecuador
—facturas, notas de venta, recibos y proformas— y devuelves SOLO JSON, sin markdown:

{"clase":"factura","proveedor":"","ruc":"","numero":"","fecha":"","monto":0,"detalle":""}

"clase" es qué documento es, mirando lo que dice el papel:
  "factura"    dice FACTURA y trae número de autorización del SRI.
  "nota_venta" dice NOTA DE VENTA. Es del régimen simplificado y NO lleva IVA desglosado.
  "recibo"     dice RECIBO, o es un respaldo simple sin formato del SRI.
  "proforma"   dice PROFORMA, COTIZACIÓN o PRESUPUESTO: todavía no es un gasto.
Si no estás seguro, pon "factura" solo si ves número de autorización; si no, "recibo".

"proveedor" es la razón social o el nombre comercial de QUIEN VENDE, nunca el cliente
—el cliente es la constructora—. Escríbelo tal como aparece en el membrete, completo,
sin abreviar ni agregar nada.

"ruc" son los 13 dígitos del que vende, sin espacios ni guiones. "" si no está.

"numero" es el número del documento tal como está impreso, con sus ceros y guiones:
"001-002-000012345". NO el número de autorización, que es largo y va aparte.

"fecha" es la fecha de emisión en YYYY-MM-DD. "" si no se lee.

"monto" es el TOTAL a pagar CON IVA incluido. Si solo hay subtotal, suma el IVA.
Es el número más grande de la parte de abajo, no el subtotal.

"detalle" es en una línea qué se compró.

Lo que no puedas leer con seguridad, déjalo vacío. Un dato inventado es peor que
uno en blanco: el blanco se ve y se completa, el inventado se guarda y nadie lo revisa.`,
      messages: [{
        role: "user",
        content: [
          esPdf
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
            : { type: "image", source: { type: "base64", media_type: archivo.type || "image/jpeg", data: b64 } },
          { type: "text", text: "Extrae los datos de este documento. Solo JSON." },
        ],
      }],
    }),
  });
  const data = await res.json();
  if (!res.ok || data?.error) return { error: data?.error?.message || "NOVA no pudo leerlo." };
  try {
    const txt = (textoDeNova(data) || "{}").replace(/```json|```/g, "").trim();
    const p = JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] || txt);
    const clases = ["factura", "nota_venta", "recibo", "proforma"];
    return {
      clase: clases.includes(p.clase) ? p.clase : "factura",
      proveedor: (p.proveedor || "").trim(),
      ruc: String(p.ruc || "").replace(/\D/g, "").slice(0, 13),
      numero: (p.numero || "").trim().slice(0, 40),
      // Solo si es una fecha de verdad: "15 de marzo" guardado como fecha
      // rompe la planilla, y vacío se completa a mano en dos segundos.
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(p.fecha || "") ? p.fecha : "",
      monto: Number(p.monto) || null,
      detalle: (p.detalle || "").trim(),
    };
  } catch {
    return { error: "NOVA devolvió algo que no se entiende. Cargalo a mano." };
  }
}
