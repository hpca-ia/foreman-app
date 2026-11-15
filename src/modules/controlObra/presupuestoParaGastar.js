// CONTRA QUÉ SE MIDE LO QUE SE GASTA: lo que de verdad se va a hacer.
//
// Lo definió Hernán, el 15/11/2026: «La ODC es informativa en la diferencia,
// para que sepa el cliente si va para más o para menos. El rubro del contrato
// y el negativo de la ODC se anulan, y debería quedar el valor total de las
// adiciones disponible para el control de obra». Y: «en control de obra ya
// queda anulado el rubro en negativo por la ODC y su rubro en sustracción».
//
// Una orden de cambio entra al control con sus renglones: lo que agrega, en
// positivo, y lo que quita, en un renglón NEGATIVO dentro de su agrupación.
// Así el capítulo de la orden suma su impacto en el contrato (+$3.849,92 en la
// OC-01), que es lo que se le cuenta al cliente. Pero para controlar el gasto
// eso mide mal en los dos lados:
//
//   · el rubro original —el piso de microcemento— seguía con sus $8.658,68 en
//     «Recubrimientos duros», como si todavía se fuera a hacer, y ahí se podía
//     cargar gasto;
//   · la agrupación de la orden quedaba con $3.849,92 de presupuesto para
//     $12.508,60 de obra nueva: hecha sin pasarse, salía al 325%.
//
// Y cómo se ve, en sus palabras: «los rubros eliminados o de menos cantidad,
// en el control de presupuesto, en la parte superior quedan tachados o con un
// renglón abajo que diga eliminado por ODC... eso inhabilita el rubro en el
// control. Abajo se ven las adiciones totales, y la sustracción resta el rubro
// de arriba. En el control solo se puede aplicar a las adiciones».
//
// Acá, SOLO PARA EL CONTROL DEL GASTO, el negativo y lo que quita se cancelan:
//
//   · el renglón negativo queda en $0 («se cancela con el rubro 41»);
//   · al rubro original se le resta lo que la orden quita. Si lo quita entero
//     queda ANULADO ($0, no recibe gasto); si quita una parte —el gypsum de la
//     OC-03— queda con lo que sigue haciéndose;
//   · la agrupación de la orden queda con sus adiciones enteras.
//
// El total de la obra no se mueve un centavo, y el contrato, las órdenes, el
// presupuesto actualizado y la liquidación siguen leyendo los rubros tal cual:
// el impacto de la orden se sigue viendo donde se conversa con el cliente.
//
// LA ARITMÉTICA ES LA COMPUERTA. Una orden se cancela solo si lo que sus
// renglones quitan, con el IVA de cada rubro, da lo mismo que su negativo. Si
// no cuadra, esa orden se deja como estaba y se devuelve en `descuadres`: es
// mejor un control que dice lo de siempre que uno que inventa una resta.
//
// Sin base de datos: recibe los rubros y las líneas «quita» de las órdenes.

const n = v => Number(v) || 0;
const r2 = v => Math.round(n(v) * 100) / 100;
// Hasta dónde puede diferir la resta de su negativo por redondeo del IVA.
const TOLERANCIA = 0.05;

export const codigoDeOrden = o => o?.codigo
  || (o?.numero != null ? `OC-${String(o.numero).padStart(2, "0")}` : "la orden de cambio");

/**
 * @param rubros   los de la obra, tal cual están en `obra_rubros`
 * @param ordenes  [{ id, codigo, numero }]
 * @param lineas   las líneas «quita» de esas órdenes: { orden_id, tipo,
 *                 obra_rubro_id, cantidad, precio_unitario }
 * @returns { rubros, descuadres }
 *   `rubros`: los mismos, con `total_base` cambiado en los que tocan las
 *   órdenes y estas marcas para poder decirlo en pantalla:
 *     _base_original  lo que tenía
 *     _cancela        { codigo, con: [números de rubro] } en el negativo
 *     _rebaja         [{ codigo, monto, cantidad }] en el original
 *     _cantidad_original  la cantidad que tenía, si la orden le quitó cantidad
 *     _anuladoPor     "OC-01" si el original quedó en cero
 *   `descuadres`: [{ codigo, negativo, resta }] de las órdenes que no se tocaron
 */
