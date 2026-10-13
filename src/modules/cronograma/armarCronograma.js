import { supabase } from "../../lib/supabase";
import { calendario } from "./cpm";
import { normalizarPlan, conLasFaltantes } from "./planDeObra";
import { leerMemoria } from "./memoriaNova";
import { memoriaEnPalabras } from "./apuntes";
import { jsonTolerante } from "../../lib/jsonTolerante";
import { JUICIO, pedirANova, textoDeNova, porQueFallo } from "../../lib/modelos";
import { crearFase } from "./fases";
import { proponerDependencias, ORDEN_DE_UNA_OBRA } from "./novaCronograma";

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
  nombreObra = "", comoVa = "", cal = calendario(), cubrirPresupuesto = true }) {
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

${!agrupaciones.length ? "" : cubrirPresupuesto ? `CADA AGRUPACIÓN DEL PRESUPUESTO TIENE QUE APARECER UNA VEZ, en la etapa que le
toque, con su id en "agrupacion". Ni dos veces —se contaría la plata dos
veces— ni ninguna: la que falte queda sin tiempo y la obra sin esa plata.
Podés darle el nombre que se usa en obra en vez del nombre largo del
presupuesto.

` : `EL PRESUPUESTO ES UNA REFERENCIA, NO EL ÍNDICE.

Está arriba para que sepas de qué tamaño es la obra y qué alcance tiene, no
para que lo copies. Armá el cronograma como SE CONSTRUYE esta obra: con los
trabajos que de verdad hay que hacer, en el orden en que se hacen, con los
nombres de obra. Podés juntar tres agrupaciones en un solo trabajo, partir una
en cuatro, o poner trabajos que no están en ninguna.

Cuando un trabajo tuyo sea claramente una agrupación del presupuesto, ponele
su id en "agrupacion" —así el control y el valorado hablan de lo mismo—. Y
cuando no, dejalo en null. No fuerces la correspondencia.

`}CÓMO SALE LA DURACIÓN: DE LA CANTIDAD, NO DE LA PLATA.

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
    const crudo = normalizarPlan(datos, agrupaciones);
    // Si el presupuesto no manda, lo que NOVA no nombró no es un olvido: es
    // una decisión suya. Agregarlo al final sería desarmar lo que acaba de
    // armar. Se dice cuántas quedaron afuera y se deja que se vea en el
    // control, que es donde se nota si falta plata.
    const plan = cubrirPresupuesto ? conLasFaltantes(crudo, dias) : crudo;
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
  // PRIMERO SE GUARDA LO NUEVO, DESPUÉS SE BORRA LO VIEJO.
  //
  // Al revés estaba, y es un error caro: borraba las barras y las etapas, y
  // recién entonces insertaba. Si la inserción fallaba a mitad de camino —un
  // permiso, una columna que falta, la conexión— el cronograma anterior ya no
  // existía y el nuevo tampoco. La pantalla quedaba vacía y no había de dónde
  // recuperarlo. Pasó.
  //
  // Guardando primero, lo peor que pasa es que queden las dos listas juntas y
  // haya que borrar una a mano. Eso es un rato de trabajo; lo otro era perder
  // el cronograma entero.
  const { data: previas } = await supabase.from("cronograma_actividades")
    .select("id,obra_actividad_id").eq("lead_id", lead.id);
  // LO PROPIO DEL CRONOGRAMA SOBREVIVE: lo que alguien agregó a mano —el
  // permiso municipal, la inspección de bomberos— no está en ningún
  // presupuesto y no hay de dónde volver a sacarlo.
  const aBorrar = (previas || []).filter(x => x.obra_actividad_id != null).map(x => x.id);
  const { data: fasesViejas } = await supabase.from("cronograma_fases").select("id").eq("lead_id", lead.id);

  const creadas = [];
  let orden = 1000;   // atrás de lo que haya, hasta que lo viejo se vaya
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
    if (error) {
      // No se borró nada todavía: el cronograma de antes sigue entero y lo que
      // alcanzó a entrar se saca, para no dejar media lista nueva encima.
      if (creadas.length) await supabase.from("cronograma_actividades").delete().in("id", creadas.map(x => x.id));
      return { error: /schema cache|does not exist/i.test(error.message) ? "Falta correr la migración 076." : error.message };
    }
    creadas.push(...(data || []));
  }
  if (!creadas.length) return { error: "No se guardó ninguna actividad." };

  // Recién ahora, con lo nuevo adentro y contado, se va lo de antes.
  if (aBorrar.length) {
    await supabase.from("cronograma_dependencias").delete().in("actividad_id", aBorrar);
    await supabase.from("cronograma_dependencias").delete().in("depende_de_id", aBorrar);
    await supabase.from("cronograma_actividades").delete().in("id", aBorrar);
  }
  // Las etapas viejas también. Borrarlas no borra ninguna actividad —quedan
  // sin etapa— así que lo propio del cronograma sigue estando.
  if (fasesViejas?.length) await supabase.from("cronograma_fases").delete().in("id", fasesViejas.map(f => f.id));

  // Y las nuevas quedan numeradas desde cero, ahora que no compiten con nada.
  await Promise.all(creadas.map((a, k) =>
    supabase.from("cronograma_actividades").update({ orden: k }).eq("id", a.id)));

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


