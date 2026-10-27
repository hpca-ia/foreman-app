-- 125 · La cotización con la que se armó la orden de cambio, guardada con ella.
--
-- Una orden de cambio se arma con la cotización del que va a hacer el trabajo
-- delante: NOVA la lee y llena las partidas. Hasta ahora, al cerrar la
-- pantalla, el papel y lo que se leyó de él se perdían. Quedaba el precio que
-- se le cobra al cliente y no quedaba lo que cuesta, así que al liquidar la
-- obra nadie podía decir cuánto dejó cada orden: había que volver a buscar la
-- proforma en un WhatsApp de hace cinco meses.
--
-- Se guarda el archivo tal como llegó —es el papel que se discute con el
-- proveedor— y lo que NOVA leyó de él, para poder mirarlo sin volver a leerlo.

create table if not exists public.orden_cambio_cotizaciones (
  id              bigserial primary key,
  orden_id        bigint not null references public.ordenes_cambio(id) on delete cascade,
  archivo_path    text,
  archivo_nombre  text,
  proveedor       text,
  total           numeric(14,2),
  -- Los renglones tal como los leyó NOVA: descripcion, cantidad, unidad, monto.
  items           jsonb not null default '[]'::jsonb,
  creado_por      bigint,
  creado_nombre   text,
  created_at      timestamptz not null default now()
);
create index if not exists oc_cotizaciones_orden on public.orden_cambio_cotizaciones (orden_id);

alter table public.orden_cambio_cotizaciones enable row level security;
do $$ begin
  create policy "equipo foreman" on public.orden_cambio_cotizaciones for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

comment on table public.orden_cambio_cotizaciones is
  'La cotización del proveedor con la que se armó cada orden de cambio: el archivo y lo que se leyó de él.';

-- EL COSTO POR PARTIDA, APARTE DEL PRECIO.
--
-- El precio de la partida es lo que se le cobra al cliente y se corrige —se le
-- pone el margen—. El costo es lo que dijo el proveedor y no se toca al
-- corregir el precio: si vivieran en la misma columna, ponerle margen a una
-- partida borraría lo que cuesta. Es unitario, como el precio, para que al
-- cambiar la cantidad cambien los dos.
alter table public.orden_cambio_lineas
  add column if not exists costo_unitario numeric(14,4);
alter table public.orden_cambio_lineas
  add column if not exists cotizacion_id bigint references public.orden_cambio_cotizaciones(id) on delete set null;

comment on column public.orden_cambio_lineas.costo_unitario is
  'Lo que cuesta cada unidad según la cotización del proveedor. Nulo: no se sabe, y el margen de la partida tampoco.';

-- EL BENEFICIO DE UNA ORDEN, ATADO A SU PARTIDA.
--
-- Al aprobarse la orden, cada partida con costo deja un beneficio PREVISTO en
-- la obra: lo que se cobra contra lo que cuesta según la cotización. Previsto
-- porque una cotización no es una compra (115). Se ata a la partida para poder
-- corregirlo si cambia el costo, y para que deshacer la aprobación se lleve lo
-- que todavía es promesa sin tocar lo que ya se compró.
alter table public.obra_beneficios
  add column if not exists orden_cambio_id bigint references public.ordenes_cambio(id) on delete set null;
alter table public.obra_beneficios
  add column if not exists orden_cambio_linea_id bigint references public.orden_cambio_lineas(id) on delete set null;

create index if not exists obra_beneficios_orden on public.obra_beneficios (orden_cambio_id);

comment on column public.obra_beneficios.orden_cambio_id is
  'La orden de cambio de la que sale este beneficio: lo cobrado en la orden contra el costo de su cotización.';
