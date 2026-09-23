-- 038 · Tareas que piden una aprobación, y la prueba de lo que se hizo.
--
-- Pedir una aprobación es pedir una tarea: alguien tiene que mirar algo y
-- decir sí o no. Por eso no es otra cosa distinta, es la misma tarea marcada
-- como pedido de aprobación: vive en la misma lista, con su fecha y su
-- responsable, pero en vez de completarse se aprueba o se devuelve. Queda
-- anotado quién decidió, cuándo y qué dijo, que es justo lo que después nadie
-- recuerda.
--
-- Y al completar una tarea se puede dejar la prueba: la foto de lo que se
-- hizo, el PDF firmado o el enlace a donde quedó. Los archivos ya viven en el
-- depósito; acá va el enlace, para lo que está en Drive o en Dropbox.

alter table public.tasks add column if not exists es_aprobacion      boolean not null default false;
alter table public.tasks add column if not exists aprobacion_estado  text;      -- pendiente | aprobada | devuelta
alter table public.tasks add column if not exists aprobacion_por     bigint;
alter table public.tasks add column if not exists aprobacion_nombre  text;
alter table public.tasks add column if not exists aprobacion_at      timestamptz;
alter table public.tasks add column if not exists aprobacion_nota    text;
alter table public.tasks add column if not exists prueba_enlace      text;
