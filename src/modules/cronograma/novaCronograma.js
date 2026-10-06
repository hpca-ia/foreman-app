import { supabase } from "../../lib/supabase";
import { calcular, calendario } from "./cpm";
import { leerMemoria, memoriaEnPalabras, recordar } from "./memoriaNova";

// NOVA arma el cronograma de la obra desde las agrupaciones del presupuesto.
//
// Las agrupaciones ya son la respuesta a "¿qué hay que hacer?" —obra civil,
// instalaciones, acabados— con su plata adentro. Lo que falta es el orden y la
// duración, y eso es saber de obra: que la estructura va antes que la
// mampostería, que las instalaciones se meten antes del enlucido o hay que
// picar, que los acabados no arrancan hasta que el edificio esté cerrado.
//
// Eso no sale de ningún dato. Sale de haber hecho obras, y es exactamente lo
// que NOVA puede aportar.
//
// LO QUE DEVUELVE ES UN BORRADOR, Y SE TRABAJA ENCIMA. El residente mueve
// duraciones y dependencias desde la obra, y la ruta crítica se recalcula
// sola porque se calcula al dibujar, no se guarda. Un cronograma que hay que
// "regenerar" para que diga la verdad es un cronograma que se mira una vez.
//
// Y ES EL MISMO ESQUELETO QUE EL VALORADO: cada actividad cuelga de la
// agrupación de la que salió, así que el tiempo y la plata hablan de las
// mismas cosas. Sin eso, el Gantt dice "mampostería en marzo" y el valorado
// dice otra cosa, y no hay forma de saber cuál de los dos está viejo.

const n = v => Number(v) || 0;

/** Lo que la obra ya tiene agrupado, con su plata. */
export async function materiaPrima(obraId) {
  const [{ data: acts }, { data: rubros }] = await Promise.all([
    supabase.from("obra_actividades").select("id,codigo,nombre,orden,extra").eq("obra_id", obraId).order("orden"),
    supabase.from("obra_rubros").select("id,actividad_id,total_base,capitulo,descripcion").eq("obra_id", obraId),
  ]);
  const plata = new Map();
  (rubros || []).forEach(r => {
    if (r.actividad_id == null) return;
    plata.set(r.actividad_id, (plata.get(r.actividad_id) || 0) + n(r.total_base));
  });
  return (acts || [])
    // Las extras —salarios, oficina, logística— no son actividades de obra:
    // no se ejecutan, se gastan. Ponerlas en el Gantt lo llena de barras que
    // nadie puede empezar ni terminar.
    .filter(a => !a.extra)
    .map(a => ({ ...a, monto: Math.round((plata.get(a.id) || 0) * 100) / 100 }));
}

export async function proponerCronograma({ agrupaciones = [], meses = 6, nombreObra = "", cal = calendario() }) {
  if (!agrupaciones.length) {
    return { error: "Esta obra todavía no tiene agrupaciones. Se arman en Control de Obra → Agrupaciones." };
  }
  const { memoria } = await leerMemoria("cronograma");
  const dias = Math.max(20, Math.round(meses * 26));   // días hábiles, de lunes a sábado

  const sistema = `Eres NOVA y armas el cronograma de obra de una constructora en Ecuador.
${memoriaEnPalabras(memoria)}

La obra "${nombreObra}" dura ${meses} meses, que son unos ${dias} días de trabajo (lunes a sábado).

AGRUPACIONES del presupuesto (id · nombre · monto):
${agrupaciones.map(a => `${a.id} · ${a.nombre} · ${Math.round(a.monto)}`).join("\n")}

Devuelves SOLO JSON, sin markdown:
{"actividades":[{"ref":1,"agrupacion_id":12,"nombre":"Excavación y cimentación","duracion":18,"porque":"..."}],
 "dependencias":[{"de":1,"a":2,"retardo":0,"porque":"..."}]}

ACTIVIDADES: partí cada agrupación en una a cuatro actividades según su peso y
su naturaleza. Una agrupación de 200 mil no es una barra sola. "duracion" en
días HÁBILES. "ref" es un número tuyo, de 1 en adelante, para referirte a ellas
en las dependencias. "agrupacion_id" es el id de la agrupación de la que sale.

DEPENDENCIAS: "de" termina antes de que empiece "a". Usá el orden real de una
obra, no el orden de la lista:
· movimiento de tierra y cimentación primero
· estructura después, piso por piso si la obra tiene varios
· mampostería detrás de la estructura, y puede ir solapada con los pisos de arriba
· instalaciones ANTES de enlucidos: si van después hay que picar
· enlucidos, contrapisos y cielos rasos después de instalaciones
· carpintería y acabados al final, con el edificio cerrado
· limpieza y entrega al último

"retardo" en días para las esperas reales: el fragüe del hormigón antes de
desencofrar, el secado de un empaste antes de pintar.

Lo que puede ir en paralelo, ponelo en paralelo: un cronograma donde todo va
en fila da una obra el doble de larga de lo que es. Pero no inventes
dependencias para rellenar: si dos cosas no se traban, no las trabes.

La suma de la cadena más larga tiene que acercarse a ${dias} días hábiles sin
pasarse mucho: ese es el plazo de la obra.

"porque" en una línea, en español, para quien revisa.`;

  try {
    const res = await fetch("/api/nova", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5", max_tokens: 4000,
        system: sistema,
        messages: [{ role: "user", content: `Armá el cronograma de ${meses} meses. Solo JSON.` }],
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) return { error: data.error?.message || "NOVA no pudo armarlo." };
    const txt = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
    const p = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]);
    return ordenar(p, agrupaciones, cal);
  } catch (e) {
    return { error: "NOVA devolvió algo que no se entiende: " + e.message };
  }
}

