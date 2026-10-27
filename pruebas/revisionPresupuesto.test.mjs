import test from "node:test";
import assert from "node:assert/strict";
import { interpretarPresupuesto, aplicarDecisiones, estaDecidida } from "../src/modules/controlObra/leerPresupuesto.js";

// LA REVISIÓN TIENE QUE SEGUIR LADRANDO.
//
// Estas reglas estuvieron mudas y nadie se dio cuenta hasta que alguien
// importó un presupuesto y dijo "antes me encontraba errores y ahora no". Una
// comprobación que se apaga sola es peor que no tenerla: se confía en ella.

const MAPA = { fila_encabezado: 1, col_item: 0, col_descripcion: 1, col_unidad: 2, col_cantidad: 3, col_precio: 4, col_total: 5, col_capitulo: null };
const enc = ["RUBRO", "DESCRIPCION", "UNIDAD", "CANTIDAD", "P.UNITARIO", "TOTAL"];
const de = (r, tipo) => (r.advertencias || []).find(a => a.tipo === tipo);

test("una fila que no multiplica se calcula, y se denuncia con lo que decía el Excel", () => {
  const hoja = [
    ["PRESUPUESTO", "", "", "", "", ""],
    enc,
    ["", "PRELIMINARES", "", "", "", 1300],
    ["1", "Cerramiento", "ml", 100, 10, 1000],
    ["2", "Replanteo", "m2", 50, 2, 100],
    // 10 × 20 = 200, pero el Excel dice 300.
    ["3", "Desalojo", "m3", 10, 20, 300],
    ["", "TOTAL", "", "", "Valor total", 1400],
  ];
  const r = interpretarPresupuesto(hoja, { ...MAPA });
  const a = de(r, "suma_fila");
  assert.ok(a, "tiene que avisar que una fila no multiplica");
  assert.equal(a.nivel, "error");
  // UN PRESUPUESTO SE CALCULA: vale cantidad × precio, no el total escrito...
  const x = r.rubros.find(y => /Desalojo/.test(y.descripcion));
  assert.equal(x.precio_unitario, 20);
  assert.equal(x.total, 200);
  // ...y el aviso dice las dos cosas, para decidir fila por fila.
  assert.match(a.filas[0].texto, /200/);
  assert.match(a.filas[0].texto, /300/);
  assert.equal(a.filas[0].calculado, 200);
  assert.equal(a.filas[0].excel, 300);
});

test("cada fila se decide: la cuenta, el Excel o un precio a mano", () => {
  const hoja = [
    ["PRESUPUESTO", "", "", "", "", ""],
    enc,
    ["", "PRELIMINARES", "", "", "", ""],
    ["1", "Cerramiento", "ml", 100, 10, 1000],
    ["2", "Replanteo", "m2", 50, 2, 100],
    ["3", "Desalojo", "m3", 10, 20, 300],      // la cuenta da 200
    ["4", "Limpieza", "m2", 20, 5, 150],       // la cuenta da 100
    ["5", "Relleno", "m3", 4, 25, 120],        // la cuenta da 100
  ];
  const r = interpretarPresupuesto(hoja, { ...MAPA });
  const i = r.advertencias.findIndex(a => a.tipo === "suma_fila");
  const [f3, f4, f5] = r.advertencias[i].datos.filas;
  const decisiones = { [i]: { porFila: { [f3]: "calcular", [f4]: "excel", [f5]: { mano: 27.5 } } } };
  assert.ok(estaDecidida(r.advertencias[i], decisiones[i]));
  assert.ok(!estaDecidida(r.advertencias[i], { porFila: { [f3]: "calcular" } }), "faltan filas por decidir");
  const final = aplicarDecisiones(r, decisiones);
  const de_ = d => final.rubros.find(y => y.descripcion === d);
  assert.equal(de_("Desalojo").total, 200);
  assert.equal(de_("Limpieza").total, 150);
  assert.equal(de_("Limpieza").precio_unitario, 7.5);
  assert.equal(de_("Relleno").precio_unitario, 27.5);
  assert.equal(de_("Relleno").total, 110);
  // Decidir en bloque sigue andando: "aceptar" es el Excel, "corregir" la cuenta.
  assert.equal(aplicarDecisiones(r, { [i]: "aceptar" }).rubros.find(y => y.descripcion === "Desalojo").total, 300);
  assert.equal(aplicarDecisiones(r, { [i]: "corregir" }).rubros.find(y => y.descripcion === "Desalojo").total, 200);
});

