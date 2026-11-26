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
//     costo ve lo que cotizó cada empresa, tal cual. Con utilidad ve cada
//     precio con la utilidad del rubro encima, y el costo no sale.
//
// LO QUE SE COMPARTE ES UNA FOTO. Se arma acá, una vez, con los precios que se
// decidió mostrar, y se guarda (migración 196). En el modo con utilidad EL
// COSTO NO ENTRA A LA FOTO: el enlace del cliente no tiene nada que ocultar,
// porque no lo recibe. Y lo que el cliente aprueba es esa foto: si después se
// vuelve a elegir o llega otra versión de una cotización, hay que compartir
// de nuevo, y la anterior queda como la vio.
//
// EL PRESUPUESTO DE LA FOTO ES «CON LO ELEGIDO»: en los rubros elegidos va el
// precio de la empresa elegida, haya pasado ya al presupuesto o no. Es lo que
// se le pide aprobar: el presupuesto armado con esas empresas.
//
// (Que la comparativa se pueda dejar afuera —compartir solo el presupuesto—
// es decisión mía: su frase también se puede leer como «si va con utilidad,
// la comparativa no la ve».)
//
// Sin base ni pantalla: pruebas/presupuestoParaElCliente.test.mjs.

import { matrizDeCotizaciones, planDeAplicar } from "./matrizDeCotizaciones.js";
import { totalesPresupuesto, etiquetaHonorario } from "./honorarios.js";
import { esNoCotiza } from "./estructura.js";
import { etiquetaUnidad } from "../../lib/unidades.js";

const n = v => Number(v) || 0;
const r2 = v => Math.round(n(v) * 100) / 100;
const texto = v => String(v ?? "").trim();

export const MODOS = {
  costo: { dice: "A costo", ayuda: "Ve lo que cotizó cada empresa, tal cual, y el costo de cada rubro." },
  utilidad: { dice: "Con utilidad", ayuda: "Ve cada precio con la utilidad del rubro ya sumada. El costo no sale." },
};
// Lo que no se pidió A COSTO va con utilidad: el costo solo sale si alguien lo eligió a propósito.
export const modoValido = m => (m === "costo" ? "costo" : "utilidad");

/**
 * @param presupuesto    la fila de `presupuestos` (nombre, honorarios, iva)
 * @param elegidos       { rubro → cotización }, lo elegido en la matriz
 * @param modo           "costo" | "utilidad"
 * @param conComparativa si va lo que cotizó cada empresa, o solo el presupuesto
 * @returns la foto: {
 *   v, modo, conComparativa, presupuesto: { id, nombre },
 *   empresas: [{ id, proveedor, version, total, cubre }],
 *   capitulos: [{ numero, nombre, total, empresas: [{ id, total, cubre, faltan, estimado, elegidos }],
 *     rubros: [{ numero, descripcion, unidad, cantidad, unitario, total, noCotiza, elegida, deQuien, repartido,
 *                ofertas: [{ id, unitario, cantidad, total, paquete, estimado }] }] }],
 *   totales: { subtotal, honorarios: [{ nombre, monto }], honorarios_monto, iva_pct, iva, total },
 *   elegidos, cotizados,
 * }
 */
