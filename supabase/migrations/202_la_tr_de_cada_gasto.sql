-- 202 · La TR: un código para cada gasto, de punta a punta.
--
-- Hernán, 28/11/2026: «a veces no sabes de qué factura está hablando un
-- error... o en la planilla de dónde viene cierto gasto... o una factura en qué
-- planilla está». Y cómo lo imagina: «el proyecto genera gastos por varios
-- medios: gastos de caja chica —cada gasto genera su factura— y órdenes de
-- compra, que eventualmente tienen su factura. La TR tiene su proyecto, está
-- compuesta por facturas que vienen de gastos de caja chica o bien de órdenes
-- de compra. Todo esto al final está en una planilla».
--
-- La TR (transacción) es el hilo: nace con la orden de compra (ODC) o con el
-- gasto de caja chica (CC), y la factura del control que resulta LLEVA EL
-- MISMO NÚMERO. Lo que se carga directo en el control, o desde el rol de mano
-- de obra, abre su propia TR. El número es seguido en toda la empresa: no se
-- repite entre proyectos («que no se repita»).
--
-- Cuando dos TR resultan ser la misma —una factura cargada directo que después
-- se engancha a una orden— queda la más antigua, y la otra se anota en
-- `foreman_tr_unidas` para que buscarla siga llevando al mismo lugar.
--
-- No cambia ningún monto ni ningún dato existente: agrega una columna y la
-- llena. Se puede correr más de una vez.

create sequence if not exists public.foreman_tr_seq;

alter table public.compras_solicitudes add column if not exists tr bigint;
alter table public.cajas_gastos        add column if not exists tr bigint;
alter table public.obra_facturas       add column if not exists tr bigint;

create index if not exists compras_solicitudes_tr on public.compras_solicitudes (tr);
create index if not exists cajas_gastos_tr        on public.cajas_gastos (tr);
create index if not exists obra_facturas_tr       on public.obra_facturas (tr);

create table if not exists public.foreman_tr_unidas (
  de         bigint primary key,
  a          bigint not null,
  created_at timestamptz not null default now()
);
alter table public.foreman_tr_unidas enable row level security;
do $$ begin
  create policy "equipo foreman" on public.foreman_tr_unidas for select to authenticated using (true);
exception when duplicate_object then null; end $$;
comment on table public.foreman_tr_unidas is
  'TR que resultaron ser otra: buscar `de` lleva a `a`. La escriben solo los triggers de la 202.';

-- LO QUE YA EXISTE. Cada grupo de papeles enganchados entre sí es una TR, y se
-- numeran por el más antiguo de cada grupo. Solo si todavía nadie tiene número.
do $$
declare
  cambiados integer;
begin
  if exists (select 1 from public.compras_solicitudes where tr is not null)
     or exists (select 1 from public.cajas_gastos where tr is not null)
     or exists (select 1 from public.obra_facturas where tr is not null) then
    return;
  end if;

  create temp table _tr_nodo on commit drop as
    select k, id, row_number() over (order by nacio, k, id) as grupo
    from (
      select 'c' as k, id, created_at as nacio from public.compras_solicitudes
      union all select 'g', id, created_at from public.cajas_gastos
      union all select 'f', id, created_at from public.obra_facturas
    ) x;
  create index on _tr_nodo (k, id);

  create temp table _tr_lazo on commit drop as
    select 'c' as k1, s.id as id1, 'f' as k2, s.factura_id as id2
      from public.compras_solicitudes s where s.factura_id is not null
    union all
    select 'g', g.id, 'f', g.obra_factura_id from public.cajas_gastos g where g.obra_factura_id is not null
    union all
    select 'f', f.id, 'g', f.caja_gasto_id from public.obra_facturas f where f.caja_gasto_id is not null
    union all
    select 'f', f.id, 'f', f.facturada_con_id from public.obra_facturas f where f.facturada_con_id is not null;

  loop
    with menor as (
      select n.k, n.id, min(least(a.grupo, b.grupo)) as grupo
      from _tr_lazo l
      join _tr_nodo a on a.k = l.k1 and a.id = l.id1
      join _tr_nodo b on b.k = l.k2 and b.id = l.id2
      join _tr_nodo n on (n.k = a.k and n.id = a.id) or (n.k = b.k and n.id = b.id)
      group by n.k, n.id
    )
    update _tr_nodo n set grupo = m.grupo from menor m
     where m.k = n.k and m.id = n.id and m.grupo < n.grupo;
    get diagnostics cambiados = row_count;
    exit when cambiados = 0;
  end loop;

  create temp table _tr_num on commit drop as
    select grupo, dense_rank() over (order by grupo) as tr from (select distinct grupo from _tr_nodo) g;

  update public.compras_solicitudes t set tr = u.tr
    from _tr_nodo n join _tr_num u on u.grupo = n.grupo where n.k = 'c' and n.id = t.id;
  update public.cajas_gastos t set tr = u.tr
    from _tr_nodo n join _tr_num u on u.grupo = n.grupo where n.k = 'g' and n.id = t.id;
  update public.obra_facturas t set tr = u.tr
    from _tr_nodo n join _tr_num u on u.grupo = n.grupo where n.k = 'f' and n.id = t.id;

  perform setval('public.foreman_tr_seq', greatest((select coalesce(max(tr), 0) from _tr_num), 1), true);
