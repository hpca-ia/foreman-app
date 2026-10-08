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
