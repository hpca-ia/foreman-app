-- 134 · El IVA de la proforma, dicho aparte.
--
-- Una orden de cambio se cobra SIN IVA: el precio que firma el cliente es el
-- del contrato. Pero la proforma del proveedor viene con IVA adentro, y NOVA la
-- leía así a propósito —en Beneficios eso es lo correcto, porque ahí se decide
-- a quién comprarle y lo que se paga es con IVA—.
--
-- Medir un precio sin IVA contra un costo con IVA es comparar dos cosas
-- distintas, y se come el margen entero sin que nada lo diga. En la OC-01 de
-- Plaza Lagos la pantalla decía $336,89 · 19,5% cuando el margen de verdad es
-- $518,16 · 30%: los $181,27 de diferencia son exactamente el IVA del costo.
--
-- Entonces el porcentaje se guarda con la cotización. El monto de cada renglón
-- sigue siendo el que paga el cliente —con IVA, como estaba— y cada lado saca o
-- deja el impuesto según lo que esté midiendo. Una sola lectura, dos lecturas
-- honestas.

alter table public.orden_cambio_cotizaciones
  add column if not exists iva numeric(5,2) not null default 0;

comment on column public.orden_cambio_cotizaciones.iva is
  'Porcentaje de IVA incluido en los montos de los renglones. La orden de cambio lo descuenta para su costo, porque el precio que cobra es sin IVA.';
