-- 076 · El cronograma de obra: qué se hace, cuándo, y qué no puede esperar.
--
-- MÓDULO APARTE Y NO UNA PESTAÑA DE CONTROL DE OBRA, aunque estén atados.
--
--   Control de Obra habla de plata: rubro, planilla, factura, saldo. Lo abren
--   la administración y la dirección, y la pregunta es "¿cuánto llevamos
--   gastado?".
--
--   El cronograma habla de tiempo: actividad, duración, holgura, ruta crítica.
--   Lo abren el residente y el cliente, y la pregunta es "¿para cuándo?".
--
-- Son dos idiomas. Juntarlos en una pantalla obliga a traducir entre ellos
-- para hacer cualquiera de las dos cosas, y lo que pasa en la práctica es que
-- la gente deja de usar la que no entiende.
--
-- El puente es explícito y va en un solo sentido: cada actividad puede colgar
-- de una agrupación del presupuesto. De ahí saca su monto, y de ahí sale el
-- valorado —que sí es económico y por eso vive en Control de Obra.
--
-- LAS DEPENDENCIAS SON SU PROPIA TABLA y no una columna con una lista. Una
-- actividad espera a varias, y la pregunta que más se hace es la inversa:
-- "esto se atrasó, ¿a quién arrastra?". Con una lista adentro de la fila eso
-- se contesta leyendo todas las filas.

create table if not exists public.cronograma_actividades (
  id          bigserial primary key,
  lead_id     bigint not null references public.leads(id) on delete cascade,
  obra_id     bigint,
  codigo      text,
  nombre      text not null,
  -- Para agrupar: una actividad puede ser hija de otra (capítulo del
  -- cronograma). La madre no tiene duración propia: la toma de sus hijas.
  padre_id    bigint,
  obra_actividad_id bigint,          -- la agrupación del presupuesto, si cuelga
  duracion    int not null default 1,          -- en días hábiles
  -- Cuando una actividad arranca en una fecha fija pase lo que pase: la
  -- llegada de un equipo importado, una fecha de contrato.
  inicio_fijo date,
  -- Lo que de verdad pasó. `avance_pct` es lo que dice la obra.
  inicio_real date,
  fin_real    date,
  avance_pct  numeric(5,2) not null default 0,
  responsable_id bigint, responsable_nombre text,
  nota        text,
  orden       int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists crono_por_proyecto on public.cronograma_actividades (lead_id, orden);

create table if not exists public.cronograma_dependencias (
  id             bigserial primary key,
  actividad_id   bigint not null references public.cronograma_actividades(id) on delete cascade,
  depende_de_id  bigint not null references public.cronograma_actividades(id) on delete cascade,
  -- FC fin→comienzo (la normal), CC comienzo→comienzo, FF fin→fin
  tipo           text not null default 'FC',
  -- Días de espera entre una y otra: el fragüe del hormigón, el secado de un
  -- empaste. Sin esto la gente infla la duración de la actividad anterior y
  -- después el avance del 100% llega tres días antes de que se pueda seguir.
  retardo        int not null default 0,
  unique (actividad_id, depende_de_id)
);
create index if not exists crono_dep_actividad on public.cronograma_dependencias (actividad_id);
create index if not exists crono_dep_origen    on public.cronograma_dependencias (depende_de_id);

-- Los datos del cronograma de un proyecto: cuándo arranca y qué días se
-- trabaja. Van en el proyecto porque son uno por obra.
alter table public.leads add column if not exists crono_inicio     date;
alter table public.leads add column if not exists crono_laborables jsonb;   -- [1,2,3,4,5,6]
alter table public.leads add column if not exists crono_feriados   jsonb;   -- ["2026-05-01", …]

do $$
declare t text;
begin
  foreach t in array array['cronograma_actividades','cronograma_dependencias'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipo foreman" on public.%I', t);
    execute format('create policy "equipo foreman" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
