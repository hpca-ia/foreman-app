-- 152 · El honorario es del contrato, no de cada orden.
--
-- El porcentaje se puso en la orden de cambio, y el resultado fue el esperable:
-- la primera orden que se creó después salió sin honorarios. No porque se
-- decidiera no cobrarlos —se decidieron hace meses, cuando se firmó el
-- contrato— sino porque había un campo más que llenar y nadie llena un campo
-- que repite lo mismo en cada orden.
--
-- El dato vive en la obra, que es donde está el acuerdo: 10% sobre lo que se
-- administre. Cada orden puede tener el suyo si alguna vez se negocia distinto,
-- pero mientras no diga nada usa el de la obra, y entonces el honorario aparece
-- solo en el papel y en el control.
--
-- Un número que hay que acordarse de poner en cada documento es un número que
-- se va a perder, y este se cobra.
--
-- Se siembra en 10 solamente donde el presupuesto ya tiene un capítulo de
-- honorarios: esas son las obras donde el acuerdo está escrito y a la vista. En
-- las demás queda vacío, para que lo ponga quien sepa cuál es —inventarle un
-- porcentaje a una obra que no lo tiene sería cobrarle de más a un cliente.

alter table public.obras add column if not exists honorarios_pct numeric;

update public.obras o set honorarios_pct = 10
 where o.honorarios_pct is null
   and exists (select 1 from public.obra_rubros r
                where r.obra_id = o.id and r.capitulo ilike '%honorario%');

comment on column public.obras.honorarios_pct is
  'El porcentaje de honorarios del contrato, que se cobra sobre el neto de cada orden de cambio. La orden puede traer el suyo propio; si no, usa este.';
