-- De dónde viene cada precio de la base de rubros.
--
-- Para hacer ingeniería de costos no alcanza con saber cuánto costó un rubro:
-- hay que saber si ese precio es lo que HCA le cotizó a un cliente o lo que un
-- proveedor o contratista le cobra a HCA, de quién, en qué obra y en qué
-- unidad. Hasta ahora solo quedaba un "cliente" escrito a mano, y a veces ni
-- eso (los precios de SOLEK entraron sin cliente).

alter table public.precios_historial
  add column if not exists origen_tipo      text check (origen_tipo in ('cliente', 'proveedor')),
  add column if not exists proveedor_nombre text,
  add column if not exists unidad           text,
  add column if not exists capitulo         text,
  add column if not exists cantidad         numeric,
  add column if not exists iva_incluido     boolean,
  add column if not exists fuente           text,     -- 'obra' | 'alimentar'
  add column if not exists obra_id          bigint,
  -- Quitar un precio de la base no lo borra: deja de contar en los promedios.
  add column if not exists anulado          boolean not null default false,
  add column if not exists anulado_motivo   text;

create table if not exists public.proveedores (
  id           bigserial primary key,
  nombre       text not null unique,
  ruc          text,
  especialidad text,
  created_at   timestamptz not null default now()
);

-- Lo que ya había con un cliente escrito es precio de cliente.
update public.precios_historial
   set origen_tipo = 'cliente'
 where origen_tipo is null
   and coalesce(trim(cliente_nombre), '') <> '';

-- Unidad y capítulo desde el rubro, para poder filtrar también lo viejo.
update public.precios_historial h
   set unidad = r.unidad, capitulo = c.nombre
  from public.rubros r
  left join public.capitulos c on c.id = r.capitulo_id
 where h.rubro_id = r.id
   and h.unidad is null;

-- Los proveedores que ya aparecen en las facturas de obra.
insert into public.proveedores (nombre, ruc)
select distinct on (upper(trim(razon_social))) trim(razon_social), ruc
  from public.obra_facturas
 where coalesce(trim(razon_social), '') <> ''
on conflict (nombre) do nothing;
