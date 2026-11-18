// «Comprar con esta». Hernán, 18/11/2026, con el pedido del porcelanato
// abierto y dos cotizaciones de Graiman: «el botón comprar con esta, no
// funciona...».
//
// En la base funcionaba: el pedido 30 quedó con la cotización 68 elegida y su
// monto. Lo que no hacía era mostrarlo: la ventana seguía con el pedido como
// lo recibió al abrirse, sin «ELEGIDA», sin renglón en el historial y sin
// error. Lo tocó nueve veces en quince segundos (historial 155 a 163).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { esEleccion, soloLaEleccionFinal, eleccionesDeAntes } from "../src/modules/compras/eleccionDeProforma.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
const ventana = codigoDe("../src/modules/compras/ModalSolicitud.jsx");

test("LO QUE PASÓ: elegir la cotización se ve en la ventana abierta, no solo en la base", () => {
  // El botón ya no llama a la base por su cuenta y tira el resultado.
  assert.doesNotMatch(ventana, /onClick=\{async \(\) => \{ await elegirProforma\(/);
  assert.match(ventana, /className="comprar-con-esta" disabled=\{eligiendo != null\} onClick=\{\(\) => comprarConEsta\(a\)\}/);
  // La ventana se queda con lo mismo que quedó en la base: cotización, proveedor y monto.
  assert.match(ventana, /setViva\(v => \(\{ \.\.\.v, proforma_id: a\.id, proveedor: a\.proveedor \|\| v\.proveedor \|\| null, \.\.\.suMonto \}\)\);/);
  // Y vuelve a leer el historial, que es donde queda escrito con cuál se compró.
  const funcion = ventana.slice(ventana.indexOf("async function comprarConEsta"), ventana.indexOf("const conCualSeCompra"));
  assert.match(funcion, /historialDe\(viva\.id\)\.then\(setHistorial\);/);
  assert.match(funcion, /await cargarPapeles\(\);\s+onCambio\?\.\(\);/);
  // La fila elegida se reconoce aunque un id venga como texto y el otro como número.
  assert.match(ventana, /const elegida = viva\?\.proforma_id != null && Number\(viva\.proforma_id\) === Number\(a\.id\);/);
  assert.match(ventana, /className=\{elegida \? "cotizacion cotizacion-elegida" : "cotizacion"\}/);
});

test("elegir no es dar el visto: se dice con cuál se compra y qué falta", () => {
  assert.match(ventana, /className="que-se-eligio" role="status"/);
  assert.ok(ventana.includes("Se compra con "));
  assert.ok(ventana.includes('{estado === "pendiente_aprobacion" && " Falta tu visto: tocá «Aprobar», más abajo."}'));
});

test("nueve clics no son nueve renglones: mientras guarda, no se vuelve a tocar", () => {
  const funcion = ventana.slice(ventana.indexOf("async function comprarConEsta"), ventana.indexOf("const conCualSeCompra"));
  // El candado es un ref: los clics seguidos llegan antes de que React apague el botón.
  assert.match(funcion, /if \(eligiendoRef\.current\) return;\s+eligiendoRef\.current = true;/);
  assert.match(funcion, /finally \{ eligiendoRef\.current = false; setEligiendo\(null\); \}/);
  assert.ok(ventana.includes('{eligiendo === a.id ? "Eligiendo…" : "Comprar con esta"}'));
});

test("si la base no deja, se dice al lado de las cotizaciones", () => {
  const funcion = ventana.slice(ventana.indexOf("async function comprarConEsta"), ventana.indexOf("const conCualSeCompra"));
  assert.match(funcion, /if \(err\) \{ setNoSeEligio\(`No se pudo elegir esa cotización: \$\{err\}`\); return; \}/);
  assert.match(funcion, /catch \(ex\) \{\s+setNoSeEligio\(`No se pudo elegir esa cotización: \$\{ex\.message\}`\);/);
  assert.match(ventana, /className="no-se-eligio" role="alert"/);
});

// ── «Todo este historial está mal... solo con la última selección» ──────────
//
// Hernán, 18/11/2026, mirando el historial del pedido 30 con dieciséis
// renglones «Proforma elegida»: «se está cargando información de error en los
// pasos abajo. Solo debería cargar la información final seleccionada».

// El historial del pedido 30, como estaba en la base a las 17:19 (ids reales).
const paso = (id, antes, despues, quien, comentario) => ({ id, solicitud_id: 30, estado_anterior: antes, estado_nuevo: despues, usuario_nombre: quien, comentario });
const eleccion = (id, monto) => paso(id, "pendiente_aprobacion", "pendiente_aprobacion", "Hernan Cueva", `Proforma elegida: GRAIMAN CIA. LTDA. · $${monto}`);
const DEL_PEDIDO_30 = [
  paso(134, null, "borrador", "Johanna", null),
  paso(135, "borrador", "pendiente_aprobacion", "Johanna", null),
  paso(145, "pendiente_aprobacion", "requiere_info", "Hernan Cueva", "Revisemos descuento Graiman"),
  paso(154, "requiere_info", "pendiente_aprobacion", "Johanna", "adjunto la cotización con el descuento"),
  ...[155, 156, 157, 158, 159, 160, 161].map(id => eleccion(id, "973.83")),
  eleccion(162, "1079.51"), eleccion(163, "973.83"),
  eleccion(164, "1079.51"), eleccion(165, "1079.51"), eleccion(166, "1079.51"),
  eleccion(167, "973.83"), eleccion(168, "973.83"),
];

test("LO QUE PIDIÓ: de las elecciones seguidas se lee solo la última", () => {
  const limpio = soloLaEleccionFinal(DEL_PEDIDO_30);
  // Dieciocho renglones en la base; cinco en la pantalla.
  assert.equal(DEL_PEDIDO_30.length, 18);
  assert.deepEqual(limpio.map(h => h.id), [134, 135, 145, 154, 168]);
  assert.equal(limpio.at(-1).comentario, "Proforma elegida: GRAIMAN CIA. LTDA. · $973.83");
  // Lo que no es una elección no se toca nunca: ni un paso, ni un comentario.
  assert.equal(esEleccion(paso(1, "pendiente_aprobacion", "aprobada", "Hernan Cueva", "Proforma elegida: X")), false);
  assert.equal(esEleccion(paso(2, "aprobada", "aprobada", "Johanna", "Ya la pedí por teléfono")), false);
  assert.equal(esEleccion(eleccion(3, "10.00")), true);
  assert.deepEqual(soloLaEleccionFinal([]), []);
  assert.deepEqual(soloLaEleccionFinal(null), []);
  // La ventana lo muestra así.
  assert.match(ventana, /\{soloLaEleccionFinal\(historial\)\.map\(h => \(/);
});

test("si entre dos elecciones pasó algo, las dos quedan", () => {
  const conAlgoEnElMedio = [
    eleccion(1, "973.83"),
    paso(2, "pendiente_aprobacion", "requiere_info", "Hernan Cueva", "Pidan otro descuento"),
    paso(3, "requiere_info", "pendiente_aprobacion", "Johanna", "no dan más"),
    eleccion(4, "1079.51"), eleccion(5, "973.83"),
    paso(6, "pendiente_aprobacion", "pendiente_aprobacion", "Johanna", "¿ya está el visto?"),
    eleccion(7, "973.83"),
  ];
  assert.deepEqual(soloLaEleccionFinal(conAlgoEnElMedio).map(h => h.id), [1, 2, 3, 5, 6, 7]);
  // Al elegir de nuevo, se van solo las del final, que son las seguidas.
  assert.deepEqual(eleccionesDeAntes(conAlgoEnElMedio), [7]);
  assert.deepEqual(eleccionesDeAntes(conAlgoEnElMedio.slice(0, 5)), [4, 5]);
  assert.deepEqual(eleccionesDeAntes(conAlgoEnElMedio.slice(0, 3)), []);
});

test("al elegir, las seguidas de antes se quitan de la base y queda la nueva", () => {
  // Las catorce del pedido 30, que con la próxima elección quedan en una.
  assert.deepEqual(eleccionesDeAntes(DEL_PEDIDO_30), [155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168]);
  assert.deepEqual(eleccionesDeAntes([]), []);
  const compras = codigoDe("../src/modules/compras/compras.js");
  // Después de guardar la elección, nunca antes: si guardar falla, el historial no se toca.
  const funcion = compras.slice(compras.indexOf("export async function elegirProforma"), compras.indexOf("export async function borrarSolicitud"));
  assert.ok(funcion.indexOf("if (error) return error.message;") < funcion.indexOf("eleccionesDeAntes("));
  assert.match(funcion, /const antes = eleccionesDeAntes\(await historialDe\(solicitud\.id\)\);\s+if \(antes\.length\) await supabase\.from\("compras_historial"\)\.delete\(\)\.in\("id", antes\);\s+await anotar\(/);
  // Solo por sus ids: nunca un borrado por pedido entero.
  assert.equal((funcion.match(/\.delete\(\)/g) || []).length, 1);
});
