// EL PRESUPUESTO Y LA COMPARATIVA, COMO SE LE COMPARTEN AL CLIENTE.
//
// Hernán, 26/11/2026: «En este caso el dueño del proyecto es dueño del
// presupuesto. Me gustaría poder compartir con él el presupuesto y estas
// comparativas también, a manera informativa, no de edición. Aunque aquí él
// podría también elegir y aprobar presupuesto para que quede constancia del
// armado del presupuesto».
//
// Lo que definió ese día:
//
//   · EL CLIENTE VE Y APRUEBA. Elegir, elige la oficina: él ve la comparativa
//     y lo elegido, y contesta «lo apruebo» o deja observaciones. Queda en el
//     registro de aprobaciones, con lo que tenía a la vista.
//
//   · A COSTO O CON UTILIDAD, SE ESCOGE AL COMPARTIR: «se puede escoger si es
//     con utilidad o costo... dependiendo de esto el cliente lo ve o no». A
//     costo ve lo que cotizó cada empresa, tal cual. Con utilidad ve los
//     precios con la utilidad encima, y el costo no sale.
//
// LO QUE SE COMPARTE ES UNA FOTO. Se arma acá, una vez, con los precios que se
// decidió mostrar, y se guarda (migración 196). En el modo con utilidad EL
// COSTO NO ENTRA A LA FOTO: el enlace del cliente no tiene nada que ocultar,
// porque no lo recibe. Y lo que el cliente aprueba es esa foto: si después se
// vuelve a elegir o llega otra versión de una cotización, hay que compartir
// de nuevo, y la anterior queda como la vio.
//
// LA FOTO TIENE DOS COSAS, capítulo por capítulo, igual que la matriz:
//
//   · EL PRESUPUESTO «CON LO ELEGIDO»: los rubros del capítulo como quedan al
//     pasar la cotización elegida —haya pasado ya o no—. Es lo que se le pide
//     aprobar: el presupuesto armado con esas empresas.
//
//   · LA COMPARATIVA del capítulo: el total de cada oferta y, debajo, el
//     itemizado fila por fila, con la elegida marcada.
//
// CON UTILIDAD, CADA FILA DE LA COMPARATIVA LLEVA LA UTILIDAD DE SU RUBRO: a
// todas las ofertas de una fila se les suma la del rubro elegido ahí. Así la
// oferta elegida muestra exactamente el precio que tiene su rubro en el
// presupuesto, y las demás se comparan con ella sobre lo mismo. La fila que
// nadie tiene elegida lleva la proporción del capítulo. Y un capítulo donde
// todavía no hay nada elegido no tiene de dónde sacarla: su comparativa no
// viaja, porque mostrarla sería mostrar el costo.
//
// (Que la comparativa se pueda dejar afuera —compartir solo el presupuesto—
// es decisión mía: su frase también se puede leer como «si va con utilidad,
// la comparativa no la ve».)
//
// Sin base ni pantalla: pruebas/presupuestoParaElCliente.test.mjs.

import { matrizDeCotizaciones, planDeAplicar, SIN_CAPITULO } from "./matrizDeCotizaciones.js";
import { totalesPresupuesto, etiquetaHonorario } from "./honorarios.js";
import { estructura, esNoCotiza } from "./estructura.js";

const n = v => Number(v) || 0;
const r2 = v => Math.round(n(v) * 100) / 100;
const texto = v => String(v ?? "").trim();

export const MODOS = {
  costo: { dice: "A costo", ayuda: "Ve lo que cotizó cada empresa, tal cual, y el costo de cada rubro." },
  utilidad: { dice: "Con utilidad", ayuda: "Ve cada precio con la utilidad ya sumada. El costo no sale." },
};
// Lo que no se pidió A COSTO va con utilidad: el costo solo sale si alguien lo eligió a propósito.
export const modoValido = m => (m === "costo" ? "costo" : "utilidad");

/** Lo elegido que sigue teniendo de dónde salir y ya tiene capítulo. */
function loVigente(matriz, elegidos) {
  const sinLugar = new Set((matriz.grupos.find(g => g.capitulo === SIN_CAPITULO)?.filas || []).map(f => f.clave));
  return Object.fromEntries(Object.entries(elegidos || {}).filter(([clave, c]) => matriz.celdaDe(clave, c) && !sinLugar.has(clave)));
}

/** El presupuesto como queda al pasar lo elegido, sin escribirlo: los rubros de hoy, más lo que entra, menos lo que se quita. */
function conLoElegido(items, plan) {
  const cambia = new Map(plan.cambian.map(c => [String(c.id), c]));
  const fuera = new Set(plan.quitan.map(q => String(q.id)));
  const deHoy = (items || []).filter(i => !fuera.has(String(i.id))).map(i => {
    const c = cambia.get(String(i.id));
    return c ? { ...i, descripcion: c.descripcion, unidad: c.unidad, cantidad: c.cantidad, precio_base: c.precio_base, precio_unitario: c.precio_unitario, total: c.total, cotizacion_proveedor: c.cotizacion_proveedor } : i;
  });
  const ultimo = cap => Math.max(0, ...deHoy.filter(i => (i.capitulo || "") === cap).map(i => n(i.orden)));
  const nuevos = plan.entran.map((c, k) => ({
    id: `nuevo-${k}`, capitulo: c.capitulo, orden: ultimo(c.capitulo) + 1 + k, descripcion: c.descripcion, unidad: c.unidad, cantidad: c.cantidad,
    precio_base: c.precio_base, precio_unitario: c.precio_unitario, utilidad_pct: 0, total: c.total, cotizacion_proveedor: c.cotizacion_proveedor,
  }));
  return [...deHoy, ...nuevos];
}

