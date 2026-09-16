-- Pipeline de proyectos y leads.
--
-- Un proyecto no recorre siempre el mismo camino: uno arranca por presupuesto,
-- otro por un plan masa, otro se cierra sin diseño. Por eso las etapas no son
-- una secuencia fija: hay un catálogo, y cada proyecto elige cuáles le aplican
-- y en qué orden. La reunión con cliente se repite las veces que haga falta.
--
-- Lo que ya existía se conserva: la ruta de pasos sigue viviendo en `tasks`
-- (con sus fechas y recordatorios) y la bitácora en `lead_movimientos`. Las
-- etapas son la vista macro; los pasos, el detalle del día a día.

create table if not exists public.pipeline_etapas (
  id         text primary key,
  nombre     text    not null,
  orden      int     not null default 0,
  color      text,
  principal  boolean not null default false,   -- columna fija en el tablero
  repetible  boolean not null default false,   -- se puede insertar varias veces
  cierra     boolean not null default false,
  activa     boolean not null default true
);

insert into public.pipeline_etapas (id, nombre, orden, color, principal, repetible, cierra) values
  ('lead',         'Lead',                10, '#8B92A5', true,  false, false),
  ('reunion',      'Reunión con cliente', 15, '#7A9E9F', false, true,  false),
  ('presupuesto',  'Presupuesto',         20, '#5B8FA8', true,  false, false),
  ('diseno',       'Diseño',              30, '#4A7C8C', false, false, false),
  ('anteproyecto', 'Anteproyecto',        40, '#4A7C8C', false, false, false),
  ('plan_masa',    'Plan masa',           50, '#4A7C8C', false, false, false),
  ('propuesta',    'Propuesta',           60, '#3D6B7D', true,  false, false),
  ('negociacion',  'Negociación',         70, '#2E5A6B', true,  false, false),
  ('contrato',     'Contrato',            80, '#1F7A4D', true,  false, false),
  ('ejecucion',    'Ejecución',           90, '#0F3D3E', true,  false, false),
  ('cerrado',      'Cerrado',            100, '#8B92A5', false, false, true)
on conflict (id) do nothing;

-- La temperatura prioriza: cuáles están cerca de cerrarse. El resultado se
-- guarda aparte de la etapa, porque un proyecto cerrado pudo ganarse o perderse.
alter table public.leads
  add column if not exists temperatura text check (temperatura in ('frio', 'tibio', 'caliente')),
  add column if not exists resultado   text check (resultado in ('ganado', 'perdido'));

-- Las etapas viejas del túnel comercial pasan al catálogo nuevo.
update public.leads set resultado = 'ganado'  where etapa = 'ganado'  and resultado is null;
update public.leads set resultado = 'perdido' where etapa = 'perdido' and resultado is null;
update public.leads set etapa = case etapa
    when 'nuevo'      then 'lead'
    when 'contactado' then 'lead'
    when 'visita'     then 'reunion'
    when 'ganado'     then 'contrato'
    when 'perdido'    then 'cerrado'
    else etapa end
  where etapa in ('nuevo', 'contactado', 'visita', 'ganado', 'perdido');

-- Las etapas que este proyecto sí recorre, en su orden, con quién responde por
-- cada una y para cuándo.
create table if not exists public.lead_etapas (
  id                 bigserial primary key,
  lead_id            bigint  not null,
  etapa_id           text    not null,
  orden              int     not null default 0,
  estado             text    not null default 'pendiente'
                     check (estado in ('pendiente', 'en_curso', 'hecha', 'omitida')),
  responsable_id     bigint,        -- usuario de FOREMAN
  invitado_id        bigint,        -- o alguien de fuera (cliente, proveedor)
  responsable_nombre text,
  fecha_objetivo     date,
  nota               text,
  hecha_at           timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists lead_etapas_lead on public.lead_etapas (lead_id, orden);

-- Gente del proyecto que no usa FOREMAN: el cliente, un proveedor, un
-- especialista. Puede ser responsable de una etapa y, más adelante, recibir el
-- link de seguimiento.
create table if not exists public.pipeline_invitados (
  id         bigserial primary key,
  lead_id    bigint not null,
  nombre     text   not null,
  rol        text,                 -- cliente | proveedor | otro
  email      text,
  telefono   text,
  created_at timestamptz not null default now()
);
create index if not exists pipeline_invitados_lead on public.pipeline_invitados (lead_id);

-- Protegidas igual que el resto: solo quien entró a FOREMAN.
do $$
declare t text;
begin
  foreach t in array array['pipeline_etapas', 'lead_etapas', 'pipeline_invitados'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipo foreman" on public.%I', t);
    execute format('create policy "equipo foreman" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
