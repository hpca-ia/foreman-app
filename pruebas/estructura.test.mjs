import test from "node:test";
import assert from "node:assert/strict";
import { estructura } from "../src/modules/presupuestos/estructura.js";

// Lo que esta función no copia, para el documento no existe: el PDF se arma
// con lo que sale de acá y nada más. Se le escaparon la etapa y la nota, y el
// resultado fue un documento que anunciaba las etapas con la columna en blanco.

const capitulos = [{ nombre: "OBRA GRIS", orden: 1 }];
const items = [
  { capitulo: "OBRA GRIS", orden: 1, descripcion: "Replanteo", unidad: "m2", cantidad: 10, precio_unitario: 2, total: 20, etapa: "ETAPA 1" },
  { capitulo: "OBRA GRIS", orden: 2, descripcion: "Mampostería", unidad: "m2", cantidad: 5, precio_unitario: 10, total: 50, etapa: "ETAPA 2", nota: "falta la cotización" },
];

test("la etapa de cada rubro llega al documento", () => {
  const caps = estructura({ capitulos, items });
  assert.deepEqual(caps[0].rubros.map(r => r.etapa), ["ETAPA 1", "ETAPA 2"]);
});

test("la advertencia escrita a mano también", () => {
  const caps = estructura({ capitulos, items });
  assert.equal(caps[0].rubros[1].nota, "falta la cotización");
});

test("un rubro sin etapa ni nota no inventa nada", () => {
  const caps = estructura({ capitulos, items: [{ capitulo: "OBRA GRIS", descripcion: "X", total: 1 }] });
  assert.equal(caps[0].rubros[0].etapa, "");
  assert.equal(caps[0].rubros[0].nota, "");
});

test("el rubro lleva su id: es con lo que se elige si su nota sale", () => {
  const caps = estructura({
    capitulos: ["ALBAÑILERÍA"],
    items: [{ id: 77, capitulo: "ALBAÑILERÍA", descripcion: "Tabique", nota: "Rubro omitido por error", total: 10 }],
  });
  assert.equal(caps[0].rubros[0].id, 77);
  assert.equal(caps[0].rubros[0].nota, "Rubro omitido por error");
});

// LOS EXTRAS SUMAN APARTE. El presupuesto de un cliente trae, en cada
// capítulo, una línea "Extras (describir)" con rubros debajo: tienen que salir
// al final del capítulo y con su propio subtotal, sin mezclarse con lo pedido.
test("los extras van al final del capítulo y suman aparte", () => {
  const conExtras = [
    { capitulo: "OBRA GRIS", orden: 1, descripcion: "Extra: muro adicional", total: 30, extra: true },
    { capitulo: "OBRA GRIS", orden: 2, descripcion: "Replanteo", total: 20 },
    { capitulo: "OBRA GRIS", orden: 3, descripcion: "Mampostería", total: 50 },
  ];
  const [c] = estructura({ capitulos, items: conExtras });
  assert.deepEqual(c.rubros.map(r => r.descripcion), ["Replanteo", "Mampostería", "Extra: muro adicional"]);
  assert.deepEqual(c.rubros.map(r => r.numero), ["1.1", "1.2", "1.3"]);
  assert.equal(c.rubros[2].extra, true);
  assert.equal(c.subtotalBase, 70);
  assert.equal(c.subtotalExtras, 30);
  assert.equal(c.subtotal, 100);
  assert.equal(c.hayExtras, true);
});

test("un capítulo sin extras no dice que los tiene", () => {
  const [c] = estructura({ capitulos, items });
  assert.equal(c.hayExtras, false);
  assert.equal(c.subtotalExtras, 0);
  assert.equal(c.subtotalBase, c.subtotal);
});

// NO COTIZA. Un rubro marcado así no va en el cuadro de precios —un renglón
// sin precio parece un olvido—: va al pie, con el porqué.
import { noCotizados, motivoNoCotiza } from "../src/modules/presupuestos/estructura.js";

test("los rubros NO COTIZA se quedan en el cuadro, marcados, y van también al pie con su motivo", () => {
  const conNoCotiza = [
    { id: 1, capitulo: "OBRA GRIS", orden: 1, descripcion: "Replanteo", total: 20 },
    { id: 2, capitulo: "OBRA GRIS", orden: 2, descripcion: "Acometida eléctrica", total: 0, nota: "NO COTIZA - la hace la empresa eléctrica" },
    { id: 3, capitulo: "OBRA GRIS", orden: 3, descripcion: "Mampostería", total: 50 },
  ];
  const [c] = estructura({ capitulos, items: conNoCotiza });
  assert.deepEqual(c.rubros.map(r => r.descripcion), ["Replanteo", "Acometida eléctrica", "Mampostería"]);
  assert.deepEqual(c.rubros.map(r => r.numero), ["1.1", "1.2", "1.3"]);
  assert.deepEqual(c.rubros.map(r => r.noCotiza), [false, true, false]);
  const pie = noCotizados({ capitulos, items: conNoCotiza });
  assert.equal(pie.length, 1);
  assert.equal(pie[0].descripcion, "Acometida eléctrica");
  assert.equal(pie[0].motivo, "la hace la empresa eléctrica");
});

test("el motivo es lo que la nota dice además de NO COTIZA", () => {
  assert.equal(motivoNoCotiza("No cotiza: lo provee el cliente"), "lo provee el cliente");
  assert.equal(motivoNoCotiza("no se cotiza (falta diseño)"), "falta diseño");
  assert.equal(motivoNoCotiza("NO COTIZA"), "");
});

test("una nota cualquiera no marca al rubro como NO COTIZA", () => {
  const [c] = estructura({ capitulos, items: [{ capitulo: "OBRA GRIS", descripcion: "X", total: 1, nota: "precio cotizado ayer" }] });
  assert.equal(c.rubros[0].noCotiza, false);
});

// LAS HOJAS DEL EXCEL: cuánto cuesta cada una.
import { porBloques, bloqueDe } from "../src/modules/presupuestos/estructura.js";

test("los capítulos se agrupan por la hoja de donde vinieron", () => {
  const caps = [
    { nombre: "CASA PRINCIPAL · PRELIMINARES", subtotal: 100, subtotalBase: 100, subtotalExtras: 0 },
    { nombre: "CASA PRINCIPAL · OBRA GRIS", subtotal: 300, subtotalBase: 250, subtotalExtras: 50 },
    { nombre: "VIVIENDA CUIDADOR · OBRA GRIS", subtotal: 80, subtotalBase: 80, subtotalExtras: 0 },
  ];
  const b = porBloques(caps);
  assert.deepEqual(b.map(x => [x.nombre, x.subtotal, x.subtotalBase, x.subtotalExtras]),
    [["CASA PRINCIPAL", 400, 350, 50], ["VIVIENDA CUIDADOR", 80, 80, 0]]);
  assert.equal(bloqueDe("PRELIMINARES"), "");
});

test("con una sola hoja no se agrupa", () => {
  assert.equal(porBloques([{ nombre: "CASA · A", subtotal: 1 }, { nombre: "CASA · B", subtotal: 2 }]), null);
  assert.equal(porBloques([{ nombre: "A", subtotal: 1 }]), null);
});
