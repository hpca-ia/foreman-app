-- 114 · Los beneficios de la obra, guardados.
--
-- El beneficio es la diferencia entre lo que se presupuestó y lo que de verdad
-- costó comprarlo: no sale de vender más caro, sale de comprar mejor. Hasta
-- ahora se calculaba al vuelo cuando alguien subía una proforma y se perdía al
-- cerrar la pantalla, así que no se podía ir armando a lo largo de la obra ni
-- contestar la única pregunta que importa: "¿cuánto llevamos ganado de más
-- —o de menos— contra el presupuesto?".
--
-- Se guarda por rubro, con lo presupuestado y lo real, y da igual si vino de
-- una proforma leída o si alguien lo escribió a mano: muchos beneficios no
-- están en ningún papel —se negoció por teléfono, el contratista bajó el
-- precio— y si solo se pudieran cargar leyendo un archivo, esos no entrarían
-- nunca.

create table if not exists public.obra_beneficios (
  id             bigserial primary key,
  obra_id        bigint not null references public.obras(id) on delete cascade,
  -- Puede no tener rubro: un descuento general, un flete que se evitó. Sin
  -- rubro no se compara contra nada, pero suma al total de la obra.
  obra_rubro_id  bigint references public.obra_rubros(id) on delete set null,
  descripcion    text not null,
  cantidad       numeric,
  unidad         text,
  -- Lo que decía el presupuesto para eso, y lo que de verdad costó.
  presupuestado  numeric not null default 0,
  real           numeric not null default 0,
  proveedor      text,
  -- proforma · manual. De dónde salió el número, que cambia cuánto se le cree.
  origen         text not null default 'manual',
  fecha          date not null default current_date,
  nota           text,
  creado_por     bigint,
  creado_nombre  text,
  created_at     timestamptz not null default now()
);

create index if not exists obra_beneficios_obra on public.obra_beneficios (obra_id);
create index if not exists obra_beneficios_rubro on public.obra_beneficios (obra_rubro_id);

alter table public.obra_beneficios enable row level security;
do $$ begin
  create policy "equipo foreman" on public.obra_beneficios for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

comment on table public.obra_beneficios is
  'Lo presupuestado contra lo que de verdad costó, rubro por rubro. La diferencia es el beneficio de la obra.';
