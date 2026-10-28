-- 127 · Qué trae cada factura, renglón por renglón.
--
-- Una factura guarda cuánto se gastó y un `detalle` en texto libre. No guarda
-- QUÉ se compró, y la pregunta de mitad de obra —"¿cuántos cascos llevamos?",
-- "¿otra vez cuerda?"— no se puede contestar sumando textos. NOVA ya lee los
-- renglones al cargar la factura, pero se usaban para repartirla entre rubros
-- y se tiraban.
--
-- Esta tabla es la base de la bodega: lo que se compró. Lo que llegó a la obra
-- (bodega_ingresos) y lo que salió vienen después, y se cuentan contra esto.
--
-- `cantidad` y `total` van con el signo de la factura: una nota de crédito que
-- devuelve dos cascos resta dos cascos. Si entraran en positivo, devolver
-- material haría que pareciera que se compró más.
--
-- `clave` y `familia` se guardan ya calculadas (las calcula la app, con
-- itemsComprados.js) para poder sumar por familia sin traer todos los textos.

create table if not exists public.obra_factura_items (
  id              bigserial primary key,
  factura_id      bigint not null references public.obra_facturas(id) on delete cascade,
  obra_id         bigint not null,
  orden           int not null default 0,
  cantidad        numeric(14,3) not null default 0,
  unidad          text,
  descripcion     text not null,
  precio_unitario numeric(14,4),
  total           numeric(14,2) not null default 0,
  clave           text,
  familia         text,
  created_at      timestamptz not null default now()
);
create index if not exists obra_factura_items_factura on public.obra_factura_items (factura_id);
create index if not exists obra_factura_items_obra    on public.obra_factura_items (obra_id, familia);

-- Si la factura ya se leyó. Sin esto, una factura ilegible (un recibo escrito
-- a mano) se vuelve a mandar a NOVA cada vez que alguien aprieta "leer las que
-- faltan", y se paga cada vez por la misma respuesta.
--   null      · todavía no se leyó
--   leida     · tiene sus renglones
--   ilegible  · NOVA no pudo sacar renglones; no se reintenta sola
alter table public.obra_facturas add column if not exists renglones_estado text;
alter table public.obra_facturas add column if not exists renglones_at     timestamptz;

alter table public.obra_factura_items enable row level security;
drop policy if exists "equipo foreman" on public.obra_factura_items;
create policy "equipo foreman" on public.obra_factura_items
  for all to authenticated using (true) with check (true);
