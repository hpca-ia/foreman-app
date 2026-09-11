-- ============================================================
-- FOREMAN — Actividades sobre los rubros de la obra
-- Correr en: Supabase → SQL Editor → New query → pegar → Run
--
-- Los capítulos vienen del presupuesto y no se tocan. Las actividades son
-- otra forma de agrupar los mismos rubros según cómo se ejecuta la obra
-- ("muebles", "instalaciones eléctricas", "movimiento de tierra"), y pueden
-- cruzar capítulos. Un rubro pertenece a un capítulo y, opcionalmente, a
-- una actividad.
-- ============================================================

alter table public.obra_rubros
  add column if not exists actividad text,
  add column if not exists actividad_orden integer;

create index if not exists idx_obra_rubros_actividad
  on public.obra_rubros(obra_id, actividad);

notify pgrst, 'reload schema';
