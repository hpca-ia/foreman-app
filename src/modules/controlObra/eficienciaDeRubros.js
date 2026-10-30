// LO QUE DEJA CADA RUBRO, CALCULADO SOLO.
//
// Beneficios era una tabla que alguien tenía que llenar a mano, y por eso
// estaba vacía: nadie carga ciento setenta filas para enterarse de algo que la
// obra ya sabe. Los dos números están desde el primer día —lo que el rubro
// tenía presupuestado de COSTO y lo que de verdad se gastó en él, factura por
// factura— y la diferencia es el beneficio. No hace falta que nadie la escriba.
//
// NO ES EL MARGEN DEL RUBRO, ES LA EFICIENCIA.
//
// El margen es el precio al cliente menos el costo, y se decidió el día que se
// firmó el contrato: ganarlo no es un mérito de la obra. La eficiencia es haber
// comprado por debajo del costo que se presupuestó, y eso sí pasó en la obra.
// Mezclarlos deja una obra que compra mal pareciendo sana porque el margen
// vendido era bueno.
//
// LA CANTIDAD ES LA VIGENTE, NO LA ORIGINAL.
//
// La base se mide sobre los rubros vivos del control: cuando una orden de
// cambio regulariza una cantidad, el rubro que queda ya trae la cantidad nueva
// y el tachado deja de contar. Entonces esto se acomoda solo —aprobar la orden
// alcanza— sin que haya que rehacer ningún análisis a mano.
//
// Y LO QUE NO SE SABE SE DICE. Un rubro sin costo cargado no tiene eficiencia
// cero: tiene eficiencia desconocida, y son dos respuestas muy distintas para
// quien está decidiendo si puede gastar más.

import { baseSinIva } from "./contratoDeLaObra.js";

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

/** Los rubros que cuentan: ni tachados por una orden de cambio ni ocultos. */
export const vivo = r => r && !r.anulado_por_oc && !r.oculto;

/**
 * De sin IVA a la base del control, que es donde vive el gasto.
 *
 * El control trabaja con el IVA adentro porque es lo que se le factura al
 * cliente y lo que dicen las facturas de los proveedores; el costo del
 * presupuesto viene sin IVA. El factor sale del propio rubro, para no suponer
 * un 15% que puede no ser el suyo.
 */
export function factorIva(r) {
  const base = baseSinIva(r);
  return base > 0 ? n(r?.total_base) / base : 1;
}

/** ¿Tiene costo cargado? Cero no es un costo: es no saber. */
export const conCosto = r => n(r?.costo_unitario) > 0;

/**
 * Qué dejó cada rubro, y con cuánta certeza.
 *
 * El estado de cada uno es la parte que importa:
 *
 *   · SOBREPRECIO. Ya se gastó más de lo que el rubro tenía de costo. Eso no es
 *     una previsión: pasó, y no se arregla comprando el resto más barato.
 *   · AHORRO. Se gastó menos y el rubro está terminado: la plata quedó.
 *   · EN CURSO. Se gastó menos pero el rubro no está cerrado, así que lo que
 *     parece ahorro puede ser nada más lo que todavía falta comprar. Contarlo
 *     es lo que hace que una obra parezca rentable hasta el último mes.
 *   · SIN EMPEZAR. No se le asignó ni un gasto todavía.
 *
 * @param rubros    los de la obra, como vienen del control
 * @param porRubro  lo que calculó calcularControl: `acumulado` es lo invertido
 * @param cerrado   cómo se decide que un rubro está terminado (avance al 100%)
 */
