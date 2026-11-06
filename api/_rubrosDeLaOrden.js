// LO QUE UNA ORDEN APROBADA METE AL CONTROL, del lado del servidor.
//
// Es la misma cuenta que src/modules/controlObra/rubrosDeLaOrden.js y
// honorariosDeOrden.js, que es la que usa la oficina cuando aprueba desde
// adentro. Vive repetida porque lo que corre en Vercel no puede importar de
// src/, y hay una prueba —pruebas/rubrosDeLaOrden.test.mjs— que compara las
// dos fila por fila.
//
// Sin esa prueba ya se separaron una vez: la orden que el cliente firmaba por
// su enlace entraba al control sin el rubro de honorarios, y la misma orden
// aprobada por la oficina entraba con él. Un 10% de diferencia en el contrato
// vigente según por qué puerta se aprobó.

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

/**
 * El número de la orden a la que pertenece: el de su código, tenga o no una
 * letra de modificación detrás. Una OC-04-B es de la 4. La misma regla que
 * numeracionDeOrdenes.js en la oficina.
 */
export function numeroPrincipal(orden) {
  const m = /^OC-(\d+)/i.exec(String(orden?.codigo || ""));
  return m ? Number(m[1]) : Number(orden?.numero) || 0;
}

/**
 * QUE LAS FILAS SUMEN LO QUE DICE EL DOCUMENTO, AL CENTAVO.
 *
 * La orden calcula su IVA una vez, sobre el neto más el honorario, y ese total
 * es el que el cliente firma. El control guarda cada partida con su IVA y
 * redondeada: la suma de los redondeos no es el redondeo de la suma, y la
 * misma orden terminaba valiendo un centavo más o menos en el control que en
 * su papel. Es el mismo problema que tenía la obra contra su presupuesto, y se
 * arregla igual: los centavos que sobran o faltan van a la partida más grande,
 * que es donde menos pesan.
 *
 * El rubro de honorarios no se toca mientras haya una partida con monto: es
 * un número que se cita solo —"el 10 % de la OC-03"— y tiene que seguir siendo
 * el honorario con su IVA.
 *
 * Más de un centavo por fila no es redondeo: es otra cosa, y repartirlo sería
 * esconderla. En ese caso no se toca nada y lo dice el cuadre de órdenes.
 *
 * @param filas            las del control, ya armadas; se corrige una, en el lugar
 * @param total            el total con IVA del documento de la orden
 * @param cuantasPartidas  cuántas de las filas son partidas (el honorario va después)
 * @returns el ajuste que se hizo, en dólares; 0 si no hizo falta
 */
export function cuadrarConElDocumento(filas = [], total = 0, cuantasPartidas = filas.length) {
  const monto = f => Number(f?.total_base) || 0;
  const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const ajuste = c2(c2(total) - filas.reduce((t, f) => t + monto(f), 0));
  if (!ajuste || Math.abs(ajuste) > (filas.length + 2) * 0.01) return 0;
  let donde = -1;
  filas.forEach((f, i) => {
    if (i >= cuantasPartidas || !monto(f)) return;
    if (donde < 0 || Math.abs(monto(f)) > Math.abs(monto(filas[donde]))) donde = i;
  });
  if (donde < 0) donde = filas.findIndex(f => monto(f));
  if (donde < 0) return 0;
  filas[donde].total_base = c2(monto(filas[donde]) + ajuste);
  return ajuste;
}

/** OC-01, y a veces OC-08A: el código con que se la cita. */
export const codigoDe = orden => orden?.codigo || `OC-${String(orden?.numero ?? 0).padStart(2, "0")}`;

/**
 * El porcentaje que le toca a esta orden: el suyo si se negoció distinto, y si
 * no el del contrato de la obra. Un 0 puesto a propósito es una decisión —esta
 * no lleva—, no un campo vacío.
 */
export function pctQueCorresponde(orden, obra) {
  const suyo = n(orden?.honorarios_pct);
  if (suyo > 0) return suyo;
  if (orden?.honorarios_pct === 0) return 0;
  return n(obra?.honorarios_pct);
}

/** El neto de la orden: lo que agrega menos lo que quita. */
export function netoDeLaOrden(lineas = []) {
  let adiciones = 0, reducciones = 0;
  for (const l of lineas) {
    const monto = n(l.cantidad) * n(l.precio_unitario);
    if (l.tipo === "quita") reducciones += monto; else adiciones += monto;
  }
  return { adiciones: c2(adiciones), reducciones: c2(reducciones), neto: c2(adiciones - reducciones) };
}

/**
 * La cuenta del pie de la orden: neto, honorarios, y el IVA sobre los dos.
 * Los honorarios de una orden negativa son negativos: se administra menos.
 */
