// Leer un presupuesto en Excel: la misma lectura para crear una obra y para
// alimentar la base de rubros. Antes Alimentar BD tenía su propia lectura, que
// adivinaba el precio como "el segundo número más chico de la fila".

import { supabase } from "./supabase";
import { MAPA_PROMPT, buscarFormato, firmaEncabezado, soloColumnas } from "../modules/controlObra/leerPresupuesto";
import { LECTURA, textoDeNova } from "./modelos";

// La hoja con el presupuesto: la que se llama así, o la más larga.
export function hojaPresupuesto(XLSX, wb) {
  const leer = nombre => XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, blankrows: false, defval: "" });
  const porNombre = wb.SheetNames.find(s => /presupuesto/i.test(s));
  if (porNombre) return leer(porNombre);
  return wb.SheetNames.map(leer).sort((a, b) => b.length - a.length)[0] || [];
}

/**
 * UN PRESUPUESTO PUEDE VENIR EN VARIAS HOJAS, y casi siempre viene así.
 *
 * Tres hojas —bloque A, bloque B, exteriores; o estructura, instalaciones,
 * acabados— que al final se suman en un total. Hasta acá se leía UNA: la que
 * se llamara "presupuesto" o la más larga, y las otras se descartaban sin
 * decir nada. El presupuesto entraba completo en apariencia y le faltaban dos
 * tercios, que es la peor forma de equivocarse: no hay error que mirar, hay un
 * número que parece bien y no lo está.
 *
 * Las hojas que comparten encabezado se leen como una sola: son el mismo
 * formato partido en pedazos, y el lector de abajo ya sabe saltear la fila de
 * títulos cuando reaparece en el medio —hay planillas que la repiten en cada
 * capítulo—. La que tiene OTRO encabezado no se mezcla: meterla con el mapa de
 * columnas de otra hoja leería el precio donde está la cantidad, y eso no se
 * nota mirando el total. Esa se deja afuera y se dice cuál.
 */
export function hojasDelLibro(XLSX, wb) {
  return wb.SheetNames.map(nombre => ({
    nombre,
    filas: XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, blankrows: false, defval: "" }),
  })).filter(h => h.filas.length >= 3);
}

export async function pedirNova(body, signal) {
  const res = await fetch("/api/nova", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal,
  });
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
  return res.json();
}

export function parseJSONTolerante(raw) {
  let t = String(raw || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(t); } catch {}
  const start = t.indexOf("{");
  if (start < 0) return null;
  t = t.slice(start);
  try { return JSON.parse(t); } catch {}
  try {
    const corte = t.lastIndexOf("}");
    let p = corte > 0 ? t.slice(0, corte + 1) : t;
    let llaves = 0, corchetes = 0;
    for (const c of p) { if (c === "{") llaves++; if (c === "}") llaves--; if (c === "[") corchetes++; if (c === "]") corchetes--; }
    p += "]".repeat(Math.max(corchetes, 0)) + "}".repeat(Math.max(llaves, 0));
    return JSON.parse(p);
  } catch { return null; }
}

const muestra = (filas, n) => filas.slice(0, n).map((f, i) => `${i}: ` + f.map(c => String(c ?? "").slice(0, 30)).join(" | ")).join("\n");

const DATOS_PROMPT = `Estas son las primeras filas de un presupuesto de construcción.
Devuelve SOLO JSON, sin markdown: {"nombre":"","cliente":"","emisor":""}
"nombre": el nombre del proyecto u obra. "cliente": a quién va dirigido. "emisor": la empresa
que hizo el documento (quien cotiza). Si algo no aparece, déjalo vacío. No inventes.`;

/**
 * Abre el Excel y reconoce sus columnas: con un formato ya aprendido si lo
 * hay, o con NOVA si es nuevo.
 * @returns { filas, mapa, origen: { tipo, veces, archivo }, datos: { nombre, cliente, emisor } }
 */