export function eficienciaDeRubros({ rubros = [], porRubro = {} } = {}) {
  const filas = [];
  let sinCosto = 0, sinCostoConGasto = 0;

  for (const r of rubros.filter(vivo)) {
    const gastado = c2(porRubro[r.id]?.acumulado);
    // EL RUBRO SIN COSTO TAMBIÉN DEJA PLATA, y hay que contarla.
    //
    // Que no se sepa lo que iba a costar no borra lo que dejó: el rubro se
    // vendió en tanto y se gastó tanto, y esa resta es plata del proyecto.
    // Dejarlo afuera por no tener costo cargado era dejar casi toda la obra
    // afuera —en Diners, 169 rubros de 170— y mostrar un panel vacío de una
    // obra que estaba dejando plata.
    //
    // Lo que no se puede hacer sin el costo es SEPARAR lo que ya estaba vendido
    // de lo que se ganó comprando mejor. Eso se dice; no se calla el total.
    const aFavor = c2(n(r.total_base) - gastado);
    const terminadoSinCosto = n(r.avance_pct) >= 100;
    if (!conCosto(r)) {
      sinCosto += 1;
      if (gastado > 0) sinCostoConGasto += 1;
      filas.push({
        id: r.id,
        numero: String(r.numero ?? r.codigo ?? ""),
        descripcion: r.descripcion || "",
        unidad: r.unidad || "", cantidad: n(r.cantidad),
        costoUnitario: null, presupuestado: null, dif: null,
        gastado, aFavor, contratado: c2(r.total_base),
        avance: n(r.avance_pct),
        estado: !gastado ? "sin_empezar" : aFavor < 0 ? "sobreprecio"
          : terminadoSinCosto ? "ahorro" : "en_curso",
        // Sin costo cargado no se puede decir cuánto de lo que dejó fue
        // comprar bien: todo lo que se ve es el margen con el que se vendió.
        sinCosto: true,
      });
      continue;
    }
    // EN LA MISMA BASE QUE EL GASTO, QUE ES LA DEL CONTROL.
    //
    // Lo asignado a un rubro sale de las facturas y lleva el IVA adentro —una
    // factura de $183,97 son $159,97 más $24—, y el costo del presupuesto está
    // sin IVA. Restarlos de frente se lleva quince puntos: inventa sobreprecio
    // donde no lo hay y se come los ahorros chicos. El rubro ya sabe su factor,
    // que es el mismo con el que se armó su total del control.
    const presupuestado = c2(n(r.costo_unitario) * n(r.cantidad) * factorIva(r));
    const dif = c2(presupuestado - gastado);
    const terminado = n(r.avance_pct) >= 100;
    let estado;
    if (dif < 0) estado = "sobreprecio";
    else if (!gastado) estado = "sin_empezar";
    else if (terminado) estado = "ahorro";
    else estado = "en_curso";
    filas.push({
      id: r.id,
      numero: String(r.numero ?? r.codigo ?? ""),
      descripcion: r.descripcion || "",
      unidad: r.unidad || "",
      cantidad: n(r.cantidad),
      costoUnitario: n(r.costo_unitario),
      presupuestado, gastado, dif, estado,
      avance: n(r.avance_pct),
      // LO QUE DEJA EL RUBRO, QUE ES LO QUE SE COBRA MENOS LO QUE SE GASTÓ.
      //
      // Es la cuenta de la casa: el rubro se vendió en esto y costó aquello.
      // Adentro hay dos cosas —el margen con el que se vendió y lo que se ganó
      // o se perdió comprando— y abajo se separan, porque son dos
      // conversaciones. Pero la plata a favor del proyecto es esta.
      aFavor: c2(n(r.total_base) - gastado),
      // El margen vendido, aparte: sirve para saber si el rubro era bueno de
      // entrada, y no se suma nunca con la eficiencia.
      contratado: c2(r.total_base),
    });
  }

  const conDato = filas.filter(f => !f.sinCosto);
  const suma = (p, f) => filas.filter(f).filter(x => x[p] != null)
    .reduce((t, x) => t + Math.abs(x[p]), 0);
  // EL MARGEN VENDIDO NO ES UN BENEFICIO DE LA OBRA: se decidió el día que se
  // firmó el contrato. Va aparte porque es la vara con la que se lee todo lo
  // demás —una eficiencia de $2.000 sobre un margen vendido de $80.000 es
  // ruido, y sobre uno de $6.000 es la diferencia entre ganar y no— pero
  // sumarlo con lo que la obra ahorró deja a una obra que compra mal pareciendo
  // sana porque vendió bien.
  const vendido = c2(conDato.reduce((t, x) => t + x.contratado, 0));
  const costoVendido = c2(conDato.reduce((t, x) => t + x.presupuestado, 0));

  // ── LO QUE DEJA LA OBRA, QUE ES LA PREGUNTA DE LA CASA ───────────────────
  //
  // Lo que se cobra menos lo que se gastó, rubro por rubro. Adentro de ese
  // número hay dos cosas —el margen con el que se vendió y lo que se ganó o se
  // perdió comprando— y se separan abajo, pero la plata a favor del proyecto es
  // esta y es la que se mira primero. Un rubro terminado ya la dejó; uno a
  // medio ejecutar todavía puede gastar más.
  const favorable = f => f.estado === "ahorro";
  const aFavorHecho = c2(filas.filter(favorable).reduce((t, x) => t + x.aFavor, 0));
  const aFavorEnCurso = c2(filas.filter(f => f.estado === "en_curso").reduce((t, x) => t + x.aFavor, 0));
  const enContra = c2(filas.filter(f => f.estado === "sobreprecio").reduce((t, x) => t + x.aFavor, 0));

  return {
    vendido, costoVendido, margenVendido: c2(vendido - costoVendido),
    // Lo que deja la obra: terminado, en curso, y lo que ya se pasó.
    aFavorHecho, aFavorEnCurso, enContra,
    aFavorNeto: c2(aFavorHecho + enContra),
    filas: filas.sort((a, b) => Math.abs(b.aFavor) - Math.abs(a.aFavor)),
    ahorro: c2(suma("dif", f => !f.sinCosto && f.estado === "ahorro")),
    sobreprecio: c2(suma("dif", f => !f.sinCosto && f.estado === "sobreprecio")),
    enCurso: c2(suma("dif", f => !f.sinCosto && f.estado === "en_curso")),
    cuantos: conDato.length,
    cuantosRubros: filas.length,
    cuantosAhorro: conDato.filter(f => f.estado === "ahorro").length,
    cuantosSobreprecio: conDato.filter(f => f.estado === "sobreprecio").length,
    cuantosEnCurso: conDato.filter(f => f.estado === "en_curso").length,
    sinCosto, sinCostoConGasto,
    // El neto de lo que ya pasó: el ahorro confirmado contra el sobreprecio.
    // Lo que está en curso no entra, porque todavía puede ser cualquier cosa.
    neto: c2(suma("dif", f => !f.sinCosto && f.estado === "ahorro")
      - suma("dif", f => !f.sinCosto && f.estado === "sobreprecio")),
    // ¿Se le puede creer a este panel? No si la mitad de la obra no tiene costo.
    completo: sinCosto === 0 && filas.length > 0,
    // Cuánto de lo que dejó la obra se puede explicar: con costo cargado se
    // sabe qué parte fue comprar mejor, sin él todo se lee como margen vendido.
    explicado: c2(conDato.reduce((t, x) => t + x.aFavor, 0)),
  };
}

