-- 201 · El anexo que explica un gasto.
--
-- Hernán, 28/11/2026: «en un gasto subes una factura que la lea NOVA... pero
-- quiero también poder subir un anexo que complemente o explique la compra, y
-- que esté en la información de la compra, del control o de caja chica.
-- Ejemplo: pagan pases impersonales... ¿de quién? Esa explicación sería bueno
-- que también la suban».
--
-- La factura dice QUÉ se pagó; el anexo dice PARA QUÉ o PARA QUIÉN: la lista
-- de las personas de los pases, el correo del cliente que pidió el trabajo, la
-- foto del material. Un texto, un archivo, o los dos.
--
-- Cuelga del gasto de caja chica, de la factura del control o de la compra, y
-- se ve en las tres: el de un gasto de caja chica aparece en su factura del
-- control, y el de una compra en la factura que la cerró.
--
-- No cambia ningún dato existente. Se puede correr más de una vez.

create table if not exists public.anexos_de_gasto (
  id                bigserial primary key,
  caja_gasto_id     bigint references public.cajas_gastos(id) on delete cascade,
  obra_factura_id   bigint references public.obra_facturas(id) on delete set null,
  solicitud_id      bigint references public.compras_solicitudes(id) on delete cascade,
  nota              text,
  storage_path      text,
  nombre            text,
  subido_por        bigint,
  subido_por_nombre text,
  created_at        timestamptz not null default now(),
  constraint anexos_de_gasto_de_algo check (caja_gasto_id is not null or obra_factura_id is not null or solicitud_id is not null),
  constraint anexos_de_gasto_con_algo check (coalesce(btrim(nota), '') <> '' or storage_path is not null)
);

create index if not exists anexos_de_gasto_caja on public.anexos_de_gasto (caja_gasto_id) where caja_gasto_id is not null;
create index if not exists anexos_de_gasto_factura on public.anexos_de_gasto (obra_factura_id) where obra_factura_id is not null;
create index if not exists anexos_de_gasto_compra on public.anexos_de_gasto (solicitud_id) where solicitud_id is not null;

alter table public.anexos_de_gasto enable row level security;
do $$ begin
  create policy "equipo foreman" on public.anexos_de_gasto for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

comment on table public.anexos_de_gasto is
  'Lo que explica un gasto (para quién, para qué): texto y/o archivo. Se ve en el gasto de caja chica, en su factura del control y en la compra.';
