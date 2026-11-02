-- 160 · Comparar dos cotizaciones entre sí, no solo contra el contrato.
--
-- Antes de contratar hay que elegir, y elegir por el total es casi siempre
-- elegir mal: el que da el número más bajo suele ser el que dejó tres
-- renglones afuera, y esos tres aparecen en obra como adicionales.
--
-- Lo que decide una contratación es renglón por renglón: quién es más barato
-- en qué, qué incluye uno que el otro no, y cuánto de la diferencia es alcance
-- y cuánto es precio. Esa comparación se hace hoy en un Excel, cruzando a mano
-- descripciones que nunca se escriben igual: es media jornada y se hace mal.
--
-- Sirve también para un mismo proveedor: la proforma de enero contra la de
-- marzo dice qué subió y cuánto, que es con lo que se discute un reajuste.
--
-- Es el mismo análisis guardado —el mismo papel, las mismas decisiones, el
-- mismo ir y venir— con otro contra qué: `modo` dice si se compara contra el
-- contrato de la obra o contra una segunda cotización.

alter table public.obra_analisis add column if not exists modo text not null default 'contrato';
alter table public.obra_analisis add column if not exists items_b jsonb;
alter table public.obra_analisis add column if not exists proveedor_b text;
alter table public.obra_analisis add column if not exists archivo_b_path text;
alter table public.obra_analisis add column if not exists archivo_b_nombre text;
alter table public.obra_analisis add column if not exists descuento_b numeric not null default 0;

comment on column public.obra_analisis.modo is
  'contrato: la propuesta contra los rubros de la obra · cotizaciones: dos propuestas entre sí, para decidir a quién contratar.';
comment on column public.obra_analisis.items_b is
  'Los renglones de la segunda cotización, cuando el modo es comparar dos papeles.';
