import { test } from "node:test";
import assert from "node:assert/strict";
import { costoSegunElPapel, costosDelAnalisis, esGlobal } from "../src/modules/controlObra/costoDelRubro.js";

// ── EL COSTO DEL RUBRO ES LO QUE COTIZA EL PAPEL ───────────────────────────
//
// Los casos son los de Diners Aeropuerto. Cargando el costo con el monto de la
// diferencia, un tablero cotizado a $224,81 quedó con $22,48 de costo y la
// acometida —un global de $1.350 cotizado en 25 tramos de $43,54— con $43,54.
// Beneficios los mostró "pasados de su presupuesto" con la primera factura.

const tablero = { id: 90, numero: 90, unidad: "U", cantidad: 1, total_base: 284.38, iva_pct: 15 };          // 247,29 sin IVA
const alimentador = { id: 95, numero: 95, unidad: "ML", cantidad: 200, total_base: 1102.7, iva_pct: 15 };   // 4,79 el metro
const interruptor = { id: 96, numero: 96, unidad: "U", cantidad: 2, total_base: 16.7, iva_pct: 15 };        // 7,26
const acometida = { id: 147, numero: 147, unidad: "GL", cantidad: 1, total_base: 1552.5, iva_pct: 15 };     // 1.350
const provisional = { id: 3, numero: 3, unidad: "glb", cantidad: 1, total_base: 1159.2, iva_pct: 15 };      // 1.008

test("en una diferencia de precio el costo es el precio del papel, no cuánto cambió", () => {
  const linea = { hallazgo: "bajo_precio", cantidad: 1, unidad: "U", monto: 22.48,
    cantidad_papel: 1, unidad_papel: "U", monto_papel: 224.81, obra_rubro_id: 90 };
  assert.deepEqual(costoSegunElPapel(linea, tablero), { costo: 224.81, porQue: null });
});

test("y por unidad: 200 metros a $871,70 son $4,3585 el metro, no $0,4359", () => {
  const linea = { hallazgo: "bajo_precio", cantidad: 200, unidad: "ML", monto: 87.18,
    cantidad_papel: 200, unidad_papel: "ML", monto_papel: 871.7, obra_rubro_id: 95 };
  assert.equal(costoSegunElPapel(linea, alimentador).costo, 4.3585);
});

test("con otra cantidad, el unitario del papel: 8 a $52,81 son $6,60 cada uno", () => {
  const linea = { hallazgo: "mas_cantidad", cantidad: 6, unidad: "U", monto: 39.61,
    cantidad_papel: 8, unidad_papel: "U", monto_papel: 52.81, obra_rubro_id: 96 };
  assert.equal(costoSegunElPapel(linea, interruptor).costo, 6.6013);
});

test("un global se compara total contra total: 25 tramos de $43,54 cuestan $1.088,50", () => {
  const linea = { hallazgo: "mas_cantidad", cantidad: 24, unidad: "GL", monto: 1044.96,
    cantidad_papel: 25, unidad_papel: "GL", monto_papel: 1088.5, obra_rubro_id: 147 };
  assert.equal(esGlobal(acometida), true);
  const c = costoSegunElPapel(linea, acometida);
  assert.equal(c.costo, 1088.5, "el total del papel, no el precio de un tramo");
});

test("si el total del papel no se parece al del global, no se carga: es otro trabajo", () => {
  // El alquiler mensual del tablero de obra, $115,56 por mes, contra la
  // instalación provisional de $1.008.
  const linea = { hallazgo: "bajo_precio", cantidad: 1, unidad: "glb", monto: 892.44,
    cantidad_papel: 1, unidad_papel: "Mes", monto_papel: 115.56, obra_rubro_id: 3 };
  const c = costoSegunElPapel(linea, provisional);
  assert.equal(c.costo, null);
  assert.match(c.porQue, /no se parecen/);
});

test("unidades que miden otra cosa: no se carga", () => {
  const c = costoSegunElPapel({ hallazgo: "mas_cantidad", cantidad_papel: 3, unidad_papel: "Mes", monto_papel: 12 },
    { id: 9, unidad: "ML", cantidad: 3, total_base: 13.8, iva_pct: 15 });
  assert.equal(c.costo, null);
  assert.match(c.porQue, /por Mes .* por ML/);
});

test("un análisis viejo, sin lo que decía el papel", () => {
  // En cantidad y en lo nuevo, monto sobre cantidad sí es el unitario del papel.
  assert.equal(costoSegunElPapel({ hallazgo: "mas_cantidad", cantidad: 6, unidad: "U", monto: 39.61 }, interruptor).costo, 6.6017);
  // De una diferencia de precio solo quedó cuánto cambió: de ahí no sale un costo.
  const c = costoSegunElPapel({ hallazgo: "bajo_precio", cantidad: 1, unidad: "U", monto: 22.48 }, tablero);
  assert.equal(c.costo, null);
  assert.match(c.porQue, /solo quedó guardada la diferencia/);
});

test("sin rubro, o con un papel sin números, no hay costo", () => {
  assert.equal(costoSegunElPapel({ hallazgo: "nuevo", cantidad: 1, monto: 5 }, null).costo, null);
  assert.equal(costoSegunElPapel({ hallazgo: "mas_cantidad", cantidad_papel: 0, monto_papel: 0 }, interruptor).costo, null);
});

test("de un análisis entero: un costo por rubro, y lo que no se pudo se dice", () => {
  const lineas = [
    { hallazgo: "bajo_precio", cantidad_papel: 1, unidad_papel: "U", monto_papel: 224.81, obra_rubro_id: 90 },
    { hallazgo: "mas_cantidad", cantidad_papel: 25, unidad_papel: "GL", monto_papel: 1088.5, obra_rubro_id: 147 },
    { hallazgo: "bajo_precio", cantidad_papel: 1, unidad_papel: "Mes", monto_papel: 115.56, obra_rubro_id: 3 },
    { hallazgo: "nuevo", cantidad: 4, monto: 163.25, obra_rubro_id: null },
    // Dos renglones contra el mismo rubro, con precios distintos: no se elige.
    { hallazgo: "mas_cantidad", cantidad_papel: 8, unidad_papel: "U", monto_papel: 52.81, obra_rubro_id: 96 },
    { hallazgo: "mas_cantidad", cantidad_papel: 3, unidad_papel: "U", monto_papel: 30, obra_rubro_id: 96 },
  ];
  const r = costosDelAnalisis(lineas, [tablero, acometida, provisional, interruptor]);
  assert.deepEqual(r.cargar, [{ id: 90, costo_unitario: 224.81 }, { id: 147, costo_unitario: 1088.5 }]);
  assert.deepEqual(r.saltados.map(s => s.rubro.id), [3, 96]);
  assert.match(r.saltados[1].porQue, /dos renglones del papel/);
});