export async function reconocerExcel(file, { signal, onPaso } = {}) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const principal = hojaPresupuesto(XLSX, wb);

  // Las demás hojas del libro, pegadas abajo si son del mismo formato.
  const todas = hojasDelLibro(XLSX, wb);
  const laPrincipal = todas.find(h => h.filas === principal)
    || todas.find(h => h.filas.length === principal.length) || null;
  const otras = todas.filter(h => h !== laPrincipal);
  const firmaDe = f => {
    for (let i = 0; i < Math.min(f.length, 12); i++) {
      const fi = firmaEncabezado(f[i] || []);
      if (fi) return fi;
    }
    return null;
  };
  const firmaBase = firmaDe(principal);
  const pegadas = [], sueltas = [];
  for (const h of otras) {
    if (firmaBase && firmaDe(h.filas) === firmaBase) pegadas.push(h);
    else sueltas.push(h.nombre);
  }
  // La principal primero, y las del mismo formato detrás. Cada una se lee
  // aparte —con su total al pie, que es la única comprobación que vale— y el
  // nombre de la hoja queda como bloque de sus capítulos.
  const delMismoFormato = [laPrincipal || { nombre: wb.SheetNames[0], filas: principal }, ...pegadas];
  const filas = principal;
  const afueraHojas = sueltas;

  const { data: formatos } = await supabase.from("formatos_presupuesto").select("*");
  const recordado = buscarFormato(filas, formatos || []);
  if (recordado) {
    // Las columnas ya se saben; igual se le pide a NOVA de quién es el
    // documento y para quién, que cambia en cada presupuesto.
    onPaso?.("NOVA está viendo de quién es el presupuesto...");
    let datos = {};
    try {
      const d = await pedirNova({ model: LECTURA, max_tokens: 300,
        messages: [{ role: "user", content: [{ type: "text", text: `${muestra(filas, 15)}\n\n${DATOS_PROMPT}` }] }] }, signal);
      datos = parseJSONTolerante(textoDeNova(d) || "") || {};
    } catch (e) { if (e.name === "AbortError") throw e; }
    return {
      filas, mapa: recordado.mapa, datos,
      hojas: delMismoFormato.map(h => ({ nombre: h.nombre, filas: h.filas, mapa: recordado.mapa })),
      afueraHojas, totalHojas: todas.length,
      origen: { tipo: "recordado", veces: recordado.formato.veces, archivo: recordado.formato.ejemplo_archivo },
    };
  }

  onPaso?.("NOVA está reconociendo las columnas...");
  const d = await pedirNova({ model: LECTURA, max_tokens: 1000,
    messages: [{ role: "user", content: [{ type: "text", text: `${muestra(filas, 40)}\n\n${MAPA_PROMPT}` }] }] }, signal);
  const mapa = parseJSONTolerante(textoDeNova(d) || "");
  const elMapa = mapa || { fila_encabezado: 0 };
  return {
    filas, mapa: elMapa, datos: mapa || {},
    hojas: delMismoFormato.map(h => ({ nombre: h.nombre, filas: h.filas, mapa: elMapa })),
    afueraHojas, totalHojas: todas.length,
    origen: { tipo: "nova" },
  };
}

/** Guarda el mapa como formato conocido; si ya existía, suma un uso. Devuelve el error, si hubo. */
export async function recordarFormato({ filas, mapa, archivo, usuarioId }) {
  if (!filas || !mapa) return null;
  const encabezado = filas[mapa.fila_encabezado ?? 0] || [];
  const firma = firmaEncabezado(encabezado);
  if (!firma) return null;
  const { data: ya, error: eBusca } = await supabase.from("formatos_presupuesto").select("id,veces").eq("firma", firma).maybeSingle();
  if (eBusca) return eBusca;
  const datos = { firma, encabezados: encabezado, mapa: soloColumnas(mapa), actualizado_at: new Date().toISOString() };
  const { error } = ya
    ? await supabase.from("formatos_presupuesto").update({ ...datos, veces: (ya.veces || 1) + 1 }).eq("id", ya.id)
    : await supabase.from("formatos_presupuesto").insert({ ...datos, ejemplo_archivo: archivo || null, creado_por: usuarioId ?? null });
  return error;
}
