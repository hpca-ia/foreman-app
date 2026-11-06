import { baseSinIva } from "./contratoDeLaObra.js";
import { claseDePartida, rubroDeLaPartida, precioDelContrato } from "./clasesDePartida.js";
import { ordenCuenta } from "./cuentaOrdenCambio.js";
import { honorariosDe, pctQueCorresponde } from "./honorariosDeOrden.js";
import { codigoDe } from "./nombreOrden.js";

// EL PRESUPUESTO ACTUALIZADO: el contrato, lo que las órdenes le hicieron, lo
// que le harían las que todavía no se aprobaron, y lo que se quiera proyectar
// a mano.
//
// El cliente pide "el presupuesto actualizado" y la respuesta eran tres
// papeles: el presupuesto que firmó, y una orden de cambio por cada vez que
// algo se movió. Para saber en cuánto está un rubro había que leerlos todos y
// hacer la cuenta, y esa cuenta la hacía cada uno por su lado.
//
// Esto es una sola matriz, rubro por rubro, con los capítulos y el orden del
// contrato:
//
//   BASE          lo que se firmó.
//   APROBADAS     lo que cada orden aprobada aumentó o redujo en ese rubro.
//   VIGENTE       base más aprobadas: el contrato de hoy.
//   POR APROBAR   lo mismo de las órdenes que esperan firma. No suma al
//                 vigente: es lo que cambiaría si se aprueban.
//   AJUSTE        lo que alguien proyecta a mano: más o menos cantidad de un
//                 rubro, o sacarlo. No es de nadie todavía: es una simulación.
//   PROYECTADO    vigente más por aprobar más el ajuste.
//
// LOS HONORARIOS SE MUEVEN CON TODO LO DEMÁS. Administrar más obra es más
// honorario y administrar menos es menos: cada orden trae el suyo, y cada
// ajuste a mano lo arrastra. Van en el rubro de honorarios del contrato, que
// es donde el cliente los busca, y así ese rubro muestra su nuevo total.
//
// Lo que una orden agrega y no estaba en el contrato no tiene rubro donde ir:
// va al final, en un bloque por orden.
//
// No toca nada: es una lectura de los rubros y las órdenes. Todo sin IVA; el
// impuesto se suma al pie, como en el contrato y en cada orden.

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;
const c4 = v => Math.round(n(v) * 10000) / 10000;

/** Un monto con su IVA: para el pie, donde se dice lo que de verdad se paga. */
export const conIva = (monto, iva) => c2(n(monto) * (1 + n(iva) / 100));

const COLUMNAS = ["base", "aprobado", "vigente", "porAprobar", "manual", "proyectado"];
const vacio = () => ({ cantidad: 0, total: 0, ordenes: [] });
const esDeHonorarios = r => /honorario/i.test(String(r?.capitulo_original ?? r?.capitulo ?? ""))
  || /honorario/i.test(String(r?.descripcion ?? ""));

/** ¿Espera la firma del cliente? Enviada y viva; un borrador solo si se pide. */
export const esperaFirma = (o, conBorradores = false) =>
  (o?.estado === "enviada" || (conBorradores && o?.estado === "borrador")) && !o?.anulada && !o?.reemplazada_at;

/**
 * @param rubros            los de la obra
 * @param ordenes           las órdenes de cambio de la obra
 * @param lineasDeOrdenes   { [ordenId]: [partidas] }
 * @param obra              para el honorario del contrato
 * @param conBorradores     si las que todavía no se mandaron entran en "por aprobar"
 * @param ajustes           { [rubroId]: ± cantidad }: lo que se proyecta a mano
 */