/**
 * UN CRONOGRAMA QUE YA ESTÁ ESCRITO, EN TEXTO.
 *
 * Hay una manera de armar un cronograma que funciona y que no es esta app:
 * hablarlo. Alguien se sienta, lo piensa en palabras —a veces con otro
 * asistente, a veces en una servilleta— y queda una lista de etapas con sus
 * trabajos y sus días. Eso ya es el trabajo difícil hecho, y hasta ahora no
 * había manera de meterlo acá sin volver a escribirlo barra por barra.
 *
 * No se le pide a NOVA que opine: se le pide que LEA. Los días que estén
 * escritos se respetan tal cual, aunque le parezcan pocos. Lo único que pone
 * de su cosecha es un día cuando no hay número, y dice cuáles fueron.
 */
export async function leerCronogramaEscrito({ texto = "", agrupaciones = [], dias = 0, cal = calendario() }) {
  const dicho = String(texto || "").trim();
  if (dicho.length < 20) return { error: "Pegá el cronograma: las etapas con sus trabajos y sus días." };
  const L = cal?.laborables || [1, 2, 3, 4, 5, 6];
  const jornada = L.length === 7 ? "los siete días" : L.includes(6) ? "de lunes a sábado" : "de lunes a viernes";
  try {
    const sistema = `Sos NOVA y tu trabajo acá es LEER un cronograma que ya está escrito y
pasarlo a la forma que usa FOREMAN. No es tu cronograma: es el de quien dirige
la obra, y ya está decidido.

LO QUE ESTÁ ESCRITO:
"""
${dicho.slice(0, 12000)}
"""
${agrupaciones.length ? `
EL PRESUPUESTO DE ESTA OBRA, por si algún trabajo es claramente uno de estos:
${agrupaciones.map(a => `${a.id} · ${a.nombre}`).join("\n")}
` : ""}
Se trabaja ${jornada}${dias ? ` y el plazo son ${dias} días hábiles` : ""}.

Devolvés SOLO JSON, sin markdown:

{"etapas":[{"nombre":"Preliminares","actividades":[
  {"nombre":"Desmontaje de instalaciones","dias":5,"agrupacion":null},
  {"nombre":"Obra civil","dias":13,"agrupacion":2}]}]}

LAS REGLAS DE LEER, que son distintas de las de opinar:

· LOS DÍAS QUE ESTÁN ESCRITOS SE RESPETAN. Aunque te parezcan pocos o muchos.
  Si dice "3 semanas" son 15 días hábiles si se trabaja de lunes a viernes, 18
  si se trabaja sábados. Si dice una fecha de inicio y una de fin, contá los
  días hábiles entre las dos.
· SI NO HAY DÍAS para un trabajo, poné los que te parezcan y nada más: no
  inventes trabajos, no agregues etapas, no reordenes. Lo que no está escrito
  no estaba.
· SI NO HAY ETAPAS y es una lista plana de trabajos, devolvé UNA sola etapa
  que se llame "Obra".
· LA AGRUPACIÓN solo cuando el trabajo es claramente uno del presupuesto de
  arriba. Ante la duda, null: una barra colgada de la agrupación equivocada
  ensucia el control, y una suelta no le hace daño a nadie.
· NO DEVUELVAS DEPENDENCIAS. El orden se arma aparte.`;

    const { res, data } = await pedirANova({
      model: JUICIO, max_tokens: 8000,
      system: sistema,
      messages: [{ role: "user", content: "Pasalo a JSON. Respetá lo que está escrito." }],
    });
    if (!res.ok || data?.error) return { error: porQueFallo(res, data, "leerlo") };
    const { datos, cortado } = jsonTolerante(textoDeNova(data));
    if (!datos?.etapas?.length) {
      const muestra = String(textoDeNova(data) || "").trim().slice(0, 220);
      return { error: `NOVA no pudo leerlo. Devolvió:\n\n${muestra || "(vacío)"}` };
    }
    // Acá NO se agregan las agrupaciones que falten: el cronograma es el que
    // está escrito, y completarlo sería corregir a quien lo escribió.
    const plan = normalizarPlan(datos, agrupaciones);
    if (!plan.barras) return { error: "No encontré actividades en lo que pegaste." };
    return { plan, cortado };
  } catch (e) {
    return { error: "NOVA devolvió algo que no se entiende: " + e.message };
  }
}

