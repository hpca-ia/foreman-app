-- Leads: el túnel de trabajo comercial.
--
-- La idea que sostiene todo: cada lead recorre SU PROPIA RUTA. No un próximo
-- paso suelto, sino la secuencia completa —contactar, visitar, cotizar,
-- presentar, hacer seguimiento, cerrar— con sus fechas y su dueño. Se ve
-- entera: lo hecho, lo que toca ahora y lo que viene. Un lead al que se le
-- acabó la ruta y nadie le puso el siguiente paso está olvidado, y la
-- pantalla lo trata como un problema.
--
-- Cada paso de la ruta es una fila de `tasks`, no una tabla aparte: "llamar a
-- Diners el jueves" es una tarea con todo lo que una tarea ya sabe hacer
-- —vencer, avisar, aparecer en la lista de alguien, recordar por WhatsApp—.
-- Duplicar eso acá habría significado duplicar también los recordatorios.

create table if not exists public.leads (
  id              bigserial primary key,
  nombre          text        not null,        -- "Diners Plaza Lagos"
  cliente_id      bigint,                      -- si ya existe en clientes
  contacto        text,
  telefono        text,
  email           text,
  origen          text,                        -- referido, concurso, web, visita
  etapa           text        not null default 'nuevo',
  -- nuevo | contactado | visita | propuesta | negociacion | ganado | perdido
  valor_estimado  numeric(14,2),
  probabilidad    int,                         -- 0-100
  fecha_cierre    date,                        -- cuándo se decide
  responsable_id  bigint,
  responsable_nombre text,
  notas           text,
  motivo_perdida  text,
  presupuesto_id  bigint,                      -- si se cotizó
  obra_id         bigint,                      -- si se ganó y arrancó
  created_by      bigint,
  created_at      timestamptz not null default now(),
  actualizado_at  timestamptz not null default now()
);
create index if not exists leads_etapa on public.leads (etapa);
create index if not exists leads_responsable on public.leads (responsable_id);

-- Bitácora: cada llamada, visita o correo queda registrado. Sin esto, "¿en qué
-- quedamos con este cliente?" solo vive en la cabeza de quien lo atendió.
create table if not exists public.lead_movimientos (
  id         bigserial primary key,
  lead_id    bigint      not null,
  tipo       text        not null default 'nota',  -- nota | llamada | correo | visita | etapa
  detalle    text,
  etapa_de   text,
  etapa_a    text,
  autor_id   bigint,
  autor_nombre text,
  created_at timestamptz not null default now()
);
create index if not exists lead_movimientos_lead on public.lead_movimientos (lead_id);

-- Los pasos de la ruta viven en tasks. `ruta_orden` mantiene la secuencia:
-- sin él la ruta se ordenaría por fecha, y un paso sin fecha todavía puesta
-- se saldría de su lugar.
alter table public.tasks add column if not exists lead_id    bigint;
alter table public.tasks add column if not exists ruta_orden int;
create index if not exists tasks_lead on public.tasks (lead_id);

-- Teléfono del usuario: sin esto NOVA no tiene a dónde escribir por WhatsApp.
-- Va acá porque los usuarios viven en localStorage y el recordatorio se manda
-- desde el servidor, que no puede leer el navegador de nadie.
create table if not exists public.usuarios_contacto (
  usuario_id  bigint primary key,
  nombre      text,
  telefono    text,                             -- formato internacional: 5939...
  email       text,
  wa_activo   boolean not null default true,
  actualizado_at timestamptz not null default now()
);
