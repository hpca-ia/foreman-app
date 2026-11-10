-- 170 · Lo que hay que hacer en un proyecto es una tarea. Una sola.
--
-- Hasta acá eran dos filas por cada cosa: la «actividad» que se escribía
-- dentro de una etapa del pipeline (`lead_etapa_items`) y la tarea que se le
-- creaba al lado (`tasks`) para que apareciera en el tablero. Cuarenta y una
-- actividades, cuarenta y una tareas gemelas, y código copiando de una a otra
-- cada vez que alguien marcaba, corregía o borraba. Cuando ese código fallaba
-- quedaban desparejas: una actividad hecha con su tarea abierta —el
-- «Presupuesto enviado» del Aéreo, vencido desde el 7 de octubre—, otra
-- apuntando a una tarea que alguien había borrado.
--
-- Queda una: la tarea. Si pertenece a una etapa de un proyecto, lo dice ella,
-- y la columna de esa etapa la muestra. Marcarla en el proyecto o en Tareas es
-- tocar la misma fila.
--
-- NO SE BORRA NADA. `lead_etapa_items` queda como está, de respaldo; la
-- aplicación deja de leerla y de escribirla. Se quita al final de la
-- reingeniería (ver docs/reingenieria-pipeline-tareas.md).
--
-- Se puede correr más de una vez: lo que ya pasó no vuelve a pasar.

alter table public.tasks add column if not exists lead_etapa_id bigint references public.lead_etapas(id) on delete set null;
alter table public.tasks add column if not exists etapa_id text;
alter table public.tasks add column if not exists espera boolean not null default false;
alter table public.tasks add column if not exists nota text;
alter table public.tasks add column if not exists hecha_at timestamptz;
alter table public.tasks add column if not exists hecha_por text;

create index if not exists tasks_lead_etapa on public.tasks (lead_etapa_id) where lead_etapa_id is not null;

comment on column public.tasks.lead_etapa_id is
  'La etapa del proyecto a la que pertenece esta tarea, si pertenece a alguna. La columna de esa etapa en el pipeline muestra esta misma fila.';
comment on column public.tasks.etapa_id is
  'El nombre de catálogo de esa etapa (pipeline_etapas.id). Es el que queda cuando las etapas por proyecto dejen de existir.';
comment on column public.tasks.espera is
  'Ya se hizo lo nuestro y depende de un tercero: no es pendiente ni está hecha.';
comment on column public.tasks.nota is
  'Lo que hay que saber de esta tarea y solo sabe quien la trabajó.';
comment on column public.tasks.hecha_at is 'Cuándo se marcó hecha. Null si está abierta.';
comment on column public.tasks.hecha_por is 'El nombre de quien la marcó hecha.';

-- Mientras se acomodan los datos, `updated_at` no se toca. El disparador lo
-- pondría en "ahora" para cada tarea que se actualice, y el correo de la
-- mañana lee esa fecha para decir qué se cerró ayer: mañana le diría a cada
-- uno que ayer cerró todas las tareas de su vida.
alter table public.tasks disable trigger tasks_tocar;

-- 1. Las tareas que ya estaban cerradas guardan cuándo: lo más cerca que hay
--    es la última vez que se tocaron.
update public.tasks
   set hecha_at = updated_at
 where status = 'listo' and hecha_at is null;

-- 2. Cada actividad le pasa lo suyo a su tarea gemela: de qué etapa es, en qué
--    orden va, si espera a un tercero, su nota, y quién y cuándo la marcó. Si
--    la actividad estaba hecha, la tarea queda hecha: es el caso del envío que
--    nunca se cerró.
update public.tasks t
   set lead_etapa_id = i.lead_etapa_id,
       etapa_id      = e.etapa_id,
       ruta_orden    = coalesce(t.ruta_orden, i.orden),
       espera        = coalesce(i.espera, false),
       nota          = coalesce(nullif(btrim(i.nota), ''), t.nota),
       status        = case when i.hecho then 'listo' else t.status end,
       hecha_at      = case when i.hecho then coalesce(i.hecho_at, t.hecha_at, t.updated_at) else null end,
       hecha_por     = case when i.hecho then coalesce(i.hecho_por, t.hecha_por) else null end
  from public.lead_etapa_items i
  join public.lead_etapas e on e.id = i.lead_etapa_id
 where i.tarea_id = t.id
   and t.lead_etapa_id is null;

-- 3. La actividad que se quedó sin tarea —la borraron del tablero y el
--    vínculo quedó apuntando al vacío— vuelve a tener una, ya con todo. Hoy
--    es una sola: «AJUSTES PLANO», de RES ZULETA, que está hecha.
insert into public.tasks
  (title, lead_id, type, priority, status, notes, created_by, created_at,
   lead_etapa_id, etapa_id, ruta_orden, espera, nota, hecha_at, hecha_por)
select i.texto, i.lead_id, 'Gestión', 'media',
       case when i.hecho then 'listo' else 'en-progreso' end,
       'Gestión de ' || l.nombre,
       coalesce(l.created_by, 1), i.created_at,
       i.lead_etapa_id, e.etapa_id, i.orden, coalesce(i.espera, false), nullif(btrim(i.nota), ''),
       case when i.hecho then coalesce(i.hecho_at, i.created_at) end,
       case when i.hecho then i.hecho_por end
  from public.lead_etapa_items i
  join public.lead_etapas e on e.id = i.lead_etapa_id
  join public.leads l on l.id = i.lead_id
 where (i.tarea_id is null or not exists (select 1 from public.tasks t where t.id = i.tarea_id))
   -- Si ya se le creó en una corrida anterior, no se le crea otra.
   and not exists (select 1 from public.tasks t
                    where t.lead_etapa_id = i.lead_etapa_id and t.title = i.texto);

alter table public.tasks enable trigger tasks_tocar;
