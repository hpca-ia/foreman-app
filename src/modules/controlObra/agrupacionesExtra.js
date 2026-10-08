import { supabase } from "../../lib/supabase";

// Las agrupaciones que NO vienen del presupuesto, y el orden de todas.
//
// Una obra gasta en cosas que nadie contrató: la vivienda del residente, el
// flete, la papelería, el imprevisto. Eso no es un capítulo del contrato y no
// puede colgar de uno —una planilla que le cobra al cliente "gastos de
// oficina" dentro de ALBAÑILERÍA es un problema bastante peor que uno de
// software—, pero sí es plata de la obra y tiene que estar en el control.
//
// La 068 las creó una vez, en las obras que existían ese día. Las obras nuevas
// quedaron sin ellas, porque nada en la app las sembraba: solo la migración.
// Por eso acá están en JavaScript, donde se pueden sembrar al activar una obra
// y agregar a mano después.

/**
 * Las de siempre. Se ofrecen, no se imponen: cada obra agrega las que usa.
 *
 * Órdenes 9001+ para que caigan al final, después de lo contratado. Es solo el
 * lugar en que nacen —se pueden mover como cualquier otra.
 */
export const EXTRAS_SUGERIDAS = [
  { codigo: "X1", nombre: "SALARIOS Y HONORARIOS", orden: 9001 },
  { codigo: "X2", nombre: "GASTOS DE OFICINA", orden: 9002 },
  { codigo: "X3", nombre: "LOGÍSTICA Y TRANSPORTE", orden: 9003 },
  { codigo: "X4", nombre: "VIVIENDA", orden: 9004 },
  { codigo: "X5", nombre: "IMPREVISTOS Y VARIOS", orden: 9005 },
];

const mismoNombre = (a, b) =>
  String(a || "").trim().toLocaleUpperCase("es") === String(b || "").trim().toLocaleUpperCase("es");

/**
 * Siembra las extras que falten. Devuelve cuántas creó.
 *
 * Compara POR NOMBRE y no por código: una obra puede haberlas creado a mano
 * con otro código, y duplicar "GASTOS DE OFICINA" partiría el gasto en dos
 * renglones que nadie vuelve a juntar.
 */
export async function sembrarExtras(obraId, cuales = EXTRAS_SUGERIDAS) {
  if (!obraId || !cuales.length) return { creadas: 0 };
  const { data: ya, error } = await supabase.from("obra_actividades")
    .select("nombre").eq("obra_id", obraId);
  if (error) return { error: error.message };
  const faltan = cuales.filter(x => !(ya || []).some(a => mismoNombre(a.nombre, x.nombre)));
  if (!faltan.length) return { creadas: 0 };
  const { error: e2 } = await supabase.from("obra_actividades").insert(
    faltan.map(x => ({ obra_id: obraId, codigo: x.codigo, nombre: x.nombre,
      orden: x.orden, origen: "manual", extra: true })));
  if (e2) return { error: e2.message };
  return { creadas: faltan.length };
}

/** Crear una sola, con el nombre que le den. */
export async function crearExtra(obraId, nombre, codigo = "") {
  const limpio = String(nombre || "").trim();
  if (!obraId || !limpio) return { error: "Escribí el nombre de la agrupación." };
  const { data: ya } = await supabase.from("obra_actividades")
    .select("id,nombre,orden").eq("obra_id", obraId);
  if ((ya || []).some(a => mismoNombre(a.nombre, limpio))) {
    return { error: `Ya existe una agrupación «${limpio}».` };
  }
  const ultimo = Math.max(9000, ...(ya || []).map(a => a.orden ?? 0));
  const { data, error } = await supabase.from("obra_actividades").insert({
    obra_id: obraId, codigo: String(codigo || "").trim() || null,
    nombre: limpio.toLocaleUpperCase("es"), orden: ultimo + 1, origen: "manual", extra: true,
  }).select().single();
  return error ? { error: error.message } : { actividad: data };
}

/**
 * Dónde queda cada agrupación después de mover un grupo de ellas.
 *
 * Subir de a una con la flecha es insoportable cuando la agrupación nació
 * última y va tercera: son dieciséis clics y la lista saltando debajo del
 * cursor. Esto es lo mismo que ya se hace en Presupuestos —se marcan las que
 * se mueven y se toca "acá" donde van—, y se resuelve en una sola escritura.
 *
 * Caen JUSTO ANTES del destino, conservando el orden que traían entre ellas.
 * Devuelve solo las que cambiaron: renumerar veinte filas para mover una es
 * pedirle a la base veinte escrituras por un movimiento.
 *
 * @param lista     las agrupaciones como se están viendo
 * @param idsMovidas las marcadas
 * @param idDestino  la fila donde se soltó
 */
export function reordenar(lista = [], idsMovidas = [], idDestino = null) {
  const enOrden = [...lista].sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999) || a.id - b.id);
  const mueve = new Set(idsMovidas.map(Number));
  const movidas = enOrden.filter(a => mueve.has(Number(a.id)));
  if (!movidas.length) return [];
  // Soltar sobre una de las marcadas no significa nada: no hay a dónde ir.
  if (mueve.has(Number(idDestino))) return [];

  const resto = enOrden.filter(a => !mueve.has(Number(a.id)));
  const i = resto.findIndex(a => Number(a.id) === Number(idDestino));
  // Sin destino válido van al final, que es lo que uno espera al soltar en el
  // vacío y es mejor que no hacer nada sin decir por qué.
  const corte = i < 0 ? resto.length : i;
  const nueva = [...resto.slice(0, corte), ...movidas, ...resto.slice(corte)];

  // Numeración de 1 en adelante, corrida. Se pierde el 9001 de las extras,
  // que era solo el lugar donde nacen: una vez que alguien ordena a mano, el
  // orden que vale es el suyo.
  return nueva
    .map((a, k) => ({ id: a.id, orden: k + 1 }))
    .filter(x => {
      const antes = enOrden.find(a => Number(a.id) === Number(x.id));
      return (antes?.orden ?? null) !== x.orden;
    });
}

/** Guarda el reordenamiento. Una escritura por fila que cambió, en paralelo. */
export async function guardarOrden(cambios = []) {
  if (!cambios.length) return null;
  const rs = await Promise.all(cambios.map(c =>
    supabase.from("obra_actividades").update({ orden: c.orden }).eq("id", c.id)));
  const mal = rs.find(r => r.error);
  return mal ? mal.error.message : null;
}
