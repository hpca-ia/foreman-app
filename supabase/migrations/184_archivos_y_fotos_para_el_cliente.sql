-- 184 · Fotos y archivos que el cliente ve en su enlace, del proyecto y de cada punto.
--
-- Hernán, 17/11/2026: «que el link que ve el cliente funcione, el cliente ve
-- las actualizaciones de su proyecto. Se pueden cargar archivos o fotos a que
-- los vea... son relacionadas al proyecto y a las tareas también».
--
-- El enlace del cliente ya mostraba su checklist —cada punto con su estado, su
-- descripción y su actualización—, pero solo texto: la foto del levantamiento,
-- el plano que se le manda a revisar o la cotización que se le quiere mostrar
-- no tenían por dónde llegarle. Las fotos de avance y las entregas que ya
-- existían son de la obra en ejecución; un proyecto que todavía se presupuesta
-- no tenía nada.
--
-- No es una tabla nueva: son los archivos del proyecto (`proyecto_archivos`,
-- migración 061), que ganan dos datos.
--
--   · `visible_cliente` — si el cliente lo ve en su enlace. Nace en falso: un
--     archivo del proyecto es interno hasta que alguien decide mostrarlo. Los
--     que ya estaban cargados no cambian.
--   · `task_id` — de qué punto del checklist es, si es de alguno. Sin punto,
--     es del proyecto. Si el punto se borra, el archivo queda en el proyecto.
--
-- No borra ni cambia ningún dato existente. Se puede correr más de una vez.

alter table public.proyecto_archivos
  add column if not exists visible_cliente boolean not null default false,
  add column if not exists task_id bigint references public.tasks(id) on delete set null;

-- Lo que pide el enlace del cliente: lo visible de un proyecto.
create index if not exists proyecto_archivos_del_cliente
  on public.proyecto_archivos (lead_id, created_at desc) where visible_cliente;

comment on column public.proyecto_archivos.visible_cliente is
  'Si el cliente lo ve en su enlace. Falso por defecto: un archivo del proyecto es interno hasta que se decide mostrarlo.';
comment on column public.proyecto_archivos.task_id is
  'De qué punto del checklist es (tasks.id), o null si es del proyecto en general.';
