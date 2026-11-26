// Lo que NOVA lee de una cotización para la matriz de comparación, y cómo
// queda conectada la matriz al presupuesto.
//
// Hernán, 26/11/2026: «cada empresa puede cotizar de manera distinta o nombrar
// distinto». Por eso acá un renglón de la cotización puede cubrir varios
// rubros del presupuesto —un paquete—, cosa que la lectura de siempre no
// admitía: emparejaba cada renglón con un solo rubro.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PEDIDO_DE_LECTURA, pedidoDeEmparejarPaquetes, jsonDeLaRespuesta, cotizacionDeLaLectura, cuadreDeLaLectura,
} from "../src/modules/presupuestos/emparejarCotizacion.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

// Los rubros del presupuesto como se le pasan a NOVA: numerados de corrido.
const BASE = [
  { n: 1, id: 5696, numero: "6.6", capitulo: "TUMBADOS Y PINTURAS PAREDES", descripcion: "Tumbado de Gypsum Subsuelo, PB y PA", unidad: "m2", cantidad: 0 },
  { n: 2, id: 5697, numero: "6.7", capitulo: "TUMBADOS Y PINTURAS PAREDES", descripcion: "Tumbado de Gypsum plancha verde", unidad: "m2", cantidad: 0 },
  { n: 3, id: 5698, numero: "6.8", capitulo: "TUMBADOS Y PINTURAS PAREDES", descripcion: "Cortineros de gypsum con refuerzo", unidad: "ml", cantidad: 0 },
];

test("a NOVA se le pide que diga qué rubros cubre cada renglón, y que un paquete los lleve todos", () => {
  const pedido = PEDIDO_DE_LECTURA + pedidoDeEmparejarPaquetes(BASE);
  assert.match(pedido, /"base":\[\]/);
  assert.match(pedido, /un paquete o un global que cubre VARIOS rubros de la BASE/);
  assert.match(pedido, /Si dudas, \[\]: no fuerces\. No repitas un numero de la BASE en dos renglones\./);
  assert.match(pedido, /BASE:\n1 \| TUMBADOS Y PINTURAS PAREDES \| Tumbado de Gypsum Subsuelo, PB y PA \| m2 \| 0\n2 \|/);
  // El descuento general no se resta al leer: se guarda, y la matriz decide.
  assert.match(pedido, /NO lo restes de los rubros/);
  // Sin rubros en el presupuesto no hay nada que emparejar.
  assert.equal(pedidoDeEmparejarPaquetes([]), ' En "base" pon siempre [].');
});

test("la respuesta se entiende aunque venga envuelta en texto o en un bloque de código", () => {
  const json = '{"proveedor":"Drywall Total","rubros":[{"descripcion":"Sistema drywall","cantidad":1,"precio_unitario":2950,"base":[1,2,3]}]}';
  assert.equal(jsonDeLaRespuesta(json).proveedor, "Drywall Total");
  assert.equal(jsonDeLaRespuesta("```json\n" + json + "\n```").rubros.length, 1);
  assert.equal(jsonDeLaRespuesta("Aquí está lo que encontré:\n" + json + "\nEspero que sirva.").rubros[0].base.length, 3);
  assert.equal(jsonDeLaRespuesta("No pude leer el archivo."), null);
  assert.equal(jsonDeLaRespuesta(""), null);
});

test("lo leído queda con los rubros del presupuesto que cubre cada renglón: uno, varios o ninguno", () => {
  const cot = cotizacionDeLaLectura({ proveedor: " Drywall Total ", subtotal: "3170", iva: null, total: 3645.5, descuento_pct: "", rubros: [
    { descripcion: "Sistema drywall: tumbados", unidad: "glb", cantidad: 1, precio_unitario: 2950, total: 2950, base: [1, 2] },
    { descripcion: "Cortinero", unidad: "ml", cantidad: 60, precio_unitario: null, total: 522, base: 3 },
    { descripcion: "Andamios", unidad: "glb", cantidad: 1, precio_unitario: 220, base: null },
    { descripcion: "   ", cantidad: 1, precio_unitario: 5, base: [1] },
  ] }, BASE);
  assert.equal(cot.proveedor, "Drywall Total");
  assert.deepEqual(cot.renglones.map(r => [r.descripcion, r.items]), [["Sistema drywall: tumbados", [5696, 5697]], ["Cortinero", [5698]], ["Andamios", []]]);
  // Un renglón con su total y sin unitario: el unitario sale del total.
  assert.deepEqual([cot.renglones[1].precio_unitario, cot.renglones[1].total], [8.7, 522]);
  // Y sin total escrito, el total es cantidad por unitario.
  assert.equal(cot.renglones[2].total, 220);
  assert.deepEqual(cot.totales, { subtotal: 3170, iva: null, total: 3645.5, descuento_pct: null, descuento_monto: null });
});

