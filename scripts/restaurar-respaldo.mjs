// Volver a levantar FOREMAN desde un respaldo.
//
// Un respaldo que nunca se restauró no es un respaldo, así que esto existe
// para probarse: se corre contra una base vacía y se mira que todo vuelva.
//
// Uso:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SECRET_KEY=sb_secret_... \
//   node scripts/restaurar-respaldo.mjs foreman-base-2026-09-21.json.gz [--probar] [--tablas rubros,presupuestos]
//
//   --probar   solo dice qué haría, sin escribir nada
//   --tablas   restaura únicamente esas tablas (para recuperar una sola cosa)
//
// Las filas se escriben con el mismo id que tenían, pisando lo que haya con
// ese id. Como una tabla puede depender de otra —un rubro de su capítulo—, se
// dan varias vueltas: lo que falla en una vuelta se reintenta en la siguiente,
// cuando ya está lo que le faltaba.

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const [archivo, ...banderas] = process.argv.slice(2);
const probar = banderas.includes("--probar");
const soloTablas = (banderas.find(b => b.startsWith("--tablas"))?.split("=")[1] || banderas[banderas.indexOf("--tablas") + 1] || "")
  .split(",").map(t => t.trim()).filter(Boolean);

const URL_BASE = process.env.SUPABASE_URL;
const LLAVE = process.env.SUPABASE_SECRET_KEY;

if (!archivo) { console.error("Falta el archivo del respaldo."); process.exit(1); }
if (!URL_BASE || !LLAVE) { console.error("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY."); process.exit(1); }

const cabeceras = extra => ({
  apikey: LLAVE,
  ...(LLAVE.startsWith("eyJ") ? { Authorization: `Bearer ${LLAVE}` } : {}),
  "Content-Type": "application/json",
  ...extra,
});

const respaldo = JSON.parse(gunzipSync(readFileSync(archivo)).toString());
const tablas = Object.keys(respaldo.datos).filter(t => !soloTablas.length || soloTablas.includes(t));

console.log(`Respaldo del ${respaldo.hecho_at?.slice(0, 19).replace("T", " ")} · ${tablas.length} tablas`);
console.log(`Destino: ${URL_BASE}${probar ? "  (prueba: no se escribe nada)" : ""}\n`);

async function escribir(tabla, filas) {
  for (let i = 0; i < filas.length; i += 500) {
    const r = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
      method: "POST",
      headers: cabeceras({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(filas.slice(i, i + 500)),
    });
    if (!r.ok) throw new Error((await r.text()).slice(0, 200));
  }
}

let pendientes = tablas.filter(t => respaldo.datos[t].length);
const vacias = tablas.filter(t => !respaldo.datos[t].length);
const listas = [];
const fallidas = new Map();

for (let vuelta = 1; vuelta <= 6 && pendientes.length; vuelta++) {
  const quedan = [];
  for (const tabla of pendientes) {
    const filas = respaldo.datos[tabla];
    if (probar) { console.log(`  ${tabla}: ${filas.length} filas (no se escribió)`); listas.push(tabla); continue; }
    try {
      await escribir(tabla, filas);
      console.log(`  ✓ ${tabla}: ${filas.length} filas`);
      listas.push(tabla);
      fallidas.delete(tabla);
    } catch (e) {
      fallidas.set(tabla, e.message);
      quedan.push(tabla);
    }
  }
  // Si una vuelta entera no logró nada nuevo, seguir no sirve.
  if (quedan.length === pendientes.length) break;
  pendientes = quedan;
}

console.log(`\nRestauradas ${listas.length} de ${tablas.length} tablas.`);
if (vacias.length) console.log(`Vacías en el respaldo: ${vacias.join(", ")}`);
if (pendientes.length) {
  console.log(`\nNo entraron ${pendientes.length}:`);
  pendientes.forEach(t => console.log(`  · ${t}: ${fallidas.get(t)}`));
  console.log("\nSuele ser una tabla que depende de otra que tampoco entró, o una columna que la base de destino todavía no tiene (falta correr sus migraciones).");
  process.exit(1);
}
