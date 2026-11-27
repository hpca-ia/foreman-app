import test from "node:test";
import assert from "node:assert/strict";
import { queEsLaCarpeta, quePedir, armarIndice, indiceEnCsv } from "../src/lib/carpetasDeArchivos.js";

test("reconoce las dos formas de carpeta: obra-12 y obras/12", () => {
  assert.equal(queEsLaCarpeta("obra-12").tipo.tabla, "obras");
  assert.equal(queEsLaCarpeta("obra-12").id, 12);
  assert.equal(queEsLaCarpeta("obras/12").tipo.tabla, "obras");
  assert.equal(queEsLaCarpeta("presupuestos/7/").id, 7);
  assert.equal(queEsLaCarpeta("compra-311").tipo.tabla, "compras_solicitudes");
});

test("obras-12 o obra/12 no se confunden: cada prefijo con su forma", () => {
  assert.equal(queEsLaCarpeta("obras-12").tipo, undefined);
  assert.equal(queEsLaCarpeta("obra/12").tipo, undefined);
});

test("lo que no es de una ficha se dice, no se inventa", () => {
  assert.equal(queEsLaCarpeta("empresa").que, "Logo de la empresa");
  assert.equal(queEsLaCarpeta("cualquier-cosa").que, "Sin identificar");
});

test("se pide cada id una vez por tabla", () => {
  const p = quePedir(["obra-1", "obras/1", "obra-2", "proyecto-9"].map(queEsLaCarpeta));
  assert.deepEqual(p.obras.ids.sort(), [1, 2]);
  assert.deepEqual(p.leads.ids, [9]);
});

test("cada carpeta lleva su nombre y el proyecto al que pertenece", () => {
  const carpetas = ["obra-1", "compra-50", "orden-3", "proyecto-9", "acta-4"].map(queEsLaCarpeta);
  const filas = {
    obras: [{ id: 1, nombre: "Aeropuerto", lead_id: 9 }],
    leads: [{ id: 9, nombre: "Diners Plaza Lagos" }],
    compras_solicitudes: [{ id: 50, descripcion: "Cemento", lead_id: 9, obra_id: 1 }],
    ordenes_cambio: [{ id: 3, numero: 2, codigo: null, titulo: "Cielo falso", obra_id: 1 }],
    obra_actas: [{ id: 4, numero: 5, fecha: "2026-11-20", lead_id: 9 }],
  };
  const i = Object.fromEntries(armarIndice(carpetas, filas).map(x => [x.carpeta, x]));
  assert.equal(i["obra-1"].nombre, "Aeropuerto");
  assert.equal(i["obra-1"].proyecto, "Diners Plaza Lagos");
  assert.equal(i["compra-50"].nombre, "Compra 50 · Cemento");
  assert.equal(i["orden-3"].nombre, "OC-02 · Cielo falso");
  assert.equal(i["orden-3"].proyecto, "Diners Plaza Lagos"); // por la obra
  assert.equal(i["proyecto-9"].proyecto, "Diners Plaza Lagos");
  assert.equal(i["acta-4"].obra, "");
});

test("si la ficha se borró, la carpeta queda marcada y no se cae", () => {
  const [x] = armarIndice([queEsLaCarpeta("obra-99")], { obras: [] });
  assert.equal(x.borrada, true);
  assert.equal(x.id, 99);
});

test("el CSV se abre en Excel en español: punto y coma, tildes y comillas", () => {
  const csv = indiceEnCsv([{ carpeta: "obra-1", que: "Obra", id: 1, nombre: 'Casa "A"; B', proyecto: "Ñaño", obra: "" }]);
  assert.ok(csv.startsWith("﻿Carpeta;Qué es;Id"));
  assert.ok(csv.includes('"Casa ""A""; B"'));
});

// ── Por proyecto ──
import { carpetaDeLaRuta, porProyecto, nombreLegible, destinoLegible } from "../src/lib/carpetasDeArchivos.js";

