import test from "node:test";
import assert from "node:assert/strict";
import { impactoDelPlazo, enPocasPalabras } from "../src/modules/controlObra/impactoDelPlazo.js";

test("no contestado no es lo mismo que no impacta", () => {
  // El papel decia "Sin impacto en el cronograma" cuando lo unico cierto era
  // que nadie habia contestado. Esa frase viaja firmada al cliente, y el dia
  // que la obra se entrega tarde por ese mismo adicional dice lo contrario de
  // lo que paso.
  const i = impactoDelPlazo({});
  assert.equal(i.definido, false);
  assert.equal(i.impacta, false);
  assert.match(i.frase, /Todavía no se dijo/);
  assert.equal(i.falta, "falta decir si corre el plazo");
  assert.equal(enPocasPalabras({}), "Plazo: sin definir");
});

test("decir que no corre el plazo es una afirmacion de la obra, y queda escrita", () => {
  const i = impactoDelPlazo({ impacta_crono: false, impacto_cronograma: "Se hace dentro de la misma semana." });
  assert.equal(i.definido, true);
  assert.equal(i.impacta, false);
  assert.equal(i.dias, 0);
  assert.equal(i.frase, "No corre el plazo de entrega. Se hace dentro de la misma semana.");
  assert.equal(i.falta, null);
});

test("si corre el plazo, con cuantos dias", () => {
  const i = impactoDelPlazo({ impacta_crono: true, dias_impacto: 7, impacto_cronograma: "Espera del vidrio importado." });
  assert.equal(i.frase, "Corre el plazo 7 días. Espera del vidrio importado.");
  assert.equal(enPocasPalabras({ impacta_crono: true, dias_impacto: 7 }), "+7 días de plazo");
});

test("decir que corre el plazo sin decir cuanto queda marcado como pendiente", () => {
  const i = impactoDelPlazo({ impacta_crono: true });
  assert.equal(i.impacta, true);
  assert.equal(i.falta, "dice que corre el plazo pero no cuántos días");
});

test("las ordenes viejas se leen como lo que quisieron decir", () => {
  // Las de antes de la casilla no la tienen, pero escribieron dias o una nota:
  // eso era alguien contestando que si con lo que habia.
  const i = impactoDelPlazo({ dias_impacto: 3 });
  assert.equal(i.definido, true);
  assert.equal(i.impacta, true);
  assert.equal(i.dias, 3);
  const j = impactoDelPlazo({ impacto_cronograma: "Atrasa el acabado del piso." });
  assert.equal(j.impacta, true);
});

test("marcada como que NO corre, los dias viejos no se cuelan", () => {
  // Si alguien escribio 5 dias y despues se decidio que no corre el plazo, lo
  // que vale es la decision: contar los dos seria sumar un atraso que la obra
  // ya dijo que no existe.
  const i = impactoDelPlazo({ impacta_crono: false, dias_impacto: 5 });
  assert.equal(i.dias, 0);
  assert.equal(i.impacta, false);
});