end $$;

-- DOS TR QUE SON LA MISMA: queda la más antigua (el número menor).
create or replace function public.foreman_tr_unir(uno bigint, otro bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  queda bigint := least(uno, otro);
  sale  bigint := greatest(uno, otro);
begin
  if uno is null or otro is null or uno = otro then return; end if;
  update public.compras_solicitudes set tr = queda where tr = sale;
  update public.cajas_gastos        set tr = queda where tr = sale;
  update public.obra_facturas       set tr = queda where tr = sale;
  update public.foreman_tr_unidas   set a  = queda where a  = sale;
  insert into public.foreman_tr_unidas (de, a) values (sale, queda)
    on conflict (de) do update set a = excluded.a;
end $$;

-- Unir dos TR lo hacen los triggers, no una llamada desde afuera.
revoke all on function public.foreman_tr_unir(bigint, bigint) from public, anon, authenticated;

-- NACE CON SU NÚMERO. La orden de compra y el gasto de caja chica abren una
-- TR; la factura toma la de su gasto, y si no vino de ninguno, abre la suya.
create or replace function public.foreman_tr_al_nacer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- En dos pasos: `caja_gasto_id` solo existe en las facturas, y la condición
  -- junta fallaría al nacer una orden de compra o un gasto.
  if new.tr is null and tg_table_name = 'obra_facturas' then
    if new.caja_gasto_id is not null then
      select g.tr into new.tr from public.cajas_gastos g where g.id = new.caja_gasto_id;
    end if;
  end if;
  if new.tr is null then new.tr := nextval('public.foreman_tr_seq'); end if;
  return new;
end $$;

-- Y CUANDO SE ENGANCHAN, quedan en la misma.
create or replace function public.foreman_tr_al_enganchar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  la_otra bigint;
begin
  if tg_table_name = 'compras_solicitudes' then
    if new.factura_id is not null then
      select f.tr into la_otra from public.obra_facturas f where f.id = new.factura_id;
      perform public.foreman_tr_unir(new.tr, la_otra);
    end if;
  elsif tg_table_name = 'cajas_gastos' then
    if new.obra_factura_id is not null then
      select f.tr into la_otra from public.obra_facturas f where f.id = new.obra_factura_id;
      perform public.foreman_tr_unir(new.tr, la_otra);
    end if;
  else
    if new.caja_gasto_id is not null then
      select g.tr into la_otra from public.cajas_gastos g where g.id = new.caja_gasto_id;
      perform public.foreman_tr_unir(new.tr, la_otra);
    end if;
    if new.facturada_con_id is not null then
      select f.tr into la_otra from public.obra_facturas f where f.id = new.facturada_con_id;
      -- La fila pudo cambiar de número en el paso anterior: se lee de nuevo.
      perform public.foreman_tr_unir((select f.tr from public.obra_facturas f where f.id = new.id), la_otra);
    end if;
  end if;
  return null;
end $$;

drop trigger if exists compras_solicitudes_tr_nace on public.compras_solicitudes;
create trigger compras_solicitudes_tr_nace before insert on public.compras_solicitudes
  for each row execute function public.foreman_tr_al_nacer();
drop trigger if exists cajas_gastos_tr_nace on public.cajas_gastos;
create trigger cajas_gastos_tr_nace before insert on public.cajas_gastos
  for each row execute function public.foreman_tr_al_nacer();
drop trigger if exists obra_facturas_tr_nace on public.obra_facturas;
create trigger obra_facturas_tr_nace before insert on public.obra_facturas
  for each row execute function public.foreman_tr_al_nacer();

drop trigger if exists compras_solicitudes_tr_engancha on public.compras_solicitudes;
create trigger compras_solicitudes_tr_engancha after insert or update of factura_id on public.compras_solicitudes
  for each row execute function public.foreman_tr_al_enganchar();
drop trigger if exists cajas_gastos_tr_engancha on public.cajas_gastos;
create trigger cajas_gastos_tr_engancha after insert or update of obra_factura_id on public.cajas_gastos
  for each row execute function public.foreman_tr_al_enganchar();
drop trigger if exists obra_facturas_tr_engancha on public.obra_facturas;
create trigger obra_facturas_tr_engancha after insert or update of caja_gasto_id, facturada_con_id on public.obra_facturas
  for each row execute function public.foreman_tr_al_enganchar();

comment on column public.obra_facturas.tr is
  'La TR: el número del gasto de punta a punta. Lo comparten la orden de compra o el gasto de caja chica y la factura que resulta. Lo ponen los triggers de la 202.';
