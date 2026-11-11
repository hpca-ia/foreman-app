-- 172 · «Ya no va»: una tarea que se cierra sin haberse hecho.
--
-- Lo vencido en la bandeja pide una decisión de un toque: nueva fecha,
-- delegarla, o «ya no va». Lo tercero no es borrarla —se pierde que existió y
-- por qué— ni marcarla hecha —no se hizo—: queda cerrada, para que no vuelva a
-- pedir nada, y dice que se descartó.
--
-- Ver docs/reingenieria-pipeline-tareas.md, fase 4. No toca ninguna fila que
-- ya exista: es una columna nueva, en falso para todas.
--
-- Se puede correr más de una vez.

alter table public.tasks add column if not exists descartada boolean not null default false;

comment on column public.tasks.descartada is 'Ya no va: se cerró sin haberse hecho. Va siempre con status = listo.';
