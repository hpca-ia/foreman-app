#!/usr/bin/env node
//
// Correr las migraciones que faltan, sin copiar y pegar en el editor de
// Supabase.
//
// Pegar a mano funciona hasta que son cuatro archivos y uno se corre dos
// veces, o ninguna, y nadie sabe cuál. Esto lleva la cuenta en la base misma:
// cada archivo que corre queda anotado con su fecha y el resumen de su
// contenido, así que preguntar "¿qué falta?" tiene una respuesta y no una
// conversación.
//
// CÓMO SE ENCHUFA (una sola vez)
//
//   En Supabase → Project Settings → Database → Connection string → URI,
//   copiar la que dice "Session pooler" o "Direct connection" y guardarla en
//   un archivo .env.local en la raíz del proyecto:
//
//       DATABASE_URL=postgresql://postgres:LACLAVE@db.xxxx.supabase.co:5432/postgres
//
//   Ese archivo está en .gitignore y no sale de esta computadora.
//
// CÓMO SE USA
//
//   npm run migrar            · muestra qué falta, sin tocar nada
//   npm run migrar -- --dale  · las corre
//   npm run migrar -- --marcar-hasta 066
//                             · anota como corridas las viejas, sin ejecutarlas
//
// Lo de --marcar-hasta es para la primera vez: de la 001 a la 066 ya están
// aplicadas a mano, y volver a correrlas duplicaría filas. Marcarlas es
// decirle a la cuenta lo que ya es cierto.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const DIR = "supabase/migrations";

// Sin dependencias para leer el .env: son tres líneas y una menos que mantener.
function cargarEnv() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const archivo of [".env.local", ".env"]) {
    if (!existsSync(archivo)) continue;
    for (const linea of readFileSync(archivo, "utf8").split("\n")) {
      const m = linea.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

const archivos = () => readdirSync(DIR).filter(n => n.endsWith(".sql")).sort();
const version = n => n.split("_")[0];

const url = cargarEnv();
if (!url) {
  console.log("Falta la conexión a la base.\n");
  console.log("En Supabase → Project Settings → Database → Connection string → URI,");
  console.log("copiá la cadena y guardala en .env.local:\n");
  console.log("    DATABASE_URL=postgresql://postgres:LACLAVE@db.xxxx.supabase.co:5432/postgres\n");
  console.log("Ese archivo no se sube al repositorio.");
  process.exit(1);
}

const dale = process.argv.includes("--dale");
const marcarHasta = (process.argv.find(a => a.startsWith("--marcar-hasta")) || "").split("=")[1]
  || (process.argv[process.argv.indexOf("--marcar-hasta") + 1] || "").match(/^\d+$/)?.[0];

const cliente = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await cliente.connect();

await cliente.query(`
  create table if not exists public.foreman_migraciones (
    version    text primary key,
    archivo    text not null,
    corrida_at timestamptz not null default now()
  )`);

const { rows } = await cliente.query("select version from public.foreman_migraciones");
const corridas = new Set(rows.map(r => r.version));

if (marcarHasta) {
  const marcar = archivos().filter(a => version(a) <= marcarHasta && !corridas.has(version(a)));
  for (const a of marcar) {
    await cliente.query("insert into public.foreman_migraciones (version, archivo) values ($1, $2) on conflict do nothing",
      [version(a), a]);
  }
  console.log(`Anotadas como ya corridas: ${marcar.length} migraciones hasta la ${marcarHasta}.`);
  await cliente.end();
  process.exit(0);
}

const faltan = archivos().filter(a => !corridas.has(version(a)));
if (!faltan.length) {
  console.log("No falta ninguna migración.");
  await cliente.end();
  process.exit(0);
}

console.log(`Faltan ${faltan.length}:`);
faltan.forEach(a => console.log("  ·", a));

if (!dale) {
  console.log("\nNo corrí nada. Para hacerlo:  npm run migrar -- --dale");
  await cliente.end();
  process.exit(0);
}

for (const archivo of faltan) {
  const sql = readFileSync(join(DIR, archivo), "utf8");
  process.stdout.write(`\n${archivo} … `);
  try {
    // Cada una en su transacción: si la 069 falla, la 068 ya aplicada se
    // queda, y la 069 no deja la base a mitad de camino.
    await cliente.query("begin");
    await cliente.query(sql);
    await cliente.query("insert into public.foreman_migraciones (version, archivo) values ($1, $2)",
      [version(archivo), archivo]);
    await cliente.query("commit");
    console.log("lista");
  } catch (e) {
    await cliente.query("rollback");
    console.log("FALLÓ");
    console.log("   " + e.message);
    console.log("\nNo sigo con las que quedan: la que viene puede depender de esta.");
    await cliente.end();
    process.exit(1);
  }
}

await cliente.end();
console.log("\nTodo aplicado.");
