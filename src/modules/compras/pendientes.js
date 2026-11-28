// LO QUE LE FALTA A UNA COMPRA YA HECHA: la factura, una devolución.
//
// Hernán, 28/11/2026, sobre la N° 6 (Camisas): «aún no me llega la factura...
// que llegue a Johanna o a residentes que lo resuelvan... que salga que tiene
// algo pendiente... o serviría si hay una devolución». Y: «resuelto a mano,
// pero que se haya leído y registrado con NOVA».
//
// Lo que había en la base ese día: la N° 6 estaba «Recibida» y con factura en
// el control —$184,92, la de Johanna del 13/10—, pero esa factura no tenía
// número ni papel. Era el pago de la proforma cargado como factura. Para
// FOREMAN la compra estaba cerrada.
//
// Las reglas, sin base ni pantalla, para poder probarlas
// (pruebas/pendientesDeCompra.test.mjs).

export const TIPOS_PENDIENTE = {
  factura:    { label: "Falta la factura", corto: "factura", ayuda: "Llega con el papel: NOVA lo lee y queda registrada en el control." },
  devolucion: { label: "Devolución",       corto: "devolución", ayuda: "Se cierra con el papel de la devolución —nota de crédito, comprobante— leído por NOVA." },
  otro:       { label: "Otro",             corto: "pendiente", ayuda: "Se cierra a mano, diciendo cómo se resolvió." },
};

const texto = v => String(v ?? "").trim();
const dinero = v => Math.round((Number(v) || 0) * 100);

/** Los que siguen abiertos, del más viejo al más nuevo. */
export const abiertos = pendientes => (pendientes || []).filter(p => !p.resuelto_at)
  .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

/**
 * Lo que FOREMAN ve solo, sin que nadie lo escriba: una compra hecha cuyo
 * documento en el control no es una factura con papel y número.
 *
 * - Comprada o recibida, de una obra, y sin documento en el control.
 * - El documento está, pero sin papel.
 * - Es factura o nota de venta y no tiene número (un recibo puede no tenerlo).
 *
 * Un anticipo no se marca: la factura final de esa compra entra después y por
 * el control, y decir «falta» ahí sería decirlo de todas las que van por partes.
 *
 * @returns null o el motivo, en una línea
 */
export function faltaElPapel(solicitud, factura) {
  if (!solicitud?.lead_id) return null;
  if (!["comprada", "recibida"].includes(solicitud.estado)) return null;
  if (!solicitud.factura_id) return "Sin factura en el control";
  if (!factura) return null; // no se sabe: no se inventa
  if (factura.clase === "anticipo" || factura.clase === "proforma") return null;
  if (!texto(factura.archivo_url)) return "La factura del control no tiene papel";
  if (["factura", "nota_venta"].includes(factura.clase || "factura") && !texto(factura.numero_factura)) return "La factura del control no tiene número";
  return null;
}

/**
 * Si el pendiente se puede dar por resuelto, y si no, por qué.
 *
 * La misma regla está en la base (migración 200): la pantalla la dice antes
 * para no mostrar un botón que después falla.
 */
export function puedeResolver(p, factura = null) {
  if (!p || p.resuelto_at) return { ok: false, porque: "Ya está resuelto." };
  if (p.tipo === "otro") return { ok: true };
  // La factura también se puede haber leído en el control de obra («Leer con
  // NOVA» en la factura): con papel, número y leída por NOVA, vale igual.
  if (p.tipo === "factura" && !p.doc_leido_at && leidaEnElControl(factura)) return { ok: true, desdeElControl: true };
  if (!p.doc_leido_at) {
    return { ok: false, porque: p.tipo === "factura"
      ? "Falta subir la factura para que NOVA la lea y quede registrada."
      : "Falta subir el papel de la devolución para que NOVA lo lea." };
  }
  if (p.tipo === "factura") {
    if (!p.factura_id) return { ok: false, porque: "La factura se leyó, pero no quedó registrada en el control." };
    const dif = diferenciaDeTotal(p, factura);
    if (dif) return { ok: false, porque: dif };
  }
  return { ok: true };
}

/** La factura del control que ya tiene papel y número, leída por NOVA allá. */
export const leidaEnElControl = f => !!f && f.origen === "nova" && !!texto(f.archivo_url) && !!texto(f.numero_factura);

