#!/usr/bin/env node
// Guardar la contraseña de la base, sin que nada la rompa en el camino.
//
// Pasarla por `echo '…'` falla con las claves que genera Supabase: traen
// símbolos, y una comilla simple cierra el texto antes de tiempo. La clave se
// guarda cortada, el error que vuelve es "password authentication failed", y
// uno va a buscar el problema a Supabase cuando estaba en la terminal.
//
// Acá se escribe sin eco —no queda en el historial ni a la vista de quien mire
// la pantalla— y se escapa antes de meterla en la URL.
//
//   npm run clave
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";

const ARCHIVO = ".env.local";
const PROYECTO = "qxoincfvscvbqvoxamdi";
const SERVIDOR = "aws-1-us-west-2.pooler.supabase.com:5432/postgres";

console.log("\nLa contraseña de la base de FOREMAN.\n");
console.log("Si no la tenés: Supabase → Connect → Session pooler → Reset database password.");
console.log("Se guarda en .env.local, que no se sube a GitHub.\n");

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

// Sin eco: la clave no aparece en pantalla mientras se escribe ni se pega.
const escribir = rl._writeToOutput.bind(rl);
let tapando = false;
rl._writeToOutput = s => { if (!tapando) escribir(s); else if (s.includes("\n")) escribir("\n"); };

rl.question("Pegala acá y dale Enter: ", clave => {
  rl.close();
  const limpia = String(clave || "").trim();
  if (!limpia) { console.log("\nNo escribiste nada. No toqué el archivo."); process.exit(1); }

  const url = `postgresql://postgres.${PROYECTO}:${encodeURIComponent(limpia)}@${SERVIDOR}`;
  // Se conserva lo que ya hubiera en el archivo, salvo la línea de la conexión.
  const antes = existsSync(ARCHIVO)
    ? readFileSync(ARCHIVO, "utf8").split("\n").filter(l => !/^\s*DATABASE_URL\s*=/.test(l)).join("\n").trimEnd()
    : "# La conexión a la base. No se sube a GitHub.";
  writeFileSync(ARCHIVO, `${antes}\n\nDATABASE_URL=${url}\n`);
  console.log(`\nGuardada: ${limpia.length} caracteres.`);
  console.log("Ahora:  npm run migrar");
});
tapando = true;
