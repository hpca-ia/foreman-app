-- 122 · Los extras de cada capítulo.
--
-- Hay clientes que mandan su presupuesto con una línea "Extras (describir)"
-- al final de cada capítulo: debajo van rubros que no estaban en lo que se
-- pidió y que suman aparte, para que se vea cuánto es lo pedido y cuánto lo
-- que se agrega.
--
-- "extra" marca ese rubro. Sigue siendo un rubro del capítulo —se cobra, lleva
-- honorarios e IVA—; lo que cambia es que se muestra y se suma aparte.

alter table public.presupuesto_items add column if not exists extra boolean not null default false;
