// Lo que NOVA lee de una cotización para la matriz de comparación, y cómo
// queda conectada la matriz al presupuesto.
//
// Hernán, 26/11/2026: «la comparativa se la categoriza por capítulos del
// presupuesto». «Ahorita desde ya está tratando de emparejar...» —contra los
// rubros del presupuesto, que no calzaban—. «Con las actualizaciones se irán
// emparejando los rubros». «¿En dónde se guardan las ofertas leídas? Se deben
// poder ver por si hay condiciones o cualquier otra info adicional».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PEDIDO_DE_LECTURA, pedidoDeUbicar, capitulosParaUbicar, jsonDeLaRespuesta, cotizacionDeLaLectura, cuadreDeLaLectura,
} from "../src/modules/presupuestos/emparejarCotizacion.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

const VIDRIO = "HERRERÍA, ALUMINIO, VIDRIO";
// Los capítulos del presupuesto, como se le pasan a NOVA: numerados en su orden.
const CAPITULOS = capitulosParaUbicar([{ nombre: VIDRIO, orden: 10 }, { nombre: "CARPINTERIA METAL MADERA", orden: 7 }, { nombre: "CERRAJERIA", orden: 8 }]);
// Lo que ya cotizó otra empresa: las filas de la comparación.
const FILAS = [
  { n: 1, clave: "c1-0", capitulo: VIDRIO, descripcion: "V1 Dormitorio de servicio - Ventana abatible", unidad: "u", cantidad: 1 },
  { n: 2, clave: "c1-1", capitulo: VIDRIO, descripcion: "V3 Máquinas - Mampara 2 cuerpos", unidad: "u", cantidad: 1 },
  { n: 3, clave: "c1-2", capitulo: VIDRIO, descripcion: "V9 Family room - Mampara 3 cuerpos", unidad: "u", cantidad: 1 },
];

test("a NOVA se le pide el capítulo de cada renglón, en qué fila de las otras empresas cae, y las condiciones del papel", () => {
  assert.deepEqual(CAPITULOS, [{ n: 1, nombre: "CARPINTERIA METAL MADERA" }, { n: 2, nombre: "CERRAJERIA" }, { n: 3, nombre: VIDRIO }]);
  const pedido = PEDIDO_DE_LECTURA + pedidoDeUbicar({ capitulos: CAPITULOS, filas: FILAS });
  // El capítulo, de la lista del presupuesto.
  assert.match(pedido, /"capitulo" es el numero del capitulo al que pertenece ese trabajo/);
  assert.match(pedido, /CAPITULOS:\n1 \| CARPINTERIA METAL MADERA\n2 \| CERRAJERIA\n3 \| HERRERÍA, ALUMINIO, VIDRIO/);
  // Las filas son lo que cotizaron OTRAS EMPRESAS, no los rubros del presupuesto.
  assert.match(pedido, /OTRAS EMPRESAS YA COTIZARON las FILAS de abajo/);
  assert.match(pedido, /FILAS:\n1 \| HERRERÍA, ALUMINIO, VIDRIO \| V1 Dormitorio de servicio - Ventana abatible \| u \| 1/);
  // Una sola suma contra lo que la otra detalló: todas las filas.
  assert.match(pedido, /Si el rubro es una SUMA GLOBAL de varias FILAS .* pon todas: \[1,2,3\]/);
  assert.match(pedido, /Si dudas, \[\]: no fuerces/);
  // Las condiciones, copiadas del papel.
  assert.match(PEDIDO_DE_LECTURA, /"condiciones":""/);
  assert.match(PEDIDO_DE_LECTURA, /validez de la oferta, forma de pago y anticipo, plazo de entrega, garantia, y lo que NO incluye/);
  // YA NO SE LE MANDAN LOS RUBROS DEL PRESUPUESTO PARA EMPAREJAR.
  assert.doesNotMatch(pedido, /BASE:|rubros de la BASE/);
  // La primera cotización de un presupuesto no tiene contra qué ubicarse: solo el capítulo.
  assert.match(pedidoDeUbicar({ capitulos: CAPITULOS, filas: [] }), /En "filas" pon siempre \[\]\.$/);
  assert.match(pedidoDeUbicar({}), /En "capitulo" pon siempre null\. En "filas" pon siempre \[\]\.$/);
});

test("la respuesta se entiende aunque venga envuelta en texto o en un bloque de código", () => {
  assert.deepEqual(jsonDeLaRespuesta('```json\n{"proveedor":"A","rubros":[]}\n```'), { proveedor: "A", rubros: [] });
  assert.deepEqual(jsonDeLaRespuesta('Aquí está: {"proveedor":"A","rubros":[]} Espero que sirva.'), { proveedor: "A", rubros: [] });
  assert.equal(jsonDeLaRespuesta("No pude leer el documento."), null);
  assert.equal(jsonDeLaRespuesta(""), null);
});

