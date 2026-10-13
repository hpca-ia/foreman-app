import { supabase } from "../../lib/supabase";
import { calendario } from "./cpm";
import { normalizarPlan, conLasFaltantes } from "./planDeObra";
import { leerMemoria } from "./memoriaNova";
import { memoriaEnPalabras } from "./apuntes";
import { jsonTolerante } from "../../lib/jsonTolerante";
import { JUICIO, pedirANova, textoDeNova, porQueFallo } from "../../lib/modelos";
import { crearFase } from "./fases";
import { proponerDependencias } from "./novaCronograma";

// ARMAR EL CRONOGRAMA: etapas, y adentro lo que hay que hacer.
//
// Reemplaza el camino viejo, que le pedía a NOVA el cronograma entero en UNA
// respuesta: actividades, duraciones, partes con sus porcentajes de plata y
// todas las dependencias. Dos cosas estaban mal ahí.
//
// La primera es la forma de pedirlo. Un solo campo mal, una respuesta cortada
// o un minuto de más, y no llegaba NADA: un cartel rojo y la pantalla vacía.
// Acá va por pasos y cada paso se guarda. Si falla el tercero, los dos
// primeros ya están en la obra y se sigue desde ahí.
//
// La segunda es QUÉ se pedía: una actividad por agrupación del presupuesto. El
// cronograma era el presupuesto puesto de costado, y una obra no se construye
// así. Se piensa por etapas, y adentro de cada etapa hay trabajos que no son
// rubros de nadie: el desmontaje de lo que había, el replanteo, las pruebas,
// la limpieza. Ahora la estructura la arma NOVA y el presupuesto entra adentro.

const miles = v => Math.round(v).toLocaleString("es-EC");

/** Una agrupación dicha en una línea, con lo único que importa: su tamaño. */
function enPalabras(a) {
  const mag = a.magnitud?.length
    ? a.magnitud.slice(0, 3).map(m => `${miles(m.cantidad)} ${m.unidad}`).join(" · ")
    : "sin cantidades cargadas";
  const princ = a.principales?.length
    ? `\n     ${a.principales.map(r => `${r.descripcion} (${miles(r.cantidad)} ${r.unidad})`).join(" · ")}`
    : "";
  return `${a.id} · ${a.nombre} · $${miles(a.monto)}\n     ${mag}${princ}`;
}

/**
 * Paso 1: el plan. Qué etapas tiene esta obra y qué se hace en cada una.
 *
 * `comoVa` es lo que la persona quiera contar con sus palabras —"primero hay
 * que desmontar todo lo que hay", "el aire acondicionado llega en diciembre"—
 * y vale más que cualquier criterio general: es la única parte de esta obra
 * que no está en ningún dato.
 */
