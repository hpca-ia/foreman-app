// A QUÉ RUBRO VA UN GASTO DE CAJA CHICA, Y POR CUÁNTO.
//
// El formulario deja elegir el rubro y, al lado, cuánto va a ese rubro. Ese
// monto se llenaba una sola vez, en el momento de elegir el rubro, con lo que
// el documento valiera EN ESE MOMENTO. Y casi siempre se elige el rubro antes
// de que el monto esté: se saca la foto, se marca "Dirección de proyecto", y
// recién después NOVA termina de leer el total. El renglón quedaba en cero, y
// al grabar lo que vale cero se descartaba: el gasto entraba al control sin
// rubro, sin un solo aviso, y quien lo cargó veía que lo había elegido.
//
// Lo mismo al revés: se elige el rubro con el monto en $80, se corrige a
// $89,85, y el rubro quedaba cargado con los $80 viejos.
//
// La regla:
//
//   · Un solo rubro: va el documento ENTERO, diga lo que diga el renglón. No
//     hay otra cosa que pueda querer decir elegir un solo rubro.
//   · Varios rubros: va lo que se escribió en cada uno. Si uno solo quedó en
//     cero, se lleva lo que falta para completar el documento. Si quedan
//     varios en cero no se adivina: se guardan los que tienen monto y el resto
//     aparece como "sin asignar", que es verdad.
//
// Los montos salen positivos: el signo lo pone el documento al guardar, porque
// una nota de crédito descarga el rubro y una factura lo carga.

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

/**
 * @param renglones  lo elegido en el formulario: [{ obra_rubro_id | obra_actividad_id, monto }]
 * @param monto      lo que vale el documento
 * @returns los renglones que apuntan a algo, con el monto que les corresponde
 */
export function repartoDelGasto(renglones = [], monto) {
  const conDestino = (renglones || []).filter(r => r?.obra_rubro_id || r?.obra_actividad_id);
  const total = Math.abs(n(monto));
  if (!conDestino.length) return [];
  if (conDestino.length === 1) return [{ ...conDestino[0], monto: c2(total) }];
  const escrito = conDestino.reduce((t, r) => t + Math.abs(n(r.monto)), 0);
  const enCero = conDestino.filter(r => !Math.abs(n(r.monto)));
  const falta = c2(total - escrito);
  return conDestino
    .map(r => ({
      ...r,
      monto: !Math.abs(n(r.monto)) && enCero.length === 1 && falta > 0 ? falta : c2(Math.abs(n(r.monto))),
    }))
    .filter(r => r.monto > 0);
}
