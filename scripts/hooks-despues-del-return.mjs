#!/usr/bin/env node
// ¿Hay algún hook de React después de un `return` temprano?
//
// Es el error que deja FOREMAN en blanco, y no lo avisa nada: compila, se
// despliega, y la pantalla queda vacía. React cuenta los hooks por orden en
// cada render; si uno está debajo de un `return` condicional, la rama que
// devuelve temprano lo saltea y la cuenta cambia. Ya pasó dos veces en App.jsx
// —las dos por poner el useState junto a la función que lo usa, que es donde
// se lee mejor y es exactamente el lugar equivocado.
//
// La regla oficial de React (`rules-of-hooks`) lo detecta, pero este proyecto
// no corre ESLint en el build y prenderla entera traería cientos de avisos
// viejos. Esto mira una sola cosa, en los archivos donde importa.
//
//   npm run hooks
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const HOOK = /(?:^|[^.\w])(use[A-Z]\w*)\s*\(/;
// Exactamente dos espacios: el cuerpo del componente. Un `return` con cuatro o
// más está dentro de un useMemo, un map o un handler, y no se saltea nada.
const RETURN_TEMPRANO = /^ {2}(?:if\s*\(.*?\)\s*)?return\s+(?:<|null|\w)/;

function archivos(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return archivos(p);
    return /\.jsx?$/.test(n) ? [p] : [];
  });
}

let fallas = 0;
for (const archivo of archivos("src")) {
  const lineas = readFileSync(archivo, "utf8").split("\n");
  let returnEn = 0;
  lineas.forEach((linea, i) => {
    const n = i + 1;
    // Cada componente empieza su propia cuenta: un archivo con tres
    // componentes tiene tres returns tempranos y ninguno alcanza al de abajo.
    // Sin esto el chequeo marcaba 109 cosas, todas sanas, que es como se
    // consigue que nadie lo vuelva a correr.
    if (/^(export\s+)?(default\s+)?function\s+[A-Z]/.test(linea)
      || /^const\s+[A-Z]\w*\s*=\s*(\(|function|React\.memo|memo\()/.test(linea)) returnEn = 0;
    // Un `return` al principio de un componente, no los de dentro de una
    // función anidada: por eso se mira la sangría, de 2 a 6 espacios.
    // Nada de descartar las líneas con `=>`: el return que importa es
    // `if (!usuario) return <LoginScreen onLogin={u => …} />`, que tiene una
    // flecha adentro. Con ese filtro el chequeo no veía el único caso que ya
    // rompió la app dos veces — y un chequeo que nunca falla no sirve de nada.
    if (!returnEn && RETURN_TEMPRANO.test(linea)) returnEn = n;
    if (!returnEn) return;
    const m = linea.match(HOOK);
    // Solo las declaraciones del cuerpo del componente, con su misma sangría.
    if (m && /^  const .*=\s*use[A-Z]/.test(linea)) {
      console.log(`${archivo}:${n}  ${m[1]} después del return de la línea ${returnEn}`);
      console.log(`   ${linea.trim().slice(0, 90)}`);
      fallas++;
    }
  });
}
console.log(fallas ? `\n${fallas} hook(s) después de un return temprano.` : "Ningún hook después de un return temprano.");
process.exit(fallas ? 1 : 0);
