-- 175 · La lista vieja de proyectos de Ajustes.
--
-- «Proyecto» vivía en dos tablas: los del pipeline (`leads`) y una lista
-- vieja en Ajustes (`proyectos`), con su propia membresía
-- (`proyecto_miembros`). Cada pantalla elegía una, y un proyecto existía o no
-- según dónde se lo buscara. Desde la reingeniería hay una sola lista: la del
-- pipeline, con los que se persiguen y los aprobados.
--
-- Qué se va (docs/reingenieria-pipeline-tareas.md, fase 6):
--
--   · proyectos          15 filas. Ninguna tarea cuelga de ellas: no hay una
--                        sola tarea con `project_id`. 14 estaban apagadas.
--   · proyecto_miembros   8 filas. Quién era miembro de cada uno de esos.
--
-- La copia de las dos está en respaldos/fase6-antes-de-borrar-2026-11-11.json,
-- fuera del repositorio.
--
-- La aplicación dejó de leerlas ANTES de esta migración: primero se publicó el
-- código y después se corre esto. Ningún `cascade`: si algo que no se vio
-- dependiera de una de las dos, la migración falla entera y no borra nada.
--
-- `tasks.project_id` se queda: está vacía en todas las tareas y no molesta.
--
-- Se puede correr más de una vez.

drop table if exists public.proyecto_miembros;
drop table if exists public.proyectos;
