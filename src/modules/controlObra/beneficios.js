import { supabase } from "../../lib/supabase";
import { enlacesFirmados } from "../../lib/enlacesFirmados";
// Las cuentas viven aparte: son lo único de este archivo que se puede probar
// sin un navegador, y son justo lo que no puede estar mal.
export { totales, esPrevisto, netoPorRubro, esDeOrden, totalesPorOrigen } from "./cuentaBeneficios.js";

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

/**
 * Los enlaces para bajar las proformas guardadas, firmados de antemano.
 *
 * DE ANTEMANO Y NO AL HACER CLIC: una ventana que se abre DESPUÉS de esperar a
 * un servidor ya no cuenta como "la abrió una persona", y Safari la bloquea sin
 * decir nada. Lo que se ve es un clip que no hace nada. Con el enlace ya
 * firmado el clip es un enlace de verdad: se abre, se baja, y se puede copiar
 * con el botón derecho para mandárselo al proveedor.
 *
 * `&download=` es lo que hace que el archivo se BAJE en vez de abrirse adentro
 * del navegador. El atributo `download` del enlace no sirve acá: el archivo
 * viene de otro dominio y el navegador lo ignora.
 */
export async function enlacesDeProformas(beneficios = []) {
  const conPapel = beneficios.filter(b => b?.archivo_path)
    .map(b => ({ id: b.id, storage_path: b.archivo_path }));
  if (!conPapel.length) return {};
  const mapa = await enlacesFirmados(conPapel, BUCKET);
  const nombres = new Map(beneficios.map(b => [b.id, b.archivo_nombre]));
  const salida = {};
  for (const [id, url] of Object.entries(mapa)) {
    const nombre = nombres.get(Number(id)) || nombres.get(id);
    salida[id] = nombre ? `${url}&download=${encodeURIComponent(nombre)}` : url;
  }
  return salida;
}

// ── LAS EFICIENCIAS QUE SALEN DE UN ANÁLISIS DE DIFERENCIAS ────────────────
//
// Cuando una propuesta nueva cotiza un rubro POR DEBAJO de lo presupuestado,
// eso no es una diferencia con el cliente: él paga el precio que firmó y
// nosotros compramos mejor. Es una eficiencia, y su lugar es Beneficios.
//
// Si solo quedara marcada en el análisis, el ahorro moriría ahí: Beneficios es
// lo que se mira para decidir dónde se puede gastar más, y un ahorro que no
// llega nunca se transforma en nada. Los sobreprecios los busca todo el mundo;
// las eficiencias no las registra nadie.
//
// Entra como PREVISTO, no como confirmado: todavía es una cotización, y entre
// que el proveedor cotiza y la factura llega se cae la mitad.

/** La marca que deja ver de qué análisis salió cada fila, para poder rehacerla. */
const marcaDe = analisisId => `[dif:${analisisId}]`;

/**
 * Deja en Beneficios exactamente las eficiencias que hoy tiene el análisis.
 *
 * Borra y vuelve a escribir las de este análisis en vez de agregar: así
 * cambiar una decisión —o deshacerla— no deja un beneficio fantasma sumando
 * para siempre. Volver a correrlo dos veces da el mismo resultado.
 */
export async function sincronizarEficiencias(obraId, analisisId, filas = []) {
  const marca = marcaDe(analisisId);
  const { error: e1 } = await supabase.from("obra_beneficios")
    .delete().eq("obra_id", obraId).like("nota", `%${marca}%`);
  if (e1) return { error: falta(e1) ? SIN_114 : e1.message };
  if (!filas.length) return { guardados: 0 };
  return guardarVarios(filas.map(f => ({ ...f, obra_id: obraId, origen: "proforma", estado: "previsto",
    nota: `${f.nota ? `${f.nota} · ` : ""}${marca}` })));
}

/**
 * Una diferencia de precio a la baja, vuelta fila de Beneficios.
 *
 * Lo presupuestado es el costo que la obra tenía cargado para esa cantidad, y
 * lo real es lo que ahora lo cotizan. La diferencia —el monto del hallazgo— es
 * el beneficio, y queda escrito contra qué rubro se midió: un ahorro sin el
 * rubro al lado no se puede defender en una reunión.
 */
export function eficienciaDeLaDiferencia(linea, rubro, analisis) {
  const n = v => Number(v) || 0;
  const c2 = v => Math.round(n(v) * 100) / 100;
  const presupuestado = rubro && rubro.costo_unitario != null
    ? c2(n(rubro.costo_unitario) * n(linea.cantidad))
    : c2(n(linea.monto));
  return {
    obra_rubro_id: linea.obra_rubro_id || null,
    descripcion: String(linea.descripcion || "").slice(0, 200),
    cantidad: n(linea.cantidad) || null,
    unidad: linea.unidad || null,
    presupuestado,
    real: c2(presupuestado - n(linea.monto)),
    proveedor: analisis?.proveedor || null,
    nota: `Lo cotizan por debajo del costo cargado${analisis?.titulo ? ` · ${analisis.titulo}` : ""}`,
  };
}
