import { conCosto, vivo, sinIvaDelGasto, esNegativo, seMide } from "./eficienciaDeRubros.js";
import { baseSinIva } from "./contratoDeLaObra.js";
import { totales } from "./cuentaBeneficios.js";
import { precioDelContrato } from "./clasesDePartida.js";
import { ordenCuenta } from "./cuentaOrdenCambio.js";
import { codigoDe } from "./nombreOrden.js";
import { rubrosDe, grupoDe } from "./variosRubros.js";
// EL RESULTADO DE LA OBRA, no solo los beneficios.
//
// Tres cosas lo hacen, y van juntas en un número y separadas abajo:
//
//   · LO QUE SE GANÓ COMPRANDO: los beneficios con papel, los de las órdenes
//     de cambio y los cargados a mano. Era lo único que se contaba.
//   · LAS PÉRDIDAS EN LOS RUBROS: un rubro que ya gastó más de lo que tenía
//     presupuestado es plata que la obra perdió, se lo siga o no. Dejarla
//     fuera era mostrar un beneficio de $5.000 en una obra que ya iba
//     perdiendo en tres rubros.
//   · LOS RUBROS SEGUIDOS: un beneficio también puede salir de un rubro del
//     presupuesto y de las facturas que se le cargan en la planilla. Se trae
//     el rubro, se lo sigue factura a factura, y cuando termina lo que dejó
//     cuenta.
//
// CONTRA QUÉ SE MIDE UN RUBRO: contra su COSTO presupuestado si está cargado
// —eso es comprar mejor o peor que lo previsto— y, si no, contra lo que se
// cobra, que mezcla el margen con la compra pero es lo único que hay.
//
// TODO SIN IVA, como los beneficios y como Diferencias: el beneficio es
// líquido y el IVA no es nuestro. El control trae sus rubros con el IVA
// adentro, así que acá se llevan a su base: lo que se cobra, y lo gastado en
// facturas dividido por el porcentaje del rubro. El costo ya viene sin IVA.
//
// Sin base de datos: son las cuentas que dicen si la obra deja plata.

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

// MANDA LA CANTIDAD DE LA LIQUIDACIÓN (Hernán, 24/11/2026).
//
// «Este rubro sale como pérdida, pero voy a instalar más de lo presupuestado,
// como está en el presupuesto de liquidación, que tiene órdenes de cambio y
// cantidades actualizadas... ¿esas cantidades deberían mandar?». El piso
// laminado del Aeropuerto: contratado por 6,25 m² —$309,38—, con 28 m²
// ejecutados cargados en la liquidación —se cobran $1.386,01— y $602,70
// gastados. Medido contra los 6,25 salía perdido en $293,32, mientras la
// liquidación decía que se iban a cobrar $1.386.
//
// En una obra POR RUBROS se cobra lo ejecutado: el rubro que ya tiene su
// cantidad ejecutada cargada se mide contra lo que la liquidación cobra por
// él, y su costo presupuestado, si lo tiene, es el de esa cantidad. Sin
// cantidad ejecutada cargada todavía no se midió, y sigue contra lo
// contratado. Llave en mano no cambia: ahí se cobra lo contratado, se ejecute
// lo que se ejecute.
//
// `medido` es lo que la liquidación dice de ese rubro del control
// (medidosPorRubro, en medidosDelControl.js): { medida, ejecutada, cobra }.
// Vale para los rubros del contrato y para los que entraron por una orden de
// cambio. Quien llama no lo pasa en llave en mano.