const FILAS = {
  obras: [{ id: 1, nombre: "Aeropuerto", lead_id: 9 }],
  leads: [{ id: 9, nombre: "Diners Plaza Lagos" }],
  compras_solicitudes: [{ id: 50, descripcion: "Cemento", lead_id: 9, obra_id: 1 }],
};
const INDICE = armarIndice(["obra-1", "obras/1", "compra-50", "proyecto-9", "empresa", "obra-77"].map(queEsLaCarpeta), FILAS);
const de = c => INDICE.find(i => i.carpeta === c);

test("la carpeta de un archivo, en las dos formas", () => {
  assert.equal(carpetaDeLaRuta("obra-1/123-x.pdf"), "obra-1");
  assert.equal(carpetaDeLaRuta("obras/1/presupuesto-original-1.xlsx"), "obras/1");
  assert.equal(carpetaDeLaRuta("proyecto-9/cliente/1-a.pdf"), "proyecto-9");
});

test("por proyecto: el proyecto con sus grupos, y lo suelto al final", () => {
  const p = porProyecto(INDICE);
  assert.deepEqual(p.map(x => x.proyecto), ["Diners Plaza Lagos", "Empresa", "Fichas borradas"]);
  assert.deepEqual(p[0].grupos.map(g => g.grupo), ["Archivos del proyecto", "Compras", "Facturas", "Presupuesto original de la obra"]);
});

test("el nombre del archivo se lee con fecha y hora de Ecuador", () => {
  // 1764186000000 = 2025-11-26 19:40:00 UTC = 14:40 en Ecuador
  assert.equal(nombreLegible("1764186000000-factura_ferreteria.pdf"), "2025-11-26 14.40.00 factura_ferreteria.pdf");
  assert.equal(nombreLegible("1764186000000-2-foto.jpg"), "2025-11-26 14.40.00 (2) foto.jpg");
  assert.equal(nombreLegible("visto-123.pdf"), "visto-123.pdf");
});

test("dónde va cada archivo en el respaldo por proyecto", () => {
  assert.equal(destinoLegible(de("obra-1"), "obra-1/1764186000000-f.pdf"), "Diners Plaza Lagos/Facturas/Aeropuerto/2025-11-26 14.40.00 f.pdf");
  assert.equal(destinoLegible(de("compra-50"), "compra-50/1764186000000-p.pdf"), "Diners Plaza Lagos/Compras/Compra 50 · Cemento/2025-11-26 14.40.00 p.pdf");
  assert.equal(destinoLegible(de("proyecto-9"), "proyecto-9/cliente/1764186000000-a.pdf"), "Diners Plaza Lagos/Archivos del proyecto/cliente/2025-11-26 14.40.00 a.pdf");
  assert.equal(destinoLegible(de("obra-77"), "obra-77/x.pdf"), "Fichas borradas/Facturas/obra-77/x.pdf");
});

test("lo que Dropbox no acepta en un nombre se cambia por un guion", () => {
  const [i] = armarIndice([queEsLaCarpeta("proyecto-9")], { leads: [{ id: 9, nombre: 'Casa A/B: "lote" 3.' }] });
  assert.equal(destinoLegible(i, "proyecto-9/x.pdf"), "Casa A-B- -lote- 3/Archivos del proyecto/x.pdf");
});

test("el servidor usa la misma regla: api/_carpetasDeArchivos.js es copia de la de la app", async () => {
  const { readFile } = await import("node:fs/promises");
  const app = await readFile(new URL("../src/lib/carpetasDeArchivos.js", import.meta.url), "utf8");
  const servidor = await readFile(new URL("../api/_carpetasDeArchivos.js", import.meta.url), "utf8");
  assert.ok(servidor.endsWith(app), "Cambiaste una y no la otra: copia src/lib/carpetasDeArchivos.js debajo del encabezado de api/_carpetasDeArchivos.js");
});
