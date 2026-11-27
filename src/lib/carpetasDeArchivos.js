// A qué obra, proyecto o compra corresponde cada carpeta del depósito.
//
// Los archivos se guardan con el número interno de la ficha y no con su
// nombre: `obra-12/`, `proyecto-40/`, `compra-311/`. Para FOREMAN funciona,
// pero quien abre Supabase o el respaldo en Dropbox ve números. Con este
// índice cada carpeta lleva al lado lo que es y de qué proyecto.
//
// Esta parte no toca la base: dice qué tabla mirar para cada carpeta y arma la
// lista con las filas que ya se leyeron. Leerlas es cosa de quien la usa.

// prefijo de la carpeta → qué es, qué tabla tiene el nombre y qué columnas.
// `forma: "guion"` es `obra-12/`; `forma: "sub"` es `obras/12/`.
export const TIPOS = [
  { prefijo: "obra",        forma: "guion", que: "Obra (facturas)",        grupo: "Facturas", tabla: "obras",               columnas: "id,nombre,lead_id" },
  { prefijo: "obras",       forma: "sub",   que: "Obra (presupuesto original)", grupo: "Presupuesto original de la obra", tabla: "obras",          columnas: "id,nombre,lead_id" },
  { prefijo: "beneficios",  forma: "sub",   que: "Obra (beneficios)",      grupo: "Beneficios", tabla: "obras",               columnas: "id,nombre,lead_id" },
  { prefijo: "proyecto",    forma: "guion", que: "Proyecto (archivos)",    grupo: "Archivos del proyecto", tabla: "leads",               columnas: "id,nombre" },
  { prefijo: "avance",      forma: "guion", que: "Proyecto (avance)",      grupo: "Avance", tabla: "leads",               columnas: "id,nombre" },
  { prefijo: "presupuestos",forma: "sub",   que: "Presupuesto",            grupo: "Presupuestos", tabla: "presupuestos",        columnas: "id,nombre,lead_id" },
  { prefijo: "compra",      forma: "guion", que: "Compra",                 grupo: "Compras", tabla: "compras_solicitudes", columnas: "id,descripcion,lead_id,obra_id" },
  { prefijo: "orden",       forma: "guion", que: "Orden de cambio",        grupo: "Órdenes de cambio", tabla: "ordenes_cambio",      columnas: "id,numero,codigo,titulo,obra_id" },
  { prefijo: "acta",        forma: "guion", que: "Acta",                   grupo: "Actas", tabla: "obra_actas",          columnas: "id,numero,fecha,lead_id,obra_id" },
  { prefijo: "actas",       forma: "sub",   que: "Acta (visto)",           grupo: "Actas", tabla: "obra_actas",          columnas: "id,numero,fecha,lead_id,obra_id" },
  { prefijo: "libro",       forma: "guion", que: "Libro de obra (día)",    grupo: "Libro de obra", tabla: "libro_obra_dias",     columnas: "id,fecha,lead_id" },
  { prefijo: "plan",        forma: "guion", que: "Plan semanal",           grupo: "Plan semanal", tabla: "obra_plan_periodos",  columnas: "id,desde,lead_id" },
  { prefijo: "obs",         forma: "guion", que: "Observación",            grupo: "Observaciones", tabla: "obra_observaciones",  columnas: "id,titulo,lead_id,obra_id" },
  { prefijo: "caja",        forma: "guion", que: "Caja chica",             grupo: "Caja chica", tabla: "cajas_chicas",        columnas: "id,proyecto_nombre,lead_id,obra_id" },
  { prefijo: "task",        forma: "guion", que: "Tarea",                  grupo: "Tareas", tabla: "tasks",               columnas: "id,title,lead_id" },
];

// Carpetas que no son de una ficha.
const SUELTAS = { empresa: "Logo de la empresa", logos: "Logos de clientes" };

// Las de `obras/12/`: hay que entrar para ver los números.
export const CON_SUBCARPETAS = TIPOS.filter(t => t.forma === "sub").map(t => t.prefijo);

/**
 * Qué es una carpeta.
 * @param ruta  "obra-12" o "obras/12"
 * @returns {{ ruta, tipo?, id?, que }}  sin tipo si no se reconoce
 */
