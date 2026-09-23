-- 040 · Tres tubos, y el checklist de cada hito.
--
-- El pipeline dejó de ser solo la lista de lo que se persigue: lleva también
-- los proyectos en ejecución. Y no todos recorren lo mismo, así que hay tres
-- tubos con sus propias etapas:
--
--   · Arquitectura y Construcción van en orden: son hitos, y del uno se pasa
--     al otro cuando está cerrado. Esa es la forma de llevar orden en un
--     proyecto largo.
--   · Lead va sin orden: en un lead primero puede salir el plan masa y después
--     el presupuesto, y las reuniones caen en cualquier momento.
--
-- Un lead es de arquitectura o de construcción desde que nace: cuando se gana,
-- sigue siendo el mismo proyecto y pasa a recorrer las etapas de su tubo. Por
-- eso deja de haber "leads" por un lado y "proyectos" por otro: es lo mismo en
-- distintos momentos, y mientras se persigue se lo marca con una (L).
--
-- Lo horizontal —las etapas— viene predeterminado y se edita en Ajustes, para
-- toda la oficina. Lo vertical —qué hay que tener para cerrar cada hito— sí
-- cambia de proyecto a proyecto: hay una plantilla por etapa, y dentro de cada
-- proyecto se agrega o se quita lo que ese proyecto necesite. Un ítem se puede
-- convertir en tarea, y al completarse la tarea el ítem queda marcado.

-- ── El tubo al que pertenece cada etapa del catálogo ──
alter table public.pipeline_etapas add column if not exists tunel text not null default 'lead';

-- ── En qué tubo va cada proyecto, y si todavía se está persiguiendo ──
alter table public.leads add column if not exists tunel   text not null default 'lead';
alter table public.leads add column if not exists es_lead boolean not null default true;

-- ── La plantilla del checklist de cada etapa ──
create table if not exists public.pipeline_etapa_items (
  id         bigserial primary key,
  etapa_id   text    not null references public.pipeline_etapas(id) on delete cascade,
  texto      text    not null,
  orden      int     not null default 0,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists pipeline_etapa_items_etapa on public.pipeline_etapa_items (etapa_id, orden);

-- ── El checklist de verdad, el de cada proyecto ──
create table if not exists public.lead_etapa_items (
  id            bigserial primary key,
  lead_id       bigint  not null references public.leads(id) on delete cascade,
  lead_etapa_id bigint  not null references public.lead_etapas(id) on delete cascade,
  texto         text    not null,
  hecho         boolean not null default false,
  hecho_at      timestamptz,
  hecho_por     text,
  orden         int     not null default 0,
  tarea_id      bigint,                       -- si se convirtió en tarea
  created_at    timestamptz not null default now()
);
create index if not exists lead_etapa_items_etapa on public.lead_etapa_items (lead_etapa_id, orden);
create index if not exists lead_etapa_items_tarea on public.lead_etapa_items (tarea_id);

-- ── Las etapas de fábrica de cada tubo ──
-- Son un punto de partida: se editan en Ajustes, por tubo.
update public.pipeline_etapas set tunel = 'lead' where tunel is null or tunel = '';

insert into public.pipeline_etapas (id, nombre, orden, color, principal, repetible, cierra, tunel) values
  ('arq_levantamiento', 'Levantamiento',           10, '#7A9E9F', true,  false, false, 'arquitectura'),
  ('arq_plan_masa',     'Plan masa',               20, '#5B8FA8', true,  false, false, 'arquitectura'),
  ('arq_anteproyecto',  'Anteproyecto',            30, '#4A7C8C', true,  false, false, 'arquitectura'),
  ('arq_definitivo',    'Proyecto definitivo',     40, '#3D6B7D', true,  false, false, 'arquitectura'),
  ('arq_ingenierias',   'Ingenierías',             50, '#2E5A6B', true,  false, false, 'arquitectura'),
  ('arq_permisos',      'Permisos y aprobaciones', 60, '#1F7A4D', true,  false, false, 'arquitectura'),
  ('arq_entrega',       'Entrega',                 70, '#0F3D3E', true,  false, true,  'arquitectura'),

  ('con_contrato',      'Contrato',                10, '#1F7A4D', true,  false, false, 'construccion'),
  ('con_planificacion', 'Planificación y compras', 20, '#5B8FA8', true,  false, false, 'construccion'),
  ('con_gris',          'Obra gris',               30, '#4A7C8C', true,  false, false, 'construccion'),
  ('con_instalaciones', 'Instalaciones',           40, '#3D6B7D', true,  false, false, 'construccion'),
  ('con_acabados',      'Acabados',                50, '#2E5A6B', true,  false, false, 'construccion'),
  ('con_entrega',       'Entrega',                 60, '#0F3D3E', true,  false, false, 'construccion'),
  ('con_liquidacion',   'Cierre y liquidación',    70, '#8B92A5', true,  false, true,  'construccion')
on conflict (id) do nothing;