/**
 * POR QUÉ ESTE PANEL NO ENCUENTRA NADA, cuando no encuentra nada.
 *
 * "No hay eficiencias" y "no tengo con qué buscarlas" se ven igual en una
 * pantalla vacía, y son lo contrario: la primera es una obra que compró justo,
 * la segunda es un dato que falta. Decir la primera cuando pasa la segunda es
 * la peor respuesta posible, porque nadie vuelve a preguntar.
 */
export function porQueNoSabe(cuenta) {
  if (!cuenta?.sinCosto) return null;
  if (!cuenta.cuantos) {
    return "Ninguno de los rubros tiene costo cargado, así que todo lo que deja la obra se lee como el margen "
      + "con el que se vendió: no se puede saber qué parte se ganó comprando mejor. "
      + (cuenta.sinCostoConGasto
        ? `Hay ${cuenta.sinCostoConGasto} rubros con gasto asignado esperando ese dato.`
        : "");
  }
  return `${cuenta.sinCosto} de los ${cuenta.cuantosRubros} rubros no tienen costo cargado: de esos no se puede `
    + "separar lo que ya estaba vendido de lo que se ganó comprando. El desglose de abajo es el de los otros "
    + `${cuenta.cuantos}.`;
}

/** El titular, para no armarlo en cada pantalla. */
export function comoSeDice(cuenta) {
  if (!cuenta?.cuantos) return null;
  const partes = [];
  if (cuenta.cuantosAhorro) partes.push(`$${cuenta.ahorro.toFixed(2)} ahorrados en ${cuenta.cuantosAhorro} rubros terminados`);
  if (cuenta.cuantosSobreprecio) partes.push(`$${cuenta.sobreprecio.toFixed(2)} de sobreprecio en ${cuenta.cuantosSobreprecio}`);
  if (cuenta.cuantosEnCurso) partes.push(`$${cuenta.enCurso.toFixed(2)} que parecen a favor en ${cuenta.cuantosEnCurso} rubros sin terminar`);
  return partes.join(" · ") || null;
}
