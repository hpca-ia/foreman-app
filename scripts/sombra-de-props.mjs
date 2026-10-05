#!/usr/bin/env node
// ¿Alguna variable local tapa a una prop del componente?
//
// Es lo que acaba de romper NOVA Comercial: el componente recibía `catalogo`
// —la lista de etapas— y adentro se declaraba otro `catalogo` con un texto.
// Doce líneas más abajo se le pedía .map al texto, y el usuario leyó
// "(e || g).map is not a function", que no le dice nada a nadie.
//
// Es un error silencioso: compila, y revienta solo cuando alguien usa la
// prop tapada. Si las dos cosas fueran del mismo tipo podría no reventar
// nunca y simplemente hacer algo distinto de lo que dice el código, que es
// peor.
//
// `no-shadow` de ESLint lo encuentra, pero marca 59 cosas en este proyecto y
// casi todas son sanas —parámetros de callbacks, variables de bucles—. Un
// chequeo que grita es un chequeo que nadie corre. Este mira una sola cosa:
// const o let, en el cuerpo del componente, con el nombre de una de sus props.
//
//   npm run sombra
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function archivos(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return archivos(p);
    return /\.jsx?$/.test(n) ? [p] : [];
  });
}

// export default function Algo({ a, b = 1, c: d, ...resto })
const FIRMA = /^export default function\s+\w+\s*\(\s*\{([^)]*?)\}/ms;

function propsDe(texto) {
  const m = texto.match(FIRMA);
  if (!m) return [];
  return m[1]
    // Sin los comentarios: en una firma es normal documentar la forma de un
    // callback —"// ({ id, nombre }) => void"— y esos nombres no son props.
    // Tomarlos por props hacía que el chequeo marcara archivos sanos, que es
    // la forma más rápida de que nadie lo vuelva a correr.
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(",")
    .map(p => p.trim())
    .filter(Boolean)
    .filter(p => !p.startsWith("..."))
    // `c: d` expone d; `a = 1` expone a.
    .map(p => (p.includes(":") ? p.split(":")[1] : p.split("=")[0]).trim())
    .filter(p => /^[A-Za-z_$][\w$]*$/.test(p));
}

let fallas = 0;
for (const archivo of archivos("src")) {
  const texto = readFileSync(archivo, "utf8");
  const props = new Set(propsDe(texto));
  if (!props.size) continue;
  const inicio = texto.search(FIRMA);
  texto.split("\n").forEach((linea, i) => {
    if (texto.split("\n").slice(0, i).join("\n").length < inicio) return;
    const m = linea.match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (!m || !props.has(m[1])) return;
    console.log(`${archivo}:${i + 1}  "${m[1]}" tapa a la prop del mismo nombre`);
    console.log(`   ${linea.trim().slice(0, 90)}`);
    fallas++;
  });
}
console.log(fallas ? `\n${fallas} variable(s) tapando una prop.` : "Ninguna variable tapa una prop.");
process.exit(fallas ? 1 : 0);
