-- 186 · El cliente aprueba un punto del checklist desde su enlace.
--
-- Hernán, 17/11/2026: «¿dónde se sube archivos relacionados? Estos debe poder
-- ver cliente para que apruebe». Los archivos de cada punto ya se le muestran
-- en su enlace; lo que faltaba era el «apruebo», que quedaba en un WhatsApp.
--
-- A un punto que el cliente ve se le puede pedir la aprobación. En su enlace
-- le aparecen dos botones en ese punto —«Lo apruebo» y «Tengo una
-- observación»—, y lo que contesta queda en el punto con su fecha. Contesta
-- una vez: si algo se corrigió, es el equipo el que vuelve a pedirle.
--
-- Cuatro datos más en la tarea, que es el punto:
--
--   · `cliente_aprueba`         — si se le pidió al cliente que lo apruebe.
--   · `cliente_respuesta`       — qué contestó: 'aprobado' u 'observado'.
--                                 Vacío mientras no conteste.
--   · `cliente_respuesta_at`    — cuándo contestó.
--   · `cliente_respuesta_nota`  — lo que escribió: obligatorio si observa.
--
-- No borra ni cambia ningún dato existente: ningún punto queda pidiendo
-- aprobación. Se puede correr más de una vez.

alter table public.tasks
  add column if not exists cliente_aprueba boolean not null default false,
  add column if not exists cliente_respuesta text,
  add column if not exists cliente_respuesta_at timestamptz,
  add column if not exists cliente_respuesta_nota text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_cliente_respuesta_valida') then
    alter table public.tasks add constraint tasks_cliente_respuesta_valida
      check (cliente_respuesta is null or cliente_respuesta in ('aprobado', 'observado'));
  end if;
end $$;

comment on column public.tasks.cliente_aprueba is
  'Si se le pidió al cliente que apruebe este punto desde su enlace. Falso por defecto.';
comment on column public.tasks.cliente_respuesta is
  'Qué contestó el cliente: aprobado u observado. Null mientras no conteste, y cuando se le vuelve a pedir.';
comment on column public.tasks.cliente_respuesta_at is
  'Cuándo contestó el cliente.';
comment on column public.tasks.cliente_respuesta_nota is
  'Lo que escribió el cliente al contestar. Obligatorio si deja observaciones.';
