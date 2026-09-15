// Lo que NOVA pregunta antes de que un presupuesto alimente la base.
//
// Un precio sin origen no sirve para ingeniería de costos: hay que saber si es
// lo que HCA le cotizó a un cliente o lo que un proveedor le cobra a HCA, y de
// quién. Tampoco sirve un precio en una unidad que no se entiende. En vez de
// suponer, se pregunta; y las respuestas se aplican antes de guardar.

import { normalizarUnidad } from "./unidades";

// utilidad: { estado: "costo" | "con_utilidad" | "desconocida", pct, porCapitulo: { capítulo: pct } }
export const RESPUESTAS_VACIAS = { tipo: null, cliente: "", proveedor: "", unidades: {}, unidadFila: {}, sinUnidadOk: false, utilidad: { estado: null, pct: "", porCapitulo: {} } };

// "Dejar la unidad como está escrita".
export const IGUAL = "__igual__";

export const normalNombre = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const palabras = s => normalNombre(s).split(" ").filter(p => p.length > 2 && !["cia", "ltda", "s.a", "sas", "the", "del", "los", "las"].includes(p));

/** El nombre ya registrado igual (sin tildes ni mayúsculas) y los parecidos. */
export function buscarNombre(nombre, lista = []) {
  const n = normalNombre(nombre);
  if (!n) return { exacto: null, parecidos: [] };
  const exacto = lista.find(x => normalNombre(x.nombre) === n) || null;
  const mias = new Set(palabras(nombre));
  const parecidos = lista
    .filter(x => x !== exacto)
    .map(x => {
      const suyas = palabras(x.nombre);
      const comunes = suyas.filter(p => mias.has(p)).length;
      const base = Math.min(mias.size, new Set(suyas).size) || 1;
      const contiene = normalNombre(x.nombre).includes(n) || n.includes(normalNombre(x.nombre));
      return { x, puntaje: contiene ? 1 : comunes / base };
    })
    .filter(p => p.puntaje >= 0.5)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, 3)
    .map(p => p.x);
  return { exacto, parecidos };
}

const esHca = s => /\bhca\b|\bhcarq\b|hca studio|hernan cueva/.test(normalNombre(s));

/** Si el documento lo hizo HCA, son precios a un cliente; si lo hizo otro, de un proveedor. */
export function sugerirTipo({ emisor, cliente } = {}) {
  if (emisor && esHca(emisor)) return "cliente";
  if (emisor) return "proveedor";
  if (cliente && esHca(cliente)) return "proveedor";
  return null;
}

/** Unidades que no se entienden (agrupadas por cómo están escritas) y rubros sin unidad. */
export function unidadesPorResolver(rubros = []) {
  const raras = new Map();
  const vacias = [];
  rubros.forEach(r => {
    if (r.origen === "ajuste") return;
    const texto = String(r.unidad ?? "").trim();
    const n = normalizarUnidad(texto);
    if (n.estado === "vacia") return vacias.push(r);
    if (n.estado === "ok") return;
    if (!raras.has(texto)) raras.set(texto, { texto, estado: n.estado, sugerida: n.sugerida || null, rubros: [] });
    raras.get(texto).rubros.push(r);
  });
  return { raras: [...raras.values()], vacias };
}

/** Lo que todavía falta responder; vacío si se puede guardar. */
export function faltanRespuestas(resp, rubros) {
  const falta = [];
  if (!resp.tipo) falta.push("de dónde vienen los precios");
  else if (resp.tipo === "cliente" && !resp.cliente.trim()) falta.push("el cliente");
  else if (resp.tipo === "proveedor" && !resp.proveedor.trim()) falta.push("el proveedor");
  const u = resp.utilidad || {};
  if (!u.estado) falta.push("si los precios traen utilidad");
  else if (u.estado === "con_utilidad" && !(Number(u.pct) > 0) && !Object.values(u.porCapitulo || {}).some(v => Number(v) > 0)) falta.push("el % de utilidad");
  const { raras, vacias } = unidadesPorResolver(rubros);
  const sinResolver = raras.filter(u => !resp.unidades[u.texto]).length;
  if (sinResolver) falta.push(sinResolver === 1 ? "una unidad" : `${sinResolver} unidades`);
  if (vacias.length && !resp.sinUnidadOk && vacias.some(r => !resp.unidadFila[r.fila])) falta.push("los rubros sin unidad");
  return falta;
}

/** La unidad de un rubro según lo respondido, tal como se va a escribir. */
export function unidadRespondida(r, resp) {
  const porFila = resp.unidadFila?.[r.fila];
  if (porFila) return porFila;
  const texto = String(r.unidad ?? "").trim();
  const elegida = resp.unidades?.[texto];
  if (elegida && elegida !== IGUAL) return elegida;
  return texto;
}

/** La unidad para la base de rubros: la forma única si se reconoce. */
export function unidadParaBase(r, resp) {
  const u = unidadRespondida(r, resp);
  return normalizarUnidad(u).canon || u;
}
