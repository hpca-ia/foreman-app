-- 139 · El IVA va siempre afuera.
--
-- El IVA no es de nadie: es del fisco. No es plata de la obra, no es costo del
-- proveedor y no es utilidad nuestra. En esta empresa todo se maneja sin él, y
-- el presupuesto lo demuestra: los $149.675,89 de Diners Aéreo son el subtotal,
-- y el IVA se calcula aparte al final.
--
-- Pero el lector de proformas pedía lo contrario, con todas las letras:
-- "monto es lo que suma ESE renglón CON IVA incluido". Así que durante todo
-- este tiempo se comparó un costo CON IVA contra un presupuesto SIN IVA, y la
-- diferencia —exactamente el 15%— se descontaba del margen en silencio. En la
-- OC-01 de Plaza Lagos eso es $336,89 en pantalla contra $518,16 de verdad.
--
-- De acá en adelante NOVA lee el subtotal del renglón, sin impuestos, y no hay
-- nada que descontar. `neta` dice en qué quedó cada cotización: las nuevas
-- nacen netas, y las que ya estaban se marcan como leídas con IVA adentro para
-- poder corregirlas sin romper lo que ya se calculó con ellas.

alter table public.orden_cambio_cotizaciones
  add column if not exists neta boolean not null default true;

-- Las que ya estaban se leyeron con IVA adentro: así lo pedía el lector.
update public.orden_cambio_cotizaciones set neta = false where created_at < now();

comment on column public.orden_cambio_cotizaciones.neta is
  'true: los montos de los renglones ya vienen sin IVA, que es como se lee desde la 139. false: se leyeron con IVA adentro y hay que descontarlo con el porcentaje de la columna iva.';
comment on column public.orden_cambio_cotizaciones.iva is
  'El porcentaje de IVA del papel. En una cotización neta es informativo —para cuadrar contra la proforma—; en una vieja es lo que hay que descontar.';
