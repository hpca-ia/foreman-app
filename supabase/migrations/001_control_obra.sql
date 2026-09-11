-- ============================================================
-- FOREMAN — Control de Obra (Fase 1)
-- Correr en: Supabase → SQL Editor → New query → pegar todo → Run
--
-- Crea el modelo de control de obra a nivel de RUBRO con planillas
-- (períodos) y libro de facturas, replicando el método que hoy se
-- lleva en Excel.
--
-- Nota: las referencias a tablas existentes (clientes, presupuestos)
-- se guardan como ids sueltos, sin FOREIGN KEY, para que esta
-- migración no falle si esas tablas usan int4 en vez de int8. Las FK
-- reales sí existen entre las tablas nuevas de este módulo.
-- ============================================================

-- 1) OBRAS — un presupuesto activado se convierte en obra en curso
create table if not exists public.obras (
  id              bigserial primary key,
  nombre          text        not null,
  cliente_id      bigint,
  cliente_nombre  text,
  presupuesto_id  bigint,
  fecha_inicio    date        default current_date,
  estado          text        not null default 'activa',   -- activa | cerrada
  notas           text,
  created_by      bigint,
  created_at      timestamptz not null default now()
);

-- 2) OBRA_RUBROS — línea base congelada, UN registro por rubro
create table if not exists public.obra_rubros (
  id                   bigserial primary key,
  obra_id              bigint      not null references public.obras(id) on delete cascade,
  numero               integer,                                  -- N° de rubro (1, 2, 3…)
  codigo               text,                                     -- código BOQ ("2.15 al 2.21")
  capitulo             text        not null default 'SIN CAPÍTULO',
  capitulo_orden       integer     default 0,
  orden                integer     default 0,
  descripcion          text        not null,
  unidad               text,
  cantidad             numeric(14,4) default 0,
  precio_unitario      numeric(14,4) default 0,
  iva_pct              numeric(5,2)  default 15,
  total_base           numeric(14,2) not null default 0,         -- "A" del Excel
  proyeccion_estimada  numeric(14,2),                            -- costo estimado revisado
  estado               text        not null default 'abierto',   -- abierto | contratado | cerrado
  origen               text        not null default 'base',      -- base | orden_cambio (Fase 2)
  orden_cambio_id      bigint,
  presupuesto_item_id  bigint,                                   -- de dónde salió
  created_at           timestamptz not null default now()
);
create index if not exists idx_obra_rubros_obra on public.obra_rubros(obra_id);
create index if not exists idx_obra_rubros_orden on public.obra_rubros(obra_id, capitulo_orden, orden);

-- 3) PLANILLAS — los períodos de corte
create table if not exists public.planillas (
  id            bigserial primary key,
  obra_id       bigint      not null references public.obras(id) on delete cascade,
  numero        integer     not null,
  nombre        text,
  fecha_desde   date,
  fecha_hasta   date,
  estado        text        not null default 'abierta',  -- abierta | cerrada
  fecha_cierre  timestamptz,
  created_at    timestamptz not null default now(),
  unique (obra_id, numero)
);
create index if not exists idx_planillas_obra on public.planillas(obra_id, numero);

-- 4) OBRA_FACTURAS — el compendio de facturas
create table if not exists public.obra_facturas (
  id                bigserial primary key,
  obra_id           bigint      not null references public.obras(id) on delete cascade,
  planilla_id       bigint      references public.planillas(id) on delete set null,
  fecha             date        not null default current_date,
  tipo_documento    text        default 'FACTURA',
  numero_factura    text,
  ruc               text,
  razon_social      text,
  detalle           text,
  justificacion     text,
  numero_cheque     text,
  subtotal_0        numeric(14,2) default 0,
  subtotal_5        numeric(14,2) default 0,
  subtotal_15       numeric(14,2) default 0,
  iva               numeric(14,2) default 0,
  total             numeric(14,2) not null default 0,
  tipo              text        default 'material',    -- material | mano_obra | maquinaria | contrato | honorarios | otro
  archivo_url       text,
  archivo_nombre    text,
  origen            text        not null default 'manual',  -- manual | nova | caja_chica
  caja_gasto_id     bigint,
  subido_por        bigint,
  subido_por_nombre text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_obra_facturas_obra     on public.obra_facturas(obra_id);
create index if not exists idx_obra_facturas_planilla on public.obra_facturas(planilla_id);

-- 5) OBRA_FACTURA_RUBROS — reparto de una factura entre uno o varios rubros
create table if not exists public.obra_factura_rubros (
  id             bigserial primary key,
  factura_id     bigint      not null references public.obra_facturas(id) on delete cascade,
  obra_rubro_id  bigint      not null references public.obra_rubros(id) on delete cascade,
  monto          numeric(14,2) not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists idx_ofr_factura on public.obra_factura_rubros(factura_id);
create index if not exists idx_ofr_rubro   on public.obra_factura_rubros(obra_rubro_id);

-- Permisos (mismo criterio que el resto de las tablas de la app)
grant select, insert, update, delete on
  public.obras, public.obra_rubros, public.planillas,
  public.obra_facturas, public.obra_factura_rubros
to anon, authenticated;

grant usage, select on all sequences in schema public to anon, authenticated;

-- Refrescar el esquema de la API
notify pgrst, 'reload schema';
