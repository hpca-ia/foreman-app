-- ============================================================
-- FOREMAN — Caja Chica conectada al Control de Obra
-- Correr en: Supabase → SQL Editor → New query → pegar → Run
--
-- Amarra cada caja chica a una obra concreta (en vez de cruzar
-- por el nombre del proyecto escrito a mano) para que los gastos
-- entren al control de la obra correcta.
-- ============================================================

alter table public.cajas_chicas
  add column if not exists obra_id bigint references public.obras(id) on delete set null;

create index if not exists idx_cajas_chicas_obra on public.cajas_chicas(obra_id);

-- Guarda la factura de obra que generó un gasto de caja chica,
-- para no duplicarla si el gasto se edita.
alter table public.cajas_gastos
  add column if not exists obra_factura_id bigint references public.obra_facturas(id) on delete set null;

notify pgrst, 'reload schema';