export function honorariosDe({ lineas = [], pct = 0, iva = 0 } = {}) {
  const { adiciones, reducciones, neto } = netoDeLaOrden(lineas);
  const p = n(pct);
  const honorarios = p > 0 ? c2(neto * p / 100) : 0;
  const base = c2(neto + honorarios);
  const impuesto = n(iva) > 0 ? c2(base * n(iva) / 100) : 0;
  return {
    adiciones, reducciones, neto,
    pct: p, honorarios,
    subtotal: base,
    iva: impuesto,
    total: c2(base + impuesto),
    devuelve: honorarios < 0,
    hay: p > 0 && honorarios !== 0,
  };
}

/** La línea de honorarios, como rubro del control. Null si la orden no lleva. */
export function rubroDeHonorarios(orden, cuenta, { capitulo = "HONORARIOS", conIva = v => v, iva = 0 } = {}) {
  if (!cuenta?.hay) return null;
  const codigo = orden?.codigo || `OC-${String(orden?.numero ?? "").padStart(2, "0")}`;
  return {
    obra_id: orden.obra_id,
    numero: 9000 + numeroPrincipal(orden) * 100 + 99,
    capitulo,
    capitulo_orden: 9000 + numeroPrincipal(orden),
    orden: 9000000 + numeroPrincipal(orden) * 1000 + 999,
    descripcion: `Honorarios ${cuenta.pct}% sobre ${cuenta.devuelve ? "la reducción de " : ""}${codigo}`,
    unidad: "glb",
    cantidad: 1,
    precio_unitario: conIva(cuenta.honorarios),
    total_base: conIva(cuenta.honorarios),
    iva_pct: iva,
    origen: "orden_cambio",
    orden_cambio_id: orden.id,
  };
}

/**
 * Las filas de `obra_rubros` que deja una orden al aprobarse: una por partida
 * y, al final, la de su honorario si lo lleva.
 *
 * Todas las partidas van al capítulo de la orden —ADICIONALES · OC-01—, las que
 * suman y las que restan, aunque el rubro ya exista en el presupuesto: que ya
 * existía se menciona en la descripción, pero no cambia dónde vive. El
 * honorario va aparte, al capítulo de honorarios que la obra ya tiene.
 *
 * TODAS LAS FILAS LLEVAN LAS MISMAS COLUMNAS. Acá se insertan de una sola vez
 * por REST, y un lote con filas de distinta forma se rechaza entero.
 *
 * @param iva     el IVA del control de esa obra (15 = 15%)
 * @param obra    para el porcentaje de honorarios del contrato
 * @param capHon  { capitulo, capitulo_orden } del capítulo de honorarios que la
 *                obra ya tiene, o null si no tiene ninguno
 */
export function rubrosDeLaOrden({ orden, lineas = [], iva = 0, obra = null, capHon = null } = {}) {
  const suyas = lineas || [];
  const conIva = v => Math.round(v * (1 + iva / 100) * 100) / 100;
  const suNumero = numeroPrincipal(orden);

  const filas = suyas.map((l, i) => {
    const signo = l.tipo === "quita" ? -1 : 1;
    const yaExistia = [l.rubro_codigo && `rubro ${l.rubro_codigo}`, l.capitulo]
      .filter(Boolean).join(" · ");
    return {
      obra_id: orden.obra_id,
      numero: 9000 + suNumero * 100 + i,
      capitulo: `ADICIONALES · ${codigoDe(orden)}`,
      capitulo_orden: 9000 + suNumero,
      orden: 9000000 + suNumero * 1000 + i,
      descripcion: `${l.tipo === "quita" ? "(–) " : ""}${l.descripcion}  ·  ${codigoDe(orden)}`
        + (yaExistia ? `  ·  ya existía: ${yaExistia}` : ""),
      unidad: l.unidad || "",
      cantidad: Number(l.cantidad) || 0,
      precio_unitario: signo * conIva(Number(l.precio_unitario) || 0),
      total_base: signo * conIva((Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0)),
      iva_pct: iva,
      origen: "orden_cambio",
      orden_cambio_id: orden.id,
    };
  });

  const cuenta = honorariosDe({ lineas: suyas, pct: pctQueCorresponde(orden, obra), iva });
  const honorario = rubroDeHonorarios(orden, cuenta, {
    conIva, iva,
    capitulo: capHon?.capitulo || "HONORARIOS",
  });
  if (honorario && capHon) honorario.capitulo_orden = capHon.capitulo_orden;
  if (honorario) filas.push(honorario);

  // Y lo que entra al control es lo que dice el documento: su total con IVA.
  cuadrarConElDocumento(filas, cuenta.total, suyas.length);

  return filas;
}
