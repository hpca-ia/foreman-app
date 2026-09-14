-- Tareas privadas.
--
-- Los miembros de un proyecto ven las tareas de sus compañeros: si dos
-- personas comparten una obra, necesitan saber qué hace la otra para no
-- comprar dos veces el cemento o no esperar algo que nadie está haciendo.
--
-- Pero hay tareas que no se comparten aunque sean del mismo proyecto: un tema
-- de sueldo, una negociación con un proveedor, algo sobre otra persona del
-- equipo. Un admin las marca como privadas y quedan visibles solo para los
-- admins y para quien la tiene asignada.

alter table public.tasks add column if not exists privada boolean not null default false;