/** Un rubro del presupuesto medido contra sus facturas. */
export function seguimientoDeRubro(r, porRubro = {}, medido = null) {
  const gastado = sinIvaDelGasto(r, porRubro?.[r.id]?.acumulado);
  const contratado = baseSinIva(r);
  const porLiquidacion = !!medido?.medida;
  const ejecutada = porLiquidacion ? n(medido.ejecutada) : null;
  const cobrado = porLiquidacion ? c2(medido.cobra) : contratado;
  const costo = conCosto(r) ? c2(n(r.costo_unitario) * (porLiquidacion ? ejecutada : n(r.cantidad))) : null;
  const contra = costo != null ? "costo" : "cobrado";
  const presupuestado = costo ?? cobrado;
  const resultado = c2(presupuestado - gastado);
  const avance = n(r.avance_pct);
  const terminado = avance >= 100;
  // UNA PÉRDIDA ES HABER GASTADO MÁS DE LO PRESUPUESTADO, no un número
  // negativo. La reducción de una orden de cambio —"(–) piso de
  // microcemento", total en negativo— no tiene nada que comprar: sin gasto
  // no es pérdida de nada, aunque la resta dé negativo.
  //
  // Y UN RUBRO NEGATIVO NO ES UNA PÉRDIDA NUNCA, tenga gasto o no (Hernán,
  // 18/11/2026: «no es una pérdida, es solo un rubro negativo»). Con gasto
  // cargado por error la resta daba el total del renglón como perdido. Ver
  // `esNegativo`, en eficienciaDeRubros.js.
  const pasado = !esNegativo(r) && gastado > 0 && resultado < 0;
  const estado = pasado ? "pasado" : !gastado ? "sin_empezar" : terminado ? "terminado" : "en_curso";
  return {
    id: r.id, numero: String(r.numero ?? r.codigo ?? ""), descripcion: r.descripcion || "",
    unidad: r.unidad || "", cantidad: n(r.cantidad),
    cobrado, costo, gastado, avance, terminado, contra, presupuestado, resultado, estado,
    // Contra qué cantidad se midió: la ejecutada de la liquidación, si la
    // tiene. `contratado` es lo que se cobraba por lo firmado, para decirlo al lado.
    porLiquidacion, ejecutada, contratado,
    // Un rubro que entró por una orden de cambio: lo suyo es «lo aprobado», no
    // «lo contratado». Y lo que las órdenes le sumaron a un rubro del contrato
    // y ya está contado en los rubros de esas órdenes (medidosDelControl.js).
    deOrden: r.origen === "orden_cambio", enOrdenes: porLiquidacion ? n(medido.enOrdenes) : 0,
    // Cuenta en el resultado si ya pasó: una pérdida ya pasó; un ahorro,
    // recién cuando el rubro terminó. Antes es lo que falta comprar.
    cuenta: pasado || (terminado && gastado > 0),
  };
}

/** Los rubros que ya gastaron más de su presupuesto, se sigan o no. */
export function perdidasEnRubros(rubros = [], porRubro = {}, medidos = {}) {
  const filas = rubros.filter(seMide).map(r => seguimientoDeRubro(r, porRubro, medidos?.[String(r.id)]))
    .filter(f => f.estado === "pasado").sort((a, b) => a.resultado - b.resultado);
  return { filas, total: c2(filas.reduce((t, f) => t + f.resultado, 0)) };
}

// ── MANDA CONTROL DE OBRA ──────────────────────────────────────────────────
//
// Hernán, 18/11/2026: «sería importante poder ingresar precios o gastos
// manualmente para tener una idea hasta que vaya todo a control de obra y
// tener ya el total de beneficio real... o pérdida». Y cuando esos gastos ya
// están en Control, lo que definió: «manda Control de obra» —lo cargado a mano
// es un estimado y deja de sumar, para no contar el mismo gasto dos veces—.
//
// Un beneficio dice «esto se presupuestó en tanto y se compró en tanto», con
// el precio que alguien escribió. Control dice lo que el rubro gastó de
// verdad, factura por factura. Mientras Control no tenga todo, el beneficio es
// la mejor idea que hay y cuenta. Cuando Control ya puede decir cómo le fue al
// rubro, cuenta lo de Control y el beneficio deja de sumar.
//
// ¿CUÁNDO PUEDE DECIRLO CONTROL? Con la regla que ya tenía cada rubro:
//   · PASADO: gastó más de lo que tenía. Eso ya pasó; no hay estimado que lo
//     arregle. La pérdida cuenta en los rubros pasados.
//   · TERMINADO (avance al 100%) con gasto: lo que dejó es lo presupuestado
//     menos lo gastado, a favor o en contra.
// Un rubro a medio gastar no decide nada —lo que parece ahorro puede ser lo
// que falta comprar—: ahí sigue contando lo cargado a mano, y se dice cuánto
// lleva Control.
//
// CONTRA VARIOS RUBROS, el beneficio se reparte entre ellos según lo que pesa
// cada uno en la suma: la parte de un rubro que Control ya decidió deja de
// sumar, y la de los que siguen abiertos sigue.
//
// Lo de una orden de cambio no entra acá: eso es lo cobrado contra su
// cotización, no una compra contra un rubro.

