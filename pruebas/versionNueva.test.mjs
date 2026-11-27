// «Hay una versión nueva de FOREMAN». Hernán, 18/11/2026, 17:17, diez minutos
// después de publicado el arreglo de «Comprar con esta»: «no sirve el botón
// comprar con esta...». Su pestaña seguía con el código de antes —la captura
// no tenía la línea «Se compra con…» que el arreglo agrega— y tocó el botón
// viejo cinco veces más (historial 164 a 168 del pedido 30).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { principalDe, esOtraVersion, laQueCorre, esEditable, nadaAMedias, hayAlgoEncima, recargar, adondeVolver,
  vigilarLoQueSeEscribe, cuandoSeEscribio, hayUnaNuevaConocida, anotarQueHayNueva } from "../src/lib/versionNueva.js";

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

test("avisa y ofrece recargar, con el botón y desde el encabezado; las dos vuelven al mismo módulo", () => {
  const aviso = codigoDe("../src/components/AvisoDeVersionNueva.jsx");
  assert.match(aviso, /className="actualizar-foreman" onClick=\{\(\) => recargar\(\{ vista: vistaRef\.current \}\)\}/);
  // Nadie recarga por su lado: todo pasa por recargar(), que recuerda el módulo.
  assert.equal((aviso.match(/location\.reload\(\)/g) || []).length, 0);
  assert.equal((codigoDe("../src/lib/versionNueva.js").match(/location\.reload\(\)/g) || []).length, 1);
  // Mira al volver a la pestaña y cada tanto, solo con la pestaña a la vista.
  assert.match(aviso, /document\.addEventListener\("visibilitychange", alCambiar\);\s+window\.addEventListener\("focus", alEnfocar\);/);
  assert.match(aviso, /if \(document\.visibilityState !== "visible"\) return;/);
  // Pregunta sin que el navegador le conteste de memoria.
  assert.match(codigoDe("../src/lib/versionNueva.js"), /fetch\(`\/\?version=\$\{Date\.now\(\)\}`, \{ cache: "no-store" \}\)/);
  // Montado una vez, para toda la aplicación, sabiendo en qué módulo se está.
  const app = codigoDe("../src/App.jsx");
  assert.equal((app.match(/<AvisoDeVersionNueva vista=\{vista\} \/>/g) || []).length, 1);
  // La flecha del encabezado (Hernán: «no tiene flecha redonda»), y vuelve al módulo.
  assert.match(app, /onRecargar=\{\(\) => recargar\(\{ vista \}\)\}/);
  assert.match(codigoDe("../src/components/Header.jsx"), /className="recargar-foreman" onClick=\{onRecargar\}/);
  // Después de recargar arranca en el módulo donde estaba.
  assert.match(app, /useState\(\(\) => adondeVolver\(\) \|\| "tareas"\)/);
});

// Hernán, 27/11/2026, desde el iPad: «¿Cómo recargo la página? No tiene flecha
// redonda. Hago abajo, no funciona, y no quiero salir y entrar. ¿Puede recargar
// auto?». Abierto desde la pantalla de inicio, FOREMAN no tiene barra de Safari.

