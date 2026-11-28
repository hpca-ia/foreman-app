// La factura del control contra su gasto de caja chica (Hernán, 28/11/2026:
// «En facturas aparece como gasto sin papel. En caja chica SÍ está el papel»).
import test from "node:test";
import assert from "node:assert/strict";
import { diferenciasConElGasto, loDelGasto } from "../src/modules/controlObra/papelDeCaja.js";

// La factura 32 y su gasto, tal como estaban el 28/11.
const F32 = { id: 32, archivo_url: null, razon_social: "0993371447001", ruc: "0993371447001", numero_factura: "075-051-000483003" };
const G32 = { id: 32, archivo_url: "caja-8/1791506636990-ATIMASA-01-075-051-000483003.pdf", archivo_nombre: "ATIMASA-01-075-051-000483003.pdf",
  proveedor: "ATIMASA S.A.", ruc: "0991331859001", numero_factura: "075-051-000483003" };

test("la 32: trae el papel, el proveedor y el RUC del gasto; el número ya era el mismo", () => {
  const d = diferenciasConElGasto(F32, G32);
  assert.deepEqual(d.map(x => x.campo), ["archivo_url", "razon_social", "ruc"]);
  assert.deepEqual(loDelGasto(G32, d), {
    archivo_url: G32.archivo_url, archivo_nombre: G32.archivo_nombre, razon_social: "ATIMASA S.A.", ruc: "0991331859001",
  });
});

test("una factura sana no se toca aunque diga distinto que su gasto (Avianca: ¿qué RUC es el bueno?)", () => {
  const f = { archivo_url: "caja-9/a.pdf", razon_social: "Avianca Ecuador S.A.", ruc: "1790727203001", numero_factura: "202-2492688935" };
  const g = { archivo_url: "caja-9/a.pdf", proveedor: "AVIANCA", ruc: "1792259061001", numero_factura: "202-2492688935" };
  assert.deepEqual(diferenciasConElGasto(f, g), []);
});

test("sin papel en ninguno de los dos, o sin gasto: nada que traer", () => {
  assert.deepEqual(diferenciasConElGasto({ archivo_url: null, razon_social: "TAXI" }, { archivo_url: null, proveedor: "TAXI" }), []);
  assert.deepEqual(diferenciasConElGasto(F32, null), []);
});

test("un número con un espacio delante es el mismo número", () => {
  const d = diferenciasConElGasto({ ...F32, numero_factura: "077-003-000029199" }, { ...G32, numero_factura: " 077-003-000029199" });
  assert.ok(!d.some(x => x.campo === "numero_factura"));
});
