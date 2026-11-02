import { revisarLectura, comoQuedo } from "./aritmetica.js";

/**
 * LEER, COMPROBAR, Y SI NO CUADRA VOLVER A LEER DICIENDO QUÉ NO CUADRÓ.
 *
 * Hasta acá la lectura era de una sola vuelta: el modelo transcribía, la
 * aritmética comprobaba, y si no cerraba se guardaba igual con una advertencia
 * arriba. La advertencia la lee quien la lee, y el número mal leído sigue su
 * camino al contrato, al control y a los beneficios.
 *
 * Un renglón que falta o un subtotal que entró como renglón son cosas que el
 * modelo arregla si se le dice CUÁL es: "lo que leíste suma $14.927 y el papel
 * dice $16.200, faltan $1.273" es información que no tenía en la primera
 * pasada, porque el pie lo lee aparte. Insistir con eso en la mano es lo que
 * baja los errores, y es más barato que seguir escribiendo una regla nueva por
 * cada proveedor con un encabezado raro: esas reglas tienen superficie infinita
 * y cada formato nuevo rompe otra.
 *
 * Lo que NO se delega es quién decide si la lectura sirve. El modelo propone
 * tantas veces como haga falta; la que acepta es `revisarLectura`, que compara
 * contra el pie del papel y no contra lo que el modelo opina de sí mismo. Un
 * agente que lee y se autocalifica es un modelo confiado. Por eso este archivo
 * es puro: el lazo decide con las mismas reglas siempre y se puede probar sin
 * hablar con nadie.
 */

// Tres vueltas. La primera lee, la segunda corrige lo que la aritmética marcó,
// la tercera es la que pesca el caso raro. De ahí en adelante el modelo empieza
// a repetir la misma lectura y lo único que se gana es demora.
export const VUELTAS = 3;

const plata = v => `$${(Math.round((Number(v) || 0) * 100) / 100).toFixed(2)}`;

/**
 * Qué se le dice al modelo para que lea otra vez. Null si no hay nada que
 * reclamar —o si no hay con qué comprobar, que no es lo mismo que estar bien
 * pero tampoco es algo que el modelo pueda arreglar leyendo de nuevo.
 */
export function reclamo(revision) {
  if (!revision || comoQuedo(revision) === "cuadra") return null;
  const partes = [];

  if (revision.cuadra === false) {
    const falta = Number(revision.falta) || 0;
    partes.push(
      `La lectura anterior no cuadra con el papel. Los ${revision.renglones} renglones que `
      + `transcribiste suman ${plata(revision.suman)} y el papel dice ${plata(revision.esperado)}.`
    );
    partes.push(falta > 0
      ? `Faltan ${plata(falta)}: quedó al menos un renglón sin transcribir. Fijate si hay `
        + `renglones después de donde cortaste, si el documento sigue en otra hoja o en otra `
        + `página, y si algún renglón trae su precio en una columna distinta a los demás.`
      : `Sobran ${plata(Math.abs(falta))}: entró algo que no es un renglón que se compra. `
        + `Suele ser un subtotal de capítulo, un título que lleva monto al lado, el total `
        + `escrito en letras al pie, o un renglón transcrito dos veces.`);
  }

  if (revision.malos?.length) {
    partes.push(
      `${revision.malos.length} ${revision.malos.length === 1 ? "renglón no multiplica" : "renglones no multiplican"}: `
      + `cantidad por precio unitario no da el total que le pusiste. `
      + revision.malos.slice(0, 6).map(m =>
          `«${m.descripcion}» da ${plata(m.dice)} y le pusiste ${plata(m.pero)}`).join("; ")
      + `. Volvé a mirar esos tres números en el papel: el equivocado puede ser cualquiera `
      + `de los tres, y el que manda es el que está impreso.`
    );
  }

  partes.push("Transcribí de nuevo TODOS los renglones, completos. No corrijas los números para que cierren: copiá lo que dice el papel.");
  return partes.join(" ");
}

/**
 * De dos lecturas del mismo papel, cuál vale más. Cuadrar manda sobre todo lo
 * demás; después, la que tiene menos renglones que no multiplican; después, la
 * que quedó más cerca del subtotal del papel.
 *
 * No se mezclan dos lecturas para armar una tercera: eso sería inventar un
 * documento que nadie firmó.
 */
export function laMejor(a, b) {
  if (!a) return b;
  if (!b) return a;
  const okA = comoQuedo(a.revision) === "cuadra", okB = comoQuedo(b.revision) === "cuadra";
  if (okA !== okB) return okA ? a : b;
  const malosA = a.revision.malos?.length || 0, malosB = b.revision.malos?.length || 0;
  if (malosA !== malosB) return malosA < malosB ? a : b;
  const fA = a.revision.falta == null ? Infinity : Math.abs(a.revision.falta);
  const fB = b.revision.falta == null ? Infinity : Math.abs(b.revision.falta);
  if (fA !== fB) return fA < fB ? a : b;
  return a;
}

/**
 * El lazo.
 *
 * @param leer     (reclamo) => { items, totales, descuento }. La vuelta que
 *                 habla con el modelo. En la primera llega con `null`.
 * @param vueltas  cuántas veces como máximo.
 * @param onPaso   para contar en pantalla qué está pasando.
 *
 * @returns { items, totales, descuento, revision, vuelta, vueltas, cerro,
 *            historia }. `cerro` dice si la lectura que se devuelve pasó la
 *            comprobación. Si es false, la lectura NO se guarda sola: va a la
 *            pantalla con la diferencia a la vista para que la mire alguien.
 */
export async function leerHastaQueCuadre({ leer, vueltas = VUELTAS, onPaso } = {}) {
  let mejor = null;
  const historia = [];

  for (let vuelta = 1; vuelta <= vueltas; vuelta++) {
    const queReclamar = vuelta === 1 ? null : reclamo(mejor?.revision);
    if (vuelta > 1) onPaso?.(`La lectura no cuadraba. Leyendo de nuevo (vuelta ${vuelta} de ${vueltas})…`);

    const lectura = await leer(queReclamar);
    const { items = [], totales = null, descuento = 0 } = lectura || {};
    const revision = revisarLectura(items, totales, descuento);
    const intento = { ...lectura, items, totales, descuento, revision, vuelta };

    historia.push({ vuelta, renglones: revision.renglones, suman: revision.suman,
      falta: revision.falta, malos: revision.malos?.length || 0,
      quedo: comoQuedo(revision), reclamo: queReclamar });
    mejor = laMejor(mejor, intento);

    // Cuadró: no hay nada que ganar leyendo otra vez.
    if (comoQuedo(revision) === "cuadra") break;
    // El papel no trae subtotal: no hay contra qué comprobar, y volver a leer
    // sería pedirle al modelo que adivine distinto. Eso lo mira una persona.
    if (comoQuedo(revision) === "sin-comprobar") break;
  }

  const quedo = comoQuedo(mejor?.revision);
  return { ...mejor, quedo, cerro: quedo === "cuadra", vueltas, historia };
}
