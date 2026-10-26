-- 124 · Cada presupuesto tiene su cronograma.
--
-- El cronograma que va con una cotización se arma desde el presupuesto que se
-- está trabajando, no desde el proyecto: la v1 y la v2 son obras distintas
-- —otros metros, otro alcance— y cada una necesita el suyo. Y un presupuesto
-- se trabaja muchas veces antes de tener proyecto.
--
-- Entonces el cronograma puede ser de un proyecto (como hasta ahora: el de la
-- obra en curso) o de un presupuesto. Uno de los dos, nunca ninguno.
--
-- El plazo y el calendario del cronograma de un presupuesto viven en el
-- presupuesto, por la misma razón que los del proyecto viven en el proyecto:
-- son una sola cosa y la leen todas las pantallas.

do $$
declare t text;
begin
  foreach t in array array['cronograma_actividades','cronograma_fases','cronograma_versiones'] loop
    execute format('alter table public.%I alter column lead_id drop not null', t);
    execute format('alter table public.%I add column if not exists presupuesto_id bigint
      references public.presupuestos(id) on delete cascade', t);
    execute format('create index if not exists %I on public.%I (presupuesto_id)', t || '_presupuesto', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_de_alguien');
    execute format('alter table public.%I add constraint %I
      check (lead_id is not null or presupuesto_id is not null)', t, t || '_de_alguien');
  end loop;
end $$;

alter table public.presupuestos add column if not exists crono_inicio     date;
alter table public.presupuestos add column if not exists crono_meses      int;
alter table public.presupuestos add column if not exists crono_fin        date;
alter table public.presupuestos add column if not exists crono_laborables jsonb;
alter table public.presupuestos add column if not exists crono_feriados   jsonb;
alter table public.presupuestos add column if not exists crono_cubre      boolean;