const deOrden = b => b?.origen === "orden_cambio" || !!b?.orden_cambio_id;
/** ¿Control ya puede decir cómo le fue a este rubro? */
export const decididoPorControl = s => !!s && (s.estado === "pasado" || (s.estado === "terminado" && s.gastado > 0));

/**
 * Los beneficios, con lo que Control ya decidió sacado de la cuenta.
 *
 * @returns { beneficios, ganado }. `beneficios` son las mismas filas; a las
 *   que tocó Control se les baja `presupuestado` y `real` a la parte que sigue
 *   contando y llevan `_control`: { manda: "todo" | "parte" | null, enControl,
 *   rubros: [{ id, numero, descripcion, estado, gastado, presupuestado,
 *   resultado, decidido }], original: { presupuestado, real } }. `ganado` es
 *   lo que dejaron, según Control, los rubros con beneficio ya terminados a
 *   favor: { filas, total }.
 */
export function beneficiosConControl(beneficios = [], { rubros = [], porRubro = {}, medidos = {}, seguidos = [] } = {}) {
  const porId = new Map((rubros || []).map(r => [Number(r.id), r]));
  const dicho = new Map();
  const queDice = id => {
    if (!dicho.has(id)) { const r = porId.get(id); dicho.set(id, r && seMide(r) ? seguimientoDeRubro(r, porRubro, medidos?.[String(id)]) : null); }
    return dicho.get(id);
  };
  // EL RUBRO QUE SE SIGUE YA LO CUENTA CONTROL. Desde el 24/11/2026 un rubro en
  // seguimiento suma siempre —lo presupuestado menos lo gastado—, así que un
  // beneficio cargado a mano contra ese mismo rubro dejaría la misma plata
  // contada dos veces. Manda Control, como con el pasado y el terminado.
  // (Que el seguimiento le gane a lo cargado a mano es lectura mía de «manda
  // Control de obra»; hoy ningún rubro seguido tiene un beneficio cargado.)
  const enSeguimiento = new Set((seguidos || []).map(s => Number(s?.obra_rubro_id ?? s)));
  const decidido = p => decididoPorControl(p.s) || enSeguimiento.has(Number(p.id));
  const terminados = new Map();
  const filas = (beneficios || []).map(b => {
    // Ya pasó por acá: no se le saca dos veces.
    if (!b || b._control || deOrden(b)) return b;
    const ids = rubrosDe(b);
    if (!ids.length) return b;
    const { pesos } = grupoDe(ids, rubros);
    const partes = ids.map(id => ({ id, s: queDice(id), peso: pesos[id] ?? 0 })).filter(p => p.s);
    if (!partes.length) return b;
    const enControl = c2(partes.reduce((t, p) => t + p.s.gastado, 0));
    const decididas = partes.filter(decidido);
    const info = {
      enControl,
      rubros: partes.map(p => ({ id: p.id, numero: p.s.numero, descripcion: p.s.descripcion, estado: p.s.estado,
        gastado: p.s.gastado, presupuestado: p.s.presupuestado, resultado: p.s.resultado, decidido: decidido(p),
        seguido: enSeguimiento.has(Number(p.id)) })),
    };
    if (!decididas.length) return enControl > 0 ? { ...b, _control: { ...info, manda: null } } : b;
    decididas.filter(p => p.s.estado === "terminado" && p.s.resultado > 0).forEach(p => terminados.set(p.id, p.s));
    const todo = decididas.length === partes.length;
    // Lo que sigue contando: la parte de los rubros que Control no decidió.
    const queda = todo ? 0 : Math.max(0, 1 - decididas.reduce((t, p) => t + p.peso, 0));
    return {
      ...b,
      presupuestado: c2(n(b.presupuestado) * queda), real: c2(n(b.real) * queda),
      _control: { ...info, manda: todo ? "todo" : "parte", original: { presupuestado: n(b.presupuestado), real: n(b.real) } },
    };
  });
  const ganados = [...terminados.values()];
  return { beneficios: filas, ganado: { filas: ganados, total: c2(ganados.reduce((t, s) => t + s.resultado, 0)) } };
}

