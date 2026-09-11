// Las fotos de celular pesan 4-8 MB y al mandarlas a NOVA se inflan otro 33%
// en base64. En obra, con señal mala, eso es la diferencia entre que funcione
// y que el residente se quede esperando. Una factura se lee perfecto a 1600px.

const MAX_LADO = 1600;
const CALIDAD = 0.82;
const UMBRAL_BYTES = 900 * 1024; // por debajo de esto no vale la pena tocarla

export async function comprimirImagen(file) {
  if (!file.type.startsWith("image/") || file.size <= UMBRAL_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
    if (escala === 1 && file.size <= UMBRAL_BYTES) return file;

    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = ancho; canvas.height = alto;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close?.();

    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", CALIDAD));
    if (!blob || blob.size >= file.size) return file; // no mejoró: mejor la original

    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file; // si el navegador no puede, se manda tal cual
  }
}

export function pesoLegible(bytes) {
  if (!bytes) return "";
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