/**
 * De lo elegido, cuántos rubros no tienen utilidad puesta: compartidos «con
 * utilidad» se verían al costo. Es lo que hay que avisar antes de compartir.
 */
export function elegidosSinUtilidad({ capitulos = [], items = [], cotizaciones = [], elegidos = {} } = {}) {
  const matriz = matrizDeCotizaciones({ capitulos, items, cotizaciones });
  const plan = planDeAplicar({ matriz, elegidos: loVigente(matriz, elegidos), items });
  return plan.rubros.filter(x => x.precio_unitario <= r2(x.precio_base)).length;
}

/**
 * @param presupuesto    la fila de `presupuestos` (nombre, honorarios, iva)
 * @param elegidos       { fila → cotización }, lo elegido en la matriz
 * @param modo           "costo" | "utilidad"
 * @param conComparativa si va lo que cotizó cada empresa, o solo el presupuesto
 * @returns la foto: {
 *   v, modo, conComparativa, presupuesto: { id, nombre },
 *   empresas: [{ id, proveedor, version, total }],
 *   capitulos: [{ numero, nombre, total,
 *     rubros: [{ numero, descripcion, unidad, cantidad, unitario, total, noCotiza, deQuien }],
 *     comparativa: null | { empresas: [{ id, total, faltan, estimado, elegidas }],
 *       filas: [{ descripcion, unidad, cantidad, elegida, ofertas: [{ id, cantidad, unitario, total, estimado }] }] } }],
 *   totales: { subtotal, honorarios: [{ nombre, monto }], honorarios_monto, iva_pct, iva, total },
 *   elegidos, cotizados,
 * }
 */
export function fotoParaElCliente({ presupuesto = {}, capitulos = [], items = [], cotizaciones = [], elegidos = {}, modo = "utilidad", conComparativa = true } = {}) {
  const m = modoValido(modo);
  const conUtilidad = m === "utilidad";
  const matriz = matrizDeCotizaciones({ capitulos, items, cotizaciones });
  const vigentes = loVigente(matriz, elegidos);
  const plan = planDeAplicar({ matriz, elegidos: vigentes, items });

  // EL PRESUPUESTO, con lo elegido adentro.
  const delPre = estructura({ capitulos, items: conLoElegido(items, plan) });
  const porId = new Map(conLoElegido(items, plan).map(i => [String(i.id), i]));

  // LA UTILIDAD: la de cada fila es la de su rubro elegido —precio sobre
  // costo—; la del capítulo, la de todos sus rubros elegidos juntos.
  const delCapitulo = nombre => {
    const suyos = plan.rubros.filter(x => x.capitulo === nombre);
    const costo = suyos.reduce((t, x) => t + x.costo, 0), precio = suyos.reduce((t, x) => t + x.total, 0);
    return suyos.length && costo > 0 ? precio / costo : null;
  };
  const deLaFila = new Map();
  for (const x of plan.rubros) if (x.precio_base > 0) x.marca.split(",").forEach(clave => deLaFila.set(clave, x.precio_unitario / x.precio_base));

  const caps = delPre.map(cap => {
    const rubros = cap.rubros.map(r => {
      const item = porId.get(String(r.id)) || {};
      const noCotiza = esNoCotiza(item);
      const unitario = conUtilidad ? n(item.precio_unitario) : (n(item.precio_base) > 0 ? n(item.precio_base) : n(item.precio_unitario));
      return {
        numero: r.numero, descripcion: r.descripcion, unidad: r.unidad, cantidad: n(item.cantidad),
        unitario: noCotiza ? 0 : unitario, total: noCotiza ? 0 : r2(n(item.cantidad) * unitario), noCotiza,
        // Sin la comparativa no viaja ningún nombre de empresa.
        deQuien: conComparativa ? texto(item.cotizacion_proveedor) || null : null,
      };
    });
    const g = conComparativa ? matriz.grupos.find(x => x.capitulo === cap.nombre) : null;
    const factor = !conUtilidad ? 1 : delCapitulo(cap.nombre);
    // Con utilidad y sin nada elegido en el capítulo no hay con qué sumarla: la comparativa no viaja.
    const filas = !g || factor == null ? null : g.filas.map(f => {
      const suyo = !conUtilidad ? 1 : (deLaFila.get(f.clave) ?? factor);
      return {
        descripcion: f.descripcion, unidad: f.unidad, cantidad: f.cantidad,
        elegida: vigentes[f.clave] != null ? vigentes[f.clave] : null,
        ofertas: matriz.empresas.filter(e => f.celdas[e.id]).map(e => {
          const x = f.celdas[e.id];
          // La que totalizó va en su propia fila, con su total: no se le inventa una parte por cada fila de las otras.
          // A centavos y por la cantidad, igual que el precio del rubro en el presupuesto.
          const unitario = conUtilidad ? r2(x.unitario * suyo) : x.unitario;
          return { id: e.id, cantidad: x.cantidad, unitario, total: conUtilidad ? r2(x.cantidad * unitario) : x.total, estimado: false };
        }),
      };
    });
    const comparativa = !filas ? null : {
      // El total de cada oferta es la suma de lo que se ve de ella, fila por fila.
      empresas: matriz.empresas.filter(e => g.sub[e.id]).map(e => ({
        id: e.id, total: r2(filas.reduce((t, f) => t + n(f.ofertas.find(o => o.id === e.id)?.total), 0)),
        faltan: g.sub[e.id].faltan, estimado: false,
        elegidas: g.filas.filter(f => f.celdas[e.id] && String(vigentes[f.clave]) === String(e.id)).length,
      })),
      filas,
    };
    return { numero: cap.numero, nombre: cap.nombre, total: r2(rubros.reduce((t, r) => t + r.total, 0)), rubros, comparativa };
  });

  const subtotal = r2(caps.reduce((t, c) => t + c.total, 0));
  const t = totalesPresupuesto(subtotal, presupuesto);
  const conCuadro = caps.filter(c => c.comparativa);
  const empresas = !conComparativa ? [] : matriz.empresas
    .filter(e => conCuadro.some(c => c.comparativa.empresas.some(x => x.id === e.id)))
    .map(e => ({
      id: e.id, proveedor: texto(e.proveedor), version: e.version,
      total: r2(conCuadro.reduce((s, c) => s + n(c.comparativa.empresas.find(x => x.id === e.id)?.total), 0)),
    }));
  return {
    v: 2, modo: m, conComparativa: !!conComparativa,
    presupuesto: { id: presupuesto.id ?? null, nombre: texto(presupuesto.nombre) },
    empresas, capitulos: caps,
    totales: {
      subtotal: t.subtotal, honorarios: t.honorarios.map(h => ({ nombre: etiquetaHonorario(h), monto: h.monto })),
      honorarios_monto: t.honorarios_monto, iva_pct: t.iva_pct, iva: t.iva, total: t.total,
    },
    elegidos: plan.rubros.length,
    cotizados: conCuadro.reduce((s, c) => s + c.comparativa.filas.length, 0),
  };
}

