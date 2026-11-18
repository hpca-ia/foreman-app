// Ver un archivo, bajarlo, y recorrer el presupuesto actualizado. Hernán,
// 18/11/2026, con una cotización abierta en Compras: «en compras y en todos
// los módulos no se leen bien los archivos. Además me gustaría poder
// descargar. También en presupuesto, en el presupuesto actualizado, quiero
// poder panear para navegar todo el archivo, así como los cronogramas».
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rutaDe, tipoParaVer, tipoDelPapel, nombreDeArchivo, paraLeer } from "../src/lib/nombresDeArchivo.js";
import { aDondeVa, UMBRAL, NO_SE_AGARRA } from "../src/lib/arrastrarParaRecorrer.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

// La cotización de la captura, como está guardada.
const RUTA = "task-compra-31/1795032943439-CION_DEL_SISTEMA_HIDROSANITARIO_-_DINNERS_AEREOPUERTO_R1.pdf";
const NOMBRE = "PRESUPUESTO DE CONSTRUCCION DEL SISTEMA HIDROSANITARIO - DINNERS AEREOPUERTO R1.pdf";
const FIRMADA = `https://x.supabase.co/storage/v1/object/sign/task-files/${RUTA}?token=abc123`;

test("LO QUE PIDIÓ: el archivo se baja con el nombre con que se cargó, no con el del depósito", () => {
  assert.equal(nombreDeArchivo(RUTA, NOMBRE), NOMBRE);
  // Sin nombre guardado: el del depósito, sin el número que lleva adelante.
  assert.equal(nombreDeArchivo(RUTA), "CION_DEL_SISTEMA_HIDROSANITARIO_-_DINNERS_AEREOPUERTO_R1.pdf");
  assert.equal(nombreDeArchivo("proyecto-13/cliente/1795032943439-2-Cocina%20planta.pdf"), "Cocina planta.pdf");
  // De una dirección entera, de las de antes, sale igual.
  assert.equal(nombreDeArchivo(FIRMADA), "CION_DEL_SISTEMA_HIDROSANITARIO_-_DINNERS_AEREOPUERTO_R1.pdf");
  // Una cotización que se llama como el proveedor baja con la terminación de su archivo:
  // sin ella, la computadora no sabe con qué abrirla.
  assert.equal(nombreDeArchivo(RUTA, "CHARLES HUAYAMABE MEDINA"), "CHARLES HUAYAMABE MEDINA.pdf");
  assert.equal(nombreDeArchivo("facturas/1795000000000-foto.JPG", "Factura 001-002"), "Factura 001-002.JPG");
  assert.equal(nombreDeArchivo("", ""), "archivo");
  // El enlace para bajar se pide con ese nombre: es lo que hace que baje y no se abra.
  const archivos = codigoDe("../src/lib/archivos.js");
  assert.match(archivos, /createSignedUrl\(ruta, segundos, \{ download: nombreDeArchivo\(valor, nombre\) \}\)/);
  assert.match(archivos, /a\.href = url; a\.download = nombreDeArchivo\(valor, nombre\);/);
});

test("qué es cada papel lo dice su nombre o, si no, su archivo", () => {
  assert.equal(tipoParaVer(NOMBRE), "pdf");
  assert.equal(tipoParaVer("foto.JPG"), "imagen");
  assert.equal(tipoParaVer("plano.dwg"), "otro");
  assert.equal(tipoParaVer(FIRMADA), "pdf");   // con lo que le sigue a la dirección
  assert.equal(tipoParaVer(""), "otro");
  // La cotización que se llama como el proveedor es un PDF igual.
  assert.equal(tipoDelPapel("CHARLES HUAYAMABE MEDINA", RUTA), "pdf");
  assert.equal(tipoDelPapel("Cotización", "task-compra-31/1795-foto.png"), "imagen");
  assert.equal(tipoDelPapel("Presupuesto.xlsx", "x/1795-Presupuesto.xlsx"), "otro");
  assert.equal(rutaDe(FIRMADA), RUTA);
});

