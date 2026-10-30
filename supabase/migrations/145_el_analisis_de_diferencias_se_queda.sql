-- 145 · El análisis de diferencias se queda.
--
-- Comparar una propuesta nueva contra el presupuesto no es un cálculo: es una
-- conversación. Cada diferencia hay que mirarla, discutirla con el residente o
-- con el cliente, y algunas se van a caer —"eso ya estaba incluido", "esa
-- cantidad la medimos mal nosotros"—. Eso lleva días, y hasta ahora todo vivía
-- en la pantalla: salir del módulo y volver borraba la lectura entera, con la
-- proforma leída, el emparejamiento y las decisiones tomadas.
--
-- Nadie va a discutir un adicional de quince mil dólares contra algo que se
-- pierde al cambiar de pestaña.
--
-- Entonces el análisis se guarda: el archivo tal como llegó, lo que NOVA leyó,
-- y renglón por renglón qué se decidió. Se puede cerrar, volver mañana, y
-- seguir donde quedó.

create table if not exists public.obra_analisis (
  id            bigserial primary key,
  obra_id       bigint not null references public.obras(id) on delete cascade,
  -- Qué se comparó: una propuesta nueva del proveedor, una liquidación suya.
  titulo        text,
  proveedor     text,
  archivo_path  text,
  archivo_nombre text,
  -- Lo que leyó NOVA, tal cual: si se vuelve a leer el mismo papel y da otra
  -- cosa, la diferencia tiene que poder verse.
  items         jsonb not null default '[]'::jsonb,
  iva           numeric(5,2) not null default 0,
  -- abierto: se está analizando · resuelto: ya se decidió qué hacer con él
  estado        text not null default 'abierto',
  orden_cambio_id bigint references public.ordenes_cambio(id) on delete set null,
  creado_por    bigint, creado_nombre text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists obra_analisis_obra on public.obra_analisis (obra_id, created_at desc);

-- UNA DECISIÓN POR DIFERENCIA, con quién la tomó.
--
-- Lo que se discute no es el total: es cada renglón. "Esto se cobra", "esto ya
-- estaba incluido en el rubro 3.4", "esta cantidad la medimos mal nosotros y la
-- pagamos". Tres respuestas distintas con la misma plata, y la que vale es la
-- que alguien escribió con su nombre al lado.
create table if not exists public.obra_analisis_lineas (
  id           bigserial primary key,
  analisis_id  bigint not null references public.obra_analisis(id) on delete cascade,
  -- Cómo venía en el papel: es lo que permite reencontrarlo si se relee.
  descripcion  text not null,
  unidad       text,
  cantidad     numeric(14,4),
  monto        numeric(14,2),
  -- Contra qué rubro del contrato quedó emparejado, si quedó.
  obra_rubro_id bigint references public.obra_rubros(id) on delete set null,
  -- nuevo | mas_cantidad | menos_cantidad | calza
  hallazgo     text,
  -- pendiente: todavía se discute · cobrar: va a la orden de cambio ·
  -- incluido: ya estaba en el contrato · nuestro: es un error nuestro y lo
  -- pagamos. Las dos últimas no generan nada y por eso hay que poder decirlas:
  -- una diferencia descartada en silencio vuelve a aparecer el mes que viene.
  decision     text not null default 'pendiente',
  nota         text,
  decidido_por bigint, decidido_nombre text, decidido_at timestamptz,
  orden        integer not null default 0
);
create index if not exists obra_analisis_lineas_analisis on public.obra_analisis_lineas (analisis_id, orden);

alter table public.obra_analisis enable row level security;
alter table public.obra_analisis_lineas enable row level security;
do $$ begin
  create policy "equipo foreman" on public.obra_analisis for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "equipo foreman" on public.obra_analisis_lineas for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

comment on table public.obra_analisis is
  'Una comparación guardada entre el presupuesto contratado y una propuesta nueva o una liquidación. Se analiza en varios días y se discute renglón por renglón.';
comment on column public.obra_analisis_lineas.decision is
  'pendiente · cobrar (va a la orden de cambio) · incluido (ya estaba en el contrato) · nuestro (error nuestro, lo pagamos nosotros).';
