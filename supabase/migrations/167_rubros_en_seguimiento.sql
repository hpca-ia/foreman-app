-- RUBROS EN SEGUIMIENTO, en Beneficios y pérdidas.
--
-- Un beneficio también puede salir de un rubro del presupuesto y de las
-- facturas que se le cargan en la planilla: se trae el rubro a Beneficios y
-- se lo sigue, factura a factura, contra su costo cargado o contra lo que se
-- cobra. Acá queda cuáles se siguen.
create table if not exists public.obra_beneficios_seguimiento (
  id             bigserial primary key,
  obra_id        bigint not null references public.obras(id) on delete cascade,
  obra_rubro_id  bigint not null references public.obra_rubros(id) on delete cascade,
  nota           text,
  creado_por     bigint,
  creado_nombre  text,
  created_at     timestamptz not null default now(),
  unique (obra_id, obra_rubro_id)
);
alter table public.obra_beneficios_seguimiento enable row level security;
do $$ begin
  create policy "equipo foreman" on public.obra_beneficios_seguimiento for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
comment on table public.obra_beneficios_seguimiento is
  'Rubros del presupuesto que se siguen en Beneficios contra sus facturas.';