test("LO QUE PIDIÓ: el PDF se lee a lo ancho y sin el panel de miniaturas, que se comía la hoja", () => {
  assert.equal(paraLeer(FIRMADA, NOMBRE), `${FIRMADA}#navpanes=0&view=FitH`);
  assert.equal(paraLeer(FIRMADA, "hoja.pdf"), `${FIRMADA}#navpanes=0&view=FitH`);
  // Una foto no lleva nada, y lo que ya trae su marca no se toca.
  assert.equal(paraLeer("https://x.test/foto.jpg?token=1", "foto.jpg"), "https://x.test/foto.jpg?token=1");
  assert.equal(paraLeer(`${FIRMADA}#page=2`, NOMBRE), `${FIRMADA}#page=2`);
  assert.equal(paraLeer(null, NOMBRE), null);
});

test("en Compras y en Presupuestos el papel se abre a pantalla completa; el cuadro chico de adentro ya no está", () => {
  const visor = codigoDe("../src/modules/compras/VisorAdjuntos.jsx");
  // Tocar un papel lo abre grande.
  assert.match(visor, /className="papel" onClick=\{\(\) => \{ setI\(k\); setGrande\(true\); \}\}/);
  assert.match(visor, /className="ver-en-grande" onClick=\{\(\) => setGrande\(true\)\}/);
  // Ya no hay un PDF metido en 420 px.
  assert.doesNotMatch(visor, /height: 420/);
  assert.equal((visor.match(/<iframe/g) || []).length, 1);
  assert.match(visor, /<iframe className="hoja-del-papel" title=\{actual\.nombre\} src=\{paraLeer\(actual\.url, "hoja\.pdf"\)\}/);
  // Descargar baja el archivo con su nombre: adentro de la ventana y a pantalla completa.
  assert.equal((visor.match(/className="descargar-papel" onClick=\{\(\) => bajar\(actual\)\}/g) || []).length, 2);
  assert.match(visor, /const bajar = async p => \{ setBajando\(p\.clave\); await descargarArchivo\(p\.ruta, p\.nombre\); setBajando\(null\); \};/);
  // Lo usan las dos pantallas.
  assert.match(codigoDe("../src/modules/compras/ModalSolicitud.jsx"), /<VisorAdjuntos solicitudId=\{viva\.id\} proformas=\{proformas\} \/>/);
  assert.match(codigoDe("../src/modules/presupuestos/ArchivosPresupuesto.jsx"), /<VisorAdjuntos lista=\{papeles\} \/>/);
});

