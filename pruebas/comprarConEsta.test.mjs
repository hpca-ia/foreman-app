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
