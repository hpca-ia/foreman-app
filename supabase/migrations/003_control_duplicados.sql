-- ============================================================
-- FOREMAN — Control de facturas duplicadas
-- Correr en: Supabase → SQL Editor → New query → pegar → Run
--
-- Una misma factura puede intentar cargarse dos veces: por planilla y
-- por caja chica. Eso es un error grave o un intento de doble cobro.
-- La detección es exacta (RUC + N° de factura), no interpretativa.
-- ============================================================

-- Rastro de quién forzó la carga de un duplicado y por qué
alter table public.obra_facturas
  add column if not exists duplicado_de bigint references public.obra_facturas(id) on delete set null,
  add column if not exists duplicado_justificacion text,
  add column if not exists archivo_hash text;

-- Búsqueda rápida del par que identifica una factura
create index if not exists idx_obra_facturas_identidad
  on public.obra_facturas(obra_id, ruc, numero_factura);

create index if not exists idx_obra_facturas_hash
  on public.obra_facturas(obra_id, archivo_hash);

-- Caja chica también debe capturar la identidad de la factura,
-- si no, el cruce entre canales no puede ser exacto.
alter table public.cajas_gastos
  add column if not exists ruc text,
  add column if not exists numero_factura text;

notify pgrst, 'reload schema';
