-- QUÉ CLASE DE CAMBIO ES CADA PARTIDA DE UNA ORDEN.
--
-- La orden de cambio decía dos cosas: ADICIONES y REDUCCIONES. Pero adentro de
-- las adiciones viajan dos conversaciones distintas con el cliente:
--
--   · trabajo nuevo: no estaba cotizado; es una especificación o un pedido
--     nuevo suyo, y lo que se discute es si lo pidió y cuánto vale;
--   · más cantidad: el rubro ya está en el contrato y su precio ya lo firmó;
--     lo único que se discute es la medida.
--
-- Mezcladas, el que aprueba no sabe cuál de las dos está leyendo. La clase se
-- guarda cuando nace la partida: Diferencias la trae dicha —es justo lo que
-- encontró— y en una orden escrita a mano se deduce de si la partida apunta a
-- un rubro del contrato.
--
-- Una reducción no la necesita: lo que resta es siempre menos cantidad.
--
-- Las partidas que ya existen quedan sin clase y se deducen igual. Sus órdenes
-- siguen saliendo como salían: no se les pone un rótulo que nadie puso.

alter table public.orden_cambio_lineas add column if not exists clase text;

comment on column public.orden_cambio_lineas.clase is
  'nuevo (no estaba cotizado: especificación o pedido nuevo del cliente) · mas (más cantidad de un rubro del contrato) · vacío: se deduce de tipo y del rubro al que apunta.';
