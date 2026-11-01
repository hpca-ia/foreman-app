// QUÉ SE DECIDIÓ CON CADA DIFERENCIA, Y CÓMO VA EL ANÁLISIS.
//
// Vive aparte de la base porque es lo único de todo esto que se puede probar
// sin un navegador — y es lo que decide qué se le cobra a un cliente.

/** Lo que se decidió con cada diferencia, y qué significa. */
export const DECISIONES = {
  pendiente: { label: "Sin decidir", pista: "Todavía se está discutiendo" },
  cobrar: {
    label: "Se le cobra al cliente",
    pista: "Entra en la orden de cambio que el cliente firma y paga",
  },
  incluido: {
    label: "Ya estaba incluido",
    pista: "El contrato ya lo cubría: no se cobra nada, y queda escrito dónde estaba",
  },
  nuestro: {
    label: "Lo pagamos nosotros",
    pista: "Error nuestro —una medición, un olvido—: sale de la utilidad de la obra, no del cliente",
  },
  // UN AHORRO NO ES UNA DIFERENCIA CON EL CLIENTE.
  //
  // Si el proveedor cotiza por debajo del costo cargado, no hay nada que
  // cobrar ni que devolver: el cliente paga el precio que firmó y nosotros
  // compramos mejor. Eso es una eficiencia, y vive en Beneficios.
  eficiencia: {
    label: "Es eficiencia nuestra",
    pista: "Se compró por debajo de lo presupuestado: no se le cobra al cliente, se registra en Beneficios",
  },
};

/**
 * QUÉ SE PUEDE DECIDIR CON CADA HALLAZGO.
 *
 * Ofrecer las cuatro siempre deja elegir las dos que no son: cobrarle al
 * cliente porque compramos más barato, o anotar como eficiencia nuestra un
 * trabajo que no está en el contrato. Un botón que no corresponde no es una
 * opción de más: es la respuesta equivocada al alcance de un clic.
 */
export function decisionesPara(hallazgo) {
  const todas = Object.keys(DECISIONES).filter(k => k !== "pendiente");
  if (hallazgo === "bajo_precio") return todas.filter(k => k !== "cobrar");
  return todas.filter(k => k !== "eficiencia");
}

/** Cómo va un análisis, para poder tener varios abiertos sin perderse. */
export function comoVa(lineas = []) {
  const sinDecidir = lineas.filter(l => l.decision === "pendiente").length;
  const aCobrar = lineas.filter(l => l.decision === "cobrar");
  // Lo que quedó a favor nuestro se cuenta aparte de lo que se le cobra al
  // cliente: son dos plata distintas y van a dos lados distintos.
  const eficiencias = lineas.filter(l => l.decision === "eficiencia");
  // REVISADO NO ES DECIDIDO. Un renglón mirado y dejado a propósito para
  // hablarlo el lunes no es lo mismo que uno que nadie abrió, y sin
  // distinguirlos volver al análisis obliga a empezar desde arriba.
  const revisadas = lineas.filter(l => !!l.revisado_at || l.decision !== "pendiente");
  const anotadas = lineas.filter(l => String(l.nota || "").trim());
  const miradasSinDecidir = lineas.filter(l => !!l.revisado_at && l.decision === "pendiente");
  return {
    total: lineas.length,
    sinDecidir,
    aCobrar: aCobrar.length,
    monto: Math.round(aCobrar.reduce((t, l) => t + (Number(l.monto) || 0), 0) * 100) / 100,
    eficiencias: eficiencias.length,
    revisadas: revisadas.length,
    sinMirar: lineas.length - revisadas.length,
    // Las que alguien ya miró y dejó pendientes a propósito: son las que hay
    // que volver a tocar, y no se mezclan con las que nadie abrió.
    miradasSinDecidir: miradasSinDecidir.length,
    anotadas: anotadas.length,
    aFavor: Math.round(eficiencias.reduce((t, l) => t + (Number(l.monto) || 0), 0) * 100) / 100,
    listo: lineas.length > 0 && sinDecidir === 0,
  };
}
