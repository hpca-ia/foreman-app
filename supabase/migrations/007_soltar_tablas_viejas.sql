-- Suelta las llaves foráneas del control de obra viejo.
--
-- control_obra_presupuesto y control_obra_gastos son del prototipo anterior
-- al rediseño. Ya no las lee ni las escribe nadie —las reemplazaron obras,
-- obra_rubros, planillas, obra_facturas y obra_asignaciones— pero sus llaves
-- foráneas siguen apuntando a presupuestos, y eso impide borrar un
-- presupuesto que en la app se ve completamente libre.
--
-- Acá solo se sueltan las llaves: las tablas y sus filas quedan intactas. Si
-- más adelante confirmas que no hay nada que rescatar ahí, al final del
-- archivo están las dos líneas para borrarlas de verdad.

do $$
declare r record;
begin
  for r in
    select c.conname, t.relname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and c.contype = 'f'
      and t.relname in ('control_obra_presupuesto', 'control_obra_gastos')
  loop
    execute format('alter table public.%I drop constraint %I', r.relname, r.conname);
    raise notice 'Soltada: %.%', r.relname, r.conname;
  end loop;
end $$;

-- Cuando estés seguro de que no hay nada que rescatar, corre estas dos:
-- drop table if exists public.control_obra_gastos;
-- drop table if exists public.control_obra_presupuesto;
