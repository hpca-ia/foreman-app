-- 055 · En este proyecto, esta persona, en cada área.
--
-- Un solo nivel por proyecto no alcanza para lo que se pide en la práctica: el
-- residente trabaja el control de obra y el libro, pero el presupuesto lo mira;
-- la arquitecta trabaja el presupuesto y del control de obra no tiene por qué
-- ver los montos. Con una sola llave había que elegir entre darle todo o
-- dejarlo afuera de todo.
--
-- Cada área guarda su nivel, y en null significa "lo mismo que en el proyecto",
-- que es lo que ya venía pasando: nadie gana ni pierde permisos con esto.
--
--   nivel        · del proyecto: ver | editar
--   nivel_*      · null = igual que el proyecto | ver | no (sin acceso)

alter table public.lead_accesos add column if not exists nivel_obra  text;
alter table public.lead_accesos add column if not exists nivel_libro text;
