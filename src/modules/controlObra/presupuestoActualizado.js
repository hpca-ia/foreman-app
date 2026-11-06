import { baseSinIva } from "./contratoDeLaObra.js";
import { claseDePartida, rubroDeLaPartida, precioDelContrato } from "./clasesDePartida.js";
import { ordenCuenta } from "./cuentaOrdenCambio.js";
import { honorariosDe, pctQueCorresponde } from "./honorariosDeOrden.js";
import { codigoDe } from "./nombreOrden.js";

// EL PRESUPUESTO ACTUALIZADO: el contrato, lo que las órdenes le hicieron, y
// lo que le harían las que todavía no se aprobaron.
//
// El cliente pide "el presupuesto actualizado" y hoy la respuesta son tres
// papeles: el presupuesto que firmó, y una orden de cambio por cada vez que
// algo se movió. Para saber en cuánto está un rubro hay que leerlos todos y
// hacer la cuenta, y esa cuenta la hace cada uno por su lado.
//
// Esto es una sola matriz, rubro por rubro, con los capítulos y el orden del
// contrato:
//
//   BASE          lo que se firmó.
//   APROBADAS     lo que cada orden aprobada aumentó o redujo en ese rubro.
//   VIGENTE       base más aprobadas: el contrato de hoy.
//   POR APROBAR   lo mismo de las órdenes que esperan firma. No suma al
//                 vigente: es lo que cambiaría si se aprueban.
//   PROYECTADO    vigente más por aprobar.
//
// Lo que una orden agrega y no estaba en el contrato no tiene rubro donde ir:
// va al final, en un bloque por orden, con el honorario de esa orden.
//
// No guarda nada y no toca nada: es una lectura de lo que ya está —los rubros
// y las órdenes—, y por eso no puede desacomodarse de ellos. Todo sin IVA; el
// impuesto se suma al pie, como en el contrato y en cada orden.

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;
const c4 = v => Math.round(n(v) * 10000) / 10000;

/** Un monto con su IVA: para el pie, donde se dice lo que de verdad se paga. */
export const conIva = (monto, iva) => c2(n(monto) * (1 + n(iva) / 100));

const vacio = () => ({ cantidad: 0, total: 0, ordenes: [] });
const sumas = () => ({ base: 0, aprobado: 0, vigente: 0, porAprobar: 0, proyectado: 0 });

/** ¿Espera la firma del cliente? Enviada y viva; un borrador solo si se pide. */
export const esperaFirma = (o, conBorradores = false) =>
  (o?.estado === "enviada" || (conBorradores && o?.estado === "borrador")) && !o?.anulada && !o?.reemplazada_at;

/**
 * @param rubros            los de la obra
 * @param ordenes           las órdenes de cambio de la obra
 * @param lineasDeOrdenes   { [ordenId]: [partidas] }
 * @param obra              para el honorario del contrato
 * @param conBorradores     si las que todavía no se mandaron entran en "por aprobar"
 */
