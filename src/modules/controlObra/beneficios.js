import { supabase } from "../../lib/supabase";
import { enlacesFirmados } from "../../lib/enlacesFirmados";
// Las cuentas viven aparte: son lo único de este archivo que se puede probar
// sin un navegador, y son justo lo que no puede estar mal.
export { totales, esPrevisto, netoPorRubro } from "./cuentaBeneficios.js";

// Los beneficios de la obra: lo presupuestado contra lo que de verdad costó.
//
// No sale de vender más caro, sale de comprar mejor. Y es la plata que de
// verdad queda: una obra puede ir perfecta en avance y en plazo y haber
// perdido la utilidad entera comprando mal, sin que nada lo diga hasta el
// cierre.
//
// Se van guardando a lo largo de la obra —de a uno, cuando se cierra una
// compra— y no se calculan al final: al final nadie se acuerda de qué se
// presupuestó para esa puerta.

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;
const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");
export const SIN_114 = "Falta correr la migración 114 para guardar los beneficios de la obra.";

export async function beneficiosDe(obraId) {
  const { data, error } = await supabase.from("obra_beneficios")
    .select("*").eq("obra_id", obraId).order("fecha", { ascending: false }).order("id", { ascending: false });
  if (error) return { error: falta(error) ? SIN_114 : error.message, beneficios: [] };
  return { beneficios: data || [] };
}

export async function guardarBeneficio(fila) {
  const { id, ...campos } = fila;
  const q = id
    ? supabase.from("obra_beneficios").update(campos).eq("id", id)
    : supabase.from("obra_beneficios").insert(campos);
  const { data, error } = await q.select().single();
  if (error) return { error: falta(error) ? SIN_114 : error.message };
  return { beneficio: data };
}

export async function guardarVarios(filas = []) {
  if (!filas.length) return { guardados: 0 };
  const { data, error } = await supabase.from("obra_beneficios").insert(filas).select();
  if (error) return { error: falta(error) ? SIN_114 : error.message, guardados: 0 };
  return { guardados: (data || []).length, beneficios: data || [] };
}

export async function borrarBeneficio(id) {
  const { error } = await supabase.from("obra_beneficios").delete().eq("id", id);
  return error ? error.message : null;
}

/**
 * Los renglones de una planilla de Excel, como texto para que NOVA los lea.
 *
 * Un Excel no se le puede pasar al modelo como un archivo: adentro es un zip.
 * Y no se puede adivinar en qué columna está el precio, porque cada proveedor
 * arma la suya. Se pasa la hoja tal como está —todas las celdas con algo— y
 * que el modelo encuentre las columnas, que es justo lo que sabe hacer.
 */
export async function hojaComoTexto(file, maxFilas = 300) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const lineas = [];
  wb.eachSheet(hoja => {
    if (lineas.length > maxFilas) return;
    lineas.push(`--- hoja: ${hoja.name} ---`);
    hoja.eachRow({ includeEmpty: false }, fila => {
      if (lineas.length > maxFilas) return;
      const celdas = [];
      fila.eachCell({ includeEmpty: true }, celda => {
        const v = celda.value;
        const texto = v == null ? ""
          : typeof v === "object"
            ? String(v.result ?? v.text ?? v.richText?.map(t => t.text).join("") ?? "")
            : String(v);
        celdas.push(texto.trim());
      });
      if (celdas.some(x => x)) lineas.push(celdas.join(" | "));
    });
  });
  return lineas.join("\n");
}

// EL PAPEL CON EL QUE SE HIZO LA CUENTA.
//
// Un beneficio es una afirmación sobre plata: "esto se compró $400 abajo de lo
// presupuestado". Tres meses después, cuando el proveedor factura otra cosa o
// dice que esa proforma nunca existió, lo único que la sostiene es el archivo
// con el que se hizo la cuenta.
//
// Se guarda tal como se subió —el Excel, el PDF, la foto— y no una
// interpretación: lo que se discute con el proveedor es su papel, no nuestra
// lectura de su papel.

const BUCKET = "task-files";

export async function guardarProforma(obraId, file) {
  if (!file) return {};
  const limpio = String(file.name || "proforma").replace(/[^\w.-]+/g, "_").slice(-60);
  const ruta = `beneficios/${obraId}/${Date.now()}-${limpio}`;
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, file, { upsert: false });
  if (error) return { error: error.message };
  return { path: ruta, nombre: file.name || limpio };
}

/** Un enlace temporal para abrir la proforma guardada: el depósito es privado. */
export async function enlaceDeProforma(beneficio) {
  if (!beneficio?.archivo_path) return null;
  const mapa = await enlacesFirmados([{ id: beneficio.id, storage_path: beneficio.archivo_path }], BUCKET);
  return mapa[beneficio.id] || null;
}
