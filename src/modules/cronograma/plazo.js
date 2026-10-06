import { supabase } from "../../lib/supabase";
import { calendario, calcular } from "./cpm";

// El plazo de la obra: una fecha de arranque y una cantidad de meses.
//
// Vive en el proyecto y lo leen los dos cronogramas —el de barras y el
// valorado—. Antes cada uno tenía el suyo, que es dos campos para un solo
// hecho: alcanza con que alguien corrija uno para que el Gantt diga ocho meses
// y la curva de plata diga seis, y a partir de ahí nadie sabe cuál está viejo.
//
// Escribir "la obra dura ocho meses" no es configurar una pantalla: es decir
// algo del proyecto. Por eso se guarda en el proyecto.

export async function leerPlazo(leadId) {
  if (!leadId) return { inicio: null, meses: null };
  const { data, error } = await supabase.from("leads")
    .select("crono_inicio,crono_meses").eq("id", leadId).maybeSingle();
  // Sin la 082 la consulta falla entera y se perdería también la fecha de
  // arranque, que sí existe. Se vuelve a pedir sin los meses: devolver menos
  // es aceptable, devolver nada cuando se tiene la mitad no.
  if (error) {
    const { data: d2 } = await supabase.from("leads")
      .select("crono_inicio").eq("id", leadId).maybeSingle();
    return { inicio: d2?.crono_inicio || null, meses: null, sinPlazo: true };
  }
  return { inicio: data?.crono_inicio || null, meses: data?.crono_meses || null };
}

export async function guardarPlazo(leadId, { inicio, meses, topeMes }) {
  const campos = {};
  if (inicio !== undefined) campos.crono_inicio = inicio || null;
  if (meses !== undefined) campos.crono_meses = meses ? Math.max(1, Math.round(meses)) : null;
  if (topeMes !== undefined) campos.crono_tope_mes = topeMes || null;
  if (!Object.keys(campos).length) return null;
  const { error } = await supabase.from("leads").update(campos).eq("id", leadId);
  if (!error) return null;
  if (/crono_tope_mes/.test(error.message)) return "Falta correr la migración 084.";
  return /column|schema cache/i.test(error.message) ? "Falta correr la migración 082." : error.message;
}

/**
 * Cuántos días de trabajo son los meses del plazo.
 *
 * Contados en el calendario de la obra y no con una regla de tres: "26 días
 * por mes" da de más en febrero y de menos en los meses con feriados, y esa
 * diferencia es con la que después no cuadra el cronograma. Acá se cuentan los
 * días hábiles de verdad entre el arranque y el mismo día N meses después.
 */
export function diasDelPlazo(inicio, meses, cal) {
  if (!meses || !cal) return 0;
  const f = new Date(`${String(inicio || new Date().toISOString()).slice(0, 10)}T12:00:00`);
  if (isNaN(f)) return 0;
  const fin = new Date(f.getFullYear(), f.getMonth() + Math.round(meses), f.getDate(), 12);
  // El día del fin no se cuenta: de marzo a marzo son los meses de por medio,
  // no uno más.
  return Math.max(1, cal.entre(f, new Date(fin.getTime() - 86400000)));
}

/**
 * El cronograma de barras ya calculado, para quien lo necesite desde afuera.
 *
 * El valorado se arma en el control de obra y el Gantt vive en su propio
 * módulo, pero son el mismo plan: el valorado tiene que poder leerlo sin que
 * nadie copie fechas de una pantalla a la otra. Devuelve lo mismo que ve el
 * Gantt —actividades con inicio, fin y holgura, su calendario y su plazo—, así
 * que las dos pantallas no pueden discrepar: leen de acá.
 */
export async function cargarPlan(leadId) {
  const id = leadId?.id ?? leadId;
  if (!id) return { actividades: [], plan: null, cal: null };
  const { data: act, error } = await supabase.from("cronograma_actividades")
    .select("*").eq("lead_id", id).order("orden");
  if (error || !act?.length) return { actividades: [], plan: null, cal: null, sinTablas: !!error };
  const { data: dep } = await supabase.from("cronograma_dependencias")
    .select("*").in("actividad_id", act.map(a => a.id));

  // El arranque y los días laborables se leen acá y no se reciben de afuera:
  // el calendario de la obra es uno, y si cada pantalla lo arma con lo que
  // tiene a mano, la que llamó con menos datos calcula otras fechas.
  const { data: l } = await supabase.from("leads")
    .select("crono_inicio,crono_laborables,crono_feriados").eq("id", id).maybeSingle();

  const cal = calendario({
    laborables: l?.crono_laborables || [1, 2, 3, 4, 5, 6],
    feriados: l?.crono_feriados || [],
  });
  const plan = calcular({
    actividades: act,
    dependencias: dep || [],
    inicio: l?.crono_inicio || new Date().toISOString().slice(0, 10),
    cal,
  });
  // Las fechas calculadas pegadas a la fila guardada: lo que el valorado
  // necesita es agrupación + etapa + peso (de la fila) con inicio y fin (del
  // cálculo), y pedirle a cada pantalla que los cruce es pedir que se
  // equivoque.
  const fechas = new Map(plan.actividades.map(a => [a.id, a]));
  return {
    cal, plan,
    actividades: act.map(a => ({ ...a, ...(fechas.get(a.id) || {}) })),
  };
}

