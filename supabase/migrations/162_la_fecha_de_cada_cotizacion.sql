-- 162 · La fecha de cada cotización, que es lo que las distingue.
--
-- Comparando dos proformas del mismo proveedor —la de agosto contra la de
-- noviembre, que es con lo que se discute un reajuste— las dos columnas salían
-- con el mismo encabezado: "SOLEK" y "SOLEK". No había forma de saber cuál era
-- cuál, y una comparación en la que no se distinguen las dos partes no es una
-- comparación.
--
-- La fecha está escrita en el papel, arriba o al pie, junto al número de
-- proforma. Se le pregunta junto con el subtotal y el descuento —el pie se lee
-- en su propio pedido— y se guarda con el análisis.

alter table public.obra_analisis add column if not exists fecha_cotizacion   date;
alter table public.obra_analisis add column if not exists fecha_cotizacion_b date;

comment on column public.obra_analisis.fecha_cotizacion is
  'La fecha que trae el documento, no la de la lectura. Es lo que distingue dos cotizaciones del mismo proveedor.';
