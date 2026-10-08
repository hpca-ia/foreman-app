import test from "node:test";
import assert from "node:assert/strict";
import { expandir, ordenar } from "../src/modules/cronograma/armarPropuesta.js";
import { calendario } from "../src/modules/cronograma/cpm.js";

// LA CADENA ENTERA: de lo que devuelve NOVA al cronograma fechado.
//
// Una obra chica de verdad: cinco agrupaciones, una importada que se parte en
// anticipo / fabricación / instalación, y traslapes.

const cal = calendario({ laborables: [1, 2, 3, 4, 5, 6] });
const agrupaciones = [
  { id: 10, nombre: "PRELIMINARES", orden: 1 },
  { id: 11, nombre: "ESTRUCTURA METÁLICA", orden: 2 },
  { id: 12, nombre: "MAMPOSTERÍA", orden: 3 },
  { id: 13, nombre: "VENTANERÍA IMPORTADA", orden: 4 },
  { id: 14, nombre: "ACABADOS", orden: 5 },
];

const deNova = {
  actividades: [
    { id: 10, dias: 8, porque: "limpieza y replanteo" },
    { id: 11, dias: 25, porque: "180 m2 / 1 cuadrilla x 7 m2 dia" },
    { id: 12, dias: 20, porque: "620 m2 / 2 cuadrillas x 16 m2 dia" },
    { id: 13, dias: 70, porque: "importada",
      partes: [["anticipo", 1, 50], ["fabricación", 55, 40], ["instalación", 14, 10]] },
    { id: 14, dias: 18, porque: "acabados generales" },
  ],
  dependencias: [[10, 11, 0], [11, 12, -6], [12, 14, 0], [13, 14, 0]],
};

const armado = () => ordenar(deNova, agrupaciones, cal);

test("ESTÁN TODAS LAS AGRUPACIONES, ni una más ni una menos", () => {
  // El cronograma es el espejo del control: si dice otra cosa, los dos
  // documentos dejan de poder compararse y no sirve ninguno.
  const r = armado();
  const ids = new Set(r.actividades.map(a => a.agrupacion_id));
  assert.deepEqual([...ids].sort((x, y) => x - y), [10, 11, 12, 13, 14]);
});

test("los nombres los pone el control, no NOVA", () => {
  const r = armado();
  const sinEtapa = r.actividades.find(a => a.agrupacion_id === 12);
  assert.equal(sinEtapa.nombre, "MAMPOSTERÍA");
});

test("salen en el orden del control de obra", () => {
  const r = armado();
  const orden = r.actividades.map(a => a.agrupacion_id);
  assert.deepEqual(orden, [...orden].sort((x, y) => x - y), "el orden del control manda");
});

test("LA IMPORTADA SE PARTE EN TRES, con su nombre libre", () => {
  const r = armado();
  const partes = r.actividades.filter(a => a.agrupacion_id === 13);
  assert.equal(partes.length, 3);
  // El nombre de la parte viaja en el NOMBRE, que es lo que se guarda y lo
  // que se lee en la barra. Y se conserva tal cual: "montaje de estructura" no
  // es una de las cinco etapas de compra, y antes caía en "ejecución"
  // perdiendo el nombre —las tres partes terminaban llamándose igual y el
  // detector de repetidas las fundía en una.
  assert.deepEqual(partes.map(p => p.nombre.split(" · ")[1]),
    ["anticipo", "fabricación", "instalación"]);
  assert.ok(partes.every(p => p.nombre.startsWith("VENTANERÍA IMPORTADA")));
});

test("EL ANTICIPO VA MESES ANTES DE LA INSTALACIÓN, no el mismo día", () => {
  // Es el error que rompía el módulo: las tres partes compartían referencia,
  // el motor no podía fecharlas por separado y salían las tres juntas.
  const r = armado();
  const partes = r.actividades.filter(a => a.agrupacion_id === 13);
  const refs = partes.map(p => p.ref);
  assert.equal(new Set(refs).size, 3, "cada parte con su propia referencia");
  const cadena = r.dependencias.filter(d => refs.includes(d.de) && refs.includes(d.a));
  assert.equal(cadena.length, 2, "van encadenadas en fila india");
});

test("los pesos de una agrupación partida cierran en 100", () => {
  // Si no, su plata entra de menos o de más al valorado y el total deja de
  // dar el presupuesto.
  const r = armado();
  const suma = r.actividades.filter(a => a.agrupacion_id === 13)
    .reduce((t, a) => t + a.peso, 0);
  assert.equal(Math.round(suma), 100);
});

test("el traslape se conserva con su signo", () => {
  const r = armado();
  assert.ok(r.dependencias.some(d => d.retardo === -6), "el -6 entre estructura y mampostería");
});

test("el plan tiene fechas: ninguna actividad queda sin calcular", () => {
  const r = armado();
  assert.ok(r.dias > 0, "la obra tiene que durar algo");
  assert.ok(r.criticas > 0, "y tener ruta crítica");
});

test("UNA AGRUPACIÓN QUE NOVA OLVIDÓ ENTRA IGUAL", () => {
  // Mejor una barra fea y presente que un rubro desaparecido del plan.
  const r = ordenar({ actividades: [{ id: 10, dias: 5 }], dependencias: [] }, agrupaciones, cal);
  assert.equal(new Set(r.actividades.map(a => a.agrupacion_id)).size, 5);
  assert.equal(r.olvidadas, 4);
});

test("UNA ACTIVIDAD INVENTADA SE TIRA", () => {
  const r = ordenar({ actividades: [{ id: 999, dias: 5 }, { id: 10, dias: 5 }], dependencias: [] },
    agrupaciones, cal);
  assert.ok(!r.actividades.some(a => a.agrupacion_id === 999));
  assert.equal(r.inventadas, 1);
});

test("un círculo se rompe y el plan igual sale con fechas", () => {
  const r = ordenar({ actividades: deNova.actividades,
    dependencias: [[10, 11, 0], [11, 10, 0]] }, agrupaciones, cal);
  assert.ok(r.dias > 0, "tiene que poder fecharse igual");
});

test("una respuesta vacía no deja la obra sin cronograma", () => {
  const r = ordenar({ actividades: [], dependencias: [] }, agrupaciones, cal);
  assert.equal(r.actividades.length, 5, "entran las cinco del control");
});

test("«después de la ventanería» significa después de su ÚLTIMA parte", () => {
  const r = armado();
  const partes = r.actividades.filter(a => a.agrupacion_id === 13);
  const ultima = partes[partes.length - 1].ref;
  const acabados = r.actividades.find(a => a.agrupacion_id === 14).ref;
  assert.ok(r.dependencias.some(d => d.de === ultima && d.a === acabados),
    "la agrupación termina cuando termina lo último, no cuando se paga el anticipo");
});
