-- 057 · Cerrar la base. Todas las tablas, sin excepción.
--
-- Supabase avisó lo que teníamos que haber visto antes: 17 de las 43 tablas
-- nunca tuvieron Row Level Security. Sin RLS, la llave pública que viaja en el
-- navegador —la que cualquiera lee mirando el código de la página— alcanza
-- para LEER, CAMBIAR y BORRAR esas tablas enteras desde afuera. Entre ellas:
--
--   usuarios            · el equipo entero con sus roles
--   obras, planillas    · el control de obra completo
--   obra_facturas       · las facturas con RUC, proveedor y montos
--   obra_rubros         · el presupuesto contratado de cada obra
--   proyectos, permisos_rol, proveedores…
--
-- Pasó por lo de siempre: cada migración nueva se acordaba de la política, y
-- las viejas —las primeras, cuando la app todavía no tenía login— nunca la
-- tuvieron. Que se arregle tabla por tabla garantiza que la próxima se vuelva
-- a olvidar, así que esto NO lista tablas: recorre todo lo que haya en
-- `public` y cierra lo que encuentre. Correrla de nuevo después de agregar
-- tablas las cierra también.
--
-- La política es la misma que ya usan las demás: entra quien tenga sesión de
-- Supabase Auth, que en FOREMAN significa haber pasado por el PIN. Sin sesión,
-- la base no contesta nada.
--
-- Lo que NO se rompe:
--   · El login. La lista de perfiles sale por /api/login, que corre en el
--     servidor con la llave de servicio, y esa llave pasa por encima de RLS.
--   · Los correos, el respaldo y los crons, por lo mismo.
--   · La app después de entrar: ahí ya hay sesión.

do $$
declare
  t record;
  cerradas int := 0;
begin
  for t in
    select c.relname as tabla
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'                     -- tablas de verdad, no vistas
       and c.relname not like 'pg\_%'
  loop
    -- Habilitar es idempotente: si ya estaba, no pasa nada.
    execute format('alter table public.%I enable row level security', t.tabla);

    -- Y que tenga política: RLS sin política no deja pasar ni al que sí puede,
    -- y eso se siente como "la app dejó de funcionar" en vez de como seguridad.
    execute format('drop policy if exists "equipo foreman" on public.%I', t.tabla);
    execute format(
      'create policy "equipo foreman" on public.%I for all to authenticated using (true) with check (true)',
      t.tabla);

    cerradas := cerradas + 1;
  end loop;

  raise notice 'RLS activo y con política en % tablas de public.', cerradas;
end $$;

-- Para comprobarlo de un vistazo: esta consulta no debe devolver ninguna fila.
--
--   select c.relname
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