/** Cómo se dice debajo de un beneficio lo que Control lleva o ya decidió. */
export function notaDeControl(b, plata = v => `$${n(v).toFixed(2)}`) {
  const k = b?._control;
  if (!k) return "";
  const firmado = v => `${v >= 0 ? "+" : "−"}${plata(Math.abs(v))}`;
  if (!k.manda) return `En Control de obra ${k.rubros.length > 1 ? "esos rubros llevan" : "el rubro lleva"} ${plata(k.enControl)} gastados: sigue contando lo cargado a mano hasta que esté todo.`;
  const decididos = k.rubros.filter(x => x.decidido)
    .map(x => (x.estado === "pasado" || x.estado === "terminado"
      ? `${x.numero} ${x.estado === "pasado" ? "se pasó" : "terminó"}: gastó ${plata(x.gastado)} de ${plata(x.presupuestado)}, ${firmado(x.resultado)}`
      // En seguimiento y todavía abierto: lo cuenta el seguimiento, con lo gastado hasta hoy.
      : `${x.numero} está en seguimiento: lleva gastados ${plata(x.gastado)} de ${plata(x.presupuestado)}, ${firmado(x.resultado)} por ahora`));
  const cargado = c2(k.original.presupuestado - k.original.real);
  return `Manda Control de obra${k.manda === "parte" ? " en una parte" : ""} · ${decididos.join(" · ")}`
    + ` · lo cargado a mano era ${firmado(cargado)}${k.manda === "parte" ? ": cuenta solo la parte de los rubros que siguen abiertos" : " y ya no suma"}`;
}

/**
 * @param beneficios  los guardados de la obra (con papel, a mano, de órdenes)
 * @param rubros      los del control
 * @param seguidos    [{ id, obra_rubro_id }] los que se siguen
 * @param porRubro    lo que calculó calcularControl: `acumulado` es lo gastado
 */
/**
 * LO QUE UNA ORDEN APROBADA LE QUITÓ A CADA RUBRO, en cantidad.
 *
 * Una reducción no borra el rubro: entra en negativo en el capítulo de su
 * orden y el rubro del contrato queda como estaba. Para saber cuánto queda
 * aprobado de verdad hay que restarle lo que las órdenes que cuentan le
 * sacaron.
 */
export function reduccionesAprobadas(ordenes = [], lineasDeOrdenes = {}) {
  const por = {};
  for (const o of ordenes) {
    if (!ordenCuenta(o)) continue;
    for (const l of lineasDeOrdenes[o.id] || []) {
      if (l.tipo !== "quita" || !l.obra_rubro_id) continue;
      por[l.obra_rubro_id] = (por[l.obra_rubro_id] || 0) + n(l.cantidad);
    }
  }
  return por;
}

/**
 * EL BENEFICIO DE LO YA APROBADO, RUBRO POR RUBRO.
 *
 * Un rubro que el cliente aprobó a un precio y del que se sabe el costo ya
 * deja beneficio: precio menos costo, por la cantidad que sigue aprobada. No
 * hace falta una proforma abierta ni una decisión de nadie —vive en el rubro—,
 * así que borrar el análisis de donde salió el costo no lo hace desaparecer.
 *
 *   · Lo que una orden de cambio AUMENTA no está acá: eso entra con la orden,
 *     el día que el cliente la aprueba.
 *   · Lo que una orden aprobada REDUJO ya está descontado: lo que queda
 *     conserva su beneficio.
 *   · El rubro que ya tiene un beneficio cargado a mano no se cuenta dos
 *     veces: manda el que alguien escribió con su papel.
 *
 * Sin IVA, como todo Beneficios. Solo sobre la cantidad YA aprobada: lo que
 * está en una orden de cambio sin aprobar no cuenta todavía.
 *
 * Y UN COSTO QUE NO SE PARECE AL PRECIO NO SE CUENTA. Unas mamparas de $6.000
 * con $150 de costo cargado no dejan $5.850: tienen un costo mal puesto. Se
 * listan aparte, marcadas, para que alguien lo corrija, y no entran al total.
 */