export function rubrosParaGastar(rubros = [], { ordenes = [], lineas = [] } = {}) {
  const lista = rubros || [];
  const negativos = new Map();
  lista.forEach(r => {
    if (r?.origen !== "orden_cambio" || !(n(r.total_base) < 0) || r.orden_cambio_id == null) return;
    const k = Number(r.orden_cambio_id);
    if (!negativos.has(k)) negativos.set(k, []);
    negativos.get(k).push(r);
  });
  if (!negativos.size) return { rubros: lista, descuadres: [] };

  const porId = new Map(lista.map(r => [Number(r.id), r]));
  const ordenDe = new Map((ordenes || []).map(o => [Number(o.id), o]));
  const cancela = new Map();   // id del negativo → { codigo, con }
  const rebajas = new Map();   // id del original → [{ codigo, monto }]
  const descuadres = [];

  for (const [ordenId, suyos] of negativos) {
    const codigo = codigoDeOrden(ordenDe.get(ordenId) || {});
    const quitas = (lineas || [])
      .filter(l => Number(l.orden_id) === ordenId && l.tipo === "quita" && l.obra_rubro_id != null && porId.has(Number(l.obra_rubro_id)))
      .map(l => {
        const original = porId.get(Number(l.obra_rubro_id));
        // La línea de la orden va sin IVA; el control lo lleva adentro.
        return { original, cantidad: n(l.cantidad), monto: r2(n(l.cantidad) * n(l.precio_unitario) * (1 + n(original.iva_pct) / 100)) };
      });
    const resta = r2(quitas.reduce((t, x) => t + x.monto, 0));
    const negativo = r2(-suyos.reduce((t, r) => t + n(r.total_base), 0));
    if (!quitas.length || Math.abs(resta - negativo) > TOLERANCIA) {
      descuadres.push({ codigo, negativo, resta });
      continue;
    }
    suyos.forEach(r => cancela.set(Number(r.id), { codigo, con: quitas.map(x => x.original.numero) }));
    quitas.forEach(({ original, monto, cantidad }) => {
      const id = Number(original.id);
      if (!rebajas.has(id)) rebajas.set(id, []);
      rebajas.get(id).push({ codigo, monto, cantidad });
    });
  }

  const salida = lista.map(r => {
    const id = Number(r?.id);
    if (cancela.has(id)) return { ...r, _base_original: n(r.total_base), total_base: 0, _cancela: cancela.get(id) };
    if (rebajas.has(id)) {
      const lo = rebajas.get(id);
      const queda = r2(n(r.total_base) - lo.reduce((t, x) => t + x.monto, 0));
      // La cantidad también: lo que queda por hacer, no lo que se firmó.
      const cantidad = r.cantidad == null ? r.cantidad
        : Math.round((n(r.cantidad) - lo.reduce((t, x) => t + x.cantidad, 0)) * 10000) / 10000;
      return {
        ...r, _base_original: n(r.total_base), total_base: queda, _rebaja: lo,
        _cantidad_original: r.cantidad, cantidad,
        ...(queda <= 0.005 ? { _anuladoPor: lo.map(x => x.codigo).join(", ") } : {}),
      };
    }
    return r;
  });
  return { rubros: salida, descuadres };
}

/** Cómo se dice, debajo del nombre del rubro, lo que le hicieron las órdenes. */
export function notaDeLaOrden(r) {
  const plata = v => `$${n(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const cant = v => n(v).toLocaleString("es-EC", { maximumFractionDigits: 2 });
  if (r?._cancela) return `Lo que ${r._cancela.codigo} elimina: resta del rubro ${r._cancela.con.join(", ")}, arriba`;
  if (r?._anuladoPor) return `Eliminado por ${r._anuladoPor} · era ${plata(r._base_original)}`;
  if (r?._rebaja?.length) {
    return r._rebaja.map(x => `${x.codigo} eliminó ${x.cantidad ? `${cant(x.cantidad)}${r.unidad ? ` ${r.unidad}` : ""} · ` : ""}−${plata(x.monto)}`).join(" · ")
      + ` · quedan ${plata(r.total_base)}`;
  }
  return "";
}