export function presupuestoActualizado({
  rubros = [], ordenes = [], lineasDeOrdenes = {}, obra = null, conBorradores = false, ajustes = {},
} = {}) {
  // EL PRESUPUESTO COMO SE FIRMÓ: con el capítulo y el orden originales, y sin
  // lo que se agregó después en el control ni lo que metieron las órdenes.
  const cap = r => r.capitulo_original ?? r.capitulo ?? "SIN CAPÍTULO";
  const capOrden = r => n(r.capitulo_orden_original ?? r.capitulo_orden);
  const delContrato = rubros
    .filter(r => r && r.origen !== "orden_cambio" && r.origen !== "control")
    .slice().sort((a, b) => (capOrden(a) - capOrden(b)) || (n(a.orden) - n(b.orden)));
  const iva = n((rubros.find(r => r?.iva_pct != null) || {}).iva_pct);
  const pctContrato = n(obra?.honorarios_pct);

  const filaDe = new Map(delContrato.map(r => [String(r.id), {
    id: r.id, numero: String(r.numero ?? r.codigo ?? ""), descripcion: r.descripcion || "",
    unidad: r.unidad || "", precio: precioDelContrato(r) ?? 0, capitulo: cap(r),
    honorario: esDeHonorarios(r),
    base: { cantidad: c4(r.cantidad), total: baseSinIva(r) },
    // LO MISMO, SIN REDONDEAR, para sumar. Redondeando fila por fila el total
    // quedaba tres centavos arriba del contrato: el cliente compara este papel
    // con el que firmó, y tres centavos son una pregunta.
    baseExacta: n(r.total_base) / (1 + n(r.iva_pct) / 100),
    aprobado: vacio(), porAprobar: vacio(), manual: vacio(),
  }]));

  // EL RUBRO DE HONORARIOS DEL CONTRATO: ahí va el honorario de cada orden y
  // el de cada ajuste. Si el contrato no tiene uno, se abre al final: el
  // honorario de una orden es plata que el cliente paga y no puede no estar.
  const rubroDeHonorarios = delContrato.find(esDeHonorarios);
  let filaHonorarios = rubroDeHonorarios ? filaDe.get(String(rubroDeHonorarios.id)) : null;
  const honorariosEn = () => {
    if (!filaHonorarios) {
      filaHonorarios = {
        id: "honorarios", numero: "", descripcion: `Honorarios de administración${pctContrato ? ` (${pctContrato} %)` : ""}`,
        unidad: "glb", precio: 0, capitulo: "HONORARIOS", honorario: true, agregada: true,
        base: { cantidad: 0, total: 0 }, baseExacta: 0,
        aprobado: vacio(), porAprobar: vacio(), manual: vacio(),
      };
    }
    return filaHonorarios;
  };

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
        base: { cantidad: 0, total: 0 },
        aprobado: columna === "aprobado" ? { cantidad, total, ordenes: [codigo] } : vacio(),
        porAprobar: columna === "porAprobar" ? { cantidad, total, ordenes: [codigo] } : vacio(),
        manual: vacio(),
      });
    });
    // EL HONORARIO DE LA ORDEN, sobre el neto de todas sus partidas, al rubro
    // de honorarios del contrato. Es parte de lo que el cliente firma.
    const h = honorariosDe({ lineas, pct: pctQueCorresponde(deOrden, obra) });
    if (h.hay) {
      const f = honorariosEn();
      f[columna].total = c2(f[columna].total + signo * h.honorarios);
      if (!f[columna].ordenes.includes(codigo)) f[columna].ordenes.push(codigo);
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

  // ── LO QUE SE PROYECTA A MANO ─────────────────────────────────────────────
  //
  // Más o menos cantidad de un rubro del contrato, al precio del contrato: el
  // precio está pactado y no es lo que se está simulando. El honorario se
  // mueve solo, con el porcentaje del contrato, sobre la suma de los ajustes:
  // sacar un rubro de $1.000 baja $100 de honorarios, y eso también es parte
  // de lo que cambia.
  let netoManual = 0;
  for (const [id, delta] of Object.entries(ajustes || {})) {
    const fila = filaDe.get(String(id));
    const cantidad = c4(delta);
    if (!fila || !cantidad || fila.honorario) continue;
    fila.manual = { cantidad, total: c2(cantidad * fila.precio), ordenes: [] };
    netoManual += fila.manual.total;
  }
  netoManual = c2(netoManual);
  const honorarioManual = pctContrato > 0 ? c2(netoManual * pctContrato / 100) : 0;
  if (honorarioManual) {
    const f = honorariosEn();
    f.manual = { cantidad: 0, total: honorarioManual, ordenes: [], calculado: true };
  }

  const cerrar = f => ({
    ...f,
    vigente: { cantidad: c4(f.base.cantidad + f.aprobado.cantidad), total: c2(f.base.total + f.aprobado.total) },
    proyectado: {
      cantidad: c4(f.base.cantidad + f.aprobado.cantidad + f.porAprobar.cantidad + f.manual.cantidad),
      total: c2(f.base.total + f.aprobado.total + f.porAprobar.total + f.manual.total),
    },
  });
  const sumar = filas => {
    const t = Object.fromEntries(COLUMNAS.map(k => [k, 0]));
    for (const f of filas) {
      const base = f.baseExacta ?? f.base.total;
      t.base += base; t.aprobado += f.aprobado.total; t.vigente += base + f.aprobado.total;
      t.porAprobar += f.porAprobar.total; t.manual += f.manual.total;
      t.proyectado += base + f.aprobado.total + f.porAprobar.total + f.manual.total;
    }
    return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, c2(v)]));
  };

  // Los capítulos del contrato, en su orden. Un rubro en cero al que nadie
  // tocó no dice nada y no va: son los renglones vacíos del archivo.
  const capitulos = [];
  const sumarFila = f => {
    let c = capitulos[capitulos.length - 1];
    if (!c || c.nombre !== f.capitulo) { c = { nombre: f.capitulo, filas: [] }; capitulos.push(c); }
    c.filas.push(f);
  };
  for (const r of delContrato) {
    const f = cerrar(filaDe.get(String(r.id)));
    const seMovio = f.aprobado.total || f.porAprobar.total || f.manual.total
      || f.aprobado.ordenes.length || f.porAprobar.ordenes.length;
    if (!f.base.total && !seMovio) continue;
    sumarFila(f);
  }
  if (filaHonorarios?.agregada) sumarFila(cerrar(filaHonorarios));
  for (const c of capitulos) c.sub = sumar(c.filas);

  // Los bloques de las órdenes: primero las aprobadas, después las que esperan.
  const numeroDe = b => n((/OC-(\d+)/i.exec(b.orden.codigo) || [])[1]);
  const deOrdenes = [...bloques.values()]
    .map(b => ({ ...b, filas: b.filas.map(cerrar) }))
    .filter(b => b.filas.length)
    .sort((a, b) => (a.orden.columna === b.orden.columna ? 0 : a.orden.columna === "aprobado" ? -1 : 1)
      || (numeroDe(a) - numeroDe(b)) || String(a.orden.codigo).localeCompare(String(b.orden.codigo)));
  for (const b of deOrdenes) b.sub = sumar(b.filas);

  // ── CUÁNTO VALE CADA ORDEN, ENTERA, como lo dice su propio papel ──────────
  //
  // En la matriz una orden queda repartida en tres lugares: sus cambios de
  // cantidad en la fila de cada rubro del contrato, su honorario en el rubro
  // de honorarios, y lo que no estaba en el contrato en su bloque. Las tres
  // partes suman lo que la orden vale, pero ninguna lo dice. Acá va cada una
  // con su neto, su honorario, su IVA y su total —los números del documento
  // que el cliente firma—.
  const valorDe = (o, signo = 1) => {
    const h = honorariosDe({ lineas: lineasDeOrdenes[o.id] || [], pct: pctQueCorresponde(o, obra), iva });
    return {
      adiciones: c2(signo * h.adiciones), reducciones: c2(signo * h.reducciones), neto: c2(signo * h.neto),
      honorarios: c2(signo * h.honorarios), subtotal: c2(signo * h.subtotal), iva: c2(signo * h.iva), total: c2(signo * h.total),
    };
  };
  const resumen = [];
  for (const o of aprobadas) resumen.push({ id: o.id, codigo: codigoDe(o), titulo: o.titulo || "", columna: "aprobado", estado: "APROBADA", ...valorDe(o) });
  for (const o of pendientes) {
    resumen.push({ id: o.id, codigo: codigoDe(o), titulo: o.titulo || "", columna: "porAprobar",
      estado: o.estado === "borrador" ? "EN BORRADOR" : "POR APROBAR", ...valorDe(o) });
    const anterior = o.revision_de ? porId.get(String(o.revision_de)) : null;
    if (anterior && ordenCuenta(anterior)) {
      resumen.push({ id: `r${o.id}`, codigo: codigoDe(anterior), titulo: `La reemplaza la ${codigoDe(o)}`, columna: "porAprobar",
        estado: "SE REEMPLAZA", ...valorDe(anterior, -1) });
    }
  }
  const sumaDe = columna => {
    const suyas = resumen.filter(x => x.columna === columna);
    const t = { adiciones: 0, reducciones: 0, neto: 0, honorarios: 0, subtotal: 0, iva: 0, total: 0 };
    for (const x of suyas) for (const k of Object.keys(t)) t[k] += x[k];
    return { cuantas: suyas.length, ...Object.fromEntries(Object.entries(t).map(([k, v]) => [k, c2(v)])) };
  };
  // Y en cada bloque, cuánto vale su orden y dónde está lo que no va acá.
  for (const b of deOrdenes) {
    const suyas = resumen.filter(x => String(x.id) === String(b.orden.id) || String(x.id) === `r${b.orden.id}`);
    const valor = c2(suyas.reduce((t, x) => t + x.subtotal, 0));
    const honorarios = c2(suyas.reduce((t, x) => t + x.honorarios, 0));
    const enBloque = c2(b.sub.aprobado + b.sub.porAprobar);
    b.orden = { ...b.orden, valor, honorarios, enBloque, enRubros: c2(valor - honorarios - enBloque) };
  }

  return {
    capitulos, bloques: deOrdenes,
    totales: sumar([...capitulos.flatMap(c => c.filas), ...deOrdenes.flatMap(b => b.filas)]),
    iva, honorariosPct: pctContrato,
    ordenes: resumen, ordenesAprobadas: sumaDe("aprobado"), ordenesPorAprobar: sumaDe("porAprobar"),
    aprobadas: aprobadas.map(codigoDe), porAprobar: pendientes.map(codigoDe),
    // Lo proyectado a mano: cuánto suman los ajustes y cuánto honorario arrastran.
    ajuste: { hay: netoManual !== 0 || honorarioManual !== 0, neto: netoManual, honorarios: honorarioManual, total: c2(netoManual + honorarioManual) },
  };
}

