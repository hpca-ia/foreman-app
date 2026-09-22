-- 035 · Tareas con más de un responsable, y tareas que dependen de otras.
--
-- Hasta ahora una tarea tenía un solo responsable. En obra casi nunca es así:
-- el plano lo hacen dos, la inspección la hacen el residente y el arquitecto.
-- El "assignee_id" se queda como el principal —de él son los recordatorios y
-- las cuentas de carga— y acá van los demás.
--
-- Las dependencias son lo que hoy se resuelve por WhatsApp: "no puedo hacer el
-- plano hasta que me pasen el levantamiento". Quien tiene la tarea crea la
-- tarea que le falta, a nombre de quien corresponda, y la suya queda esperando.
-- Cuando la otra se completa, la que esperaba se destraba sola.

create table if not exists public.tarea_responsables (
  task_id     bigint      not null references public.tasks(id) on delete cascade,
  usuario_id  bigint      not null,
  created_at  timestamptz not null default now(),
  primary key (task_id, usuario_id)
);

create table if not exists public.tarea_dependencias (
  id           bigserial   primary key,
  task_id      bigint      not null references public.tasks(id) on delete cascade,  -- la que espera
  depende_de   bigint      not null references public.tasks(id) on delete cascade,  -- la que tiene que pasar primero
  creada_por   bigint,
  created_at   timestamptz not null default now(),
  unique (task_id, depende_de)
);

create index if not exists tarea_dependencias_depende on public.tarea_dependencias (depende_de);

alter table public.tarea_responsables enable row level security;
drop policy if exists "equipo foreman" on public.tarea_responsables;
create policy "equipo foreman" on public.tarea_responsables for all to authenticated using (true) with check (true);

alter table public.tarea_dependencias enable row level security;
drop policy if exists "equipo foreman" on public.tarea_dependencias;
create policy "equipo foreman" on public.tarea_dependencias for all to authenticated using (true) with check (true);
