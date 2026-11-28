-- 200 · Lo que le falta a una compra ya hecha: la factura, una devolución.
--
-- Hernán, 28/11/2026, sobre la N° 6 (Camisas, Aeropuerto): «ya antigua y
-- ejecutada... aún no me llega la factura. Quiero en la misma historia poder
-- comentar eso, que llegue a Johanna o a residentes que lo resuelvan... y que
-- no esté cerrada aún la compra, que salga que tiene algo pendiente... o
-- serviría si hay una devolución». Y sobre cómo se cierra: «resuelto a mano,
-- pero que se haya leído y registrado con NOVA».
--
-- Un comentario no alcanzaba: queda en el historial y la compra sigue viéndose
-- cerrada. Un pendiente queda a la vista —en la lista de compras y en la
-- factura del control de obra— hasta que alguien toca «Resuelto».
--
-- LA REGLA VIVE EN LA BASE, como la de devolver con motivo (048): un pendiente
-- de factura o de devolución no se da por resuelto sin el papel que NOVA leyó.
-- Uno de factura, además, con la factura registrada en el control.
--
-- No cambia ningún dato existente. Se puede correr más de una vez.

create table if not exists public.compras_pendientes (
  id              bigserial primary key,
  solicitud_id    bigint not null references public.compras_solicitudes(id) on delete cascade,
  -- factura: falta el papel de la compra · devolucion: hay que devolver algo
  -- y que vuelva la plata o el cambio · otro: cualquier otra cosa.
  tipo            text   not null,
  texto           text   not null,
  -- Quién lo tiene que resolver: le queda como tarea.
  para_id         bigint,
  para_nombre     text,
  tarea_id        bigint,
  creado_por      bigint,
  creado_nombre   text,
  created_at      timestamptz not null default now(),
  -- El papel que lo resuelve y lo que NOVA leyó de él.
  doc_path        text,
  doc_nombre      text,
  doc_leido       jsonb,
  doc_leido_at    timestamptz,
  -- La factura del control con que quedó registrado (los de tipo factura).
  factura_id      bigint references public.obra_facturas(id) on delete set null,
  resuelto_at     timestamptz,
  resuelto_por    bigint,
  resuelto_nombre text,
  resuelto_nota   text,
  constraint compras_pendientes_tipo check (tipo in ('factura', 'devolucion', 'otro')),
  constraint compras_pendientes_texto check (btrim(texto) <> ''),
  constraint compras_pendientes_con_nova check (
    resuelto_at is null
    or tipo = 'otro'
    or (doc_leido_at is not null and (tipo <> 'factura' or factura_id is not null))
  )
);

create index if not exists compras_pendientes_abiertos
  on public.compras_pendientes (solicitud_id) where resuelto_at is null;

alter table public.compras_pendientes enable row level security;
do $$ begin
  create policy "equipo foreman" on public.compras_pendientes for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

comment on table public.compras_pendientes is
  'Lo que le falta a una compra (la factura, una devolución). Se ve en Compras y en la factura del control hasta que se resuelve; los de factura y devolución, solo con el papel leído por NOVA.';