export function fotoParaElCliente({ presupuesto = {}, capitulos = [], items = [], cotizaciones = [], elegidos = {}, modo = "utilidad", conComparativa = true } = {}) {
  const m = modoValido(modo);
  const conUtilidad = m === "utilidad";
  const matriz = matrizDeCotizaciones({ capitulos, items, cotizaciones });
  // Lo elegido que sigue teniendo de dónde salir.
  const vigentes = Object.fromEntries(Object.entries(elegidos || {}).filter(([id, c]) => matriz.celdaDe(id, c)));
  const plan = planDeAplicar({ matriz, elegidos: vigentes, items });
  const delPlan = new Map(plan.cambios.map(c => [c.id, c]));
  // Con utilidad, cada precio lleva la del rubro, a centavos, igual que el precio al cliente del presupuesto.
  const alCliente = (unitario, item) => (conUtilidad ? r2(n(unitario) * (1 + n(item.utilidad_pct) / 100)) : n(unitario));

  const caps = matriz.grupos.map(g => {
    const rubros = g.filas.map(f => {
      const item = f.item, c = delPlan.get(f.id);
      const noCotiza = esNoCotiza(item);
      // El rubro como queda con lo elegido; si nadie está elegido, como está hoy en el presupuesto.
      const cantidad = c ? c.cantidad : n(item.cantidad);
      const unitario = c ? (conUtilidad ? c.precio_unitario : c.precio_base)
        : conUtilidad ? n(item.precio_unitario) : (n(item.precio_base) > 0 ? n(item.precio_base) : n(item.precio_unitario));
      const total = noCotiza ? 0 : c ? (conUtilidad ? c.total : c.costo) : r2(cantidad * unitario);
      const ofertas = !conComparativa ? [] : matriz.empresas.map(e => {
        const x = f.celdas[e.id];
        if (!x) return null;
        if (x.tipo === "paquete") {
          return { id: e.id, unitario: null, cantidad: null, total: alCliente(x.parte, item), paquete: texto(x.descripcion), estimado: true };
        }
        const pu = alCliente(x.unitario, item);
        return { id: e.id, unitario: pu, cantidad: x.cantidad, total: conUtilidad ? r2(x.cantidad * pu) : x.total, paquete: null, estimado: false };
      }).filter(Boolean);
      return {
        numero: f.numero, descripcion: texto(item.descripcion), unidad: etiquetaUnidad(item.unidad), cantidad,
        unitario: noCotiza ? 0 : unitario, total, noCotiza,
        // Sin la comparativa no viaja ningún nombre de empresa: ni la elegida ni de quién es el precio.
        elegida: conComparativa && c ? c.cotizacion_id : null,
        deQuien: !conComparativa ? null : c ? texto(c.proveedor) : texto(item.cotizacion_proveedor) || null,
        repartido: conComparativa && c ? !!c.repartido : false,
        ofertas,
      };
    });
    const suyas = !conComparativa ? [] : matriz.empresas.map(e => {
      const s = g.sub[e.id];
      if (!s) return null;
      const propias = rubros.filter(r => r.ofertas.some(o => o.id === e.id));
      return {
        id: e.id, total: r2(propias.reduce((t, r) => t + r.ofertas.find(o => o.id === e.id).total, 0)),
        cubre: s.cubre, faltan: s.faltan, estimado: !!s.estimado,
        elegidos: rubros.filter(r => r.elegida === e.id).length,
      };
    }).filter(Boolean);
    return { numero: g.numero, nombre: g.capitulo, total: r2(rubros.reduce((t, r) => t + r.total, 0)), empresas: suyas, rubros };
  });

  const subtotal = r2(caps.reduce((t, c) => t + c.total, 0));
  const t = totalesPresupuesto(subtotal, presupuesto);
  const empresas = !conComparativa ? [] : matriz.empresas.map(e => ({
    id: e.id, proveedor: texto(e.proveedor), version: e.version,
    total: r2(caps.reduce((s, c) => s + n(c.empresas.find(x => x.id === e.id)?.total), 0)), cubre: e.cubre,
  }));
  return {
    v: 1, modo: m, conComparativa: !!conComparativa,
    presupuesto: { id: presupuesto.id ?? null, nombre: texto(presupuesto.nombre) },
    empresas, capitulos: caps,
    totales: {
      subtotal: t.subtotal, honorarios: t.honorarios.map(h => ({ nombre: etiquetaHonorario(h), monto: h.monto })),
      honorarios_monto: t.honorarios_monto, iva_pct: t.iva_pct, iva: t.iva, total: t.total,
    },
    elegidos: plan.cambios.length,
    cotizados: caps.reduce((s, c) => s + c.rubros.filter(r => r.ofertas.length).length, 0),
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