export async function proponerPlan({ agrupaciones = [], meses = 0, dias: diasPlazo = 0,
  nombreObra = "", comoVa = "", cal = calendario() }) {
  const dias = diasPlazo || Math.max(20, Math.round((meses || 6) * 26));
  const { memoria } = await leerMemoria("cronograma");
  const L = cal?.laborables || [1, 2, 3, 4, 5, 6];
  const jornada = L.length === 7 ? "se trabaja los siete días"
    : L.includes(6) ? "se trabaja de lunes a sábado" : "se trabaja de lunes a viernes, sin sábados";

  const sistema = `Sos NOVA y armás el cronograma de la obra "${nombreObra}", en Ecuador.
${memoriaEnPalabras(memoria, "cronograma")}
La obra dura ${dias} días de trabajo contados en su calendario: ${jornada}.
${agrupaciones.length ? `
EL PRESUPUESTO, agrupado, con su plata y SU TAMAÑO medido:
${agrupaciones.map(enPalabras).join("\n")}
` : "\nEsta obra todavía no tiene presupuesto cargado: armá el cronograma por lo que sabés del tipo de obra.\n"}${comoVa ? `
LO QUE CUENTA QUIEN DIRIGE LA OBRA. Esto manda sobre tu criterio: es lo único
de esta obra que no está en ningún dato.
"""
${String(comoVa).slice(0, 3000)}
"""
` : ""}
Devolvés SOLO JSON, sin markdown:

{"etapas":[
  {"nombre":"Preliminares","actividades":[
     {"nombre":"Desmontaje de instalaciones existentes","dias":5,"agrupacion":null,
      "porque":"hay que vaciar el local antes de empezar"},
     {"nombre":"Obra civil","dias":13,"agrupacion":2,
      "porque":"420 m2 / 1 cuadrilla x 32 m2 dia"}]},
  {"nombre":"Instalaciones","actividades":[
     {"nombre":"Eléctricas","dias":20,"agrupacion":5,"porque":"180 puntos / 9 por dia",
      "incluye":["canalización","cableado","pruebas"]}]}]}

ASÍ SE PIENSA UNA OBRA: POR ETAPAS.

Entre tres y seis etapas para toda la obra, en el orden en que ocurren.
Preliminares, demoliciones, obra gris, instalaciones, acabados, equipamiento,
entrega. Usá los nombres con los que se habla en obra. No hagas una etapa por
agrupación: eso no es una etapa, es una lista.

ADENTRO DE CADA ETAPA VAN LOS TRABAJOS, Y NO TODOS SON RUBROS.

Esto es lo más importante y es lo que antes no se podía hacer. Media obra no
está en ningún presupuesto: el desmontaje de lo que había, el replanteo, el
paso de tubería antes del enlucido, las pruebas de las instalaciones, la
limpieza final, la recepción. Si hace falta hacerlo, va como actividad con
"agrupacion": null. Ponelas: un cronograma sin eso es un cronograma que no se
puede cumplir.

${agrupaciones.length ? `CADA AGRUPACIÓN DEL PRESUPUESTO TIENE QUE APARECER UNA VEZ, en la etapa que le
toque, con su id en "agrupacion". Ni dos veces —se contaría la plata dos
veces— ni ninguna: la que falte queda sin tiempo y la obra sin esa plata.
Podés darle el nombre que se usa en obra en vez del nombre largo del
presupuesto.

` : ""}CÓMO SALE LA DURACIÓN: DE LA CANTIDAD, NO DE LA PLATA.

Diez metros de pintura y mil pueden costar parecido —si en un caso el material
es importado y en el otro no— y no son ni de lejos el mismo tiempo de obra.

  días = cantidad ÷ (lo que rinde una cuadrilla por día × cuántas cuadrillas)

Los rendimientos los sabés: cuántos m2 de enlucido hace un albañil con su
ayudante en un día, cuántos de mampostería, cuántos m3 de hormigón pone una
cuadrilla. Usá los de obra en Ecuador. Lo que NO podés hacer es poner "20 días"
porque suena razonable: si la agrupación trae 1.240 m2 y ponés 20 días, estás
diciendo 62 m2 por día, y eso tiene que ser verdad. Esa cuenta va en "porque",
en diez palabras. Si una agrupación dice "sin cantidades cargadas", estimá por
la plata y escribí "estimado sin cantidades": quien revise tiene que saber que
ese número es el más flojo de todos.

EL PLAZO MANDA: ${dias} días hábiles. Las etapas SE TRASLAPAN —los acabados de
una zona arrancan mientras en otra todavía hay obra gris— así que la suma de
todas las duraciones puede pasarse del plazo sin problema: el orden lo
resuelvo yo después. Lo que no puede pasar es que una sola actividad dure más
que la obra entera.

"incluye" es opcional: dos a cuatro trabajos que pasan adentro de esa barra y
no son rubros. De ahí sale después el plan semanal.

NO DEVUELVAS DEPENDENCIAS. El orden se pide aparte.`;

  try {
    const { res, data } = await pedirANova({
      model: JUICIO, max_tokens: 8000,
      system: sistema,
      messages: [{ role: "user", content: "Armá el plan de la obra por etapas. Solo JSON." }],
    });
    if (!res.ok || data?.error) return { error: porQueFallo(res, data, "armar el plan") };
    const { datos, cortado } = jsonTolerante(textoDeNova(data));
    if (!datos?.etapas?.length) {
      const muestra = String(textoDeNova(data) || "").trim().slice(0, 220);
      return { error: `NOVA devolvió algo que no se entiende. Empezaba así:\n\n${muestra || "(vacío)"}` };
    }
    const plan = conLasFaltantes(normalizarPlan(datos, agrupaciones), dias);
    if (!plan.barras) return { error: "NOVA no devolvió ninguna actividad. Probá de nuevo." };
    return { plan, cortado };
  } catch (e) {
    return { error: "NOVA devolvió algo que no se entiende: " + e.message };
  }
}

