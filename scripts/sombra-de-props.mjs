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
// TAMBIÉN MIRA LO MISMO CON LOS IMPORTS, por la misma razón y con el mismo
// final. En VistaObra se importaba `totales` —la función que suma los
// beneficios— y adentro del componente había un `const totales = totalesObra(…)`
// con los totales de la obra. La línea que decía `totales(beneficios)` creía
// llamar a la función y encontraba el objeto: "totales is not a function", y la
// obra entera en blanco. Vivió meses sin que nadie lo viera, porque ese renglón
// solo se dibuja cuando la obra TIENE beneficios cargados, y no había ninguno
// en toda la base. El día que apareció el primero se llevó la pantalla puesta.
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

/** Lo que el archivo trae con nombre propio: import { a, b as c } y import d. */
function importadosDe(texto) {
  const nombres = new Set();
  for (const m of texto.matchAll(/^import\s+([^;]+?)\s+from\s+["'][^"']+["']/gm)) {
    const cuerpo = m[1];
    // Lo de las llaves, con sus alias: el que vale es el de este lado.
    const llaves = cuerpo.match(/\{([^}]*)\}/)?.[1] || "";
    llaves.split(",").forEach(x => {
      const n = (x.includes(" as ") ? x.split(" as ")[1] : x).trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) nombres.add(n);
    });
    // Y el que viene por defecto, sin llaves.
    const porDefecto = cuerpo.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim();
    if (/^[A-Za-z_$][\w$]*$/.test(porDefecto)) nombres.add(porDefecto);
  }
  return nombres;
}

let fallas = 0;
for (const archivo of archivos("src")) {
  const texto = readFileSync(archivo, "utf8");
  const props = new Set(propsDe(texto));
  const importados = importadosDe(texto);
  if (!props.size && !importados.size) continue;
  const inicio = texto.search(FIRMA);
  const lineas = texto.split("\n");
  let largo = 0;
  lineas.forEach((linea, i) => {
    const antes = largo;
    largo += linea.length + 1;
    // Solo adentro del componente: un const al nivel del módulo que se llama
    // como un import no compila, así que si está acá es que está adentro.
    if (inicio < 0 || antes < inicio) return;
    const m = linea.match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (!m) return;
    const nombre = m[1];
    const que = props.has(nombre) ? "la prop del mismo nombre"
      : importados.has(nombre) ? "lo que este archivo importa con ese nombre"
      : null;
    if (!que) return;
    console.log(`${archivo}:${i + 1}  "${nombre}" tapa a ${que}`);
    console.log(`   ${linea.trim().slice(0, 90)}`);
    fallas++;
  });
}
console.log(fallas ? `\n${fallas} variable(s) tapando una prop o un import.` : "Ninguna variable tapa una prop ni un import.");
process.exit(fallas ? 1 : 0);
