-- La actividad pasa a ser una entidad, no un texto pegado al rubro.
--
-- Hasta ahora "actividad" era una columna de texto en obra_rubros: servía
-- para agrupar y nada más. Ahora la actividad tiene código propio —numeración
-- independiente de la del presupuesto— y es a ella a la que se asignan las
-- facturas al armar una planilla.
--
-- Capítulo y actividad son dos vistas paralelas de los mismos rubros, no una
-- dentro de la otra: una actividad como "muebles" cruza carpintería, herrajes
-- e instalación. Por eso el total es el mismo y solo cambia el orden.

create table if not exists public.obra_actividades (
  id         bigserial primary key,
  obra_id    bigint      not null,
  codigo     text,                    -- numeración propia: A1, 01, lo que use la obra
  nombre     text        not null,
  orden      int         not null default 0,
  origen     text        not null default 'manual',   -- manual | nova
  created_at timestamptz not null default now()
);
create index if not exists obra_actividades_obra on public.obra_actividades (obra_id);

alter table public.obra_rubros add column if not exists actividad_id bigint;
create index if not exists obra_rubros_actividad on public.obra_rubros (actividad_id);

-- Asignación de plata. Antes solo se podía apuntar a un rubro; ahora también
-- a una actividad, que es como se planilla. Una fila apunta a uno u otro.
create table if not exists public.obra_asignaciones (
  id                 bigserial primary key,
  factura_id         bigint not null,
  obra_rubro_id      bigint,
  obra_actividad_id  bigint,
  monto              numeric(14,2) not null default 0,
  created_at         timestamptz not null default now(),
  constraint obra_asignaciones_destino check (
    (obra_rubro_id is not null) <> (obra_actividad_id is not null)
  )
);
create index if not exists obra_asignaciones_factura on public.obra_asignaciones (factura_id);

-- ── Traer lo que ya existe ───────────────────────────────────────────────
-- Las actividades que se hayan creado como texto se convierten en filas, y
-- los rubros quedan apuntando a ellas. El código arranca correlativo.
insert into public.obra_actividades (obra_id, codigo, nombre, orden)
select r.obra_id,
       lpad((row_number() over (partition by r.obra_id order by min(r.actividad_orden), r.actividad))::text, 2, '0'),
       r.actividad,
       row_number() over (partition by r.obra_id order by min(r.actividad_orden), r.actividad)
from public.obra_rubros r
where r.actividad is not null and r.actividad <> ''
group by r.obra_id, r.actividad
on conflict do nothing;

update public.obra_rubros r
set actividad_id = a.id
from public.obra_actividades a
where a.obra_id = r.obra_id and a.nombre = r.actividad and r.actividad_id is null;

-- Las asignaciones a rubro que ya existían se conservan tal cual: son datos
-- de factura, no se reinterpretan.
insert into public.obra_asignaciones (factura_id, obra_rubro_id, monto)
select factura_id, obra_rubro_id, monto
from public.obra_factura_rubros
on conflict do nothing;