export function queEsLaCarpeta(ruta) {
  const r = String(ruta || "").replace(/\/+$/, "");
  const sub = r.match(/^([a-z]+)\/(\d+)$/);
  if (sub) {
    const tipo = TIPOS.find(t => t.forma === "sub" && t.prefijo === sub[1]);
    if (tipo) return { ruta: r, tipo, id: Number(sub[2]), que: tipo.que };
  }
  const guion = r.match(/^([a-z]+)-(\d+)$/);
  if (guion) {
    const tipo = TIPOS.find(t => t.forma === "guion" && t.prefijo === guion[1]);
    if (tipo) return { ruta: r, tipo, id: Number(guion[2]), que: tipo.que };
  }
  if (SUELTAS[r]) return { ruta: r, que: SUELTAS[r] };
  return { ruta: r, que: "Sin identificar" };
}

/** Qué ids hay que leer de cada tabla: { tabla: { columnas, ids:[] } }. */
export function quePedir(carpetas) {
  const pedir = {};
  for (const c of carpetas) {
    if (!c.tipo) continue;
    const p = (pedir[c.tipo.tabla] ||= { columnas: c.tipo.columnas, ids: new Set() });
    p.ids.add(c.id);
  }
  return Object.fromEntries(Object.entries(pedir).map(([t, p]) => [t, { columnas: p.columnas, ids: [...p.ids] }]));
}

/** El nombre que se muestra de una fila, según su tabla. */
function nombreDe(tabla, f) {
  switch (tabla) {
    case "obras": case "leads": case "presupuestos": return f.nombre;
    case "compras_solicitudes": return `Compra ${f.id} · ${f.descripcion || ""}`.trim();
    case "ordenes_cambio": return `${f.codigo || `OC-${String(f.numero).padStart(2, "0")}`} · ${f.titulo || ""}`;
    case "obra_actas": return `Acta ${f.numero}${f.fecha ? ` · ${f.fecha}` : ""}`;
    case "libro_obra_dias": return `Día ${f.fecha}`;
    case "obra_plan_periodos": return `Semana desde ${f.desde}`;
    case "obra_observaciones": return f.titulo;
    case "cajas_chicas": return `Caja de ${f.proyecto_nombre || "—"}`;
    case "tasks": return f.title;
    default: return "";
  }
}

/**
 * La lista para mostrar o descargar.
 * @param carpetas  lo que devolvió queEsLaCarpeta, una por carpeta
 * @param filas     { tabla: [filas] }, incluidas "leads" y "obras" para el proyecto
 * @returns [{ carpeta, que, id, nombre, proyecto, obra, borrada }]
 */
export function armarIndice(carpetas, filas = {}) {
  const por = t => new Map((filas[t] || []).map(f => [Number(f.id), f]));
  const tablas = Object.fromEntries(Object.keys(filas).map(t => [t, por(t)]));
  const leads = tablas.leads || new Map();
  const obras = tablas.obras || new Map();

  return carpetas.map(c => {
    const base = { carpeta: c.ruta, que: c.que, grupo: c.tipo?.grupo || c.que, tabla: c.tipo?.tabla || "", id: c.tipo ? c.id : null, nombre: "", proyecto: "", obra: "", borrada: false };
    if (!c.tipo) return base;
    const f = tablas[c.tipo.tabla]?.get(c.id);
    if (!f) return { ...base, borrada: true };
    const obra = c.tipo.tabla === "obras" ? f : obras.get(Number(f.obra_id));
    const leadId = c.tipo.tabla === "leads" ? f.id : (f.lead_id ?? obra?.lead_id);
    const lead = leads.get(Number(leadId));
    return { ...base, nombre: nombreDe(c.tipo.tabla, f) || "", proyecto: lead?.nombre || "", obra: obra?.nombre || "" };
  }).sort((a, b) =>
    // Las que no son de un proyecto, al final.
    (!a.proyecto - !b.proyecto) ||
    a.proyecto.localeCompare(b.proyecto, "es") ||
    a.que.localeCompare(b.que, "es") ||
    a.carpeta.localeCompare(b.carpeta, "es", { numeric: true }));
}

// ── POR PROYECTO ─────────────────────────────────────────────────────────────

/** La carpeta de un archivo: "obra-1/123-x.pdf" → "obra-1"; "obras/1/x" → "obras/1". */
export function carpetaDeLaRuta(ruta) {
  const partes = String(ruta || "").split("/");
  return CON_SUBCARPETAS.includes(partes[0]) && partes.length > 2 ? `${partes[0]}/${partes[1]}` : partes[0];
}

