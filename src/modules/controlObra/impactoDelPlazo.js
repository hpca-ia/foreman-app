// ¿ESTA ORDEN CORRE LA FECHA DE ENTREGA? SÍ, NO, O TODAVÍA NADIE LO DIJO.
//
// El campo era un texto libre, y un texto vacío se leía como "no hay impacto":
// el PDF imprimía "Sin impacto en el cronograma" cuando lo único cierto era que
// nadie había contestado. Esa frase viaja firmada al cliente, y el día que la
// obra se entrega tarde por ese mismo adicional, el papel dice lo contrario de
// lo que pasó.
//
// NO CONTESTADO Y "NO IMPACTA" NO SON LO MISMO, y la diferencia es de quién es
// la culpa del atraso. "No impacta" es una afirmación de la obra: alguien la
// pensó y se hace cargo. El vacío es una pregunta sin hacer, y lo que hay que
// mostrar ahí es la pregunta, no una respuesta inventada.
//
// Tres estados, entonces: sí, no, y sin definir. La nota es lo que explica
// cualquiera de los dos —por qué corre el plazo, o por qué no lo corre
// pudiendo— y los días solo tienen sentido cuando la respuesta es que sí.

const n = v => Number(v) || 0;

/**
 * Cómo está el plazo de esta orden.
 *
 * @returns { definido, impacta, dias, nota, frase, falta }
 */
export function impactoDelPlazo(orden) {
  const crudo = orden?.impacta_crono;
  const nota = String(orden?.impacto_cronograma || "").trim();
  const dias = n(orden?.dias_impacto);

  // LO VIEJO SE LEE COMO LO QUE QUISO DECIR. Las órdenes de antes de esto no
  // tienen la casilla, pero sí escribieron días o una nota: eso era alguien
  // contestando que sí con las herramientas que había.
  const definido = crudo === true || crudo === false || (crudo == null && (dias > 0 || !!nota));
  const impacta = crudo === true || (crudo == null && (dias > 0 || !!nota));

  let frase;
  if (!definido) frase = "Todavía no se dijo si corre el plazo de entrega.";
  else if (!impacta) frase = `No corre el plazo de entrega${nota ? `. ${nota}` : "."}`;
  else if (dias > 0) frase = `Corre el plazo ${dias} ${dias === 1 ? "día" : "días"}${nota ? `. ${nota}` : "."}`;
  else frase = nota || "Corre el plazo de entrega, sin estimar cuántos días.";

  return {
    definido, impacta, dias: impacta ? dias : 0, nota,
    frase,
    // Lo que le falta a esta orden para poder mandarse sin una pregunta abierta.
    falta: !definido ? "falta decir si corre el plazo"
      : impacta && !dias ? "dice que corre el plazo pero no cuántos días"
        : null,
  };
}

/** Para la lista y para el papel, en pocas palabras. */
export function enPocasPalabras(orden) {
  const i = impactoDelPlazo(orden);
  if (!i.definido) return "Plazo: sin definir";
  if (!i.impacta) return "No corre el plazo";
  return i.dias > 0 ? `+${i.dias} ${i.dias === 1 ? "día" : "días"} de plazo` : "Corre el plazo";
}
