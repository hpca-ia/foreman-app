-- 189 · El WhatsApp que FOREMAN le manda a un cliente: de qué pedido era y si llegó.
--
-- Hernán, 18/11/2026: «es importante ya integrar WhatsApp». Al pedirle una
-- aprobación al cliente, FOREMAN le escribe desde su número con una plantilla
-- aprobada por Meta. Meta acepta el mensaje y avisa DESPUÉS —a veces segundos,
-- a veces minutos— si se entregó, si lo leyó o si no pudo llegar (un número
-- sin WhatsApp no da error al mandar: da error en ese aviso).
--
-- Para que el registro de aprobaciones pueda decir «entregado», «leído» o «no
-- llegó», cada mensaje que sale tiene que saber de qué pedido era. La tabla de
-- mensajes (migración 025) guardaba solo el teléfono y el texto, que alcanzaba
-- para NOVA conversando con el equipo.
--
--   · lead_id, task_id, aprobacion_id — de qué proyecto, punto y pedido del
--                                       registro era el aviso.
--   · para_nombre                     — a quién se le escribió.
--   · plantilla                       — con qué plantilla salió.
--   · estado, estado_at, error        — enviado | entregado | leido | fallo,
--                                       cuándo cambió, y por qué no llegó.
--
-- Todas nacen vacías y los mensajes que ya hay no cambian. La tabla sigue
-- cerrada: la escribe y la lee solo el servidor. Se puede correr más de una vez.

alter table public.whatsapp_mensajes
  add column if not exists lead_id       bigint,
  add column if not exists task_id       bigint,
  add column if not exists aprobacion_id bigint,
  add column if not exists para_nombre   text,
  add column if not exists plantilla     text,
  add column if not exists estado        text,
  add column if not exists estado_at     timestamptz,
  add column if not exists error         text;

-- Los avisos de un proyecto, para mostrarlos en su registro de aprobaciones.
create index if not exists whatsapp_mensajes_lead_idx
  on public.whatsapp_mensajes (lead_id, created_at desc) where lead_id is not null;

comment on column public.whatsapp_mensajes.aprobacion_id is
  'El pedido del registro de aprobaciones (aprobaciones_cliente.id) por el que se le escribió al cliente. Null en las conversaciones con NOVA.';
comment on column public.whatsapp_mensajes.estado is
  'Qué pasó con un mensaje que salió por plantilla: enviado | entregado | leido | fallo. Lo va cambiando el aviso de entrega de Meta.';
comment on column public.whatsapp_mensajes.error is
  'Por qué no llegó, cuando el estado es fallo.';
