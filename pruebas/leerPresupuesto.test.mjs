import test from "node:test";
import assert from "node:assert/strict";

test("una celda con palabras no es un numero, y la unidad no aporta digitos", async () => {
  // Dos errores silenciosos del mismo lector. El primero metia un rubro
  // fantasma de $50.100 —el importe escrito en letras al pie— en una lista de
  // ciento setenta, donde no lo ve nadie y desde el contrato se propaga al
  // control, a las planillas y a los beneficios. El segundo leia "80 m2" como
  // 802, porque el 2 del metro cuadrado se pegaba al 80: el total del papel
  // sigue cuadrando —la cantidad no se usa para sumarlo— y la cantidad mal
  // leida recien se nota en obra, al comparar contra lo ejecutado.
  const { numeroDeCelda, interpretarPresupuesto } =
    await import("../src/modules/controlObra/leerPresupuesto.js");
  assert.equal(numeroDeCelda("CATORCE MIL NOVECIENTOS VEINTE Y SIETE DOLARES CON 50/100"), 0);
  assert.equal(numeroDeCelda("80 m2"), 80);
  assert.equal(numeroDeCelda("100 m²"), 100);
  assert.equal(numeroDeCelda("$ 1.234,56"), 1234.56);
  assert.equal(numeroDeCelda("USD 900"), 900);
  assert.equal(numeroDeCelda(45.7), 45.7);

  const filas = [
    ["ITEM", "DESCRIPCION", "UNIDAD", "CANTIDAD", "P. UNITARIO", "TOTAL"],
    ["1", "Mamposteria de bloque", "m2", "100", "12,50", "1250"],
    ["2", "Enlucido vertical", "m2", "80 m2", "9,00", "720"],
    ["", "SON: CATORCE MIL DOLARES CON 50/100", "CATORCE MI",
      "CATORCE MIL DOLARES CON 50/100", "", "CATORCE MIL DOLARES CON 50/100"],
  ];
  const mapa = { fila_encabezado: 0, col_item: 0, col_descripcion: 1, col_unidad: 2,
    col_cantidad: 3, col_precio: 4, col_total: 5, col_capitulo: null };
  const r = interpretarPresupuesto(filas, mapa);
  assert.equal(r.rubros.length, 2);                  // el importe en letras no es un rubro
  assert.equal(r.rubros[1].cantidad, 80);            // ni 802
});
