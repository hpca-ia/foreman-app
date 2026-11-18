// «Hay una versión nueva de FOREMAN». Hernán, 18/11/2026, 17:17, diez minutos
// después de publicado el arreglo de «Comprar con esta»: «no sirve el botón
// comprar con esta...». Su pestaña seguía con el código de antes —la captura
// no tenía la línea «Se compra con…» que el arreglo agrega— y tocó el botón
// viejo cinco veces más (historial 164 a 168 del pedido 30).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { principalDe, esOtraVersion, laQueCorre } from "../src/lib/versionNueva.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

// La página de entrada, como la sirve Vercel: nombra el archivo del código publicado.
const pagina = hash => `<!doctype html><html><head><script defer="defer" src="/static/js/main.${hash}.js"></script><link href="/static/css/main.abc.css" rel="stylesheet"></head><body><div id="root"></div></body></html>`;

test("LO QUE PASÓ: la pestaña corría el código de las 16:40 y publicado estaba el de las 17:07", () => {
  const laDeSuPestana = "static/js/main.794082e7.js";
  assert.equal(principalDe(pagina("1dc52875")), "static/js/main.1dc52875.js");
  assert.equal(esOtraVersion(pagina("1dc52875"), laDeSuPestana), true);
  // Recargada, coinciden y no avisa.
  assert.equal(esOtraVersion(pagina("1dc52875"), "static/js/main.1dc52875.js"), false);
});

test("sin con qué comparar no se avisa por las dudas", () => {
  // Sin conexión, o una página de error que no nombra ningún código.
  assert.equal(esOtraVersion("", "static/js/main.794082e7.js"), false);
  assert.equal(esOtraVersion("<html>502 Bad Gateway</html>", "static/js/main.794082e7.js"), false);
  // En desarrollo el código no lleva número.
  assert.equal(esOtraVersion(pagina("1dc52875"), ""), false);
  assert.equal(principalDe(null), "");
  // El que corre sale de la propia página.
  const doc = { scripts: [{ src: "https://x.test/static/js/453.aa11bb22.chunk.js" }, { src: "https://x.test/static/js/main.794082e7.js" }] };
  assert.equal(laQueCorre(doc), "static/js/main.794082e7.js");
  assert.equal(laQueCorre({ scripts: [{ src: "http://localhost:3000/static/js/bundle.js" }] }), "");
  assert.equal(laQueCorre(null), "");
});

test("avisa y ofrece recargar; no recarga solo, que se puede estar escribiendo", () => {
  const aviso = codigoDe("../src/components/AvisoDeVersionNueva.jsx");
  assert.match(aviso, /className="actualizar-foreman" onClick=\{\(\) => window\.location\.reload\(\)\}/);
  assert.equal((aviso.match(/location\.reload\(\)/g) || []).length, 1, "solo al tocar el botón");
  // Mira al volver a la pestaña y cada tanto, solo con la pestaña a la vista.
  assert.match(aviso, /document\.addEventListener\("visibilitychange", mirar\);\s+window\.addEventListener\("focus", mirar\);/);
  assert.match(aviso, /if \(document\.visibilityState !== "visible" \|\| Date\.now\(\) - ultima < 60000\) return;/);
  // Pregunta sin que el navegador le conteste de memoria.
  assert.match(codigoDe("../src/lib/versionNueva.js"), /fetch\(`\/\?version=\$\{Date\.now\(\)\}`, \{ cache: "no-store" \}\)/);
  // Montado una vez, para toda la aplicación.
  assert.equal((codigoDe("../src/App.jsx").match(/<AvisoDeVersionNueva \/>/g) || []).length, 1);
});
