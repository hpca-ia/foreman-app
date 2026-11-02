-- 164 · La semana del plan va de lunes a domingo, siete días.
--
-- La 161 la puso de domingo a domingo: ocho días que se pisan en uno, con el
-- domingo de cierre haciendo de apertura del siguiente. Suena bien dicho y es
-- un problema en los datos: ese domingo existe en DOS planes a la vez, y el
-- plan cuelga de días —cada día tiene sus tareas, y marcar una tarea escribe
-- en el libro de ESE día—. Una tarea del domingo pertenecería a dos semanas,
-- el libro del domingo se escribiría desde cualquiera de las dos, y lo que
-- quedó sin hacer se contaría dos veces al comparar una semana con la anterior.
--
-- Lunes a domingo, siete días, cada día en un solo plan:
--
--   · La semana de trabajo arranca el lunes y la reunión de obra es el lunes a
--     primera hora: el plan que se lee ahí empieza con el día que empieza.
--   · El domingo es el último día y es cuando se cierra, que es lo que se pide:
--     "se lo llena hasta el domingo".
--   · Y escribirlo ANTES de que empiece la semana no depende del corte: se
--     escribe el viernes o el sábado, moviendo una semana con la flecha.
--
-- Se cambia también en las obras que todavía tienen el valor de la 161 y nadie
-- tocó: un corte que alguien eligió a propósito no se pisa.

alter table public.obras alter column semana_arranca set default 1;
alter table public.obras alter column semana_dias    set default 7;

update public.obras set semana_arranca = 1, semana_dias = 7
 where semana_arranca = 0 and semana_dias = 8;

comment on column public.obras.semana_arranca is
  'Qué día arranca la semana de esta obra: 0 domingo, 1 lunes … 6 sábado. Por defecto lunes, y la semana es de siete días: cada día pertenece a un solo plan.';
