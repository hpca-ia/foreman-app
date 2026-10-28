import { supabase } from "../../lib/supabase";
import { enlaceArchivo } from "../../lib/archivos";
import { comprimirImagen, noEntraElArchivo } from "../../lib/imagenes";
import { LECTURA, pedirANova, porQueFallo, textoDeNova } from "../../lib/modelos";
import { PROMPT_ITEMS, interpretarItems, filasDeRenglones, facturasPorLeer, cuadraConLaFactura, personasDistintas } from "./itemsComprados";

// Los renglones de cada factura: guardarlos, leerlos con NOVA, y leer de una
// vez las que ya estaban cargadas antes de que esto existiera.
//
// La cuenta (qué es el mismo ítem, qué familia, qué signo) vive en
// itemsComprados.js. Acá solo se habla con la base y con NOVA.

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");
const SIN_MIGRACION = "Falta correr la migración 127 para guardar los renglones.";

/**
 * Reemplazar los renglones de una factura.
 *
 * Se reemplazan enteros, no se suman: volver a leer una factura no puede
 * duplicar sus cascos.
 */
export async function guardarRenglones(factura, items = [], estado) {
  // Si no cuadra con su total, la lectura está mal: no entra a la cuenta y la
  // factura queda marcada para que alguien la mire.
  const cuadra = cuadraConLaFactura(factura, items);
  const filas = cuadra ? filasDeRenglones(factura, items) : [];
  if (!cuadra) estado = "no_cuadra";
  const { error: e1 } = await supabase.from("obra_factura_items").delete().eq("factura_id", factura.id);
  if (e1) return { error: falta(e1) ? SIN_MIGRACION : e1.message };
  if (filas.length) {
    const { error: e2 } = await supabase.from("obra_factura_items").insert(filas);
    if (e2) return { error: e2.message };
  }
  await supabase.from("obra_facturas").update({
    renglones_estado: estado || (filas.length ? "leida" : "ilegible"),
    renglones_at: new Date().toISOString(),
  }).eq("id", factura.id);
  return { cuantos: filas.length };
}

async function archivoDe(factura) {
  const url = await enlaceArchivo(factura.archivo_url, 600);
  if (!url) return { error: "No se pudo abrir el archivo guardado." };
  const r = await fetch(url);
  if (!r.ok) return { error: "No se pudo bajar el archivo guardado." };
  const blob = await r.blob();
  return { file: new File([blob], factura.archivo_nombre || "factura", { type: blob.type }) };
}

const base64 = file => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1]);
  r.onerror = rej;
  r.readAsDataURL(file);
});

/**
 * Leer los renglones de una factura con NOVA y guardarlos.
 *
 * `file` es opcional: si quien la está cargando todavía tiene el archivo en la
 * mano, se usa ese; si no, se baja el que está guardado.
 *
 * Si NOVA contesta pero no saca nada, la factura queda "ilegible" y no se
 * vuelve a intentar sola. Si lo que falla es el viaje —la red, el servidor—
 * no se marca nada: es un problema de ese momento y la próxima vez puede
 * salir bien.
 */
export async function leerRenglones(factura, file = null) {
  try {
    let f = file;
    if (!f) {
      if (!factura.archivo_url) return { error: "La factura no tiene archivo." };
      const r = await archivoDe(factura);
      if (r.error) return r;
      f = r.file;
    }
    const tipo = f.type || "";
    const esPdf = tipo === "application/pdf" || /\.pdf$/i.test(f.name || "");
    if (!esPdf && !tipo.startsWith("image/")) return guardarRenglones(factura, [], "ilegible");
    if (!esPdf) f = await comprimirImagen(f);
    const b64 = await base64(f);
    const pesa = noEntraElArchivo(b64, f);
    if (pesa) return { error: pesa };

    const { res, data } = await pedirANova({
      model: LECTURA, max_tokens: 4000, system: PROMPT_ITEMS,
      messages: [{
        role: "user",
        content: [
          esPdf
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
            : { type: "image", source: { type: "base64", media_type: tipo || "image/jpeg", data: b64 } },
          { type: "text", text: "Los renglones de esta factura." },
        ],
      }],
    });
    if (!res.ok || data?.error) return { error: porQueFallo(res, data, "leer la factura") };
    return guardarRenglones(factura, interpretarItems(textoDeNova(data)));
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Leer, una por una, las facturas de la obra que todavía no se leyeron.
 *
 * De a una y no todas juntas: treinta PDFs a la vez chocan contra el límite de
 * la cuenta y la mitad vuelve con error. Y se puede parar: `seguir()` se
 * pregunta antes de cada factura.
 */
export async function leerLasQueFaltan(facturas, { alAvanzar, seguir = () => true } = {}) {
  const cola = facturasPorLeer(facturas);
  const fallas = [];
  let hechas = 0;
  for (const f of cola) {
    if (!seguir()) break;
    const r = await leerRenglones(f);
    hechas += 1;
    if (r.error) {
      fallas.push({ factura: f, error: r.error });
      // Sin la tabla no tiene sentido seguir: las demás van a fallar igual.
      if (r.error === SIN_MIGRACION) break;
    }
    alAvanzar?.({ hechas, de: cola.length, fallas });
  }
  return { hechas, de: cola.length, fallas };
}

/** Todos los renglones de la obra. */
export async function renglonesDeObra(obraId) {
  const { data, error } = await supabase.from("obra_factura_items")
    .select("*").eq("obra_id", obraId).order("factura_id").order("orden");
  if (error) return { renglones: [], sinTablas: falta(error) };
  return { renglones: data || [], sinTablas: false };
}

/**
 * Cuánta gente pasó por la obra: todos los de Mano de obra, también los que
 * ya se fueron (se llevaron su casco).
 */
export async function personalDeObra(leadId) {
  if (!leadId) return { total: 0, activos: 0 };
  const { data } = await supabase.from("obra_personal").select("id,nombre,cedula,activo").eq("lead_id", leadId);
  return personasDistintas(data || []);
}
