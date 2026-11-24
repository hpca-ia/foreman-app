// Los días que no se trabaja, en la pantalla del cronograma.
//
// Hernán, 23/11/2026, ajustando el Aeropuerto: «no se trabaja ni 24 ni 25 ni
// 1ro». Los cargó en el proyecto (migración 193) y la pantalla siguió
// entregando el 24 de diciembre: la lista de proyectos no pedía
// `crono_feriados`, así que el calendario se armaba siempre sin feriados.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calendario, calcular } from "../src/modules/cronograma/cpm.js";

const pantalla = readFileSync(new URL("../src/modules/cronograma/ModuloCronograma.jsx", import.meta.url), "utf8")
  .split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

test("la pantalla pide los feriados del proyecto junto con su fecha de arranque", () => {
  // En el escalón mínimo: nacieron en la misma migración (076) que `crono_inicio`.
  const base = pantalla.match(/const base = "([^"]+)";/)?.[1] || "";
  assert.ok(base.split(",").includes("crono_inicio"));
  assert.ok(base.split(",").includes("crono_feriados"), "sin esto el calendario se arma sin feriados");
  const m076 = readFileSync(new URL("../supabase/migrations/076_cronograma_de_obra.sql", import.meta.url), "utf8");
  assert.match(m076, /add column if not exists crono_inicio/);
  assert.match(m076, /add column if not exists crono_feriados/);
  // Y con ellos arma el calendario con el que calcula.
  assert.match(pantalla, /const cal = calendario\(\{\s+laborables: lead\.crono_laborables \|\| \[1, 2, 3, 4, 5, 6\],\s+feriados: lead\.crono_feriados \|\| \[\],\s+\}\);/);
});

test("con el 24 y el 25 de diciembre sin trabajo, lo que caía el 24 pasa al 26", () => {
  // El final del Aeropuerto: jornada de siete días, limpieza el 23 y después la entrega.
  const acts = [
    { id: 1, nombre: "Limpieza final profunda", duracion: 1, inicio_fijo: "2026-12-23" },
    { id: 2, nombre: "Recepción y entrega de obra", duracion: 1 },
  ];
  const deps = [{ actividad_id: 2, depende_de_id: 1 }];
  const todos = [0, 1, 2, 3, 4, 5, 6];
  const sin = calcular({ actividades: acts, dependencias: deps, inicio: "2026-12-01", cal: calendario({ laborables: todos }) });
  assert.equal(sin.fin, "2026-12-24");
  const con = calcular({ actividades: acts, dependencias: deps, inicio: "2026-12-01",
    cal: calendario({ laborables: todos, feriados: ["2026-12-24", "2026-12-25", "2027-01-01"] }) });
  assert.equal(con.fin, "2026-12-26");
  assert.equal(con.actividades[0].fin, "2026-12-23", "la limpieza no se mueve");
});
