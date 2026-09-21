import { supabase } from "./supabase";
import { normalizarUnidad } from "./unidades";
import { normalNombre } from "./preguntasNova";
import { pctUtilidad } from "./analisisUtilidad";

// Todo presupuesto que entra a FOREMAN —para cotizar, para controlar una obra,
// o subido a propósito— alimenta la base de rubros. Cada aparición de un rubro
// deja su precio en el historial con su origen: de qué cliente o de qué
// proveedor viene, en qué unidad, de qué obra y cuándo. Eso es lo que después
// permite hacer ingeniería de costos mirando lo que de verdad costó.
//
// Se lee todo una vez y se escribe en lote: una consulta por rubro eran 164
// viajes a la base para un presupuesto mediano.

const norm = s => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const unidadClave = u => normalizarUnidad(u).canon || norm(u);

// La base devuelve de a 1000 filas: con más rubros que eso, los que quedaban
// afuera se volvían a crear como nuevos.
async function todas(tabla, select) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from(tabla).select(select).range(desde, desde + 999);
    if (error) return { data: filas, error };
    filas.push(...(data || []));
    if (!data || data.length < 1000) return { data: filas };
  }
}

// Busca el cliente o proveedor sin importar tildes ni mayúsculas; si no está, lo crea.
async function registrar(tabla, nombre, extra = {}) {
  if (!String(nombre || "").trim()) return null;
  const { data, error } = await supabase.from(tabla).select("id,nombre");
  if (error) return null;
  const ya = (data || []).find(x => normalNombre(x.nombre) === normalNombre(nombre));
  if (ya) return ya.id;
  const { data: nuevo } = await supabase.from(tabla).insert({ nombre: String(nombre).trim(), ...extra }).select("id").single();
  return nuevo?.id ?? null;
}

/**
 * @param rubros  [{ descripcion, unidad, precio_unitario, capitulo, cantidad }]
 * @param origen  { tipo: "cliente" | "proveedor", cliente, proveedor, proyecto, fecha, fuente, obraId,
 *                  presupuestoId, ivaIncluido, ivaPct, utilidad: { estado, pct, porCapitulo, porRubro } }
 * @returns { capitulosNuevos, rubrosNuevos, historial, faltaMigracion: "016" | "017" | "027" | null, error }
 */
export async function alimentarBase(rubros = [], origen = {}) {
  const utiles = rubros.filter(r => r?.descripcion && Number(r.precio_unitario) > 0);
  if (!utiles.length) return { capitulosNuevos: 0, rubrosNuevos: 0, historial: 0 };

  const fecha = origen.fecha || new Date().toISOString().split("T")[0];
  const cliente = String(origen.cliente || "").trim();
  const proveedor = String(origen.proveedor || "").trim();
  const proyecto = origen.proyecto || "";

  const [{ data: capsDB }, { data: rubrosDB }, clienteId] = await Promise.all([
    todas("capitulos", "id,nombre"),
    todas("rubros", "id,descripcion,unidad"),
    registrar("clientes", cliente, { tipo: "otro" }),
    origen.tipo === "proveedor" ? registrar("proveedores", proveedor) : Promise.resolve(null),
  ]);

  const capPorNombre = new Map((capsDB || []).map(c => [norm(c.nombre), c.id]));
  // Un rubro es la descripción en su unidad: el mismo trabajo por m² y por ml
  // son precios que no se pueden promediar juntos.
  const clave = (desc, unidad) => `${norm(desc)}|${unidadClave(unidad)}`;
  const rubroPorClave = new Map();
  const sinUnidadPorDesc = new Map();
  (rubrosDB || []).forEach(r => {
    rubroPorClave.set(clave(r.descripcion, r.unidad), r.id);
    if (!unidadClave(r.unidad)) sinUnidadPorDesc.set(norm(r.descripcion), r.id);
  });
  const idDe = r => rubroPorClave.get(clave(r.descripcion, r.unidad)) ?? sinUnidadPorDesc.get(norm(r.descripcion));

  // ── Capítulos que no existían ──
  const capsNuevos = [...new Set(utiles.map(r => r.capitulo).filter(Boolean))]
    .filter(c => !capPorNombre.has(norm(c)));
  if (capsNuevos.length) {
    const base = (capsDB || []).length;
    const { data } = await supabase.from("capitulos")
      .insert(capsNuevos.map((nombre, i) => ({ nombre, orden: base + i + 1 })))
      .select("id,nombre");
    (data || []).forEach(c => capPorNombre.set(norm(c.nombre), c.id));
  }

  // ── Rubros que no existían. Un mismo presupuesto puede repetir un rubro,
  //    así que se deduplica antes de insertar. ──
  const porInsertar = new Map();
  utiles.forEach(r => {
    const k = clave(r.descripcion, r.unidad);
    if (idDe(r) != null || porInsertar.has(k)) return;
    porInsertar.set(k, {
      capitulo_id: capPorNombre.get(norm(r.capitulo)) ?? null,
      descripcion: String(r.descripcion).trim(),
      unidad: normalizarUnidad(r.unidad).canon || String(r.unidad || "").trim(),
      precio_referencia: Number(r.precio_unitario),
      activo: true,
    });
  });
  let rubrosNuevos = 0;
  const filas = [...porInsertar.values()];
  for (let i = 0; i < filas.length; i += 100) {
    const { data, error } = await supabase.from("rubros").insert(filas.slice(i, i + 100)).select("id,descripcion,unidad");
    if (error) return { capitulosNuevos: capsNuevos.length, rubrosNuevos, historial: 0, error: error.message };
    (data || []).forEach(r => { rubroPorClave.set(clave(r.descripcion, r.unidad), r.id); rubrosNuevos++; });
  }

  // ── Historial de precios: una fila por aparición, siempre ──
  const hist = utiles.map(r => ({
    basico: {
      rubro_id: idDe(r),
      cliente_id: clienteId,
      cliente_nombre: cliente,
      precio_unitario: Number(r.precio_unitario),
      proyecto_ref: proyecto,
      fecha,
    },
    origen: {
      origen_tipo: origen.tipo || null,
      proveedor_nombre: origen.tipo === "proveedor" ? proveedor : null,
      unidad: String(r.unidad || "").trim() || null,
      capitulo: r.capitulo || null,
      cantidad: Number(r.cantidad) || null,
      iva_incluido: typeof origen.ivaIncluido === "boolean" ? origen.ivaIncluido : null,
      fuente: origen.fuente || null,
      obra_id: origen.obraId || null,
    },
    extra: origen.presupuestoId ? { presupuesto_id: origen.presupuestoId } : {},
    utilidad: {
      utilidad_estado: origen.utilidad?.estado || null,
      utilidad_pct: origen.utilidad?.estado === "costo" ? 0 : origen.utilidad?.estado === "con_utilidad" ? pctUtilidad(r, origen.utilidad) : null,
      iva_pct: origen.ivaIncluido === true ? Number(origen.ivaPct) || null : null,
    },
  })).filter(h => h.basico.rubro_id);

  // Si faltan migraciones el precio se guarda igual, con lo que la base acepte:
  // sin la 027 va sin el presupuesto de origen, sin la 017 sin utilidad, sin
  // la 016 también sin origen.
  const niveles = [
    h => ({ ...h.basico, ...h.origen, ...h.utilidad, ...h.extra }),
    h => ({ ...h.basico, ...h.origen, ...h.utilidad }),
    h => ({ ...h.basico, ...h.origen }),
    h => h.basico,
  ];
  const faltas = ["", "027", "017", "016"];
  let nivel = 0, historial = 0;
  for (let i = 0; i < hist.length; i += 200) {
    const lote = hist.slice(i, i + 200);
    let { error } = await supabase.from("precios_historial").insert(lote.map(niveles[nivel]));
    while (error && nivel < niveles.length - 1 && /column|schema cache/i.test(error.message)) {
      nivel++;
      ({ error } = await supabase.from("precios_historial").insert(lote.map(niveles[nivel])));
    }
    if (!error) historial += lote.length;
  }

  return { capitulosNuevos: capsNuevos.length, rubrosNuevos, historial, faltaMigracion: faltas[nivel] || null };
}

