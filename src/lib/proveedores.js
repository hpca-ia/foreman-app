import { supabase } from "./supabase";

// Que "Ferretería Kiwy" y "Kiwy" sean el mismo proveedor.
//
// El problema no se arregla pidiéndole a la gente que escriba igual: nadie
// escribe igual dos veces, y menos desde el teléfono en una obra. Se arregla
// con tres cosas, en este orden:
//
//   1. NO HACERLO ESCRIBIR. Si el nombre ya existe, se elige de una lista. La
//      mayoría de los duplicados nacen de tipear algo que ya estaba.
//
//   2. RECONOCER EL NÚCLEO. "Ferretería Kiwy", "FERRETERIA KIWY" y "Kiwy" se
//      parecen en lo único que importa: kiwy. Las palabras que no distinguen a
//      nadie —ferretería, comercial, distribuidora, cía, S.A.— se sacan antes
//      de comparar. Así, al escribir "kiwy" aparece el que ya existe aunque
//      esté guardado con el nombre largo.
//
//   3. EL RUC MANDA. Es la identidad de verdad: dos nombres con el mismo RUC
//      son el mismo proveedor, sin opinión de por medio, y dos "Kiwy" con RUC
//      distinto son dos negocios distintos por más que se llamen igual. NOVA
//      ya lo lee de la factura, así que casi siempre está.
//
// Lo que NO se hace: unir dos proveedores automáticamente porque se parecen.
// "Comercial Kiwy" y "Ferretería Kiwy" pueden ser dos negocios de dos
// hermanos. Se avisa y decide una persona; juntar plata de dos proveedores
// distintos es un error que después nadie encuentra.

export const sinTildes = s => String(s ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Palabras que no distinguen a nadie: casi todas las ferreterías del país se
// llaman "Ferretería algo", y la parte que importa es el algo.
const RELLENO = new Set([
  "ferreteria", "comercial", "distribuidora", "distribuidor", "importadora",
  "almacen", "deposito", "bodega", "grupo", "corporacion", "empresa", "negocio",
  "productos", "servicios", "materiales", "construccion", "construcciones",
  "cia", "compania", "sa", "s", "a", "ca", "ltda", "cltda", "srl", "eirl",
  "el", "la", "los", "las", "de", "del", "y", "e",
]);

/** Lo que queda de un nombre cuando se le saca lo que no distingue. */
export function nucleo(nombre) {
  const palabras = sinTildes(nombre).replace(/[.,/#!$%^&*;:{}=\-_`~()"']/g, " ")
    .split(/\s+/).filter(Boolean).filter(p => !RELLENO.has(p));
  // Si todo era relleno, vale el nombre entero: "Comercial" a secas es un
  // nombre pobre pero es el que eligieron, y vaciarlo lo haría coincidir con
  // cualquier otro nombre pobre.
  return (palabras.length ? palabras : sinTildes(nombre).split(/\s+/).filter(Boolean)).join(" ");
}

const soloDigitos = s => String(s ?? "").replace(/\D/g, "");
const p_ruc = p => soloDigitos(p?.ruc);

/** ¿Son el mismo? Por RUC si lo hay; si no, por el núcleo del nombre. */
export function esElMismo(a, b) {
  const ra = soloDigitos(a?.ruc), rb = soloDigitos(b?.ruc);
  if (ra && rb) return ra === rb;
  const na = nucleo(a?.nombre), nb = nucleo(b?.nombre);
  if (!na || !nb) return false;
  // Uno contenido en el otro también cuenta: "kiwy" dentro de "kiwy norte".
  return na === nb || na.includes(nb) || nb.includes(na);
}

/**
 * Los que se parecen a lo que alguien está escribiendo, mejor primero.
 *
 * Busca por el núcleo y no por el texto literal, que es lo que hace que
 * teclear "kiwy" encuentre "FERRETERÍA KIWY" — y es justamente el caso que
 * hoy termina en dos proveedores.
 */
export function parecidos(texto, lista = [], tope = 6) {
  const n = nucleo(texto);
  const plano = sinTildes(texto);
  if (!plano) return [];
  return lista
    .map(p => {
      const suyo = nucleo(p.nombre);
      let puntos = 0;
      if (suyo === n) puntos = 100;
      else if (suyo.startsWith(n) || n.startsWith(suyo)) puntos = 80;
      else if (suyo.includes(n) || n.includes(suyo)) puntos = 60;
      else if (sinTildes(p.nombre).includes(plano)) puntos = 40;
      return { ...p, puntos };
    })
    .filter(p => p.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, tope);
}

/** Los que ya están cargados y conviene mirar antes de crear otro. */
export async function listarProveedores() {
  const { data } = await supabase.from("proveedores").select("id,nombre,ruc,especialidad").order("nombre");
  return data || [];
}

/**
 * El proveedor que corresponde a lo que escribieron, creándolo si de verdad
 * es nuevo. Devuelve siempre una fila, para que lo que se guarde después
 * apunte a algo y no a un texto suelto.
 */
export async function buscarOCrear({ nombre, ruc }, lista = null) {
  const limpio = String(nombre || "").trim();
  if (!limpio) return null;
  const todos = lista || await listarProveedores();
  const ya = todos.find(p => esElMismo(p, { nombre: limpio, ruc }));
  if (ya) {
    // Si llegó el RUC y el guardado no lo tenía, se completa: la próxima vez
    // la comparación deja de ser por nombre y pasa a ser exacta.
    if (ruc && !p_ruc(ya)) await supabase.from("proveedores").update({ ruc }).eq("id", ya.id);
    return ya;
  }
  const { data } = await supabase.from("proveedores")
    .insert({ nombre: limpio, ruc: ruc || null }).select().single();
  return data || { nombre: limpio, ruc: ruc || null };
}
/**
 * Los que casi seguro son el mismo, para que alguien los una.
 *
 * Pares, no grupos: unir en cadena —A con B, B con C— junta a A con C sin que
 * nadie lo haya mirado, y así es como se pierde plata de un proveedor adentro
 * de otro.
 */
export function duplicadosProbables(lista = []) {
  const pares = [];
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i], b = lista[j];
      if (!esElMismo(a, b)) continue;
      const porRuc = !!(p_ruc(a) && p_ruc(b) && p_ruc(a) === p_ruc(b));
      pares.push({ a, b, porRuc, seguro: porRuc || nucleo(a.nombre) === nucleo(b.nombre) });
    }
  }
  return pares.sort((x, y) => (y.seguro ? 1 : 0) - (x.seguro ? 1 : 0));
}
