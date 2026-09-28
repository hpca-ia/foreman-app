-- 055 · En este proyecto, esta persona, en cada área.
--
-- Un solo nivel por proyecto no alcanza para lo que se pide en la práctica: el
-- residente trabaja el control de obra y el libro, pero el presupuesto lo mira;
-- la arquitecta trabaja el presupuesto y del control de obra no tiene por qué
-- ver los montos. Con una sola llave había que elegir entre darle todo o
-- dejarlo afuera de todo.
--
-- Cada área dice lo suyo y nada se hereda. Un "igual que el proyecto" guardado
-- como null obligaba a mirar dos columnas para saber qué permitía una fila, y
-- en pantalla salía un botón que no decía lo que iba a pasar.
--
--   nivel, nivel_presupuesto, nivel_obra, nivel_libro
--     'no'     · no entra: no lo ve ni le aparece en su lista
--     'ver'    · lo lee y no lo toca
--     'editar' · lo trabaja
--
-- Las cuatro en 'no' no existen: esa fila se borra, porque una fila que no
-- permite nada solo sirve para confundir.
--
-- Correrla dos veces no hace daño.

alter table public.lead_accesos add column if not exists nivel             text;
alter table public.lead_accesos add column if not exists nivel_presupuesto text;
alter table public.lead_accesos add column if not exists nivel_obra        text;
alter table public.lead_accesos add column if not exists nivel_libro       text;

-- Las filas de antes: el nivel del proyecto vale para todas las áreas, que es
-- justo lo que ya venía pasando. Nadie gana ni pierde permisos con esto.
update public.lead_accesos set nivel = 'editar' where nivel is null;
update public.lead_accesos set nivel_presupuesto = nivel where nivel_presupuesto is null;
update public.lead_accesos set nivel_obra        = nivel where nivel_obra        is null;
update public.lead_accesos set nivel_libro       = nivel where nivel_libro       is null;

-- Un valor que la app no sabe leer es un permiso que nadie puede explicar.
do $$
begin
  alter table public.lead_accesos drop constraint if exists lead_accesos_niveles;
  alter table public.lead_accesos add constraint lead_accesos_niveles check (
    coalesce(nivel, 'no')             in ('no', 'ver', 'editar') and
    coalesce(nivel_presupuesto, 'no') in ('no', 'ver', 'editar') and
    coalesce(nivel_obra, 'no')        in ('no', 'ver', 'editar') and
    coalesce(nivel_libro, 'no')       in ('no', 'ver', 'editar')
  );
end $$;