test("lo leído queda con el capítulo de cada renglón y la fila en la que cae: una, varias o la suya", () => {
  const leido = { proveedor: " Aluvid S.A. ", subtotal: 4490, iva: 673.5, total: 5163.5, condiciones: " Validez 15 días. 60 % de anticipo. No incluye obra civil. ", rubros: [
    { descripcion: "Ventana V1", unidad: "u", cantidad: 1, precio_unitario: 880, total: 880, capitulo: 3, filas: [1] },
    { descripcion: "Mamparas V3 y V9", unidad: "glb", cantidad: 1, precio_unitario: null, total: 3310, capitulo: 3, filas: [2, 3] },
    { descripcion: "Mosquiteros", unidad: "glb", cantidad: 1, precio_unitario: 300, total: null, capitulo: 3, filas: [] },
    { descripcion: "  ", cantidad: 1, precio_unitario: 5 },
  ] };
  const c = cotizacionDeLaLectura(leido, { capitulos: CAPITULOS, filas: FILAS });
  assert.equal(c.proveedor, "Aluvid S.A.");
  assert.deepEqual(c.renglones, [
    { descripcion: "Ventana V1", unidad: "u", cantidad: 1, precio_unitario: 880, total: 880, capitulo: VIDRIO, filas: ["c1-0"] },
    // Una suma con su total y sin unitario: el unitario sale del total. Cubre dos filas.
    { descripcion: "Mamparas V3 y V9", unidad: "glb", cantidad: 1, precio_unitario: 3310, total: 3310, capitulo: VIDRIO, filas: ["c1-1", "c1-2"] },
    // Nadie lo había cotizado: sin fila, abre la suya en la matriz.
    { descripcion: "Mosquiteros", unidad: "glb", cantidad: 1, precio_unitario: 300, total: 300, capitulo: VIDRIO, filas: [] },
  ]);
  assert.deepEqual(c.totales, { subtotal: 4490, iva: 673.5, total: 5163.5, descuento_pct: null, descuento_monto: null,
    condiciones: "Validez 15 días. 60 % de anticipo. No incluye obra civil." });
});

test("un capítulo o una fila que no existen se descartan, y una fila que ya tomó un renglón no se repite en el siguiente", () => {
  const c = cotizacionDeLaLectura({ rubros: [
    { descripcion: "a", cantidad: 1, precio_unitario: 10, capitulo: 99, filas: [1, 77] },
    { descripcion: "b", cantidad: 1, precio_unitario: 10, capitulo: null, filas: [1, 2] },
    { descripcion: "c", cantidad: 1, precio_unitario: 10, capitulo: "3", filas: 3 },
  ] }, { capitulos: CAPITULOS, filas: FILAS });
  assert.deepEqual(c.renglones.map(r => [r.capitulo, r.filas]), [["", ["c1-0"]], ["", ["c1-1"]], [VIDRIO, ["c1-2"]]]);
  assert.equal(c.totales.condiciones, null);
  // Sin nada contra qué ubicarla —la primera del presupuesto—, todo queda en su propia fila.
  assert.deepEqual(cotizacionDeLaLectura({ rubros: [{ descripcion: "a", cantidad: 2, precio_unitario: 5, capitulo: 1, filas: [1] }] }).renglones,
    [{ descripcion: "a", unidad: "", cantidad: 2, precio_unitario: 5, total: 10, capitulo: "", filas: [] }]);
});

test("¿se leyó todo? la suma de los renglones contra el subtotal de su papel", () => {
  const renglones = [{ total: 880 }, { total: 3310 }, { total: 300 }];
  assert.deepEqual(cuadreDeLaLectura({ renglones, totales: { subtotal: 4490 } }), { suma: 4490, escrito: 4490, diferencia: 0, cuadra: true });
  // Falta un renglón: la suma no llega al subtotal escrito. (Es lo que pasó con Dekorando: $39.959 contra $39.956.)
  assert.deepEqual(cuadreDeLaLectura({ renglones: renglones.slice(0, 2), totales: { subtotal: 4490 } }), { suma: 4190, escrito: 4490, diferencia: -300, cuadra: false });
  // El papel escribe el subtotal después de su descuento general.
  assert.equal(cuadreDeLaLectura({ renglones, totales: { subtotal: 4041, descuento_monto: 449 } }).cuadra, true);
  // Sin subtotal en el papel no hay contra qué comprobar, y se dice.
  assert.equal(cuadreDeLaLectura({ renglones, totales: {} }).cuadra, null);
});

test("la migración 194 guarda cada cotización sin tocar ningún presupuesto, y con el acceso del equipo", () => {
  const sql = leer("../supabase/migrations/194_cotizaciones_para_comparar.sql").split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  assert.match(sql, /create table if not exists public\.presupuesto_cotizaciones/);
  assert.match(sql, /presupuesto_id\s+bigint\s+not null references public\.presupuestos\(id\) on delete cascade/);
  assert.match(sql, /renglones\s+jsonb\s+not null default '\[\]'::jsonb/);
  assert.match(sql, /alter table public\.presupuesto_cotizaciones enable row level security/);
  assert.match(sql, /create policy "equipo foreman" on public\.presupuesto_cotizaciones for all to authenticated using \(true\) with check \(true\)/);
  assert.doesNotMatch(sql, /\bupdate\s+public\.|\bdelete\s+from\b|alter table public\.presupuesto_items/i);
});

