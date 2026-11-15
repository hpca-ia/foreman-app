// Desde el desglose de un rubro del control se abre la factura de cada gasto.
// La interacción se prueba en pantalla; acá, que la pantalla la conecta bien.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const vista = readFileSync(new URL("../src/modules/controlObra/VistaObra.jsx", import.meta.url), "utf8");
const tabla = readFileSync(new URL("../src/modules/controlObra/TablaControl.jsx", import.meta.url), "utf8");

test("quien registra facturas la abre para corregirla; los demás ven el papel", () => {
  assert.match(vista, /onAbrirFactura=\{!puede \|\| puede\("facturas\.registrar"\)\s*\? f => setFacturaAbierta\(f\)\s*: f => \(f\.archivo_url \? abrirArchivo\(f\.archivo_url\) : null\)\}/);
});

test("la factura se abre con los rubros del control y sus asignaciones, y al guardar el control se rehace", () => {
  assert.match(vista, /<ModalFactura actividades=\{actividades\} control=\{porRubro\}\s*obra=\{obra\} rubros=\{rubrosControl\}/);
  assert.match(vista, /asignacionesFactura=\{asignaciones\.filter\(a => a\.factura_id === facturaAbierta\.id\)\}/);
  assert.match(vista, /onGuardado=\{\(\) => \{ setFacturaAbierta\(null\); cargar\(\); \}\}/);
});

test("todos los desgloses de gastos de la tabla tienen la puerta", () => {
  const usos = tabla.match(/<Gastos [^>]*>/g) || [];
  assert.ok(usos.length >= 2);
  usos.forEach(u => assert.match(u, /onAbrir=\{onAbrirFactura\}/));
  // Abrir un gasto no cierra el desglose del rubro.
  assert.match(tabla, /onClick=\{onAbrir \? e => \{ e\.stopPropagation\(\); onAbrir\(g\.factura\); \} : undefined\}/);
});