/**
 * Paso 2: guardar el plan. Primero las etapas, después sus actividades.
 *
 * REEMPLAZA lo que salió del control y deja lo que alguien agregó a mano. Un
 * permiso municipal escrito a mano no está en ningún presupuesto y no hay de
 * dónde volver a sacarlo; borrarlo al rearmar es perder trabajo que nadie
 * puede recuperar.
 */
export async function guardarPlan({ lead, obra, plan, quien }) {
  const { data: previas } = await supabase.from("cronograma_actividades")
    .select("id,obra_actividad_id").eq("lead_id", lead.id);
  const aBorrar = (previas || []).filter(x => x.obra_actividad_id != null).map(x => x.id);
  if (aBorrar.length) {
    await supabase.from("cronograma_dependencias").delete().in("actividad_id", aBorrar);
    await supabase.from("cronograma_dependencias").delete().in("depende_de_id", aBorrar);
    await supabase.from("cronograma_actividades").delete().in("id", aBorrar);
  }
  // Las etapas de antes también: las nuevas las reemplazan. Borrarlas no borra
  // ninguna actividad —quedan sin etapa— así que lo propio del cronograma
  // sigue estando.
  const { data: fasesViejas } = await supabase.from("cronograma_fases").select("id").eq("lead_id", lead.id);
  if (fasesViejas?.length) await supabase.from("cronograma_fases").delete().in("id", fasesViejas.map(f => f.id));

  const creadas = [];
  let orden = 0;
  let sinEtapas = false;
  for (let i = 0; i < plan.etapas.length; i++) {
    const e = plan.etapas[i];
    const hecha = await crearFase({ leadId: lead.id, nombre: e.nombre, orden: i, quien });
    // Sin la 101 no hay etapas: el cronograma entra igual, en una sola lista.
    // Perder las barras por no poder guardar un título sería absurdo.
    if (hecha.error) sinEtapas = true;
    const filas = e.actividades.map(a => ({
      lead_id: lead.id, obra_id: obra?.id || null,
      nombre: a.nombre, duracion: a.dias,
      obra_actividad_id: a.agrupacion, nota: a.porque, orden: orden++,
      etapa: "ejecucion", incluye: a.incluye?.length ? a.incluye : null,
      ...(hecha.fase ? { fase_id: hecha.fase.id } : {}),
    }));
    let { data, error } = await supabase.from("cronograma_actividades").insert(filas).select();
    // Se va soltando lo que la base no tenga antes que perder el cronograma.
    if (error) {
      const limpias = filas.map(({ incluye, fase_id: _f, etapa, ...resto }) => resto);
      ({ data, error } = await supabase.from("cronograma_actividades").insert(limpias).select());
    }
    if (error) return { error: /schema cache|does not exist/i.test(error.message) ? "Falta correr la migración 076." : error.message };
    creadas.push(...(data || []));
  }
  return { creadas, etapas: plan.etapas.length, sinEtapas };
}

/**
 * Paso 3: el orden. Aparte, y al final, porque es lo único que se puede
 * perder sin que duela: las barras ya están con sus tiempos pensados, y
 * encadenarlas se rehace en un click.
 */
export async function guardarOrden({ actividades = [], dias = 0, nombreObra = "", cal }) {
  const r = await proponerDependencias({ actividades, dias, nombreObra, cal });
  if (r.error) return { error: r.error };
  if (!r.dependencias.length) return { creadas: 0 };
  const filas = r.dependencias.map(d => ({
    actividad_id: d.a, depende_de_id: d.de, tipo: d.tipo || "FC", retardo: d.retardo || 0,
  }));
  const { data, error } = await supabase.from("cronograma_dependencias").insert(filas).select("id");
  if (error) return { error: error.message };
  return { creadas: data?.length || 0 };
}
