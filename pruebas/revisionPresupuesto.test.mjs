import test from "node:test";
import assert from "node:assert/strict";
import { interpretarPresupuesto } from "../src/modules/controlObra/leerPresupuesto.js";

// LA REVISIÓN TIENE QUE SEGUIR LADRANDO.
//
// Estas reglas estuvieron mudas y nadie se dio cuenta hasta que alguien
// importó un presupuesto y dijo "antes me encontraba errores y ahora no". Una
// comprobación que se apaga sola es peor que no tenerla: se confía en ella.

const MAPA = { fila_encabezado: 1, col_item: 0, col_descripcion: 1, col_unidad: 2, col_cantidad: 3, col_precio: 4, col_total: 5, col_capitulo: null };
const enc = ["RUBRO", "DESCRIPCION", "UNIDAD", "CANTIDAD", "P.UNITARIO", "TOTAL"];
const de = (r, tipo) => (r.advertencias || []).find(a => a.tipo === tipo);

test("una fila que no multiplica se denuncia, aunque el precio se corrija", () => {
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
  // El precio que se importa queda corregido para que la fila cierre...
  const x = r.rubros.find(y => /Desalojo/.test(y.descripcion));
  assert.equal(x.total, 300);
  assert.equal(x.cantidad * x.precio_unitario, 300);
  // ...pero el aviso dice el que venía escrito, que es lo que hay que corregir.
  assert.match(a.filas[0].texto, /20/);
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
