// Leer un presupuesto en Excel: la misma lectura para crear una obra y para
// alimentar la base de rubros. Antes Alimentar BD tenía su propia lectura, que
// adivinaba el precio como "el segundo número más chico de la fila".

import { supabase } from "./supabase";
import { MAPA_PROMPT, buscarFormato, firmaEncabezado, soloColumnas } from "../modules/controlObra/leerPresupuesto";

// La hoja con el presupuesto: la que se llama así, o la más larga.
export function hojaPresupuesto(XLSX, wb) {
  const leer = nombre => XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, blankrows: false, defval: "" });
  const porNombre = wb.SheetNames.find(s => /presupuesto/i.test(s));
  if (porNombre) return leer(porNombre);
  return wb.SheetNames.map(leer).sort((a, b) => b.length - a.length)[0] || [];
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
  const filas = hojaPresupuesto(XLSX, wb);

  const { data: formatos } = await supabase.from("formatos_presupuesto").select("*");
  const recordado = buscarFormato(filas, formatos || []);
  if (recordado) {
    // Las columnas ya se saben; igual se le pide a NOVA de quién es el
    // documento y para quién, que cambia en cada presupuesto.
    onPaso?.("NOVA está viendo de quién es el presupuesto...");
    let datos = {};
    try {
      const d = await pedirNova({ model: "claude-sonnet-4-5", max_tokens: 300,
        messages: [{ role: "user", content: [{ type: "text", text: `${muestra(filas, 15)}\n\n${DATOS_PROMPT}` }] }] }, signal);
      datos = parseJSONTolerante(d.content?.[0]?.text || "") || {};
    } catch (e) { if (e.name === "AbortError") throw e; }
    return { filas, mapa: recordado.mapa, origen: { tipo: "recordado", veces: recordado.formato.veces, archivo: recordado.formato.ejemplo_archivo }, datos };
  }

  onPaso?.("NOVA está reconociendo las columnas...");
  const d = await pedirNova({ model: "claude-sonnet-4-5", max_tokens: 1000,
    messages: [{ role: "user", content: [{ type: "text", text: `${muestra(filas, 40)}\n\n${MAPA_PROMPT}` }] }] }, signal);
  const mapa = parseJSONTolerante(d.content?.[0]?.text || "");
  return { filas, mapa: mapa || { fila_encabezado: 0 }, origen: { tipo: "nova" }, datos: mapa || {} };
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
