import { buscarOCrear } from "../../lib/proveedores";
import { LECTURA } from "../../lib/modelos";

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
    const txt = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
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