/**
 * Qué cambió en las agrupaciones desde que se armó el cronograma.
 *
 * No hay que corregirlo a mano: si FOREMAN puede darse cuenta, tiene que
 * avisar. Lo que no hace es rehacerlo solo —un cronograma con avance cargado y
 * fechas comprometidas no se reescribe porque alguien tocó una agrupación— y
 * tampoco se queda callado, que era lo que pasaba.
 *
 * @param conAgrupacion ids de agrupación que el cronograma ya usa
 * @param agrupaciones  las que existen hoy en la obra
 */
export function desfase(actividades = [], agrupaciones = [], plata = {}) {
  const hoy = new Map(agrupaciones.map(a => [Number(a.id), a]));
  // Acepta tanto una lista de ids como las actividades enteras: la primera
  // forma la usaba la pantalla antes de que hiciera falta mirar los nombres.
  const filas = actividades.map(a => (typeof a === "object" && a !== null ? a : { obra_actividad_id: a }));
  const usadas = new Set(filas.map(a => Number(a.obra_actividad_id)).filter(Boolean));

  // EL NOMBRE SE QUEDÓ VIEJO.
  //
  // Alguien renombra una agrupación en el control de obra —o la fusiona con
  // otra, o una orden de cambio la toca— y el cronograma sigue diciendo el
  // nombre de antes. Las dos cosas son la misma y se llaman distinto, que es
  // exactamente el problema que estos dos documentos tienen que no tener.
  //
  // Se compara contra el nombre pelado: las etapas llevan sufijo —"VENTANERÍA
  // · anticipo"— y eso no es un desfase, es cómo se escriben.
  const renombradas = filas.filter(a => {
    const g = hoy.get(Number(a.obra_actividad_id));
    if (!g || !a.nombre) return false;
    return String(a.nombre).split(" · ")[0].trim() !== String(g.nombre).trim();
  });

  // LA PLATA CAMBIÓ Y LA BARRA NO.
  //
  // Es el caso más común y el único invisible: una orden de cambio casi nunca
  // agrega rubros nuevos, modifica los que ya están. La ventanería pasa de 90
  // mil a 130 —cuarenta mil de trabajo más que alguien tiene que hacer— y la
  // barra sigue midiendo lo mismo. El cronograma promete una fecha que ya no
  // es cierta y nadie se entera hasta que no se cumple.
  //
  // Se compara contra `monto_ref`: lo que valía la agrupación la última vez
  // que alguien miró esa barra y dijo "esta duración está bien". Sin esa foto
  // —si la 086 no corrió, o si la actividad es vieja— no se puede saber, y no
  // se inventa: se calla.
  const porAgrup = new Map();
  filas.forEach(a => {
    const id = Number(a.obra_actividad_id);
    if (!id || a.monto_ref == null) return;
    if (!porAgrup.has(id)) porAgrup.set(id, { ref: 0, actividades: [] });
    porAgrup.get(id).ref += Number(a.monto_ref) || 0;
    porAgrup.get(id).actividades.push(a);
  });
  const dePlata = [];
  porAgrup.forEach((v, id) => {
    const g = hoy.get(id);
    if (!g) return;
    const ahora = Math.round((Number(plata[id]) || 0) * 100) / 100;
    const antes = Math.round(v.ref * 100) / 100;
    if (!antes) return;
    const dif = ahora - antes;
    // Un 5% para no avisar por un redondeo o por un rubro de cien dólares.
    if (Math.abs(dif) < Math.max(antes * 0.05, 50)) return;
    dePlata.push({
      id, nombre: g.nombre, antes, ahora, dif,
      pct: Math.round((dif / antes) * 1000) / 10,
      actividades: v.actividades,
    });
  });

  // EL ORDEN SE SEPARÓ. Lo que el control dice primero, el cronograma lo tiene
  // sexto. Puede ser a propósito —el orden de trabajo no es el del
  // presupuesto— así que se informa y no se corrige solo.
  const pos = new Map(agrupaciones.map((g, i) => [Number(g.id), g.orden ?? i]));
  const enCrono = [];
  const visto = new Set();
  [...filas].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).forEach(a => {
    const id = Number(a.obra_actividad_id);
    if (!id || visto.has(id) || !pos.has(id)) return;
    visto.add(id); enCrono.push(id);
  });
  const delControl = [...enCrono].sort((a, b) => pos.get(a) - pos.get(b));
  const reordenadas = enCrono.some((id, i) => id !== delControl[i]);

  return {
    // Se borró la agrupación y quedaron actividades o líneas colgando.
    perdidas: [...usadas].filter(id => !hoy.has(id)),
    // Se agregó una agrupación y nadie la puso en el cronograma.
    nuevas: agrupaciones.filter(a => !a.extra && !usadas.has(Number(a.id))),
    renombradas,
    dePlata,
    reordenadas,
  };
}
