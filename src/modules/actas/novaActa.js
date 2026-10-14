import { jsonTolerante } from "../../lib/jsonTolerante";
import { normalizar } from "./ordenarActa";
import { JUICIO, pedirANova, textoDeNova, porQueFallo } from "../../lib/modelos";

// NOVA arma el acta de lo que se dictó.
//
// Escribir un acta después de la reunión lleva cuarenta minutos y se hace mal:
// se hace de memoria, dos días después, y lo que se pierde primero son los
// compromisos —quién queda en hacer qué y para cuándo— que son justamente lo
// único del acta que sirve para reclamar algo.
//
// Lo que sí se puede hacer es anotar al vuelo, mientras se habla, con las
// palabras que salgan. Eso NOVA lo ordena: separa los temas de los
// compromisos, le pone responsable y fecha a cada uno, y resuelve "el viernes"
// contra el calendario de verdad.
//
// LO QUE NO HACE ES INVENTAR. Si no se dijo quién, el compromiso queda sin
// responsable y lo dice. Un acta con un responsable adivinado es peor que una
// con un casillero vacío: el casillero vacío se llena en la reunión, el
// responsable equivocado se descubre cuando ya nadie hizo nada.

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export async function armarActa({ texto = "", asistentes = [], fecha, obra = "", pendientes = [] }) {
  const dicho = String(texto || "").trim();
  if (dicho.length < 20) return { error: "Escribí lo que se habló en la reunión, aunque sea en desorden." };

  const hoy = fecha || new Date().toISOString().slice(0, 10);
  const d = new Date(`${hoy}T12:00:00`);
  const nombres = asistentes.filter(a => a.nombre).map(a => a.nombre);

  try {
    const sistema = `Sos NOVA y ordenás lo que alguien anotó durante una reunión de obra${obra ? ` de "${obra}"` : ""}.

LA REUNIÓN FUE EL ${DIAS[d.getDay()]} ${hoy}. Con eso resolvés las fechas que se
digan en palabras: "el viernes" es el viernes siguiente a esa fecha, "la
próxima semana" el mismo día de la semana que viene, "fin de mes" el último
día hábil del mes. Devolvés siempre YYYY-MM-DD.
${nombres.length ? `
QUIÉNES ESTÁN EN LA REUNIÓN. El responsable de un compromiso casi siempre es
uno de ellos, y hay que escribirlo con el nombre de esta lista aunque en el
texto aparezca solo el primer nombre o el apodo:
${nombres.join(" · ")}
` : ""}${pendientes.length ? `
LO QUE VENÍA PENDIENTE de la reunión anterior. Si el texto dice algo sobre
alguno de estos, NO lo repitas como compromiso nuevo: ponelo en "repaso" con
su id y si se hizo o no.
${pendientes.map(p => `${p.id} · ${p.texto}${p.responsable_nombre ? ` (${p.responsable_nombre})` : ""}`).join("\\n")}
` : ""}
LO QUE SE ANOTÓ EN LA REUNIÓN:
"""
${dicho.slice(0, 8000)}
"""

Devolvés SOLO JSON, sin markdown:

{"temas":[{"titulo":"Ventanería","detalle":"El proveedor avisó que la fabricación se atrasa dos semanas","resuelto":"Se acepta la nueva fecha y se revisa el cronograma"}],
 "compromisos":[{"texto":"Pedir la proforma actualizada de ventanería","responsable":"Lizeth","fecha":"2026-10-17","urgente":true}],
 "repaso":[{"id":12,"hecho":true,"nota":""}],
 "avance":"La obra gris va al día; acabados arranca la próxima semana",
 "falta":["Nadie quedó a cargo de conseguir el permiso municipal"]}

CÓMO SE SEPARA.

UN TEMA es algo de lo que se habló. "detalle" es lo que se dijo y "resuelto"
es lo que se decidió, y son distintos: un acta que narra lo conversado no
sirve para decidir nada. Si de un tema no se resolvió nada, dejá "resuelto"
vacío — eso también es información, y es lo que después explica por qué algo
sigue dando vueltas.

UN COMPROMISO es alguien que va a hacer algo. Se reconoce porque hay una
acción y, casi siempre, una persona: "Lizeth pide la proforma", "el contratista
entrega el plano el jueves", "hay que llamar al proveedor". Si el texto dice
una acción sin decir quién, ponela igual con "responsable" vacío: el casillero
vacío se llena en la reunión; un responsable adivinado se descubre cuando ya
nadie hizo nada.

"urgente" es true cuando del texto se entiende que SI NO SE HACE, PARA LA OBRA:
"sin eso no podemos seguir", "hay que pagarlo ya o no arrancan la fabricación",
"es lo que nos está trabando". No lo pongas porque algo suene importante: lo
urgente es lo que detiene a los demás, y si todo es urgente nada lo es.

NO INVENTES NADA. Ni temas que no se nombraron, ni fechas que no se dijeron,
ni responsables. Si algo quedó al aire —una decisión sin dueño, un plazo sin
fecha— va en "falta", que es lo que quien escribe el acta tiene que ir a
preguntar antes de cerrarla.

"avance" solo si en el texto se habló de cómo va la obra. Si no, vacío.`;

    const { res, data } = await pedirANova({
      model: JUICIO, max_tokens: 6000,
      system: sistema,
      messages: [{ role: "user", content: "Ordená la reunión. Solo JSON." }],
    });
    if (!res.ok || data?.error) return { error: porQueFallo(res, data, "ordenar la reunión") };
    const { datos } = jsonTolerante(textoDeNova(data));
    if (!datos) return { error: "NOVA devolvió algo que no se entiende. Probá de nuevo." };
    return normalizar(datos, pendientes);
  } catch (e) {
    return { error: "NOVA devolvió algo que no se entiende: " + e.message };
  }
}

export { normalizar } from "./ordenarActa";
