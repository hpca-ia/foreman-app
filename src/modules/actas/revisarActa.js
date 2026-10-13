import { jsonTolerante } from "../../lib/jsonTolerante";
import { filtrar } from "./filtrarRevision";
import { JUICIO, pedirANova, textoDeNova, porQueFallo } from "../../lib/modelos";

// NOVA revisa el acta antes de que salga.
//
// Un acta la lee el cliente, la fiscalización y el contratista, con atención y
// buscando qué objetar. Y la escribió alguien apurado, al final de una reunión
// de dos horas. Esa distancia es el problema: lo que se le escapa al que
// escribe no se le escapa a los ocho que la reciben.
//
// SON DOS COSAS DISTINTAS Y SE DEVUELVEN APARTE:
//
// · Las CORRECCIONES de ortografía y redacción se aplican de un click. Son
//   mecánicas, no hay nada que decidir, y pedir una decisión por cada tilde es
//   garantizar que no se corrija ninguna.
//
// · Los AVISOS son agujeros que necesitan una decisión que NOVA no puede
//   tomar: un compromiso sin responsable, un tema que quedó sin resolver, una
//   fecha que cae antes de la reunión. Eso no se arregla escribiendo mejor: se
//   arregla preguntando, y hay que preguntarlo antes de enviar el acta, no
//   después.
//
// Lo que NO hace es cambiar lo que se dijo. Corrige cómo está escrito; el
// contenido es de quien estuvo en la reunión.

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export async function revisarActa({ acta, temas = [], compromisos = [], asistentes = [], obra = "" }) {
  if (!temas.length && !compromisos.length) {
    return { error: "El acta todavía no tiene ni temas ni compromisos que revisar." };
  }
  const fecha = acta?.fecha || new Date().toISOString().slice(0, 10);
  const d = new Date(`${fecha}T12:00:00`);
  const nombres = asistentes.filter(a => a.nombre).map(a => a.nombre);

  const comoEsta = [
    temas.map(t => `TEMA ${t.id} · título: ${t.titulo}\n  detalle: ${t.detalle || "(vacío)"}\n  resuelto: ${t.resuelto || "(VACÍO)"}`).join("\n"),
    compromisos.filter(c => c.estado !== "anulado").map(c =>
      `COMPROMISO ${c.id} · ${c.texto}\n  responsable: ${c.responsable_nombre || "(VACÍO)"} · para: ${c.fecha_limite || "(VACÍO)"}`).join("\n"),
    acta?.avance_nota ? `AVANCE ${acta.id} · ${acta.avance_nota}` : "",
    acta?.resumen ? `RESUMEN ${acta.id} · ${acta.resumen}` : "",
  ].filter(Boolean).join("\n\n");

  try {
    const sistema = `Sos NOVA y revisás un acta de reunión de obra${obra ? ` de "${obra}"` : ""} ANTES de que se
envíe. La van a leer el cliente, la fiscalización y el contratista, con
atención y buscando qué objetar; la escribió alguien apurado al final de una
reunión de dos horas.

LA REUNIÓN FUE EL ${DIAS[d.getDay()]} ${fecha}.
${nombres.length ? `EN LA REUNIÓN ESTUVIERON: ${nombres.join(" · ")}\n` : ""}
EL ACTA COMO ESTÁ:
"""
${comoEsta.slice(0, 12000)}
"""

Devolvés SOLO JSON, sin markdown:

{"correcciones":[{"tipo":"tema","id":12,"campo":"detalle","texto":"La ventanería se atrasa dos semanas.","porque":"ortografía y puntuación"}],
 "avisos":[{"donde":"Compromiso: pedir la proforma","que":"No dice quién lo hace","hacer":"Preguntar en la reunión quién queda a cargo"}]}

LAS CORRECCIONES son de ORTOGRAFÍA, TILDES, PUNTUACIÓN Y REDACCIÓN. Devolvés
el campo entero ya corregido en "texto". Campos posibles: para un tema
"titulo", "detalle" o "resuelto"; para un compromiso "texto"; para el acta
"avance_nota" o "resumen".

CÓMO SE CORRIGE UN ACTA, que no es como se corrige cualquier texto:

· Arreglá las faltas, las tildes y la puntuación, siempre.
· Pasá a frases completas lo que está en telegrama: "proveedor avisa atraso 2
  sem" es una nota, no un acta. "El proveedor avisó un atraso de dos semanas"
  es un acta.
· Castellano de Ecuador, en pasado y en tercera persona, que es como se
  escriben las actas: "se acordó", "el contratista informó", "se resolvió".
· NO CAMBIES LO QUE SE DIJO. Ni suavices, ni agregues, ni saques. Si dice que
  el contratista incumplió, el acta dice que incumplió: un acta no es un
  documento diplomático, es un registro. Corregís CÓMO está escrito, no QUÉ
  dice.
· Si un campo ya está bien, no lo devuelvas. Una corrección que no corrige
  nada hace que uno deje de mirar las que sí.

LOS AVISOS son agujeros que alguien tiene que ir a preguntar antes de enviar
el acta. Buscá exactamente esto:

· un compromiso SIN RESPONSABLE o SIN FECHA. Es lo más común y lo más caro:
  un compromiso sin dueño no se puede reclamar en la próxima reunión;
· un tema del que se habló y NO SE RESOLVIÓ NADA. Puede ser correcto —a veces
  solo se informa— pero conviene que quien manda el acta lo sepa;
· una fecha IMPOSIBLE: anterior a la reunión, o un domingo;
· dos compromisos que DICEN LO MISMO con otras palabras;
· un acuerdo AMBIGUO: "se revisará el tema", "se coordinará con el proveedor".
  Quién, y para cuándo. Eso en un acta no se puede reclamar;
· un responsable que NO ESTUVO EN LA REUNIÓN y tampoco se nombró como ausente:
  alguien se comprometió por él.

Si no encontrás nada, devolvé las dos listas vacías. No inventes avisos para
parecer útil: un acta que está bien tiene que poder salir sin discusión.`;

    const { res, data } = await pedirANova({
      model: JUICIO, max_tokens: 6000,
      system: sistema,
      messages: [{ role: "user", content: "Revisá el acta. Solo JSON." }],
    });
    if (!res.ok || data?.error) return { error: porQueFallo(res, data, "revisarla") };
    const { datos } = jsonTolerante(textoDeNova(data));
    if (!datos) return { error: "NOVA devolvió algo que no se entiende. Probá de nuevo." };
    return filtrar(datos, { temas, compromisos, acta });
  } catch (e) {
    return { error: "NOVA devolvió algo que no se entiende: " + e.message };
  }
}

export { filtrar };