/** ¿Es lo mismo que ya ve el cliente? Si no, hay que compartir de nuevo para que vea lo nuevo. */
export function mismaFoto(a, b) {
  const clave = f => JSON.stringify(f ? [f.modo, !!f.conComparativa, f.presupuesto?.nombre, f.empresas, f.capitulos, f.totales] : null);
  return clave(a) === clave(b);
}

const plata = v => n(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Cómo entra el pedido al registro de aprobaciones del cliente (migración 187). */
export function pedidoDelPresupuesto({ foto, leadId, compartidoId, quien = null, cuando = new Date() } = {}) {
  const empresas = foto?.empresas?.length || 0;
  return {
    lead_id: leadId, task_id: null, presupuesto_compartido_id: compartidoId,
    titulo: `Presupuesto: ${texto(foto?.presupuesto?.nombre) || "sin nombre"}`,
    descripcion: [
      empresas ? `Con la comparativa de ${empresas} ${empresas === 1 ? "empresa" : "empresas"}` : "Sin la comparativa de empresas",
      foto?.elegidos ? `${foto.elegidos} ${foto.elegidos === 1 ? "rubro elegido" : "rubros elegidos"}` : "",
      `total $${plata(foto?.totales?.total)}`,
      MODOS[foto?.modo]?.dice.toLowerCase() || "",
    ].filter(Boolean).join(" · "),
    pedida_at: cuando.toISOString(), pedida_por: quien?.id ?? null, pedida_nombre: quien?.name || null,
  };
}

/**
 * En qué está lo compartido, para decirlo en la matriz.
 *
 * @param compartido  la fila de `presupuesto_compartidos` (o null)
 * @param pedido      su fila de `aprobaciones_cliente` (o null)
 * @returns { estado, dice, tono } — estado: "nada" | "retirado" | "pendiente" | "aprobado" | "observado"
 */
export function estadoDeLoCompartido(compartido, pedido) {
  if (!compartido) return { estado: "nada", dice: "Todavía no se le compartió al cliente.", tono: "muted" };
  if (compartido.retirado_at || pedido?.retirada_at) return { estado: "retirado", dice: "Se dejó de compartir.", tono: "muted" };
  if (pedido?.respuesta === "aprobado") return { estado: "aprobado", dice: "El cliente lo aprobó", tono: "success" };
  if (pedido?.respuesta === "observado") return { estado: "observado", dice: "El cliente dejó observaciones", tono: "danger" };
  return { estado: "pendiente", dice: "Compartido: esperando su respuesta", tono: "warning" };
}
