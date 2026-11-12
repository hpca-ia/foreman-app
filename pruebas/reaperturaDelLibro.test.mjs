// La reapertura de un día del libro se ve en FOREMAN y no en lo que lee el cliente.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NOTA_DE_REAPERTURA, notaDeReapertura, esNotaDeReapertura, paraElPapel } from "../src/modules/libro/reapertura.js";
import * as servidor from "../api/_reaperturaDelLibro.js";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = f => fs.readFileSync(path.join(raiz, f), "utf8");

// Como están en el libro del Aeropuerto: la observación que dejó cada reapertura, entre las demás.
const entradas = [
  { id: 1, categoria: "actividades", contenido: "Derrocamiento de mampostería en el ingreso principal." },
  { id: 2, categoria: "observaciones", contenido: "Se reabrió el día para completarlo o corregirlo: ." },
  { id: 3, categoria: "observaciones", contenido: "Se reabrió el día para completarlo o corregirlo: No alcanzaron" },
  { id: 4, categoria: "observaciones", contenido: "Orden y limpieza continua en instalaciones aeroportuarias." },
  { id: 5, categoria: "observaciones", contenido: "El cliente pidió que se reabriera el acceso lateral el lunes." },
];

test("la observación que deja una reapertura no va al papel; las demás sí, todas", () => {
  assert.deepEqual(paraElPapel(entradas).map(e => e.id), [1, 4, 5]);
});

test("una observación de verdad que habla de reabrir algo no se confunde con la automática", () => {
  assert.equal(esNotaDeReapertura(entradas[4]), false);
  assert.equal(esNotaDeReapertura({ contenido: "Se reabrió la zanja del eje 3 para revisar la tubería." }), false);
});

test("la observación se escribe con el mismo texto con el que después se la reconoce", () => {
  const escrita = notaDeReapertura("Residente no alcanzó a abrir");
  assert.equal(escrita, "Se reabrió el día para completarlo o corregirlo: Residente no alcanzó a abrir");
  assert.equal(esNotaDeReapertura({ contenido: escrita }), true);
  // Y la reapertura la escribe con esa función, no con un texto suelto que pueda cambiar solo.
  const libro = leer("src/modules/libro/libro.js");
  assert.match(libro, /anotar\(dia, "observaciones", notaDeReapertura\(porque\), quien\)/);
  assert.equal(/Se reabri[oó] el d[ií]a para/.test(libro.split("\n").filter(l => !/^\s*(\/\/|\*)/.test(l)).join("\n")), false);
});

test("sin entradas, o con una vacía, no se rompe", () => {
  assert.deepEqual(paraElPapel([]), []);
  assert.deepEqual(paraElPapel(null), []);
  assert.equal(esNotaDeReapertura({}), false);
  assert.equal(esNotaDeReapertura(null), false);
});

test("el servidor reconoce lo mismo que la aplicación", () => {
  assert.equal(servidor.NOTA_DE_REAPERTURA, NOTA_DE_REAPERTURA);
  assert.deepEqual(servidor.paraElCliente(entradas).map(e => e.id), paraElPapel(entradas).map(e => e.id));
  // Si la base contesta un error en vez de filas, no hay entradas y no se rompe.
  assert.deepEqual(servidor.paraElCliente({ message: "error" }), []);
});

// ── Que no vuelva a aparecer en lo que lee el cliente ──────────────────────

test("el PDF del libro no dibuja nada que diga que el día se reabrió", () => {
  const codigo = leer("src/modules/libro/pdfDiaDeObra.js").split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  assert.equal(/reabiert|reabri|reapertura/i.test(codigo.replace(/import \{ paraElPapel \} from "\.\/reapertura\.js";/, "")), false,
    "el dibujo del día no puede leer ni escribir nada de la reapertura");
  assert.match(codigo, /paraElPapel\(entradas\)/);
});

test("la página donde el cliente revisa el libro saca esas observaciones, y no le promete que se le avisa", () => {
  assert.match(leer("api/portal.js"), /for \(const e of sinReaperturas\(entradas\)\)/);
  for (const f of ["api/_aviso-libro.js", "src/portal/FirmaDelLibro.jsx"]) {
    assert.equal(/fue reabierto|reabrir un d[ií]a/i.test(leer(f)), false, `${f} todavía le habla al cliente de reabrir`);
  }
});
