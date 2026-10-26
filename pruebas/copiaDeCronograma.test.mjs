import test from "node:test";
import assert from "node:assert/strict";
import { barraCopiada, etapaCopiada, plazoCopiado, enganches } from "../src/modules/cronograma/copiaDeCronograma.js";

// El cronograma que se cotizó pasa a la obra cuando se gana. Lo que se copia
// mal no se nota hasta que la obra está andando: una barra que sigue siendo
// del presupuesto no aparece, una que apunta a la etapa vieja queda suelta.

test("la barra copiada es del proyecto y de la obra, no del presupuesto", () => {
  const b = barraCopiada(
    { id: 7, created_at: "x", presupuesto_id: 3, lead_id: null, obra_id: null, fase_id: 11, padre_id: 6, obra_actividad_id: null,
      nombre: "Mampostería", duracion: 12, presupuesto_capitulo: "OBRA GRIS", monto_ref: 2970, etapa: "Etapa 1", orden: 4 },
    { leadId: 20, obraId: 5, faseId: 99 });
  assert.equal(b.id, undefined);
  assert.equal(b.created_at, undefined);
  assert.equal(b.presupuesto_id, undefined);
  assert.equal(b.lead_id, 20);
  assert.equal(b.obra_id, 5);
  assert.equal(b.fase_id, 99);
  // El padre se reapunta después, con su id nuevo: nunca el viejo.
  assert.equal(b.padre_id, null);
  // Lo que es de la barra viaja entero, también de qué capítulo salió.
  assert.equal(b.nombre, "Mampostería");
  assert.equal(b.duracion, 12);
  assert.equal(b.presupuesto_capitulo, "OBRA GRIS");
  assert.equal(b.monto_ref, 2970);
});

test("la etapa copiada es del proyecto", () => {
  const f = etapaCopiada({ id: 11, created_at: "x", presupuesto_id: 3, lead_id: null, nombre: "Obra gris", orden: 2 }, { leadId: 20 });
  assert.deepEqual(f, { nombre: "Obra gris", orden: 2, lead_id: 20 });
});

test("el plazo pasa sin pisar con vacío lo que el presupuesto no dijo", () => {
  assert.deepEqual(plazoCopiado({ id: 3, crono_meses: 6, crono_inicio: null, crono_laborables: [1, 2, 3, 4, 5] }),
    { crono_meses: 6, crono_laborables: [1, 2, 3, 4, 5] });
  assert.deepEqual(plazoCopiado(null), {});
});

test("cada barra se engancha con la agrupación que se quedó con más plata de su capítulo", () => {
  const barras = [
    { id: 1, presupuesto_capitulo: "OBRA GRIS", obra_actividad_id: null },
    { id: 2, presupuesto_capitulo: "Instalaciones", obra_actividad_id: null },
    { id: 3, presupuesto_capitulo: "ACABADOS", obra_actividad_id: null },   // sin agrupación todavía
    { id: 4, presupuesto_capitulo: "OBRA GRIS", obra_actividad_id: 77 },    // enganchada a mano
    { id: 5, presupuesto_capitulo: null, obra_actividad_id: null },         // escrita a mano
  ];
  const rubros = [
    { capitulo: "OBRA GRIS", actividad_id: 10, total_base: 500 },
    { capitulo: "obra gris", actividad_id: 11, total_base: 2000 },
    { capitulo: "OBRA GRIS", actividad_id: 11, total_base: 100 },
    { capitulo: "INSTALACIONES", actividad_id: 12, total_base: 900 },
    { capitulo: "ACABADOS", actividad_id: null, total_base: 800 },
    { capitulo: "INSTALACIONES", actividad_id: 13, total_base: 5000, anulado_por_oc: 3 },  // anulado: no cuenta
  ];
  assert.deepEqual(enganches(barras, rubros), [
    { id: 1, obra_actividad_id: 11 },
    { id: 2, obra_actividad_id: 12 },
  ]);
});
