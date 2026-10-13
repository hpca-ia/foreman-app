-- 106 · Las actas de reunión de obra.
--
-- Es el documento que deja por escrito lo que se decidió en la reunión, y que
-- después vale como prueba: junto con el libro de obra es lo que se pone sobre
-- la mesa cuando hay que justificar un atraso, una orden de cambio o un
-- trabajo que nadie quiere pagar.
--
-- LO QUE HACE QUE UN ACTA SIRVA ES UNA SOLA COSA: que cada compromiso tenga
-- dueño y fecha, y que la siguiente acta los traiga de vuelta y diga qué pasó
-- con cada uno. Un acta que solo narra lo que se dijo no se puede usar para
-- nada. Por eso el compromiso es una tabla con responsable, fecha límite y
-- estado, y arrastra de dónde viene: así la reunión empieza por lo que quedó
-- pendiente en vez de por una hoja en blanco.

create table if not exists public.obra_actas (
  id            bigserial primary key,
  lead_id       bigint not null references public.leads(id) on delete cascade,
  obra_id       bigint,
  numero        integer not null,
  fecha         date not null,
  hora_inicio   time,
  hora_fin      time,
  lugar         text,
  -- borrador: se está escribiendo · revisada: el director le dio el visto ·
  -- enviada: salió a los correos y ya no se toca.
  estado        text not null default 'borrador',
  -- De qué se habló, en prosa. Lo que no entra en un tema ni en un compromiso:
  -- el clima de la reunión, un acuerdo general, una aclaración.
  resumen       text,
  -- Cómo va la obra, dicho en la reunión. Se escribe acá y no se calcula: lo
  -- que vale en un acta es lo que las partes aceptaron, no lo que el sistema
  -- cree.
  avance_nota   text,
  proxima_fecha date,
  proxima_hora  time,
  revisada_at   timestamptz, revisada_por bigint, revisada_nombre text,
  enviada_at    timestamptz, enviada_a text[],
  creado_por    bigint, creado_nombre text,
  created_at    timestamptz not null default now(),
  unique (lead_id, numero)
);
create index if not exists actas_por_proyecto on public.obra_actas (lead_id, fecha desc);

-- QUIÉN VINO Y QUIÉN NO VINO. Los dos importan: un convocado que faltó tres
-- reuniones seguidas es un dato, y es el que después explica por qué algo no
-- se decidió. El correo vive acá porque es a quien se le manda el acta.
create table if not exists public.acta_asistentes (
  id        bigserial primary key,
  acta_id   bigint not null references public.obra_actas(id) on delete cascade,
  nombre    text not null,
  empresa   text,
  cargo     text,
  email     text,
  asistio   boolean not null default true,
  -- Si recibe el acta por correo cuando se envía.
  recibe    boolean not null default true,
  orden     integer not null default 0
);
create index if not exists acta_asistentes_por_acta on public.acta_asistentes (acta_id, orden);

-- LA GENTE QUE SIEMPRE VA, guardada por obra. Sin esto hay que escribir los
-- ocho nombres y los ocho correos en cada reunión, y a la tercera acta alguien
-- deja de hacerlo.
create table if not exists public.obra_convocados (
  id        bigserial primary key,
  lead_id   bigint not null references public.leads(id) on delete cascade,
  nombre    text not null,
  empresa   text,
  cargo     text,
  email     text,
  activo    boolean not null default true,
  orden     integer not null default 0
);
create index if not exists convocados_por_proyecto on public.obra_convocados (lead_id, orden);

-- Los temas tratados: qué se trató y qué se resolvió. Lo resuelto va aparte de
-- lo conversado a propósito — un acta que narra no sirve para decidir nada.
create table if not exists public.acta_temas (
  id        bigserial primary key,
  acta_id   bigint not null references public.obra_actas(id) on delete cascade,
  titulo    text not null,
  detalle   text,
  resuelto  text,
  orden     integer not null default 0
);
create index if not exists acta_temas_por_acta on public.acta_temas (acta_id, orden);

-- EL CORAZÓN DEL ACTA.
--
-- `viene_de` apunta al compromiso de un acta anterior que este continúa: es lo
-- que convierte las actas en una cadena en vez de una pila de papeles sueltos.
-- Al abrir una reunión nueva, lo pendiente de la anterior ya está adentro.
create table if not exists public.acta_compromisos (
  id          bigserial primary key,
  acta_id     bigint not null references public.obra_actas(id) on delete cascade,
  texto       text not null,
  responsable_nombre text,
  responsable_email  text,
  fecha_limite date,
  -- pendiente | cumplido | reprogramado | anulado
  estado      text not null default 'pendiente',
  nota        text,
  viene_de    bigint references public.acta_compromisos(id) on delete set null,
  cerrado_at  timestamptz, cerrado_por bigint, cerrado_nombre text,
  orden       integer not null default 0
);
create index if not exists acta_compromisos_por_acta on public.acta_compromisos (acta_id, orden);
create index if not exists acta_compromisos_abiertos on public.acta_compromisos (acta_id, estado);

-- Las fotos de la reunión: lo que se miró en obra ese día. Una foto en el acta
-- es la diferencia entre "se observó humedad en el muro norte" y poder
-- mostrarla tres meses después.
create table if not exists public.acta_fotos (
  id           bigserial primary key,
  acta_id      bigint not null references public.obra_actas(id) on delete cascade,
  storage_path text not null,
  descripcion  text,
  orden        integer not null default 0,
  autor_id     bigint, autor_nombre text,
  created_at   timestamptz not null default now()
);
create index if not exists acta_fotos_por_acta on public.acta_fotos (acta_id, orden);

do $$
declare t text;
begin
  foreach t in array array['obra_actas','acta_asistentes','obra_convocados','acta_temas','acta_compromisos','acta_fotos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipo foreman" on public.%I', t);
    execute format('create policy "equipo foreman" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