export function beneficioDeLoAprobado({ rubros = [], beneficios = [], reducciones = {}, deltas = {}, modalidad = "rubros" } = {}) {
  // Todos los rubros de cada beneficio a mano, que ahora puede ir contra
  // varios. Y si Control ya lo sacó entero de la cuenta, ese rubro vuelve a
  // contar por acá: su margen no puede quedar sin contar por los dos lados.
  const aMano = new Set(beneficios.filter(b => b?.origen === "manual" && b._control?.manda !== "todo")
    .flatMap(b => rubrosDe(b)).map(String));
  const filas = rubros.filter(vivo)
    .filter(r => r.origen !== "orden_cambio" && conCosto(r) && !aMano.has(String(r.id)))
    .map(r => {
      const contratada = n(r.cantidad);
      const reducida = Math.min(contratada, n(reducciones[r.id]));
      const aprobada = Math.round((contratada - reducida) * 10000) / 10000;
      // LO EJECUTADO, SI YA SE MIDIÓ (liquidacion.js). La diferencia contra lo
      // vigente mueve la cantidad de este rubro: por rubros se cobra y cuesta
      // lo ejecutado; llave en mano se cobra lo aprobado y cuesta lo ejecutado.
      const delta = n(deltas[r.id]);
      const ejecutada = Math.max(0, Math.round((aprobada + delta) * 10000) / 10000);
      const llave = modalidad === "llave_en_mano";
      const cantidad = llave ? aprobada : ejecutada;
      const precio = precioDelContrato(r);
      const costo = n(r.costo_unitario);
      if (precio == null || !(cantidad > 0)) return null;
      return {
        id: r.id, numero: String(r.numero ?? r.codigo ?? ""), descripcion: r.descripcion || "",
        unidad: r.unidad || "", contratada, reducida, cantidad, precio, costo,
        aprobada, ejecutada, delta, medida: delta !== 0, llave,
        seCobra: c2(precio * cantidad), cuesta: c2(costo * ejecutada),
        beneficio: llave && delta ? c2(precio * cantidad - costo * ejecutada) : c2((precio - costo) * cantidad),
        dudoso: costo < precio / 2 || costo > precio * 2,
      };
    }).filter(Boolean).sort((a, b) => (a.dudoso - b.dudoso) || (b.beneficio - a.beneficio));
  const firmes = filas.filter(f => !f.dudoso);
  return {
    filas, cuantos: firmes.length, dudosos: filas.length - firmes.length,
    total: c2(firmes.reduce((t, f) => t + f.beneficio, 0)),
  };
}

/**
 * LAS ÓRDENES DE CAMBIO POR APROBAR, Y LO QUE DEJARÍAN.
 *
 * Lo que una orden agrega o aumenta es beneficio recién cuando el cliente la
 * aprueba: antes no hay nada vendido. Pero hace falta verlo antes —es lo que
 * dice cuánto hay en juego en esa firma—, igual que un rubro en seguimiento se
 * muestra aunque no cuente hasta terminar.
 *
 *   · Lo que AGREGA deja su precio menos su costo, por su cantidad. Una partida
 *     sin costo no se puede medir, y se dice cuántas son.
 *   · Lo que REDUCE saca el beneficio que esas unidades tenían en el rubro: su
 *     precio aprobado menos su costo cargado. Si el rubro no tiene costo, no se
 *     sabe cuánto dejaba y no se resta nada.
 *
 * Es aproximado y no suma al resultado. En borrador o enviada; la anulada y la
 * reemplazada por una modificación ya no esperan ninguna firma.
 */
export function ordenesPorAprobar({ ordenes = [], lineasDeOrdenes = {}, rubros = [] } = {}) {
  const porId = new Map(rubros.map(r => [String(r.id), r]));
  const filas = ordenes
    .filter(o => (o.estado === "borrador" || o.estado === "enviada") && !o.anulada && !o.reemplazada_at)
    .map(o => {
      const ls = lineasDeOrdenes[o.id] || [];
      const agrega = ls.filter(l => l.tipo !== "quita");
      const conSuCosto = agrega.filter(l => n(l.costo_unitario) > 0);
      const dejan = c2(conSuCosto.reduce((t, l) => t + (n(l.precio_unitario) - n(l.costo_unitario)) * n(l.cantidad), 0));
      const sacan = c2(ls.filter(l => l.tipo === "quita" && l.obra_rubro_id).reduce((t, l) => {
        const r = porId.get(String(l.obra_rubro_id));
        const precio = r && conCosto(r) ? precioDelContrato(r) : null;
        return precio == null ? t : t + (precio - n(r.costo_unitario)) * Math.min(n(l.cantidad), n(r.cantidad));
      }, 0));
      return {
        id: o.id, codigo: codigoDe(o), titulo: o.titulo || "", estado: o.estado,
        esModificacion: !!o.revision_de, partidas: ls.length,
        dejan, sacan, sinCosto: agrega.length - conSuCosto.length,
        beneficio: c2(dejan - sacan),
      };
    })
    .filter(x => x.partidas > 0);
  return { filas, total: c2(filas.reduce((t, x) => t + x.beneficio, 0)) };
}

