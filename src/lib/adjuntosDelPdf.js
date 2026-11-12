// LOS SUSTENTOS QUE SON PDF TAMBIÉN VAN ADENTRO DEL REPORTE.
//
// El reporte con anexos —caja chica, planilla— ponía al final «cada factura
// escaneada», pero solo sabía poner FOTOS. Un sustento subido como PDF —la
// factura electrónica, el escaneo del teléfono— se salteaba sin decir nada.
// La caja de Johanna tiene todos sus sustentos en PDF: su reporte salía sin
// ninguno, y parecía que no los tenía. La de Carlos German, igual: 54 de 54.
// En la de Lizeth salían las 18 fotos y faltaban los 73 PDF.
//
// Cómo entra un PDF: el reporte se arma con jsPDF, que no sabe abrir otro PDF.
// Así que por cada hoja del sustento se deja una hoja del reporte con su
// título —el mismo de las fotos: proveedor, fecha y monto— y su pie numerado,
// y al final se dibuja encima la hoja del sustento, entera, achicada lo justo
// para que entre. Eso lo hace pdf-lib, que sí sabe.
//
// Un sustento que no se puede abrir no desaparece: queda su hoja diciendo que
// está y que no se pudo incrustar.

/** ¿Son los bytes de un PDF? Empieza con «%PDF», venga con el tipo que venga. */
export const esPdf = bytes => !!bytes && bytes.length > 4
  && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;

/**
 * Abre un PDF y dice cuántas hojas tiene y de qué tamaño se VEN.
 *
 * @returns { origen, paginas: [{ ancho, alto, giro }] }
 *   `ancho` y `alto` son los de la hoja como se ve —una girada 90° se ve
 *   acostada—; `giro` es cuánto está girada: 0, 90, 180 o 270.
 */
export async function paginasDelPdf(bytes) {
  const { PDFDocument } = await import("pdf-lib");
  const origen = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const paginas = origen.getPages().map(p => {
    const { width, height } = p.getSize();
    const giro = ((p.getRotation().angle % 360) + 360) % 360;
    const acostada = giro === 90 || giro === 270;
    return { ancho: acostada ? height : width, alto: acostada ? width : height, giro };
  });
  return { origen, paginas };
}

/**
 * Dónde y a qué tamaño se dibuja una hoja para que entre entera en un hueco.
 *
 * Las medidas son las de pdf-lib: el origen abajo a la izquierda. No se
 * agranda nunca: una hoja chica queda de su tamaño.
 *
 * @param hoja   { ancho, alto, giro } como se ve
 * @param hueco  { x, y, ancho, alto }: `y` es el borde de ABAJO del hueco
 * @returns { x, y, escala, giro, ancho, alto }  `x`,`y` es donde se apoya la
 *   esquina de origen de la hoja, ya contado el giro; `ancho` y `alto`, lo que
 *   ocupa dibujada
 */
export function dondeVa(hoja, hueco) {
  const escala = Math.min(hueco.ancho / hoja.ancho, hueco.alto / hoja.alto, 1);
  const ancho = hoja.ancho * escala, alto = hoja.alto * escala;
  // Arriba del hueco y contra el margen izquierdo, como las fotos.
  const izq = hueco.x, abajo = hueco.y + hueco.alto - alto;
  const giro = hoja.giro || 0;
  // La esquina de origen de la hoja, según para dónde queda al girarla.
  const [x, y] = giro === 90 ? [izq, abajo + alto]
    : giro === 180 ? [izq + ancho, abajo + alto]
    : giro === 270 ? [izq + ancho, abajo]
    : [izq, abajo];
  return { x, y, escala, giro, ancho, alto };
}

/**
 * Dibuja cada hoja de sustento en la hoja del reporte que se le dejó.
 *
 * @param reporte     los bytes del reporte ya armado, con sus hojas en blanco
 * @param pendientes  [{ pagina, origen, indice, hueco }]: en qué hoja del
 *                    reporte (desde 1) va la hoja `indice` de `origen`, y en
 *                    qué hueco, medido desde ARRIBA como en jsPDF:
 *                    { x, arriba, ancho, alto }
 * @returns Uint8Array con el PDF final
 */
export async function incrustarPdfs(reporte, pendientes = []) {
  const { PDFDocument, degrees } = await import("pdf-lib");
  const final = await PDFDocument.load(reporte);
  // Una sola vez por sustento, con todas sus hojas.
  const porOrigen = new Map();
  for (const p of pendientes) {
    if (!porOrigen.has(p.origen)) porOrigen.set(p.origen, []);
    porOrigen.get(p.origen).push(p);
  }
  for (const [origen, suyas] of porOrigen) {
    const hojas = await final.embedPdf(origen, suyas.map(s => s.indice));
    suyas.forEach((s, k) => {
      const destino = final.getPage(s.pagina - 1);
      const altoDeLaHoja = destino.getSize().height;
      const pos = dondeVa(s.hoja, {
        x: s.hueco.x, y: altoDeLaHoja - s.hueco.arriba - s.hueco.alto, ancho: s.hueco.ancho, alto: s.hueco.alto,
      });
      destino.drawPage(hojas[k], { x: pos.x, y: pos.y, xScale: pos.escala, yScale: pos.escala, rotate: degrees(-pos.giro) });
    });
  }
  return final.save();
}

function aBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * El PDF final, con las mismas tres salidas que se le piden al de jsPDF:
 * guardarlo, y sacarlo como blob o en base64 para mandarlo por correo. Así
 * quien arma el reporte no tiene que saber si adentro hubo sustentos en PDF.
 */
export function comoDocumento(bytes, paginas = 0) {
  const blob = () => new Blob([bytes], { type: "application/pdf" });
  return {
    armadoConPdfLib: true,
    internal: { getNumberOfPages: () => paginas },
    getNumberOfPages: () => paginas,
    output(tipo) {
      if (tipo === "blob") return blob();
      if (tipo === "arraybuffer") return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      if (tipo === "datauristring" || tipo === "dataurlstring") return `data:application/pdf;filename=generated.pdf;base64,${aBase64(bytes)}`;
      throw new Error(`No sé sacar el PDF como "${tipo}".`);
    },
    save(nombre) {
      const url = URL.createObjectURL(blob());
      const a = document.createElement("a");
      a.href = url; a.download = nombre || "documento.pdf";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
  };
}
