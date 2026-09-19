-- Presupuestos activos y pasados.
--
-- Los activos son los que se están trabajando; los pasados, los que ya no se
-- trabajan pero quedan de referencia —se abren, se exportan, se copian para
-- partir de ellos—. La fecha dice cuándo se pasó a histórico; vacía, activo.
alter table public.presupuestos add column if not exists archivado_at timestamptz;
