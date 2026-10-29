-- 133 · El visto de la orden de cambio, pedido de verdad.
--
-- "Pedir aprobación al Director" marcaba una fecha en la orden y no avisaba a
-- nadie: el Director se enteraba porque alguien se acordaba de escribirle. Es
-- el mismo agujero que tenía el acta, y pesa más acá — lo que espera no es un
-- documento, es un precio que todavía no salió de la oficina, y mientras tanto
-- el trabajo no se ejecuta.
--
-- Ahora el pedido es una tarea de aprobación como la de una compra: va al
-- tablero de quien tiene que darlo, le llega el correo con la orden en PDF, y
-- se contesta desde el teléfono. Para eso la tarea tiene que saber de qué
-- orden habla.
--
-- Y POR QUÉ NO UN ESTADO MÁS EN LA ORDEN: `estado` cuenta dónde está la orden
-- frente al CLIENTE —borrador, enviada, aprobada, rechazada— y el visto es un
-- paso interno. Metido ahí, mezcla dos conversaciones en una sola columna y
-- una orden "en revisión" no se sabría si la revisa la oficina o el cliente.

alter table public.tasks
  add column if not exists orden_cambio_id bigint references public.ordenes_cambio(id) on delete cascade;

create index if not exists tasks_orden_cambio_idx
  on public.tasks(orden_cambio_id) where orden_cambio_id is not null;

comment on column public.tasks.orden_cambio_id is
  'La orden de cambio cuyo visto interno pide esta tarea. Al aprobarla queda el visto; al devolverla, lo que hay que corregir antes de que el precio salga al cliente.';
