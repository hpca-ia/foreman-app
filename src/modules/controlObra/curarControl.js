import { supabase } from "../../lib/supabase";

// Acomodar el control sin tocar el presupuesto aprobado.
//
// Son dos lecturas de la misma tabla. El "Presupuesto original" es el
// documento que el cliente aprobó y firmó: no se toca, porque es la única
// defensa que tiene una obra en una discusión de planillas. El control es la
// herramienta de todos los días, y ésa sí hay que poder acomodarla.
//
// Por eso cada rubro guarda el capítulo con el que NACIÓ además del de
// trabajo, y lo que se esconde se esconde solo del control.

const n = v => Number(v) || 0;
const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

/**
 * Los rubros que no sirven para nada en el control.
 *
 * Un presupuesto importado trae renglones en $0: títulos sueltos que entraron
 * como rubro, partidas que quedaron sin precio, líneas de total que se
 * colaron. En una obra de ciento sesenta rubros son ruido que se lee todos los
 * días y que no suma un centavo.
 *
 * SOLO LOS QUE ESTÁN EN CERO Y SIN PLATA. Esconder uno con monto cambiaría los
 * totales, y un control cuyos totales dependen de lo que alguien escondió no
 * es un control. Como están en cero, esconderlos no mueve ningún número: por
 * eso es seguro, y por eso vale la pena ofrecerlo.
 */
export function rubrosInutiles(rubros = [], porRubro = {}) {
  return rubros.filter(r => {
    if (r.oculto) return false;
    if (r.anulado_por_oc) return false;         // ya se muestra tachado, no es ruido
    if (n(r.total_base) !== 0) return false;
    const m = porRubro[r.id];
    // Con plata movida no se toca, aunque el presupuesto diga cero: un rubro
    // en $0 con facturas encima es justo lo que hay que mirar.
    return !m || (n(m.acumulado) === 0 && n(m.anterior) === 0 && n(m.periodo) === 0);
  });
}

/** Esconder o traer de vuelta. Reversible siempre: hoy estorba, mañana se pregunta por él. */
export async function esconder(ids = [], oculto = true) {
  if (!ids.length) return null;
  const { error } = await supabase.from("obra_rubros").update({ oculto }).in("id", ids);
  if (!error) return null;
  return falta(error) ? "Falta correr la migración 092." : error.message;
}

/**
 * Los capítulos del control, con cuántos rubros tiene cada uno.
 *
 * En el orden en que se leen, que es el que manda en toda la obra: el control,
 * el cronograma y el valorado salen todos de acá.
 */
export function capitulosDeLaObra(rubros = []) {
  const mapa = new Map();
  rubros.forEach(r => {
    const nombre = r.capitulo || "SIN CAPÍTULO";
    if (!mapa.has(nombre)) mapa.set(nombre, { nombre, orden: n(r.capitulo_orden), rubros: 0, base: 0 });
    const c = mapa.get(nombre);
    c.rubros += 1;
    if (!r.anulado_por_oc) c.base += n(r.total_base);
    c.orden = Math.min(c.orden || 9999, n(r.capitulo_orden) || 9999);
  });
  return [...mapa.values()].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

/**
 * Qué orden le toca a un capítulo nuevo: el último, más uno.
 *
 * Al final y no al principio porque lo que se agrega después es, casi siempre,
 * algo que no estaba contratado; verlo arriba del contrato confunde las dos
 * cosas. Moverlo de lugar es un clic, si hace falta.
 */
export function ordenParaCapituloNuevo(rubros = []) {
  return Math.max(0, ...rubros.map(r => n(r.capitulo_orden))) + 1;
}

/**
 * Crear un capítulo del control y mudarle rubros.
 *
 * Un capítulo sin rubros no existe: los capítulos no son una tabla, son el
 * nombre que llevan los rubros. Entonces crear uno es, necesariamente, mover
 * algo adentro —o agregar un renglón nuevo, que es el otro camino—.
 *
 * NO TOCA EL PRESUPUESTO APROBADO: `capitulo_original` ya guarda con cuál
 * entró cada rubro, y esa es la que lee el "Presupuesto original".
 */
export async function moverACapitulo(ids = [], nombre, orden) {
  const limpio = String(nombre || "").trim();
  if (!ids.length) return "No marcaste ningún rubro.";
  if (!limpio) return "Escribí el nombre del capítulo.";
  const campos = { capitulo: limpio.toLocaleUpperCase("es") };
  if (orden != null) campos.capitulo_orden = Math.round(orden);
  const { error } = await supabase.from("obra_rubros").update(campos).in("id", ids);
  return error ? error.message : null;
}

/** Renombrar un capítulo entero, en el control. */
export async function renombrarCapitulo(obraId, antes, despues) {
  const limpio = String(despues || "").trim().toLocaleUpperCase("es");
  if (!limpio) return "Escribí el nombre nuevo.";
  if (limpio === String(antes || "").toLocaleUpperCase("es")) return null;
  const { error } = await supabase.from("obra_rubros")
    .update({ capitulo: limpio }).eq("obra_id", obraId).eq("capitulo", antes);
  return error ? error.message : null;
}

/**
 * Un renglón nuevo en el control, que no viene del presupuesto aprobado.
 *
 * Va marcado `origen: 'control'` y con su capítulo original en nulo, para que
 * el presupuesto aprobado no lo muestre nunca: ese documento tiene que poder
 * imprimirse igual que el día que se firmó.
 */
export async function agregarRubro(obra, { capitulo, capituloOrden, descripcion, unidad, cantidad, precio, iva = 0 }) {
  const desc = String(descripcion || "").trim();
  if (!desc) return { error: "Escribí qué es." };
  const cant = n(cantidad) || 1;
  const pu = n(precio);
  const { data: ultimos } = await supabase.from("obra_rubros")
    .select("numero,orden").eq("obra_id", obra.id).order("numero", { ascending: false }).limit(1);
  const numero = n(ultimos?.[0]?.numero) + 1;
  const { data, error } = await supabase.from("obra_rubros").insert({
    obra_id: obra.id,
    numero,
    capitulo: String(capitulo || "SIN CAPÍTULO").toLocaleUpperCase("es"),
    capitulo_orden: Math.round(n(capituloOrden)),
    orden: numero,
    descripcion: desc,
    unidad: String(unidad || "u").trim(),
    cantidad: cant,
    precio_unitario: pu,
    iva_pct: n(iva),
    total_base: cant * pu,
    origen: "control",
  }).select().single();
  if (error) return { error: falta(error) ? "Falta correr la migración 092." : error.message };
  return { rubro: data };
}

/** Borrar un renglón que se agregó acá y resultó un error. Solo los de acá. */
export async function borrarRubroDelControl(rubro) {
  if (rubro?.origen !== "control") {
    return "Ese rubro viene del presupuesto aprobado: se puede esconder, no borrar.";
  }
  const { error } = await supabase.from("obra_rubros").delete().eq("id", rubro.id);
  return error ? error.message : null;
}