test("el presupuesto: el botón abre la matriz, y lo elegido entra a su capítulo como rubros, se actualiza o se quita", () => {
  const p = codigoDe("../src/modules/ModuloPresupuestos.jsx");
  assert.match(p, /className="comparar-cotizaciones" onClick=\{\(\)=>setComparando\(v=>!v\)\}/);
  assert.match(p, /<MatrizCotizaciones presupuesto=\{presupuestoActivo\} capitulos=\{capitulosActivos\} items=\{items\} currentUser=\{currentUser\}\s+puedeEditar=\{!bloqueado&&puedeEditar\} onCerrar=\{\(\)=>setComparando\(false\)\} onAplicar=\{aplicarElegidos\}/);
  // La matriz ocupa el lugar del presupuesto mientras se compara, y nada más.
  assert.match(p, /\{!showAdminBD&&!\(comparando&&presupuestoActivo\)&&<>/);
  const aplicar = p.slice(p.indexOf("async function aplicarElegidos"), p.indexOf("function cargarBase"));
  assert.match(aplicar, /async function aplicarElegidos\(\{ entran = \[\], cambian = \[\], quitan = \[\], sueltan = \[\] \} = \{\}\) \{/);
  // Lo que entra va al final de SU capítulo, después del último rubro que tenga, marcado con su fila y con de qué papel salió.
  assert.match(aplicar, /const ultimo = Math\.max\(capOrden \* 1000 - 1, \.\.\.lista\.filter\(i => i\.capitulo === capN\)\.map\(i => Number\(i\.orden\) \|\| 0\)\);/);
  assert.match(aplicar, /presupuesto_id: presupuestoActivo\.id, capitulo: capN, orden: ultimo \+ 1 \+ k, utilidad_pct: 0, \.\.\.valores\(c\), \.\.\.delPapel\(c\),/);
  assert.match(aplicar, /comparativa_fila: c\.comparativa_fila, cotizacion_archivo_id: c\.cotizacion_archivo_id, cotizacion_proveedor: c\.cotizacion_proveedor,/);
  // Lo que se quita son los ids que llegan, y nada más; lo emparejado que se suelta queda, sin la marca.
  assert.match(aplicar, /\.from\("presupuesto_items"\)\.delete\(\)\.in\("id", quitan\)/);
  assert.match(aplicar, /\.update\(\{ comparativa_fila: null \}\)\.in\("id", sueltan\)/);
  assert.deepEqual(aplicar.match(/\.delete\(\)/g), [".delete()"]);
  // Sin la migración 197 se dice qué falta, en vez de un error de la base.
  assert.match(aplicar, /falta correr la migración 197/);
  // En el rubro se sigue viendo de quién es el costo.
  assert.match(p, /className="de-quien-es-el-costo"/);
  // La cotización de una sola empresa, como estaba, sigue igual.
  assert.match(p, /<CotizacionPanel\s+result=\{cotizacionResult\}/);

  const m = codigoDe("../src/modules/presupuestos/MatrizCotizaciones.jsx");
  // Pasar al presupuesto se confirma en la pantalla, viendo qué cambia: sin ventanas del navegador.
  assert.doesNotMatch(m, /window\.confirm|window\.alert/);
  assert.match(m, /className="confirmar-pasar" onClick=\{aplicar\}/);
  // Lo elegido se guarda solo, en cada cotización.
  assert.match(m, /if \(a !== b\) \{\s+setCots\([^\n]+\n\s+await guardar\(c\.id, \{ elegidos: ahora\[c\.id\] \|\| \[\] \}\);/);
  // A NOVA se le manda dónde ubicar: los capítulos del presupuesto y las filas de las otras. No los rubros.
  assert.match(m, /leerCotizacionDeArchivo\(file, \{ capitulos: capitulosParaUbicar\(capitulos\), filas: filasParaUbicar\(matriz\) \}\)/);
  assert.doesNotMatch(m, /rubrosDeLaBase/);
  // «ARRIBA SE PUEDE VER TOTAL DE LA OFERTA Y SI SE DESPLIEGA SE VE EL ITEMIZADO».
  assert.match(m, /className="total-de-la-oferta"/);
  assert.match(m, /className="desplegar-capitulo" aria-expanded=\{abierto\}/);
  assert.match(m, /\{abierto && \(\s+<tbody>\s+\{g\.filas\.map\(f => \(/);
  // «SE DEBEN PODER VER»: el papel original de cada empresa, y sus condiciones.
  assert.match(m, /className="ver-el-papel"[^>]*onClick=\{\(\) => abrirOriginal\(papel\)\}/);
  assert.match(m, /className="condiciones-de-la-oferta"/);
  // Lo que el capítulo ya tenía queda, salvo lo que se tilde; y un renglón se puede emparejar con un rubro que ya está.
  assert.match(m, /className="lo-que-ya-tenia"/);
  assert.match(m, /className="emparejar-con-rubro"/);
});
