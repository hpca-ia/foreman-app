// EL PIE DE TODO PDF DE FOREMAN: qué es, de qué proyecto y cuándo se emitió.
//
// Una hoja impresa se separa de las otras: se engrapa con la de otra obra, se
// manda por WhatsApp sola, se encuentra en una carpeta meses después. Si no
// dice qué es, de qué proyecto y de cuándo, no se sabe si es la vigente ni a
// qué obra pertenece. Cada PDF tenía su pie —uno con fecha, otro solo con el
// número de página, otros sin nada—; ahora todos llevan el mismo, en cada hoja.
//
// Funciona con documentos en milímetros o en puntos: los márgenes se piden en
// milímetros y se convierten a la unidad del documento.

// Lo que la letra del PDF no tiene se cambia por lo que sí: una raya larga o
// unas comillas tipográficas salían como signos raros.
const limpio = t => String(t ?? "")
  .replace(/[\u2212\u2013\u2014]/g, "-")
  .replace(/[\u2018\u2019\u2032]/g, "'")
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/\u2026/g, "...")
  .replace(/\u00a0/g, " ")
  .replace(/[^\x00-\xFF]/g, "");

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "27 oct 2026, 10:32" */
export function momentoDeEmision(f = new Date()) {
  const d = f instanceof Date ? f : new Date(f);
  const hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

/** El texto de la izquierda: "Elemento · Proyecto", sin repetir si son lo mismo. */
export function queEs(elemento, proyecto) {
  const e = String(elemento || "").trim(), p = String(proyecto || "").trim();
  if (!p || e.toLowerCase().includes(p.toLowerCase())) return e;
  if (!e) return p;
  return `${e} · ${p}`;
}

/**
 * Pone el pie en todas las hojas del documento. Se llama al final, cuando ya
 * se sabe cuántas hojas hay.
 *
 * @param doc       el jsPDF
 * @param elemento  qué es: "Presupuesto v2", "Orden de cambio N° 3", "Cronograma"…
 * @param proyecto  de qué proyecto u obra
 * @param emitido   cuándo (por defecto, ahora)
 * @param abajo     a cuántos milímetros del borde inferior va la línea
 * @param margen    margen lateral, en milímetros
 * @param color     [r, g, b] del texto
 */
export function pieDePdf(doc, { elemento, proyecto, emitido = new Date(), abajo = 7, margen = 12, color = [140, 138, 132] } = {}) {
  const k = 72 / 25.4 / doc.internal.scaleFactor;        // milímetros → unidad del documento
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const x1 = margen * k, x2 = W - margen * k, y = H - abajo * k;
  const izquierda = limpio(queEs(elemento, proyecto));
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...color);
    const derecha = `Emitido el ${momentoDeEmision(emitido)}${total > 1 ? `  ·  Página ${i} de ${total}` : ""}`;
    // Lo de la izquierda se corta si no entra: la fecha y la página no.
    const lugar = x2 - x1 - doc.getTextWidth(derecha) - 6 * k;
    let texto = izquierda;
    while (texto && doc.getTextWidth(texto) > lugar && texto.length > 4) texto = texto.slice(0, -2);
    if (texto && texto !== izquierda) texto = `${texto.trim()}...`;
    if (texto) doc.text(texto, x1, y);
    doc.text(derecha, x2, y, { align: "right" });
  }
}
