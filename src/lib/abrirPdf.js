// Mostrar un PDF recién armado, en cualquier aparato.
//
// `window.open` con un blob funciona en una computadora y falla en el teléfono:
// Safari y Chrome en móvil bloquean las ventanas nuevas que no salen de un
// toque directo, y aunque la dejen pasar, muchas no saben mostrar un blob. Lo
// que se ve del otro lado es que el botón no hace nada — y en obra, donde la
// mitad de las pantallas son teléfonos, eso es que la función no existe.
//
// Acá se intenta abrir y, si no se puede, se BAJA el archivo. Bajar siempre
// funciona: el teléfono lo guarda y lo abre con su visor, que además es lo que
// uno quiere para mandarlo por WhatsApp.

export function mostrarPdf(doc, nombre, modo = "abrir") {
  if (modo === "bajar") { doc.save(nombre); return "bajado"; }
  if (modo === "imprimir") doc.autoPrint();
  try {
    const url = doc.output("bloburl");
    const v = window.open(url, "_blank", "noopener");
    // `null` es la ventana bloqueada. Hay navegadores que devuelven una
    // ventana que se cierra sola; eso no se puede detectar y por eso igual
    // conviene que el botón diga qué va a pasar.
    if (v) return "abierto";
  } catch { /* sin ventana, se baja */ }
  doc.save(nombre);
  return "bajado";
}
