// El cronograma impreso: lo que está en ejecución se tiene que ver, con su
// porcentaje, y las flechas se pueden dejar afuera.
//
// Hernán, 24/11/2026, con el PDF del Aeropuerto en la mano: «Al imprimir pdf,
// opción de que no salgan las conexiones... no se ve bien. Las barras no se
// ven las que están ejecutándose y falta un porcentaje».
//
// Lo que faltaba de una barra en curso era una franja blanca ADENTRO de la
// barra, con 1,8 mm restados a su alto. Con línea base la barra mide 2 mm, y a
// la franja le quedaban 0,2: no se veía, y las seis actividades en ejecución
// salían iguales a las demás.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aclarado, hechoDe, tramoQueFalta } from "../src/modules/cronograma/avanceEnBarra.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

test("lo que falta es el resto de la barra, a todo su alto: 30 % hecho deja el 70 % aclarado", () => {
  // Counter en hormigón, del 19 al 27/11: 9 días a 3,1 mm, al 30 %.
  const t = tramoQueFalta({ xBarra: 100, anchoTotal: 27.9, avance: 30, xVisible: 100, anchoVisible: 27.9 });
  assert.equal(Math.round(t.desde * 100) / 100, 108.37);
  assert.equal(Math.round(t.ancho * 100) / 100, 19.53);
  assert.equal(Math.round((t.desde + t.ancho) * 100) / 100, 127.9, "llega hasta el final de la barra");
});

test("la que no empezó y la que terminó no tienen tramo claro", () => {
  const b = { xBarra: 100, anchoTotal: 30, xVisible: 100, anchoVisible: 30 };
  assert.equal(tramoQueFalta({ ...b, avance: 0 }), null);
  assert.equal(tramoQueFalta({ ...b, avance: 100 }), null);
  assert.equal(tramoQueFalta({ ...b, avance: null }), null);
  assert.equal(tramoQueFalta({ ...b, avance: 140 }), null, "más de cien es cien");
});

test("una barra partida entre dos hojas reparte su avance sobre la barra entera", () => {
  // 40 mm de barra, al 50 %: 30 mm caen en esta hoja y 10 en la que sigue.
  const entera = { xBarra: 200, anchoTotal: 40, avance: 50 };
  // Primera hoja: se ven los primeros 30 mm. Lo hecho llega a 220, falta de 220 a 230.
  assert.deepEqual(tramoQueFalta({ ...entera, xVisible: 200, anchoVisible: 30 }), { desde: 220, ancho: 10 });
  // Segunda hoja: la barra empezó 30 mm antes del borde (96). Todo lo que se ve falta.
  assert.deepEqual(tramoQueFalta({ ...entera, xBarra: 66, xVisible: 96, anchoVisible: 10 }), { desde: 96, ancho: 10 });
  // Al 90 %: lo que falta cae entero en la segunda hoja, y en la primera no hay tramo claro.
  assert.equal(tramoQueFalta({ ...entera, avance: 90, xVisible: 200, anchoVisible: 30 }), null);
});

test("el tramo claro es el color de la barra aclarado como en la pantalla, y el avance sale entero", () => {
  assert.deepEqual(aclarado([15, 61, 62]), [147, 168, 168]);
  assert.deepEqual(aclarado([185, 28, 28]), [224, 153, 153]);
  const gantt = codigoDe("../src/modules/cronograma/TablaGantt.jsx");
  assert.match(gantt, /background: "rgba\(255,255,255,\.55\)"/, "el mismo 55 % de blanco que usa la pantalla");
  assert.equal(hechoDe({ avance: 29.6 }), 30);
  assert.equal(hechoDe({ avance: "80" }), 80);
  assert.equal(hechoDe({}), 0);
  assert.equal(hechoDe({ avance: 250 }), 100);
});

