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
/**
 * EL COSTO DE UNA ORDEN DE CAMBIO VA SIN IVA.
 *
 * El precio que firma el cliente es el del contrato, sin IVA. La proforma del
 * proveedor viene con IVA adentro —así la lee NOVA, porque en Beneficios eso es
 * lo correcto: ahí se decide a quién comprarle y lo que se paga es con IVA—.
 * Medir uno contra el otro es comparar dos cosas distintas y se come el margen
 * entero sin que nada lo diga.
 */
export const sinIva = (monto, iva) => {
  const p = n(iva);
  if (!(p > 0)) return n(monto);
  return Math.round((n(monto) / (1 + p / 100)) * 10000) / 10000;
};

export function partidasDeCotizacion(items = [], iva = 0, neta = true) {
  // Desde la 139 NOVA lee el subtotal del renglón: no hay nada que descontar.
  // Solo las cotizaciones viejas vinieron con el IVA adentro.
  if (neta) iva = 0;
  return items.filter(x => x?.descripcion && n(x.monto)).map(x => {
    const cantidad = n(x.cantidad) || 1;
    // El unitario sale del total, que es el número que el proveedor suma: si
    // la proforma trae el unitario y el total, el que vale es el que
    // multiplica.
    const unitario = Math.round((sinIva(x.monto, iva) / cantidad) * 10000) / 10000;
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
 * LOS COSTOS DE UNA PROFORMA, CON OTRO IVA.
 *
 * Cuando se corrige el IVA de una proforma ya cargada, el costo de sus
 * partidas tiene que moverse con él. Volver a emparejar los renglones no
 * sirve: si alguien renombró una partida, el emparejamiento falla, el costo se
 * queda con el IVA viejo y la pantalla no dice nada; y el emparejamiento por
 * nombre puede agarrar una partida que salió de OTRA proforma.
 *
 * Entonces se reescala lo que ya está: solo las partidas atadas a esta
 * proforma, y por la razón entre los dos IVA. Si alguien ajustó a mano el
 * costo de una de ellas, el ajuste se respeta: se le cambia el impuesto, no el
 * número.
 *
 * @returns [{ id, costo_unitario }] las partidas a corregir
 */
export function costosConOtroIva(lineas = [], cotizacionId, ivaViejo = 0, ivaNuevo = 0) {
  const factor = (1 + n(ivaViejo) / 100) / (1 + n(ivaNuevo) / 100);
  return lineas
    .filter(l => l.tipo !== "quita" && tieneCosto(l) && l.cotizacion_id != null
      && Number(l.cotizacion_id) === Number(cotizacionId))
    .map(l => ({ id: l.id, costo_unitario: Math.round(n(l.costo_unitario) * factor * 10000) / 10000 }));
}

/**
 * EL COSTO DE CADA PARTIDA, SACADO DE LA COTIZACIÓN.
 *
 * Esto era un enlace subrayado que decía "tomar los costos en orden" y que
 * aparecía solo cuando había tantas adiciones como renglones. Quien sube una
 * cotización ya dijo lo que quería decir —"esto es lo que me cuesta"— y pedirle
 * además que encuentre un enlace gris es como se llega a una orden de cambio
 * con la cotización adentro y el margen sin saberse: fue lo que pasó con la
 * OC-01 de Plaza Lagos, cotizada en $1.389,75 contra $1.726,64 cobrados, con el
 * beneficio invisible porque el costo nunca bajó a la partida.
 *
 * SE EMPAREJA POR LO QUE DICE, Y SI NO, POR POSICIÓN. El nombre es lo que de
 * verdad ata un renglón de la proforma con una partida de la orden: casi
 * siempre la partida se escribió copiando ese renglón. La posición solo se usa
 * cuando las dos listas tienen el mismo largo, porque emparejar por posición
 * listas de distinto largo le pone el costo de una cosa a otra, y ese error no
 * se ve hasta la liquidación —o hasta que se cobró de menos—.
 *
 * Lo que no se puede emparejar se dice. Una orden con dos partidas sin costo no
 * tiene margen, y el margen que no se sabe no es cero.
 *
 * @returns { pone: [{id, costo_unitario, como}], sinCosto, sinUsar }
 */
export function emparejarCostos(lineas = [], items = [], iva = 0, neta = true) {
  if (neta) iva = 0;
  const limpio = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const adiciones = lineas.filter(l => l.tipo !== "quita");
  const utiles = (items || []).filter(x => x?.descripcion && n(x.monto));
  const libres = utiles.map((x, i) => ({ ...x, i, usado: false }));
  const pone = [];

  const costoDe = (l, x) => {
    // El unitario sale del total, que es el número que el proveedor suma, y
    // SIN IVA: la orden cobra sin IVA y el margen tiene que medir lo mismo
    // contra lo mismo.
    const cant = n(l.cantidad) || n(x.cantidad) || 1;
    return Math.round((sinIva(x.monto, iva) / cant) * 10000) / 10000;
  };

  // 1. Por nombre: el que de verdad ata los dos papeles.
  for (const l of adiciones) {
    const nom = limpio(l.descripcion);
    if (!nom) continue;
    const x = libres.find(y => !y.usado && limpio(y.descripcion) === nom);
    if (!x) continue;
    x.usado = true;
    pone.push({ id: l.id, costo_unitario: costoDe(l, x), como: "por el nombre" });
  }

  // 2. Por posición, solo si lo que queda calza exacto de los dos lados.
  const faltan = adiciones.filter(l => !pone.some(p => p.id === l.id));
  const sobran = libres.filter(x => !x.usado);
  if (faltan.length && faltan.length === sobran.length) {
    faltan.forEach((l, k) => {
      sobran[k].usado = true;
      pone.push({ id: l.id, costo_unitario: costoDe(l, sobran[k]), como: "por su posición en la proforma" });
    });
  }

  return {
    pone,
    sinCosto: adiciones.filter(l => !pone.some(p => p.id === l.id) && !tieneCosto(l)).map(l => l.descripcion),
    sinUsar: libres.filter(x => !x.usado).map(x => x.descripcion),
  };
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
/**
 * ¿Esta orden cuenta para la utilidad de la obra?
 *
 * APROBADA QUIERE DECIR QUE CUENTA. Una orden aprobada ya metió sus rubros al
 * presupuesto y se le está cobrando al cliente: su margen es utilidad de la
 * obra desde ese momento, igual que el de una compra.
 *
 * Acá se pedía además que estuviera marcada como ejecutada, y eso hacía
 * desaparecer en silencio a las dos OC-01 —aprobadas, cobrándose por $12.603, y
 * marcadas 'no ejecutado' porque nadie sabía que ese interruptor movía la
 * utilidad—. Lo que saca a una orden de la cuenta es ANULARLA: ahí deja de
 * cobrarse, y ahí deja de ser beneficio.
 */
export const ordenCuenta = o => o?.estado === "aprobada" && !o.anulada;

/**
 * Los beneficios previstos que tiene que tener una obra por sus órdenes de
 * cambio, contra los que ya tiene.
 *
 * Devuelve qué insertar, qué corregir y qué borrar. LO CONFIRMADO NO SE TOCA:
 * es una compra que ya pasó, con su costo real, y ninguna corrección del costo
 * cotizado puede pisarlo. Solo se mueve lo que todavía es promesa.
 */
export function planDeBeneficios({ obraId, ordenes = [], lineasPorOrden = {}, rubros = [], cotizaciones = {}, gastosPorOrden = {}, existentes = [], codigoDe }) {
  const porLinea = new Map(existentes.filter(b => b.orden_cambio_linea_id).map(b => [Number(b.orden_cambio_linea_id), b]));
  const porGasto = new Map(existentes.filter(b => b.orden_cambio_gasto_id).map(b => [Number(b.orden_cambio_gasto_id), b]));
  const queridas = new Set();
  const queridosGastos = new Set();
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

  // ── LOS GASTOS QUE NO SON PARTIDAS ────────────────────────────────────────
  //
  // El flete, la mano de obra propia, el andamio. Entran SIN PRECIO: no se le
  // cobró nada al cliente por eso, así que lo presupuestado es cero y lo real
  // es lo que salió. Sin esto, la página de Beneficios mostraba más utilidad de
  // la que la obra tiene — y con ese número se pone el precio de la próxima.
  for (const o of ordenes) {
    if (!ordenCuenta(o)) continue;
    const codigo = codigoDe(o);
    for (const g of gastosPorOrden[o.id] || []) {
      queridosGastos.add(Number(g.id));
      const fila = {
        obra_id: obraId,
        obra_rubro_id: null,
        descripcion: `${codigo} · ${g.descripcion}`.slice(0, 200),
        cantidad: 1,
        unidad: null,
        presupuestado: 0,
        real: n(g.monto),
        proveedor: g.proveedor || null,
        orden_cambio_id: o.id,
        orden_cambio_gasto_id: g.id,
      };
      const ya = porGasto.get(Number(g.id));
      if (!ya) { insertar.push({ ...fila, origen: "orden_cambio", estado: "previsto" }); continue; }
      if (ya.estado !== "previsto") continue;
      const cambia = Object.keys(fila).some(k => {
        const a2 = ya[k], b2 = fila[k];
        return typeof b2 === "number" ? Math.abs(n(a2) - b2) > 0.004 : (a2 ?? null) !== (b2 ?? null);
      });
      if (cambia) actualizar.push({ id: ya.id, campos: fila });
    }
  }

  // Lo previsto de una partida o de un gasto que ya no cuenta —se deshizo la
  // aprobación, se anuló la orden, se le quitó el costo, se borró el gasto— se
  // va. Lo confirmado se queda.
  const borrar = existentes
    .filter(b => b.orden_cambio_id && b.estado === "previsto"
      && (b.orden_cambio_gasto_id
        ? !queridosGastos.has(Number(b.orden_cambio_gasto_id))
        : !queridas.has(Number(b.orden_cambio_linea_id))))
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
export function liquidacionInterna({ ordenes = [], lineasPorOrden = {}, beneficios = [], cotizaciones = {}, gastosPorOrden = {}, subtotalesDe, codigoDe }) {
  const confirmados = new Map(beneficios
    .filter(b => b.orden_cambio_linea_id && b.estado !== "previsto")
    .map(b => [Number(b.orden_cambio_linea_id), b]));

  // LAS QUE TODAVÍA NO SE APROBARON TAMBIÉN SE LIQUIDAN, APARTE.
  //
  // Una orden cotizada y todavía no aprobada ya tiene su margen a la vista: es
  // justo cuando sirve mirarlo, porque todavía se puede cambiar el precio. No
  // entra al control de obra ni a los beneficios —el cliente no la aceptó— pero
  // la idea de lo que deja existe desde que llega la proforma, y esconderla
  // hasta la firma es mirar la plata cuando ya no se puede hacer nada.
  const filas = [...ordenes].filter(o => !o.anulada && o.estado !== "rechazada")
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
      // Lo que cuesta la orden y no es una partida: el flete, la mano de obra
      // propia, el alquiler. Sin esto el margen de la liquidación es el de las
      // compras, no el de la orden.
      const sueltos = (gastosPorOrden[o.id] || []).reduce((t, g) => t + n(g.monto), 0);
      costoVigente += sueltos;
      const margen = m.cobrado - costoVigente;
      return {
        id: o.id,
        codigo: codigoDe(o),
        titulo: o.titulo,
        ejecucion: o.ejecucion,
        estado: o.estado,
        aprobada: o.estado === "aprobada",
        total: c2(subtotalesDe(lineas).total),
        cobradoConCosto: m.cobrado,
        costoCotizado: c2(m.costo + sueltos),
        gastosSueltos: c2(sueltos),
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

  // EL TOTAL ES EL DE LAS APROBADAS, que es la plata que de verdad está. Lo
  // que todavía se discute se dice aparte: sumarlo adentro convierte un número
  // que se puede llevar a una reunión en una esperanza.
  const aprobadas = filas.filter(f => f.aprobada);
  const enCamino = filas.filter(f => !f.aprobada);
  const sumar = (lista, k) => c2(lista.reduce((t, f) => t + n(f[k]), 0));
  const cobradoConCosto = sumar(aprobadas, "cobradoConCosto");
  const margen = sumar(aprobadas, "margen");
  const cobradoEnCamino = sumar(enCamino, "cobradoConCosto");
  const margenEnCamino = sumar(enCamino, "margen");
  return {
    filas,
    total: {
      total: sumar(aprobadas, "total"), cobradoConCosto, costoCotizado: sumar(aprobadas, "costoCotizado"),
      costo: sumar(aprobadas, "costo"), margen,
      pct: cobradoConCosto ? Math.round((margen / cobradoConCosto) * 1000) / 10 : null,
      ordenesSinCosto: filas.filter(f => f.sinCosto > 0).length,
    },
    enCamino: {
      cuantas: enCamino.length,
      total: sumar(enCamino, "total"), cobradoConCosto: cobradoEnCamino,
      costo: sumar(enCamino, "costo"), margen: margenEnCamino,
      pct: cobradoEnCamino ? Math.round((margenEnCamino / cobradoEnCamino) * 1000) / 10 : null,
    },
  };
}