/**
 * Limpiar lo que vino y comprobar que se pueda calcular.
 *
 * Nada se guarda sin verificar. Una dependencia que apunta a una actividad que
 * no existe se tira; un círculo —A espera a B que espera a A— se corta en la
 * dependencia que lo cierra, porque un cronograma con un círculo no tiene
 * fechas y la pantalla no podría dibujar nada.
 */
export function ordenar(p, agrupaciones, cal) {
  const porAgrup = new Map(agrupaciones.map(a => [Number(a.id), a]));
  const actividades = (p.actividades || [])
    .filter(a => String(a.nombre || "").trim())
    .map((a, i) => ({
      ref: Number(a.ref) || i + 1,
      nombre: String(a.nombre).trim().slice(0, 120),
      duracion: Math.max(1, Math.round(n(a.duracion)) || 5),
      agrupacion_id: porAgrup.has(Number(a.agrupacion_id)) ? Number(a.agrupacion_id) : null,
      porque: a.porque || "",
      orden: i,
    }));
  const refs = new Set(actividades.map(a => a.ref));

  let dependencias = (p.dependencias || [])
    .filter(d => refs.has(Number(d.de)) && refs.has(Number(d.a)) && Number(d.de) !== Number(d.a))
    .map(d => ({ de: Number(d.de), a: Number(d.a), retardo: Math.max(0, Math.round(n(d.retardo))), porque: d.porque || "" }));

  // Se prueban contra el cálculo de verdad: si quedan círculos, se van las
  // dependencias que los cierran, una por una, hasta que todo tenga fecha.
  let intento = 0;
  while (intento++ < 30) {
    const plan = calcular({
      actividades: actividades.map(a => ({ id: a.ref, duracion: a.duracion })),
      dependencias: dependencias.map(d => ({ actividad_id: d.a, depende_de_id: d.de, retardo: d.retardo })),
      inicio: new Date(), cal,
    });
    if (!plan.ciclos.length) {
      return {
        actividades, dependencias,
        dias: plan.duracion,
        criticas: plan.ruta.length,
        quitadas: intento - 1,
      };
    }
    const enCiclo = new Set(plan.ciclos);
    const i = dependencias.findIndex(d => enCiclo.has(d.a) && enCiclo.has(d.de));
    if (i < 0) break;
    dependencias.splice(i, 1);
  }
  return { actividades, dependencias, dias: 0, criticas: 0, quitadas: intento - 1 };
}

/** Guardarlo. Reemplaza lo que hubiera: es un borrador que se vuelve a armar. */
export async function guardarPropuesta({ lead, obra, propuesta, quien }) {
  const { data: previas } = await supabase.from("cronograma_actividades").select("id").eq("lead_id", lead.id);
  if (previas?.length) {
    await supabase.from("cronograma_dependencias").delete().in("actividad_id", previas.map(x => x.id));
    await supabase.from("cronograma_actividades").delete().eq("lead_id", lead.id);
  }

  const filas = propuesta.actividades.map(a => ({
    lead_id: lead.id, obra_id: obra?.id || null,
    nombre: a.nombre, duracion: a.duracion,
    obra_actividad_id: a.agrupacion_id, nota: a.porque || null, orden: a.orden,
  }));
  const { data: creadas, error } = await supabase.from("cronograma_actividades").insert(filas).select();
  if (error) return { error: /schema cache|does not exist/i.test(error.message) ? "Falta correr la migración 076." : error.message };

  // De la referencia de NOVA al id de la base.
  const porRef = new Map(propuesta.actividades.map((a, i) => [a.ref, creadas[i]?.id]));
  const deps = propuesta.dependencias
    .map(d => ({ actividad_id: porRef.get(d.a), depende_de_id: porRef.get(d.de), tipo: "FC", retardo: d.retardo }))
    .filter(d => d.actividad_id && d.depende_de_id);
  if (deps.length) await supabase.from("cronograma_dependencias").insert(deps);

  void quien;
  return { creadas: creadas.length, dependencias: deps.length };
}

/**
 * Lo que quedó después de que una persona lo corrigió, para la obra siguiente.
 *
 * Se aprende de lo que hay AHORA en la pantalla, no de lo que NOVA propuso: si
 * alguien le cambió la duración a la mampostería de 20 a 35 días, eso es lo
 * que vale. Aprender de la propuesta sería que NOVA se dé la razón sola.
 */
export async function aprenderDelCronograma(actividades = [], quien) {
  for (const a of actividades) {
    if (!a.nombre || !a.duracion) continue;
    await recordar({
      tema: "cronograma",
      descripcion: a.nombre,
      perfil: "duracion",
      pagos: null,
      anticipacion: Math.round(a.duracion),
      nota: `${Math.round(a.duracion)} días hábiles`,
      quien,
    });
  }
  return actividades.length;
}
