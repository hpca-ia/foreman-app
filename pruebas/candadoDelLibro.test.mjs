// El candado del libro de obra vive en la base, en una función que varias
// migraciones fueron reescribiendo entera. La 144 la reescribió para sumar la
// regla del mediodía y se llevó puesta la excepción de los días reabiertos:
// durante dos semanas nadie pudo completar un día reabierto.
//
// Esto no corre la función —no hay base acá—: mira la ÚLTIMA migración que la
// define y exige que tenga las tres partes de la regla. La próxima vez que
// alguien la reescriba, si se olvida una, se entera acá.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const queLaDefinen = fs.readdirSync(carpeta).filter(f => /^\d+_.*\.sql$/.test(f)).sort()
  .filter(f => /create or replace function public\.libro_del_dia_abierto\(\)/i.test(fs.readFileSync(path.join(carpeta, f), "utf8")));
const ultima = queLaDefinen.at(-1);
// Sin los comentarios: lo que cuenta es lo que la función hace, no lo que dice que hace.
const sql = fs.readFileSync(path.join(carpeta, ultima), "utf8").split("\n").filter(l => !/^\s*--/.test(l)).join("\n");
const cuerpo = sql.slice(sql.search(/create or replace function public\.libro_del_dia_abierto\(\)/i));

test("la función del candado se definió en varias migraciones, y se mira la última", () => {
  assert.ok(queLaDefinen.length >= 3, `la definen: ${queLaDefinen.join(", ")}`);
  assert.ok(Number(ultima.slice(0, 3)) >= 180, `la última que la define es ${ultima}`);
});

test("un día que no está abierto no se escribe", () => {
  assert.match(cuerpo, /d\.estado\s*<>\s*'abierto'/);
});

test("un día reabierto a propósito se escribe, sea de la fecha que sea", () => {
  // La fecha solo cierra el día cuando NO se reabrió.
  assert.match(cuerpo, /d\.reabierto_at\s+is\s+null\s+and\s*\(/i, "la regla de la fecha tiene que valer solo si no se reabrió");
  // Y las dos condiciones de fecha están adentro de ese paréntesis, no sueltas con un «or» al lado del estado.
  const desde = cuerpo.search(/d\.reabierto_at\s+is\s+null\s+and\s*\(/i);
  const fechas = [...cuerpo.matchAll(/d\.fecha\s*[<=]/g)].map(m => m.index);
  assert.ok(fechas.length >= 2 && fechas.every(i => i > desde), "una condición de fecha quedó fuera de la excepción");
});

test("la jornada anterior se escribe hasta el mediodía", () => {
  assert.match(cuerpo, /d\.fecha\s*<\s*\(ahora::date\s*-\s*1\)/);
  assert.match(cuerpo, /d\.fecha\s*=\s*\(ahora::date\s*-\s*1\)\s*and\s*extract\(hour from ahora\)\s*>=\s*12/);
  assert.match(cuerpo, /America\/Guayaquil/);
});
