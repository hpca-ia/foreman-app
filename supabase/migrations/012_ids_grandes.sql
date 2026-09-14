-- Amplía a bigint las columnas que guardan a qué usuario o proyecto se refiere algo.
--
-- Los usuarios y proyectos nuevos se crean con un id de 13 dígitos. Varias
-- tablas viejas guardaban esa referencia como `integer`, que llega solo hasta
-- 2.147.483.647, así que no se podía:
--   · crear una tarea en un proyecto nuevo ("Prueba sync"),
--   · asignarle una tarea a un usuario nuevo, ni que ese usuario creara una,
--   · usar un usuario nuevo en caja chica, anticipos, gastos o presupuestos.
--
-- Confirmadas como integer al momento de escribir esto: tasks.project_id,
-- tasks.assignee_id, tasks.created_by, cajas_chicas.responsable_id,
-- cajas_chicas.created_by, cajas_anticipos.entregado_por, cajas_gastos.subido_por,
-- presupuestos.created_by y comments.user_id.
--
-- En vez de listarlas a mano, se buscan todas las columnas integer con esos
-- nombres, para no dejar ninguna afuera. Pasar de integer a bigint no cambia
-- ningún dato. Si algo falla, falla toda la migración y no queda a medias.

do $$
declare r record;
begin
  for r in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and data_type = 'integer'
      and column_name in (
        'project_id', 'assignee_id', 'created_by', 'responsable_id',
        'entregado_por', 'subido_por', 'aprobado_por', 'user_id',
        'autor_id', 'usuario_id', 'gerente_id'
      )
  loop
    execute format('alter table public.%I alter column %I type bigint', r.table_name, r.column_name);
    raise notice 'Ampliada: %.%', r.table_name, r.column_name;
  end loop;
end $$;