const plata = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const conSigno = v => `${v < 0 ? "−" : ""}$${plata(Math.abs(v))}`;

/**
 * Lo que hay que decir al lado del subtotal de un bloque: que ese número no
 * es la orden entera, cuánto vale la orden y dónde está el resto.
 */
export function aclaracionDelBloque(orden) {
  if (!orden || orden.valor == null) return "";
  const partes = [];
  if (Math.abs(orden.enRubros) >= 0.005) partes.push(`${conSigno(orden.enRubros)} son cambios de cantidad en rubros del contrato, que están arriba en su fila`);
  if (Math.abs(orden.honorarios) >= 0.005) partes.push(`${conSigno(orden.honorarios)} son sus honorarios, que van en el rubro de honorarios`);
  if (!partes.length) return `La orden vale ${conSigno(orden.valor)} sin IVA, y está toda acá.`;
  return `La orden vale ${conSigno(orden.valor)} sin IVA: ${partes.join("; ")}; y ${conSigno(orden.enBloque)} `
    + "es lo que no estaba en el contrato, que va acá.";
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
      aclaracion: aclaracionDelBloque(b.orden),
    });
    for (const f of b.filas) out.push({ tipo: "fila", deOrden: true, ...f });
  }
  const t = m.totales;
  const cada = fn => Object.fromEntries(COLUMNAS.map(k => [k, fn(k)]));
  out.push({ tipo: "pie", etiqueta: m.iva > 0 ? "SUBTOTAL, SIN IVA" : "TOTAL", valores: cada(k => t[k]), fuerte: !(m.iva > 0) });
  if (m.iva > 0) {
    out.push({ tipo: "pie", etiqueta: `IVA ${m.iva} %`, valores: cada(k => c2(conIva(t[k], m.iva) - t[k])) });
    out.push({ tipo: "pie", etiqueta: "TOTAL", valores: cada(k => conIva(t[k], m.iva)), fuerte: true });
  }
  return out;
}
