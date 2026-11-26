-- 196 · El presupuesto y la comparativa que se le comparten al cliente.
--
-- Hernán, 26/11/2026: «En este caso el dueño del proyecto es dueño del
-- presupuesto. Me gustaría poder compartir con él el presupuesto y estas
-- comparativas también, a manera informativa, no de edición. Aunque aquí él
-- podría también elegir y aprobar presupuesto para que quede constancia del
-- armado del presupuesto». Y definió: el cliente VE Y APRUEBA —elegir, elige
-- la oficina—, y al compartir se escoge si va a costo o con utilidad: de eso
-- depende que el cliente vea el costo o no.
--
-- Lo que se le comparte es UNA FOTO: el presupuesto con lo elegido y lo que
-- cotizó cada empresa, como estaba en ese momento y con los precios que se
-- decidió mostrarle. Si se compartió con utilidad, el costo no está en la
-- foto: no es que se oculte al mostrarla, es que no se guardó. Y lo que el
-- cliente aprueba es esa foto: si después cambia una cotización o se vuelve a
-- elegir, se comparte de nuevo y la anterior queda como estaba.
--
--   · presupuesto_compartidos   una fila por cada vez que se compartió.
--   · aprobaciones_cliente.presupuesto_compartido_id
--                               el pedido del registro (migración 187) que le
--                               pide aprobar esa foto. Así el presupuesto
--                               entra a la misma colección de aprobaciones que
--                               los planos y los puntos del checklist, con qué
--                               tenía a la vista al contestar.
--
-- No cambia ningún presupuesto ni ningún pedido que ya exista. Se puede
-- correr más de una vez.

create table if not exists public.presupuesto_compartidos (
  id                bigserial primary key,
  -- Si el presupuesto se borra, lo que el cliente aprobó queda.
  presupuesto_id    bigint references public.presupuestos(id) on delete set null,
  presupuesto_nombre text,
  lead_id           bigint not null references public.leads(id) on delete cascade,
  modo              text not null,
  con_comparativa   boolean not null default true,
  foto              jsonb not null,
  total             numeric,
  compartido_por    bigint,
  compartido_nombre text,
  created_at        timestamptz not null default now(),
  retirado_at       timestamptz,
  retirado_nombre   text,
  constraint presupuesto_compartidos_modo_valido check (modo in ('costo', 'utilidad'))
);

create index if not exists presupuesto_compartidos_del_presupuesto
  on public.presupuesto_compartidos (presupuesto_id, created_at);
create index if not exists presupuesto_compartidos_del_proyecto
  on public.presupuesto_compartidos (lead_id) where retirado_at is null;

alter table public.presupuesto_compartidos enable row level security;
drop policy if exists "equipo foreman" on public.presupuesto_compartidos;
create policy "equipo foreman" on public.presupuesto_compartidos for all to authenticated using (true) with check (true);

alter table public.aprobaciones_cliente
  add column if not exists presupuesto_compartido_id bigint references public.presupuesto_compartidos(id) on delete set null;

create index if not exists aprobaciones_cliente_del_presupuesto
  on public.aprobaciones_cliente (presupuesto_compartido_id) where presupuesto_compartido_id is not null;

comment on table public.presupuesto_compartidos is
  'Cada vez que un presupuesto y su comparativa de cotizaciones se le compartieron al cliente: la foto de lo que ve, a costo o con utilidad.';
comment on column public.presupuesto_compartidos.modo is
  'costo: el cliente ve lo que cotizó cada empresa, tal cual. utilidad: ve los precios con la utilidad de cada rubro, y el costo no está en la foto.';
comment on column public.presupuesto_compartidos.foto is
  'Lo que el cliente tiene a la vista: capítulos, rubros, lo de cada empresa y los totales, copiados al compartir. No se vuelve a calcular.';
comment on column public.aprobaciones_cliente.presupuesto_compartido_id is
  'Si el pedido es por un presupuesto compartido: cuál. Lo que el cliente aprueba es la foto de esa fila.';
