-- 174 · Limpieza: lo que la reingeniería dejó de respaldo, y lo que nunca se usó.
--
-- Es la única migración de la reingeniería de Pipeline y Tareas que BORRA
-- (docs/reingenieria-pipeline-tareas.md, fase 6). Hernán aprobó la lista el
-- 11/11/2026, y antes de escribirla se guardó una copia de todo lo que se va
-- en respaldos/fase6-antes-de-borrar-2026-11-11.json, fuera del repositorio.
--
-- Qué se va y por qué se puede ir:
--
--   · lead_etapa_items      41 filas. Las «actividades» de las etapas del
--                           pipeline. Las 41 son tareas desde la 170.
--   · lead_etapas           55 filas. Las etapas por proyecto, con su estado y
--                           su «estamos acá». Nada las lee desde la 171: el
--                           lead está en una etapa y lo dice él.
--   · tasks.lead_etapa_id   Apuntaba a la tabla anterior. La etapa de cada
--                           tarea sigue escrita en `tasks.etapa_id`.
--   · pipeline_etapa_items  0 filas. Plantillas de actividades por etapa.
--   · tarea_dependencias    0 filas. «Esta tarea espera a aquella».
--   · tarea_responsables    0 filas. Acompañantes de una tarea.
--   · las etapas apagadas del catálogo que nadie nombra. Se quedan las que
--     alguna tarea lleva de etiqueta o en las que quedó algún proyecto.
--
-- La aplicación dejó de tocar todo esto ANTES de esta migración: primero se
-- publicó el código y después se corre esto. Ningún `cascade`: si algo que no
-- se vio dependiera de una de estas tablas, la migración falla entera y no
-- borra nada.
--
-- Se puede correr más de una vez.

alter table public.tasks drop column if exists lead_etapa_id;

drop table if exists public.lead_etapa_items;
drop table if exists public.lead_etapas;
drop table if exists public.pipeline_etapa_items;
drop table if exists public.tarea_dependencias;
drop table if exists public.tarea_responsables;

delete from public.pipeline_etapas e
 where not e.activa
   and not exists (select 1 from public.tasks t where t.etapa_id = e.id)
   and not exists (select 1 from public.leads l where l.etapa = e.id);
