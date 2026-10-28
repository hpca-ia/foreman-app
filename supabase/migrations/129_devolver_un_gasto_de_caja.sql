-- 129 · Devolver un gasto de caja chica mal ingresado.
--
-- Hasta ahora un gasto solo podía estar pendiente o aprobado, y administración
-- tenía dos salidas igual de malas: aprobar algo que está mal cargado —la foto
-- ilegible, el proveedor equivocado, el monto que no es el del papel— o
-- dejarlo pendiente para siempre, sin que quien lo cargó se entere de por qué.
--
-- La tercera salida es la que se usa en la obra todos los días: devolverlo.
-- Vuelve a quien lo cargó, con el motivo escrito, y no se da por bueno hasta
-- que lo corrija y administración lo acepte.
--
-- El gasto NO desaparece mientras tanto: la plata salió igual, y esconderlo
-- del control haría que la caja cuadre contra un gasto que existe. Lo que
-- queda en duda es el documento, no la salida.

alter table public.cajas_gastos
  add column if not exists devuelto_motivo text,
  add column if not exists devuelto_por    bigint,
  add column if not exists devuelto_nombre text,
  add column if not exists devuelto_at     timestamptz;

comment on column public.cajas_gastos.devuelto_motivo is
  'Por qué administración lo devolvió. Se borra cuando quien lo cargó lo corrige y vuelve a quedar pendiente.';
comment on column public.cajas_gastos.estado is
  'pendiente · aprobado · devuelto. Devuelto es "está mal cargado, corregilo": sigue contando como gasto, pero no se puede rendir.';
