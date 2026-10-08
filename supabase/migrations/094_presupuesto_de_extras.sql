-- 094 · Las agrupaciones que no vienen del presupuesto también tienen un monto.
--
-- Una obra gasta en cosas que el contrato no tiene: la vivienda del residente,
-- la oficina, el flete, el imprevisto. Eso ya se podía registrar —son las
-- agrupaciones "extra"— pero arrancaban en CERO, y entonces el control las
-- mostraba en sobregiro desde el primer gasto: saldo negativo, avance infinito.
--
-- Y eso no es verdad. Esa plata está presupuestada: no en el contrato con el
-- cliente, sino en el presupuesto interno de la obra, que es el que dice cuánto
-- se puede gastar en vivienda antes de que el proyecto deje de ser rentable.
-- Es un número que alguien decide, y hoy vivía en la cabeza de quien dirige.
--
-- La diferencia con las ODC importa: una orden de cambio SÍ entra al contrato
-- —sus rubros se agregan a `obra_rubros` con su monto y el cliente los paga—.
-- Estas no: se gastan contra el margen. Por eso van aparte y por eso su monto
-- se escribe a mano en vez de salir de ningún documento.
--
-- Sin el número, el bloque sigue funcionando como hasta ahora: en cero, con el
-- saldo en rojo. Poner un presupuesto es optativo y lo que cambia es que
-- aparezca un avance que signifique algo.

alter table public.obra_actividades add column if not exists presupuesto numeric(14,2);

comment on column public.obra_actividades.presupuesto is
  'Para las agrupaciones extra (vivienda, oficina, logística): cuánto se puede gastar. Nulo = sin tope, el saldo arranca en cero.';
