-- Comentarios en las tareas.
--
-- Lo que hoy se pierde en un WhatsApp suelto: "no puedo avanzar porque no me
-- han dado el plano". Eso no es un cambio de estado ni una tarea nueva, es lo
-- que hay que decirle al resto, y tiene que quedar pegado a la tarea para que
-- el que llegue después entienda por qué está parada.

create table if not exists public.tarea_comentarios (
  id           bigserial primary key,
  task_id      bigint not null,
  texto        text   not null,
  autor_id     bigint,
  autor_nombre text,
  created_at   timestamptz not null default now()
);
create index if not exists tarea_comentarios_task on public.tarea_comentarios (task_id, created_at);

alter table public.tarea_comentarios enable row level security;
drop policy if exists "equipo foreman" on public.tarea_comentarios;
create policy "equipo foreman" on public.tarea_comentarios
  for all to authenticated using (true) with check (true);
