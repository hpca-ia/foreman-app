-- 053 · Cuándo se tocó cada tarea.
--
-- El resumen de la mañana cuenta lo que cada uno cerró ayer, y para eso hace
-- falta saber cuándo se cerró. `tasks` no tenía esa marca: la consulta del
-- resumen pedía `updated_at`, PostgREST devolvía un error, y el correo salía
-- con una "tarea" fantasma sin título —que era el error disfrazado de fila—.
--
-- Las que ya existen arrancan con la fecha en que se crearon: es lo más honesto
-- que se puede decir de ellas hoy.

alter table public.tasks add column if not exists updated_at timestamptz;
update public.tasks set updated_at = coalesce(updated_at, created_at, now()) where updated_at is null;
alter table public.tasks alter column updated_at set default now();

create or replace function public.tasks_tocar() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists tasks_tocar on public.tasks;
create trigger tasks_tocar before update on public.tasks
  for each row execute function public.tasks_tocar();
