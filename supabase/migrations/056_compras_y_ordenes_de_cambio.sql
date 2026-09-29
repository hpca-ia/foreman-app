-- 056 · Lo que falta para cerrar el control de obra: lo comprometido y los
--       adicionales.
--
-- Hoy el control contesta "cuánto llevo gastado". Le faltan las dos preguntas
-- que de verdad quitan el sueño en obra:
--
--   1. ¿Cuánto MÁS me están pidiendo gastar?  Una solicitud de compra no es un
--      gasto —todavía no hay factura— pero ya es plata comprometida contra un
--      capítulo. Verla recién cuando llega la factura es enterarse tarde: el
--      capítulo se pasa igual, solo que un mes después.
--
--   2. ¿Qué de lo que se gastó no estaba en el presupuesto?  Los adicionales y
--      las reducciones se acuerdan con el cliente por escrito y no se meten a
--      mano en la línea base: el presupuesto aprobado es un contrato y
--      corregirlo borra la historia de por qué la obra costó lo que costó.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 1. La solicitud de compra apunta al presupuesto, sin alimentarlo.
--
-- Se relaciona con el capítulo —y con el rubro, si se sabe cuál— desde que se
-- pide. Mientras no esté comprada, eso es COMPROMETIDO: no suma al invertido,
-- suma al lado. Cuando se compra, la factura entra a Control de Obra como
-- cualquier otra y ahí sí alimenta el rubro; la solicitud deja de estar
-- comprometida porque ya es gasto. Una sola verdad, contada en dos momentos.

alter table public.compras_solicitudes add column if not exists capitulo        text;
alter table public.compras_solicitudes add column if not exists obra_rubro_id   bigint;
alter table public.compras_solicitudes add column if not exists monto_estimado  numeric(14,2);

create index if not exists compras_por_obra  on public.compras_solicitudes (obra_id, estado);
create index if not exists compras_por_rubro on public.compras_solicitudes (obra_rubro_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Las órdenes de cambio.
--
-- El esquema sigue el documento que la oficina ya usa y firma —el de Banco del
-- Pacífico Condado—, con sus cuatro capítulos, porque cambiarle la forma a un
-- papel que el cliente y la fiscalización ya saben leer no mejora nada:
--
--   Encabezado          · N° (OC-01, y a veces OC-08A), fecha, tipo, lugar,
--                         título, emitido por, proyecto, cliente.
--   CAPÍTULO I          · Argumentos de la solicitud y soportes gráficos.
--   CAPÍTULO II         · Adiciones y reducciones, con subtotales y total.
--   CAPÍTULO III        · Impacto en cronograma.
--   CAPÍTULO IV         · Revisión y aprobación: contratista, fiscalización y
--                         contratante, cada uno con fecha y comentarios.
--
-- Nada de esto toca la línea base. Su resultado entra al control como
-- adicionales, en su propia columna, que es como se lee un contrato: lo
-- pactado, y lo que se pactó después.

create table if not exists public.ordenes_cambio (
  id            bigserial primary key,
  obra_id       bigint not null references public.obras(id) on delete cascade,
  numero        integer not null,
  -- El código que se cita en las actas. Casi siempre "OC-" y el número, pero
  -- un desglose posterior obliga a un OC-08A, y eso hay que poder escribirlo.
  codigo        text,
  titulo        text not null,
  tipo          text,                      -- Requerimiento cliente, vicio oculto, cambio de especificación…
  lugar         text,
  fecha         date,
  emitido_por   text,
  -- CAPÍTULO I
  justificacion text,
  soportes      text,                      -- qué se adjunta: planos, fotos
  -- CAPÍTULO III
  impacto_cronograma text,
  dias_impacto  integer,
  -- Estado interno (dónde va en FOREMAN) y estado de obra (qué pasó con ella)
  estado        text not null default 'borrador',
    -- borrador | enviada | aprobada | rechazada
  ejecucion     text not null default 'por_definir',
    -- ejecutado | no_ejecutado | por_definir
  anulada       boolean not null default false,
  -- CAPÍTULO IV · quién revisa y qué dijo
  contratista_nombre    text,
  contratista_fecha     date,
  contratista_comentario text,
  fiscalizacion_nombre  text,
  fiscalizacion_fecha   date,
  fiscalizacion_comentario text,
  contratante_nombre    text,
  contratante_fecha     date,
  contratante_comentario text,
  enviada_at    timestamptz,
  aprobada_at   timestamptz,
  created_by    bigint,
  created_nombre text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (obra_id, numero)
);
create index if not exists ordenes_por_obra on public.ordenes_cambio (obra_id, numero);

create table if not exists public.orden_cambio_lineas (
  id              bigserial primary key,
  orden_id        bigint not null references public.ordenes_cambio(id) on delete cascade,
  -- 'aumenta' es una ADICIÓN, 'quita' una REDUCCIÓN. El signo lo pone el
  -- sistema: un monto negativo tecleado a mano es un error esperando pasar.
  tipo            text not null default 'aumenta',   -- aumenta | quita
  item            text,                   -- ADIC-01, RED-01
  rubro_codigo    text,                   -- OC-03-01, o el código del rubro del contrato
  obra_rubro_id   bigint,                 -- el rubro que se toca, si ya existe
  capitulo        text,
  descripcion     text not null,
  especificacion  text,
  unidad          text,
  cantidad        numeric(14,4) not null default 0,
  precio_unitario numeric(14,4) not null default 0,
  orden           integer not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists orden_lineas on public.orden_cambio_lineas (orden_id, orden);

-- Los soportes gráficos del CAPÍTULO I: la foto de lo que se encontró, el
-- plano con el ducto existente en rojo y la nueva posición en verde. Sin eso,
-- el que aprueba tiene que creerle a la palabra escrita; con eso ve el
-- problema, y la orden se aprueba en un día en vez de en tres correos.
create table if not exists public.orden_cambio_fotos (
  id           bigserial primary key,
  orden_id     bigint not null references public.ordenes_cambio(id) on delete cascade,
  storage_path text not null,
  descripcion  text,
  orden        integer not null default 0,
  autor_id     bigint,
  autor_nombre text,
  created_at   timestamptz not null default now()
);
create index if not exists orden_fotos on public.orden_cambio_fotos (orden_id, orden);

-- A quién se le manda el documento: la misma gente del proyecto que ya existe.
alter table public.pipeline_invitados add column if not exists recibe_ordenes boolean not null default false;

-- Los envíos, para saber a quién se le mandó y cuándo.
create table if not exists public.orden_cambio_envios (
  id             bigserial primary key,
  orden_id       bigint not null references public.ordenes_cambio(id) on delete cascade,
  destinatarios  text[] not null,
  enviado_por    bigint,
  enviado_nombre text,
  enviado_at     timestamptz not null default now()
);
create index if not exists orden_envios on public.orden_cambio_envios (orden_id);

do $$
declare t text;
begin
  foreach t in array array['ordenes_cambio','orden_cambio_lineas','orden_cambio_envios','orden_cambio_fotos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipo foreman" on public.%I', t);
    execute format('create policy "equipo foreman" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