/**
 * Si el papel que NOVA leyó y la factura del control dicen montos distintos.
 * El control no se corrige solo: el monto de esa factura ya está repartido en
 * rubros y pagado.
 */
export function diferenciaDeTotal(p, factura) {
  const leido = p?.doc_leido?.monto;
  if (leido == null || !factura || factura.total == null) return null;
  if (Math.abs(dinero(leido) - dinero(factura.total)) <= 1) return null;
  return `El papel dice $${Number(leido).toFixed(2)} y en el control está $${Number(factura.total).toFixed(2)}. Corregí el total de esa factura en el control de obra y volvé a subirla.`;
}

/**
 * Qué se hace con la factura que NOVA acaba de leer para un pendiente.
 *
 * - `nueva`: la compra no tiene documento en el control; entra como cualquier
 *   factura de compra.
 * - `completar`: la compra tiene uno sin papel o sin número —la N° 6—; se le
 *   pone el papel, el número y el RUC, y queda como leída por NOVA. El total y
 *   sus rubros no se tocan.
 * - `misma`: ya tiene esa factura, con papel; solo queda dicho que se leyó.
 *
 * @returns { accion } o { error }
 */
export function queHacerConLaFactura(leido, factura) {
  if (!leido) return { error: "NOVA no pudo leer el papel." };
  if (leido.clase === "proforma") return { error: "Eso es una proforma o cotización, no la factura." };
  if (!(Number(leido.monto) > 0)) return { error: "NOVA no leyó el total del papel. Probá con una foto más clara o el PDF." };
  if (!factura) return { accion: "nueva" };
  if (factura.clase === "anticipo") {
    return { error: "Esta compra entró al control como anticipo. La factura final se carga en el control de obra y se engancha desde Alertas." };
  }
  const numLeido = texto(leido.numero).replace(/\D/g, "");
  const numControl = texto(factura.numero_factura).replace(/\D/g, "");
  if (texto(factura.archivo_url) && numControl) {
    if (numLeido && numLeido === numControl) return { accion: "misma" };
    return { error: `Esta compra ya tiene la factura ${factura.numero_factura} con su papel en el control. Si esta es otra, cargala en el control de obra.` };
  }
  if (Math.abs(dinero(leido.monto) - dinero(factura.total)) > 1) {
    return { error: `El papel dice $${Number(leido.monto).toFixed(2)} y en el control está $${Number(factura.total).toFixed(2)}. Corregí el total de esa factura en el control de obra y volvé a subirla.` };
  }
  return { accion: "completar" };
}

/** Lo que se guarda de la lectura: sin los renglones, que no hacen falta acá. */
export function loLeido(leido) {
  const { items, error, ...resto } = leido || {};
  return resto;
}

/** La línea del historial al dejarlo, y al resolverlo. */
export const lineaAlDejar = p => `Pendiente · ${TIPOS_PENDIENTE[p.tipo]?.label || "Pendiente"}${p.para_nombre ? ` · para ${p.para_nombre}` : ""}: ${texto(p.texto)}`;
export const lineaAlResolver = (p, nota) => `Resuelto · ${TIPOS_PENDIENTE[p.tipo]?.label || "Pendiente"}${texto(nota) ? `: ${texto(nota)}` : ""}`;

/**
 * Quién puede resolverlo: el que pidió la compra y los residentes del
 * proyecto, primero; después el resto del equipo activo. Sin repetir.
 */
export function aQuienSeLePuede(usuarios, { solicitud, residentesIds = [] }) {
  const activos = (usuarios || []).filter(u => u && u.activo !== false);
  const primero = new Set([solicitud?.solicitante_id, ...residentesIds].filter(v => v != null).map(Number));
  const arriba = activos.filter(u => primero.has(Number(u.id)));
  const abajo = activos.filter(u => !primero.has(Number(u.id)));
  const porNombre = (a, b) => String(a.name || a.nombre || "").localeCompare(String(b.name || b.nombre || ""), "es");
  return [...arriba.sort((a, b) => (Number(a.id) === Number(solicitud?.solicitante_id) ? -1 : Number(b.id) === Number(solicitud?.solicitante_id) ? 1 : porNombre(a, b))), ...abajo.sort(porNombre)];
}
