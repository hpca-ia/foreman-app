-- Cerrar la base: solo responde a quien entró a FOREMAN.
--
-- ⚠️ Correr SOLO cuando el ingreso por servidor ya funcione en producción y
-- cada persona haya podido entrar con su PIN. Si se corre antes, la app deja
-- de ver los datos.
--
-- Activa Row Level Security en todas las tablas y deja una sola regla: quien
-- tiene sesión (authenticated) puede leer y escribir; la llave pública sola
-- (anon) no ve ni toca nada. Las reglas por rol —que un residente no vea
-- montos aunque lo intente desde afuera de la app— son el paso siguiente.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('drop policy if exists "equipo foreman" on public.%I', t.tablename);
    execute format('create policy "equipo foreman" on public.%I for all to authenticated using (true) with check (true)', t.tablename);
  end loop;
end $$;

-- Para volver atrás si algo sale mal (abre la base de nuevo):
--
-- do $$
-- declare t record;
-- begin
--   for t in select tablename from pg_tables where schemaname = 'public' loop
--     execute format('alter table public.%I disable row level security', t.tablename);
--   end loop;
-- end $$;