/**
 * @param medidos  lo que la liquidación dice de cada rubro del control
 *                 (medidosPorRubro): de ahí sale la cantidad ejecutada que manda
 */
export function resultadoDeLaObra({ beneficios = [], rubros = [], seguidos = [], porRubro = {}, ordenes = [], lineasDeOrdenes = {}, deltas = {}, medidos = {}, modalidad = "rubros" } = {}) {
  // MANDA LA LIQUIDACIÓN, en una obra por rubros: llave en mano cobra lo
  // contratado, y ahí lo ejecutado no cambia contra qué se mide un rubro.
  const deLaLiquidacion = modalidad === "llave_en_mano" ? {} : (medidos || {});
  // MANDA CONTROL: lo cargado a mano deja de sumar donde Control ya decidió,
  // y en los rubros que se siguen.
  const conControl = beneficiosConControl(beneficios, { rubros, porRubro, medidos: deLaLiquidacion, seguidos });
  const t = totales(conControl.beneficios);
  const perdidas = perdidasEnRubros(rubros, porRubro, deLaLiquidacion);
  const porId = new Map(rubros.map(r => [String(r.id), r]));
  // LOS RUBROS EN SEGUIMIENTO SUMAN SIEMPRE (Hernán, 24/11/2026: «los rubros
  // en seguimiento deberían sumar al total de beneficios... creo que no están
  // sumando»). No sumaban: contaban recién al terminar —avance al 100%— y
  // ningún rubro del Aeropuerto tenía avance anotado. Lo que eligió: que sumen
  // siempre, lo presupuestado menos lo gastado hasta hoy. Mientras el rubro
  // esté abierto, ese número baja con cada factura que le entra.
  const seguimiento = seguidos.map(s => {
    const r = porId.get(String(s.obra_rubro_id));
    if (!r) return null;
    const f = seguimientoDeRubro(r, porRubro, deLaLiquidacion[String(r.id)]);
    // El renglón en negativo de una orden no se mide nunca, se siga o no.
    return { seguido: s, ...f, cuenta: seMide(r) };
  }).filter(Boolean);
  // Lo que van dejando los seguidos. El que se pasó no está acá: ya está en
  // las pérdidas, que son de todos los rubros, y no se cuenta dos veces.
  const ganadoEnSeguidos = c2(seguimiento
    .filter(f => f.cuenta && f.estado !== "pasado")
    .reduce((s, f) => s + f.resultado, 0));
  // Lo que dejaron, según Control, los rubros con un beneficio cargado que ya
  // terminaron a favor. Los que además se siguen ya están contados arriba.
  const yaSeguidos = new Set(seguimiento.map(f => String(f.id)));
  const filasSegunControl = conControl.ganado.filas.filter(f => !yaSeguidos.has(String(f.id)));
  const ganadoSegunControl = c2(filasSegunControl.reduce((s, f) => s + f.resultado, 0));
  const aprobados = beneficioDeLoAprobado({ rubros, beneficios: conControl.beneficios, reducciones: reduccionesAprobadas(ordenes, lineasDeOrdenes), deltas, modalidad });
  return {
    conPapel: t.neto, cuantosConPapel: t.cuantos,
    previsto: t.previsto, cuantosPrevistos: t.cuantosPrevistos,
    perdidas: perdidas.filas, perdidasTotal: perdidas.total,
    seguimiento, ganadoEnSeguidos,
    // Lo que deja lo ya aprobado, rubro por rubro.
    aprobados,
    // Lo que dejarían las órdenes que esperan firma: a la vista, sin sumar.
    porAprobar: ordenesPorAprobar({ ordenes, lineasDeOrdenes, rubros }),
    // LO YA APROBADO ES BENEFICIO, Y SUMA. Un rubro que el cliente aprobó a un
    // precio y del que se sabe el costo ya dejó esa diferencia: no es una
    // promesa de una proforma, es el contrato. Y cierra con lo demás: si
    // después el rubro gasta más que su costo, esa pérdida entra por los
    // pasados, y la suma de las dos es lo que de verdad dejó —precio menos lo
    // gastado—.
    neto: c2(t.neto + perdidas.total + ganadoEnSeguidos + ganadoSegunControl + aprobados.total),
    // MANDA CONTROL: los beneficios como cuentan —con lo que Control ya
    // decidió sacado—, y lo que esos rubros dejaron según Control.
    contados: conControl.beneficios,
    segunControl: { filas: filasSegunControl, total: ganadoSegunControl },
  };
}
