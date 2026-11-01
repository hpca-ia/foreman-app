// QUE FOREMAN REVISE SI EL CONTROL DICE LO MISMO QUE LA ORDEN.
//
// Una orden aprobada mete sus rubros al control, y a partir de ahí son dos
// lugares que pueden decir cosas distintas: alguien borra un rubro, una
// aprobación falla a la mitad y entran tres de cinco líneas, una orden vieja
// quedó sin su rubro de honorarios, una línea se mandó a otro capítulo. Nada de
// eso avisa. Lo único que se ve es un capítulo que suma raro, y para descubrirlo
// hay que sentarse a sumar a mano los rubros de una orden contra su papel.
//
// Buscar errores a mano no es el trabajo de nadie: es el trabajo de esto.
//
// POR QUÉ UN CAPÍTULO NO ES UNA ORDEN. Las líneas de una orden pueden caer en
// capítulos distintos —el desalojo va a PRELIMINARES, los honorarios a
// HONORARIOS, el resto a ADICIONALES · OC-01— y entonces el capítulo que lleva
// el nombre de la orden no suma lo que la orden vale. Leerlo como si lo fuera
// es el error que esto evita: la OC-01 del Aéreo pone $4.234,94 en el control,
// repartidos en tres capítulos, y su capítulo homónimo dice $3.562,44.
//
// LOS CENTAVOS NO SON UN ERROR. El control guarda cada rubro con IVA y
// redondeado al centavo, así que diez líneas pueden separarse unos centavos del
// total calculado de una vez. Eso se tolera; lo que no se tolera es un rubro
// que falta.

import { honorariosDe, pctQueCorresponde } from "./honorariosDeOrden.js";

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

/** ¿Esta orden tendría que estar en el control? */
export const cuenta = o => o?.estado === "aprobada" && !o?.anulada;

/**
 * Lo que una orden puso en el control, contra lo que su papel dice.
 *
 * @param orden   la orden de cambio
 * @param lineas  sus partidas
 * @param rubros  los rubros del control de esa orden (orden_cambio_id)
 * @param obra    para el porcentaje de honorarios y el IVA
 */
export function cuadreDeUnaOrden({ orden, lineas = [], rubros = [], obra, iva = 0 } = {}) {
  const pct = pctQueCorresponde(orden, obra);
  const cuenta = honorariosDe({ lineas, pct });
  const factor = 1 + n(iva) / 100;

  // Lo que debería haber en el control: el neto y el honorario, los dos en la
  // base del control, que lleva el IVA adentro.
  const esperadoTrabajo = c2(cuenta.neto * factor);
  const esperadoHonorarios = c2(cuenta.honorarios * factor);
  const esperado = c2(esperadoTrabajo + esperadoHonorarios);

  const esHonorario = r => /honorario/i.test(r?.capitulo || "") || /honorario/i.test(r?.descripcion || "");
  const enHonorarios = c2(rubros.filter(esHonorario).reduce((t, r) => t + n(r.total_base), 0));
  const enTrabajo = c2(rubros.filter(r => !esHonorario(r)).reduce((t, r) => t + n(r.total_base), 0));
  const enControl = c2(enTrabajo + enHonorarios);

  // Un centavo por línea, que es lo que puede moverse al redondear cada rubro.
  const tolerancia = Math.max(0.05, (lineas.length + 1) * 0.01);
  const diferencia = c2(enControl - esperado);

  const capitulos = [];
  for (const r of rubros) {
    const cap = r.capitulo || "SIN CAPÍTULO";
    const ya = capitulos.find(x => x.capitulo === cap);
    if (ya) ya.total = c2(ya.total + n(r.total_base));
    else capitulos.push({ capitulo: cap, total: c2(r.total_base) });
  }

  // QUÉ LE PASA, dicho en el idioma del que lo va a arreglar.
  let problema = null;
  if (!rubros.length) problema = "está aprobada y no puso un solo rubro en el control";
  else if (cuenta.hay && !enHonorarios) {
    problema = `le falta el rubro de honorarios: ${cuenta.pct}% sobre el neto, $${esperadoHonorarios.toFixed(2)} con IVA`;
  } else if (Math.abs(diferencia) > tolerancia) {
    const faltanLineas = lineas.filter(l => l.tipo !== "quita").length + lineas.filter(l => l.tipo === "quita").length
      - rubros.filter(r => !esHonorario(r)).length;
    problema = diferencia < 0
      ? `al control le faltan $${Math.abs(diferencia).toFixed(2)} de esta orden`
        + (faltanLineas > 0 ? ` · hay ${faltanLineas} ${faltanLineas === 1 ? "partida" : "partidas"} sin su rubro` : "")
      : `el control tiene $${diferencia.toFixed(2)} de más por esta orden`;
  }

  return {
    id: orden?.id, codigo: orden?.codigo,
    esperado, esperadoTrabajo, esperadoHonorarios,
    enControl, enTrabajo, enHonorarios,
    diferencia, cuadra: !problema, problema,
    capitulos: capitulos.sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
    pct: cuenta.pct,
  };
}

/**
 * El cuadre de todas las órdenes aprobadas de una obra.
 *
 * @param rubrosDeOrdenes  los rubros del control que tienen orden_cambio_id
 */
export function cuadreDeOrdenes({ ordenes = [], lineasPorOrden = {}, rubrosDeOrdenes = [], obra, iva = 0 } = {}) {
  const porOrden = {};
  for (const r of rubrosDeOrdenes) {
    const id = Number(r.orden_cambio_id);
    if (!id) continue;
    (porOrden[id] = porOrden[id] || []).push(r);
  }
  const filas = ordenes.filter(cuenta).map(o => cuadreDeUnaOrden({
    orden: o, lineas: lineasPorOrden[o.id] || [], rubros: porOrden[o.id] || [], obra, iva,
  }));
  const mal = filas.filter(f => !f.cuadra);
  return {
    filas,
    mal,
    // La plata en juego: lo que el control se está comiendo o inventando.
    enJuego: c2(mal.reduce((t, f) => t + Math.abs(f.diferencia || f.esperado), 0)),
    todoCuadra: filas.length > 0 && mal.length === 0,
  };
}

/** El aviso, en una línea, para la cabecera del panel. */
export function comoSeDice(cuadre) {
  if (!cuadre?.mal?.length) return null;
  const cuantas = cuadre.mal.length;
  return `${cuantas} ${cuantas === 1 ? "orden aprobada no cuadra" : "órdenes aprobadas no cuadran"} `
    + `con el control · $${cuadre.enJuego.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} en juego`;
}
