import test from "node:test";
import assert from "node:assert/strict";
import { emparejarPorTexto, candidatosPara, pedidoDeEmparejamiento }
  from "../src/modules/controlObra/emparejarRubros.js";

// El presupuesto de esta obra se armo con una cotizacion vieja del mismo
// proveedor: muchos renglones dicen EXACTAMENTE lo mismo que su rubro.
const rubros = [
  { id: 91, numero: 91, descripcion: "Tablero Trifasico de 20 espacios -PRINCIPAL", unidad: "U", cantidad: 1 },
  { id: 92, numero: 92, descripcion: "Tablero Bifasico de 12 espacios-REGULADOS", unidad: "U", cantidad: 1 },
  { id: 3, numero: 3, descripcion: "IMSTALACION DE ACOMETIDA ELECTRICA PROVISIONAL, TABLERO Y LUMINARIAS",
    unidad: "glb", cantidad: 1 },
  { id: 95, numero: 95, descripcion: "Alimentador 3X12 THHN AWG para circuitos de iluminacion", unidad: "ML", cantidad: 200 },
];

test("el mismo texto no es una decision: es una comparacion, y la hace la computadora", () => {
  // Dos cadenas iguales son dos cadenas iguales, hoy y dentro de un año, con
  // el mismo resultado. Eso no se le pregunta a un modelo.
  const r = emparejarPorTexto([
    { descripcion: "Tablero Trifasico de 20 espacios -PRINCIPAL", cantidad: 1, unidad: "U" },
    { descripcion: "tablero bifasico de 12 espacios regulados", cantidad: 1, unidad: "U" },
    { descripcion: "Breaker 1P-16A", cantidad: 20, unidad: "U" },
  ], rubros);
  assert.equal(r.items[0].rubro_id, 91);
  assert.equal(r.items[0].porTexto, true);
  assert.equal(r.items[1].rubro_id, 92);   // acentos y puntuacion no deciden
  assert.equal(r.items[2].rubro_id, undefined);
  assert.equal(r.ciertos, 2);
});

test("si la unidad se contradice, el texto igual no alcanza", () => {
  const r = emparejarPorTexto(
    [{ descripcion: "IMSTALACION DE ACOMETIDA ELECTRICA PROVISIONAL, TABLERO Y LUMINARIAS",
      cantidad: 1, unidad: "Mes" }], rubros);
  assert.equal(r.items[0].rubro_id, undefined);
  assert.equal(r.ciertos, 0);
});

test("un texto repetido en dos rubros no identifica a ninguno", () => {
  // Elegir el primero seria acertar la mitad de las veces, que es peor que no
  // contestar: el que no contesta se revisa, el que acierta a medias no.
  const dos = [{ id: 1, descripcion: "Punto de iluminacion", unidad: "U", cantidad: 10 },
    { id: 2, descripcion: "Punto de iluminacion", unidad: "U", cantidad: 5 }];
  const r = emparejarPorTexto([{ descripcion: "Punto de iluminacion", cantidad: 3, unidad: "U" }], dos);
  assert.equal(r.items[0].rubro_id, undefined);
});

test("al modelo se le pregunta entre cinco candidatos, no entre ciento setenta", () => {
  const c = candidatosPara({ descripcion: "Tablero Bifasico de 12 espacios para regulados", unidad: "U" }, rubros);
  assert.equal(c[0].id, 92);
  // El de glb no entra: mide otra cosa.
  assert.equal(c.some(x => x.id === 3), false);
});

test("un renglon sin ningun candidato no se pregunta: ya se sabe que va sin rubro", () => {
  // Preguntarlo es darle una oportunidad de inventar uno.
  const p = pedidoDeEmparejamiento([{ descripcion: "Cafe para la obra", cantidad: 1, unidad: "U" }], rubros);
  assert.equal(p.indices.length, 0);
  assert.equal(p.texto, "");
});

test("el pedido numera los renglones y lista sus candidatos con el id real", () => {
  const p = pedidoDeEmparejamiento([
    { descripcion: "Tablero Trifasico de 20 espacios", cantidad: 1, unidad: "U" },
    { descripcion: "Alimentador 3x12 THHN para iluminacion", cantidad: 200, unidad: "ML" },
  ], rubros);
  assert.equal(p.indices.length, 2);
  assert.match(p.texto, /^1\. Tablero Trifasico/);
  assert.match(p.texto, /91 = Tablero Trifasico de 20 espacios -PRINCIPAL/);
  assert.match(p.texto, /95 = Alimentador/);
});
