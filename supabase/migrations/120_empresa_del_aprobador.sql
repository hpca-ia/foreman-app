-- 120 · La empresa de quien firma la orden de cambio.
--
-- "Aprobado por Fulano" no prueba nada: la pregunta del día que se discuta el
-- adicional es de qué empresa era Fulano y con qué título firmó. El papel con
-- el que firma (contratista, fiscalización, contratante) ya estaba en `rol`;
-- lo que faltaba era a quién representa.

alter table public.orden_cambio_aprobaciones
  add column if not exists empresa text;

comment on column public.orden_cambio_aprobaciones.empresa is
  'A quién representa quien firma. Se lee en el CAPÍTULO IV al lado de su nombre.';
