-- 138 · De qué proforma salió el precio de este renglón.
--
-- La proforma del proveedor no es un respaldo del presupuesto: es con lo que se
-- construyó. El renglón del presupuesto ya guarda su `precio_base` —lo que
-- cuesta— y su `utilidad_pct` —lo que se le suma para llegar al precio que
-- firma el cliente—. Esos dos números salieron de un papel de un proveedor, y
-- ese papel está guardado en `presupuesto_archivos`.
--
-- Lo que falta es el hilo entre los dos. Hoy se sabe que existen cuatro
-- proformas y que 851 renglones tienen costo, pero no cuál de las cuatro le dio
-- el costo a cuál renglón, ni con qué nombre venía ahí. Sin ese hilo:
--
--   · No se puede comparar una proforma nueva contra la que armó el
--     presupuesto. Lo único contra lo que se puede comparar es el precio al
--     cliente, que ya tiene la utilidad adentro: dos números distintos que
--     parecen el mismo.
--   · Cuando el proveedor sube el precio, nadie sabe cuánto subió de verdad:
--     se compara contra el precio de venta y la diferencia se lee como si la
--     utilidad hubiera desaparecido.
--   · Dos años después, nadie puede contestar por qué ese rubro vale eso.
--
-- `cotizacion_renglon` guarda el nombre tal como venía en la proforma, no el
-- que quedó en el presupuesto: son casi siempre distintos —"Vinil blanco
-- respaldo gris 260x415" contra "Vinil en fachada"— y el de la proforma es el
-- que permite emparejar la proforma siguiente.

alter table public.presupuesto_items
  add column if not exists cotizacion_archivo_id bigint references public.presupuesto_archivos(id) on delete set null,
  add column if not exists cotizacion_proveedor  text,
  add column if not exists cotizacion_renglon    text,
  add column if not exists cotizacion_cantidad   numeric(14,4),
  add column if not exists cotizacion_at         timestamptz;

create index if not exists presupuesto_items_cotizacion
  on public.presupuesto_items(cotizacion_archivo_id) where cotizacion_archivo_id is not null;

comment on column public.presupuesto_items.cotizacion_archivo_id is
  'La proforma con la que se armó el precio de este renglón. Es el papel que contesta por qué el rubro vale eso.';
comment on column public.presupuesto_items.cotizacion_renglon is
  'Cómo se llamaba el renglón en esa proforma. Es lo que permite emparejar la proforma siguiente del mismo proveedor.';
comment on column public.presupuesto_items.cotizacion_cantidad is
  'La cantidad que decía la proforma. Si la nueva trae otra, o cambió el alcance o alguien midió distinto, y eso se resuelve distinto.';
