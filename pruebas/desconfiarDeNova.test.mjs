import test from "node:test";
import assert from "node:assert/strict";
import { limpiarEmparejamientos, copiaDelRubro, globalMultiplicado }
  from "../src/modules/controlObra/desconfiarDeNova.js";

// El caso real: tres renglones de una proforma electrica quedaron pegados al
// mismo rubro —un global de una unidad— con cantidades de 3, 29 y 49 "glb", y
// la pantalla concluyo que aprobarlas dejaba veintinueve mil dolares. Ninguno
// de esos renglones decia eso en el papel.
const rubro = { id: 3, descripcion: "IMSTALACION DE ACOMETIDA ELECTRICA PROVISIONAL, TABLERO Y LUMINARIAS",
  unidad: "glb", cantidad: 1, total_base: 1159.2, iva_pct: 15 };

test("un renglon que repite al rubro no es un renglon: es el rubro", () => {
  // Cuando el texto que vuelve es igual al del rubro con el que dice calzar,
  // lo que paso es que NOVA copio la lista del presupuesto en vez de leer el
  // papel: el renglon de una proforma lo escribio el proveedor.
  assert.equal(copiaDelRubro("IMSTALACION DE ACOMETIDA ELECTRICA PROVISIONAL, TABLERO Y LUMINARIAS", rubro), true);
  // Con el mismo texto del rubro, aunque cambie puntuacion o mayusculas.
  assert.equal(copiaDelRubro("imstalacion de acometida electrica provisional tablero y luminarias.", rubro), true);
  // Pero un proveedor que describe el mismo trabajo con sus palabras esta
  // emparejando BIEN, y esos son los que mas valen: no se tocan.
  assert.equal(copiaDelRubro("Acometida provisional: tablero de 12 espacios y 4 luminarias LED", rubro), false);
  assert.equal(copiaDelRubro("Breaker 1P-16A", rubro), false);
});

test("un global no viene de a veintinueve", () => {
  assert.equal(globalMultiplicado({ cantidad: 29 }, rubro), true);
  assert.equal(globalMultiplicado({ cantidad: 1 }, rubro), false);
  // Un rubro medido en metros si puede traer mas cantidad: eso es un hallazgo
  // de verdad y no se toca.
  assert.equal(globalMultiplicado({ cantidad: 120 }, { unidad: "m2", cantidad: 95 }), false);
});

test("lo que no se sostiene vuelve SIN rubro, no con el rubro equivocado", () => {
  // Un renglon sin emparejar la aplicacion ya sabe mostrarlo, y al lado esta
  // el presupuesto para señalarle el suyo en dos clics: trabajo de un minuto.
  // Un emparejamiento inventado cuesta una orden mal cobrada y la confianza en
  // todo lo demas que dice la pantalla, que es lo caro.
  const r = limpiarEmparejamientos([
    { descripcion: "IMSTALACION DE ACOMETIDA ELECTRICA PROVISIONAL, TABLERO Y LUMINARIAS", cantidad: 3, rubro_id: 3 },
    { descripcion: "IMSTALACION DE ACOMETIDA ELECTRICA PROVISIONAL, TABLERO Y LUMINARIAS", cantidad: 29, rubro_id: 3 },
    { descripcion: "Breaker 1P-16A", cantidad: 20, rubro_id: 3 },
    { descripcion: "Punto de iluminacion EMT 1/2", cantidad: 65, rubro_id: null },
  ], [rubro]);
  assert.equal(r.items[0].rubro_id, null);
  assert.equal(r.items[1].rubro_id, null);
  // El breaker no repite el texto del rubro, pero un global de una unidad no
  // trae veinte: tambien queda sin rubro.
  assert.equal(r.items[2].rubro_id, null);
  assert.equal(r.sospechosos, 3);
  assert.match(r.porQue, /sin rubro/);
});

test("un emparejamiento que se sostiene no se toca", () => {
  const bueno = { id: 9, descripcion: "Punto de iluminacion con tuberia EMT", unidad: "U", cantidad: 65 };
  const r = limpiarEmparejamientos(
    [{ descripcion: "Punto de iluminacion con tuberia y accesorios EMT 1/2", cantidad: 70, rubro_id: 9 }], [bueno]);
  assert.equal(r.items[0].rubro_id, 9);
  assert.equal(r.sospechosos, 0);
  assert.equal(r.porQue, null);
});
