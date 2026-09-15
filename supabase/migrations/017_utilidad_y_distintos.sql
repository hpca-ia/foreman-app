-- Utilidad de cada precio y rubros que parecen duplicados pero no lo son.

-- ¿El precio es al costo o ya trae utilidad? Siempre es distinto: un
-- presupuesto de FOREMAN puede llevar un % por capítulo, otro ir al costo con
-- honorarios al final. Al guardar, NOVA compara con la base y pregunta.
--   costo        → el precio es costo (utilidad_pct = 0)
--   con_utilidad → el precio lleva utilidad_pct; costo = precio ÷ (1 + %)
--   desconocida  → lleva utilidad pero no se sabe cuánto: no cuenta al costo
-- iva_pct acompaña a iva_incluido para poder sacar el IVA exacto.
alter table public.precios_historial
  add column if not exists utilidad_estado text check (utilidad_estado in ('costo', 'con_utilidad', 'desconocida')),
  add column if not exists utilidad_pct    numeric,
  add column if not exists iva_pct         numeric;

-- Pares de rubros que alguien revisó y decidió mantener separados, aunque la
-- diferencia sea mínima. No vuelven a salir como duplicados.
create table if not exists public.rubros_distintos (
  rubro_a    bigint not null,
  rubro_b    bigint not null,
  motivo     text,
  creado_por bigint,
  created_at timestamptz not null default now(),
  primary key (rubro_a, rubro_b),
  check (rubro_a < rubro_b)
);