export function resumenAlimentacion(r) {
  if (!r) return "";
  if (r.error) return "La base de rubros no se pudo alimentar: " + r.error;
  const partes = [];
  if (r.rubrosNuevos) partes.push(`${r.rubrosNuevos} rubros nuevos`);
  if (r.capitulosNuevos) partes.push(`${r.capitulosNuevos} capítulos nuevos`);
  if (r.historial) partes.push(`${r.historial} precios al historial`);
  let txt = partes.length ? "Base de rubros: " + partes.join(" · ") : "";
  if (r.faltaMigracion) txt += ` (sin ${r.faltaMigracion === "016" ? "el origen ni la utilidad" : r.faltaMigracion === "017" ? "la utilidad" : "el presupuesto de origen"} de los precios: falta correr la migración ${r.faltaMigracion})`;
  return txt;
}

// ── Leer precios de la base para un presupuesto ──────────────────────────
// Para actualizar los precios base de un presupuesto con lo que ya sabe la
// oficina: el mismo rubro se reconoce igual que al alimentar la base
// (descripción en su unidad), así lo que entró por un lado se encuentra por
// el otro.

export const claveRubro = (descripcion, unidad) => `${norm(descripcion)}|${unidadClave(unidad)}`;

/**
 * Los rubros de la base con su historial de precios, más reciente primero.
 * Sin las migraciones 016/017 el historial viene sin origen: se lee igual.
 * @returns { buscar(item), todos: [rubro], error } donde rubro = { id, descripcion, unidad, precio_referencia, precios: [...] }
 */
export async function preciosDeLaBase() {
  const completo = "rubro_id,precio_unitario,fecha,cliente_nombre,proveedor_nombre,origen_tipo,utilidad_estado,proyecto_ref";
  const [r1, hist1] = await Promise.all([
    todas("rubros", "id,descripcion,unidad,precio_referencia"),
    todas("precios_historial", completo),
  ]);
  const rubros = r1.data;
  let historial = hist1.data;
  if (hist1.error) historial = (await todas("precios_historial", "rubro_id,precio_unitario,fecha,cliente_nombre,proyecto_ref")).data;

  const porId = new Map();
  (rubros || []).forEach(r => porId.set(r.id, { ...r, precios: [] }));
  (historial || []).forEach(h => {
    const r = porId.get(h.rubro_id);
    if (r && Number(h.precio_unitario) > 0) r.precios.push(h);
  });
  porId.forEach(r => r.precios.sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || ""))));
  const porClave = new Map();
  const sinUnidad = new Map();
  porId.forEach(r => {
    porClave.set(claveRubro(r.descripcion, r.unidad), r);
    if (!unidadClave(r.unidad)) sinUnidad.set(norm(r.descripcion), r);
  });
  const buscar = item => (item.rubro_id != null && porId.get(item.rubro_id))
    || porClave.get(claveRubro(item.descripcion, item.unidad))
    || sinUnidad.get(norm(item.descripcion))
    || null;
  // El error se devuelve, no se traga: una base vacía por una consulta que
  // falló se veía igual que una base sin rubros.
  return { buscar, todos: [...porId.values()], error: r1.error?.message || null };
}
