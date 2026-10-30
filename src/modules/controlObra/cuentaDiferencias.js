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
};

/** Cómo va un análisis, para poder tener varios abiertos sin perderse. */
export function comoVa(lineas = []) {
  const sinDecidir = lineas.filter(l => l.decision === "pendiente").length;
  const aCobrar = lineas.filter(l => l.decision === "cobrar");
  return {
    total: lineas.length,
    sinDecidir,
    aCobrar: aCobrar.length,
    monto: Math.round(aCobrar.reduce((t, l) => t + (Number(l.monto) || 0), 0) * 100) / 100,
    listo: lineas.length > 0 && sinDecidir === 0,
  };
}
