-- LAS SIMULACIONES DEL PRESUPUESTO ACTUALIZADO.
--
-- El presupuesto actualizado se arma solo: el contrato, lo que las órdenes de
-- cambio aprobadas le hicieron y lo que le harían las que esperan firma. Eso no
-- se guarda en ningún lado, porque sale de los rubros y de las órdenes.
--
-- Lo que sí hay que guardar es lo que alguien proyecta A MANO: "si sacamos las
-- mamparas y bajamos veinte puntos de iluminación, ¿en cuánto queda?". Es una
-- pregunta que se le contesta al cliente con un papel, y que a la semana se
-- vuelve a abrir para cambiarle dos números. Sin guardarla hay que volver a
-- escribir todos los ajustes cada vez.
--
-- Una simulación es un nombre y una lista de ajustes: por rubro, cuánta
-- cantidad se suma o se resta. No toca el contrato ni el control de obra. Los
-- honorarios no se guardan: se calculan con el porcentaje del contrato sobre lo
-- que los ajustes suman.

create table if not exists public.obra_presupuesto_simulaciones (
  id            bigserial primary key,
  obra_id       bigint not null references public.obras(id) on delete cascade,
  nombre        text not null,
  -- { "<id del rubro>": <cantidad que se suma, o se resta si es negativa> }
  ajustes       jsonb not null default '{}'::jsonb,
  creado_por    bigint,
  creado_nombre text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists obra_presupuesto_simulaciones_obra
  on public.obra_presupuesto_simulaciones (obra_id, updated_at desc);

alter table public.obra_presupuesto_simulaciones enable row level security;
do $$ begin
  create policy "equipo foreman" on public.obra_presupuesto_simulaciones
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

comment on table public.obra_presupuesto_simulaciones is
  'Lo que se proyecta a mano sobre el presupuesto actualizado de una obra: más o menos cantidad por rubro. Es informativo: no toca el contrato ni el control.';