test("el PDF: tramo claro a todo el alto, columna de avance con el corte, y flechas optativas", () => {
  const c = codigoDe("../src/modules/cronograma/pdfCronograma.js");
  // La franja blanca de 0,2 mm no vuelve.
  assert.doesNotMatch(c, /alto - 1\.8/);
  assert.match(c, /doc\.setFillColor\(\.\.\.aclarado\(color\)\);\s+doc\.rect\(falta\.desde, y \+ 1\.3, falta\.ancho, alto, "F"\);/);
  assert.match(c, /const falta = tramoQueFalta\(\{ xBarra: M \+ IZQ \+ \(d1 - desdeDia\) \* MM_DIA, anchoTotal: \(d2 - d1 \+ 1\) \* MM_DIA,/);
  // El porcentaje, escrito, cuando hay fecha de corte; en negrita lo que está en ejecución.
  assert.match(c, /const conAvance = !!corte;/);
  assert.match(c, /if \(conAvance\) doc\.text\("AVANCE", M \+ X_AVANCE, yDia, \{ align: "right" \}\);/);
  assert.match(c, /doc\.text\(`\$\{hecho\} %`, M \+ X_AVANCE, y \+ FILA - 1\.7, \{ align: "right" \}\);/);
  assert.match(c, /doc\.setFont\("helvetica", enCurso \? "bold" : "normal"\);/);
  // Las tres columnas entran en el mismo ancho: el calendario no pierde días.
  assert.match(leer("../src/modules/cronograma/pdfCronograma.js"), /export const IZQUIERDA = 86;/);
  assert.match(c, /const X_AVANCE = 84\.5;/);
  // Sin flechas no van ni las marcas de la otra punta, ni su renglón en la leyenda.
  assert.match(c, /corte = null, conCadenas = true \}, hoja = "a4"\)/);
  assert.match(c, /if \(!conCadenas \|\| !dependencias\.length\) return;/);
  assert.match(c, /conCadenas && dependencias\.length \? "Flecha ámbar: la que traba" : "",/);
});

// Hernán, 24/11/2026, al ver la muestra: «empareja». La actividad sin línea
// base —agregada después de firmar— salía más gruesa que las demás, en el PDF
// y en la pantalla, donde ya había preguntado por qué había barras más gruesas.
test("con línea base todas las barras miden lo mismo, tengan o no su raya", () => {
  const pdf = codigoDe("../src/modules/cronograma/pdfCronograma.js");
  assert.match(pdf, /const alto = FILA - \(conBase \? 3\.6 : 2\.6\);/);
  assert.doesNotMatch(pdf, /FILA - \(f\.base \? 3\.6 : 2\.6\)/);
  const gantt = codigoDe("../src/modules/cronograma/TablaGantt.jsx");
  assert.match(gantt, /bottom: tenue \? 5 : ui\.baseDe \? 6 : 0,/);
  assert.doesNotMatch(gantt, /bottom: tenue \? 5 : sombra \? 6 : 0,/);
});

test("la pantalla: se elige antes del tamaño, se recuerda, y el PDF recibe el corte", () => {
  const p = codigoDe("../src/modules/cronograma/ModuloCronograma.jsx");
  assert.match(p, /localStorage\.getItem\("foreman_pdf_crono_sin_flechas"\) !== "1"/);
  assert.match(p, /localStorage\.setItem\("foreman_pdf_crono_sin_flechas", quiere \? "0" : "1"\)/);
  assert.match(p, /<input type="checkbox" checked=\{pdfConCadenas\} disabled=\{pensando\}\s+onChange=\{e => ponerCadenasEnPdf\(e\.target\.checked\)\}/);
  assert.match(p, /resumen: resumenParaPdf\(\), corte: corteISO, conCadenas: pdfConCadenas,/);
  // El visto va arriba de los tamaños: tocar un tamaño ya baja el PDF.
  assert.ok(p.indexOf('className="pdf-con-cadenas"') < p.indexOf("Object.entries(HOJAS).map"));
});
