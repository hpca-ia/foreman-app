// Las cuentas del margen de las órdenes de cambio.
//
// Aparte del resto porque es lo que se puede probar sin Supabase, y porque es
// lo que no puede estar mal: con estos números se liquida la obra y se decide
// si una orden de cambio dejó plata o la puso.
//
// El margen de una orden es lo que se le cobra al cliente contra lo que cuesta
// según la cotización del proveedor. Solo cuenta en las partidas que tienen
// costo: una partida sin costo no tiene margen cero, tiene margen desconocido,
// y sumarla como cero haría parecer que la orden se cobró al costo.

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

/** ¿Se sabe lo que cuesta? Cero es un costo; vacío es no saberlo. */
export const tieneCosto = l => l?.costo_unitario !== null && l?.costo_unitario !== undefined && l?.costo_unitario !== "";

/** Lo que se cobra por la partida. */
export const precioDeLinea = l => c2(n(l.cantidad) * n(l.precio_unitario));

/** Lo que cuesta la partida según la cotización, o null si no se sabe. */
export const costoDeLinea = l => (tieneCosto(l) ? c2(n(l.cantidad) * n(l.costo_unitario)) : null);

/**
 * El margen de una orden, partida por partida.
 *
 * Solo las ADICIONES: una reducción es trabajo que no se hace y no tiene
 * cotización de nadie. Lo que deja una reducción ya está en el presupuesto.
 */
export function margenDeOrden(lineas = []) {
  const adiciones = lineas.filter(l => l.tipo !== "quita");
  let cobrado = 0, costo = 0, sinCosto = 0;
  for (const l of adiciones) {
    if (!tieneCosto(l)) { sinCosto += 1; continue; }
    cobrado += precioDeLinea(l);
    costo += costoDeLinea(l);
  }
  const margen = cobrado - costo;
  return {
    cobrado: c2(cobrado), costo: c2(costo), margen: c2(margen),
    // Sobre lo cobrado, que es como se habla de margen en la oficina.
    pct: cobrado ? Math.round((margen / cobrado) * 1000) / 10 : null,
    conCosto: adiciones.length - sinCosto, sinCosto,
  };
}

/**
 * La cotización que NOVA leyó, vuelta partidas de la orden.
 *
 * El precio nace igual al costo —es lo único que se sabe—, y el costo queda
 * aparte para que ponerle margen al precio no borre lo que cuesta.
 */
export function partidasDeCotizacion(items = []) {
  return items.filter(x => x?.descripcion && n(x.monto)).map(x => {
    const cantidad = n(x.cantidad) || 1;
    // El unitario sale del total, que es el número que el proveedor suma: si
    // la proforma trae el unitario y el total, el que vale es el que
    // multiplica.
    const unitario = Math.round((n(x.monto) / cantidad) * 10000) / 10000;
    return {
      tipo: "aumenta",
      descripcion: String(x.descripcion).slice(0, 160),
      unidad: x.unidad || "u",
      cantidad,
      precio_unitario: c2(unitario),
      costo_unitario: unitario,
      obra_rubro_id: "",
    };
  });
}

/**
 * EL PRECIO SALE DEL COSTO MÁS EL MARGEN.
 *
 * Lo que NOVA lee de la cotización es lo que CUESTA. El precio lo pone la
 * oficina, y casi siempre es el mismo porcentaje para toda la orden: hacerlo
 * renglón por renglón, con la calculadora al lado, es donde se cuela el error
 * que después nadie encuentra —una partida cobrada al costo entre veinte—.
 *
 * Solo toca las adiciones con costo conocido: una partida sin costo no tiene
 * de dónde sacar el precio, y una reducción no se cotiza.
 */
export function conMargen(lineas = [], pct) {
  const p = n(pct);
  return lineas.map(l => {
    if (l.tipo === "quita" || !tieneCosto(l)) return l;
    return { ...l, precio_unitario: c2(n(l.costo_unitario) * (1 + p / 100)) };
  });
}

/** El total de la cotización, sumado de sus renglones. */
export const totalDeCotizacion = (items = []) => c2(items.reduce((t, x) => t + n(x.monto), 0));

/**
 * Qué rubro del presupuesto creó cada partida al aprobarse la orden.
 *
 * Por la descripción, que es como la escribe la aprobación —"Descripción · OC-03"—
 * y no por el número: el número sale de la posición de la partida, y dos
 * partidas viejas con el mismo `orden` no tienen posición segura.
 */
export function rubroDeCadaLinea(codigo, lineas = [], rubros = []) {
  const libres = [...rubros];
  const mapa = {};
  for (const l of lineas) {
    if (l.tipo === "quita") continue;
    const buscado = `${l.descripcion}  ·  ${codigo}`;
    const i = libres.findIndex(r => r.descripcion === buscado);
    if (i < 0) continue;
    mapa[l.id] = libres[i].id;
    libres.splice(i, 1);
  }
  return mapa;
}

/** ¿La orden deja beneficio? Aprobada, viva y ejecutada o por ejecutar. */
export const ordenCuenta = o => o?.estado === "aprobada" && !o.anulada && o.ejecucion !== "no_ejecutado";

/**
 * Los beneficios previstos que tiene que tener una obra por sus órdenes de
 * cambio, contra los que ya tiene.
 *
 * Devuelve qué insertar, qué corregir y qué borrar. LO CONFIRMADO NO SE TOCA:
 * es una compra que ya pasó, con su costo real, y ninguna corrección del costo
 * cotizado puede pisarlo. Solo se mueve lo que todavía es promesa.
 */
