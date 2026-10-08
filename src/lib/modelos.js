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
export const JUICIO = "claude-opus-5-5";

/**
 * LECTURA. Sacar datos de un documento que ya los tiene.
 *
 * Facturas, proformas, el Excel de un presupuesto. Es trabajo de volumen y de
 * precisión, no de criterio: el dato está en el papel. Acá importa acertar y
 * no inventar, y eso ya lo hace bien un modelo intermedio.
 */
export const LECTURA = "claude-sonnet-5-5";

/**
 * CORTO. Una frase que entra, una estructura que sale.
 *
 * "Tarea para Héctor, inspección mañana" → un objeto. Es casi parsing, pasa
 * muchas veces por día y la respuesta se ve al instante: lo que importa es que
 * conteste rápido.
 */
export const RAPIDO = "claude-haiku-5-5";