test("SE RECARGA SOLA al volver a FOREMAN, si no queda nada a medias; si queda, avisa", () => {
  const aviso = codigoDe("../src/components/AvisoDeVersionNueva.jsx");
  // Solo al volver de otra app, con lo último escrito hace más de un minuto
  // antes de irse, y con una pausa para que termine lo que quedó en camino.
  assert.match(aviso, /if \(volvio && oculta - cuandoSeEscribio\(\) >= ESCRITO_AL_IRSE\) \{\s+await new Promise\(r => setTimeout\(r, PAUSA\)\);\s+if \(vivo && document\.visibilityState === "visible" && nadaAMedias\(loQueHayAbierto\(\)\)\) \{\s+recargar\(\{ vista: vistaRef\.current \}\);/);
  // Si no, el aviso de siempre.
  assert.match(aviso, /\n\s+setHay\(true\);\n\s+\};/);
  // Y al cambiar de módulo en el menú, ya sabiendo que hay una nueva.
  const app = codigoDe("../src/App.jsx");
  assert.match(app, /const irA = v => \(hayUnaNuevaConocida\(\) && nadaAMedias\(\{ \.\.\.loQueHayAbierto\(\), margen: 1500 \}\) \? recargar\(\{ vista: v \}\) : setVista\(v\)\);/);
  assert.match(app, /<Sidebar [^>]*setVista=\{irA\}/);
  assert.equal(hayUnaNuevaConocida(), false);
  anotarQueHayNueva();
  assert.equal(hayUnaNuevaConocida(), true);
});

test("qué cuenta como «a medias»: un campo con el cursor, una ventana encima, algo escrito recién", () => {
  const ahora = 1_000_000;
  assert.equal(nadaAMedias({ ahora }), true);
  assert.equal(nadaAMedias({ enfocado: { tagName: "INPUT" }, ahora }), false);
  assert.equal(nadaAMedias({ enfocado: { tagName: "TEXTAREA" }, ahora }), false);
  assert.equal(nadaAMedias({ enfocado: { tagName: "DIV", isContentEditable: true }, ahora }), false);
  assert.equal(nadaAMedias({ enfocado: { tagName: "BUTTON" }, ahora }), true);
  assert.equal(nadaAMedias({ enfocado: { tagName: "BODY" }, ahora }), true);
  assert.equal(nadaAMedias({ tapado: true, ahora }), false);
  // Escrito hace 2 s: el guardado puede estar en camino. Hace 5 s, ya no.
  assert.equal(nadaAMedias({ escrito: ahora - 2000, ahora }), false);
  assert.equal(nadaAMedias({ escrito: ahora - 5000, ahora }), true);
  assert.equal(nadaAMedias({ escrito: ahora - 1000, ahora, margen: 1500 }), false);
  assert.equal(esEditable(null), false);
  assert.equal(esEditable({ tagName: "SELECT" }), true);
});

test("una ventana abierta encima se reconoce por lo fijo que cubre el centro", () => {
  const nodo = (position, parentElement = null) => ({ position, parentElement });
  const body = nodo("static");
  const win = { innerWidth: 1000, innerHeight: 800, getComputedStyle: el => ({ position: el.position }) };
  const enLaPagina = nodo("static", nodo("relative", body));
  const enUnaVentana = nodo("static", nodo("static", nodo("fixed", body)));
  assert.equal(hayAlgoEncima({ body, documentElement: null, elementFromPoint: () => enLaPagina }, win), false);
  assert.equal(hayAlgoEncima({ body, documentElement: null, elementFromPoint: () => enUnaVentana }, win), true);
  assert.equal(hayAlgoEncima({ body, documentElement: null, elementFromPoint: () => null }, win), false);
});

test("después de recargar vuelve al módulo, solo si la recarga fue recién", () => {
  const guardado = new Map();
  let recargas = 0;
  const win = { sessionStorage: { setItem: (k, v) => guardado.set(k, v), getItem: k => guardado.get(k) ?? null }, location: { reload: () => { recargas++; } } };
  recargar({ vista: "presupuestos" }, win);
  assert.equal(recargas, 1);
  assert.equal(adondeVolver(win), "presupuestos");
  assert.equal(adondeVolver(win, Date.now() + 3 * 60 * 1000), null, "de otra vez: arranca en el inicio");
  // Sin dónde anotarlo, recarga igual y arranca en el inicio.
  const sinNada = { sessionStorage: { setItem: () => { throw new Error("privado"); }, getItem: () => { throw new Error("privado"); } }, location: { reload: () => { recargas++; } } };
  recargar({ vista: "leads" }, sinNada);
  assert.equal(recargas, 2);
  assert.equal(adondeVolver(sinNada), null);
  assert.equal(adondeVolver(null), null);
});

test("anota cuándo se escribió: al escribir, al cambiar y al salir de un campo, no al tocar un botón", () => {
  const oyentes = {};
  const doc = { addEventListener: (t, f) => { oyentes[t] = f; }, removeEventListener: t => { delete oyentes[t]; } };
  const dejar = vigilarLoQueSeEscribe(doc);
  assert.deepEqual(Object.keys(oyentes).sort(), ["change", "focusout", "input"]);
  const antes = cuandoSeEscribio();
  oyentes.focusout({ target: { tagName: "BUTTON" } });
  assert.equal(cuandoSeEscribio(), antes);
  oyentes.input({ target: { tagName: "INPUT" } });
  assert.ok(cuandoSeEscribio() >= Date.now() - 1000);
  dejar();
  assert.deepEqual(Object.keys(oyentes), []);
});
