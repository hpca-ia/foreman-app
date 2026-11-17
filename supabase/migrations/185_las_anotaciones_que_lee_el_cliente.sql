-- 185 · Las anotaciones de un punto que el cliente lee en su enlace.
--
-- Hernán, 17/11/2026, mirando RES BG: «cliente debe ver las actualizaciones
-- de cada uno». Ese día había anotado en dos puntos lo que pasó —«Se recibe
-- presupuesto y diseño BASE», «Se recibe diseño preliminar, se envía para
-- correcciones»— y en el enlace del cliente no aparecía ninguna de las dos.
--
-- Había dos lugares donde escribir: el historial del punto, que es interno, y
-- una «actualización para el cliente» aparte (`tasks.cliente_actualizacion`,
-- migración 178), que en toda la base nadie llenó nunca. Ahora es uno solo:
-- se anota en el punto, y la anotación dice si la lee el cliente.
--
--   · `visible_cliente` — si el cliente la lee en su enlace, debajo del punto
--     y con su fecha. Nace en falso: lo ya anotado sigue siendo interno hasta
--     que alguien decide mostrarlo. Una anotación solo viaja si además el
--     punto se le muestra al cliente.
--
-- Y UN DATO: las dos anotaciones de RES BG de ese día quedan marcadas para el
-- cliente, que es lo que él pidió ver. Son las únicas dos anotaciones de toda
-- la base escritas en un punto que un cliente ve. Solo se marcan si el punto
-- sigue a la vista del cliente. Nada más cambia.
--
-- Se puede correr más de una vez.

alter table public.tarea_comentarios
  add column if not exists visible_cliente boolean not null default false;

-- Lo que pide el enlace del cliente: lo marcado de sus puntos.
create index if not exists tarea_comentarios_del_cliente
  on public.tarea_comentarios (task_id, created_at desc) where visible_cliente;

comment on column public.tarea_comentarios.visible_cliente is
  'Si el cliente lee esta anotación en su enlace, debajo del punto. Falso por defecto: lo anotado es interno hasta que se decide mostrarlo.';

-- RES BG, 17/11/2026: «FOGA» (12) y «Revision de Electrica» (13).
update public.tarea_comentarios c
   set visible_cliente = true
  from public.tasks t
 where t.id = c.task_id
   and t.visible_cliente = true
   and t.lead_id = 13
   and c.id in (12, 13)
   and c.visible_cliente = false;
