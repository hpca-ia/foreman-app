// Qué modelo usa NOVA del lado del servidor.
//
// Gemelo de src/lib/modelos.js, que es el del navegador: una función de /api no
// puede importar de src/. El criterio es el mismo —leer un documento no es lo
// mismo que razonar— y si uno cambia, el otro también.

// Razonar: agrupar las secciones de un presupuesto ajeno en rubros, decidir qué
// va con qué. Es la decisión que después manda sobre el control entero.
// De vuelta en el conocido: ver la nota en src/lib/modelos.js.
export const JUICIO = "claude-opus-5-5";

// Leer: sacar los subtotales de un PDF, armar el resumen del día con datos que
// ya están. Volumen y precisión, no criterio.
export const LECTURA = "claude-sonnet-5-5";

// El que nunca falló de este lado. Es a donde cae cualquier llamada cuyo modelo
// la cuenta rechace: por WhatsApp no hay pantalla donde ver un error, y NOVA
// muda es peor que NOVA contestando con el modelo anterior.
export const CONOCIDO = "claude-sonnet-4-5";
