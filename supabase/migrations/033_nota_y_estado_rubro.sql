-- 033 · Una nota propia en cada rubro, y si ya está listo.
--
-- Al armar un presupuesto no todo el mundo sabe lo mismo de cada rubro: hay
-- precios firmes y hay rubros que van con lo que se tiene a mano porque
-- todavía no hay estudios, o porque falta que llegue la cotización. Eso hoy se
-- dice por WhatsApp y se olvida.
--
-- "nota" es lo que haya que advertir de ese rubro, escrito a mano —"rubro
-- aproximado", "sin estudio de suelos", "falta cotización del proveedor"—; no
-- hay lista de dónde elegir, porque cada advertencia es distinta.
-- "listo" dice si el rubro ya está cerrado o sigue en proceso de trabajo.

alter table public.presupuesto_items add column if not exists nota text;
alter table public.presupuesto_items add column if not exists listo boolean not null default false;
