-- 179 · Lo ejecutado, y con qué regla se liquida la obra.
--
-- El presupuesto actualizado —el contrato con sus órdenes de cambio— es, al
-- final, la liquidación. Le faltaban dos datos que no estaban en ningún lado:
--
--   obras.modalidad    cómo se cobra el contrato.
--                        'rubros'         se cobra lo ejecutado, al precio
--                                         pactado: contratado 100, ejecutado
--                                         80, se cobran 80.
--                        'llave_en_mano'  se cobra lo contratado: contratado
--                                         100, ejecutado 120, se cobran 100.
--                      Nace en 'rubros', que es como son las obras de hoy.
--
--   obra_ejecutado     la cantidad ejecutada de cada renglón del presupuesto
--                      actualizado. La `clave` es el renglón: el id del rubro
--                      del contrato, o «o{orden}-{partida}» si lo agregó una
--                      orden de cambio. Sin fila, el renglón todavía no se
--                      midió y se liquida por lo vigente.
--
-- No cambia ningún monto que ya exista: sin cantidades ejecutadas cargadas, la
-- liquidación es el contrato vigente, al centavo.
--
-- Se puede correr más de una vez.

alter table public.obras add column if not exists modalidad text not null default 'rubros';

do $$ begin
  alter table public.obras add constraint obras_modalidad_valida check (modalidad in ('rubros', 'llave_en_mano'));
exception when duplicate_object then null; end $$;

comment on column public.obras.modalidad is 'Cómo se cobra el contrato: rubros (lo ejecutado al precio pactado) o llave_en_mano (lo contratado).';

create table if not exists public.obra_ejecutado (
  id              bigserial primary key,
  obra_id         bigint not null references public.obras(id) on delete cascade,
  clave           text not null,
  -- Si el renglón es un rubro del contrato: de ahí sale su costo.
  obra_rubro_id   bigint references public.obra_rubros(id) on delete cascade,
  cantidad        numeric(14,4) not null check (cantidad >= 0),
  anotado_por     bigint,
  anotado_nombre  text,
  updated_at      timestamptz not null default now(),
  unique (obra_id, clave)
);

comment on table public.obra_ejecutado is 'Cantidad ejecutada de cada renglón del presupuesto actualizado. Con ella se arma la liquidación.';

alter table public.obra_ejecutado enable row level security;
do $$ begin
  create policy "equipo foreman" on public.obra_ejecutado for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
