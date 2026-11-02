-- 161 · La semana de la obra la decide la obra, y arranca el domingo.
--
-- El plan semanal venía de miércoles a martes, y nadie lo había elegido: el
-- corte se heredaba del día en que arrancó la obra —si la obra empezó un
-- miércoles, todas sus semanas empezaban un miércoles— y después del último
-- plan escrito. La idea era buena para una obra que de verdad corta ahí, pero
-- convertía un accidente del calendario en una regla permanente que no se
-- podía cambiar desde ninguna pantalla.
--
-- La semana de obra arranca el DOMINGO y se llena hasta el domingo siguiente.
-- Se empieza a escribir antes de que la semana empiece —esa es la gracia de un
-- plan— y se cierra cuando termina.
--
-- Queda configurable por obra, porque hay obras que cortan distinto, pero con
-- un valor por defecto que no depende del día en que se firmó el contrato.

alter table public.obras add column if not exists semana_arranca smallint not null default 0;
alter table public.obras add column if not exists semana_dias    smallint not null default 8;

comment on column public.obras.semana_arranca is
  'Qué día arranca la semana de esta obra: 0 domingo, 1 lunes … 6 sábado. Por defecto domingo.';
comment on column public.obras.semana_dias is
  'Cuántos días cubre el plan semanal. 8 es domingo a domingo —se pisa un día a propósito: el domingo de cierre es el de apertura del siguiente—; 7 sería domingo a sábado.';
