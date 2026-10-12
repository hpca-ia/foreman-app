import { supabase } from "./supabase";

// Enlaces temporales para mirar un archivo del depósito privado.
//
// Estaba escrito tres veces —las fotos del libro, los papeles de una compra,
// los adjuntos del plan semanal— y las tres con el mismo defecto: se pedían
// todos de un saque y el resultado se emparejaba POR POSICIÓN con la lista
// original. Si una sola ruta fallaba —un archivo que alguien borró del
// depósito, una ruta vieja de antes de un cambio de nombre— la llamada
// devolvía `data` nulo y se caían TODOS los enlaces. Un adjunto roto dejaba
// sin abrir a los otros nueve.
//
// Acá se emparejan por RUTA, que es lo que la respuesta trae, y si el pedido
// en lote falla se van pidiendo de a uno: nueve archivos buenos se abren
// aunque el décimo no exista.

const HORA = 3600;

/**
 * @param archivos  [{ id, storage_path }]
 * @param bucket    el depósito, "task-files" por defecto
 * @returns  { [id]: url } — solo los que se pudieron firmar
 */
export async function enlacesFirmados(archivos = [], bucket = "task-files") {
  const vivos = archivos.filter(a => a?.id != null && a?.storage_path);
  if (!vivos.length) return {};

  const { data, error } = await supabase.storage.from(bucket)
    .createSignedUrls(vivos.map(a => a.storage_path), HORA);

  if (!error && Array.isArray(data)) {
    // Por ruta y no por posición: la respuesta la trae, y así una entrada
    // fallida no corre a las demás de lugar.
    const porRuta = new Map();
    data.forEach(x => { if (x?.signedUrl && x?.path) porRuta.set(x.path, x.signedUrl); });
    const mapa = {};
    vivos.forEach((a, i) => {
      const url = porRuta.get(a.storage_path)
        // Si la respuesta no trajo `path` —versiones viejas del cliente— se
        // cae a la posición, que es lo que había antes.
        || (data[i]?.signedUrl ?? null);
      if (url) mapa[a.id] = url;
    });
    // Si salieron todos, listo. Si faltó alguno, se completa de a uno abajo.
    if (Object.keys(mapa).length === vivos.length) return mapa;
    return { ...mapa, ...(await unoPorUno(vivos.filter(a => !mapa[a.id]), bucket)) };
  }

  return unoPorUno(vivos, bucket);
}

/** Uno por uno: lento, pero un archivo roto no se lleva puestos a los demás. */
async function unoPorUno(archivos, bucket) {
  const mapa = {};
  await Promise.all(archivos.map(async a => {
    const { data } = await supabase.storage.from(bucket)
      .createSignedUrl(a.storage_path, HORA);
    if (data?.signedUrl) mapa[a.id] = data.signedUrl;
  }));
  return mapa;
}
