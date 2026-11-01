-- 156 · Si cambia el rubro, cambia lo que ese renglón es.
--
-- Un renglón que NOVA dejó sin rubro entra como TRABAJO NUEVO, y está bien:
-- sin un rubro que lo cubra, eso es alcance que apareció después. Pero cuando
-- alguien le señala el rubro a mano —que es justo lo que la pantalla ahora
-- invita a hacer— deja de ser trabajo nuevo: pasa a ser el mismo rubro a otro
-- precio, o con otra cantidad.
--
-- Y no se recalculaba. La tarjeta seguía diciendo "no está en el contrato" al
-- lado del rubro que sí lo contiene, con el monto entero como si hubiera que
-- cobrarlo todo, cuando lo que corresponde cobrar —o lo que queda a favor— es
-- la diferencia contra lo contratado. El que mira decide contra el número
-- equivocado, y encima el beneficio no aparece en ningún lado.
--
-- Para poder rehacer esa cuenta hace falta el monto del papel: el `monto` de la
-- diferencia ya no es el del renglón —es la diferencia— así que una vez
-- calculado no se puede volver atrás. Se guarda lo que decía la proforma, que
-- es el dato original y no cambia nunca.

alter table public.obra_analisis_lineas add column if not exists monto_papel numeric;

comment on column public.obra_analisis_lineas.monto_papel is
  'Lo que ese renglón cuesta según la proforma, tal cual. El `monto` de la diferencia es una resta contra el contrato: sin el original no se puede rehacer la cuenta cuando se corrige el rubro.';
