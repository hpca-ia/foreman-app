-- 188 · La fecha límite para que el cliente apruebe.
--
-- Hernán, 18/11/2026: «¿hay cómo poner una fecha límite en que el cliente debe
-- aprobar?». No había: el punto tiene su «¿para cuándo?», pero es una fecha
-- interna, que el cliente no ve y que no dice que sea su plazo. Las órdenes de
-- cambio sí tienen fecha límite de aprobación; estas aprobaciones no.
--
-- Lo que definió cuando llega la fecha y el cliente no contestó: «marcar
-- vencida y avisarme» —en el punto y en el registro, y en el panel de avisos y
-- el correo de la mañana—. No se da por aprobado solo, y el cliente puede
-- seguir contestando después.
--
--   · `tasks.cliente_aprueba_hasta`     — hasta qué día tiene para aprobar el
--                                         pedido que hoy está abierto.
--   · `aprobaciones_cliente.vence_el`   — el plazo de CADA pedido, que queda en
--                                         el registro aunque después se le
--                                         vuelva a pedir con otra fecha.
--
-- Las dos nacen vacías: ningún pedido queda con fecha límite. No cambia ningún
-- dato existente. Se puede correr más de una vez.

alter table public.tasks
  add column if not exists cliente_aprueba_hasta date;

alter table public.aprobaciones_cliente
  add column if not exists vence_el date;

comment on column public.tasks.cliente_aprueba_hasta is
  'Hasta qué día tiene el cliente para aprobar el pedido abierto de este punto. Null si no se le puso plazo.';
comment on column public.aprobaciones_cliente.vence_el is
  'La fecha límite que se le dio al cliente en este pedido. Null si no se le puso plazo.';
