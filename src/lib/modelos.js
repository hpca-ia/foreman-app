// Qué modelo usa NOVA para cada cosa.
//
// Vivía escrito a mano en diecinueve archivos, y por eso todos se quedaron en
// `claude-sonnet-4-5` —una generación entera atrás— sin que nadie lo notara:
// nadie abre diecinueve archivos para revisar una constante. Acá se decide una
// vez y se cambia una vez.
//
// NO ES EL MISMO TRABAJO. Leer una factura y sacarle el RUC es extracción:
// está escrito en el papel y lo que hace falta es no equivocarse. Armar un
// cronograma es criterio: hay que sacar rendimientos de memoria, deducir el
// orden real de una obra que no se vio y decidir qué se traslapa con qué. Usar
// el mismo modelo para las dos cosas es pagar de más en una y quedarse corto
// en la otra.

/**
 * CRITERIO. Lo que hay que razonar, no leer.
 *
 * El cronograma, el plan económico y las agrupaciones del control. Son
 * decisiones que después mandan sobre todo lo demás —la agrupación del control
 * manda en el cronograma, el cronograma manda en el valorado— y se hacen una
 * vez por obra. El costo del modelo bueno acá es despreciable contra el de
 * revisar a mano algo mal pensado.
 */

// PROBADO EN CARNE PROPIA: cambiar los tres de un saque dejó a NOVA sin hacer
// nada en TODAS las pantallas —facturas, presupuestos, briefing, cronograma—,
// porque todas pasan por acá. Si un identificador de modelo no está habilitado
// en la cuenta, no falla una pantalla: fallan todas a la vez.
//
// Por eso lo nuevo entra de a una pantalla, y SIEMPRE con respaldo: si la
// cuenta lo rechaza, se reintenta con el conocido. NOVA puede contestar peor;
// lo que no puede es quedarse muda.
export const JUICIO = "claude-opus-5-5";

// El que se sabe que funciona. Es a donde cae cualquier llamada cuyo modelo la
// cuenta no acepte.
export const CONOCIDO = "claude-sonnet-4-5";

/**
 * Pedirle algo a NOVA con un modelo y, si ese modelo no está disponible,
 * reintentar con el conocido.
 *
 * Solo reintenta cuando el error habla del MODELO. Un error de verdad —la
 * sesión vencida, la API caída, un JSON mal armado— se devuelve tal cual: dos
 * intentos de lo mismo no lo arreglan y esconderlo sería peor.
 */
export async function pedirANova(cuerpo, respaldo = CONOCIDO) {
  const llamar = async model => {
    const res = await fetch("/api/nova", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...cuerpo, model }),
    });
    let data = null;
    try { data = await res.json(); } catch { /* respuesta no-JSON */ }
    return { res, data };
  };

  const primero = await llamar(cuerpo.model || respaldo);
  // EL ERROR SE BUSCA EN EL CUERPO, no en el estado. La puerta de NOVA devolvía
  // 200 aunque la API fallara, con el error adentro; ya se arregló, pero
  // mirar las dos cosas cuesta nada y cubre un despliegue a medias.
  const falló = !primero.res.ok || !!primero.data?.error || primero.data?.type === "error";
  const texto = JSON.stringify(primero.data?.error || primero.data || "");
  const esDelModelo = falló
    && /model|not_found|not found|permission|unsupported|invalid_request/i.test(texto);
  if (!esDelModelo || (cuerpo.model || respaldo) === respaldo) {
    return { ...primero, modelo: cuerpo.model || respaldo };
  }
  const segundo = await llamar(respaldo);
  return { ...segundo, modelo: respaldo, cayoAlRespaldo: true };
}


/**
 * POR QUÉ FALLÓ, en una frase que sirva.
 *
 * "NOVA no pudo armarlo" es lo que se mostraba cuando la respuesta venía mal y
 * no traía un mensaje adentro, que es justo el caso en que uno más necesita
 * saber: un 504 de Vercel —la función tardó más de lo que la deja tardar— no
 * devuelve JSON sino una página, y entonces no hay `error.message` que leer.
 * El resultado era un cartel rojo sin ninguna información y nada que probar.
 *
 * Con el estado en la mano se distingue en dos segundos: 401 es la sesión,
 * 504 o 502 es que tardó demasiado, 429 es el límite de la cuenta, 500 es la
 * puerta. Son arreglos distintos.
 */
export function porQueFallo(res, data, quehacer = "armarlo") {
  const dentro = data?.error?.message || (typeof data?.error === "string" ? data.error : "");
  if (dentro) return dentro;
  const e = res?.status;
  if (e === 401) return "Tu sesión venció. Volvé a entrar a FOREMAN.";
  if (e === 429) return "NOVA está en el límite de pedidos de la cuenta. Esperá un minuto y probá de nuevo.";
  if (e === 504 || e === 502 || e === 408) {
    return "NOVA tardó más de lo que el servidor la deja tardar y la cortaron a mitad de camino. "
      + "Pasa en obras con muchas agrupaciones. Probá de nuevo; si vuelve a pasar, armalo del control "
      + "y pedile las duraciones después.";
  }
  if (e >= 500) return `La puerta de NOVA falló (error ${e}). Probá de nuevo en un minuto.`;
  const crudo = JSON.stringify(data ?? "").slice(0, 160);
  return `NOVA no pudo ${quehacer} (${e || "sin respuesta"}).${crudo && crudo !== '""' ? ` Devolvió: ${crudo}` : ""}`;
}

/**
 * LECTURA. Sacar datos de un documento que ya los tiene.
 *
 * Facturas, proformas, el Excel de un presupuesto. Es trabajo de volumen y de
 * precisión, no de criterio: el dato está en el papel. Acá importa acertar y
 * no inventar, y eso ya lo hace bien un modelo intermedio.
 */
export const LECTURA = "claude-sonnet-4-5";

/**
 * CORTO. Una frase que entra, una estructura que sale.
 *
 * "Tarea para Héctor, inspección mañana" → un objeto. Es casi parsing, pasa
 * muchas veces por día y la respuesta se ve al instante: lo que importa es que
 * conteste rápido.
 */
export const RAPIDO = "claude-sonnet-4-5";

/**
 * El TEXTO de una respuesta de NOVA.
 *
 * No es `content[0].text`, y eso costó caro. Un modelo con razonamiento
 * extendido devuelve primero un bloque `{"type":"thinking"}` y el texto viene
 * después; leyendo el primero se obtiene `undefined`, y de ahí salía "NOVA
 * devolvió algo que no se entiende" con una respuesta perfectamente buena del
 * otro lado. El modelo andaba: lo que no andaba era cómo se lo leía.
 *
 * Se busca el bloque de texto, se ignora lo demás, y si hay varios se pegan:
 * una respuesta larga puede venir partida.
 */
export function textoDeNova(data) {
  const bloques = data?.content;
  if (typeof bloques === "string") return bloques;
  if (!Array.isArray(bloques)) return "";
  return bloques
    .filter(b => b?.type === "text" && typeof b.text === "string")
    .map(b => b.text)
    .join("")
    // Sin bloques de texto: puede ser una respuesta vieja sin `type`.
    || (typeof bloques[0]?.text === "string" ? bloques[0].text : "");
}
