-- 054 · Libro de Obra.
--
-- El registro diario de lo que pasó en la obra: quién estuvo, qué se hizo, qué
-- llegó, qué se decidió y qué salió mal. Hoy eso vive en la cabeza del
-- residente y en fotos sueltas de WhatsApp; cuando hace falta —una demora que
-- alguien tiene que justificar, un reclamo, una liquidación— no está.
--
-- Tres decisiones que se ven en el esquema:
--
--  · Cuelga del proyecto (`lead_id`), como todo lo demás. La obra de Control de
--    Obra se encuentra a través de él.
--
--  · Un libro por proyecto y por día, y eso lo sostiene la base: dos libros del
--    mismo día serían dos versiones de lo que pasó.
--
--  · El día de ayer está cerrado y punto. No es una costumbre de la pantalla ni
--    depende de que un reloj externo se acuerde de cerrarlo: lo impide un
--    disparador. Escribir el lunes en el libro del domingo no es un descuido,
--    es otra cosa.

create table if not exists public.libro_obra_dias (
  id            bigserial primary key,
  lead_id       bigint not null references public.leads(id) on delete cascade,
  fecha         date   not null,
  estado        text   not null default 'abierto',   -- abierto | cerrado | aprobado
  clima         text,
  sin_novedades boolean not null default false,
  cerrado_at    timestamptz,
  pdf_url       text,
  snapshot_avance jsonb,                             -- foto de Control de Obra al cerrar
  aprobado_por    bigint,
  aprobado_nombre text,
  aprobado_at     timestamptz,
  observaciones_aprobacion text,
  created_by    bigint,
  created_at    timestamptz not null default now(),
  unique (lead_id, fecha)
);
create index if not exists libro_dias_proyecto on public.libro_obra_dias (lead_id, fecha desc);

create table if not exists public.libro_obra_entradas (
  id         bigserial primary key,
  dia_id     bigint not null references public.libro_obra_dias(id) on delete cascade,
  categoria  text   not null,
    -- personal | actividades | materiales | equipo | novedades | decisiones |
    -- seguridad | observaciones
  contenido  text   not null,
  autor_id   bigint,
  autor_nombre text,
  created_at timestamptz not null default now()
);
create index if not exists libro_entradas_dia on public.libro_obra_entradas (dia_id, created_at);

create table if not exists public.libro_obra_fotos (
  id           bigserial primary key,
  dia_id       bigint not null references public.libro_obra_dias(id) on delete cascade,
  entrada_id   bigint references public.libro_obra_entradas(id) on delete set null,
  storage_path text not null,
  descripcion  text,
  autor_id     bigint,
  autor_nombre text,
  created_at   timestamptz not null default now()
);
create index if not exists libro_fotos_dia on public.libro_obra_fotos (dia_id);

create table if not exists public.libro_obra_envios (
  id             bigserial primary key,
  dia_id         bigint not null references public.libro_obra_dias(id) on delete cascade,
  destinatarios  text[] not null,
  enviado_por    bigint,
  enviado_nombre text,
  enviado_at     timestamptz not null default now()
);
create index if not exists libro_envios_dia on public.libro_obra_envios (dia_id);

-- Quién recibe el libro por correo: se marca sobre la gente del proyecto que ya
-- existe —fiscalizador, cliente, ingeniero— en vez de armar otra libreta de
-- direcciones que se desactualiza sola.
alter table public.pipeline_invitados add column if not exists recibe_libro boolean not null default false;

-- El día de ayer está cerrado.
create or replace function public.libro_del_dia_abierto() returns trigger
language plpgsql as $$
declare cerrado boolean;
begin
  select d.estado <> 'abierto'
      or d.fecha < ((now() at time zone 'America/Guayaquil')::date)
    into cerrado
  from public.libro_obra_dias d where d.id = new.dia_id;
  if cerrado then
    raise exception 'El libro de ese día ya está cerrado';
  end if;
  return new;
end $$;

drop trigger if exists libro_entradas_solo_abierto on public.libro_obra_entradas;
create trigger libro_entradas_solo_abierto before insert or update on public.libro_obra_entradas
  for each row execute function public.libro_del_dia_abierto();

drop trigger if exists libro_fotos_solo_abierto on public.libro_obra_fotos;
create trigger libro_fotos_solo_abierto before insert or update on public.libro_obra_fotos
  for each row execute function public.libro_del_dia_abierto();

do $$
declare t text;
begin
  foreach t in array array['libro_obra_dias','libro_obra_entradas','libro_obra_fotos','libro_obra_envios'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipo foreman" on public.%I', t);
    execute format('create policy "equipo foreman" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
