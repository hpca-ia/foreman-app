import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DECISIONES, decisionesPara, comoVa, queNoSePaga, respaldoDeLoQueNoSePaga,
} from "../src/modules/controlObra/cuentaDiferencias.js";

// ── "NO SE PAGA": EL NO AL PROVEEDOR, CON SU PORQUÉ ────────────────────────
//
// Hay renglones de una propuesta que no se pagan y que no son "ya estaba
// incluido": no se hizo, no se autorizó, viene cobrado dos veces. La razón va
// escrita, y sale en el PDF: es lo que se le muestra al proveedor cuando
// vuelve a reclamarlo.

test("«No se paga» existe como decisión y dice para qué es la nota", () => {
  assert.equal(DECISIONES.no_se_paga.label, "No se paga");
  assert.match(DECISIONES.no_se_paga.pista, /PDF/);
});

test("se ofrece donde el proveedor pide plata de más, y solo ahí", () => {
  for (const h of ["nuevo", "mas_cantidad", "subio_precio"]) {
    assert.ok(decisionesPara(h).includes("no_se_paga"), h);
  }
  // Más barato o menos cantidad ya es a favor: no hay nada que negarle.
  assert.ok(!decisionesPara("bajo_precio").includes("no_se_paga"));
  assert.ok(!decisionesPara("menos_cantidad").includes("no_se_paga"));
  // Y lo que ya se ofrecía sigue igual.
  assert.ok(decisionesPara("menos_cantidad").includes("cobrar"));
  assert.ok(!decisionesPara("menos_cantidad").includes("eficiencia"));
  assert.ok(decisionesPara("bajo_precio").includes("eficiencia"));
  assert.ok(!decisionesPara("bajo_precio").includes("cobrar"));
});

test("lo que no se paga no se le cobra al cliente ni queda a favor", () => {
  const v = comoVa([
    { decision: "cobrar", hallazgo: "nuevo", monto: 100 },
    { decision: "no_se_paga", hallazgo: "nuevo", monto: 250.5, nota: "no se instaló" },
    { decision: "no_se_paga", hallazgo: "mas_cantidad", monto: 49.5 },
    { decision: "eficiencia", hallazgo: "bajo_precio", monto: 30 },
  ]);
  assert.equal(v.monto, 100);
  assert.equal(v.aFavor, 30);
  assert.equal(v.noSePagan, 2);
  assert.equal(v.montoNoSePaga, 300);
  assert.equal(v.noSePaganSinNota, 1, "uno no dice por qué");
  assert.equal(v.sinDecidir, 0, "decir que no se paga es haber decidido");
  assert.equal(v.listo, true);
});

test("qué parte del renglón es la que no se paga", () => {
  assert.equal(queNoSePaga({ hallazgo: "nuevo", cantidad: 1 }), "el renglón entero");
  assert.equal(queNoSePaga({ hallazgo: "mas_cantidad", cantidad: 46, unidad: "pto" }),
    "46 pto de más sobre lo contratado");
  assert.equal(queNoSePaga({ hallazgo: "subio_precio", cantidad: 65 }), "el sobreprecio sobre lo presupuestado");
});

test("el respaldo lleva lo que dice el papel, lo que no se paga y la nota entera", () => {
  const larga = "No se instalaron: el cliente pidió dejar esas 46 salidas sin cablear hasta la segunda etapa, "
    + "según el correo del 12 de octubre, y el residente confirmó en obra que no están hechas.";
  const r = respaldoDeLoQueNoSePaga([
    { id: 1, decision: "cobrar", hallazgo: "nuevo", monto: 500 },
    { id: 2, decision: "no_se_paga", hallazgo: "mas_cantidad", descripcion: "Puntos de iluminación",
      texto_papel: "Punto de luz con tubería EMT 1/2 y cable 12 AWG", unidad: "pto", cantidad: 46, monto: 920,
      unidad_papel: "pto", cantidad_papel: 111, monto_papel: 2220, nota: `  ${larga}  `,
      decidido_nombre: "Hernán Cueva", decidido_at: "2026-11-05T15:00:00Z" },
    { id: 3, decision: "no_se_paga", hallazgo: "nuevo", descripcion: "Transporte adicional",
      unidad: "glb", cantidad: 1, monto: 180 },
  ]);
  assert.equal(r.renglones.length, 2, "solo lo que se decidió no pagar");
  const [a, b] = r.renglones;
  // Lo que el proveedor reconoce es SU renglón: su texto, su cantidad, su total.
  assert.equal(a.descripcion, "Punto de luz con tubería EMT 1/2 y cable 12 AWG");
  assert.equal(a.cantidad, 111);
  assert.equal(a.unitario, 20);
  assert.equal(a.total, 2220);
  // Y lo que no se paga es la diferencia, no el renglón entero.
  assert.equal(a.monto, 920);
  assert.equal(a.que, "46 pto de más sobre lo contratado");
  assert.equal(a.porque, larga, "la nota va entera, sin cortar");
  assert.equal(a.quien, "Hernán Cueva");
  assert.equal(b.descripcion, "Transporte adicional");
  assert.equal(b.total, 180);
  assert.equal(b.porque, "");
  assert.equal(r.total, 1100);
  assert.equal(r.sinNota, 1);
});

test("sin nada marcado no hay hoja de respaldo", () => {
  const r = respaldoDeLoQueNoSePaga([{ decision: "cobrar", monto: 10 }, { decision: "pendiente", monto: 5 }]);
  assert.deepEqual(r, { renglones: [], total: 0, sinNota: 0 });
});
