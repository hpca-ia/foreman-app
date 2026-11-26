-- 194 · Las cotizaciones de un presupuesto, guardadas para compararlas.
--
-- Hernán, 26/11/2026: «Al armar presupuestos se cotiza de distintas empresas y
-- vienen distintos presupuestos... ¿cómo se puede comparar los distintos
-- presupuestos recibidos y posterior a eso escoger la mejor opción para que
-- ingrese al presupuesto? Una especie de matriz». «Y no solo por rubros,
-- porque cada empresa puede cotizar de manera distinta o nombrar distinto.»
--
-- Hasta ahora la cotización de un proveedor se leía, se aplicaba al
-- presupuesto y se descartaba: quedaba el archivo en `presupuesto_archivos` y
-- el precio en los rubros, pero no lo que la empresa había cotizado renglón
-- por renglón. La siguiente cotización pisaba esos precios, y no había con
-- qué poner dos empresas una al lado de la otra.
--
-- Acá queda cada cotización SIN ENTRAR al presupuesto:
--
--   · renglones   lo que cotizó la empresa, con sus palabras:
--                 [{ descripcion, unidad, cantidad, precio_unitario, total,
--                    items: [id de presupuesto_items, …] }]
--                 `items` son los rubros del presupuesto que cubre ese
--                 renglón: uno, si cotizó renglón por renglón; varios, si es
--                 un paquete; ninguno, si no calza con nada.
--   · totales     el pie de su papel, como está escrito: { subtotal, iva, total, … }
--   · elegidos    los rubros del presupuesto que se le adjudicaron: [id, …]
--   · aplicada_at cuándo lo elegido entró al presupuesto.
--
-- El precio de cada rubro sigue viviendo en `presupuesto_items`, con de qué
-- papel salió (migración 138). Esta tabla no cambia ningún presupuesto: nace
-- vacía. Se puede correr más de una vez.

create table if not exists public.presupuesto_cotizaciones (
  id              bigserial   primary key,
  presupuesto_id  bigint      not null references public.presupuestos(id) on delete cascade,
  proveedor       text        not null default '',
  archivo_id      bigint      references public.presupuesto_archivos(id) on delete set null,
  renglones       jsonb       not null default '[]'::jsonb,
  totales         jsonb,
  elegidos        jsonb       not null default '[]'::jsonb,
  aplicada_at     timestamptz,
  creado_por      bigint,
  creado_nombre   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists presupuesto_cotizaciones_presupuesto
  on public.presupuesto_cotizaciones (presupuesto_id, created_at);

alter table public.presupuesto_cotizaciones enable row level security;
drop policy if exists "equipo foreman" on public.presupuesto_cotizaciones;
create policy "equipo foreman" on public.presupuesto_cotizaciones for all to authenticated using (true) with check (true);

comment on table public.presupuesto_cotizaciones is
  'Las cotizaciones recibidas para un presupuesto, guardadas sin aplicar, para compararlas en una matriz y elegir cuál entra.';
comment on column public.presupuesto_cotizaciones.renglones is
  'Lo que cotizó la empresa: [{ descripcion, unidad, cantidad, precio_unitario, total, items: [id de presupuesto_items] }]. Varios items en un renglón es un paquete.';
comment on column public.presupuesto_cotizaciones.elegidos is
  'Los rubros del presupuesto adjudicados a esta cotización: [id de presupuesto_items].';