test("«en todos los módulos»: todo archivo se abre en el mismo visor, grande, con Descargar", () => {
  const archivos = codigoDe("../src/lib/archivos.js");
  // abrirArchivo lo manda al visor de FOREMAN; en el teléfono, o si se pide aparte, a otra pestaña.
  assert.match(archivos, /if \(visor && !o\.aparte && !esTelefono\(\) && rutaDe\(valor\)\) \{\s+visor\(\{ valor, nombre: nombreDeArchivo\(valor, o\.nombre\) \}\);\s+return true;/);
  // Como antes, sirve con los segundos de vigencia como segundo dato.
  assert.match(archivos, /const o = typeof opciones === "number" \? \{ segundos: opciones \} : opciones \|\| \{\};/);
  // El visor está montado una sola vez, para toda la aplicación.
  const app = codigoDe("../src/App.jsx");
  assert.equal((app.match(/<VisorDeArchivo \/>/g) || []).length, 1);
  const visor = codigoDe("../src/components/VisorDeArchivo.jsx");
  assert.match(visor, /useEffect\(\(\) => ponerVisor\(async a => \{/);
  assert.match(visor, /className="descargar-archivo" onClick=\{bajar\}/);
  assert.match(visor, /className="abrir-aparte" href=\{archivo\.url\} target="_blank"/);
  assert.match(visor, /if \(e\.key === "Escape"\) setArchivo\(null\);/);
  assert.match(visor, /src=\{paraLeer\(archivo\.url, "hoja\.pdf"\)\}/);
  // Y cada pantalla le pasa el nombre con que se cargó, para que baje con él.
  for (const [ruta, llamada] of [
    ["../src/modules/controlObra/FilaFactura.jsx", "abrirArchivo(f.archivo_url, { nombre: f.archivo_nombre })"],
    ["../src/modules/controlObra/PanelProveedores.jsx", "abrirArchivo(d.archivo_url, { nombre: d.archivo_nombre })"],
    ["../src/modules/controlObra/ProveedoresDeTodo.jsx", "abrirArchivo(d.archivo_url, { nombre: d.archivo_nombre })"],
    ["../src/modules/controlObra/PresupuestoOriginal.jsx", "abrirArchivo(obra.archivo_presupuesto_url, { nombre: obra.archivo_presupuesto_nombre })"],
    ["../src/modules/leads/ArchivosDelProyecto.jsx", "abrirArchivo(a.storage_path, { nombre: a.nombre })"],
    ["../src/modules/leads/AprobacionesDelProyecto.jsx", "abrirArchivo(a.storage_path, { nombre: a.nombre })"],
    ["../src/modules/ModuloCajaChica.jsx", "abrirArchivo(g.archivo_url,{nombre:g.archivo_nombre})"],
  ]) assert.ok(codigoDe(ruta).includes(llamada), `${ruta} no le pasa el nombre`);
});

test("LO QUE PIDIÓ: el presupuesto actualizado se recorre agarrándolo, como el cronograma", () => {
  // Agarrado en (500, 300), con la tabla corrida 120 a la derecha y la página 800 hacia abajo.
  const inicio = { x: 500, y: 300, left: 120, top: 800, movido: false };
  // Un clic que tiembla no es un arrastre.
  assert.equal(aDondeVa(inicio, 501, 301), null);
  assert.equal(UMBRAL, 4);
  // Arrastrar a la izquierda corre la tabla a la derecha; hacia arriba, baja la página.
  assert.deepEqual(aDondeVa(inicio, 300, 250), { left: 320, top: 850 });
  assert.deepEqual(aDondeVa(inicio, 560, 340), { left: 60, top: 760 });
  // Una vez que arrancó, sigue aunque vuelva cerca de donde se agarró.
  assert.deepEqual(aDondeVa({ ...inicio, movido: true }, 501, 300), { left: 119, top: 800 });
  // De un casillero, un botón o un enlace no se agarra: tienen lo suyo.
  for (const algo of ["input", "button", "select", "textarea", "a", "label"]) assert.ok(NO_SE_AGARRA.split(",").includes(algo), algo);
  const panel = codigoDe("../src/modules/controlObra/PanelPresupuestoActualizado.jsx");
  // Las dos tablas anchas: la matriz y la de las órdenes.
  assert.match(panel, /const paneoDeOrdenes = useArrastrarParaRecorrer\(\);\s+const paneoDeLaMatriz = useArrastrarParaRecorrer\(\);/);
  assert.match(panel, /<div ref=\{paneoDeLaMatriz\.cajaRef\} onMouseDown=\{paneoDeLaMatriz\.agarrar\} className="se-recorre matriz-del-presupuesto"/);
  assert.match(panel, /<div ref=\{paneoDeOrdenes\.cajaRef\} onMouseDown=\{paneoDeOrdenes\.agarrar\} className="se-recorre"/);
  // Antes de cualquier salida temprana: es un gancho de React.
  assert.ok(panel.indexOf("useArrastrarParaRecorrer();") < panel.indexOf("if (cargando) return"));
  // Y lo dice, arriba de la tabla.
  assert.ok(panel.includes("Para recorrerlo, agarralo con el mouse y arrastrá"));
  // A los costados corre la tabla; arriba y abajo, la página.
  const gancho = codigoDe("../src/lib/arrastrarParaRecorrer.js");
  assert.match(gancho, /caja\.scrollLeft = va\.left;\s+if \(r\.adentro\) caja\.scrollTop = va\.top;\s+else window\.scrollTo\(window\.scrollX, va\.top\);/);
});