/** Bajo qué proyecto va una carpeta. */
export function proyectoDe(i) {
  if (i.borrada) return "Fichas borradas";
  if (!i.tabla) return i.carpeta === "empresa" || i.carpeta === "logos" ? "Empresa" : "Sin identificar";
  return i.proyecto || i.obra || "Sin proyecto";
}

/** El subtítulo dentro del grupo: la compra, el acta, el día… El proyecto mismo no lo lleva. */
export function detalleDe(i) {
  if (i.borrada || !i.tabla) return i.carpeta;
  if (i.tabla === "leads") return "";
  if (i.tabla === "obras") return i.nombre && i.nombre !== i.proyecto ? i.nombre : "";
  return i.nombre || i.carpeta;
}

/**
 * La lista agrupada: [{ proyecto, grupos: [{ grupo, carpetas: [indice] }] }].
 * Los proyectos en orden alfabético; los que no son de un proyecto, al final.
 */
export function porProyecto(indice) {
  const mapa = new Map();
  for (const i of indice) {
    const p = proyectoDe(i);
    if (!mapa.has(p)) mapa.set(p, new Map());
    const g = mapa.get(p);
    if (!g.has(i.grupo)) g.set(i.grupo, []);
    g.get(i.grupo).push(i);
  }
  const alFinal = ["Sin proyecto", "Empresa", "Fichas borradas", "Sin identificar"];
  return [...mapa.entries()]
    .map(([proyecto, g]) => ({
      proyecto,
      grupos: [...g.entries()].map(([grupo, carpetas]) => ({ grupo, carpetas })).sort((a, b) => a.grupo.localeCompare(b.grupo, "es")),
    }))
    .sort((a, b) => alFinal.indexOf(a.proyecto) - alFinal.indexOf(b.proyecto) || a.proyecto.localeCompare(b.proyecto, "es"));
}

// Lo que Dropbox no acepta en un nombre, y un largo prudente.
const limpiar = s => [...String(s || "")].map(c => (c < " " || '\\/:*?"<>|'.includes(c) ? "-" : c)).join("").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 80) || "sin nombre";

/**
 * El nombre que se lee: "1732650000000-factura.pdf" → "2026-11-26 14.40.00 factura.pdf".
 * La hora va hasta el segundo para que dos archivos con el mismo nombre no se pisen.
 */
export function nombreLegible(archivo) {
  const m = String(archivo).match(/^(\d{13})(?:-(\d+))?-(.+)$/);
  if (!m) return limpiar(archivo);
  // Hora de Ecuador, sin cambio de horario.
  const t = new Date(Number(m[1]) - 5 * 3600000).toISOString();
  return limpiar(`${t.slice(0, 10)} ${t.slice(11, 19).replace(/:/g, ".")}${m[2] ? ` (${m[2]})` : ""} ${m[3]}`);
}

/**
 * Dónde va un archivo en el respaldo por proyecto, relativo a esa carpeta.
 * "obra-1/1732650000000-factura.pdf" → "Diners Plaza Lagos/Facturas/2026-11-26 14.40.00 factura.pdf"
 * @param i     la fila del índice de su carpeta
 * @param ruta  la ruta del archivo en el depósito
 */
export function destinoLegible(i, ruta) {
  const dentro = String(ruta).slice(i.carpeta.length + 1).split("/");
  const archivo = dentro.pop();
  const detalle = detalleDe(i);
  return [proyectoDe(i), i.grupo, detalle, ...dentro]
    .filter(Boolean).map(limpiar)
    .concat(nombreLegible(archivo))
    .join("/");
}

/** La misma lista en CSV, para abrirla en Excel sin FOREMAN. */
export function indiceEnCsv(indice) {
  const celda = v => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const filas = [["Carpeta", "Qué es", "Id", "Nombre", "Proyecto", "Obra"]]
    .concat(indice.map(i => [i.carpeta, i.que, i.id ?? "", i.borrada ? "(ya no existe en FOREMAN)" : i.nombre, i.proyecto, i.obra]));
  // Punto y coma: Excel en español separa así. El BOM es para que lea las tildes.
  return "﻿" + filas.map(f => f.map(celda).join(";")).join("\r\n");
}
