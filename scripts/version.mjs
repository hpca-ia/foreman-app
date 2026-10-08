// Escribe qué versión es esta, antes de compilar.
//
// Pasó dos veces hoy: él mira una pantalla, yo miro el código, y los dos
// decimos cosas distintas porque su navegador tiene un bundle de hace veinte
// minutos. Sin un número a la vista eso se descubre adivinando —"¿recargaste
// con Cmd+Shift+R?"— y se pierde media hora cada vez.
//
// El commit sale de git cuando está disponible (Vercel lo deja en el entorno
// de build); si no, queda la fecha, que ya alcanza para distinguir dos
// versiones del mismo día.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const intento = cmd => { try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };

const sha = (process.env.VERCEL_GIT_COMMIT_SHA || intento("git rev-parse HEAD")).slice(0, 7);
const fecha = new Date().toISOString().slice(0, 16).replace("T", " ");

writeFileSync("src/version.js",
`// Generado por scripts/version.mjs antes de cada build. No se edita a mano.
export const VERSION = ${JSON.stringify(sha || "dev")};
export const COMPILADO = ${JSON.stringify(fecha)};
`);
console.log(`versión ${sha || "dev"} · ${fecha}`);
