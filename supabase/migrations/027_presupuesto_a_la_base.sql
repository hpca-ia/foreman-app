-- Un presupuesto trabajado pasa a la base de rubros cuando se da por bueno.
--
-- Cada precio que entra así queda marcado con el presupuesto del que salió:
-- si se vuelve a pasar después de corregirlo, se reemplazan esos precios en
-- vez de sumarse otra vez. Contados dos veces, los promedios de la base
-- mentirían a favor de ese presupuesto.

alter table public.precios_historial add column if not exists presupuesto_id bigint;
create index if not exists precios_historial_presupuesto on public.precios_historial (presupuesto_id);

-- Cuándo se pasó por última vez: para avisar antes de volver a hacerlo.
alter table public.presupuestos add column if not exists en_base_at timestamptz;
