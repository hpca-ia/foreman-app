// UN PDF LARGO SE LEE POR PÁGINAS.
//
// Leído entero, NOVA tiene que escribir todos los rubros en una sola
// respuesta, y eso pasa del minuto que el servidor deja: el navegador recibía
// un 504 y nada más. Cada página por separado se lee en segundos, y varias a
// la vez.

/** Parte el PDF en trozos de `porTrozo` páginas. Devuelve el base64 de cada uno. */
export async function partirPdf(file, porTrozo = 1) {
  const { PDFDocument } = await import("pdf-lib");
  const original = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const total = original.getPageCount();
  const trozos = [];
  for (let i = 0; i < total; i += porTrozo) {
    const doc = await PDFDocument.create();
    const indices = Array.from({ length: Math.min(porTrozo, total - i) }, (_, k) => i + k);
    (await doc.copyPages(original, indices)).forEach(p => doc.addPage(p));
    trozos.push(aBase64(await doc.save()));
  }
  return trozos;
}

function aBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Corre `tarea` sobre cada elemento, de a `cuantas` a la vez, y devuelve los resultados en orden. */
export async function deAVarias(lista, cuantas, tarea) {
  const salida = new Array(lista.length);
  let siguiente = 0;
  const obrero = async () => {
    while (siguiente < lista.length) {
      const i = siguiente++;
      salida[i] = await tarea(lista[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(cuantas, lista.length) }, obrero));
  return salida;
}
