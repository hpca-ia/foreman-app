import { supabase } from "../../lib/supabase";

// El cuaderno de NOVA: lo que esta oficina ya decidió.
//
// No es entrenar un modelo y conviene no confundirlo: es llevar un apunte y
// leerlo antes de opinar. La ventaja de hacerlo así es que se puede mirar,
// corregir y borrar. Una memoria que no se puede inspeccionar es una
// herramienta que falla sin que nadie sepa por qué, y eso en una obra termina
// en un valorado que nadie se anima a usar.
//
// Lo que se guarda es la FORMA del pago, no los meses. Una ventanería se paga
// 50/30/20 empiece la obra en marzo o en septiembre; lo que no cambia es la
// distancia entre el anticipo y la instalación. Guardar "mes 2, mes 5, mes 7"
// serviría para una obra sola.

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

/** Las palabras que hacen reconocible a un rubro, sin las de relleno. */
const RELLENO = new Set([
  "de", "del", "la", "el", "los", "las", "y", "en", "con", "para", "por", "a",
  "provision", "provisión", "instalacion", "instalación", "suministro", "incluye",
  "colocacion", "colocación", "montaje", "mano", "obra", "material", "equipo",
]);

export function patronDe(descripcion) {
  return String(descripcion || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(p => p.length > 3 && !RELLENO.has(p))
    .slice(0, 4)
    .join(" ");
}

export async function leerMemoria(tema = "valorado") {
  const { data, error } = await supabase.from("nova_memoria")
    .select("*").eq("tema", tema).eq("activo", true)
    .order("veces", { ascending: false }).limit(40);
  if (error) return { memoria: [], sinTabla: falta(error) };
  return { memoria: data || [], sinTabla: false };
}

/**
 * Guardar lo que alguien corrigió.
 *
 * Si el patrón ya existe se le suma una, y los pagos se reemplazan por los
 * últimos: la última corrección es la que vale, porque es la que hizo alguien
 * que ya vio las anteriores. `veces` no mide certeza sino insistencia, y sirve
 * para ordenar qué entra en la consulta cuando hay más apuntes que lugar.
 */
export async function recordar({ descripcion, perfil, pagos, anticipacion, nota, quien, tema = "valorado" }) {
  const patron = patronDe(descripcion);
  if (!patron) return null;

  const { data: ya } = await supabase.from("nova_memoria")
    .select("id,veces").eq("tema", tema).eq("patron", patron).limit(1);

  if (ya?.[0]) {
    const { error } = await supabase.from("nova_memoria").update({
      perfil, pagos, anticipacion, nota: nota || null, veces: (ya[0].veces || 1) + 1, activo: true,
    }).eq("id", ya[0].id);
    return error ? error.message : null;
  }
  const { error } = await supabase.from("nova_memoria").insert({
    tema, patron, perfil, pagos, anticipacion, nota: nota || null,
    ejemplo: String(descripcion || "").slice(0, 120),
    creado_por: quien?.id ?? null, creado_nombre: quien?.name || null,
  });
  return error ? (falta(error) ? "Falta correr la migración 077." : error.message) : null;
}

export async function olvidar(id) {
  const { error } = await supabase.from("nova_memoria").update({ activo: false }).eq("id", id);
  return error ? error.message : null;
}

/**
 * La memoria dicha para la consulta.
 *
 * Va en el sistema, antes de los rubros, porque es contexto y no una pregunta.
 * Se dice que son decisiones de ESTA oficina y no reglas generales: NOVA tiene
 * que poder apartarse si el rubro claramente no es el mismo caso, y para eso
 * necesita saber de dónde viene el apunte.
 */
export function memoriaEnPalabras(memoria = []) {
  if (!memoria.length) return "";
  const lineas = memoria.slice(0, 25).map(m => {
    const forma = Array.isArray(m.pagos) && m.pagos.length
      ? m.pagos.map(p => `${p.pct}%`).join(" / ")
      : "";
    const cuando = m.anticipacion ? `, el primer pago ${m.anticipacion} ${m.anticipacion === 1 ? "mes" : "meses"} antes de instalar` : "";
    return `· "${m.patron}" → ${m.perfil || "especial"}${forma ? `, ${forma}` : ""}${cuando}`
      + (m.nota ? ` (${m.nota})` : "")
      + (m.veces > 1 ? ` [confirmado ${m.veces} veces]` : "");
  });
  return `
LO QUE ESTA OFICINA YA DECIDIÓ EN OBRAS ANTERIORES. Son correcciones hechas a mano
sobre propuestas tuyas, así que valen más que tu criterio general. Seguilas salvo
que este rubro sea claramente otro caso, y si te apartás decilo en "porque":
${lineas.join("\n")}
`;
}