test("un número que no existe se descarta, y el que ya tomó un renglón no se repite en el siguiente", () => {
  const cot = cotizacionDeLaLectura({ rubros: [
    { descripcion: "Tumbado", cantidad: 180, precio_unitario: 9.8, base: [1, 99] },
    { descripcion: "Paquete que vuelve a nombrar el tumbado", cantidad: 1, precio_unitario: 900, base: [1, 2] },
  ] }, BASE);
  assert.deepEqual(cot.renglones.map(r => r.items), [[5696], [5697]]);
});

test("¿se leyó todo? la suma de los renglones contra el subtotal de su papel", () => {
  const renglones = [{ total: 1764 }, { total: 476 }, { total: 522 }];
  assert.deepEqual(cuadreDeLaLectura({ renglones, totales: { subtotal: 2762 } }), { suma: 2762, escrito: 2762, diferencia: 0, cuadra: true });
  // Falta un renglón: se dice cuánto.
  assert.deepEqual(cuadreDeLaLectura({ renglones, totales: { subtotal: 3031.5 } }), { suma: 2762, escrito: 3031.5, diferencia: -269.5, cuadra: false });
  // El subtotal escrito después del descuento general también cuadra.
  assert.equal(cuadreDeLaLectura({ renglones, totales: { subtotal: 2623.9, descuento_monto: 138.1 } }).cuadra, true);
  // Sin subtotal en el papel no hay contra qué comprobar.
  assert.equal(cuadreDeLaLectura({ renglones, totales: {} }).cuadra, null);
});

test("la migración 194 guarda cada cotización sin tocar ningún presupuesto, y con el acceso del equipo", () => {
  const sql = leer("../supabase/migrations/194_cotizaciones_para_comparar.sql");
  assert.match(sql, /create table if not exists public\.presupuesto_cotizaciones \(/);
  assert.match(sql, /presupuesto_id\s+bigint\s+not null references public\.presupuestos\(id\) on delete cascade/);
  assert.match(sql, /archivo_id\s+bigint\s+references public\.presupuesto_archivos\(id\) on delete set null/);
  assert.match(sql, /renglones\s+jsonb\s+not null default '\[\]'::jsonb/);
  assert.match(sql, /elegidos\s+jsonb\s+not null default '\[\]'::jsonb/);
  assert.match(sql, /alter table public\.presupuesto_cotizaciones enable row level security;/);
  assert.match(sql, /create policy "equipo foreman" on public\.presupuesto_cotizaciones for all to authenticated using \(true\) with check \(true\);/);
  // No escribe en ninguna tabla que ya exista.
  assert.doesNotMatch(sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n"), /\b(update\s+public|insert\s+into|delete\s+from|drop\s+table|alter\s+table\s+public\.(?!presupuesto_cotizaciones))/i);
});

test("el presupuesto: el botón abre la matriz, y lo elegido entra como costo, con de qué papel salió", () => {
  const p = codigoDe("../src/modules/ModuloPresupuestos.jsx");
  assert.match(p, /className="comparar-cotizaciones" onClick=\{\(\)=>setComparando\(v=>!v\)\}/);
  assert.match(p, /<MatrizCotizaciones presupuesto=\{presupuestoActivo\} capitulos=\{capitulosActivos\} items=\{items\} currentUser=\{currentUser\}\s+puedeEditar=\{!bloqueado&&puedeEditar\} onCerrar=\{\(\)=>setComparando\(false\)\} onAplicar=\{aplicarElegidos\}/);
  // La matriz ocupa el lugar del presupuesto mientras se compara, y nada más.
  assert.match(p, /\{!showAdminBD&&!\(comparando&&presupuestoActivo\)&&<>/);
  // Entra el costo; la cantidad solo donde no había; y queda de qué proforma salió (migración 138).
  assert.match(p, /precio_base: c\.precio_base, precio_unitario: c\.precio_unitario, total: c\.total,\s+\.\.\.\(c\.ponerCantidad \? \{ cantidad: c\.cantidad \} : \{\}\),\s+cotizacion_archivo_id: c\.cotizacion_archivo_id, cotizacion_proveedor: c\.cotizacion_proveedor,/);
  // En el rubro se ve de quién es el costo, y si es la parte de un paquete.
  assert.match(p, /className="de-quien-es-el-costo"/);
  assert.match(p, /\{item\.cotizacion_proveedor\}\{\/ · repartido entre \\d\+ rubros\$\/\.test\(item\.cotizacion_renglon\|\|""\)\?" · repartido":""\}/);
  // La cotización de una sola empresa, como estaba, sigue igual.
  assert.match(p, /<CotizacionPanel\s+result=\{cotizacionResult\}/);
  const m = codigoDe("../src/modules/presupuestos/MatrizCotizaciones.jsx");
  // Pasar al presupuesto se confirma en la pantalla, viendo qué cambia: sin ventanas del navegador.
  assert.doesNotMatch(m, /window\.confirm|window\.alert/);
  assert.match(m, /className="confirmar-pasar" onClick=\{aplicar\}/);
  // Lo elegido se guarda solo, en cada cotización.
  assert.match(m, /if \(a !== b\) \{\s+setCots\([^\n]+\n\s+await guardar\(c\.id, \{ elegidos: ahora\[c\.id\] \|\| \[\] \}\);/);
});
