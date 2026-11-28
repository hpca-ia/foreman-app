// LA TR: EL CÓDIGO DE CADA GASTO, DE PUNTA A PUNTA (migración 202).
//
// Hernán, 28/11/2026: «a veces no sabes de qué factura está hablando un
// error... o en la planilla de dónde viene cierto gasto... o una factura en qué
// planilla está». Y cómo lo definió:
//
//   PR   el proyecto.
//   TR   la transacción: nace con la orden de compra o con el gasto de caja
//        chica, y la factura que resulta apunta a la misma.
//   ODC  la orden de compra —no la orden de cambio, que es OC-01 y es otra
//        cosa—.
//   CC   la caja chica.
//   ROL  el rol de mano de obra.
//   PL   la planilla donde termina todo.
//
// Acá no se consulta nada: se arma el código con lo que cada pantalla ya
// tiene, y se entiende lo que alguien escribe en un buscador.

const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

export const codigoPR = leadId => (num(leadId) ? `PR${num(leadId)}` : "");
export const codigoODC = id => (num(id) ? `ODC${num(id)}` : "");
export const codigoCC = id => (num(id) ? `CC${num(id)}` : "");
export const codigoPL = numero => (num(numero) ? `PL${num(numero)}` : "");

/** «PR15-TR52». Sin proyecto —una caja de la oficina—, «TR300» a secas. */
export function codigoTR(tr, leadId = null) {
  if (!num(tr)) return "";
  const pr = codigoPR(leadId);
  return pr ? `${pr}-TR${num(tr)}` : `TR${num(tr)}`;
}

/** Por dónde entró: la puerta. */
export const PUERTAS = {
  odc: "por orden de compra",
  cc: "por caja chica",
  rol: "por el rol de mano de obra",
  control: "cargada directo en el control",
};

/**
 * La puerta de una factura del control. Si una orden de compra se pagó con
 * caja chica, la puerta es la orden: es donde nació.
 */
export function puertaDe(factura, { odc = [], caja = null } = {}) {
  if (odc.length) return "odc";
  if (caja || factura?.caja_gasto_id || factura?.origen === "caja_chica") return "cc";
  if (factura?.origen === "rol") return "rol";
  return "control";
}

/**
 * La traza de un papel: todo lo que hace falta para nombrarlo.
 *
 * @param tr       el número de la TR (null si la 202 no corrió todavía)
 * @param leadId   el proyecto
 * @param odc      ids de las órdenes de compra enganchadas
 * @param caja     { id, nombre } de la caja chica de donde salió
 * @param planilla { numero, nombre, estado } donde quedó
 * @param puerta   una clave de PUERTAS
 */
export function traza({ tr = null, leadId = null, odc = [], caja = null, planilla = null, puerta = null } = {}) {
  return {
    tr: num(tr), pr: num(leadId),
    odc: [...new Set((odc || []).map(num).filter(Boolean))].sort((a, b) => a - b),
    caja: caja && num(caja.id) ? { id: num(caja.id), nombre: caja.nombre || "" } : null,
    planilla: planilla && num(planilla.numero)
      ? { numero: num(planilla.numero), nombre: planilla.nombre || "", estado: planilla.estado || "" } : null,
    puerta: puerta || null,
  };
}

const primerNombre = s => String(s || "").trim().split(/\s+/)[0] || "";

/**
 * Las partes de la traza, en orden, para escribirlas en una línea:
 * «PR15-TR52 · ODC6 · CC9 Lizeth · PL2».
 *
 * Cada parte lleva su `titulo`, que es lo que se lee al dejar el dedo encima.
 */
export function partesDeLaTraza(t) {
  if (!t) return [];
  const partes = [];
  if (t.tr) {
    partes.push({ clave: "tr", texto: codigoTR(t.tr, t.pr),
      titulo: `Transacción ${t.tr}${t.pr ? ` del proyecto ${t.pr}` : ", sin proyecto"}${t.puerta ? `: ${PUERTAS[t.puerta]}` : ""}. El mismo código en la orden de compra o el gasto de caja chica y en su factura.` });
  }
  t.odc.forEach(id => partes.push({ clave: "odc", id, texto: codigoODC(id), titulo: `Viene de la orden de compra N° ${id}` }));
  if (t.caja) {
    partes.push({ clave: "cc", id: t.caja.id, texto: `${codigoCC(t.caja.id)}${t.caja.nombre ? ` ${primerNombre(t.caja.nombre)}` : ""}`,
      titulo: `Viene de la caja chica${t.caja.nombre ? ` de ${t.caja.nombre}` : ""}` });
  }
  if (t.puerta === "rol") partes.push({ clave: "rol", texto: "ROL", titulo: "Viene del rol de mano de obra" });
  if (t.planilla) {
    partes.push({ clave: "pl", texto: codigoPL(t.planilla.numero),
      titulo: `${t.planilla.nombre || `Planilla N° ${t.planilla.numero}`}${t.planilla.estado === "cerrada" ? " (cerrada)" : ""}` });
  }
  return partes;
}

/** La traza en texto corrido: para un mensaje, un correo o una celda de Excel. */
export const trazaEnTexto = t => partesDeLaTraza(t).map(p => p.texto).join(" · ");

/** La puerta, en una palabra, para la columna ORIGEN del Excel. */
export function origenEnTexto(t) {
  if (!t) return "";
  return [...t.odc.map(codigoODC), t.caja ? codigoCC(t.caja.id) : "", t.puerta === "rol" ? "ROL" : "",
    t.puerta === "control" ? "CONTROL" : ""].filter(Boolean).join(" · ");
}

// «PR15-TR52», «tr 52», «TR#52», «odc6», «cc 9», «pl2».
const UN_CODIGO = /(?:^|[^a-z0-9])(pr|tr|odc|cc|pl)[\s#°.-]*(\d{1,9})(?![a-z0-9])/gi;

/**
 * Lo que alguien escribió en un buscador, separado en códigos y resto.
 *
 * «tr52» → { tr: 52 }. «PR15-TR52» → { pr: 15, tr: 52 }. «pases odc6» →
 * { odc: 6, resto: "pases" }. Sin ningún código devuelve null: se busca como
 * siempre.
 */
export function codigosEnLaBusqueda(texto) {
  const s = String(texto || "");
  const hallado = {};
  let resto = s;
  for (const m of s.matchAll(UN_CODIGO)) {
    hallado[m[1].toLowerCase()] = Number(m[2]);
    resto = resto.replace(m[0].replace(/^[^a-z]/i, ""), " ");
  }
  if (!Object.keys(hallado).length) return null;
  return { ...hallado, resto: resto.replace(/[\s·-]+/g, " ").trim() };
}

/**
 * ¿Esta traza es la que se busca? Todos los códigos escritos tienen que
 * coincidir. `unidas` es el mapa de las TR que resultaron ser otra: buscar la
 * que salió lleva a la que quedó.
 */
export function esLaBuscada(t, codigos, unidas = {}) {
  if (!t || !codigos) return false;
  if (codigos.tr != null) {
    const buscada = Number(unidas[codigos.tr] ?? codigos.tr);
    if (t.tr !== buscada) return false;
  }
  if (codigos.pr != null && t.pr !== codigos.pr) return false;
  if (codigos.odc != null && !t.odc.includes(codigos.odc)) return false;
  if (codigos.cc != null && t.caja?.id !== codigos.cc) return false;
  if (codigos.pl != null && t.planilla?.numero !== codigos.pl) return false;
  return true;
}
