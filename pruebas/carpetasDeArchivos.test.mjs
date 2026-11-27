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
