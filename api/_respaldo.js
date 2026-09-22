// Juntar todo lo que hay en FOREMAN, para poder volver a levantarlo.
//
// Esta pieza solo arma el respaldo; dónde se guarda es cosa de otra (hoy
// Dropbox, mañana lo que sea). Así cambiar de destino es cambiar un archivo.
//
// El respaldo son dos cosas distintas:
//   · La base: todas las tablas, en un solo archivo JSON comprimido. Pesa
//     poco —texto y números— y con él se puede reconstruir la base entera.
//   · Los archivos: las facturas escaneadas, los logos y los adjuntos, que
//     viven aparte de la base y no salen en el JSON.

import { gzipSync } from "node:zlib";
import { SUPABASE_URL, rest } from "./_supabase.js";

const secreta = () => process.env.SUPABASE_SECRET_KEY || "";
const cabecerasStorage = () => {
  const k = secreta();
  return { apikey: k, ...(k.startsWith("eyJ") ? { Authorization: `Bearer ${k}` } : { Authorization: `Bearer ${k}` }) };
};

/** Todas las tablas de la base, según lo que la propia base declara. */
export async function listarTablas() {
  const r = await rest("");
  if (!r.ok) throw new Error(`No se pudo leer el esquema (${r.status})`);
  const spec = await r.json();
  const defs = spec.definitions || {};
  return Object.keys(defs)
    .filter(t => !t.startsWith("("))
    .map(t => ({ nombre: t, orden: Object.keys(defs[t]?.properties || {}).includes("id") ? "id" : null }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Una tabla entera, de a mil filas: PostgREST no devuelve más por viaje. */
export async function bajarTabla({ nombre, orden }) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const q = `${nombre}?select=*&limit=1000&offset=${desde}${orden ? `&order=${orden}.asc` : ""}`;
    const r = await rest(q);
    if (!r.ok) throw new Error(`${nombre}: ${r.status} ${(await r.text()).slice(0, 120)}`);
    const lote = await r.json();
    filas.push(...lote);
    if (lote.length < 1000) return filas;
  }
}

/**
 * El respaldo de la base, comprimido y listo para guardar.
 * @returns { nombre, contenido: Buffer, resumen: { tablas, filas, bytes } }
 */
export async function respaldoDeLaBase() {
  const tablas = await listarTablas();
  const datos = {};
  let filas = 0;
  const fallas = [];
  for (const t of tablas) {
    try {
      datos[t.nombre] = await bajarTabla(t);
      filas += datos[t.nombre].length;
    } catch (e) {
      // Una tabla que no se deja leer no puede tumbar el respaldo entero: se
      // guarda lo demás y se avisa cuál faltó.
      fallas.push(`${t.nombre}: ${e.message}`);
    }
  }
  const cuerpo = { hecho_at: new Date().toISOString(), origen: SUPABASE_URL, tablas: Object.keys(datos), fallas, datos };
  const contenido = gzipSync(Buffer.from(JSON.stringify(cuerpo), "utf8"));
  return {
    nombre: `foreman-base-${new Date().toISOString().slice(0, 10)}.json.gz`,
    contenido,
    resumen: { tablas: Object.keys(datos).length, filas, bytes: contenido.length, fallas },
  };
}

// ── Los archivos ─────────────────────────────────────────────────────────

export async function listarDepositos() {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, { headers: cabecerasStorage() });
  if (!r.ok) throw new Error(`No se pudieron listar los depósitos (${r.status})`);
  return (await r.json()).map(b => b.id);
}

/** Todo lo que hay en un depósito, entrando en cada carpeta. */
export async function listarArchivos(deposito, prefijo = "", encontrados = []) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${deposito}`, {
    method: "POST",
    headers: { ...cabecerasStorage(), "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: prefijo, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } }),
  });
  if (!r.ok) return encontrados;
  for (const o of await r.json()) {
    const ruta = prefijo ? `${prefijo}/${o.name}` : o.name;
    // Sin id es una carpeta, no un archivo.
    if (o.id) encontrados.push({ ruta, bytes: o.metadata?.size || 0 });
    else await listarArchivos(deposito, ruta, encontrados);
  }
  return encontrados;
}

export async function borrarArchivo(deposito, ruta) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${deposito}/${ruta}`, { method: "DELETE", headers: cabecerasStorage() });
  return r.ok;
}

export async function bajarArchivo(deposito, ruta) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${deposito}/${ruta}`, { headers: cabecerasStorage() });
  if (!r.ok) throw new Error(`${deposito}/${ruta}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
