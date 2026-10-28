-- 128 · La tarifa de IVA de cada renglón.
--
-- Una misma factura puede traer cemento al 15%, una medicina del botiquín al
-- 5% y un servicio al 0%. Para que lo comprado se vea con IVA —que es como lo
-- cuenta el control y lo que salió de la caja— cada renglón tiene que llevar
-- su tarifa: repartir el IVA en proporción le carga 15% a lo que pagó 0%.
--
-- Null = no se sabe (renglones leídos antes de esto). Entonces vale la tarifa
-- de la factura si tiene una sola, o el reparto en proporción si mezcla.

alter table public.obra_factura_items add column if not exists iva_tasa numeric(5,2);