export function presupuestoActualizado({ rubros = [], ordenes = [], lineasDeOrdenes = {}, obra = null, conBorradores = false } = {}) {
  // EL PRESUPUESTO COMO SE FIRMÓ: con el capítulo y el orden originales, y sin
  // lo que se agregó después en el control ni lo que metieron las órdenes.
  const cap = r => r.capitulo_original ?? r.capitulo ?? "SIN CAPÍTULO";
  const capOrden = r => n(r.capitulo_orden_original ?? r.capitulo_orden);
  const delContrato = rubros
    .filter(r => r && r.origen !== "orden_cambio" && r.origen !== "control")
    .slice().sort((a, b) => (capOrden(a) - capOrden(b)) || (n(a.orden) - n(b.orden)));

  const filaDe = new Map(delContrato.map(r => {
    const precio = precioDelContrato(r);
    return [String(r.id), {
      id: r.id, numero: String(r.numero ?? r.codigo ?? ""), descripcion: r.descripcion || "",
      unidad: r.unidad || "", precio: precio ?? 0, capitulo: cap(r),
      base: { cantidad: c4(r.cantidad), total: baseSinIva(r) },
      aprobado: vacio(), porAprobar: vacio(),
    }];
  }));

  const aprobadas = ordenes.filter(ordenCuenta);
  const pendientes = ordenes.filter(o => esperaFirma(o, conBorradores));
  const porId = new Map(ordenes.map(o => [String(o.id), o]));

  // Un bloque por orden, para lo que no tiene rubro del contrato donde ir.
  const bloques = new Map();
  const bloqueDe = (o, columna) => {
    const k = String(o.id);
    if (!bloques.has(k)) {
      bloques.set(k, { orden: { id: o.id, codigo: codigoDe(o), titulo: o.titulo || "", estado: o.estado, columna }, filas: [] });
    }
    return bloques.get(k);
  };

  /**
   * Las partidas de una orden, puestas en su columna.
   *
   * @param deOrden   la orden de la que son las partidas y el honorario
   * @param enBloque  la orden bajo la que se listan y cuyo código llevan
   * @param signo     -1 cuando se está sacando lo que una modificación reemplaza
   */
  const poner = ({ deOrden, enBloque = deOrden, columna, signo = 1 }) => {
    const lineas = lineasDeOrdenes[deOrden.id] || [];
    const codigo = codigoDe(enBloque);
    const marca = signo < 0 ? `(se reemplaza, de la ${codigoDe(deOrden)}) ` : "";
    const enColumna = (cantidad, total) => ({
      aprobado: columna === "aprobado" ? { cantidad, total, ordenes: [codigo] } : vacio(),
      porAprobar: columna === "porAprobar" ? { cantidad, total, ordenes: [codigo] } : vacio(),
    });
    lineas.forEach((l, i) => {
      const s = signo * (l.tipo === "quita" ? -1 : 1);
      const cantidad = c4(s * n(l.cantidad));
      const total = c2(s * n(l.cantidad) * n(l.precio_unitario));
      const rubro = claseDePartida(l) === "nuevo" ? null : rubroDeLaPartida(l, delContrato);
      const fila = rubro ? filaDe.get(String(rubro.id)) : null;
      if (fila) {
        fila[columna].cantidad = c4(fila[columna].cantidad + cantidad);
        fila[columna].total = c2(fila[columna].total + total);
        if (!fila[columna].ordenes.includes(codigo)) fila[columna].ordenes.push(codigo);
        return;
      }
      bloqueDe(enBloque, columna).filas.push({
        id: `o${deOrden.id}-${l.id ?? i}${signo < 0 ? "-r" : ""}`,
        numero: l.item || "", descripcion: marca + (l.descripcion || ""),
        unidad: l.unidad || "", precio: c4(l.precio_unitario),
        base: { cantidad: 0, total: 0 }, ...enColumna(cantidad, total),
      });
    });
    // EL HONORARIO DE LA ORDEN, que es parte de lo que el cliente firma: va
    // al pie de cada orden, y acá en su bloque, sobre el neto de todas sus
    // partidas —también las que cayeron en un rubro del contrato—.
    const h = honorariosDe({ lineas, pct: pctQueCorresponde(deOrden, obra) });
    if (h.hay) {
      bloqueDe(enBloque, columna).filas.push({
        id: `h${deOrden.id}${signo < 0 ? "-r" : ""}`, numero: "",
        descripcion: `${marca}Honorarios ${h.pct} % sobre ${codigoDe(deOrden)}`,
        unidad: "glb", precio: c2(h.honorarios), honorario: true,
        base: { cantidad: 0, total: 0 }, ...enColumna(signo, c2(signo * h.honorarios)),
      });
    }
  };

  for (const o of aprobadas) poner({ deOrden: o, columna: "aprobado" });
  for (const o of pendientes) {
    poner({ deOrden: o, columna: "porAprobar" });
    // UNA MODIFICACIÓN REEMPLAZA A SU ORDEN. Si la OC-04 está aprobada y la
    // OC-04-A espera firma, aprobar la A saca del contrato lo de la 04: lo que
    // cambiaría no es la A entera, es la A menos la 04. Sin restarla, el
    // proyectado contaría el mismo trabajo dos veces.
    const anterior = o.revision_de ? porId.get(String(o.revision_de)) : null;
    if (anterior && ordenCuenta(anterior)) poner({ deOrden: anterior, enBloque: o, columna: "porAprobar", signo: -1 });
  }

  // El rubro que una orden vieja TACHÓ entero —así restaba antes el portal—
  // deja de estar en el contrato vigente: es una reducción por todo lo suyo.
  for (const r of delContrato) {
    if (!r.anulado_por_oc) continue;
    const o = porId.get(String(r.anulado_por_oc));
    if (!o || !ordenCuenta(o)) continue;
    const fila = filaDe.get(String(r.id));
    fila.aprobado.cantidad = c4(fila.aprobado.cantidad - fila.base.cantidad);
    fila.aprobado.total = c2(fila.aprobado.total - fila.base.total);
    if (!fila.aprobado.ordenes.includes(codigoDe(o))) fila.aprobado.ordenes.push(codigoDe(o));
  }

  const cerrar = f => ({
    ...f,
    vigente: { cantidad: c4(f.base.cantidad + f.aprobado.cantidad), total: c2(f.base.total + f.aprobado.total) },
    proyectado: {
      cantidad: c4(f.base.cantidad + f.aprobado.cantidad + f.porAprobar.cantidad),
      total: c2(f.base.total + f.aprobado.total + f.porAprobar.total),
    },
  });
  const sumar = filas => {
    const t = sumas();
    for (const f of filas) {
      t.base += f.base.total; t.aprobado += f.aprobado.total; t.vigente += f.vigente.total;
      t.porAprobar += f.porAprobar.total; t.proyectado += f.proyectado.total;
    }
    return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, c2(v)]));
  };

  // Los capítulos del contrato, en su orden. Un rubro en cero al que ninguna
  // orden tocó no dice nada y no va: son los renglones vacíos del archivo.
  const capitulos = [];
  for (const r of delContrato) {
    const f = cerrar(filaDe.get(String(r.id)));
    const seMovio = f.aprobado.ordenes.length || f.porAprobar.ordenes.length;
    if (!f.base.total && !seMovio) continue;
    let c = capitulos[capitulos.length - 1];
    if (!c || c.nombre !== f.capitulo) { c = { nombre: f.capitulo, filas: [] }; capitulos.push(c); }
    c.filas.push(f);
  }
  for (const c of capitulos) c.sub = sumar(c.filas);

  // Los bloques de las órdenes: primero las aprobadas, después las que esperan.
  const numeroDe = b => n((/OC-(\d+)/i.exec(b.orden.codigo) || [])[1]);
  const deOrdenes = [...bloques.values()]
    .map(b => ({ ...b, filas: b.filas.map(cerrar) }))
    .filter(b => b.filas.length)
    .sort((a, b) => (a.orden.columna === b.orden.columna ? 0 : a.orden.columna === "aprobado" ? -1 : 1)
      || (numeroDe(a) - numeroDe(b)) || String(a.orden.codigo).localeCompare(String(b.orden.codigo)));
  for (const b of deOrdenes) b.sub = sumar(b.filas);

  const iva = n((rubros.find(r => r?.iva_pct != null) || {}).iva_pct);
  return {
    capitulos, bloques: deOrdenes,
    totales: sumar([...capitulos.flatMap(c => c.filas), ...deOrdenes.flatMap(b => b.filas)]),
    iva,
    aprobadas: aprobadas.map(codigoDe), porAprobar: pendientes.map(codigoDe),
  };
}


