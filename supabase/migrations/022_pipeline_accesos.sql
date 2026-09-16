-- Quién ve cada proyecto del pipeline.
--
-- Un lead nace privado de quien lo abrió. Se comparte persona por persona, no
-- por rol: "Camila ve este proyecto", no "todos los arquitectos ven todo lo
-- comercial". Y se comparte solo cuando hace falta: al poner a alguien como
-- responsable de una etapa, esa persona pasa a ver el proyecto, porque la
-- etapa es suya.
--
-- La regla vive en la base, no en la pantalla: aunque alguien consulte por
-- fuera de la app, con su sesión, solo obtiene los proyectos que le tocan.

create table if not exists public.lead_accesos (
  lead_id    bigint not null,
  usuario_id bigint not null,
  origen     text   not null default 'manual',   -- manual | responsable
  creado_por bigint,
  created_at timestamptz not null default now(),
  primary key (lead_id, usuario_id)
);

-- La etapa que alguien tiene que trabajar es también una tarea suya, con su
-- fecha: así aparece donde ya mira todos los días y no en una lista aparte.
alter table public.lead_etapas add column if not exists tarea_id bigint;

-- Quién es quien pregunta, según su sesión. El id y el rol los pone el
-- servidor al entrar con el PIN; nadie puede escribirlos desde la app.
create or replace function public.usuario_foreman() returns bigint
  language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'usuario_id', '')::bigint;
$$;

create or replace function public.es_admin_foreman() returns boolean
  language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rol', '') in ('owner', 'assistant');
$$;

alter table public.lead_accesos enable row level security;
drop policy if exists "equipo foreman" on public.lead_accesos;
create policy "equipo foreman" on public.lead_accesos for all to authenticated using (true) with check (true);

-- Los proyectos: los ve quien los creó, quien tiene acceso, y los admins.
alter table public.leads enable row level security;
drop policy if exists "equipo foreman" on public.leads;
drop policy if exists "pipeline visible" on public.leads;
create policy "pipeline visible" on public.leads for all to authenticated
  using (
    public.es_admin_foreman()
    or created_by = public.usuario_foreman()
    or exists (select 1 from public.lead_accesos a
                where a.lead_id = leads.id and a.usuario_id = public.usuario_foreman())
  )
  with check (
    public.es_admin_foreman()
    or created_by = public.usuario_foreman()
    or exists (select 1 from public.lead_accesos a
                where a.lead_id = leads.id and a.usuario_id = public.usuario_foreman())
  );

-- Lo que cuelga de un proyecto se ve si se ve el proyecto. La consulta de
-- adentro también respeta la regla de arriba, así que no hay que repetirla.
do $$
declare t text;
begin
  foreach t in array array['lead_etapas', 'lead_movimientos', 'pipeline_invitados'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipo foreman" on public.%I', t);
    execute format('drop policy if exists "sigue al proyecto" on public.%I', t);
    execute format($f$create policy "sigue al proyecto" on public.%I for all to authenticated
      using (exists (select 1 from public.leads l where l.id = %I.lead_id))
      with check (exists (select 1 from public.leads l where l.id = %I.lead_id))$f$, t, t, t);
  end loop;
end $$;