export function planDeBeneficios({ obraId, ordenes = [], lineasPorOrden = {}, rubros = [], cotizaciones = {}, existentes = [], codigoDe }) {
  const porLinea = new Map(existentes.filter(b => b.orden_cambio_linea_id).map(b => [Number(b.orden_cambio_linea_id), b]));
  const queridas = new Set();
  const insertar = [], actualizar = [];

  for (const o of ordenes) {
    if (!ordenCuenta(o)) continue;
    const codigo = codigoDe(o);
    const lineas = lineasPorOrden[o.id] || [];
    const rubroDe = rubroDeCadaLinea(codigo, lineas, rubros.filter(r => Number(r.orden_cambio_id) === Number(o.id)));
    const cotDe = new Map((cotizaciones[o.id] || []).map(c => [Number(c.id), c]));
    for (const l of lineas) {
      if (l.tipo === "quita" || !tieneCosto(l)) continue;
      queridas.add(Number(l.id));
      const cot = cotDe.get(Number(l.cotizacion_id)) || (cotizaciones[o.id] || [])[0] || null;
      const fila = {
        obra_id: obraId,
        obra_rubro_id: rubroDe[l.id] || null,
        descripcion: `${codigo} · ${l.descripcion}`.slice(0, 200),
        cantidad: n(l.cantidad),
        unidad: l.unidad || null,
        presupuestado: precioDeLinea(l),
        real: costoDeLinea(l),
        proveedor: cot?.proveedor || null,
        archivo_path: cot?.archivo_path || null,
        archivo_nombre: cot?.archivo_nombre || null,
        orden_cambio_id: o.id,
        orden_cambio_linea_id: l.id,
      };
      const ya = porLinea.get(Number(l.id));
      if (!ya) { insertar.push({ ...fila, origen: "orden_cambio", estado: "previsto" }); continue; }
      if (ya.estado !== "previsto") continue;
      const cambia = Object.keys(fila).some(k => {
        const a = ya[k], b = fila[k];
        return typeof b === "number" ? Math.abs(n(a) - b) > 0.004 : (a ?? null) !== (b ?? null);
      });
      if (cambia) actualizar.push({ id: ya.id, campos: fila });
    }
  }

  // Lo previsto de una partida que ya no cuenta —se deshizo la aprobación, se
  // anuló la orden, se le quitó el costo— se va. Lo confirmado se queda.
  const borrar = existentes
    .filter(b => b.orden_cambio_id && b.estado === "previsto" && !queridas.has(Number(b.orden_cambio_linea_id)))
    .map(b => b.id);

  return { insertar, actualizar, borrar };
}

/**
 * La liquidación interna: cuánto dejó cada orden de cambio.
 *
 * Es interna y no sale nunca al cliente: el documento que firma el cliente es
 * el consolidado, con lo que se le cobra. Este dice lo que costó.
 *
 * El costo de cada partida es el real si ya se compró (el beneficio está
 * confirmado) y el de la cotización si todavía no. Se dicen los dos para que
 * se vea cuánto de la liquidación es todavía una promesa.
 */
export function liquidacionInterna({ ordenes = [], lineasPorOrden = {}, beneficios = [], cotizaciones = {}, subtotalesDe, codigoDe }) {
  const confirmados = new Map(beneficios
    .filter(b => b.orden_cambio_linea_id && b.estado !== "previsto")
    .map(b => [Number(b.orden_cambio_linea_id), b]));

  const filas = [...ordenes].filter(o => o.estado === "aprobada" && !o.anulada)
    .sort((a, b) => (a.numero || 0) - (b.numero || 0))
    .map(o => {
      const lineas = lineasPorOrden[o.id] || [];
      const m = margenDeOrden(lineas);
      let costoVigente = 0, costoReal = 0, comprados = 0;
      for (const l of lineas) {
        if (l.tipo === "quita" || !tieneCosto(l)) continue;
        const b = confirmados.get(Number(l.id));
        if (b) { costoVigente += n(b.real); costoReal += n(b.real); comprados += 1; }
        else costoVigente += costoDeLinea(l);
      }
      const margen = m.cobrado - costoVigente;
      return {
        id: o.id,
        codigo: codigoDe(o),
        titulo: o.titulo,
        ejecucion: o.ejecucion,
        total: c2(subtotalesDe(lineas).total),
        cobradoConCosto: m.cobrado,
        costoCotizado: m.costo,
        costoReal: comprados ? c2(costoReal) : null,
        costo: c2(costoVigente),
        margen: c2(margen),
        pct: m.cobrado ? Math.round((margen / m.cobrado) * 1000) / 10 : null,
        sinCosto: m.sinCosto,
        conCosto: m.conCosto,
        comprados,
        proveedores: [...new Set((cotizaciones[o.id] || []).map(c => c.proveedor).filter(Boolean))],
      };
    });

  const suma = k => c2(filas.reduce((t, f) => t + n(f[k]), 0));
  const cobradoConCosto = suma("cobradoConCosto");
  const margen = suma("margen");
  return {
    filas,
    total: {
      total: suma("total"), cobradoConCosto, costoCotizado: suma("costoCotizado"),
      costo: suma("costo"), margen,
      pct: cobradoConCosto ? Math.round((margen / cobradoConCosto) * 1000) / 10 : null,
      ordenesSinCosto: filas.filter(f => f.sinCosto > 0).length,
    },
  };
}