/**
 * LA MATRIZ, RENGLÓN POR RENGLÓN, EN EL ORDEN EN QUE SE LEE.
 *
 * La pantalla, el Excel y el PDF dibujan lo mismo: de acá salen los tres, así
 * que no pueden decir cosas distintas. Capítulo, sus rubros; después los
 * bloques de las órdenes; y el pie, que cierra sin IVA, con el IVA y con el
 * total, como el contrato.
 *
 * @returns [{ tipo: "capitulo" | "fila" | "bloque" | "pie", ... }]
 */
export function renglonesDeLaMatriz(m) {
  const out = [];
  for (const c of m.capitulos) {
    out.push({ tipo: "capitulo", nombre: c.nombre, sub: c.sub });
    for (const f of c.filas) out.push({ tipo: "fila", ...f });
  }
  for (const b of m.bloques) {
    out.push({
      tipo: "bloque", sub: b.sub, orden: b.orden,
      nombre: `${b.orden.codigo} · ${b.orden.titulo}`.trim(),
      estado: b.orden.columna === "aprobado" ? "APROBADA" : b.orden.estado === "borrador" ? "EN BORRADOR" : "POR APROBAR",
    });
    for (const f of b.filas) out.push({ tipo: "fila", deOrden: true, ...f });
  }
  const t = m.totales;
  const por = k => (m.iva > 0 ? c2(conIva(t[k], m.iva) - t[k]) : 0);
  const cada = fn => ({ base: fn("base"), aprobado: fn("aprobado"), vigente: fn("vigente"), porAprobar: fn("porAprobar"), proyectado: fn("proyectado") });
  out.push({ tipo: "pie", etiqueta: m.iva > 0 ? "SUBTOTAL, SIN IVA" : "TOTAL", valores: cada(k => t[k]), fuerte: !(m.iva > 0) });
  if (m.iva > 0) {
    out.push({ tipo: "pie", etiqueta: `IVA ${m.iva} %`, valores: cada(por) });
    out.push({ tipo: "pie", etiqueta: "TOTAL", valores: cada(k => conIva(t[k], m.iva)), fuerte: true });
  }
  return out;
}
