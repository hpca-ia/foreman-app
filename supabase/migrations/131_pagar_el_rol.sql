-- 131 · El rol se cierra, se paga persona por persona, y lo pagado va al control.
--
-- Hasta ahora el rol se calculaba en pantalla y se imprimía, pero no quedaba
-- guardado ni se podía decir que se pagó. Las tablas para eso ya estaban
-- desde la 075 (obra_roles, obra_rol_lineas) y nadie las usaba.
--
-- Lo que falta es el pago. Se paga persona por persona, porque así se paga: a
-- uno el viernes, a otro el lunes cuando aparece, al maestro cuando trae su
-- factura. Cada pago entra al control de obra como un gasto de mano de obra
-- por lo que se pagó, sin asignar, y ahí se reparte en rubros.
--
-- El respaldo puede ser el rol firmado o una factura. Una factura puede cubrir
-- a varias personas —el contratista que factura su cuadrilla—, así que varias
-- líneas pueden apuntar al mismo gasto.

alter table public.obra_rol_lineas
  add column if not exists cedula          text,
  add column if not exists pagado_at       timestamptz,
  add column if not exists pago_fecha      date,
  add column if not exists pago_forma      text,
  add column if not exists pago_referencia text,
  add column if not exists soporte         text,     -- rol | factura
  add column if not exists obra_factura_id bigint references public.obra_facturas(id) on delete set null,
  add column if not exists pagado_por      bigint,
  add column if not exists pagado_nombre   text;

create index if not exists rol_lineas_por_gasto
  on public.obra_rol_lineas (obra_factura_id) where obra_factura_id is not null;

alter table public.obra_roles
  add column if not exists numero int;

comment on column public.obra_rol_lineas.obra_factura_id is
  'El gasto que este pago creó en el control de obra. Varias líneas pueden compartirlo si una factura cubrió a varias personas.';
comment on column public.obra_rol_lineas.soporte is
  'Con qué papel se respalda el pago: rol (el recibo firmado) o factura.';