/**
 * LEER EL CRONOGRAMA QUE HAY Y PONERLE TIEMPOS Y ORDEN.
 *
 * Es el otro camino, y es el que de verdad se usa: alguien escribe las etapas
 * y los trabajos —que es lo que sabe, porque conoce la obra— y lo que no
 * quiere hacer es sentarse a calcular cuántos días lleva cada uno y qué traba
 * a qué. Eso sí es trabajo de NOVA: rendimientos y orden de obra.
 *
 * Se lee lo que HAY, en el orden en que está, respetando las etapas. No se
 * agregan trabajos ni se reordena: lo que está escrito lo escribió alguien que
 * vio la obra, y NOVA no vio nada.
 */
export async function ponerTiemposYOrden({ actividades = [], fases = [], agrupaciones = [],
  dias = 0, nombreObra = "", comoVa = "", cal = calendario() }) {
  const vivas = actividades.filter(a => a.nombre);
  if (!vivas.length) return { error: "Todavía no hay actividades que leer." };

  const { memoria } = await leerMemoria("cronograma");
  const L = cal?.laborables || [1, 2, 3, 4, 5, 6];
  const jornada = L.length === 7 ? "los siete días" : L.includes(6) ? "de lunes a sábado" : "de lunes a viernes, sin sábados";
  const porFase = new Map(fases.map(f => [Number(f.id), f.nombre]));
  const tamano = new Map(agrupaciones.map(a => [Number(a.id), a]));

  // Dicho por etapas, en el orden en que están: el orden es información y es
  // de quien lo escribió.
  const lista = vivas.map(a => {
    const et = a.fase_id != null ? porFase.get(Number(a.fase_id)) : null;
    const ag = a.obra_actividad_id != null ? tamano.get(Number(a.obra_actividad_id)) : null;
    const mag = ag?.magnitud?.[0] ? ` · ${miles(ag.magnitud[0].cantidad)} ${ag.magnitud[0].unidad}` : "";
    return `${a.id} · ${et ? `[${et}] ` : ""}${a.nombre}${mag} · hoy dice ${a.duracion}d`;
  }).join("\n");

  try {
    const sistema = `Sos NOVA. El cronograma de la obra "${nombreObra}" ya está escrito por quien la
dirige: están las etapas y los trabajos, en el orden en que van. Falta lo tuyo,
que es cuánto lleva cada uno y qué traba a qué.
${memoriaEnPalabras(memoria, "cronograma")}
LO QUE HAY, en orden. Entre corchetes la etapa, y donde se sabe, el tamaño:
${lista}

El plazo son ${dias || "los que hagan falta"} días hábiles y se trabaja ${jornada}.
${comoVa ? `
LO QUE CUENTA QUIEN DIRIGE LA OBRA, y manda sobre tu criterio:
"""
${String(comoVa).slice(0, 2000)}
"""
` : ""}
Devolvés SOLO JSON, sin markdown, con los ids de arriba:

{"dias":[{"id":12,"dias":18,"porque":"420 m2 / 1 cuadrilla x 24 m2 dia"}],
 "dependencias":[[12,13,0],[13,14,-5]]}

NO AGREGUES TRABAJOS, NO SAQUES NINGUNO Y NO LOS REORDENES. Lo que está escrito
lo escribió alguien que vio la obra; vos no la viste. Tu trabajo son los dos
números.

LOS DÍAS SALEN DE LA CANTIDAD cuando hay cantidad: días = cantidad ÷ (lo que
rinde una cuadrilla por día × cuántas cuadrillas). Usá rendimientos de obra en
Ecuador y poné esa cuenta en "porque", en diez palabras. Cuando no hay
cantidad, estimá por lo que es el trabajo y escribí "estimado". Si el número
que ya tiene te parece bien, devolvelo igual.

LAS DEPENDENCIAS son [de, a, retardo]: "de" termina antes de que empiece "a".
El cuarto elemento es opcional: "CC" si arrancan juntas, "FF" si terminan
juntas.
${ORDEN_DE_UNA_OBRA}
EL PLAZO MANDA${dias ? `: ${dias} días hábiles` : ""}. Las etapas se traslapan —los acabados de una
zona arrancan mientras en otra todavía hay obra gris— y ahí es donde se gana
el tiempo: usá retardos negativos. Lo que no se puede comprimir es el fragüe
del hormigón ni el secado: esos tardan lo que tardan.`;

    const { res, data } = await pedirANova({
      model: JUICIO, max_tokens: 8000,
      system: sistema,
      messages: [{ role: "user", content: "Poné los días y el orden. Solo JSON." }],
    });
    if (!res.ok || data?.error) return { error: porQueFallo(res, data, "ponerle tiempos y orden") };
    const { datos, cortado } = jsonTolerante(textoDeNova(data));
    if (!datos) return { error: "NOVA devolvió algo que no se entiende. Probá de nuevo." };

    const validos = new Set(vivas.map(a => Number(a.id)));
    const ahora = new Map(vivas.map(a => [Number(a.id), a]));
    const duraciones = (datos.dias || [])
      .map(d => ({ id: Number(d.id), dias: Math.max(1, Math.round(Number(d.dias) || 0)), porque: d.porque || null }))
      .filter(d => validos.has(d.id) && d.dias && d.dias !== ahora.get(d.id)?.duracion);
    const dependencias = (datos.dependencias || [])
      .map(d => (Array.isArray(d)
        ? { de: Number(d[0]), a: Number(d[1]), retardo: Number(d[2]) || 0, tipo: typeof d[3] === "string" ? d[3] : "FC" }
        : { de: Number(d.de), a: Number(d.a), retardo: Number(d.retardo) || 0, tipo: d.tipo || "FC" }))
      .filter(d => validos.has(d.de) && validos.has(d.a) && d.de !== d.a);
    return { duraciones, dependencias, cortado };
  } catch (e) {
    return { error: "NOVA devolvió algo que no se entiende: " + e.message };
  }
}

/** Aplicar lo que propuso: los días uno por uno, y el orden reemplazando el que haya. */
export async function aplicarTiemposYOrden({ duraciones = [], dependencias = [], actividades = [] }) {
  for (const d of duraciones) {
    await supabase.from("cronograma_actividades").update({ duracion: d.dias, nota: d.porque }).eq("id", d.id);
  }
  let puestas = 0;
  if (dependencias.length) {
    const ids = actividades.map(a => a.id);
    // Se reemplazan, no se suman: pedirle el orden dos veces dejaría dos
    // cadenas encima de la misma obra y el cálculo tomaría la más larga.
    if (ids.length) {
      await supabase.from("cronograma_dependencias").delete().in("actividad_id", ids);
      await supabase.from("cronograma_dependencias").delete().in("depende_de_id", ids);
    }
    const filas = dependencias.map(d => ({
      actividad_id: d.a, depende_de_id: d.de, tipo: d.tipo || "FC", retardo: d.retardo || 0,
    }));
    const { data } = await supabase.from("cronograma_dependencias").insert(filas).select("id");
    puestas = data?.length || 0;
  }
  return { dias: duraciones.length, dependencias: puestas };
}