// Con el IVA en columna aparte, cantidad × precio nunca da el total: la regla
// se saltaba entera. Ahora la tasa se conoce y la cuenta se hace bien.
test("con IVA en columna aparte también se revisa que multiplique", () => {
  const encIva = ["RUBRO", "DESCRIPCION", "UNIDAD", "CANTIDAD", "P.UNITARIO", "IVA", "P.U C/IVA", "TOTAL"];
  const mapaIva = { ...MAPA, col_total: 7 };
  const hoja = [
    ["PRESUPUESTO", "", "", "", "", "", "", ""],
    encIva,
    // Precios que no guardan relación con el número de rubro: si no, el
    // buscador de columnas encuentra una combinación falsa que también cuadra.
    ["1", "Uno", "u", 7, 12.4, 1.86, 14.26, 99.82],
    ["2", "Dos", "u", 13, 37.1, 5.565, 42.665, 554.645],
    ["3", "Tres", "u", 4, 8.3, 1.245, 9.545, 38.18],
    ["4", "Cuatro", "u", 21, 55.9, 8.385, 64.285, 1349.985],
    ["5", "Cinco", "u", 9, 21.6, 3.24, 24.84, 223.56],
    // Ésta no multiplica ni con IVA: 6 × 60 × 1,15 = 414, no 900.
    ["6", "Seis", "u", 6, 60, 9, 69, 900],
    ["", "TOTAL", "", "", "Valor total", "", "", 3166.19],
  ];
  const r = interpretarPresupuesto(hoja, { ...mapaIva });
  assert.equal(r.ivaPorFila, 15);
  const a = de(r, "suma_fila");
  assert.ok(a, "con IVA en filas la regla no puede quedarse muda");
  assert.equal(a.filas.length, 1);
  assert.match(a.filas[0].texto, /Seis/);
});

// Cero no suma, así que ninguna comprobación de sumas lo encuentra. Hay que
// ir a buscarlo a propósito: es trabajo que alguien va a hacer sin presupuesto.
test("un rubro que entra en cero se avisa", () => {
  const hoja = [
    ["PRESUPUESTO", "", "", "", "", ""],
    enc,
    ["", "PRELIMINARES", "", "", "", 1000],
    ["1", "Cerramiento", "ml", 100, 10, 1000],
    ["2", "Pintura de fachada", "m2", 300, 0, 0],
    ["", "TOTAL", "", "", "Valor total", 1000],
  ];
  const r = interpretarPresupuesto(hoja, { ...MAPA });
  const a = de(r, "rubro_en_cero");
  assert.ok(a, "un rubro en $0 tiene que avisarse");
  assert.match(a.filas[0].texto, /Pintura de fachada/);
});

// Un error que no existe es peor que ninguno: enseña a saltearse los errores.
test("si el SUBTOTAL del Excel ya incluye los cargos, no se inventa un descuadre", () => {
  const hoja = [
    ["PRESUPUESTO", "", "", "", "", ""],
    enc,
    ["", "PRELIMINARES", "", "", "", 1000],
    ["1", "Cerramiento", "ml", 100, 10, 1000],
    ["", "IMPREVISTOS", "", "", "", 100],
    ["", "SUBTOTAL", "", "", "", 1100],
    ["", "TOTAL", "", "", "Valor total", 1100],
  ];
  const r = interpretarPresupuesto(hoja, { ...MAPA });
  assert.equal(de(r, "suma_subtotal"), undefined, "rubros + cargos dan el subtotal: no hay nada que denunciar");
});

// Una fila mal sumada es UN error, no tres. El subtotal del capítulo suma lo
// que el Excel escribió en las filas: si cuadra con eso, el capítulo está bien
// y no se denuncia de nuevo lo que ya se decide en la fila.
test("una fila mal sumada no se cuenta también como error del capítulo ni del total", () => {
  const hoja = [
    ["PRESUPUESTO", "", "", "", "", ""],
    enc,
    ["", "PRELIMINARES", "", "", "", 1400],
    ["1", "Cerramiento", "ml", 100, 10, 1000],
    ["2", "Replanteo", "m2", 50, 2, 100],
    ["3", "Desalojo", "m3", 10, 20, 300],      // la cuenta da 200
    ["", "TOTAL", "", "", "Valor total", 1400],
  ];
  const r = interpretarPresupuesto(hoja, { ...MAPA });
  assert.ok(de(r, "suma_fila"));
  assert.equal(de(r, "suma_capitulo"), undefined);
  assert.equal(de(r, "suma_total"), undefined);
});
