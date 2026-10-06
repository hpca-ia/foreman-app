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

export async function proponerCronograma({ agrupaciones = [], meses = 6, dias: diasPlazo = 0, nombreObra = "", cal = calendario() }) {
  if (!agrupaciones.length) {
    return { error: "Esta obra todavía no tiene agrupaciones. Se arman en Control de Obra → Agrupaciones." };
  }
  if (!meses) return { error: "Falta el plazo del proyecto: cuántos meses dura la obra." };
  const { memoria } = await leerMemoria("cronograma");
  // Los días los cuenta el calendario de la obra, que sabe de domingos y
  // feriados. La regla de tres de "26 días por mes" daba de más y era parte de
  // por qué el cronograma no terminaba de coincidir con el plazo.
  const dias = diasPlazo || Math.max(20, Math.round(meses * 26));

  const sistema = `Eres NOVA y armas el cronograma de obra de una constructora en Ecuador.
${memoriaEnPalabras(memoria)}

La obra "${nombreObra}" dura ${meses} meses, que son unos ${dias} días de trabajo (lunes a sábado).

AGRUPACIONES del presupuesto (id · nombre · monto):
${agrupaciones.map(a => `${a.id} · ${a.nombre} · ${Math.round(a.monto)}`).join("\n")}

Devuelves SOLO JSON, sin markdown:
{"actividades":[{"ref":1,"agrupacion_id":12,"nombre":"Excavación y cimentación","duracion":18,"etapa":"ejecucion","peso":100,"porque":"..."}],
 "dependencias":[{"de":1,"a":2,"tipo":"FC","retardo":0,"porque":"..."},
                 {"de":2,"a":3,"tipo":"FC","retardo":-5,"porque":"la mampostería entra antes de que termine la estructura"}]}

ACTIVIDADES: partí cada agrupación en una a cuatro actividades según su peso y
su naturaleza. Una agrupación de 200 mil no es una barra sola. "duracion" en
días HÁBILES. "ref" es un número tuyo, de 1 en adelante, para referirte a ellas
en las dependencias. "agrupacion_id" es el id de la agrupación de la que sale.

ETAPAS Y PLATA. Lo que se importa o se fabrica no pasa en un momento: se
anticipa, se fabrica, llega y se instala. Son etapas separadas en el tiempo y
cada una se lleva una parte del dinero.

  "etapa": anticipo | fabricacion | entrega | instalacion | ejecucion
  "peso": qué porcentaje de la plata de SU agrupación le toca a esta actividad.

Las actividades de una misma agrupación tienen que sumar 100 de peso. Lo que se
ejecuta y se paga mientras se hace es una sola actividad con etapa "ejecucion"
y peso 100 — ese es el caso normal y no hay que partirlo.

Para lo importado o fabricado, partilo de verdad: el anticipo es una actividad
CORTA (uno o dos días, es un pago) y va MESES antes de la instalación; entre
medio la fabricación, que es larga y no ocupa gente en obra; y la instalación al
final, encadenada a lo que la permita. Ejemplo típico de una ventanería:
anticipo 50% el día 1, fabricación 40% durante 60 días, instalación 10% cuando
la obra está cerrada.

Esto es lo que después deja que el cronograma y el valorado digan lo mismo: la
plata cae en los meses en que de verdad sale, no repartida pareja.

DEPENDENCIAS: "de" termina antes de que empiece "a". Usá el orden real de una
obra, no el orden de la lista:
· movimiento de tierra y cimentación primero
· estructura después, piso por piso si la obra tiene varios
· mampostería detrás de la estructura, y puede ir solapada con los pisos de arriba
· instalaciones ANTES de enlucidos: si van después hay que picar
· enlucidos, contrapisos y cielos rasos después de instalaciones
· carpintería y acabados al final, con el edificio cerrado
· limpieza y entrega al último

TIPO Y RETARDO de cada dependencia, que es como se dice de verdad cómo se
encadena una obra:

  "tipo": "FC" fin→comienzo (la normal), "CC" comienzo→comienzo (arrancan
  juntas o con unos días de desfase), "FF" fin→fin (terminan juntas).

  "retardo" en días hábiles. POSITIVO es una espera real —el fragüe del
  hormigón antes de desencofrar, el secado del empaste antes de pintar—.
  NEGATIVO es un TRASLAPE: la actividad arranca antes de que termine la otra,
  que es lo que pasa todo el tiempo en obra. La mampostería de planta baja
  entra cuando arriba todavía se está fundiendo; el enlucido empieza por donde
  ya se cerró. Usalo: un cronograma sin traslapes da una obra mucho más larga
  de lo que es.

Lo que puede ir en paralelo, ponelo en paralelo. Pero no inventes dependencias
para rellenar: si dos cosas no se traban, no las trabes.

EL PLAZO MANDA. La obra tiene que salir en ${dias} días hábiles, que es lo que
dice el contrato. No es una sugerencia: si tus duraciones dan mucho más, no
alargues la obra — acortá las actividades, traslapá lo que se traslapa en la
realidad, y poné en paralelo lo que no se traba. Si dan mucho menos, no las
estires sin motivo: dales el tiempo que de verdad llevan y dejá el resto como
holgura.

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
      etapa: ["anticipo", "fabricacion", "entrega", "instalacion", "ejecucion"].includes(a.etapa) ? a.etapa : "ejecucion",
      peso: n(a.peso),
      agrupacion_id: porAgrup.has(Number(a.agrupacion_id)) ? Number(a.agrupacion_id) : null,
      porque: a.porque || "",
      orden: i,
    }));
  const refs = new Set(actividades.map(a => a.ref));

  // Los pesos de cada agrupación tienen que cerrar en 100: si no, la plata de
  // esa agrupación entra de menos o de más al valorado y el total deja de dar
  // el presupuesto. Lo que falte o sobre se ajusta en la etapa más grande, que
  // es la que menos se nota y la que de verdad absorbe el resto en obra.
  const etapasDe = new Map();
  actividades.forEach(a => {
    if (!a.agrupacion_id) return;
    if (!etapasDe.has(a.agrupacion_id)) etapasDe.set(a.agrupacion_id, []);
    etapasDe.get(a.agrupacion_id).push(a);
  });
  etapasDe.forEach(grupo => {
    const suma = grupo.reduce((t, x) => t + n(x.peso), 0);
    if (!suma) { grupo.forEach(x => { x.peso = Math.round((100 / grupo.length) * 100) / 100; }); return; }
    if (Math.abs(suma - 100) < 0.01) return;
    const mayor = grupo.reduce((a, b) => (n(a.peso) >= n(b.peso) ? a : b));
    mayor.peso = Math.round((n(mayor.peso) + (100 - suma)) * 100) / 100;
  });
  actividades.filter(a => !a.agrupacion_id).forEach(a => { a.peso = n(a.peso) || 0; });

  let dependencias = (p.dependencias || [])
    .filter(d => refs.has(Number(d.de)) && refs.has(Number(d.a)) && Number(d.de) !== Number(d.a))
    .map(d => ({
      de: Number(d.de), a: Number(d.a),
      tipo: ["FC", "CC", "FF"].includes(d.tipo) ? d.tipo : "FC",
      // El retardo negativo es el traslape y antes se aplastaba a cero, que
      // era tirar justo lo que hace que una obra entre en su plazo. El tope de
      // 365 es contra un número absurdo, no contra el signo.
      retardo: Math.max(-365, Math.min(365, Math.round(n(d.retardo)))),
      porque: d.porque || "",
    }));

  // Se prueban contra el cálculo de verdad: si quedan círculos, se van las
  // dependencias que los cierran, una por una, hasta que todo tenga fecha.
  let intento = 0;
  while (intento++ < 30) {
    const plan = calcular({
      actividades: actividades.map(a => ({ id: a.ref, duracion: a.duracion })),
      // Con el tipo puesto: sin él, la duración que se le muestra a la
      // persona se calculaba tratando todo como fin→comienzo, y entonces el
      // número de días de la propuesta no era el que iba a salir al guardarla.
      dependencias: dependencias.map(d => ({ actividad_id: d.a, depende_de_id: d.de, tipo: d.tipo, retardo: d.retardo })),
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
    etapa: a.etapa || "ejecucion", peso_pct: a.peso ?? null,
  }));
  let { data: creadas, error } = await supabase.from("cronograma_actividades").insert(filas).select();
  // Sin la 083 no existen etapa ni peso: el cronograma entra igual, y lo que
  // se pierde es poder derivar el valorado de él.
  if (error && /column|schema cache/i.test(error.message)) {
    const limpias = filas.map(({ etapa, peso_pct, ...resto }) => resto);
    ({ data: creadas, error } = await supabase.from("cronograma_actividades").insert(limpias).select());
  }
  if (error) return { error: /schema cache|does not exist/i.test(error.message) ? "Falta correr la migración 076." : error.message };

  // De la referencia de NOVA al id de la base.
  const porRef = new Map(propuesta.actividades.map((a, i) => [a.ref, creadas[i]?.id]));
  const deps = propuesta.dependencias
    .map(d => ({ actividad_id: porRef.get(d.a), depende_de_id: porRef.get(d.de), tipo: d.tipo || "FC", retardo: d.retardo }))
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
