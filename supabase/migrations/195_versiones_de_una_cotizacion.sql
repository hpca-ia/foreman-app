-- 195 · Las versiones de una cotización.
--
-- Hernán, 26/11/2026: «estos presupuestos van a tener actualizaciones...
-- quiero poder actualizar y volver a escoger por si cambiamos de
-- especificación, cantidad o negociación. Entonces puede ir al presupuesto
-- pero se puede regresar a ver nuevas versiones».
--
-- Una empresa manda su cotización de nuevo. En la 194 eso era una columna más
-- en la matriz, sin relación con la anterior: había que quitar la vieja a
-- mano, y con ella se iba lo que se había corregido y elegido.
--
-- Ahora la nueva REEMPLAZA a la anterior y la anterior queda guardada:
--
--   · version         1, 2, 3… de la misma empresa en este presupuesto.
--   · reemplaza_a     la versión anterior, la que esta vino a reemplazar.
--   · reemplazada_at  cuándo dejó de ser la vigente. La matriz compara solo
--                     las que no tienen esta fecha.
--
-- Las cotizaciones que ya existen quedan como versión 1, vigentes. No cambia
-- ningún presupuesto. Se puede correr más de una vez.

alter table public.presupuesto_cotizaciones
  add column if not exists version        integer     not null default 1,
  add column if not exists reemplaza_a    bigint      references public.presupuesto_cotizaciones(id) on delete set null,
  add column if not exists reemplazada_at timestamptz;

comment on column public.presupuesto_cotizaciones.version is
  'El número de versión de la cotización de esta empresa en este presupuesto: 1, 2, 3…';
comment on column public.presupuesto_cotizaciones.reemplaza_a is
  'La versión anterior de la misma empresa, que esta reemplazó.';
comment on column public.presupuesto_cotizaciones.reemplazada_at is
  'Cuándo una versión más nueva la reemplazó. Null: es la vigente, la que se compara en la matriz.';
