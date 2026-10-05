-- 078 · El visto del Director antes de que la orden salga al cliente.
--
-- Hoy una orden de cambio va de borrador a "enviada al cliente" de un botón.
-- Quien la arma es el residente o quien está en obra, y lo que viaja es un
-- precio: una vez que el cliente lo vio, bajarlo es una negociación y subirlo
-- es imposible. Entre esas dos cosas falta un paso que en la oficina ya
-- existe, pero vive en un WhatsApp —"¿la mando?" / "dale"— que después nadie
-- encuentra.
--
-- Son tres caminos distintos y por eso se separan:
--
--   · PDF para mandar por mi cuenta. Algunos clientes quieren el papel por su
--     canal, y forzar el envío desde FOREMAN haría que se use por fuera.
--   · Pedir el visto. Queda esperando, con nombre y fecha cuando llega.
--   · Enviar al cliente. Solo tiene sentido con el visto puesto, o si quien
--     manda es el Director.
--
-- No se agrega un estado nuevo: `estado` ya cuenta dónde está la orden frente
-- al CLIENTE —borrador, enviada, aprobada, rechazada— y meter ahí un paso
-- interno mezcla dos conversaciones distintas en una sola columna. El visto es
-- una marca al costado, como el pago en una compra.

alter table public.ordenes_cambio add column if not exists visto_at         timestamptz;
alter table public.ordenes_cambio add column if not exists visto_por        bigint;
alter table public.ordenes_cambio add column if not exists visto_nombre     text;
alter table public.ordenes_cambio add column if not exists visto_comentario text;
-- Cuándo se pidió: sirve para saber hace cuánto está esperando, que es la
-- pregunta que uno se hace cuando la obra está frenada.
alter table public.ordenes_cambio add column if not exists visto_pedido_at  timestamptz;
