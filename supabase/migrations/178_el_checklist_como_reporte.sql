-- 178 · El checklist que ve el cliente, como reporte.
--
-- Con la 176 el cliente ve de cada tarea qué dice y si está lista. Para que
-- sirva de reporte le faltan dos cosas que el título no dice:
--
--   cliente_descripcion     qué es ese punto, dicho para él.
--   cliente_actualizacion   qué hay de nuevo: «llegaron dos cotizaciones, falta
--                           la de Alumina». Con la fecha en que se escribió,
--                           para que se lea cuán fresca es.
--
-- Son textos PARA EL CLIENTE y están aparte a propósito: la nota de la tarea
-- (`nota`) y sus comentarios son internos y no viajan nunca.
--
-- No toca ninguna fila que ya exista. Se puede correr más de una vez.

alter table public.tasks add column if not exists cliente_descripcion     text;
alter table public.tasks add column if not exists cliente_actualizacion   text;
alter table public.tasks add column if not exists cliente_actualizado_at  timestamptz;

comment on column public.tasks.cliente_descripcion is 'Qué es este punto, dicho para el cliente. Lo ve en su enlace si la tarea está a su vista.';
comment on column public.tasks.cliente_actualizacion is 'Qué hay de nuevo en este punto, para el cliente. No es la nota interna.';
comment on column public.tasks.cliente_actualizado_at is 'Cuándo se escribió la última actualización para el cliente.';
